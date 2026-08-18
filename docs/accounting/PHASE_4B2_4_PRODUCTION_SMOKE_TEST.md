# Phase 4B.2.4 — Production Smoke Test

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Accounting:** OFF (no env vars set — fail-closed)  
**Tester:** Claude Sonnet 4.6 / automated SSH checks

---

## 1. Production Commit SHA

| Field | Value |
|-------|-------|
| Deployed commit | `dd18ab2` |
| Full SHA | `dd18ab292031c1df30d42406a912829e86827bb1` |
| Branch | `main` |
| Backend image | `z9m1c1i9nr6kbyo4qn0vuv1b_backend:dd18ab292031c1df30d42406a912829e86827bb1` |
| Frontend image | `z9m1c1i9nr6kbyo4qn0vuv1b_frontend:dd18ab292031c1df30d42406a912829e86827bb1` |
| Deployment trigger | Coolify auto-deploy on git push (2026-08-18 ~02:51 UTC) |

---

## 2. Deployment Timestamp

| Container | Uptime at test time |
|-----------|-------------------|
| `backend-z9m1c1i9nr6kbyo4qn0vuv1b-1787021472` | ~19 minutes (launched ~02:51 UTC) |
| `frontend-z9m1c1i9nr6kbyo4qn0vuv1b-1787021472` | ~19 minutes |
| `postgres-z9m1c1i9nr6kbyo4qn0vuv1b-024512663078` | ~20 minutes (healthy) |

---

## 3. Health Checks

| Check | Result | Detail |
|-------|--------|--------|
| Backend `/health` | **PASS** | `{"status":"ok","db":"ok","redis":"ok","timestamp":"2026-08-18T03:15:58.626Z"}` |
| Database | **PASS** | PostgreSQL 15-alpine, healthy, Prisma connected |
| Redis | **PASS** (in-memory) | `REDIS_URL` not set → in-memory fallback (expected, non-critical) |
| Prisma migrate | **PASS** | `No pending migrations to apply` (70 migrations applied) |
| Container status | **PASS** | All 3 app containers healthy |

**Startup log excerpt:**
```
[entrypoint] Running Prisma migrations...
70 migrations found in prisma/migrations
No pending migrations to apply.
[entrypoint] Starting FixITPro Backend...
WARN [RedisService] REDIS_URL not set — module cache running in-memory (single-process only)
```

No errors, no panics, no Prisma failures on startup.

---

## 4. Environment Variable Verification

Verified via `docker exec backend-* env | grep ACCOUNTING`:

| Variable | Expected | Actual |
|----------|----------|--------|
| `ACCOUNTING_CORE_ENABLED` | absent | **ABSENT** |
| `ACCOUNTING_ENABLED_TENANTS` | absent | **ABSENT** |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | absent | **ABSENT** |

Result: **Accounting is fully disabled.** Fail-closed behavior active.

---

## 5. POS and Business Endpoint Checks

All routes tested non-mutating (HTTP method check only, no data created):

| Route | Method | Response | Expected |
|-------|--------|----------|----------|
| `/health` | GET | 200 OK | ✅ |
| `/api/v1/products` | GET | 401 Unauthorized | ✅ route registered, auth required |
| `/api/v1/sales` | GET | 401 Unauthorized | ✅ route registered, auth required |
| `/api/v1/sales/print` | GET | 401 Unauthorized | ✅ |
| `/api/v1/repairs` | GET | 401 Unauthorized | ✅ |
| `/api/v1/customers` | GET | 401 Unauthorized | ✅ |
| `/api/v1/categories` | GET | 401 Unauthorized | ✅ |
| `/api/v1/shifts` | GET | 401 Unauthorized | ✅ |
| `/api/v1/expenses` | GET | 401 Unauthorized | ✅ |
| `/api/v1/accounting/accounts` | GET | 401 Unauthorized | ✅ route registered, auth required |
| `/api/v1/admin/accounting/run-reconciliation` | POST | 401 Unauthorized | ✅ route registered, auth required |
| `/api/v1/admin/accounting/run-reconciliation` | GET | 404 Not Found | ✅ no GET handler (correct) |

