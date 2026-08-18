# Phase 4B.4A — Repair & Expense Accounting Audit

**Date:** 2026-08-18  
**Status:** READ-ONLY AUDIT COMPLETE  
**Verdict:** No JournalEntry for Repair or Expense exists — implementation is required.  
**Next step:** Owner approval before Phase 4B.4B (implementation)

---

## Scope

This audit covers all Repair, Expense, and related debt-payment flows. No code was modified, no production transactions were created, and no JournalEntry or JournalLine records were written during this audit.

Files read:
- `backend/src/repairs/repairs.service.ts`
- `backend/src/expenses/expenses.service.ts`
- `backend/src/debt-payments/debt-payments.service.ts`
- `backend/src/finance/finance.service.ts`
- `backend/src/accounting/accounting.service.ts`
- `backend/prisma/schema.prisma` (Repair, RepairPart, RepairPaymentReversal, RepairAdditionalPayment, Expense models)
- All repair and expense DTOs

---

## 1. AccountingService.record() — What It Does (and Does NOT Do)

`AccountingService` (the only accounting abstraction used by Repair and Expense) writes **CashDrawerTransaction (CDT)** records only. It has zero awareness of `JournalEntry` or `JournalLine`.

```
accounting.record() → CashDrawerTransaction (CDT ledger)
                    → does NOT create JournalEntry
                    → does NOT call SalesAccountingAdapter
```

`SalesAccountingAdapter` is called **only** by `SalesService` (POS flow). Repair and Expense have no equivalent adapter.

**Conclusion: As of today, Repair and Expense have ZERO double-entry journal entries. All accounting for these modules lives only in the CDT ledger.**

---

## 2. ACCOUNTING_SOURCE Types Used

All types defined in `AccountingService`:

| sourceType | CashDrawer DB type | direction | Used by |
|---|---|---|---|
| `REPAIR_DEPOSIT` | DEPOSIT | IN | `repairs.service.ts:create()` |
| `REPAIR_FINAL_PAYMENT` | DEPOSIT | IN | `repairs.service.ts:processPayment()` |
| `REPAIR_ADDITIONAL_PAYMENT` | DEPOSIT | IN | `repairs.service.ts:addAdditionalPayment()` + `debt-payments.service.ts:create()` |
| `EXPENSE_PAYMENT` | WITHDRAWAL | OUT | `expenses.service.ts:create()` |
| `REVERSAL` | REVERSAL | OUT (repair) / IN (expense void) | `repairs.service.ts:reversePayment()` + `expenses.service.ts:voidExpense()` |

---

## 3. Repair System — Flow-by-Flow Audit

### 3.1 Create Repair (`POST /api/v1/repairs`)

**File:** `repairs.service.ts:151-233`

```
CreateRepairDto:
  - branchId? (optional — falls back to tenant default)
  - depositPaymentMethod? ('CASH'|'TRANSFER'|'CARD')
  - deposit? (decimal, default 0)
  - estimatedLaborCost?, estimatedPartsCost?, estimateCost?
```

**Accounting action (deposit path only):**

```typescript
if (dto.deposit > 0) {
  this.accounting.record({
    sourceType:    ACCOUNTING_SOURCE.REPAIR_DEPOSIT,
    sourceId:      repair.id,                  // Repair.id
    paymentMethod: dto.depositPaymentMethod ?? 'CASH',
    amount:        dto.deposit,
    direction:     'IN',
    branchId:      effectiveBranchId,
    tenantId:      tenantId ?? null,
    actorUserId:   actorId,
    note:          repair.ticketNumber,
  }, tx);  // inside $transaction — atomic
}
```

**CDT idempotency key:** `{tenantId}:REPAIR_DEPOSIT:{repair.id}:IN`

**JournalEntry:** NONE — not implemented.

**Proposed journal (for implementation reference):**

| Account | DR | CR |
|---|---|---|
| 1100 (Cash) or 1120 (Transfer/Card) | `deposit` | — |
| 2110 (Customer Deposit) | — | `deposit` |

### 3.2 Final Payment (`POST /api/v1/repairs/:id/payment`)

