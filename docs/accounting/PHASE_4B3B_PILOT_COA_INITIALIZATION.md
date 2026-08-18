# Phase 4B.3B — Pilot Tenant Chart of Accounts Initialization

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Accounting:** OFF (all env vars absent — fail-closed)  
**Next step:** Owner approval for accounting activation

---

## Pilot Tenant

| Field | Value |
|-------|-------|
| Tenant ID | `cmsc05do8001u7i29q3p5x6zp` |
| Shop name | ริวคอม เซอร์วิซ |
| Plan | PRIVATE |
| Branches | 1 |
| Sales (at initialization time) | 73 |

---

## 1. Pre-flight Counts

Captured before initialization at 2026-08-18 ~03:35 UTC:

| Metric | Value | Expected |
|--------|-------|----------|
| Tenant exists | YES (ริวคอม เซอร์วิซ, PRIVATE) | ✅ |
| `AccountingAccount` for pilot | 0 | ✅ |
| `JournalEntry` for pilot | 0 | ✅ |
| `JournalLine` for pilot | 0 | ✅ |
| Sales for pilot | 73 | (live — 72 at prior audit, +1 new sale) |
| SalePayments for pilot | 40 | baseline |
| CashDrawerTransactions for pilot | 71 | baseline |
| Repairs for pilot | 0 | baseline |

Pre-flight clear. No unexpected accounting records.

---

## 2. Initialization

**Method:** `AccountingAccountsService.initializeForTenant()` logic via Prisma client — the exact same `createMany` with `skipDuplicates: true` call used by the service, run inside the backend container at `/app/` where `node_modules/@prisma/client` is available.

**Script:** Temporary `init-coa.js` copied into backend container, executed, then removed. No permanent files created.

**Result:**

```json
{ "tenantId": "cmsc05do8001u7i29q3p5x6zp", "created": 17, "skipped": 0, "total": 17 }
```

---

## 3. Accounts Created — Full Verification

All 17 standard accounts, confirmed by direct DB query:

| Code | Name | Type | isActive | isSystem | tenantId |
|------|------|------|----------|----------|----------|
| 1100 | Cash on Hand | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 1110 | Bank Deposit | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 1120 | Transfer/Card Clearing | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 1200 | Repair Accounts Receivable | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 1210 | Other Accounts Receivable | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 1300 | Inventory | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 1310 | Repair Parts Inventory | ASSET | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 2100 | Accounts Payable | LIABILITY | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 2110 | Customer Deposit | LIABILITY | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 3100 | Owner's Equity | EQUITY | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 4100 | Sales Revenue | REVENUE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 4200 | Repair Revenue | REVENUE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 4300 | Package Revenue | REVENUE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 5100 | Cost of Goods Sold | EXPENSE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 5200 | Repair Parts Cost | EXPENSE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 6100 | Operating Expenses | EXPENSE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |
| 6200 | Other Expenses | EXPENSE | ✅ true | true | cmsc05do8001u7i29q3p5x6zp |

### 5 accounts required by SalesAccountingAdapter

| Code | Role | Present | Active |
|------|------|---------|--------|
| 1100 | CASH payment debit | ✅ | ✅ |
| 1120 | TRANSFER/CARD payment debit | ✅ | ✅ |
| 1300 | COGS inventory credit | ✅ | ✅ |
| 4100 | Sales revenue credit | ✅ | ✅ |
| 5100 | COGS debit | ✅ | ✅ |

---

## 4. Safety Checks

| Check | Result |
|-------|--------|
| Duplicate code count | **0** |
| AccountingAccount for other tenants | **0** (no cross-tenant contamination) |
| All 17 accounts have `isActive = true` | **YES** |
| All 17 accounts have `isSystem = true` | **YES** |
| All 17 accounts have `tenantId = cmsc05do8001u7i29q3p5x6zp` | **YES** |

---

## 5. Business Data Verification

Comparison before vs after initialization:

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Sales | 73 | 73 | 0 |
| SalePayments | 40 | 40 | 0 |
| CashDrawerTransactions | 71 | 71 | 0 |
| Repairs | 0 | 0 | 0 |
| JournalEntry | 0 | **0** | 0 |
| JournalLine | 0 | **0** | 0 |

Initialization touched **only** the `AccountingAccount` table. Zero business data modified.

---

## 6. Idempotency Test

Second call of initialization for same tenant:

```json
{ "tenantId": "cmsc05do8001u7i29q3p5x6zp", "created": 0, "skipped": 17, "total": 17 }
```

- `created = 0` — no new records written
- `skipped = 17` — all existing codes detected, `toCreate` array was empty
- `createMany` was NOT called on second run
- No errors, no duplicates

**Idempotency: CONFIRMED**

---

## 7. Production Environment Verification

| Variable | Expected | Actual |
|----------|----------|--------|
| `ACCOUNTING_CORE_ENABLED` | absent | **ABSENT** |
| `ACCOUNTING_ENABLED_TENANTS` | absent | **ABSENT** |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | absent | **ABSENT** |

Backend health at time of check: `{"status":"ok","db":"ok","redis":"ok"}`

Accounting remains **fully disabled** (fail-closed). Chart of Accounts initialization has no effect on accounting behavior until the flag is set.

---

## 8. Backup Reference

| Backup | SHA-256 | Created |
|--------|---------|---------|
| `fixitpro_20260818_030443.sql.gz` (pre-init) | `ab2ce4c2623c2946fb8736c23459614b32869be2cb5b27eac458195e2e9525c0` | 2026-08-18 03:04 UTC |
| `fixitpro_20260817_033319.sql.gz` (pre-migration) | `48a1016f7dc140f524bde6403f0d7def0b6ce6bc33f22f9d1a2de6ce96a5f8a9` | 2026-08-17 03:33 UTC |

The initialization only adds 17 `AccountingAccount` rows. The existing backups are sufficient reference. No new backup was required for this step; a fresh backup can be taken before activation if desired.

---

## 9. Test Results

```
Test Suites: 28 passed, 28 total
Tests:       353 passed, 353 total
Snapshots:   0 total
Time:        31.9 s
```

---

## 10. Rollback / Recovery

If the initialized accounts need to be removed (before any JournalLine is created):

```sql
-- Safe to run ONLY while JournalLine count for this tenant = 0
DELETE FROM "AccountingAccount"
WHERE "tenantId" = 'cmsc05do8001u7i29q3p5x6zp'
  AND "isSystem" = true;
```

This removes all 17 system accounts. Custom accounts (isSystem=false) would survive.

After deletion, `initializeForTenant()` can be called again cleanly.

Once `JournalLine` rows exist referencing these accounts, deletion is blocked at the DB level (foreign key constraint on `JournalLine.accountId`).

---

## Final Report

| Criterion | Result |
|-----------|--------|
| Initialization | **PASS** — 17/17 accounts created |
| Tenant isolation | **PASS** — 0 accounts for other tenants |
| Idempotency | **PASS** — second run: created=0, skipped=17 |
| Business data unchanged | **PASS** — zero delta on all tables |
| JournalEntry | **0** |
| JournalLine | **0** |
| Accounting activation | **OFF** (all 3 env vars absent) |
| Health | **PASS** — status:ok, db:ok, redis:ok |
| Tests | **353/353** |

---

## STOPPED

Not proceeding further.

Awaiting owner approval before:
- Setting `ACCOUNTING_CORE_ENABLED=true` in Coolify
- Setting `ACCOUNTING_ACTIVATION_TIMESTAMP=<now>` in Coolify
- Setting `ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp` in Coolify
- Monitoring first live journal entries
- Proceeding to Phase 4B.3C (live activation monitoring)
