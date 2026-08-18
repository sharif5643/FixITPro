# Production Pre-Migration Report — Phase 2A

> **Date:** 2026-08-17  
> **Migration pending:** `20260817025923_add_accounting_core` (#69)  
> **Inspector:** READ-ONLY pre-flight check via SSH + psql  
> **Server:** 91.98.151.10 (Coolify VPS)  
> **Status:** ⛔ NO-GO — backup must be created before migration

---

## FINAL GO / NO-GO

| Check | Result | Detail |
|-------|--------|--------|
| **BACKUP** | ❌ FAIL | No backup exists (see Section 3) |
| **BACKUP RESTORE** | ⚠️ UNAVAILABLE | No backup to restore — skipped per spec |
| **PRODUCTION DATABASE IDENTIFICATION** | ✅ PASS | fixitpro on PostgreSQL 15.18, confirmed live |
| **MIGRATION #69 NOT APPLIED** | ✅ PASS | 0 rows in `_prisma_migrations` for this migration |
| **MIGRATION SQL SAFETY** | ✅ PASS | Additive-only — no DROP/DELETE/TRUNCATE/ALTER existing |
| **SCHEMA DRIFT** | ℹ️ OUT OF SCOPE | 2 pre-existing drifts confirmed, not in migration #69 |
| **ACCOUNTING TABLES ABSENT** | ✅ PASS | AccountingAccount, JournalEntry, JournalLine: do not exist |
| **DATABASE HEALTH** | ✅ PASS | 18MB, 11/100 connections, 0 locks, 59GB free disk |

### OVERALL: ⛔ NO-GO

**Blocker:** No production backup exists. Migration must NOT run until a verified backup is in place.

---

## 1. Production Database Identification

| Parameter | Value |
|-----------|-------|
| Host | Inside Docker on `91.98.151.10` |
| Container | `postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754` |
| Database name | `fixitpro` |
| PostgreSQL version | 15.18 (postgres:15-alpine) |
| User | `fixitpro` (application user, non-superuser) |
| Password | [masked] |
| SSL | Not applicable — internal Docker `app_network` only; DB is not exposed to host or internet |
| Network | `app_network` (bridge) — DB not reachable externally |
| DB size | 18 MB |
| Status | healthy (Docker healthcheck: `pg_isready`) |

**Confirmation:** This is the live production database. Verified by checking real data rows (Tenant=9, Branch=13, Product=253, etc.) and Prisma migration history matching expected schema state.

---

## 2. Migration Status

| Item | Value |
|------|-------|
| Total rows in `_prisma_migrations` | 69 |
| Successfully applied | 68 |
| Rolled back | 1 (`20260620000000_add_performance_indexes`, rolled back 2026-06-20) |
| Latest applied migration | `20260816000000_add_daily_close` (2026-08-15) |
| Migration #69 `20260817025923_add_accounting_core` | **NOT PRESENT** — 0 rows |

### Migration #69 Status: NOT APPLIED ✅

Explicit verification:
```sql
SELECT COUNT(*) FROM "_prisma_migrations"
WHERE migration_name = '20260817025923_add_accounting_core';
-- Result: 0
```

### Note: Rolled-Back Migration

`20260620000000_add_performance_indexes` has `rolled_back_at = 2026-06-20 04:00:32+00` and no `finished_at`. This migration failed/was rolled back in June 2026. It is **outside the scope of Phase 2** — migration #69 does not depend on it and will apply correctly regardless. This should be investigated separately.

---

## 3. Production Backup Status

### Backup Systems Check

| System | Status | Detail |
|--------|--------|--------|
| Coolify scheduled DB backup | ❌ Not configured | `scheduled_database_backups` table has 0 rows |
| S3 / Offsite backup | ❌ Disabled | `BACKUP_S3_ENABLED=false` in backend container env |
| Application pg_dump | ❌ None | `fixitpro_backups` volume exists but is empty |
| Host cron backup | ❌ None | Only `/2 * * * * fixitpro-update-proxy.sh` cron exists (proxy script, not backup) |
| Manual pg_dump on server | ❌ None | No dump files found anywhere |

### ⚠️ CRITICAL: NO PRODUCTION BACKUP EXISTS

**Latest backup timestamp:** None  
**Backup type:** None  
**Backup location:** N/A  
**Retention:** N/A  
**Backup status:** ❌ FAIL

The production database has **no backup of any kind**. Running any migration without a backup violates the safety protocol.

### Required Action Before Migration

A backup must be created and verified before migration #69 can be applied. Recommended approach:

```bash
# SSH to production server
ssh root@91.98.151.10

# Create pg_dump backup
docker exec postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754 \
  pg_dump -U fixitpro -d fixitpro --no-password \
  > /root/fixitpro_backup_before_phase2_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file size and line count
wc -l /root/fixitpro_backup_before_phase2_*.sql
ls -lh /root/fixitpro_backup_before_phase2_*.sql

# (Optional but recommended) Copy to local machine
scp root@91.98.151.10:/root/fixitpro_backup_before_phase2_*.sql ./
```

---

## 4. Backup Restore Verification

**Status: ⚠️ UNAVAILABLE**

No backup exists to restore. Per specification: "ถ้าไม่มีพื้นที่/สิทธิ์สำหรับ restore: STOP และรายงาน BACKUP RESTORE VERIFICATION UNAVAILABLE"

A restore verification test should be performed after a backup is created.

---

## 5. Production Row Count Baseline

Captured 2026-08-17. Full details in [PRODUCTION_PRE_MIGRATION_BASELINE.md](./PRODUCTION_PRE_MIGRATION_BASELINE.md).

| Table | Row Count |
|-------|-----------|
| Tenant | 9 |
| Branch | 13 |
| Customer | 28 |
| Sale | 84 |
| SaleItem | 166 |
| Repair | 23 |
| RepairAdditionalPayment | 1 |
| RepairPaymentReversal | 0 |
| Expense | 0 |
| Product | 253 |
| StockMovement | 243 |
| PurchaseOrder | 2 |
| Supplier | 2 |
| SupplierPayment | 1 |
| CashDrawer | 4 |
| CashDrawerSession | 3 |
| CashDrawerTransaction | 110 |
| DailyClose | 0 |

---

## 6. Migration SQL Final Check

**File:** `backend/prisma/migrations/20260817025923_add_accounting_core/migration.sql`

**SHA-256:** `4b848ea1a5d14765f545a0e2f25f557975bff61c00348c6094fd97f4d50d7d27`

### SQL Statement Audit

| Statement | Count | Allowed |
|-----------|-------|---------|
| `CREATE TYPE "AccountType"` | 1 | ✅ |
| `CREATE TABLE "AccountingAccount"` | 1 | ✅ |
| `CREATE TABLE "JournalEntry"` | 1 | ✅ |
| `CREATE TABLE "JournalLine"` | 1 | ✅ |
| `CREATE INDEX` | 9 | ✅ |
| `CREATE UNIQUE INDEX` | 2 | ✅ |
| `ALTER TABLE "JournalLine" ADD CONSTRAINT ... FOREIGN KEY` | 2 | ✅ (new table only) |
| `DROP` | 0 | ✅ None |
| `DELETE` | 0 | ✅ None |
| `TRUNCATE` | 0 | ✅ None |
| `UPDATE` | 0 | ✅ None |
| `ALTER` existing business table | 0 | ✅ None |

**Result: PASS — SQL is 100% additive. Zero changes to existing tables or data.**

---

## 7. Schema Drift Check

| Column | Production Type | schema.prisma Expects | Drift |
|--------|----------------|----------------------|-------|
| `SalePayment.paymentMethod` | `text` | `PaymentMethod` enum | ✅ Confirmed — TEXT on production |
| `TenantAddon.id` | `text` with default `gen_random_uuid()` | `@id @default(cuid())` | ✅ Confirmed — gen_random_uuid() on production |

**Status: OUT OF SCOPE**

Both drifts are pre-existing, confirmed on both test DB and production DB. They are **not caused by Phase 2** and are **not included in migration #69**. These drifts require a separate targeted investigation and a data-safe fix migration. They do not block migration #69.

**Important:** When migration #69 is applied via `prisma migrate deploy`, Prisma does NOT re-detect drift — it applies only the specific SQL in the migration file. These drifts will remain until explicitly fixed.

---

## 8. Accounting Table Check

| Object | Expected | Found | Status |
|--------|----------|-------|--------|
| Table `AccountingAccount` | NOT EXISTS | NOT EXISTS | ✅ |
| Table `JournalEntry` | NOT EXISTS | NOT EXISTS | ✅ |
| Table `JournalLine` | NOT EXISTS | NOT EXISTS | ✅ |
| Enum `AccountType` | NOT EXISTS | NOT EXISTS | ✅ |

All 4 objects are absent from production. Migration #69 will create them.

---

## 9. Database Health

| Metric | Value | Status |
|--------|-------|--------|
| DB size | 18 MB | ✅ Small |
| Total tablespace size | 39 MB | ✅ Normal |
| Disk total | 75 GB | ✅ |
| Disk used | 14 GB (19%) | ✅ |
| Disk free | 59 GB | ✅ Ample |
| Active connections | 11 / 100 | ✅ (11%) |
| Long-running queries (>30s) | 0 | ✅ |
| Blocked locks | 0 | ✅ |
| WAL level | `replica` | ✅ Standard |
| Replication standbys | 0 | ✅ Standalone |
| Container status | healthy (Up 10 hours) | ✅ |

**No critical health issues found.**

### Note: Rolled-Back Migration

`20260620000000_add_performance_indexes` was rolled back on 2026-06-20. This means performance indexes from that migration were NOT applied to production. This is an existing gap, not caused by Phase 2. The indexes should be re-applied separately (out of scope).

---

## 10. Production Risk Assessment

| Risk | Likelihood | Impact | Notes |
|------|------------|--------|-------|
| Migration downtime | Very Low | Low | Additive tables only; no locks on existing tables; migration takes <1 second on 18MB DB |
| Lock contention | Very Low | Low | `CREATE TABLE` and `CREATE INDEX` on new empty tables don't lock existing tables |
| Disk exhaustion | Very Low | None | 3 empty tables add <100KB; 59GB free |
| Data loss from migration | None | None | Zero writes to existing tables |
| Backup unavailability | **HIGH** | **HIGH** | No backup exists — if anything goes wrong, recovery is difficult |
| Schema drift side effect | Very Low | Low | Drift is already present, `prisma migrate deploy` ignores it |
| Rollback complexity | Low | Low | Tables are empty; rollback is 3 DROP TABLE statements + delete migration row |

**Primary risk: No backup.** All other risks are low due to the additive-only nature of migration #69.

---

## 11. Recommended Actions Before Migration

In priority order:

1. **[REQUIRED — BLOCKS MIGRATION] Create production backup:**
   ```bash
   ssh root@91.98.151.10
   docker exec postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754 \
     pg_dump -U fixitpro -d fixitpro \
     > /root/fixitpro_backup_before_phase2_$(date +%Y%m%d_%H%M%S).sql
   ls -lh /root/fixitpro_backup_before_phase2_*.sql
   ```
   Then copy to local for safekeeping.

2. **[RECOMMENDED] Set up Coolify automated backup:**
   Configure in Coolify UI → Databases → Scheduled Backups to prevent this situation recurring.

3. **[OPTIONAL] Investigate rolled-back migration:**
   `20260620000000_add_performance_indexes` was rolled back June 2026. Review whether its performance indexes should be re-applied.

4. **[OUT OF SCOPE — SEPARATE TASK] Fix schema drift:**
   `SalePayment.paymentMethod` and `TenantAddon.id` need separate data-safe migration.

---

## 12. Production Migration Procedure (When GO is Approved)

**DO NOT EXECUTE until all of the following are true:**
- ✅ Backup created and verified
- ✅ Owner explicitly approves Phase 2B

```bash
# Step 1: Verify backup exists
ssh root@91.98.151.10 "ls -lh /root/fixitpro_backup*.sql"

# Step 2: Verify migration #69 SQL one final time (compare checksum)
# SHA-256 must match: 4b848ea1a5d14765f545a0e2f25f557975bff61c00348c6094fd97f4d50d7d27

# Step 3: Apply migration
ssh root@91.98.151.10
docker exec <backend-container> npx prisma migrate deploy
# Expected: "Applying migration 20260817025923_add_accounting_core"

# Step 4: Verify
docker exec postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754 psql -U fixitpro -d fixitpro -c "
SELECT COUNT(*) FROM \"AccountingAccount\";
SELECT COUNT(*) FROM \"JournalEntry\";
SELECT COUNT(*) FROM \"JournalLine\";
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';
"
# Expected: 0, 0, 0, 65

# Step 5: Verify baseline row counts unchanged (see PRODUCTION_PRE_MIGRATION_BASELINE.md)

# Step 6: Monitor application logs for 15 minutes
docker logs <backend-container> --follow --since 1m
```

---

## 13. Phase 2A Checklist

```
[✅] SSH connectivity to production server verified
[✅] Production DB identified: fixitpro on PostgreSQL 15.18
[✅] Migration #69: NOT APPLIED (confirmed by 0 rows in _prisma_migrations)
[❌] Backup: NONE EXISTS (blocker)
[⚠️] Backup restore: UNAVAILABLE (no backup)
[✅] Row count baseline captured (18 business tables)
[✅] Migration SQL audited: additive-only, SHA-256 verified
[✅] Schema drift checked: 2 pre-existing drifts, OUT OF SCOPE
[✅] Accounting tables: absent from production
[✅] DB health: 18MB, 0 locks, 0 slow queries, 59GB free disk
[❌] OVERALL: NO-GO — create backup first
```

---

*Phase 2A pre-flight completed 2026-08-17. Awaiting backup creation before Phase 2B (production migration).*
