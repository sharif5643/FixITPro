# Phase 4B.4C — RepairAccountingAdapter

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Production impact:** NONE — adapter is implemented but NOT wired; no journals created  
**Next step:** Owner approval before Phase 4B.4D (ExpenseAccountingAdapter)

---

## Scope

Implement `RepairAccountingAdapter` — a new injectable NestJS service that forms the post-commit bridge from Repair service events to the double-entry journal layer.

**Constraints (in effect throughout):**
- RepairsService NOT modified
- ExpensesService NOT modified
- POS / Stock / CashDrawerTransaction / Payment logic NOT modified
- No production JournalEntry created
- No production Repair transactions
- Adapter NOT wired into RepairsService
- No migration created
- No historical backfill
- No deployment

---

## What Was Done

### 1. New file: `backend/src/repairs/repair-accounting.adapter.ts`

A fully-implemented, `@Injectable()` NestJS service following the exact same pattern as `SalesAccountingAdapter`.

**Exported interfaces:**

| Interface | Purpose |
|---|---|
| `RepairPartForAccounting` | Minimal part data (id, costPrice, quantity, isVoided) |
| `RepairForAccounting` | Minimal repair data (id, ticketNumber, paidAmount, paymentMethod, deposit, branchId) |
| `RepairWithPartsForAccounting` | Extends RepairForAccounting with parts array |
| `AdditionalPaymentForAccounting` | Minimal additional payment (id, amount, paymentMethod) |

**Public API (no-throw contract):**

```typescript
class RepairAccountingAdapter {
  isEnabledForTenant(tenantId: string): boolean

  // Called post-commit from RepairsService.create() when deposit > 0
  async recordDepositJournal(
    repair: RepairForAccounting,
    depositPaymentMethod: string,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void>

  // Called post-commit from RepairsService.processPayment()
  async recordFinalPaymentJournal(
    repair: RepairWithPartsForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void>

  // Called post-commit from RepairsService.reversePayment()
  async reversePaymentJournal(
    repair: RepairForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void>

  // Called post-commit from RepairsService.addAdditionalPayment() or DebtPaymentsService
  async recordAdditionalPaymentJournal(
    payment: AdditionalPaymentForAccounting,
    repair: { id: string; ticketNumber: string; branchId: string | null },
    tenantId: string,
    actorId?: string | null,
  ): Promise<void>
}
```

**Internal testable implementations:**  
`_recordDepositJournal`, `_recordFinalPaymentJournal`, `_reversePaymentJournal`, `_recordAdditionalPaymentJournal`

### 2. New file: `backend/src/repairs/repair-accounting.adapter.spec.ts`

26 unit tests covering all 16 required scenarios (A–P).

| Test | Scenario | Verified |
|---|---|---|
| A | Cash deposit → DR 1100 / CR 2110 | ✅ |
| B | Transfer deposit → DR 1120 / CR 2110 | ✅ |
| C | Final payment, no deposit → 1 journal, no settlement check | ✅ |
| D | Final payment with deposit, but no prior REPAIR_DEPOSIT journal → no settlement | ✅ |
| E | Deposit settlement → REPAIR_DEPOSIT exists → REPAIR_DEPOSIT_SETTLE posted | ✅ |
| F | COGS, single part, costPrice × qty | ✅ |
| G | Multiple parts: active+cost, voided, zero-cost — only valid parts get COGS | ✅ |
| H | Additional/debt payment CASH → DR 1100 / CR 1200 | ✅ |
| H2 | Additional payment TRANSFER → DR 1120 / CR 1200 | ✅ |
| I | Idempotency: journal.create returns {created:false}, no error | ✅ |
| J | Concurrent duplicate: {created:false} from P2002 recovery, no rethrow | ✅ |
| K | Tenant not in allowlist → no-op | ✅ |
| K2 | Feature flag OFF → all public methods no-op | ✅ |
| K3 | "*" sentinel → all tenants enabled | ✅ |
| L | Inactive account → ConflictException caught by public method | ✅ |
| M | Missing account → NotFoundException caught, no rethrow | ✅ |
| N | deposit=0 → warns, no journal | ✅ |
| N2 | paidAmount=0 → final payment skipped; COGS still proceeds | ✅ |
| N3 | additional payment amount=0 → warns, no journal | ✅ |
| O | Reversal: REPAIR_FINAL_PAYMENT → REPAIR_PAYMENT_REVERSAL with swapped lines | ✅ |
| O2 | Reversal: also creates REPAIR_DEPOSIT_SETTLE_REVERSAL when settle JE exists | ✅ |
| O3 | Reversal: no prior REPAIR_FINAL_PAYMENT → warns, no create | ✅ |
| O4 | Reversal failure caught by public method | ✅ |
| P | Source ID determinism: Repair.id for REPAIR_FINAL_PAYMENT, REPAIR_DEPOSIT_SETTLE; part.id for REPAIR_COGS | ✅ |
| P2 | deposit sourceId=repair.id; additional payment sourceId=payment.id | ✅ |
| tenantId | All create calls carry the correct tenantId | ✅ |

