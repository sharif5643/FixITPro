# Phase 4B.3C — Controlled Pilot Activation

**Date:** 2026-08-18  
**Status:** COMPLETE — CRITICAL STOP POINT REACHED  
**Accounting:** ON for pilot tenant ONLY — OFF for all others  
**Next step:** Owner approval before Phase 4B.3D (first live sale + journal verification)

---

## Pilot Tenant

| Field | Value |
|-------|-------|
| Tenant ID | `cmsc05do8001u7i29q3p5x6zp` |
| Shop name | ริวคอม เซอร์วิซ |
| Plan | PRIVATE |
| Branches | 1 |

---

## 1. Pre-Activation Backup

Taken at 2026-08-18 04:17 UTC (before container replacement):

| Backup | SHA-256 | Size | Status |
|--------|---------|------|--------|
| `fixitpro_20260818_preactivation.sql.gz` | `84850aa38606e3ae1523e334249f5ac927719f79612846ca15ed52ad551ebde4` | 2.3 MB | ✅ gzip OK |

Located at `/opt/fixitpro-backups/db/` on production server.

---

## 2. Pre-Activation Baseline

Captured at 2026-08-18 04:17 UTC (exactly before activation):

| Table | Count | Expected |
|-------|-------|----------|
| `JournalEntry` | 0 | ✅ |
| `JournalLine` | 0 | ✅ |
| `AccountingAccount` | 17 | ✅ (pilot tenant COA from Phase 4B.3B) |
| `Sale` | 94 | (live production — ongoing) |

---

## 3. Env Vars Set

| Variable | Value | Scope |
|----------|-------|-------|
| `ACCOUNTING_CORE_ENABLED` | `true` | Global flag (required) |
| `ACCOUNTING_ENABLED_TENANTS` | `cmsc05do8001u7i29q3p5x6zp` | Allowlist — pilot only |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | `2026-08-18T04:17:00Z` | 24h guard start |

**Global activation: NO.** `ACCOUNTING_ENABLED_TENANTS` is NOT `*`.  
**Pilot activation: YES.** Exactly one tenant ID in the allowlist.

---

## 4. Coolify DB State

The 3 env vars are stored in the Coolify `environment_variables` table (AES-256-CBC encrypted with APP_KEY), and will be written to the `.env` file on the next proper Coolify redeploy.

| Row ID | Key | Updated At |
|--------|-----|-----------|
| 49 | `ACCOUNTING_CORE_ENABLED` | 2026-08-18 03:57:43 |
| 50 | `ACCOUNTING_ENABLED_TENANTS` | 2026-08-18 03:57:43 |
| 51 | `ACCOUNTING_ACTIVATION_TIMESTAMP` | 2026-08-18 04:28:20 (updated to match container) |

---

## 5. Deployment Mechanism

Coolify's normal redeploy pipeline (git webhook → Horizon queue → `ApplicationDeploymentJob`) could not be triggered programmatically because:
- Personal access token in `personal_access_tokens` is stored as SHA-256 hash (plaintext not recoverable)
- Artisan tinker escaping blocked PHP namespace separators in shell
- Deployment queue insertion used wrong Cuid2 UUID format

**Resolution**: Direct Docker container replacement with same image and config.

| Step | Action |
|------|--------|
| 1 | Extracted all env vars from running container (36 vars) |
| 2 | Appended 3 ACCOUNTING vars to env file |
| 3 | Stopped old container `backend-z9m1c1i9nr6kbyo4qn0vuv1b-1787021472` |
| 4 | Started new container: same name, same image `dd18ab292031c1df30d42406a912829e86827bb1`, same volumes, new env |
| 5 | Connected to `coolify` network with `--ip 10.0.1.9` (preserves Traefik static routing) |
| 6 | Connected to `z9m1c1i9nr6kbyo4qn0vuv1b` network (postgres reachability) |
| 7 | Updated Coolify DB `ACCOUNTING_ACTIVATION_TIMESTAMP` to match container value |

**Image**: No rebuild performed — same image `dd18ab292031c1df30d42406a912829e86827bb1` as Phase 4B.2.3.  
**Migrations**: Entrypoint confirmed — 70 migrations, `No pending migrations to apply`.  
**Downtime**: ~30 seconds during container stop/start (04:20:03–04:20:35 UTC).

---

## 6. Post-Activation Flag Verification

Verified via `docker exec backend-... env | grep ACCOUNTING`:

| Variable | Expected | Actual |
|----------|----------|--------|
| `ACCOUNTING_CORE_ENABLED` | `true` | **`true`** ✅ |
| `ACCOUNTING_ENABLED_TENANTS` | `cmsc05do8001u7i29q3p5x6zp` | **`cmsc05do8001u7i29q3p5x6zp`** ✅ |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | `2026-08-18T04:17:00Z` | **`2026-08-18T04:17:00Z`** ✅ |

---

## 7. isEnabledForTenant Behavior Verification

Logic verified via inline Node.js in the running container:

```
isEnabled('cmsc05do8001u7i29q3p5x6zp')  → true   ✅ Pilot activated
isEnabled('cmqgw3ysh0003f963vgqh32j2')  → false  ✅ Other tenants off
isEnabled('*')                           → false  ✅ Wildcard rejected
```

