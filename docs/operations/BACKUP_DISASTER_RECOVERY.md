# Backup & Disaster Recovery — FixITPro

> **Last updated:** 2026-08-17  
> **Owner:** FixITPro Owner  
> **Status:** Local backup infrastructure in place; off-site backup pending

---

## Overview

| Item | Value |
|------|-------|
| Database | PostgreSQL 15.18, `fixitpro` on 91.98.151.10 |
| DB size (2026-08-17) | 18 MB |
| Backup type | Plain SQL + gzip (pg_dump) |
| Backup location | `/opt/fixitpro-backups/db/` (local VPS, root-only) |
| Retention | 7 daily backups |
| Off-site backup | Not yet configured |
| **RPO (max data loss)** | ~24 hours (daily backup) |
| **RTO (restore time)** | ~5–15 minutes |

---

## 1. Backup Infrastructure

### 1.1 Current State

| Component | Status |
|-----------|--------|
| Local pg_dump backup | ✅ Active (manual trigger, cron not yet scheduled) |
| Backup script | `/opt/fixitpro-backups/pg_backup_coolify.sh` |
| Restore-verify script | `/opt/fixitpro-backups/pg_restore_verify.sh` |
| Backup directory | `/opt/fixitpro-backups/db/` (chmod 700) |
| S3 / off-site backup | ❌ Not configured |
| Coolify scheduled backup | ❌ Not configured |
| Automated cron | ❌ Not yet enabled |

### 1.2 Backup Location

```
/opt/fixitpro-backups/               chmod 700 (root only)
├── pg_backup_coolify.sh             chmod 700 — backup script
├── pg_restore_verify.sh             chmod 700 — restore test script
├── backup.log                       chmod 600 — backup run history
├── restore_verify.log               chmod 600 — restore test history
└── db/                              chmod 700 (root only)
    ├── fixitpro_YYYYMMDD_HHMMSS.sql.gz       chmod 600
    ├── fixitpro_YYYYMMDD_HHMMSS.sql.gz.sha256 chmod 600
    └── ...
```

### 1.3 Retention Policy

| Tier | Copies | Implemented |
|------|--------|-------------|
| Daily | 7 | ✅ Enforced by script |
| Weekly | 4 | ❌ Not yet automated |
| Monthly | 3 | ❌ Not yet automated |

Weekly and monthly tiers require a separate wrapper script or cron that keeps one backup per week/month. Document here when implemented.

---

## 2. RPO and RTO

### Recovery Point Objective (RPO)

RPO = maximum data loss acceptable. With daily backups, any data written in the 24 hours before a disaster may be lost.

| Backup cadence | RPO |
|----------------|-----|
| Daily (current) | up to 24 hours |
| Hourly | up to 60 minutes |
| Continuous (WAL streaming) | seconds |

**Target:** Enable hourly cron + S3 off-site to bring RPO below 1 hour.

### Recovery Time Objective (RTO)

RTO = time from disaster declaration to application serving users again.

| Phase | Estimated time |
|-------|---------------|
| Detect and declare disaster | 5–30 minutes (depends on alerting) |
| SSH to server and locate backup | 2 minutes |
| Restore 18MB database | <1 minute |
| Restart application containers | 2 minutes |
| Smoke test | 2 minutes |
| **Total** | **~15 minutes** |

---

## 3. Disaster Scenarios

### Scenario A: Data corruption (accidental DELETE/UPDATE)

**Detection:** Customer/admin reports missing data; or reconciliation alerts.  
**Action:**
1. Identify when corruption occurred (check AuditLog table)
2. Find the most recent backup *before* corruption
3. Restore to `fixitpro_backup_verify`, extract affected rows
4. Apply surgical fix to production (never full restore unless necessary)
5. If full restore needed → follow Section 4

**RPO impact:** Data created between backup and corruption is lost.

### Scenario B: Failed database migration