**File:** `repairs.service.ts:749-862`

**Guards:**
- Open shift required (queries `Shift.isActive = true` for userId)
- Repair status must be COMPLETED or READY_PICKUP
- `paymentStatus != PAID` (atomic guard with `updateMany` WHERE clause)

**DTO:** `RepairPaymentDto` — `paymentMethod` (CASH/TRANSFER/CARD), `amountPaid`, `finalCost?`, `warrantyDays?`

**Accounting action (inside $transaction):**

```typescript
this.accounting.record({
  sourceType:    ACCOUNTING_SOURCE.REPAIR_FINAL_PAYMENT,
  sourceId:      repairId,                   // Repair.id
  paymentMethod: dto.paymentMethod,
  amount:        dto.amountPaid,             // amount customer pays NOW (= total - deposit)
  direction:     'IN',
  branchId:      repair.branchId,
  tenantId:      repair.branch?.tenantId,
  actorUserId:   userId,
}, tx);
```

**CDT idempotency key:** `{tenantId}:REPAIR_FINAL_PAYMENT:{repair.id}:IN`

**JournalEntry:** NONE — not implemented.

**Proposed journals (for implementation reference):**

**(a) Final payment cash receipt:**

| Account | DR | CR |
|---|---|---|
| 1100 / 1120 | `amountPaid` | — |
| 4200 (Repair Revenue) | — | `amountPaid` |

**(b) Deposit settlement (clear Customer Deposit liability):**

| Account | DR | CR |
|---|---|---|
| 2110 (Customer Deposit) | `deposit` | — |
| 4200 (Repair Revenue) | — | `deposit` |

**(c) Parts COGS (for parts with costPrice > 0, summed across all active RepairParts):**

| Account | DR | CR |
|---|---|---|
| 5200 (Repair Parts Cost) | `∑(part.costPrice × quantity)` | — |
| 1310 (Repair Parts Inventory) | — | `∑(part.costPrice × quantity)` |

**Note:** `amountPaid` is what the customer pays at delivery — it does NOT include the already-collected deposit. Full repair revenue = `deposit + amountPaid`. Total revenue journal at delivery = `deposit + amountPaid`.

### 3.3 Payment Reversal (`POST /api/v1/repairs/:id/reverse-payment`)

**File:** `repairs.service.ts:864-948`

**Guards:** Status must be DELIVERED, paymentStatus must be PAID.

**DB writes in $transaction:**
1. Creates `RepairPaymentReversal` record (stores amount, reason, paymentMethod)
2. Updates Repair: `paymentStatus=PENDING`, `status=COMPLETED`, clears `paidAmount/paidAt/paymentShiftId/deliveredAt`
3. Calls `accounting.record()` with `ACCOUNTING_SOURCE.REVERSAL`:

```typescript
this.accounting.record({
  sourceType:    ACCOUNTING_SOURCE.REVERSAL,
  sourceId:      repairId,                   // Repair.id (not the reversal record id)
  paymentMethod: repair.paymentMethod ?? 'CASH',
  amount:        repair.paidAmount,
  direction:     'OUT',
  branchId:      repair.branchId,
  tenantId:      repair.branch?.tenantId ?? tenantId,
  actorUserId:   userId,
  note:          `ยกเลิกการชำระเงินงานซ่อม: ${dto.reason}`,
  reversalOfId:  originalLedger?.id,         // CDT.id of REPAIR_FINAL_PAYMENT (CASH only)
}, tx);
```

**CDT idempotency key:** `{tenantId}:REVERSAL:{repair.id}:OUT`

**JournalEntry:** NONE — not implemented.

### 3.4 Additional Payment (`POST /api/v1/repairs/:id/additional-payment`)

**File:** `repairs.service.ts:950-1008`

**Guards:** Status must be COMPLETED or DELIVERED.

**DTO:** `AdditionalPaymentDto` — `amount`, `paymentMethod`, `note?`

**Accounting action (inside $transaction):**

