# Phase 1 — Debt Payment Accounting Bug Fix

> **Status:** COMPLETE  
> **Date:** 2026-08-17  
> **Phase:** 1 of 26  
> **Migration needed:** None  
> **Schema changed:** None  
> **Production deploy needed:** No (awaiting approval)

---

## 1. Bug That Was Fixed

**File:** `backend/src/debt-payments/debt-payments.service.ts`

**Root cause:** `DebtPaymentsService` did not have `AccountingService` injected. The `create()` method
created a `RepairAdditionalPayment` record, updated `Repair.paymentStatus`, and wrote an `AuditLog`
entry — but **never** wrote to `CashDrawerTransaction`. Every baht collected for post-delivery
repair debt was invisible to the cash drawer, reconciliation checks, and daily close calculations.

**Impact before fix:**
- Cash collected from debt customers was missing from drawer balance
- ReconciliationService had no way to detect missing debt payment ledger entries
- FinanceService daily summaries undercounted cash inflows
- DailyClose expected cash was systematically understated

---

## 2. Files Changed

| File | Type | Change |
|------|------|--------|
| `backend/src/debt-payments/debt-payments.service.ts` | Existing | Inject `AccountingService`; add `branch: { tenantId }` include; call `accounting.record()` inside `$transaction` |
| `backend/src/debt-payments/debt-payments.module.ts` | Existing | Add `AccountingModule` to imports |
| `backend/src/reconciliation/reconciliation.service.ts` | Existing | Add `missingDebtPaymentLedger` check (Check 4); update interface, Promise.all, totalIssues, return |
| `backend/src/debt-payments/debt-payments.service.spec.ts` | **NEW** | 13 unit tests (A–M) |
| `backend/src/reconciliation/reconciliation.service.spec.ts` | Existing | Add 3 debt payment test cases; update `makeCdtFindMany` and `makePrisma` |

**Files NOT touched (STOP conditions never triggered):**
- `backend/prisma/schema.prisma` — no schema change
- Any migration file — no migration
- `backend/src/pos/` — untouched
- `backend/src/repairs/` `RepairService` — untouched
- `backend/src/finance/` — untouched
- `backend/src/reports/` — untouched
- `backend/src/daily-close/` — untouched
- `backend/src/accounting/accounting.service.ts` — untouched (called, not changed)

---

## 3. What the Fix Does

### debt-payments.service.ts

Added `AccountingService` injection and a `branch: { select: { tenantId: true } }` include to the
repair fetch. Inside the existing `$transaction`, after the audit log write:

```typescript
await this.accounting.record(
  {
    sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
    sourceId:      pmt.id,
    paymentMethod: dto.paymentMethod as any,
    amount:        dto.amount,
    direction:     'IN',
    branchId:      repair.branchId,
    tenantId:      repair.branch?.tenantId ?? null,
    actorUserId:   userId,
    note:          dto.note,
  },
  tx,  // ← same transaction — atomic with payment record
);
```

Key properties:
- **Atomic:** `accounting.record()` receives the same `tx` client, so if it fails the entire
  payment transaction rolls back (no orphaned payment records without ledger entries)
- **All payment methods:** CASH, TRANSFER, CARD — `AccountingService` handles CASH vs non-CASH
  routing internally (CASH → session entry; non-CASH → unassigned audit entry)
- **Idempotent:** `AccountingService` uses `tenantId:REPAIR_ADDITIONAL_PAYMENT:pmt.id:IN` as the
  idempotency key — safe under concurrent retries
- **Tenant isolation:** `tenantId` is derived from `repair.branch.tenantId` (from the DB), not
  from any caller parameter

### reconciliation.service.ts

Added `findMissingDebtPaymentLedger` as Check 4 (existing checks renumbered 6–9):

```typescript
private async findMissingDebtPaymentLedger(branchId, tenantId, dateRange): Promise<MissingLedgerItem[]>
```

Pattern follows existing checks:
1. Find all `RepairAdditionalPayment` where `paymentMethod = 'CASH'` AND `repair.branchId = branchId` AND `createdAt in dateRange`
2. Find `CashDrawerTransaction` with `referenceType = 'REPAIR_ADDITIONAL_PAYMENT'` for those IDs
3. Return payment IDs with no matching ledger entry

Added to `ReconciliationReport.checks` interface as `missingDebtPaymentLedger: MissingLedgerItem[]`.

---

## 4. Test Coverage

### debt-payments.service.spec.ts — 13 tests (A–M)

| ID | Test | Covers |
|----|------|--------|
| A | CASH → `accounting.record()` called with correct entry | sourceType, sourceId, paymentMethod, amount, direction, branchId, tenantId, actorUserId |
| B | TRANSFER → `accounting.record()` called | non-CASH path |
| C | CARD → `accounting.record()` called | non-CASH path |
| D | tx client forwarded as 2nd arg | atomicity guarantee |
| E | `accounting.record()` throws → transaction rejected | rollback correctness |
| F | Partial payment → paymentStatus = PARTIAL | business logic unchanged |
| G | Final payment → paymentStatus = PAID + DEBT_PAID notification | business logic unchanged |
| H | tenantId from `repair.branch.tenantId` | tenant isolation |
| I | Wrong branchId → ForbiddenException | branch isolation |
| J | Not DELIVERED → BadRequestException | status guard |
| K | Already PAID → BadRequestException | status guard |
| L | Overpayment → BadRequestException | amount guard |
| M | Repair not found → NotFoundException | not-found guard |

### reconciliation.service.spec.ts — 3 new tests (+ 16 existing = 19 total)

| Test | Covers |
|------|--------|
| Detects CASH debt payment without ledger entry | happy path for new check |
| Does NOT flag when ledger entry exists | covered case excluded |
| Includes missing debt payment in totalIssues | summary count correct |

### Full test suite result

```
Test Suites: 24 passed, 24 total
Tests:       229 passed, 229 total
```

---

## 5. Atomicity Guarantee

The `accounting.record()` call is **inside** the same `$transaction` block as the payment record,
repair status update, and audit log. Failure sequence:

```
$transaction(() => {
  1. repairAdditionalPayment.create  → pmt
  2. repair.update                   → paymentStatus
  3. auditLog.create                 → log entry
  4. accounting.record(pmt.id, tx)   → CashDrawerTransaction
  5. return pmt
})
```

If step 4 fails for any reason → steps 1, 2, 3 all roll back. No payment record exists without
a ledger entry and no ledger entry exists without a payment record.

---

## 6. Backfill Note

Existing `RepairAdditionalPayment` records created **before this fix** have no corresponding
`CashDrawerTransaction`. These will appear in the `missingDebtPaymentLedger` reconciliation
check. A backfill script is planned for Phase 17.

**Until Phase 17:** operators can identify affected records via the reconciliation report
(`GET /reconciliation/report`) and reconcile manually if needed.

---

## 7. What Remains for Next Phases

- Phase 2: Prisma schema — add `AccountingAccount`, `JournalEntry`, `JournalLine`
- Phase 3: Chart of accounts seed (17 system accounts)
- Phase 4: Dual-write behind `ACCOUNTING_CORE_ENABLED` feature flag
- Phases 5–26: See `docs/accounting/ACCOUNTING_IMPLEMENTATION_PLAN.md`

Each phase requires separate approval before implementation begins.

---

*Phase 1 completed 2026-08-17. Ready for Phase 2 approval.*
