# Phase 4B.4E — Wire Repair + Expense Accounting Adapters

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Production impact:** NONE until Coolify redeploys with new image; adapters are fail-closed (flag off by default for non-pilot tenants)  
**Next step:** Owner approval before Phase 4B.4F (pilot tenant live test — create a real repair + expense and verify journals)

---

## Scope

Wire `RepairAccountingAdapter` and `ExpenseAccountingAdapter` into:
- `RepairsService` (create, processPayment, reversePayment, addAdditionalPayment)
- `ExpensesService` (create, voidExpense)
- `DebtPaymentsService` (create)

**All accounting calls are post-commit — AFTER `$transaction` commits. Accounting failures are swallowed and never affect business transactions.**

**Constraints (in effect throughout):**
- NO modification to POS
- NO modification to Stock business behavior
- NO change to existing Repair calculations
- NO change to existing Expense calculations
- NO migration created
- NO backfill of historical repairs/expenses
- NO journals created for historical transactions
- NO change to `ACCOUNTING_ENABLED_TENANTS` or `ACCOUNTING_ACTIVATION_TIMESTAMP`
- NO deployment — STOP and wait for owner approval

---

## 1. Repair Lifecycle Audit (Pre-Code)

### Event A — Repair Creation with Deposit

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: creates Repair; calls `accounting.record(REPAIR_DEPOSIT, ...)` (CDT) inside tx |
| COMMIT | Repair + CDT committed |
| **Adapter (post-commit)** | `repairAccounting.recordDepositJournal(repair, depositPaymentMethod, tenantId, actorId)` |
| Journal | DR 1100/1120 (deposit) / CR 2110 (customer deposit liability) |
| Gate | `tenantId && (dto.deposit ?? 0) > 0` |

### Event B — Final Payment (processPayment)

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: updateMany (paymentStatus→PAID, status→DELIVERED); calls `accounting.record(REPAIR_FINAL_PAYMENT, ...)` (CDT) inside tx; returns repair with REPAIR_INCLUDE |
| COMMIT | Repair + CDT committed |
| **Adapter (post-commit)** | `repairAccounting.recordFinalPaymentJournal(paid, tenantId, userId)` |
| Journals | (1) DR 1100/1120 / CR 4200 (paidAmount); (2) DR 2110 / CR 4200 (deposit, if REPAIR_DEPOSIT was posted); (3) DR 5200 / CR 1310 per active part (COGS) |
| Gate | `tenantId` non-null |

### Event C — Payment Reversal (reversePayment)

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: creates RepairPaymentReversal; updates repair (paymentMethod→null, paidAmount→null, status→COMPLETED); calls `accounting.record(REVERSAL, ...)` (CDT) inside tx |
| COMMIT | Reversal + CDT committed |
| **Adapter (post-commit)** | `repairAccounting.reversePaymentJournal(reversed, tenantId, userId)` |
| Journals | REPAIR_PAYMENT_REVERSAL (swaps lines from REPAIR_FINAL_PAYMENT); REPAIR_DEPOSIT_SETTLE_REVERSAL (swaps lines from REPAIR_DEPOSIT_SETTLE, if it existed) |
| Gate | `reverseTenantId = repair.branch?.tenantId ?? tenantId` — non-null |

### Event D — Additional / Debt Payment (addAdditionalPayment in RepairsService)

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: creates RepairAdditionalPayment; calls `accounting.record(REPAIR_ADDITIONAL_PAYMENT, ...)` (CDT) inside tx |
| COMMIT | Payment + CDT committed |
| **Adapter (post-commit)** | `repairAccounting.recordAdditionalPaymentJournal(payment, repair, tenantId, userId)` |
| Journal | DR 1100/1120 / CR 1200 (Repair A/R) |
| Gate | `repair.branchId && addPayTenantId` both non-null |

### Event D2 — Debt Payment (DebtPaymentsService.create)

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: creates RepairAdditionalPayment; updates repair.paymentStatus; writes auditLog (inside tx); calls `accounting.record(REPAIR_ADDITIONAL_PAYMENT, ...)` (CDT) inside tx |
| COMMIT | Payment + CDT committed |
| **Adapter (post-commit)** | `repairAccounting.recordAdditionalPaymentJournal(payment, repair, tenantId, userId)` |
| Journal | DR 1100/1120 / CR 1200 (Repair A/R) |
| Gate | `dpTenantId && repair.branchId` both non-null |