```typescript
this.accounting.record({
  sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
  sourceId:      created.id,                 // RepairAdditionalPayment.id (NOT Repair.id)
  paymentMethod: dto.paymentMethod,
  amount:        dto.amount,
  direction:     'IN',
  branchId:      repair.branchId,
  tenantId:      branchInfo?.tenantId,
  actorUserId:   userId,
}, tx);
```

**CDT idempotency key:** `{tenantId}:REPAIR_ADDITIONAL_PAYMENT:{RepairAdditionalPayment.id}:IN`

**JournalEntry:** NONE — not implemented.

### 3.5 Debt Payment (`POST /api/v1/debt-payments`)

**File:** `debt-payments.service.ts:29-177`

This is a SEPARATE module that handles post-DELIVERED installment payments on repairs with `paymentStatus = PENDING | PARTIAL`. It creates the same `RepairAdditionalPayment` model records as `addAdditionalPayment()`.

**Guards:** Repair must be DELIVERED + paymentStatus PENDING or PARTIAL. Amount cannot exceed remaining balance.

**Accounting action (inside $transaction):**

```typescript
this.accounting.record({
  sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
  sourceId:      pmt.id,                     // RepairAdditionalPayment.id
  paymentMethod: dto.paymentMethod,
  amount:        dto.amount,
  direction:     'IN',
  branchId:      repair.branchId,
  tenantId:      repair.branch?.tenantId,
  actorUserId:   userId,
}, tx);
```

**CDT idempotency key:** `{tenantId}:REPAIR_ADDITIONAL_PAYMENT:{RepairAdditionalPayment.id}:IN`

**JournalEntry:** NONE — not implemented.

### 3.6 Cancellation (`PATCH /api/v1/repairs/:id` with `status: CANCELLED`)

**File:** `repairs.service.ts:396-437`

**Accounting action:** NONE — no `accounting.record()` call in the cancellation path.

**Stock action:** All active parts (`isVoided=false`) are voided + stock is returned (REPAIR_RETURN movements).

**CRITICAL GAP:** If a deposit was collected before cancellation (`REPAIR_DEPOSIT` CDT exists), there is NO corresponding CDT reversal entry. The deposit remains as an unmatched IN entry in the cash ledger. No journal entry exists either.

### 3.7 Parts Management

**addPart (`POST /api/v1/repairs/:id/parts`):**
- Deducts `BranchStock` atomically (conditional `updateMany`)
- Creates `StockMovement(type=REPAIR_USE)`
- Snapshots `costPrice`, `sellPrice`, `chargeToCustomer` on `RepairPart`
- **No `accounting.record()` call**

**removePart (`DELETE /api/v1/repairs/:id/parts/:partId`):**
- Soft-deletes `RepairPart` (sets `isVoided=true`)
- Restores `BranchStock`, creates `StockMovement(type=REPAIR_RETURN)`
- **No `accounting.record()` call**

---

## 4. Repair Data Model (Prisma)

| Field | Type | Note |
|---|---|---|
| `Repair.id` | cuid | Primary key |
| `Repair.ticketNumber` | String UNIQUE | `REP-{YYYYMMDD}-{XXXXXX}` |
| `Repair.status` | RepairStatus | RECEIVED→DIAGNOSING→…→DELIVERED |
| `Repair.paymentStatus` | RepairPaymentStatus | PENDING / PARTIAL / PAID |
| `Repair.finalCost` | Decimal? | Set at processPayment (= total cost) |
| `Repair.deposit` | Decimal | Default 0; collected at create |
| `Repair.paidAmount` | Decimal? | What customer paid at delivery |
| `Repair.paymentMethod` | PaymentMethod? | Set at processPayment |
| `Repair.paidAt` | DateTime? | Set at processPayment |
| `Repair.discount` | Decimal? | Discount on the repair total |
| `Repair.branchId` | String? | Nullable; resolved at create |
| `Repair.paymentShiftId` | String? | Shift at processPayment time |
| `RepairPart.costPrice` | Decimal? | Snapshot at addPart time |
| `RepairPart.sellPrice` | Decimal? | Non-zero only if chargeToCustomer=true |
| `RepairPart.chargeToCustomer` | Boolean | Controls whether sell price is billed |
| `RepairPart.isVoided` | Boolean | Soft delete |
| `RepairAdditionalPayment.id` | cuid | sourceId for REPAIR_ADDITIONAL_PAYMENT |
| `RepairPaymentReversal` | Model | Created at reversePayment; no CDT sourceId |

