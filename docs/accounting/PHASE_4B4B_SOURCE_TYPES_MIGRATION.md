# Phase 4B.4B — Journal Source Types

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Production impact:** NONE — no DB migration applied  
**Next step:** Owner approval before Phase 4B.4C (RepairAccountingAdapter implementation)

---

## Critical Finding: No DB Enum Migration Required

### What was expected

The Phase 4B.4A audit assumed a database enum (`JournalSourceType`) would need to be extended with 9 new values via `ALTER TYPE ... ADD VALUE`.

### What the code actually shows

`JournalEntry.sourceType` is defined as `String?` (PostgreSQL `TEXT`) in both the Prisma schema and the underlying migration SQL:

```sql
-- From migration 20260817025923_add_accounting_core/migration.sql
CREATE TABLE "JournalEntry" (
    ...
    "sourceType" TEXT,   -- plain text, NOT a PostgreSQL enum
    ...
);
```

There is no `CREATE TYPE "JournalSourceType" AS ENUM (...)` anywhere in the codebase. The existing source type values (`SALE_PAYMENT`, `SALE_COGS`, `SALE_REFUND`, `SALE_REFUND_COGS`) are hard-coded string literals in `SalesAccountingAdapter`. Only `JOURNAL_REVERSAL` and `JOURNAL_MANUAL` were previously in the shared `JOURNAL_SOURCE` constant.

**Consequence:** No `ALTER TYPE` migration is needed. No Prisma schema change is needed. No DB migration file was created or applied.

**Also confirmed:** Modifying the column from `TEXT` to a PostgreSQL enum would require `ALTER COLUMN ... TYPE ... USING`, which:
- Is an existing column modification (prohibited by safety rules)
- Would require casting all existing production JournalEntry rows
- Is unnecessary since `TEXT` is equally safe and already working

---

## What Was Done

### 1. TypeScript Constants Added

9 new source type constants added to `JOURNAL_SOURCE` in `backend/src/journal/journal.service.ts` (lines 60-80):

**Before:**
```typescript
export const JOURNAL_SOURCE = {
  REVERSAL: 'JOURNAL_REVERSAL',
  MANUAL:   'JOURNAL_MANUAL',
} as const;
```

**After:**
```typescript
export const JOURNAL_SOURCE = {
  // Internal journal management
  REVERSAL: 'JOURNAL_REVERSAL',
  MANUAL:   'JOURNAL_MANUAL',
  // Repair accounting (Phase 4B.4C — not yet implemented)
  REPAIR_DEPOSIT:                  'REPAIR_DEPOSIT',
  REPAIR_FINAL_PAYMENT:            'REPAIR_FINAL_PAYMENT',
  REPAIR_DEPOSIT_SETTLE:           'REPAIR_DEPOSIT_SETTLE',
  REPAIR_COGS:                     'REPAIR_COGS',
  REPAIR_PAYMENT_REVERSAL:         'REPAIR_PAYMENT_REVERSAL',
  REPAIR_DEPOSIT_SETTLE_REVERSAL:  'REPAIR_DEPOSIT_SETTLE_REVERSAL',
  REPAIR_ADDITIONAL_PAYMENT:       'REPAIR_ADDITIONAL_PAYMENT',
  // Expense accounting (Phase 4B.4D — not yet implemented)
  EXPENSE_PAYMENT:                 'EXPENSE_PAYMENT',
  EXPENSE_REVERSAL:                'EXPENSE_REVERSAL',
} as const;
```

All 9 requested values are present with the exact names specified:

| Constant | String Value | Status |
|---|---|---|
| `JOURNAL_SOURCE.REPAIR_DEPOSIT` | `'REPAIR_DEPOSIT'` | ✅ Added |
| `JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT` | `'REPAIR_FINAL_PAYMENT'` | ✅ Added |
| `JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE` | `'REPAIR_DEPOSIT_SETTLE'` | ✅ Added |
| `JOURNAL_SOURCE.REPAIR_COGS` | `'REPAIR_COGS'` | ✅ Added |
| `JOURNAL_SOURCE.REPAIR_PAYMENT_REVERSAL` | `'REPAIR_PAYMENT_REVERSAL'` | ✅ Added |
| `JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE_REVERSAL` | `'REPAIR_DEPOSIT_SETTLE_REVERSAL'` | ✅ Added |
| `JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT` | `'REPAIR_ADDITIONAL_PAYMENT'` | ✅ Added |
| `JOURNAL_SOURCE.EXPENSE_PAYMENT` | `'EXPENSE_PAYMENT'` | ✅ Added |
| `JOURNAL_SOURCE.EXPENSE_REVERSAL` | `'EXPENSE_REVERSAL'` | ✅ Added |

### 2. Local Dev DB Synced

Two previously-pending accounting migrations applied to local `fixitpro` DB to align with production:

| Migration | Applied |
|---|---|
| `20260817025923_add_accounting_core` | ✅ Applied |
| `20260817100000_add_journal_idempotency_index` | ✅ Applied |

These were already applied to production. The local dev DB was behind.

**Post-apply local dev state:**
- `JournalEntry` count: **0**
- `JournalLine` count: **0**

---

## Pre-flight Verification

### Before changes

| Check | Expected | Actual |
|---|---|---|
| `JournalEntry` count (local dev) | 0 | **0** ✅ |
| `JournalLine` count (local dev) | 0 | **0** ✅ |
| Existing constants | REVERSAL, MANUAL | Confirmed ✅ |
| 353/353 tests pass | YES | **YES** ✅ |

### Test DB (`fixitpro_test`)

The E2E global setup (`test/setup/global-setup.ts`) runs `prisma migrate deploy` with the test DB URL before every test run. The 2 pending accounting migrations were therefore automatically applied to `fixitpro_test` during this test run.

