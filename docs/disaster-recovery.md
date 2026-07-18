# FixITPro — Disaster Recovery Runbook

**Version:** RC2-003  
**Owner:** FixITPro Operations  
**Target RPO:** 24 hours maximum  
**Target RTO:** 4 hours maximum

---

## 1. Backup Schedule

| Trigger | Schedule | Method | Location |
|---------|----------|--------|----------|
| Automatic | Daily at 02:00 AM server time | NestJS `@Cron` → `pg_dump` plain SQL | Local: `/app/backups/` |
| Manual | On demand via POST `/api/v1/backup` (SUPER_ADMIN) | Same pg_dump flow | Local: `/app/backups/` |
| Offsite | Immediately after each backup (if S3 enabled) | `@aws-sdk/client-s3` PutObject | S3 bucket configured via `BACKUP_S3_*` env vars |

---

## 2. Local Retention

- Files older than `BACKUP_RETENTION_DAYS` (default: **30 days**) are deleted automatically.
- **Minimum 7 backups are always kept regardless of age.**
- File naming: `fixitpro_prod_YYYY-MM-DDTHH-MM-SS.sql`
- Uploads archive (repair images) is created alongside each DB backup as `uploads_fixitpro_prod_<timestamp>.tar.gz`

---

## 3. Offsite Retention

When `BACKUP_S3_ENABLED=true`:
- After each successful local backup, the `.sql` file is uploaded to S3-compatible storage.
- S3 retention mirrors local: objects older than `BACKUP_RETENTION_DAYS` are deleted, keeping at least 7.
- A **failed S3 upload never deletes the local backup** — it creates an ERROR-level notification in the app and logs the error.
- S3 credentials are never logged or exposed in API responses.

Supported providers (configured via `BACKUP_S3_*` env vars):

| Provider | `BACKUP_S3_ENDPOINT` |
|----------|----------------------|
| AWS S3 | *(omit — uses AWS default)* |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` |
| MinIO | `https://minio.yourserver.com` |

---

## 4. How to Check Whether Super Admin Was Seeded

```bash
# Connect to the production database
psql -U fixitpro_app -d fixitpro_prod -h localhost

# Check for SUPER_ADMIN users
SELECT email, role, "isActive", "createdAt"
FROM "User"
WHERE role = 'SUPER_ADMIN';
```

Expected output: one row with `role = 'SUPER_ADMIN'` and `isActive = true`.

---

## 5. Credential Rotation

### 5.1 Database Password

```sql
-- Run as postgres superuser
ALTER ROLE fixitpro_app WITH PASSWORD 'new-strong-password';
```

Then update `DATABASE_URL` in the deployment environment (Coolify UI or `.env.production`) and restart the backend.

### 5.2 Super Admin Password

Option A — via the web UI:
1. Log in as SUPER_ADMIN at `/login`
2. Go to Settings → Change Password

Option B — via the seed script (if locked out):
```bash
SUPER_ADMIN_PASSWORD=<new-password> \
DATABASE_URL="postgresql://fixitpro_app:<db-pass>@localhost:5432/fixitpro_prod" \
npm run seed:prod-super-admin
```

Verify the change by logging in at `/login`.

### 5.3 JWT Secret

Generate a new secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Update `JWT_SECRET` in Coolify UI or `.env.production`. **All existing sessions are invalidated immediately on restart** — users will need to log in again.

### 5.4 S3 Access Keys

1. Rotate the key in your S3 provider's dashboard.
2. Update `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY` in the deployment environment.
3. Restart the backend — the new credentials are read at backup time.
4. Trigger a manual backup to confirm the new credentials work.

---

## 6. Full Restore Steps

### Prerequisites

- `psql` client installed on the restore host
- `DATABASE_URL` pointing to the **target** database (not the live system if doing a staged restore)
- The backup `.sql` file (from local `/app/backups/` or downloaded from S3)

### Step-by-step

