# Phase 4B.4D — ExpenseAccountingAdapter

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Production impact:** NONE — adapter is implemented but NOT wired; no journals created  
**Next step:** Owner approval before Phase 4B.4E (wire adapters into services)

---

## Scope

Implement `ExpenseAccountingAdapter` — a new injectable NestJS service that forms the post-commit bridge from Expense service events to the double-entry journal layer.

**Constraints (in effect throughout):**
- ExpensesService NOT modified
- RepairsService NOT modified
- POS / Stock / CashDrawerTransaction / Payment logic NOT modified
- No production JournalEntry created
- No production Expense transactions
- Adapter NOT wired into ExpensesService
- No migration created
- No historical backfill
- No deployment
- No environment changes

---

## 1. Expense Schema Findings

### Expense model (confirmed from schema.prisma)

| Field | Type | Notes |
|---|---|---|
| `id` | String (CUID) | Primary key |
| `expenseDate` | DateTime | When expense occurred |
| `amount` | Decimal(10,2) | Payment amount |
| `description` | String | Expense description |
| `paymentMethod` | PaymentMethod | CASH \| TRANSFER \| CARD |
| `referenceNo` | String? | Optional reference |
| `note` | String? | Optional note |
| `voidedAt` | DateTime? | Null = active; non-null = voided |
| `voidReason` | String? | Reason for void |
| `categoryId` | String | → ExpenseCategory |
| `createdById` | String | → User |
| `voidedById` | String? | → User |
| `shiftId` | String? | → Shift |
| `branchId` | String? | → Branch |

**Key findings:**
- **NO direct `tenantId` field** — must resolve via `Expense.branchId → Branch.tenantId`
- **One payment per expense**: single `amount` + single `paymentMethod`. No multi-payment scenario.
- **Void, not delete**: expenses are soft-deleted via `voidedAt`. Source ID (Expense.id) is stable.
- **Accounting gated on branchId**: existing CDT calls only fire `if (branchId)`. Adapter follows same gate.

### ExpenseCategory model

| Field | Type | Notes |
|---|---|---|
| `id` | String | Primary key |
| `name` | String | Display name |
| `code` | String | Business code (rent, utilities, salary, ...) |
| `isActive` | Boolean | Active/inactive |
| `tenantId` | String? | Null = global default; non-null = tenant-private |

**Default system categories (global, tenantId=null):**
rent, utilities, salary, marketing, supplies, maintenance, shipping, misc

---

## 2. Tenant Resolution

```
Expense.branchId → Branch.tenantId
```

- The adapter receives `tenantId` as a parameter from the caller
- At wiring time (Phase 4B.4E), ExpensesService resolves it from `branch.tenantId` (already done inside the create tx via `tx.branch.findUnique`)
- **Cross-tenant protection**: `JournalService.resolveAccounts()` validates `account.tenantId === tenantId` — a wrong tenantId will produce NotFoundException and be caught by the adapter's no-throw contract

---

## 3. Category → Account Mapping

**Pilot COA (verified 2026-08-18, all ACTIVE):**

| Code | Name | Type |
|---|---|---|
| 6100 | Operating Expenses | EXPENSE |
| 6200 | Other Expenses | EXPENSE |

**Mapping rule:**

| Category code | Account | Rationale |
|---|---|---|
| `rent` | 6100 Operating Expenses | Core business operating cost |
| `utilities` | 6100 Operating Expenses | Core business operating cost |
| `salary` | 6100 Operating Expenses | Core business operating cost |
| `marketing` | 6100 Operating Expenses | Core business operating cost |
| `supplies` | 6100 Operating Expenses | Core business operating cost |
| `maintenance` | 6100 Operating Expenses | Core business operating cost |
| `shipping` | 6100 Operating Expenses | Core business operating cost |
| `misc` | 6200 Other Expenses | Catch-all / unclassified |
| `null` / unknown | 6100 Operating Expenses | Safe fallback for custom categories |

**Implementation (exported for testing):**
```typescript
export function expenseAccountCode(categoryCode: string | null | undefined): string {
  return categoryCode === 'misc'
    ? ACCOUNT_CODES.OTHER_EXPENSE      // '6200'
    : ACCOUNT_CODES.OPERATING_EXPENSE;  // '6100'
}
```

---

## 4. Payment Method → Cash/Bank Mapping

