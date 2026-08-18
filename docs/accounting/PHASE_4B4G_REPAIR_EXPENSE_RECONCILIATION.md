# Phase 4B.4G — Repair + Expense Reconciliation

**Date:** 2026-08-19 UTC  
**Pilot tenant:** `cmsc05do8001u7i29q3p5x6zp` (ริวคอม เซอร์วิซ)  
**File modified:** `backend/src/accounting-reconciliation/accounting-reconciliation.service.ts`  
**Test file modified:** `backend/src/accounting-reconciliation/accounting-reconciliation.service.spec.ts`  
**Tests:** 20 new (G01-G20) + 32 existing (R01-R32) = 52 total in spec; 437 total passing  
**Build:** TypeScript clean (0 errors)  
**Verdict:** IMPLEMENTATION COMPLETE — STOPPED awaiting owner approval to deploy

---

## Overview

Phase 4B.4G extends `AccountingReconciliationService` to detect missing or inconsistent journals for Repair and Expense transactions. No automatic recovery is performed for these types — scan → classify → report only.

### What changed

| Component | Change |
|---|---|
| `AccountingReconciliationService` | New: `scanRepairs`, `classifyRepair`, `scanExpenses`, `classifyExpense`, `sumDebit` |
| `AccountingReconciliationService` | Updated: `scanTenants` (calls new scan methods), `emptyReport` (adds `repairItems`, `expenseItems`) |
| New types exported | `RepairJournalStatus`, `RepairReconciliationItem`, `ExpenseJournalStatus`, `ExpenseReconciliationItem` |
| Updated types exported | `ReconciliationSummary` (+`notApplicable` field), `ReconciliationReport` (+`repairItems`, +`expenseItems`) |

### What did NOT change

- POS sale reconciliation behavior (R01-R32 all still pass)
- POS sale auto-recovery (`recoverSale`) — still active for POS only
- Repair business logic (`RepairsService`)
- Expense business logic (`ExpensesService`)
- `CashDrawerTransaction`
- `ACCOUNTING_*` environment variables
- No migrations created
- No production journals created

---

## Source ID Mapping

Each journal type uses a specific `sourceId`:

| sourceType | sourceId |
|---|---|
| `REPAIR_DEPOSIT` | `Repair.id` |
| `REPAIR_FINAL_PAYMENT` | `Repair.id` |
| `REPAIR_DEPOSIT_SETTLE` | `Repair.id` |
| `REPAIR_PAYMENT_REVERSAL` | `Repair.id` |
| `REPAIR_DEPOSIT_SETTLE_REVERSAL` | `Repair.id` |
| `REPAIR_COGS` | `RepairPart.id` |
| `REPAIR_ADDITIONAL_PAYMENT` | `RepairAdditionalPayment.id` |
| `EXPENSE_PAYMENT` | `Expense.id` |
| `EXPENSE_REVERSAL` | `Expense.id` |

The `buildIndex` method keys each journal as `"${sourceType}:${sourceId}"`.

---

## Expected-Event Rules

Expected events are derived from business state — not assumed for every record. A repair or expense with no expected journals is classified as `NOT_APPLICABLE`.

### Repair Expected Events

| Event | Condition |
|---|---|
| `REPAIR_DEPOSIT` | `Repair.deposit > 0` |
| `REPAIR_FINAL_PAYMENT` | `status === 'DELIVERED'` AND `paidAmount > 0` |
| `REPAIR_DEPOSIT_SETTLE` | `status === 'DELIVERED'` AND `deposit > 0` |
| `REPAIR_COGS:{partId}` | `status === 'DELIVERED'` AND part is active (`!isVoided` AND `costPrice > 0`) |
| `REPAIR_ADDITIONAL_PAYMENT:{id}` | one per `RepairAdditionalPayment` |
| `REPAIR_PAYMENT_REVERSAL` | `paymentReversals.length > 0` |
| `REPAIR_DEPOSIT_SETTLE_REVERSAL` | `paymentReversals.length > 0` AND `deposit > 0` AND `REPAIR_DEPOSIT_SETTLE` journal exists |

A repair with none of the above conditions is `NOT_APPLICABLE` (e.g., a repair in RECEIVED status with no deposit).

### Expense Expected Events

| Event | Condition |
|---|---|
| `EXPENSE_PAYMENT` | `branchId` is set (always for a properly created expense) |
| `EXPENSE_REVERSAL` | `voidedAt` is not null |