### Event E — Cancellation (CANCELLED status via update)

**NOT wired — see Cancellation Gap below.**

### Event F — Parts Added / COGS Timing

COGS is recorded at **final payment time** (Event B), not at part-add time. This is correct — cost of goods sold is recognized when the repair revenue is recognized. Parts are fetched via REPAIR_INCLUDE with `isVoided: false` filter at the time of final payment.

---

## 2. Expense Lifecycle Audit (Pre-Code)

### Event A — Expense Creation

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: creates Expense (includes category.code); resolves branchInfo.tenantId inside tx; calls `accounting.record(EXPENSE_PAYMENT, ...)` (CDT) inside tx |
| COMMIT | Expense + CDT committed |
| **Adapter (post-commit)** | Separate `branch.findUnique` to get tenantId; `expenseAccounting.recordExpenseJournal(expense, tenantId, userId)` |
| Journal | DR 6100/6200 (category-based) / CR 1100/1120 (payment method) |
| Gate | `branchId` non-null && `bi.tenantId` non-null |

### Event B — Expense Void (voidExpense)

| Step | What happens |
|---|---|
| Business tx | `prisma.$transaction`: updates expense (voidedAt set); calls `accounting.record(REVERSAL, ...)` (CDT) inside tx |
| COMMIT | Void + CDT committed |
| **Adapter (post-commit)** | `expenseAccounting.reverseExpenseJournal(voided, tenantId, userId)` |
| Journal | DR 1100/1120 / CR 6100/6200 (reversal of original) — only if EXPENSE_PAYMENT was previously posted |
| Gate | `expense.branchId && tenantId` both non-null |

---

## 3. Cancellation Gap (CRITICAL — NOT FIXED HERE)

**Confirmed:** When a repair is cancelled after a deposit is paid, the CDT records a `REPAIR_DEPOSIT` entry (cash-in on deposit) but there is NO corresponding CDT reversal for the deposit when the repair is cancelled.

Similarly, the `REPAIR_DEPOSIT` double-entry journal created by the adapter at repair creation is **NOT reversed** when the repair is cancelled.

**This gap is intentional and documented here.** It was not fixed as part of this wiring phase because:
1. The user instruction explicitly stated: "DO NOT silently fix this as part of accounting wiring"
2. Fixing it requires understanding the business intent (is a cancelled repair deposit ever returned to the customer?)
3. Fixing it introduces a new journal type (`REPAIR_DEPOSIT_REVERSAL_ON_CANCEL`) not in the current JOURNAL_SOURCE constants

**Recommendation for a future phase:**
- Add `REPAIR_DEPOSIT_REVERSAL_ON_CANCEL` to JOURNAL_SOURCE
- Wire it in `update()` method when status transitions to CANCELLED and deposit > 0
- Verify journal balance: DR 2110 (customer deposit) / CR 1100/1120 (cash/clearing)

---

## 4. Files Changed

### New wiring (6 files modified, no new files)

| File | Change |
|---|---|
| `backend/src/repairs/repairs.module.ts` | Added `JournalModule` + `RepairAccountingAdapter` provider |
| `backend/src/expenses/expenses.module.ts` | Added `JournalModule` + `ExpenseAccountingAdapter` provider |
| `backend/src/debt-payments/debt-payments.module.ts` | Added `JournalModule` + `RepairAccountingAdapter` provider |
| `backend/src/repairs/repairs.service.ts` | Injected `RepairAccountingAdapter`; added 4 post-commit calls |
| `backend/src/expenses/expenses.service.ts` | Injected `ExpenseAccountingAdapter`; added 2 post-commit calls |
| `backend/src/debt-payments/debt-payments.service.ts` | Injected `RepairAccountingAdapter`; added 1 post-commit call |

### Test spec fixes (4 files — added adapter mocks to existing DI setups)

| File | Change |
|---|---|
| `backend/src/repairs/repairs.service.spec.ts` | Added `repairAccounting` mock as 6th constructor arg |
| `backend/src/repairs/repairs.workflow.spec.ts` | Added `RepairAccountingAdapter` import + mock provider |
| `backend/src/expenses/expenses.service.spec.ts` | Added `ExpenseAccountingAdapter` import + mock provider |
| `backend/src/debt-payments/debt-payments.service.spec.ts` | Added `RepairAccountingAdapter` import + mock provider |