**Key design note:** There is NO separate `RepairPayment` table. Payment fields (`paymentMethod`, `paidAmount`, `paidAt`) are stored directly on the `Repair` model. This means:
- Only one CDT entry with `sourceType=REPAIR_FINAL_PAYMENT` per repair (correct — repairs can only be paid once via processPayment)
- The `sourceId` for REPAIR_FINAL_PAYMENT is `Repair.id` (not a payment record id)

---

## 5. Expense System — Flow-by-Flow Audit

### 5.1 Create Expense (`POST /api/v1/expenses`)

**File:** `expenses.service.ts:107-177`

**Guards:** Role must be OWNER or MANAGER. Category must be active.

**DTO:** `CreateExpenseDto` — `categoryId`, `amount`, `description`, `paymentMethod` (CASH/TRANSFER/CARD), `expenseDate`, `referenceNo?`, `note?`

**Tenant resolution:** `branch.tenantId` (re-fetched inside tx via `branchId` parameter)

**Accounting action (inside $transaction, only if `branchId` is set):**

```typescript
if (branchId) {
  const branchInfo = await tx.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } });
  this.accounting.record({
    sourceType:    ACCOUNTING_SOURCE.EXPENSE_PAYMENT,
    sourceId:      expense.id,               // Expense.id
    paymentMethod: dto.paymentMethod,
    amount:        dto.amount,
    direction:     'OUT',
    branchId,
    tenantId:      branchInfo?.tenantId ?? null,
    actorUserId:   userId,
    note:          dto.description,
  }, tx);
}
```

**CDT idempotency key:** `{tenantId}:EXPENSE_PAYMENT:{Expense.id}:OUT`

**JournalEntry:** NONE — not implemented.

**Proposed journal (for implementation reference):**

| Account | DR | CR |
|---|---|---|
| 6100 (Operating Expenses) or 6200 (Other Expenses) | `amount` | — |
| 1100 (Cash) or 1120 (Transfer/Card) | — | `amount` |

**Note:** No account code exists per expense category. A category-to-account mapping would be needed (or a single 6100 bucket for all operating expenses).

### 5.2 Void Expense (`DELETE /api/v1/expenses/:id` or `PATCH /api/v1/expenses/:id/void`)

**File:** `expenses.service.ts:254-315`

**Guards:** Role must be OWNER or MANAGER. Expense must not already be voided.

**DTO:** `VoidExpenseDto` — `voidReason`

**Accounting action (inside $transaction, only if `expense.branchId` is set):**

```typescript
if (expense.branchId) {
  // For CASH: looks up original CDT.id for reversalOfId
  if (expense.paymentMethod === 'CASH') {
    const originalLedger = await tx.cashDrawerTransaction.findFirst({
      where: { referenceType: 'EXPENSE_PAYMENT', referenceId: expense.id },
    });
    reversalOfId = originalLedger?.id;
  }

  this.accounting.record({
    sourceType:    ACCOUNTING_SOURCE.REVERSAL,
    sourceId:      expense.id,               // Expense.id (same as original)
    paymentMethod: expense.paymentMethod,
    amount:        expense.amount,
    direction:     'IN',                     // OUT reversal = IN
    branchId:      expense.branchId,
    tenantId:      tenantId,
    actorUserId:   userId,
    note:          `ยกเลิกค่าใช้จ่าย: ${dto.voidReason}`,
    reversalOfId,
  }, tx);
}
```

**CDT idempotency key:** `{tenantId}:REVERSAL:{Expense.id}:IN`

**JournalEntry:** NONE — not implemented.

---

## 6. Expense Data Model (Prisma)

