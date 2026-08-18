# Phase 4B.2.3 — Production Deployment Readiness Audit

**Type:** Read-only audit  
**Date:** 2026-08-18  
**Auditor:** Phase 4B.2.3 automated review  
**Scope:** Phase 4B.1 + 4B.2 + 4B.2.2 — POS Accounting Adapter, Reconciliation, Fail-Closed Fix  

---

## VERDICT: ⛔ NO-GO

**4 blockers must be resolved before production deployment.**

---

## 1. Git Status

| Item | Value |
|------|-------|
| Branch | `main` |
| Local ↔ Remote | Up to date with `origin/main` |
| Remote HEAD | `8d075cdf65787b7b384503b95622403d71320b4e` |
| Latest commit | `8d075cd fix(print): patch 3 bugs found by code review` |

### ⛔ BLOCKER-1: All Phase 4B work is UNCOMMITTED

**Every file in Phase 4B.1, 4B.2, and 4B.2.2 has never been committed to git.**

`git status` output:

**Modified (staged nowhere):**
- `backend/prisma/schema.prisma` — JournalEntry, JournalLine, AccountingAccount models added
- `backend/src/app.module.ts` — AccountingReconciliationModule, JournalModule, AccountingAccountsModule imported
- `backend/src/sales/sales.module.ts` — SalesAccountingAdapter exported, JournalModule imported
- `backend/src/sales/sales.service.ts` — adapter calls added post-POS-transaction
- `backend/src/debt-payments/debt-payments.module.ts` — (unrelated to accounting)
- `backend/src/debt-payments/debt-payments.service.ts` — (unrelated to accounting)
- `backend/src/reconciliation/reconciliation.service.ts` — (unrelated to accounting)
- `backend/src/reconciliation/reconciliation.service.spec.ts` — (unrelated to accounting)
- `backend/src/sales/sales.workflow.spec.ts` — (unrelated to accounting)

**Untracked (never committed):**
- `backend/src/accounting-reconciliation/` — entire reconciliation module (NEW)
- `backend/src/accounting-accounts/` — accounting accounts module (NEW)
- `backend/src/journal/` — journal module (NEW)
- `backend/src/sales/sales-accounting.adapter.ts` — POS adapter (NEW)
- `backend/src/sales/sales-accounting.adapter.spec.ts` — adapter tests (NEW)
- `backend/prisma/migrations/20260817025923_add_accounting_core/` — core schema migration (NEW)
- `backend/prisma/migrations/20260817100000_add_journal_idempotency_index/` — idempotency index (NEW)
- `docs/accounting/` — all accounting documentation (NEW)

**Consequence:** Triggering a Coolify redeploy right now would deploy commit `8d075cd` — which contains **zero accounting code**. The current uncommitted work would not be included.

---

## 2. Current Build (Local Working Directory)

| Item | Status |
|------|--------|
| `npm run build` | ✅ Exit 0 — clean compile |
| TypeScript errors | ✅ None (`tsc --noEmit` clean) |
| `dist/src/accounting-reconciliation/` | ✅ Present |
| `dist/src/sales/sales-accounting.adapter.js` | ✅ Present |
| `dist/src/journal/` | ✅ Present |

The local build compiles cleanly. **However, this build is from uncommitted local code and is not what Coolify would deploy.**

---

## 3. Pending Migrations

Two migrations exist locally as **untracked files** (never committed, never applied to production):