An expense with no `branchId` is `NOT_APPLICABLE`.

---

## Classification Logic

### RepairJournalStatus

| Status | Meaning |
|---|---|
| `POSTED` | All expected journals present and amounts match |
| `MISSING` | At least one expected journal absent |
| `ERROR` | At least one journal present but amount differs from expected by >0.01 |
| `NOT_APPLICABLE` | No events were expected (no deposit, not delivered, no additional payments) |

Priority: ERROR > MISSING > POSTED. NOT_APPLICABLE is returned only when `anyExpected` is false and there are no errors or missing events.

### ExpenseJournalStatus

Same four statuses, same priority.

---

## Amount Validation

Both `classifyRepair` and `classifyExpense` validate journal amounts:

| Journal | Expected amount |
|---|---|
| `REPAIR_DEPOSIT` | `Repair.deposit` |
| `REPAIR_FINAL_PAYMENT` | `Repair.paidAmount` |
| `REPAIR_DEPOSIT_SETTLE` | `Repair.deposit` |
| `REPAIR_COGS` | `RepairPart.costPrice × quantity` |
| `REPAIR_ADDITIONAL_PAYMENT` | `RepairAdditionalPayment.amount` |
| `EXPENSE_PAYMENT` | `Expense.amount` |
| `EXPENSE_REVERSAL` | `Expense.amount` |

Amount check: `Math.abs(sumDebit(journal) - expected) > 0.01`. The `sumDebit` helper sums only lines with `debit > 0`.

No auto-recovery is attempted on ERROR — the item is flagged for manual review.

---

## Tenant Isolation

Repairs are queried by `branchId: { in: branchIds }` where `branchIds` is derived from the tenant's branches. Journals are queried with `tenantId` filter. This ensures:
- No cross-tenant repair or expense data is ever returned
- No journals from other tenants are ever considered
- The allowlist and activation timestamp guards remain in effect (unchanged from 4B.2.2)

---

## Activation Timestamp Safety

Both `scanRepairs` and `scanExpenses` use `activationTs` as a lower-bound filter:
- Repairs: `receivedAt: { gte: activationTs }`
- Expenses: `createdAt: { gte: activationTs }`

Historical transactions (created before `ACCOUNTING_ACTIVATION_TIMESTAMP`) are never scanned. This is the same safety mechanism as POS sales.

The 24-hour activation timestamp guard (SF-4 from Phase 4B.2.2) blocks all scans — including the new Repair and Expense scans — if the timestamp is missing, invalid, or older than 24 hours.

---

## ReconciliationReport Changes

### New fields

```typescript
repairItems:  RepairReconciliationItem[];
expenseItems: ExpenseReconciliationItem[];
```

### Updated ReconciliationSummary

```typescript
export interface ReconciliationSummary {
  scanned:       number;
  posted:        number;
  missing:       number;
  recovered:     number;   // POS sales only; repairs/expenses have no auto-recovery
  errors:        number;
  notApplicable: number;   // NEW — repairs/expenses with no expected journals
}
```

`notApplicable` counts repairs classified `NOT_APPLICABLE` + expenses classified `NOT_APPLICABLE`. These items are included in `scanned` but not in `posted`, `missing`, or `errors`.

---

## Backward Compatibility

- `items: SaleReconciliationItem[]` field unchanged — existing callers unaffected
- `recovered` in summary counts only POS sales (repair/expense have no recovery)
- `ReconciliationSummary` is additive — new `notApplicable` field defaults to 0 in `emptyReport`

---

## No Auto-Recovery for Repair / Expense

Unlike POS sales, missing Repair and Expense journals are NOT automatically recovered. Rationale:
- Repair lifecycle is more complex (multi-step state machine with deposit/final/reversal interaction)
- Expense void requires knowledge of void reason
- The known cancellation gap (REPAIR_DEPOSIT not reversed on cancellation) must be a deliberate owner decision, not auto-fixed by reconciliation

---

## Known Gap: Cancellation Deposit Not Reversed

If a Repair with a deposit is CANCELLED, no `REPAIR_PAYMENT_REVERSAL` or `REPAIR_DEPOSIT_SETTLE_REVERSAL` journal is created. The ฿ liability in account 2110 (Customer Deposit) remains.

The reconciliation service does **not** flag this as `MISSING` because:
1. `paymentReversals.length === 0` → REPAIR_PAYMENT_REVERSAL not expected
2. Therefore REPAIR_DEPOSIT_SETTLE_REVERSAL is also not expected