| Field | Type | Note |
|---|---|---|
| `Expense.id` | cuid | Primary key; sourceId for CDT |
| `Expense.expenseDate` | DateTime | Thai-timezone-aware (stored as +07:00) |
| `Expense.amount` | Decimal | Amount spent |
| `Expense.paymentMethod` | PaymentMethod | CASH / TRANSFER / CARD |
| `Expense.categoryId` | String | FK to ExpenseCategory |
| `Expense.branchId` | String? | Nullable; guards CDT write |
| `Expense.shiftId` | String? | Auto-attached to user's active shift |
| `Expense.voidedAt` | DateTime? | Set on void |
| `Expense.voidReason` | String? | Set on void |
| `ExpenseCategory.code` | String | e.g. 'rent', 'utilities', 'salary' |

**Key design note:** `Expense` has no direct `tenantId` field. Tenant is always resolved via `branch.tenantId`. Expenses without `branchId` get NO CDT entry (guarded by `if (branchId)` in both create and void).

---

## 7. Finance Service

`finance.service.ts` reads from `CashDrawerTransaction` only. It provides:
- `getSummary()` — total IN/OUT by sourceType
- `getBranchPnL()` — per-branch IN/OUT summary
- `getTransactions()` — paginated CDT ledger view
- `saveDailyClose()` / `getDailyCloseHistory()` — daily close snapshots

**Finance is completely independent of JournalEntry.** It is unaffected by whether repair/expense journal entries are implemented.

---

## 8. Accounting Gaps Summary

### GAP-1: Repair deposit not journalized
- **What happens today:** CDT REPAIR_DEPOSIT entry (IN, DR cash)
- **What's missing:** JournalEntry: DR 1100/1120, CR 2110 (Customer Deposit)
- **Impact:** Customer deposits are not tracked as liabilities in the ledger

### GAP-2: Repair final payment not journalized
- **What happens today:** CDT REPAIR_FINAL_PAYMENT entry (IN)
- **What's missing:** JournalEntry: DR 1100/1120, CR 4200 (Repair Revenue) for `amountPaid`
- **What's also missing:** Deposit settlement journal: DR 2110, CR 4200 for `deposit` amount
- **Impact:** Repair revenue not in income statement; Customer Deposit liability never cleared

### GAP-3: Repair parts COGS not journalized
- **What happens today:** RepairPart.costPrice captured at addPart; StockMovement(REPAIR_USE) written
- **What's missing:** JournalEntry: DR 5200 (Repair Parts Cost), CR 1310 (Repair Parts Inventory) per active part when repair DELIVERED
- **Impact:** COGS for repair parts not reflected in profit/loss

### GAP-4: Repair additional payment / debt payment not journalized
- **What happens today:** CDT REPAIR_ADDITIONAL_PAYMENT entry (IN)
- **What's missing:** JournalEntry: DR 1100/1120, CR 1200 (Repair A/R) — reduces receivable
- **Impact:** Partial payments on delivered repairs not in double-entry ledger

### GAP-5: Repair payment reversal not journalized
- **What happens today:** CDT REVERSAL entry (OUT)
- **What's missing:** JournalEntry reversals of the REPAIR_FINAL_PAYMENT journal + deposit settlement journal
- **Impact:** Payment reversals not in ledger

### GAP-6: Repair cancellation — deposit not reversed
- **What happens today:** Deposit CDT remains as-is; no reversal on cancellation
- **What's missing:** CDT-level: REVERSAL entry for deposit amount. Journal-level: DR 2110, CR 1100/1120
- **Impact:** Cancelled repair deposits remain as unmatched IN entries in CDT AND have no journal presence

### GAP-7: Expense not journalized
- **What happens today:** CDT EXPENSE_PAYMENT entry (OUT)
- **What's missing:** JournalEntry: DR 6100/6200, CR 1100/1120
- **Impact:** Operating expenses not in income statement via double-entry

### GAP-8: Expense void not journalized
- **What happens today:** CDT REVERSAL entry (IN)
- **What's missing:** JournalEntry reversal of the EXPENSE_PAYMENT journal
- **Impact:** Expense reversals not in double-entry ledger

---

## 9. Proposed Accounting Journal Mappings