---

## Existing Values — Unchanged

No existing source type value was modified, renamed, or removed.

Pre-existing constant values (unchanged):

| Source Type | Location | Status |
|---|---|---|
| `JOURNAL_REVERSAL` | `journal.service.ts` | ✅ Unchanged |
| `JOURNAL_MANUAL` | `journal.service.ts` | ✅ Unchanged |
| `SALE_PAYMENT` | `sales-accounting.adapter.ts` (string literal) | ✅ Unchanged |
| `SALE_COGS` | `sales-accounting.adapter.ts` (string literal) | ✅ Unchanged |
| `SALE_REFUND` | `sales-accounting.adapter.ts` (string literal) | ✅ Unchanged |
| `SALE_REFUND_COGS` | `sales-accounting.adapter.ts` (string literal) | ✅ Unchanged |

---

## Test Results

```
Test Suites: 28 passed, 28 total
Tests:       353 passed, 353 total
Snapshots:   0 total
Time:        163.7 s
```

All 353 existing tests remain green. No new tests required (no DB schema change to validate).

---

## Production Verification

Production was NOT modified. The TypeScript constant change is code-only and will be deployed as part of Phase 4B.4C when the RepairAccountingAdapter is implemented.

### Production pre-flight (verified at 12:10 UTC):

| Metric | Value | Status |
|---|---|---|
| Backend health | `ok` | ✅ |
| DB health | `ok` | ✅ |
| Redis health | `ok` | ✅ |
| Migrations applied | 70/70 (all applied) | ✅ |
| Most recent migration | `20260817100000_add_journal_idempotency_index` | ✅ |
| `JournalEntry` count | **20** | ✅ Unchanged from 4B.3E |
| `JournalLine` count | **40** | ✅ Unchanged from 4B.3E |
| `AccountingAccount` count | **17** | ✅ Unchanged |
| `Sale` count | **101** | ✅ Unchanged |
| `Repair` count | **23** | ✅ Unchanged |
| `Expense` count | **0** | ✅ Unchanged |
| `CashDrawerTransaction` count | **130** | ✅ Unchanged |

### Backup verification:

| Backup | SHA-256 | Status |
|---|---|---|
| `fixitpro_20260818_preactivation.sql.gz` | `84850aa38606e3ae1523e334249f5ac927719f79612846ca15ed52ad551ebde4` | ✅ Verified |

Pre-activation backup from Phase 4B.3C exists and is intact.

---

## Safety Analysis

| Safety Property | Status |
|---|---|
| No DROP tables | ✅ No migration ran |
| No DELETE data | ✅ No data touched |
| No UPDATE existing business data | ✅ |
| No existing JournalEntry modified | ✅ JE count: 20 (unchanged from 4B.3E) |
| No new JournalEntry created | ✅ No adapter wired |
| No RepairsService modified | ✅ |
| No ExpensesService modified | ✅ |
| No POS modified | ✅ |
| No Payment flow modified | ✅ |
| No Stock flow modified | ✅ |
| No Customer data touched | ✅ |
| ACCOUNTING_* env vars unchanged | ✅ |
| Accounting activation unchanged | ✅ Pilot tenant still only enabled tenant |
| Production deployment: NONE | ✅ TypeScript change is not yet deployed |

---

## Source ID Design (Planned, Not Implemented)

The following source identity mapping is planned for Phase 4B.4C/4D. No code implements this yet.

| JOURNAL_SOURCE constant | sourceId | Model |
|---|---|---|
| `REPAIR_DEPOSIT` | `Repair.id` | Repair |
| `REPAIR_FINAL_PAYMENT` | `Repair.id` | Repair |
| `REPAIR_DEPOSIT_SETTLE` | `Repair.id` | Repair |
| `REPAIR_COGS` | `Repair.id` | Repair |
| `REPAIR_PAYMENT_REVERSAL` | `Repair.id` | Repair |
| `REPAIR_DEPOSIT_SETTLE_REVERSAL` | `Repair.id` | Repair |
| `REPAIR_ADDITIONAL_PAYMENT` | `RepairAdditionalPayment.id` | RepairAdditionalPayment |
| `EXPENSE_PAYMENT` | `Expense.id` | Expense |
| `EXPENSE_REVERSAL` | `Expense.id` | Expense |

Idempotency is enforced by the partial unique index:
```sql
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

---

## Final Report

| Category | Result |
|---|---|
| DB migration | N/A — `JournalEntry.sourceType` is `TEXT`, no enum exists |
| Enum additions | ✅ PASS — 9 TypeScript constants added to `JOURNAL_SOURCE` |
| Test DB | ✅ PASS — `prisma migrate deploy` applied 2 pending migrations; 353/353 pass |
| Production | ✅ PASS — unchanged; no new migration applied |
| Existing data changes | **0** |
| `JournalEntry` count | **20** (unchanged from Phase 4B.3E) |
| `JournalLine` count | **40** (unchanged from Phase 4B.3E) |
| Tests | **353/353** |
| Production deployment impact | **NONE** |
| Accounting activation | **UNCHANGED** — pilot tenant only |

---

## STOPPED

Phase 4B.4B is complete.

Awaiting owner approval before:
1. **Phase 4B.4C** — Implement `RepairAccountingAdapter` (deposit, final payment, deposit settlement, COGS, reversal)
2. **Phase 4B.4D** — Implement `ExpenseAccountingAdapter` (expense, void)
3. **Phase 4B.4E** — Wire adapters into `RepairsService` and `ExpensesService`
4. **Phase 4B.4F** — Pilot tenant verification (create test repair + expense, verify journals)
5. **Phase 4B.4G** — Extend `AccountingReconciliationService` for Repair and Expense records