---

## 5. Wiring Details

### RepairsService.create() — post-commit deposit journal

```typescript
// Post-commit: record deposit journal (AFTER $transaction — failure swallowed)
if (tenantId && (dto.deposit ?? 0) > 0) {
  await this.repairAccounting.recordDepositJournal(
    repair,
    dto.depositPaymentMethod ?? 'CASH',
    tenantId,
    actorId,
  );
}
```

`repair` is the full REPAIR_INCLUDE result from the tx. `dto.depositPaymentMethod` matches the same value already used for the CDT call inside the tx.

### RepairsService.processPayment() — post-commit final payment + COGS

```typescript
// Post-commit: record final payment + COGS journals (AFTER $transaction — failure swallowed)
if (tenantId) {
  await this.repairAccounting.recordFinalPaymentJournal(paid as any, tenantId, userId);
}
```

`paid` is the REPAIR_INCLUDE result from `tx.repair.findUniqueOrThrow(...)` — includes `parts` (non-voided), `paidAmount`, `paymentMethod`, `deposit`, `branchId`.

### RepairsService.reversePayment() — post-commit reversal

```typescript
// Post-commit: record payment reversal journals (AFTER $transaction — failure swallowed)
const reverseTenantId = (repair as any).branch?.tenantId ?? tenantId ?? null;
if (reverseTenantId) {
  await this.repairAccounting.reversePaymentJournal(reversed as any, reverseTenantId, userId);
}
```

`repair` (pre-fetched before tx) has `branch.tenantId`. `reversed` is the REPAIR_INCLUDE update result. The adapter's `_reversePaymentJournal` looks up the original journals by `repair.id`, so it does not depend on `reversed.paymentMethod` (which is null after reversal).

### RepairsService.addAdditionalPayment() — pre-fetch expanded + post-commit

Pre-fetch select expanded (minimal change, no business logic change):
```typescript
select: { id: true, status: true, branchId: true, ticketNumber: true, branch: { select: { tenantId: true } } }
```

Post-commit:
```typescript
const addPayTenantId = repair.branch?.tenantId ?? null;
if (repair.branchId && addPayTenantId) {
  await this.repairAccounting.recordAdditionalPaymentJournal(
    { id: payment.id, amount: payment.amount, paymentMethod: payment.paymentMethod as string },
    { id: repair.id, ticketNumber: repair.ticketNumber, branchId: repair.branchId },
    addPayTenantId,
    userId,
  );
}
```

### ExpensesService.create() — post-commit expense journal

```typescript
// Post-commit: record expense journal (AFTER $transaction — failure swallowed)
if (branchId) {
  const bi = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } });
  if (bi?.tenantId) {
    await this.expenseAccounting.recordExpenseJournal(
      {
        id:            expense.id,
        description:   expense.description,
        amount:        expense.amount,
        paymentMethod: expense.paymentMethod as string,
        branchId:      expense.branchId,
        category:      expense.category ? { code: expense.category.code } : null,
      },
      bi.tenantId,
      userId,
    );
  }
}
```

One extra `branch.findUnique` query added post-tx. This is a read-only query outside the transaction; failure is swallowed inside `recordExpenseJournal`.

### ExpensesService.voidExpense() — post-commit expense reversal

```typescript
// Post-commit: record expense reversal journal (AFTER $transaction — failure swallowed)
if (expense.branchId && tenantId) {
  await this.expenseAccounting.reverseExpenseJournal(
    {
      id:            voided.id,
      description:   voided.description,
      amount:        voided.amount,
      paymentMethod: voided.paymentMethod as string,
      branchId:      voided.branchId,
      category:      voided.category ? { code: voided.category.code } : null,
    },
    tenantId,
    userId,
  );
}
```

`voided` has the original amount and category (not changed by void). `tenantId` is already a parameter on `voidExpense()`.

### DebtPaymentsService.create() — post-commit additional payment journal