| paymentMethod | CR account (expense payment) | DR account (expense reversal) |
|---|---|---|
| CASH | 1100 Cash on Hand | 1100 Cash on Hand |
| TRANSFER | 1120 Transfer/Card Clearing | 1120 Transfer/Card Clearing |
| CARD | 1120 Transfer/Card Clearing | 1120 Transfer/Card Clearing |

---

## 5. SourceType

| Journal | JOURNAL_SOURCE constant | Value |
|---|---|---|
| Expense payment | `JOURNAL_SOURCE.EXPENSE_PAYMENT` | `'EXPENSE_PAYMENT'` |
| Expense void reversal | `JOURNAL_SOURCE.EXPENSE_REVERSAL` | `'EXPENSE_REVERSAL'` |

---

## 6. SourceId

| sourceType | sourceId | Model |
|---|---|---|
| EXPENSE_PAYMENT | `Expense.id` | Expense |
| EXPENSE_REVERSAL | `Expense.id` | Expense |

Both use `Expense.id`. They are idempotent because the partial unique index constrains on `(sourceType, sourceId, tenantId)` — the same `Expense.id` with different `sourceType` values are two distinct entries, each enforced once.

**No multi-payment risk**: Each expense has exactly one amount and one payment method. There is no concept of installments or multiple payments per expense.

---

## 7. Idempotency

All idempotency is enforced by the DB partial unique index:
```sql
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

`JournalService.create()` checks `findBySource()` before inserting, and handles P2002 (concurrent duplicate) by re-fetching the winner and returning `{created:false}`. The adapter sees no error in either case.

---

## 8. Journal Mappings

### recordExpenseJournal

```
sourceType: EXPENSE_PAYMENT
sourceId:   Expense.id

DR 6100/6200  amount   (debit expense account — based on category.code)
CR 1100/1120  amount   (credit cash/clearing — based on paymentMethod)
```

Examples:

| Category | PaymentMethod | DR | CR |
|---|---|---|---|
| rent | CASH | 6100 DR ฿3,000 | 1100 CR ฿3,000 |
| misc | CASH | 6200 DR ฿500 | 1100 CR ฿500 |
| salary | TRANSFER | 6100 DR ฿15,000 | 1120 CR ฿15,000 |
| utilities | CARD | 6100 DR ฿800 | 1120 CR ฿800 |

### reverseExpenseJournal

Only posts if EXPENSE_PAYMENT was previously recorded. Original entry is NOT modified.

```
sourceType: EXPENSE_REVERSAL
sourceId:   Expense.id

DR 1100/1120  amount   (debit cash/clearing — money returns)
CR 6100/6200  amount   (credit expense account — expense reverses)
```

---

## 9. What Was Done

### New files

- **`backend/src/expenses/expense-accounting.adapter.ts`** — `@Injectable()` service, NOT wired
- **`backend/src/expenses/expense-accounting.adapter.spec.ts`** — 38 unit tests

**Public API:**
```typescript
class ExpenseAccountingAdapter {
  isEnabledForTenant(tenantId: string): boolean

  // Post-commit from ExpensesService.create() when branchId is set
  async recordExpenseJournal(expense: ExpenseForAccounting, tenantId: string, actorId?: string | null): Promise<void>