All 401 responses indicate routes are properly registered and protected by JWT guard.

---

## 6. Safe Transaction Test

**No real customer sale was created during this smoke test.**

There is no isolated test/sandbox mechanism in the production database that prevents contaminating real customer data. Creating a fake sale in the production `fixitpro` database would affect real business records (Sale count, SalePayment count, CashDrawerTransaction count, stock inventory).

The existing test suite (`npm test`, 352 tests) covers the complete POS transaction flow including:
- Cash sale creation
- Transfer/QR sale
- Stock deduction
- CashDrawerTransaction creation
- Receipt generation
- SalesAccountingAdapter disabled behavior

These tests run against the `fixitpro_test` database and pass 352/352.

---

## 7. Accounting OFF Verification

### SalesAccountingAdapter

**Code path** (`backend/src/sales/sales-accounting.adapter.ts`):

```typescript
isEnabledForTenant(tenantId: string): boolean {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false; // ← exits here
  // ...
}
```

With `ACCOUNTING_CORE_ENABLED` absent:
- `isEnabledForTenant()` → **`false`** for ALL tenants
- `recordSaleJournal()` → skips (no JournalService call, no DB write)
- `reverseSaleJournal()` → skips
- `refundSaleJournal()` → skips

### Confirmed effects

| Action | Result |
|--------|--------|
| `JournalService.postEntries()` called | **NO** |
| `JournalEntry` created | **NO** |
| `JournalLine` created | **NO** |
| POS transaction behavior changed | **NO** |

---

## 8. Reconciliation Cron Behavior

**Cron schedule:** `@Cron('0 */15 * * * *')` — every 15 minutes

**Code path** (`accounting-reconciliation.service.ts`):

```typescript
@Cron('0 */15 * * * *')
async scheduledScan(): Promise<void> {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return; // ← exits here, no log
  // ... rest of scan never reached
}
```

With `ACCOUNTING_CORE_ENABLED` absent:
- Cron fires every 15 minutes
- **Returns immediately** on the first line
- Produces **zero log output**
- Makes **zero Prisma queries**
- Creates **zero JournalEntry / JournalLine**

`runReconciliation()` (POST endpoint) has the same guard as the first statement — any unauthenticated call is blocked at 401 before even reaching the service; authenticated calls would hit the same early return.

---

## 9. Test Results

| Metric | Result |
|--------|--------|
| Test suites | 28 passed, 28 total |
| Tests | **352 passed, 352 total** |
| Snapshots | 0 total |
| Time | 30.4 s |
| Build (`nest build`) | **exit 0** |

---

## 10. Production Row-Count Baseline

Captured at 2026-08-18 ~03:03 UTC (before smoke test):

| Table | Count |
|-------|-------|
| `JournalEntry` | 0 |
| `JournalLine` | 0 |
| `AccountingAccount` | 0 |
| `Tenant` | 9 |
| `Branch` | 13 |
| `Sale` | 93 |
| `SalePayment` | 60 |
| `Repair` | 23 |
| `CashDrawerTransaction` | 119 |

---

## 11. Production Row-Count After Test

Captured at 2026-08-18 ~03:15 UTC (after all smoke test steps):

| Table | Baseline | After | Delta |
|-------|----------|-------|-------|
| `JournalEntry` | 0 | **0** | 0 |
| `JournalLine` | 0 | **0** | 0 |
| `AccountingAccount` | 0 | **0** | 0 |
| `Tenant` | 9 | **9** | 0 |
| `Branch` | 13 | **13** | 0 |
| `Sale` | 93 | **93** | 0 |
| `SalePayment` | 60 | **60** | 0 |
| `Repair` | 23 | **23** | 0 |
| `CashDrawerTransaction` | 119 | **119** | 0 |

**Zero delta across all tables.** No production data was modified.

---

## 12. Log Review

**Backend startup logs (complete):**

