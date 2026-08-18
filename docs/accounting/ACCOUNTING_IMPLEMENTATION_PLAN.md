# FixITPro — Accounting Core Implementation Plan

> **Status:** PHASE 0 — Pre-flight complete, awaiting approval  
> **Date:** 2026-08-17  
> **Constraint:** Production-safe additive only. Zero destructive operations.

---

## 1. Pre-flight Audit Results

### 1.1 Git State

| Item | Value |
|------|-------|
| Current branch | `main` |
| Remote sync | Up to date with `origin/main` |
| Uncommitted changes | `.claude/settings.json` (non-production), `vi/` (untracked, non-production) |
| Last commit | `8d075cd fix(print): patch 3 bugs found by code review` |

**Risk:** None. No in-progress feature branches to conflict with.

### 1.2 Database / Migration State

| Item | Value |
|------|-------|
| Total migrations | 68 |
| Migration status | All applied — `Database schema is up to date!` |
| Last migration | `20260816000000_add_daily_close` |
| Local DB | `postgresql://localhost:5432/fixitpro` |
| E2E test DB | `postgresql://localhost:5432/fixitpro_test` (separate — safe) |
| ORM | Prisma 5.10.0 |

**Risk:** Clean slate. New accounting migrations will be #69, #70, #71.

### 1.3 Test Framework

| Item | Value |
|------|-------|
| Framework | Jest 30 + ts-jest 29 |
| Unit test pattern | `src/**/*.spec.ts` |
| E2E test pattern | `test/**/*.e2e-spec.ts` |
| E2E test database | `fixitpro_test` (isolated from dev/prod) |
| Existing spec files | 23 (including accounting, reconciliation, sales, repairs, expenses) |
| Existing e2e workflows | `sale.workflow`, `repair.workflow`, `expense.workflow`, `cash-drawer.workflow` |
| Test commands | `npm test`, `npm run test:ci`, `npm run test:e2e` |

### 1.4 Existing Accounting Infrastructure

| Component | File | Status |
|-----------|------|--------|
| AccountingService | `backend/src/accounting/accounting.service.ts` | Working |
| AccountingService spec | `backend/src/accounting/accounting.service.spec.ts` | 15 tests, all passing |
| ReconciliationService | `backend/src/reconciliation/reconciliation.service.ts` | Working (7 checks) |
| ReconciliationService spec | `backend/src/reconciliation/reconciliation.service.spec.ts` | Tests exist |
| FinanceService | `backend/src/finance/finance.service.ts` | Working |
| ReportsService | `backend/src/reports/reports.service.ts` | Working |
| DebtPaymentsService | `backend/src/debt-payments/debt-payments.service.ts` | **BUG: no accounting.record()** |

### 1.5 Feature Flag Status

`ACCOUNTING_CORE_ENABLED` — **does not exist yet** in any `.env` file.

Must be added to:
- `backend/.env` → `ACCOUNTING_CORE_ENABLED=false`
- `backend/.env.example` → `ACCOUNTING_CORE_ENABLED=false`
- `backend/.env.development` → `ACCOUNTING_CORE_ENABLED=false`
- `backend/.env.production.example` → `ACCOUNTING_CORE_ENABLED=false`

Default must be `false`. The system must behave identically to today when the flag is false.

### 1.6 Backup / Recovery

- AWS S3 backup module exists (`backend/src/backup/backup-s3.service.ts`)
- `docs/disaster-recovery.md` exists

**Required before any production migration:**
1. Manual DB backup via Coolify / pg_dump
2. Verify backup restore works on a copy
3. Document backup reference in each migration PR

### 1.7 Staging

- Local dev is effectively staging for unit/e2e tests via `fixitpro_test` DB
- No separate cloud staging server found
- All migrations must be tested locally with e2e suite before any production deploy

---

## 2. Confirmed Bug: DebtPaymentsService

**File:** `backend/src/debt-payments/debt-payments.service.ts`

**Problem:** Constructor injects `PrismaService`, `AuditLogService`, `NotificationsService` only.
`AccountingService` is **not injected**. The `create()` method writes `RepairAdditionalPayment`,
updates `Repair.paymentStatus`, and writes `AuditLog` — but never writes to `CashDrawerTransaction`.

**Impact:** Every post-delivery repair payment (debt collection) is invisible to:
- Cash drawer balance
- ReconciliationService checks
- FinanceService summaries
- DailyClose expected cash

**Fix required (Phase 1):** Inject `AccountingService` + call `accounting.record(REPAIR_ADDITIONAL_PAYMENT, ...)` inside the existing `$transaction`.

---

## 3. What Will Change Per Phase

### Phase 0 — Documentation (THIS PHASE)
- **New files only:** `docs/accounting/` directory
- **No code changes**
- **No schema changes**
- **No migration**

### Phase 1 — Fix Debt Payment Bug
Files to change:
- `backend/src/debt-payments/debt-payments.service.ts` — add `AccountingService` injection + call
- `backend/src/debt-payments/debt-payments.module.ts` — add `AccountingModule` import
- `backend/src/reconciliation/reconciliation.service.ts` — add `findMissingDebtPaymentLedger` check
- `backend/src/reconciliation/reconciliation.service.spec.ts` — extend tests
- `backend/src/debt-payments/debt-payments.service.spec.ts` (NEW) — 8+ unit tests

**Migration needed:** None  
**Schema change:** None  
**Production risk:** Low — additive call inside existing transaction  

### Phase 2 — Accounting Database Models
Files to change:
- `backend/prisma/schema.prisma` — add `AccountingAccount`, `JournalEntry`, `JournalLine`, `AccountType` enum
- New migration: `backend/prisma/migrations/YYYYMMDD_add_accounting_core/migration.sql`

