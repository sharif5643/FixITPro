# Database Restore — FixITPro Production

> **CRITICAL:** Never restore onto the production database directly.  
> Always restore to a temporary database first and verify.  
> Only restore to production in a declared disaster recovery event.

---

## Quick Reference

```bash
# Verify a backup file (without restoring to production)
bash /opt/fixitpro-backups/pg_restore_verify.sh \
  /opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz

# List available backups
ls -lht /opt/fixitpro-backups/db/*.sql.gz

# Production restore (EMERGENCY ONLY — see Section 4)
# STOP: Read all of Section 4 before running anything
```

---

## 1. Finding a Backup

```bash
ssh root@91.98.151.10

# List all available backups (newest first)
ls -lht /opt/fixitpro-backups/db/*.sql.gz

# Check integrity of a specific backup
gzip -t /opt/fixitpro-backups/db/fixitpro_20260817_033319.sql.gz && echo "OK"

# Verify SHA-256 checksum
sha256sum -c /opt/fixitpro-backups/db/fixitpro_20260817_033319.sql.gz.sha256
```

---

## 2. Restore to Temporary Database (Verification)

**Use this to verify any backup is restorable. Safe to run anytime — does not touch production.**

```bash
ssh root@91.98.151.10

# Run restore verification
bash /opt/fixitpro-backups/pg_restore_verify.sh \
  /opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz
```

The script:
1. Verifies gzip integrity and SHA-256 checksum
2. Creates `fixitpro_backup_verify` (temporary database)
3. Restores the backup
4. Verifies table count, migration count, and row counts
5. **Drops the temporary database automatically**

Expected output:
```
Tables    : 62 (expected: 62)
Migrations: 68 (expected: 68)
```

Row counts must match `docs/accounting/PRODUCTION_PRE_MIGRATION_BASELINE.md`.

---

## 3. Manual Restore to Temporary Database

If the script is unavailable, do this manually:

```bash
CONTAINER="postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754"
BACKUP="/opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz"

# Step 1: Create verify database
docker exec $CONTAINER psql -U fixitpro -d postgres -c \
  "CREATE DATABASE fixitpro_backup_verify OWNER fixitpro;"

# Step 2: Restore
zcat "$BACKUP" | docker exec -i $CONTAINER psql -U fixitpro -d fixitpro_backup_verify -v ON_ERROR_STOP=0

# Step 3: Verify
docker exec $CONTAINER psql -U fixitpro -d fixitpro_backup_verify -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# Step 4: Cleanup (ALWAYS drop the verify database when done)
docker exec $CONTAINER psql -U fixitpro -d postgres -c \
  "DROP DATABASE fixitpro_backup_verify;"
```

---

## 4. Emergency Production Restore

**Only execute in a declared disaster recovery event.**  
**Get explicit approval from the system owner before starting.**

### Pre-conditions checklist

```
[ ] Owner has declared disaster recovery event
[ ] All team members aware application is going down
[ ] Backup file verified (gzip + checksum)
[ ] Backup restored to verify DB and row counts confirmed
[ ] Production DB is confirmed corrupted/lost (not just slow)
[ ] No other recovery path available
```

### Procedure

```bash
ssh root@91.98.151.10

CONTAINER="postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754"
BACKUP="/opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz"

# Step 1: Stop application to prevent writes during restore
# (Do NOT stop the postgres container)
docker stop backend-z9m1c1i9nr6kbyo4qn0vuv1b-<id>
docker stop frontend-z9m1c1i9nr6kbyo4qn0vuv1b-<id>

# Step 2: Verify no active connections to production DB
docker exec $CONTAINER psql -U fixitpro -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='fixitpro';"

# Step 3: Drop existing (corrupted) production database
# WARNING: This deletes all data currently in the database
docker exec $CONTAINER psql -U fixitpro -d postgres -c \
  "DROP DATABASE fixitpro;"

# Step 4: Recreate database
docker exec $CONTAINER psql -U fixitpro -d postgres -c \
  "CREATE DATABASE fixitpro OWNER fixitpro;"

# Step 5: Restore from backup
zcat "$BACKUP" | docker exec -i $CONTAINER psql -U fixitpro -d fixitpro -v ON_ERROR_STOP=0

# Step 6: Verify restore
docker exec $CONTAINER psql -U fixitpro -d fixitpro -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
docker exec $CONTAINER psql -U fixitpro -d fixitpro -c \
  "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"

# Step 7: Restart application
docker start backend-z9m1c1i9nr6kbyo4qn0vuv1b-<id>
docker start frontend-z9m1c1i9nr6kbyo4qn0vuv1b-<id>

# Step 8: Verify application is responding
curl -s http://91.98.151.10/api/v1/health | head -5
```

### Data loss expectation

Restoring from backup means data created between the backup timestamp and the disaster event is **permanently lost**. With daily backups, maximum data loss is 24 hours.

---

## 5. Verifying a Restore

After any restore (verify or production), check row counts against the baseline:

```sql
SELECT 'Tenant', COUNT(*) FROM "Tenant"
UNION ALL SELECT 'Branch', COUNT(*) FROM "Branch"
UNION ALL SELECT 'Customer', COUNT(*) FROM "Customer"
UNION ALL SELECT 'Sale', COUNT(*) FROM "Sale"
UNION ALL SELECT 'Repair', COUNT(*) FROM "Repair"
UNION ALL SELECT 'Product', COUNT(*) FROM "Product"
UNION ALL SELECT 'CashDrawerTransaction', COUNT(*) FROM "CashDrawerTransaction";
```

Compare against: `docs/accounting/PRODUCTION_PRE_MIGRATION_BASELINE.md`

---

## 6. RTO / RPO

| Metric | Value | Assumption |
|--------|-------|------------|
| **RPO** (max data loss) | ~24 hours | Daily backup cadence |
| **RTO** (time to restore) | ~5–15 minutes | 18MB DB restores in <30 seconds; most time is diagnosis |

With hourly backups: RPO < 1 hour.

---

## 7. Troubleshooting

**"container not running":**
```bash
docker ps | grep postgres
# Restart if stopped:
docker start postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754
```

**"gzip integrity FAIL":**
- Backup file is corrupted during transfer or write
- Use another backup file from the same day or a prior day
- Check disk full: `df -h /`

**"pg_dump: error: connection failed":**
- Container is healthy but PG is not accepting connections
- Check: `docker exec $CONTAINER pg_isready -U fixitpro`

**Restore produces fewer rows than baseline:**
- Backup is from before some data was created
- Use a newer backup, or accept the data loss if no newer backup exists