```
[entrypoint] Running Prisma migrations...
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "fixitpro"
70 migrations found in prisma/migrations
No pending migrations to apply.
[entrypoint] Starting FixITPro Backend...
WARN [RedisService] REDIS_URL not set — module cache running in-memory (single-process only)
```

**Errors:** None  
**Accounting errors:** None  
**SalesAccountingAdapter errors:** None  
**Reconciliation errors:** None  
**Prisma errors:** None  
**500 responses observed:** None  

Only warning is `REDIS_URL not set` — expected in production (Redis not provisioned), uses in-memory fallback which is functional.

Note: NestJS module registration logs (route mappings, application listen) are not captured in Docker logs for this deployment — this is consistent with the pre-Phase 4B production behavior and is not a new issue introduced by this commit.

---

## 13. Backup Verification

| Backup | File | Size | SHA-256 | Gzip | Status |
|--------|------|------|---------|------|--------|
| Pre-migration (Phase 2B) | `fixitpro_20260817_033319.sql.gz` | ~2.3 MB | `48a1016f7dc140f524bde6403f0d7def0b6ce6bc33f22f9d1a2de6ce96a5f8a9` | — | Present |
| Post-commit fresh backup | `fixitpro_20260818_030443.sql.gz` | 2.3 MB | `ab2ce4c2623c2946fb8736c23459614b32869be2cb5b27eac458195e2e9525c0` | **OK** | Present |

Both backups at `/opt/fixitpro-backups/db/` on the production server. The fresh backup (`fixitpro_20260818_030443.sql.gz`) was created this session and verified with `gzip -t` (integrity OK) and SHA-256 checksum.

---

## 14. Warnings

| # | Warning | Severity | Action |
|---|---------|----------|--------|
| W1 | `REDIS_URL not set — module cache running in-memory` | LOW | Expected. Redis not provisioned. In-memory fallback is operational. No action needed unless Redis is added. |
| W2 | Coolify auto-deployed on git push | INFO | The push to `origin/main` triggered a Coolify webhook redeploy. This was not explicitly requested but is the normal Coolify behavior. The deploy is safe: `ACCOUNTING_CORE_ENABLED` was absent before and after. No migrations were pending. No production data was affected. |
| W3 | Automated backup cron last ran 2026-08-15 | LOW | The Coolify-managed backup cron volume shows last file from Aug 15. The manually-created backup (`fixitpro_20260818_030443.sql.gz`) covers current state. The cron gap should be investigated separately. |

---

## 15. Final GO / NO-GO

| Criterion | Check | Result |
|-----------|-------|--------|
| A | Backend health | **PASS** — status:ok, db:ok, redis:ok |
| B | Database | **PASS** — PostgreSQL healthy, Prisma connected |
| C | Redis | **PASS** — in-memory fallback active (expected) |
| D | Accounting flag OFF | **PASS** — all 3 vars absent |
| E | POS endpoints available | **PASS** — 401 (auth-protected) for all business routes |
| F | No unintended production data changes | **PASS** — zero delta on all tables |
| G | JournalEntry = 0 | **PASS** — confirmed before and after |
| H | JournalLine = 0 | **PASS** — confirmed before and after |
| I | Reconciliation exits without accounting when OFF | **PASS** — first-line guard, no queries, no logs |
| J | Full tests pass | **PASS** — 352/352, 28 suites |
| K | Build passes | **PASS** — exit 0 |
| L | No new critical application errors | **PASS** — zero errors in logs |
| M | Backup valid | **PASS** — gzip integrity OK, SHA-256 verified |

**FINAL VERDICT: GO ✓**

All 13 pass criteria met. The accounting code is deployed and confirmed non-interfering with existing production behavior. The feature flag is OFF. Production is stable.

---

## STOPPED

Not proceeding further.

Awaiting owner approval before:
- Setting `ACCOUNTING_CORE_ENABLED=true` in production
- Setting `ACCOUNTING_ACTIVATION_TIMESTAMP` in production
- Setting `ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>` in production
- Proceeding to Phase 4B.3 (Repair/Expense journal entries)