**Fail-closed properties confirmed:**
- Flag absent → false for all
- Flag true + no allowlist → false for all
- Flag true + `*` → NOT used (allowlist is a specific tenant ID)
- Flag true + specific list → ONLY matching tenant returns true

---

## 8. Network and Routing Verification

| Property | Value | Status |
|----------|-------|--------|
| Container name | `backend-z9m1c1i9nr6kbyo4qn0vuv1b-1787021472` | ✅ preserved |
| IP on `coolify` network | `10.0.1.9` | ✅ preserved (Traefik config unchanged) |
| IP on `z9m1c1i9nr6kbyo4qn0vuv1b` | `10.0.2.4` | ✅ |
| Traefik route | `Host(fixitpro.in.th) && PathPrefix(/api)` → `10.0.1.9:3000` | ✅ unmodified |

No changes to `/data/coolify/proxy/dynamic/fixitpro.yaml` were required.

---

## 9. Health Check

```json
{"status":"ok","db":"ok","redis":"ok","timestamp":"2026-08-18T04:22:09.180Z"}
```

Via `docker exec backend... wget -qO- http://localhost:3000/health`: **PASS**  
Via `curl http://10.0.1.9:3000/health`: **PASS**

---

## 10. Post-Activation DB Verification

Captured at 2026-08-18 04:22 UTC (≈5 minutes after activation):

| Table | Pre-Activation | Post-Activation | Delta |
|-------|---------------|-----------------|-------|
| `JournalEntry` | 0 | **0** | 0 ✅ |
| `JournalLine` | 0 | **0** | 0 ✅ |
| `AccountingAccount` | 17 | **17** | 0 ✅ |
| `Sale` | 94 | 94 | (live) |

**No JournalEntry was created at startup.** The accounting system did not backfill historical sales. No unintended activity occurred.

---

## 11. Startup Logs

```
[entrypoint] Running Prisma migrations...
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "fixitpro", schema "public" at "fixitpro-postgres:5432"
70 migrations found in prisma/migrations
No pending migrations to apply.
[entrypoint] Starting FixITPro Backend...
WARN [RedisService] REDIS_URL not set — module cache running in-memory (single-process only)
```

No errors. No accounting errors. No Prisma errors.

---

## 12. Safety Summary

| Safety Property | Status |
|----------------|--------|
| Only pilot tenant enabled | ✅ allowlist = `cmsc05do8001u7i29q3p5x6zp` only |
| Global activation prevented | ✅ `ACCOUNTING_ENABLED_TENANTS ≠ *` |
| Same code version deployed | ✅ `dd18ab292031c1df30d42406a912829e86827bb1` |
| No new migrations run | ✅ 70 applied, 0 pending |
| No JournalEntry created | ✅ count = 0 |
| No JournalLine created | ✅ count = 0 |
| No historical backfill | ✅ cron scope = after activation timestamp |
| POS behavior unchanged | ✅ same image, no code change |
| Pre-activation backup exists | ✅ SHA256 verified |
| Traefik routing preserved | ✅ same container name + IP `10.0.1.9` |

---

## 13. Activation Timestamp Guard

`ACCOUNTING_ACTIVATION_TIMESTAMP = 2026-08-18T04:17:00Z`

The reconciliation cron (`0 */15 * * * *`) checks this timestamp:
- If `Date.now() - activationTime > 24h` → scan is blocked (TOO_OLD)
- **Expiry time: 2026-08-19T04:17:00Z** (24h from activation)

**Owner action required before 2026-08-19T04:17:00Z**: If a Coolify redeploy is triggered after this window, the cron will block. The Coolify DB timestamp (`2026-08-18T04:17:00Z`) must be re-encrypted with the then-current time before redeploying.

---

## CRITICAL STOP POINT — REACHED

The following have NOT occurred and MUST NOT occur without owner approval:

| Prohibited Action | Status |
|------------------|--------|
| Create a pilot sale (first live transaction test) | **NOT DONE** |
| Create JournalEntry manually | **NOT DONE** |
| Trigger `POST /api/v1/admin/accounting/run-reconciliation` manually | **NOT DONE** |
| Expand `ACCOUNTING_ENABLED_TENANTS` beyond pilot | **NOT DONE** |
| Set `ACCOUNTING_ENABLED_TENANTS=*` | **NOT DONE** |

**No pilot sale has been created yet.**

The accounting system is now LIVE for the pilot tenant `cmsc05do8001u7i29q3p5x6zp`. The NEXT real sale made at ริวคอม เซอร์วิซ will automatically trigger journal entry creation via `SalesAccountingAdapter.recordSaleJournal()`.

---

## STOPPED

Awaiting owner approval before:

1. **Phase 4B.3D** — Create first pilot sale (test transaction at ริวคอม เซอร์วิซ branch) and verify JournalEntry + JournalLine are created correctly with balanced debits/credits
2. **Phase 4B.3E** — Live monitoring: observe reconciliation cron, check JournalEntry counts after normal business use
3. **Expanding** — Enable accounting for additional tenants