> **These are proposed, not yet implemented. For planning only.**

### 9A. Repair Deposit (at create, when deposit > 0)

| # | Event | DR | CR | Amount | sourceId |
|---|---|---|---|---|---|
| 1 | Deposit collected | 1100 or 1120 | 2110 | `deposit` | `repair.id` + suffix `:deposit` |

### 9B. Repair Delivery (at processPayment)

| # | Event | DR | CR | Amount | sourceId |
|---|---|---|---|---|---|
| 2a | Cash received | 1100 or 1120 | 4200 | `amountPaid` | `repair.id` + suffix `:payment` |
| 2b | Deposit settled | 2110 | 4200 | `deposit` | `repair.id` + suffix `:deposit_settle` |
| 2c | Parts COGS | 5200 | 1310 | `∑(costPrice × qty)` | `repair.id` + suffix `:cogs` |

**Notes on 2b:** Only applies when `deposit > 0`. If deposit was never journalized (GAP-1 not fixed), 2b cannot be posted (no 2110 liability to clear).

**Notes on 2c:** Active parts are defined as `RepairPart.isVoided = false`. costPrice comes from `RepairPart.costPrice` (snapshot). Skip parts where `costPrice IS NULL OR costPrice <= 0` (same pattern as SalesAccountingAdapter).

### 9C. Repair Payment Reversal (at reversePayment)

| # | Event | DR | CR | Amount | sourceId |
|---|---|---|---|---|---|
| 3a | Reverse cash receipt | 4200 | 1100 or 1120 | `paidAmount` | `repair.id` + suffix `:payment_reversal` |
| 3b | Reverse deposit settlement | 4200 | 2110 | `deposit` | `repair.id` + suffix `:deposit_settle_reversal` |

### 9D. Debt Payment / Additional Payment

| # | Event | DR | CR | Amount | sourceId |
|---|---|---|---|---|---|
| 4 | Installment received | 1100 or 1120 | 1200 (Repair A/R) | `amount` | `RepairAdditionalPayment.id` |

### 9E. Expense (at create)

| # | Event | DR | CR | Amount | sourceId |
|---|---|---|---|---|---|
| 5 | Expense paid | 6100 or 6200 | 1100 or 1120 | `amount` | `expense.id` |

### 9F. Expense Void

| # | Event | DR | CR | Amount | sourceId |
|---|---|---|---|---|---|
| 6 | Void expense | 1100 or 1120 | 6100 or 6200 | `amount` | `expense.id` + suffix `:void` |

---

## 10. Implementation Considerations

### 10.1 Account routing for payment method

Same pattern as `SalesAccountingAdapter`:
- `CASH` → account 1100 (Cash on Hand)
- `TRANSFER` / `CARD` / `QR` → account 1120 (Transfer/Card Clearing)

### 10.2 Source ID design for idempotency

The JournalEntry partial unique index: `(sourceType, sourceId, tenantId)` WHERE both are NOT NULL.

Since multiple journal entries may be needed for one repair event (e.g., processPayment → payment + deposit_settle + cogs), sourceIds must be disambiguated:

| Event | Proposed sourceType | Proposed sourceId |
|---|---|---|
| Deposit | `REPAIR_DEPOSIT` | `repair.id` |
| Final payment cash | `REPAIR_FINAL_PAYMENT` | `repair.id` |
| Deposit settlement | `REPAIR_DEPOSIT_SETTLE` | `repair.id` |
| Parts COGS | `REPAIR_COGS` | `repair.id` |
| Payment reversal | `REPAIR_PAYMENT_REVERSAL` | `repair.id` |
| Deposit settle reversal | `REPAIR_DEPOSIT_SETTLE_REV` | `repair.id` |
| Additional payment | `REPAIR_ADDITIONAL_PAYMENT` | `RepairAdditionalPayment.id` |
| Expense | `EXPENSE_PAYMENT` | `expense.id` |
| Expense void | `EXPENSE_REVERSAL` | `expense.id` |