**Detection:** Migration script errors; application throws 500s.  
**Action:**
1. Application automatically stays on old schema (Prisma won't boot if schema mismatch is critical)
2. If migration partially applied → rollback SQL in the migration's phase doc
3. If rollback SQL not available → restore from pre-migration backup
4. Document root cause and fix migration before retrying

**Why this scenario is low risk for migration #69:** The migration only adds 3 new empty tables. Rollback = 3 DROP TABLE statements. No data is at risk.

### Scenario C: VPS failure (hardware, provider outage)

**Detection:** Application unreachable; no SSH.  
**Action:**
1. If /opt/fixitpro-backups survives on the disk image → transfer backup files to new VPS
2. If disk is unrecoverable → **data is lost** (no off-site backup currently)
3. Recovery: provision new VPS → install Docker → Coolify → restore database → redeploy

**CRITICAL GAP:** With local-only backup, VPS total failure = total data loss.  
**Mitigation:** Enable S3 off-site backup (Cloudflare R2, free tier) as soon as possible.

### Scenario D: Accidental `prisma migrate reset` or `DROP TABLE`

**Detection:** Application fails to start; tables missing.  
**Action:**
1. Restore from most recent backup (see [DATABASE_RESTORE.md](./DATABASE_RESTORE.md) Section 4)
2. Restart application

### Scenario E: Production database unreachable (connection issues)

**Detection:** Application logs `P1000 connection refused`.  
**Action:** This is usually a container restart issue, not data loss.
```bash
docker restart postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754
```
Do NOT restore from backup unless the database is actually corrupted/lost.

---

## 4. Emergency Restore Procedure

See [DATABASE_RESTORE.md](./DATABASE_RESTORE.md) Section 4 for the full step-by-step emergency restore.

**Pre-conditions before starting:**
1. Owner declares disaster recovery event
2. All users notified of downtime
3. Backup file verified (gzip + SHA-256)
4. Restore confirmed on temporary DB (`fixitpro_backup_verify`)
5. Confirmed: no other recovery path (restart, fix-in-place)

---

## 5. Automation Plan (Next Steps)

### 5.1 Enable daily cron (Immediate — recommended)

**What:** Run the backup script every day at 02:00 UTC.  
**Storage used:** ~2.3MB per backup × 7 = ~16MB (negligible)  
**Command to enable:**

```bash
ssh root@91.98.151.10
cat > /etc/cron.d/fixitpro-backup << 'EOF'
# FixITPro daily database backup — 02:00 UTC
0 2 * * * root bash /opt/fixitpro-backups/pg_backup_coolify.sh >> /opt/fixitpro-backups/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/fixitpro-backup
```

### 5.2 Add off-site S3 backup (High priority)

**Why:** VPS failure currently = total data loss.  
**Cost:** Cloudflare R2 is free up to 10GB storage + 1M class-A operations.  
**Setup:**
1. Create Cloudflare R2 bucket `fixitpro-backups`
2. Generate API token with R2 write access
3. Add to Coolify environment variables (never commit to git):
   - `BACKUP_S3_ENABLED=true`
   - `BACKUP_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
   - `BACKUP_S3_BUCKET=fixitpro-backups`
   - `BACKUP_S3_ACCESS_KEY_ID=<key>`
   - `BACKUP_S3_SECRET_ACCESS_KEY=<secret>`
4. Update `pg_backup_coolify.sh` to upload after local backup:
   ```bash
   aws s3 cp "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/db/$(basename $BACKUP_FILE)" \
     --endpoint-url "$BACKUP_S3_ENDPOINT"
   ```

### 5.3 Coolify scheduled backup (Alternative to cron)

Coolify has a built-in scheduled database backup UI (Coolify → Databases → Scheduled Backups). This is the easiest way to add a managed backup with Coolify's own UI and S3 integration. Check Coolify UI under the PostgreSQL service.

### 5.4 Failure notification

When cron is enabled, failures will be silent unless monitored. To get email on failure, use `/usr/bin/mail` or a monitoring webhook. Simplest approach: check for backup files in a health check endpoint and alert if last backup is >25 hours old.

---

## 6. Security Controls

| Control | Status |
|---------|--------|
| Backup files not in web-accessible path | ✅ `/opt/fixitpro-backups/` — not served by any web server |
| Backup files chmod 600 (root only) | ✅ Set by backup script |
| Backup directory chmod 700 | ✅ |
| No credentials in backup script | ✅ Unix socket used; no password |
| No credentials in git | ✅ Only shell scripts committed; no .env files |
| Backup files not in git repo | ✅ On server filesystem, not in `/app` |
| `.gitignore` covers backup patterns | ✅ `backups/` and `*.log` |
| Off-site backup credentials | ⚠️ Not configured yet — when added, use Coolify env vars only |

---

## 7. Contact

- **System owner:** FixITPro Owner (t9393477@gmail.com)
- **Server:** 91.98.151.10 (SSH: `root@91.98.151.10`, key: `~/.ssh/fixitpro_coolify`)
- **In case of emergency outside business hours:** restore authority belongs to the system owner only