```bash
# 1. Download backup from S3 if needed (adjust for your provider/credentials)
aws s3 cp s3://<bucket>/backups/fixitpro_prod_<timestamp>.sql /tmp/restore.sql

# 2. Run the restore script
DATABASE_URL="postgresql://fixitpro_app:<password>@localhost:5432/fixitpro_prod" \
  ./scripts/restore.sh /tmp/restore.sql

# 3. The script will:
#    a. Validate the backup file
#    b. Display the target database and ask for explicit confirmation (type RESTORE)
#    c. Create a pre-restore backup at /app/backups/pre_restore_<timestamp>.sql
#    d. Drop and recreate the target database
#    e. Restore via psql
#    f. Verify connectivity
#    g. Check row counts for key tables

# 4. If schema migrations are needed after restore:
cd backend && npx prisma migrate deploy

# 5. Restart the backend
#    LAN: pm2 restart fixitpro-backend
#    Coolify: trigger redeploy in UI
```

### Rollback from a failed restore

If the restore fails or the application is broken after restore, use the pre-restore backup:

```bash
DATABASE_URL="postgresql://fixitpro_app:<password>@localhost:5432/fixitpro_prod" \
  ./scripts/restore.sh /app/backups/pre_restore_fixitpro_prod_<timestamp>.sql
```

---

## 7. Partial Failure Handling

| Failure | Impact | Recovery |
|---------|--------|----------|
| S3 upload fails | Local backup intact; offsite copy missing for this run | Check S3 credentials, fix config, trigger manual backup |
| pg_dump fails | No backup created; in-app BACKUP_FAILED notification | Check disk space, pg_dump binary, DATABASE_URL, DB connectivity |
| Backup file is empty (0 bytes) | Backup rejected; notification sent | Same as above — investigate pg_dump error |
| Local disk full | pg_dump may produce empty file | Clear old backups, increase disk, enable S3 offsite |
| Database unreachable during backup | pg_dump fails; BACKUP_FAILED notification | Investigate DB health; restore from last successful backup if DB is lost |
| Notification write fails | Alert not visible in app (if DB is the same DB that's down) | Check logs at `/app/logs/` — error is always logged regardless |

---

## 8. Lost-Server Recovery

If the entire server is lost (disk failure, provider outage, accidental deletion):

1. **Provision a new server** (same OS, same Docker version).
2. **Download the latest backup** from S3 offsite storage.
3. **Run setup:**
   ```bash
   git clone <repo> /app/fixitpro
   cd /app/fixitpro
   cp .env.production.example backend/.env.production
   # Fill in all REPLACE_ values — DB password, JWT secret, S3 credentials
   ```
4. **Start PostgreSQL** (via Docker or system package).
5. **Create the app role:**
   ```bash
   psql -U postgres -f scripts/create-app-role.sql
   ```
6. **Create the database and run migrations:**
   ```bash
   psql -U postgres -c "CREATE DATABASE fixitpro_prod;"
   cd backend && npx prisma migrate deploy
   ```
7. **Restore data:**
   ```bash
   DATABASE_URL="postgresql://fixitpro_app:<pass>@localhost:5432/fixitpro_prod" \
     ./scripts/restore.sh /path/to/latest-backup.sql
   ```
8. **Restore uploads (repair images)** from the uploads archive:
   ```bash
   tar -xzf uploads_fixitpro_prod_<timestamp>.tar.gz -C /app/
   ```
9. **Start the backend and frontend.**
10. **Verify** via health endpoint: `curl http://localhost:3000/health`

---

## 9. Staging Restore Test Procedure

Run this procedure **before any production restore** and **at least once per quarter**:

1. Set `DATABASE_URL` to point at the **staging** database (never prod during a test).
2. Download the latest production backup from S3 (or copy from `/app/backups/`).
3. Run the restore script:
   ```bash
   DATABASE_URL="postgresql://fixitpro_app:<pass>@staging-host:5432/fixitpro_staging" \
     ./scripts/restore.sh /path/to/latest-backup.sql
   ```
4. Confirm the integrity check output shows expected row counts.
5. Log in to the staging app and spot-check:
   - A recent repair record
   - A recent sale
   - Product inventory
6. Record the result in the production checklist (`docs/production-checklist.md`).

---

## 10. Responsible Operator

| Role | Responsibility |
|------|---------------|
| Server Administrator | Monitor disk usage on `/app/backups/`, ensure S3 credentials are valid |
| Super Admin (FixITPro) | Acknowledge BACKUP_FAILED notifications in the app, trigger manual backup if needed |
| Developer on-call | Respond to backup alert, diagnose root cause, escalate if data loss is suspected |

**Emergency contact:** Check `docs/EMERGENCY.md`