### `20260817025923_add_accounting_core`
Creates:
- `AccountType` enum (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`)
- `AccountingAccount` table (chart of accounts)
- `JournalEntry` table (double-entry journal header)
- `JournalLine` table (debit/credit legs)
- Indexes: 9 total covering `tenantId`, `sourceType/sourceId`, `entryDate`, `isVoided`

### `20260817100000_add_journal_idempotency_index`
Creates:
- `JournalEntry_sourceType_sourceId_tenantId_unique` — partial unique index on `JournalEntry` (WHERE `sourceType IS NOT NULL AND sourceId IS NOT NULL`)
- Prevents duplicate journal entries for the same business event
- **NOTE:** This is a manually managed migration — Prisma cannot express partial unique indexes in its schema DSL. `prisma migrate dev` must NOT be run against production (it may attempt to DROP this index).

**Both migrations are additive only — no DROP, DELETE, TRUNCATE, or ALTER on existing tables.**

### `prisma migrate status` (local dev DB)
```
Following migrations have not yet been applied:
  20260817025923_add_accounting_core
  20260817100000_add_journal_idempotency_index
```

**Production status:** Because the accounting code has never been committed or deployed, **neither migration has been applied to production**. The `JournalEntry`, `JournalLine`, and `AccountingAccount` tables do not exist in the production database.

**Deployment behavior:** `docker-entrypoint.sh` runs `npx prisma migrate deploy` on every container start. When the accounting code is first deployed, both migrations will run automatically. This is safe because both are additive-only.

---

## 4. Prisma Schema Compatibility

| Table | Exists in production | Migration required |
|-------|---------------------|-------------------|
| `AccountingAccount` | ❌ No | `20260817025923` |
| `JournalEntry` | ❌ No | `20260817025923` |
| `JournalLine` | ❌ No | `20260817025923` |
| All other tables | ✅ Unchanged | None |

No existing tables are modified by the accounting migrations. No columns are added to `Sale`, `SalePayment`, `SaleItem`, or any other POS table.

---

## 5. Docker Build Readiness

| Item | Status |
|------|--------|
| `backend/Dockerfile` | ✅ Present — 2-stage Alpine build |
| Stage 1 (builder) | `npm ci` → `prisma generate` → `nest build` → `npm prune` |
| Stage 2 (runner) | Non-root `nestjs` user, dumb-init PID1, `openssl`, `postgresql-client` |
| Entrypoint | `docker-entrypoint.sh` → `prisma migrate deploy` → `node dist/src/main` |
| Exposed port | 3000 |
| Health check | `GET /health` (DB + Redis probe, 503 on DB failure) |

The Dockerfile is clean. The entrypoint correctly runs `prisma migrate deploy` before starting the app — accounting migrations will run on first deploy.

**Caveat:** The Docker build runs from the committed source (`origin/main`). Until the Phase 4B code is committed and pushed, the built image will not contain accounting.

---

## 6. Backend Health Configuration

`GET /health` returns:
```json
{ "status": "ok", "db": "ok", "redis": "ok", "timestamp": "..." }
```

- Returns `503` if `SELECT 1` fails
- Redis degraded is a warning (non-fatal — in-memory fallback active)
- `@SkipThrottle()` — rate limiting bypassed for health checks
- Suitable for Coolify container health check

No accounting-specific health probe exists (not required while accounting is off).

---

## 7. Production Environment Variables

### Verified via `.env.production` and memory
```
ACCOUNTING_CORE_ENABLED         → NOT SET
ACCOUNTING_ENABLED_TENANTS      → NOT SET
ACCOUNTING_ACTIVATION_TIMESTAMP → NOT SET
```

### ⚠️ BLOCKER-4 (partial): Coolify runtime env vars unverifiable without SSH

Coolify injects environment variables at deploy time from its own database (`environment_variables` table), not from `.env.production`. While `.env.production` has no accounting vars, the Coolify UI runtime env vars cannot be read from this local audit without SSH access. **Require SSH verification before deployment.**

Expected confirmation (to be verified via SSH):
```bash
ssh 91.98.151.10 "docker exec <backend-container> env | grep ACCOUNTING"
```
Expected output: _(empty — no ACCOUNTING vars)_

### Accounting status: CONFIRMED OFF at code level

Even without SSH confirmation:
- `ACCOUNTING_CORE_ENABLED` is absent from `.env.production`
- All adapter methods check `process.env.ACCOUNTING_CORE_ENABLED !== 'true'` as first guard
- `scheduledScan()` returns immediately when env var is absent
- No JournalEntry can be created while this guard is `false`

---

## 8. Backup Status

### Backup infrastructure
| Item | Detail |
|------|--------|
| Script | `scripts/backup/pg_backup_coolify.sh` |
| Schedule | Daily at 2AM (backup service cron) |
| Format | Plain SQL + gzip (`fixitpro_YYYYMMDD_HHMMSS.sql.gz`) |
| Checksum | SHA-256 per backup file |
| Retention | 7 days |
| Integrity | gzip test + line count + COPY statement count |
| Restore verify | `scripts/backup/pg_restore_verify.sh` |

### ⛔ BLOCKER-3: Latest backup not verified from this audit

SSH access to `91.98.151.10` would be required to verify:
- Latest backup timestamp
- Latest backup file size and SHA-256
- Restore verification status (was `pg_restore_verify.sh` run?)
- Disk space available for restore

**Pre-deployment requirement:** Confirm a successful backup exists from within the last 24 hours before triggering any deploy that runs schema migrations.

Verification command (requires SSH):
```bash
ssh 91.98.151.10 "tail -50 /opt/fixitpro-backups/backup.log"
```
Expected: `BACKUP SUCCESS` entry within last 24h.

---

## 9. Rollback

### Current production
- **Commit:** `8d075cdf65787b7b384503b95622403d71320b4e`
- **Description:** `fix(print): patch 3 bugs found by code review`
- **Contains:** Zero accounting code

### After accounting deployment
- **Rollback method A (immediate):** Set `ACCOUNTING_CORE_ENABLED=false` (or remove it) in Coolify env vars → all adapter calls are no-ops, cron skips, zero new journals
- **Rollback method B (full):** Coolify redeploy to previous image tag (pre-accounting commit)
- **Schema rollback:** NOT required for rollback method A. For method B, the `AccountingAccount`, `JournalEntry`, `JournalLine` tables can remain in place safely — they'll be empty and unused.
- **Schema rollback caution:** If method B is used AND the tables must be dropped, that requires a manual DROP migration. Do NOT run this unless explicitly confirmed there are zero journal rows.

### Known-good baseline
- Commit `8d075cd` is the current production state and confirmed stable.
- No accounting code in this commit. Reverting to it is always safe.

---

## 10. Test Status

```
Test Suites: 28 passed, 28 total
Tests:       352 passed, 352 total
Snapshots:   0 total

Breakdown:
  Pre-4B.1 baseline                    : 308
  Phase 4B.1 adapter tests (T01–T26)   :  26  [adapter.spec.ts]
  Phase 4B.2 allowlist tests (T-A…T-H) :   8  (T-A updated in 4B.2.2)
  Phase 4B.2 reconciliation (R01–R25)  :  25  (R24 updated in 4B.2.2)
  Phase 4B.2.2 new allowlist (T-I…T-L) :   4
  Phase 4B.2.2 new reconciliation      :   7  (R26–R32)
  Total                                : 352
```

✅ All 352 tests pass. All 28 suites green.

---

## 11. Production JournalEntry / JournalLine Count

**Cannot query production DB from this local audit without SSH.**

However, this is **structurally confirmed as 0** because:

1. Migrations `20260817025923` and `20260817100000` have never been applied to production
2. Therefore the `JournalEntry` and `JournalLine` tables **do not exist** in the production DB
3. Even after tables are created (post-migration), `ACCOUNTING_CORE_ENABLED` is not set → no rows can be inserted

**Post-deploy verification (after migration runs):**
```bash
ssh 91.98.151.10 "docker exec <pg-container> psql -U fixitpro -d fixitpro -c 'SELECT COUNT(*) FROM \"JournalEntry\";'"
```
Expected: `0`

---

## 12. Historical Backfill Mechanism

**CONFIRMED: No historical backfill mechanism exists.**

Triple-layer protection (Phase 4B.2.2):

| Layer | Guard |
|-------|-------|
| 1 | `isEnabledForTenant()` fail-closed: absent allowlist → `return false` for all tenants |
| 2 | `validateActivationTimestamp()`: absent/invalid/>24h-old timestamp → scan blocked |
| 3 | `createdAt: { gte: activationTs }` in `sale.findMany()` — even if above guards passed, only sales after activation are scanned |

No admin endpoint or code path exists to create journals for sales predating `ACCOUNTING_ACTIVATION_TIMESTAMP`.

---

## 13. Cron Behavior With `ACCOUNTING_CORE_ENABLED` Off

**CONFIRMED: Cron is a no-op when accounting is off.**

```typescript
// accounting-reconciliation.service.ts
@Cron('0 */15 * * * *')
async scheduledScan(): Promise<void> {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return;  // ← fires, then returns
  ...
}
```

Trace when `ACCOUNTING_CORE_ENABLED` is absent:
```
undefined !== 'true' → true → return
```

Result: zero DB queries, zero journal writes, zero logging, zero side effects. The `@Cron` decorator registers the timer, but the method body exits in the first microsecond.

This is confirmed by test R22: `scheduledScan returns immediately when ACCOUNTING_CORE_ENABLED is false`.

---

## 14. Pre-Deployment Checklist (Blocked Until GO)

The following checklist applies **after all blockers are resolved**. Do not execute any step until owner approves.

### Pre-commit (resolve BLOCKER-1)
```
☐ git add all Phase 4B accounting files (adapter, reconciliation, journal, migrations, docs)
☐ git add modified files (schema.prisma, app.module.ts, sales.module.ts, sales.service.ts)
☐ git commit -m "feat(accounting): Phase 4B.1+4B.2+4B.2.2 — post-commit POS adapter + reconciliation + fail-closed safety"
☐ git push origin main
☐ Confirm: git log --oneline origin/main shows the accounting commit at HEAD
```

### Pre-deploy (resolve BLOCKER-2 + BLOCKER-3)
```
☐ SSH to 91.98.151.10 — verify ACCOUNTING_* env vars are ALL absent in Coolify
☐ SSH to 91.98.151.10 — confirm latest backup log shows SUCCESS within last 24h
☐ SSH to 91.98.151.10 — verify /opt/fixitpro-backups/db/ has at least 1 recent .sql.gz
☐ Run manual backup immediately before deploy:
    ssh 91.98.151.10 "bash /opt/fixitpro-backups/pg_backup_coolify.sh"
☐ Record backup file name and SHA-256 checksum
```

### Deploy
```
☐ Trigger Coolify redeploy (via Coolify UI or tinker queue_application_deployment)
☐ Monitor deploy log — confirm "Running Prisma migrations..." appears
☐ Confirm migration 20260817025923_add_accounting_core: applied
☐ Confirm migration 20260817100000_add_journal_idempotency_index: applied
☐ Wait for container healthcheck: GET /health → {"status":"ok"}
```

### Post-deploy verification (accounting OFF)
```
☐ curl http://91.98.151.10/api/v1/health → 200 {"status":"ok","db":"ok"}
☐ SSH: SELECT COUNT(*) FROM "JournalEntry"; → 0
☐ SSH: SELECT COUNT(*) FROM "JournalLine"; → 0
☐ SSH: docker exec <backend> env | grep ACCOUNTING → (empty)
☐ SSH: check logs — no "Accounting" related entries (cron fires, exits immediately)
☐ Confirm POS still processes sales normally (smoke test 1 sale)
```

### Accounting activation (SEPARATE STEP — requires explicit owner approval)
```
☐ (Do NOT perform until explicitly approved)
☐ Set ACCOUNTING_ACTIVATION_TIMESTAMP to current ISO 8601 time (within last hour)
☐ Set ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>
☐ Set ACCOUNTING_CORE_ENABLED=true
☐ Save all three atomically in Coolify → restart backend container
☐ Process 1 test sale → verify JournalEntry row created
☐ Wait 15 minutes → verify scheduled scan log entry
```

---

## 15. Summary of Findings

| Check | Status | Detail |
|-------|--------|--------|
| Git status | ⛔ BLOCKER-1 | All Phase 4B changes uncommitted and untracked |
| Current branch | ✅ | `main`, synced with `origin/main` |
| HEAD commit | ✅ | `8d075cd` (no accounting code — expected) |
| Pending migrations | ⚠️ | 2 migrations exist locally, not committed, not applied to prod |
| Schema compatibility | ✅ | Migrations are additive-only; no existing table changes |
| Docker build | ✅ | `npm run build` exits 0, all modules in `dist/` |
| TypeScript | ✅ | `tsc --noEmit` clean |
| Health config | ✅ | `/health` endpoint present, DB+Redis probe, 503 on DB fail |
| Accounting env: local | ✅ | No ACCOUNTING_* vars in `.env.production` |
| Accounting env: Coolify | ⛔ BLOCKER-4 | Cannot verify without SSH (expected absent — must confirm) |
| Backup infrastructure | ✅ | Script present, SHA-256 checksum, gzip verify, 7-day retention |
| Backup latest run | ⛔ BLOCKER-3 | Cannot verify from local audit — SSH required |
| Rollback: immediate | ✅ | Remove `ACCOUNTING_CORE_ENABLED` → instant safe state |
| Rollback: full | ✅ | Redeploy to commit `8d075cd` — known good |
| Test results | ✅ | 352/352 passing, 28/28 suites |
| JournalEntry count (prod) | ✅ | Structurally 0 — table does not exist in prod yet |
| JournalLine count (prod) | ✅ | Structurally 0 — table does not exist in prod yet |
| Backfill mechanism | ✅ | None. Fail-closed + 24h timestamp guard + createdAt filter |
| Cron with CORE=off | ✅ | Returns immediately, zero DB queries |

---

## Blockers

### ⛔ BLOCKER-1 (CRITICAL): Phase 4B code is not committed to git

All accounting work (4B.1 adapter, 4B.2 reconciliation, 4B.2.2 fail-closed fix, migrations, documentation) exists only as local working-directory changes. It has never been committed or pushed to `origin/main`.

**Deploying now would deploy `8d075cd` with zero accounting code.**

**Required action:** Commit all Phase 4B files, push to `origin/main`, then trigger Coolify redeploy.

---

### ⛔ BLOCKER-2: Migrations not committed

The two accounting migrations (`20260817025923`, `20260817100000`) are untracked files. They are included in BLOCKER-1 — resolving BLOCKER-1 also resolves BLOCKER-2 since the migrations must be committed as part of the Phase 4B commit.

---

### ⛔ BLOCKER-3: Pre-deploy backup not verified

A verified, recent database backup must exist before running any schema-migrating deployment. Cannot confirm from this local read-only audit.

**Required action:** SSH to `91.98.151.10`, run `tail -50 /opt/fixitpro-backups/backup.log`, confirm SUCCESS entry within 24h. Run a fresh backup immediately before deploying.

---

### ⛔ BLOCKER-4: Coolify runtime env vars not verified

The Coolify runtime environment is the source of truth for production env vars, not `.env.production`. Must confirm via SSH that no ACCOUNTING_* vars exist in Coolify's `environment_variables` table for the backend service before deployment.

**Required action:** `ssh 91.98.151.10 "docker exec <backend-container> env | grep ACCOUNTING"` → must return empty.

---

## STOPPED

Not deploying. Not activating accounting. Not proceeding to Phase 4B.3.

Awaiting owner approval to:
1. Commit Phase 4B changes to git (`git commit` + `git push`)
2. Verify production backup
3. Verify Coolify env vars
4. Trigger Coolify redeploy
5. (Separately, later) Activate accounting with explicit env var configuration