### 3. `repairs.module.ts` — NOT modified

The adapter is NOT registered as a provider yet. Registration happens in Phase 4B.4E (wiring).

---

## Journal Mappings

### recordDepositJournal

```
sourceType: REPAIR_DEPOSIT
sourceId:   Repair.id

DR 1100 (CASH) or 1120 (CLEARING)   deposit
CR 2110 (CUSTOMER_DEPOSIT)           deposit
```

Payment method → account: `CASH` → `1100`, any other → `1120`.

### recordFinalPaymentJournal

Creates up to 2 + N entries:

**1. REPAIR_FINAL_PAYMENT** (when paidAmount > 0):
```
sourceType: REPAIR_FINAL_PAYMENT
sourceId:   Repair.id

DR 1100/1120 (CASH/CLEARING)   paidAmount
CR 4200 (REPAIR_REVENUE)        paidAmount
```

**2. REPAIR_DEPOSIT_SETTLE** (when deposit > 0 AND REPAIR_DEPOSIT journal was previously posted):
```
sourceType: REPAIR_DEPOSIT_SETTLE
sourceId:   Repair.id

DR 2110 (CUSTOMER_DEPOSIT)   deposit
CR 4200 (REPAIR_REVENUE)     deposit
```

**3..N. REPAIR_COGS** (per active RepairPart where costPrice > 0):
```
sourceType: REPAIR_COGS
sourceId:   RepairPart.id

DR 5200 (REPAIR_COGS)       costPrice × quantity
CR 1310 (PARTS_INVENTORY)   costPrice × quantity
```

- Voided parts (`isVoided=true`) are always skipped.
- Uses `RepairPart.costPrice` (historical cost snapshot at addPart time), NOT current Product.costPrice.
- One journal per part — each part's id is the unique sourceId.

### reversePaymentJournal

Finds and reverses REPAIR_FINAL_PAYMENT and (if posted) REPAIR_DEPOSIT_SETTLE by swapping debit ↔ credit on all lines. Original entries are NOT modified — immutable audit trail.

```
sourceType: REPAIR_PAYMENT_REVERSAL
sourceId:   Repair.id
Lines:      swapped from REPAIR_FINAL_PAYMENT

sourceType: REPAIR_DEPOSIT_SETTLE_REVERSAL   (if settle JE found)
sourceId:   Repair.id
Lines:      swapped from REPAIR_DEPOSIT_SETTLE
```

### recordAdditionalPaymentJournal

```
sourceType: REPAIR_ADDITIONAL_PAYMENT
sourceId:   RepairAdditionalPayment.id

DR 1100/1120 (CASH/CLEARING)   amount
CR 1200 (REPAIR_AR)             amount
```

---

## Idempotency Design

