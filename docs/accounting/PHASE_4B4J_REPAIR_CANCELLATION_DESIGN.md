# PHASE 4B.4J — Repair Cancellation Accounting: Design + Test Report

**Date:** 2026-08-19
**Phase:** 4B.4J — Design + Test (COMPLETE)
**Author:** FixITPro Owner
**Scope:** Backend only. No production deployment. No production data modification.

---

## 1. Objective

Design the accounting treatment for repair cancellations, implement the adapter method and
constants required, update the reconciliation classifier to detect the new event, and cover
all scenarios with unit tests. No wiring into `RepairsService` in this phase — that requires
separate owner approval.

---

## 2. Owner Policy (Verbatim)

1. Cancellation after deposit → refund deposit in full.
2. Refund must create a matching `CashDrawerTransaction` OUT.
3. Journal: DR 2110 / CR 1100 (CASH) or DR 2110 / CR 1120 (TRANSFER/CARD).
4. DELIVERED/PAID repairs must NOT directly cancel — must use reversal workflow first.

---

## 3. Pre-flight State

| Item | Value |
|------|-------|
| Existing JournalEntry rows (production) | 39 |
| Existing JournalLine rows (production)  | 78 |
| Feature flag `ACCOUNTING_CORE_ENABLED`  | `false` (off in production) |
| Accounting enabled tenants              | None active |

No production records were created or modified in this phase.

---

## 4. Cancellation Scenarios

| # | Scenario | Deposit | Payment | Action |
|---|----------|---------|---------|--------|
| A | No deposit, no payment, CANCELLED | 0 | — | No accounting needed |
| B | CASH deposit, no final payment, CANCELLED | > 0 | — | DR 2110 / CR 1100 |
| C | TRANSFER/CARD deposit, no final payment, CANCELLED | > 0 | — | DR 2110 / CR 1120 |
| D | DELIVERED → CANCELLED attempt | any | PAID | **Blocked** by existing guard |
| E | Accounting was OFF when repair created | > 0 | — | No REPAIR_DEPOSIT JE → skip refund JE |
| F | Duplicate cancellation (idempotent call) | > 0 | — | JournalService idempotency → no duplicate JE |

---

## 5. Code Changes

### 5.1 `backend/src/journal/journal.service.ts`

Added constant to `JOURNAL_SOURCE`:

```typescript
REPAIR_DEPOSIT_REFUND: 'REPAIR_DEPOSIT_REFUND',
```

### 5.2 `backend/src/accounting/accounting.service.ts`

Three additions:

```typescript
// ACCOUNTING_SOURCE:
REPAIR_DEPOSIT_REFUND: 'REPAIR_DEPOSIT_REFUND',

// SOURCE_TO_DB_TYPE:
REPAIR_DEPOSIT_REFUND: 'REVERSAL',

// SOURCE_TO_REASON:
REPAIR_DEPOSIT_REFUND: 'คืนมัดจำงานซ่อม',
```

### 5.3 `backend/src/repairs/repair-accounting.adapter.ts`

Added two methods:

**`recordDepositRefundJournal()`** — public no-throw wrapper. Returns void on error.

**`_recordDepositRefundJournal()`** — internal implementation:
1. Skip if `deposit <= 0` (warn).
2. Look up original `REPAIR_DEPOSIT` journal via `findBySource`. Skip if not found (accounting was off at create time).
3. Find the debit line in the original deposit JE to determine the original DR account (1100 CASH or 1120 CLEARING).
4. Create refund journal: DR 2110 / CR {original DR account}, `sourceType=REPAIR_DEPOSIT_REFUND`, `sourceId=repair.id`.

**Why look up original journal instead of using `paymentMethod`:**
The `Repair` model has no `depositPaymentMethod` field — only `paymentMethod` (final payment method). The original deposit payment method is recoverable from the REPAIR_DEPOSIT journal's debit line.

### 5.4 `backend/src/accounting-reconciliation/accounting-reconciliation.service.ts`

Two changes:

1. `REPAIR_ID_SOURCE_TYPES` array: added `'REPAIR_DEPOSIT_REFUND'` so cancelled repair JEs are indexed.

2. `classifyRepair()`: added `isCancelled` variable and REPAIR_DEPOSIT_REFUND check:
   - Condition: `isCancelled && deposit > 0 && journalIndex.has(REPAIR_DEPOSIT:repair.id)`
   - If true: expects `REPAIR_DEPOSIT_REFUND` JE with matching debit amount.
   - If original REPAIR_DEPOSIT JE is also missing: no refund expected (accounting was off at create time).

---

## 6. Reconciliation Classification (Cancelled Repairs)

| Scenario | Reconciliation Status |
|----------|-----------------------|
| Cancelled, no deposit | NOT_APPLICABLE |
| Cancelled, deposit > 0, no REPAIR_DEPOSIT JE | MISSING (REPAIR_DEPOSIT only) |
| Cancelled, deposit > 0, REPAIR_DEPOSIT posted, REPAIR_DEPOSIT_REFUND posted | POSTED |
| Cancelled, deposit > 0, REPAIR_DEPOSIT posted, no REPAIR_DEPOSIT_REFUND | MISSING (REPAIR_DEPOSIT_REFUND) |
| Cancelled, deposit > 0, refund amount mismatch | ERROR |
| Non-cancelled, deposit > 0, REPAIR_DEPOSIT posted | POSTED (no refund expected) |