  // Post-commit from ExpensesService.voidExpense() when branchId is set
  async reverseExpenseJournal(expense: ExpenseForAccounting, tenantId: string, actorId?: string | null): Promise<void>
}
```

**Exported helper (for testing and future use):**
```typescript
export function expenseAccountCode(categoryCode: string | null | undefined): string
```

### Tests (38 pass)

| Scenario | Coverage |
|---|---|
| A | CASH expense → DR 6100 / CR 1100 |
| B | TRANSFER expense → DR 6100 / CR 1120 |
| C | CARD expense → DR 6100 / CR 1120 |
| D | misc category → DR 6200 |
| D-named | All 7 named categories → DR 6100 |
| E | expenseAccountCode helper — misc/rent/null/undefined/custom |
| F | null category → DR 6100 (safe fallback) |
| G | Missing account → caught by public method |
| H | Inactive account → caught, no rethrow |
| I | Feature flag OFF → all methods no-op |
| I2 | Tenant not in allowlist → no journals |
| J | tenantId passed through to all create calls |
| J2 | "*" sentinel → all tenants enabled |
| K | amount=0 → warns, no journal |
| L | Negative amount → treated as non-positive, skipped |
| M | Idempotency → {created:false}, no error |
| L2 | Concurrent duplicate → {created:false}, no throw |
| N | Reversal → EXPENSE_REVERSAL with correct swapped accounts |
| N2 | Reversal of misc → DR 1100 / CR 6200 |
| N3 | Reversal of TRANSFER → DR 1120 / CR 6100 |
| N4 | No prior EXPENSE_PAYMENT → warns, no create |
| N5 | Reversal DB failure → caught, no rethrow |
| O | EXPENSE_PAYMENT sourceId = Expense.id |
| O2 | EXPENSE_REVERSAL sourceId = Expense.id |
| reversal-idempotency | Second reversal call → {created:false} |
| balance | SUM(debit) = SUM(credit) for payment journal |
| balance | SUM(debit) = SUM(credit) for reversal journal |
| branchId=null | Adapter still runs, branchId=null passed through |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| ExpensesService voidExpense passes `tenantId` from controller (not resolved from branch inside tx) | Acceptable — tenantId is validated by JournalService.validateTenant() |
| Custom tenant category codes not in the 8 defaults → maps to 6100 | Correct fallback; 6100 is the appropriate catch-all operating expense account |
| Expense with `branchId=null` → adapter receives `tenantId` from caller | At wiring time, caller must handle null branchId and skip adapter call (consistent with existing CDT gate `if (branchId)`) |
| Voiding an expense that had no deposit journal (flag was off at create time) → reversal skipped | Correct: `findBySource(EXPENSE_PAYMENT)` returns null → logged warn, no reversal JE |

---

## 11. ExpenseAccountingAdapter is implemented but NOT wired into ExpensesService

**This statement is verified:**
- `backend/src/expenses/expenses.service.ts` was NOT modified in this phase
- `backend/src/expenses/expenses.module.ts` was NOT modified
- No injection of `ExpenseAccountingAdapter` exists anywhere in the runtime path

---

## Production Safety Verification

| Check | Value | Status |
|---|---|---|
| JournalEntry count | **20** | ✅ Unchanged |
| JournalLine count | **40** | ✅ Unchanged |
| Expense count | **0** | ✅ Unchanged |
| ExpensesService modified | **NO** | ✅ |
| Migration | **NONE** | ✅ |
| Deployment | **NONE** | ✅ |
| ACCOUNTING_* env vars | **Unchanged** | ✅ |

---

## Test Results

```
Test Suites: 30 passed, 30 total
Tests:       417 passed, 417 total
Snapshots:   0 total
Time:        ~50 s
```

Breakdown:
- 379 tests before Phase 4B.4D (existing + repair adapter)
- 38 new tests in `expense-accounting.adapter.spec.ts`
- **417 total — all pass**

---

## Wiring Plan (Phase 4B.4E, pending approval)

When the owner approves wiring, ExpensesService will call the adapter post-commit:

| ExpensesService method | Adapter call | Condition |
|---|---|---|
| `create()` | `recordExpenseJournal(expense, tenantId, userId)` | `branchId` is set (consistent with existing CDT gate) |
| `voidExpense()` | `reverseExpenseJournal(expense, tenantId, userId)` | `branchId` is set |

**Tenant resolution at wiring:**
```typescript
// Inside create() tx, branchInfo is already fetched:
const branchInfo = await tx.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } });
// Post-commit:
await this.expenseAccounting.recordExpenseJournal(
  { ...expense, category: expense.category },
  branchInfo.tenantId,
  userId,
);
```

**Expense shape at wiring:**
The `expense` object returned from `tx.expense.create({ include: { category: ... } })` already has `category.code`, so no additional query is needed.

---

## STOPPED

Phase 4B.4D is complete.

**ExpenseAccountingAdapter is implemented but NOT wired into ExpensesService.**

Awaiting owner approval before:
1. **Phase 4B.4E** — Wire `RepairAccountingAdapter` + `ExpenseAccountingAdapter` into `RepairsService`, `ExpensesService`, `DebtPaymentsService`
2. **Phase 4B.4F** — Pilot tenant verification (create test repair + expense, verify journals)
3. **Phase 4B.4G** — Extend `AccountingReconciliationService` for Repair/Expense