**Migration needed:** Yes — CREATE TABLE only (3 new tables)  
**Production risk:** Low — additive tables, no existing table touched  
**Rollback:** `DROP TABLE "JournalLine", "JournalEntry", "AccountingAccount"; DROP TYPE "AccountType";`

### Phase 3 — Chart of Accounts Seed
Files to change:
- `backend/prisma/seed-accounting.ts` (NEW) — 17 system accounts

**Migration needed:** Data seed only (not a schema migration)  
**Production risk:** Very low — INSERT to new tables only  
**Rollback:** `DELETE FROM "AccountingAccount" WHERE "isSystem" = true;`

### Phase 4 — AccountingService Extension (Dual Write)
Files to change:
- `backend/src/accounting/accounting.service.ts` — add JournalEntry dual-write behind feature flag
- `backend/src/accounting/accounting.module.ts` — update imports
- `backend/src/accounting/accounting.service.spec.ts` — extend tests for journal paths
- `backend/.env` + `backend/.env.example` — add `ACCOUNTING_CORE_ENABLED=false`

**Migration needed:** None  
**Production risk:** Low (flag is OFF by default)  
**Rollback:** Set `ACCOUNTING_CORE_ENABLED=false`

### Phases 5–26 — (Subsequent phases per spec)
Not planned in detail here. Each phase requires its own sub-plan and approval.

---

## 4. What Will NOT Change

The following must remain untouched throughout all phases:

| System | Guarantee |
|--------|-----------|
| POS (Sale) API | No contract changes |
| Repair API | No contract changes |
| Stock/Inventory | No contract changes |
| Purchase Order API | No contract changes |
| Expense API | No contract changes |
| Customer API | No contract changes |
| Shift / Cash Drawer API | No contract changes |
| CashDrawerTransaction table | No schema changes, no data deletion |
| AccountingService.record() | Existing behavior preserved |
| FinanceService | No changes (reads same tables) |
| ReconciliationService | Additive checks only |
| ReportsService | No changes |
| DailyClose | No changes until Phase 10 |
| All existing migrations | Never modified |
| Existing test suite | Must remain green |

---

## 5. New Tables Summary

```sql
-- New table 1: AccountingAccount (Chart of Accounts)
-- Zero rows at create time; seeded in Phase 3

-- New table 2: JournalEntry
-- All new rows have isBackfill=false; backfill rows have isBackfill=true

-- New table 3: JournalLine
-- Always balanced: SUM(debit) = SUM(credit) per entry enforced at service layer
```

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dual-write increases transaction latency | Medium | Medium | Feature flag OFF in prod until benchmarked |
| JournalEntry imbalance bug | Low | High | Assertion in service layer: throw if sum(debit) ≠ sum(credit) |
| Phase 1 bug fix breaks existing test | Low | Medium | Run full test suite before deploy |
| Backfill script causes table lock | Medium | Medium | Batch ≤500 rows, off-peak hours |
| Migration fails mid-way | Low | High | Atomic DDL in PostgreSQL; test on local first |
| Feature flag not respected | Low | High | All new code paths gated; unit test the flag |
| DebtPayments fix creates duplicate ledger entries | Low | Medium | Idempotency key prevents duplicates |

---

## 7. Rollback Strategy Per Phase

| Phase | Rollback Method | Time to Recover |
|-------|----------------|----------------|
| 1 — Bug fix | Revert 1 service file + module + spec | < 30 min |
| 2 — Schema | `DROP TABLE` 3 new tables + `DROP TYPE AccountType` | < 5 min |
| 3 — Seed | `DELETE FROM AccountingAccount WHERE isSystem = true` | < 1 min |
| 4 — Dual write | Set `ACCOUNTING_CORE_ENABLED=false` + restart | < 2 min |
| Any phase | Full DB restore from pre-phase backup | < 30 min |

---

## 8. Pre-production Checklist (Must pass before each migration)

```
PRE-FLIGHT CHECKLIST
====================
[ ] Manual DB backup completed and verified restorable
[ ] Migration SQL reviewed line-by-line
[ ] Migration tested on local fixitpro_test DB
[ ] `npm run test:ci` passes (all unit tests green)
[ ] `npm run test:e2e` passes (all e2e workflows green)
[ ] Row counts match before/after on staging
[ ] ACCOUNTING_CORE_ENABLED=false in production .env
[ ] Rollback SQL tested on staging
[ ] Maintenance window confirmed (if needed)
[ ] PR reviewed by at least 1 person
```

---

## 9. Exact Execution Order

```
Phase 0:  Documentation (NOW — no code changes)
Phase 1:  DebtPayments bug fix + reconciliation check + tests
Phase 2:  Prisma schema + migration (3 new tables)
Phase 3:  Chart of Accounts seed (17 system accounts)
Phase 4:  AccountingService dual-write (behind flag)
Phase 5:  Journal templates registry
Phase 6:  Transfer/Card clearing concept
Phase 7:  Accounts Receivable (Repair AR)
Phase 8:  Accounts Payable (PO goods receipt)
Phase 9:  Owner investment/withdrawal
Phase 10: DailyClose server-side calculation + lock
Phase 11: Reconciliation extension (13 checks)
Phase 12: COGS snapshot integrity
Phase 13: PackageSale tenantId audit + migration plan
Phase 14: New reporting endpoints
Phase 15: Dashboard integration
Phase 16: Report comparison/verification
Phase 17: Backfill (dry run first, then real)
Phase 18: Full test suite
Phase 19: Production safety test
Phases 20–26: Performance, audit, permissions, docs, flag, acceptance
```

Each phase requires: tests pass → file list shown → risk confirmed → approval → execute.

---

*Last updated: 2026-08-17 — Phase 0 pre-flight*