**Note:** New sourceType enum values would need to be added to `JournalEntry.sourceType` field. Current values include: `SALE_PAYMENT`, `SALE_COGS`, `SALE_REFUND`, `SALE_REFUND_COGS`, `JOURNAL_REVERSAL`. Repair/expense types don't exist yet.

### 10.3 Tenant guard

The existing `SalesAccountingAdapter` checks `isEnabledForTenant(tenantId)` before posting journals. The repair/expense adapter must do the same.

Tenant resolution chain for Repair:
```
Repair.branchId → Branch.tenantId → isEnabledForTenant(tenantId)
```

For Expense:
```
Expense.branchId → Branch.tenantId → isEnabledForTenant(tenantId)
```

If `branchId` is null (Repair without branch — legacy data only), skip journal creation.

### 10.4 Transaction boundary

Repair journal entries should be posted **post-commit** (same pattern as `SalesAccountingAdapter`). The `AccountingService.record()` CDT writes are already inside the business tx; journal writes should happen AFTER the tx commits to avoid rolling back business records on journal errors.

### 10.5 Migration needed

New `JournalSourceType` enum values must be added to the Prisma schema + migration before implementation.

### 10.6 Reconciliation scope

`AccountingReconciliationService` currently only scans `Sale` records. A separate reconciliation scan for Repair and Expense would be needed (Phase 4B.4C or later).

---

## 11. CashDrawerTransaction — Current State (Pilot Tenant)

Existing CDT sourceTypes in production (from Phase 4B.3E counts):

| sourceType | In CDT today? |
|---|---|
| `SALE_PAYMENT` | YES (via POS) |
| `SALE_REFUND` | YES (via POS void/refund) |
| `REPAIR_DEPOSIT` | YES (existing repair deposits) |
| `REPAIR_FINAL_PAYMENT` | YES (existing repair payments) |
| `REPAIR_ADDITIONAL_PAYMENT` | YES (existing debt payments) |
| `EXPENSE_PAYMENT` | YES (existing expenses) |
| `REVERSAL` | YES (existing reversals) |

All of the above hit CDT correctly. The gap is ONLY at the JournalEntry level.

---

## 12. Test Suite Results

```
Test Suites: 28 passed, 28 total
Tests:       353 passed, 353 total
Snapshots:   0 total
```

All 353 tests pass. No regressions introduced by audit activities (read-only).

---

## AUDIT VERDICT

| Area | CDT (Cash Ledger) | JournalEntry (Double-Entry) |
|---|---|---|
| Repair Deposit | ✅ IMPLEMENTED | ❌ NOT IMPLEMENTED |
| Repair Final Payment | ✅ IMPLEMENTED | ❌ NOT IMPLEMENTED |
| Repair Payment Reversal | ✅ IMPLEMENTED | ❌ NOT IMPLEMENTED |
| Repair Additional Payment | ✅ IMPLEMENTED | ❌ NOT IMPLEMENTED |
| Repair Cancellation (deposit refund) | ❌ GAP IN CDT | ❌ NOT IMPLEMENTED |
| Repair Parts COGS | n/a (stock, not CDT) | ❌ NOT IMPLEMENTED |
| Expense Create | ✅ IMPLEMENTED | ❌ NOT IMPLEMENTED |
| Expense Void | ✅ IMPLEMENTED | ❌ NOT IMPLEMENTED |

**8 journal entry types need implementation before Repair/Expense appears in the double-entry ledger.**

---

## STOPPED

This is a READ-ONLY audit. No code was modified, no transactions were created.

Awaiting owner approval before:
1. Phase 4B.4B — Add `JournalSourceType` enum values to Prisma schema + migration
2. Phase 4B.4C — Implement `RepairAccountingAdapter` (deposit, final payment, parts COGS, reversal)
3. Phase 4B.4D — Implement `ExpenseAccountingAdapter` (expense, void)
4. Phase 4B.4E — Wire adapters into `RepairsService` and `ExpensesService` (post-commit calls)
5. Phase 4B.4F — Pilot tenant verification (create test repair + expense + verify journals)
6. Phase 4B.4G — Extend `AccountingReconciliationService` to scan Repair and Expense records