---

## 7. Journal Entry (Accounting)

**Cancellation refund (deposit existed, CASH):**
```
DR 2110 Customer Deposit    ฿{deposit}
  CR 1100 Cash                          ฿{deposit}
sourceType = REPAIR_DEPOSIT_REFUND
sourceId   = repair.id
```

**Cancellation refund (deposit existed, TRANSFER/CARD):**
```
DR 2110 Customer Deposit    ฿{deposit}
  CR 1120 Clearing                      ฿{deposit}
sourceType = REPAIR_DEPOSIT_REFUND
sourceId   = repair.id
```

---

## 8. Idempotency

`JournalService.create()` uses natural idempotency via `findBySource(sourceType, sourceId, tenantId)`.
A second call with the same `REPAIR_DEPOSIT_REFUND` + `repair.id` returns `{created: false}` without
creating a duplicate. This covers accidental double-cancellation calls without extra application-level guards.

---

## 9. DELIVERED Guard (Safety)

The DELIVERED → CANCELLED transition is already blocked at `repairs.service.ts:327-331`:

```typescript
if (repair.status === 'DELIVERED' && dto.status !== undefined) {
  throw new BadRequestException('Cannot change status of a delivered repair');
}
```

No additional guard is needed for this constraint.

---

## 10. Test Results

### 10.1 `repair-accounting.adapter.spec.ts` (H-series, 15 new tests)

| Test | Description | Result |
|------|-------------|--------|
| H01 | CASH deposit → DR 2110 / CR 1100, correct sourceType + sourceId | PASS |
| H02 | TRANSFER deposit → DR 2110 / CR 1120 | PASS |
| H03 | deposit=0 → warns, no journal | PASS |
| H04 | No REPAIR_DEPOSIT journal found → warns, no refund | PASS |
| H05 | Idempotent — JournalService returns `{created:false}` without error | PASS |
| H06 | Public method swallows internal errors — no rethrow | PASS |
| H07 | Tenant not in allowlist → no-op | PASS |
| H08 | Feature flag OFF → complete no-op | PASS |
| H09 | `sourceId` is `repair.id` (not part.id or payment.id) | PASS |
| H10 | `tenantId` propagated to `journal.create` | PASS |
| H11 | `findBySource` called with correct args | PASS |
| H12 | Journal balanced: debit = credit = deposit | PASS |
| H13 | Repair with parts → refund JE only for deposit, no COGS in refund | PASS |
| H14 | Deposit JE with no debit line → warns, no refund | PASS |
| H15 | Description contains ticket number | PASS |

### 10.2 `accounting-reconciliation.service.spec.ts` (G21-G26, 6 new tests)

| Test | Description | Result |
|------|-------------|--------|
| G21 | Cancelled, deposit posted, refund posted → POSTED | PASS |
| G22 | Cancelled, deposit posted, no refund → MISSING | PASS |
| G23 | Cancelled, refund amount mismatch → ERROR | PASS |
| G24 | Cancelled, no deposit → NOT_APPLICABLE | PASS |
| G25 | Cancelled, deposit > 0, both REPAIR_DEPOSIT and REPAIR_DEPOSIT_REFUND missing → MISSING (deposit only, no refund expected) | PASS |
| G26 | Non-cancelled repair with deposit → POSTED (no refund expected) | PASS |

### 10.3 Full Suite

```
Test Suites: 30 passed, 30 total
Tests:       458 passed, 458 total
Time:        ~114s
```

All existing tests (A-series through G20, R-series, etc.) continue to pass.

---

## 11. Production Safety Verification

| Check | Result |
|-------|--------|
| JournalEntry rows (production) | 39 — unchanged |
| JournalLine rows (production) | 78 — unchanged |
| Feature flag | `false` (off) — unchanged |
| Enabled tenants | None — unchanged |
| Migration created | None required |
| Production deployment | None |

---

## 12. Pending (Implementation Phase — Requires Owner Approval)

The following items are NOT done in this phase:

1. **Wire `recordDepositRefundJournal`** into `RepairsService.update()` — call post-commit when `dto.status === 'CANCELLED'` and `repair.deposit > 0`.
2. **Wire `accounting.record()` for CDT OUT** — `REPAIR_DEPOSIT_REFUND` source, `direction: 'OUT'`, post-commit in same block.
3. **E2E / integration test** — cancel a repair in a staging/test environment with accounting ON and verify: JE created, CDT created, reconciliation shows POSTED.

---

## 13. Verdict

**PHASE 4B.4J: DESIGN + TEST COMPLETE.**

All constants, adapter method, and reconciliation classifier are implemented and tested (458/458).
No production data was touched. Implementation (wiring into RepairsService) awaits owner approval.