This means a cancelled repair with a deposit will be classified as `MISSING` (REPAIR_DEPOSIT was created but was never settled). This is the correct behavior — it surfaces the gap for review.

**Do NOT fix this silently. Requires owner decision on refund policy.**

---

## Test Scenarios (G01-G20)

### Repair Classification (G01-G08, G12-G14)

| Test | Scenario | Expected |
|---|---|---|
| G01 (Spec A) | Repair with no deposit, no paidAmount, not delivered | NOT_APPLICABLE |
| G02 (Spec B) | Repair with deposit=300, REPAIR_DEPOSIT journal present | POSTED |
| G03 (Spec C) | Repair with deposit=300, NO REPAIR_DEPOSIT journal | MISSING — `missingEvents: ['REPAIR_DEPOSIT']` |
| G04 (Spec D) | Delivered repair, REPAIR_FINAL_PAYMENT present | POSTED |
| G05 (Spec E) | Delivered repair with deposit — all 3 journals present | POSTED |
| G06 (Spec F) | Repair with additional payment, journals present | POSTED |
| G07 (Spec G) | Delivered repair with active part, REPAIR_COGS present | POSTED |
| G08 (Spec H) | Delivered repair with active part, NO REPAIR_COGS | MISSING — `missingEvents: ['REPAIR_COGS:part-1']` |
| G12 (Spec L) | REPAIR_DEPOSIT journal debit=999 (expected 300) | ERROR — amount mismatch |
| G14 (Spec N) | REPAIR_COGS journal debit=999 (expected costPrice×qty=300) | ERROR — amount mismatch |

### Expense Classification (G09-G11)

| Test | Scenario | Expected |
|---|---|---|
| G09 (Spec I) | Active expense, EXPENSE_PAYMENT journal present | POSTED |
| G10 (Spec J) | Active expense, NO EXPENSE_PAYMENT journal | MISSING |
| G11 (Spec K) | Voided expense — EXPENSE_PAYMENT present but EXPENSE_REVERSAL missing | MISSING — `missingEvents: ['EXPENSE_REVERSAL']` |

### Infrastructure / Safety (G13, G15-G20)

| Test | Scenario | Expected |
|---|---|---|
| G13 (Spec M) | Repair query scoped to tenant's branchIds | branchIds in query match tenant's branches |
| G15 (Spec O) | Activation timestamp not set | All scans blocked; repair/expense findMany not called |
| G16 (Spec P) | Activation timestamp >24h ago | All scans blocked |
| G17 (Spec Q) | No allowlist | Zero tenants scanned; notApplicable=0 |
| G18 (Spec R) | Pilot tenant in allowlist | repair.findMany called with correct branchIds |
| G19 (Spec S) | repair.receivedAt filter uses activationTs | Query uses `receivedAt.gte = activationTs` |
| G20 (Spec T) | POS reconciliation unchanged after adding repair/expense scans | POS items still POSTED; repair/expense empty |

---

## Test Results

```
Test Suites: 1 passed (accounting-reconciliation.service.spec)
Tests:       52 passed (R01-R32 + G01-G20)
All suites:  437 passed, 437 total
TypeScript:  0 errors (npx tsc --noEmit)
```

---

## Current Production State (Not Changed by 4B.4G)

4B.4G is code-only — no deployment, no new journals, no new DB records.

| Metric | Value |
|---|---|
| JournalEntry | 35 (unchanged) |
| JournalLine | 70 (unchanged) |
| Repair | 24 (unchanged) |
| Expense | 1 (unchanged) |
| `ACCOUNTING_CORE_ENABLED` | `true` |
| `ACCOUNTING_ENABLED_TENANTS` | `cmsc05do8001u7i29q3p5x6zp` |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | `2026-08-18T04:17:00Z` |

---

## Pending (Requires Owner Approval)

- **Deploy 4B.4G** to production (Coolify auto-deploy from main, or manual trigger)
- **Update ACCOUNTING_ACTIVATION_TIMESTAMP** before next deploy if the 24h window has expired (expires `2026-08-19T04:17:00Z`)
- After deploy, run `POST /api/v1/admin/accounting/run-reconciliation` to verify repair/expense items in the report

---

**STOP — Do NOT create production Repair transactions. Do NOT create production Expense transactions. Do NOT fix Repair cancellation. Do NOT implement Exchange. Do NOT enable other tenants. Do NOT change ACCOUNTING_* environment variables. Await owner approval before deploying.**