```typescript
// Post-commit: record additional payment journal (AFTER $transaction — failure swallowed)
const dpTenantId = repair.branch?.tenantId ?? null;
if (dpTenantId && repair.branchId) {
  await this.repairAccounting.recordAdditionalPaymentJournal(
    { id: payment.id, amount: payment.amount, paymentMethod: payment.paymentMethod as string },
    { id: repair.id, ticketNumber: repair.ticketNumber, branchId: repair.branchId },
    dpTenantId,
    userId,
  );
}
```

`repair` is pre-fetched before the tx with `include: { ..., branch: { select: { tenantId: true } } }` — all needed scalar fields (ticketNumber, branchId) are available.

---

## 6. Safety Guarantees

### Fail-closed
- Adapters call `isEnabledForTenant()` first — returns `false` for any tenant not in `ACCOUNTING_ENABLED_TENANTS`
- Currently only `cmsc05do8001u7i29q3p5x6zp` (pilot) is in the allowlist
- No-op for all other tenants regardless of which service processes the business transaction

### No-throw contract
- All public adapter methods catch all exceptions and log them — accounting failure NEVER propagates to the caller
- Business transaction is already committed before adapter is called — no risk of rollback

### Post-commit guarantee
- Every adapter call is after `await prisma.$transaction(...)` returns
- No adapter call is inside any Prisma transaction
- A journal failure has zero effect on the committed repair/expense record

### Idempotency
- DB partial unique index on `(sourceType, sourceId, tenantId)` prevents duplicate journals
- `JournalService.create()` handles P2002 (concurrent duplicate) by returning `{created:false}`

---

## 7. Journal Mapping Summary

| Business event | Adapter method | Journal type | DR | CR |
|---|---|---|---|---|
| Repair created (deposit > 0) | `recordDepositJournal` | REPAIR_DEPOSIT | 1100/1120 | 2110 |
| Final payment | `recordFinalPaymentJournal` | REPAIR_FINAL_PAYMENT | 1100/1120 | 4200 |
| Deposit settlement | (inside `recordFinalPaymentJournal`) | REPAIR_DEPOSIT_SETTLE | 2110 | 4200 |
| Parts COGS (per part) | (inside `recordFinalPaymentJournal`) | REPAIR_COGS | 5200 | 1310 |
| Payment reversed | `reversePaymentJournal` | REPAIR_PAYMENT_REVERSAL | 4200 | 1100/1120 |
| Deposit settle reversed | (inside `reversePaymentJournal`) | REPAIR_DEPOSIT_SETTLE_REVERSAL | 4200 | 2110 |
| Additional/debt payment | `recordAdditionalPaymentJournal` | REPAIR_ADDITIONAL_PAYMENT | 1100/1120 | 1200 |
| Expense created | `recordExpenseJournal` | EXPENSE_PAYMENT | 6100/6200 | 1100/1120 |
| Expense voided | `reverseExpenseJournal` | EXPENSE_REVERSAL | 1100/1120 | 6100/6200 |

**Not wired (cancellation gap):** Deposit reversal on repair cancellation → future phase.

---

## 8. Test Results

```
Test Suites: 30 passed, 30 total
Tests:       417 passed, 417 total
Snapshots:   0 total
Time:        ~50 s
```

All pre-existing tests pass. Adapter mock added to 4 test spec files (no test behavior changed).

---

## 9. Production Safety Verification

| Check | Value | Status |
|---|---|---|
| JournalEntry count (pre-deploy) | **20** | ✅ Unchanged (adapters not yet deployed) |
| JournalLine count (pre-deploy) | **20** | ✅ Unchanged |
| Migration | **NONE** | ✅ |
| Env vars changed | **NONE** | ✅ |
| ACCOUNTING_ENABLED_TENANTS changed | **NO** | ✅ |
| ACCOUNTING_ACTIVATION_TIMESTAMP changed | **NO** | ✅ |
| Deployment | **STOPPED — awaiting owner approval** | ✅ |

---

## STOPPED

Phase 4B.4E is complete. All adapters are wired with post-commit semantics. Tests pass. Build passes.

**Awaiting owner approval before:**
1. **Phase 4B.4F** — Pilot tenant live test (create a real repair + real expense on the production pilot tenant; verify journals appear)
2. **Phase 4B.4G** — Extend `AccountingReconciliationService` for Repair/Expense (scheduled scan for un-posted repairs/expenses)
3. **Cancellation gap fix** — Separate phase, requires owner decision on refund policy