| sourceType | sourceId | Unique constraint |
|---|---|---|
| REPAIR_DEPOSIT | Repair.id | ✅ (sourceType, sourceId, tenantId) partial unique |
| REPAIR_FINAL_PAYMENT | Repair.id | ✅ |
| REPAIR_DEPOSIT_SETTLE | Repair.id | ✅ |
| REPAIR_COGS | RepairPart.id | ✅ (one per part) |
| REPAIR_PAYMENT_REVERSAL | Repair.id | ✅ |
| REPAIR_DEPOSIT_SETTLE_REVERSAL | Repair.id | ✅ |
| REPAIR_ADDITIONAL_PAYMENT | RepairAdditionalPayment.id | ✅ |

All idempotency is backed by the DB partial unique index:
```sql
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

Concurrent duplicate (P2002) is caught by `JournalService.create()` internally — the adapter sees `{created:false}` and continues normally.

---

## Safety Analysis

| Safety Property | Status |
|---|---|
| No production JournalEntry created | ✅ Adapter NOT wired |
| No production JournalLine created | ✅ |
| RepairsService NOT modified | ✅ |
| ExpensesService NOT modified | ✅ |
| repairs.module.ts NOT modified | ✅ |
| POS / Stock / CashDrawerTransaction NOT modified | ✅ |
| No DB migration | ✅ |
| No historical backfill | ✅ |
| No deployment | ✅ |
| Production JournalEntry count unchanged | ✅ 20 (same as 4B.3E) |
| Production JournalLine count unchanged | ✅ 40 (same as 4B.3E) |

---

## Test Results

```
Test Suites: 29 passed, 29 total
Tests:       379 passed, 379 total
Snapshots:   0 total
Time:        ~54 s
```

Breakdown:
- 353 existing tests: all passing (no regressions)
- 26 new tests in `repair-accounting.adapter.spec.ts`: all passing

---

## Production Verification

Production was NOT modified. Verified after completing all file writes:

| Metric | Value | Status |
|---|---|---|
| JournalEntry count | **20** | ✅ Unchanged from 4B.3E |
| JournalLine count | **40** | ✅ Unchanged from 4B.3E |
| RepairsService | Unmodified | ✅ |
| repairs.module.ts | Unmodified | ✅ |
| ACCOUNTING_* env vars | Unchanged | ✅ |
| Accounting activation | Pilot tenant only | ✅ |

---

## Wiring Plan (Phase 4B.4E, pending approval)

When the owner approves wiring, RepairsService will call the adapter post-commit at these points:

| RepairsService method | Adapter call | Condition |
|---|---|---|
| `create()` | `recordDepositJournal(repair, dto.depositPaymentMethod, tenantId, userId)` | `repair.deposit > 0` |
| `processPayment()` | `recordFinalPaymentJournal(repair, tenantId, userId)` | always (after commit) |
| `reversePayment()` | `reversePaymentJournal(repair, tenantId, userId)` | always (after commit) |
| `addAdditionalPayment()` | `recordAdditionalPaymentJournal(payment, repair, tenantId, userId)` | always (after commit) |
| `DebtPaymentsService.create()` | `recordAdditionalPaymentJournal(payment, repair, tenantId, userId)` | always (after commit) |

Tenant resolution: `Repair.branchId → Branch.tenantId` (requires include in queries).

Deposit payment method: NOT stored on Repair; must be passed from `dto.depositPaymentMethod` at create time. Default to `'CASH'` if absent.

---

## STOPPED

Phase 4B.4C is complete.

Awaiting owner approval before:
1. **Phase 4B.4D** — Implement `ExpenseAccountingAdapter` (expense payment + void)
2. **Phase 4B.4E** — Wire adapters into `RepairsService`, `ExpensesService`, `DebtPaymentsService`
3. **Phase 4B.4F** — Pilot tenant verification (create test repair, verify journals)
4. **Phase 4B.4G** — Extend `AccountingReconciliationService` for Repair/Expense
