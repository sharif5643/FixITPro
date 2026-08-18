# Database Backup — FixITPro Production

> **Server:** 91.98.151.10  
> **Database:** fixitpro (PostgreSQL 15.18 inside Docker)  
> **Backup location:** `/opt/fixitpro-backups/db/` (host filesystem, root-only)  
> **Script:** `/opt/fixitpro-backups/pg_backup_coolify.sh`  
> **Format:** Plain SQL compressed with gzip (`.sql.gz`)

---

## Quick Reference

```bash
# Run a manual backup now
ssh root@91.98.151.10
bash /opt/fixitpro-backups/pg_backup_coolify.sh

# List backups
ls -lh /opt/fixitpro-backups/db/

# Check last backup log
tail -30 /opt/fixitpro-backups/backup.log
```

---

## How the Backup Works

The backup script uses `docker exec` to run `pg_dump` inside the PostgreSQL container. It connects via Unix socket (no password required; trust auth on local socket). The dump is piped through `gzip -9` and written directly to the host filesystem — the production database is never paused or locked.

### Step-by-step

1. Verify postgres container is running
2. Read-only connectivity check (count migrations)
3. Run `pg_dump --no-password` → `gzip -9` → `.sql.gz` file
4. `chmod 600` the backup file (root-only)
5. Generate SHA-256 checksum → `.sql.gz.sha256` (also `chmod 600`)
6. `gzip -t` integrity check
7. Count SQL lines and COPY statements (sanity check)
8. Retention cleanup (delete backups older than N days)
9. Disk usage report

### Security properties

- No password stored in the script — pg_dump uses Docker Unix socket (trust)
- Backup files are `chmod 600` — only root can read
- Backup directory is `chmod 700` — only root can list
- Location is `/opt/fixitpro-backups/` — not inside any web-accessible path
- No credentials in any log output

---

## Running a Manual Backup

```bash
# SSH to production server
ssh root@91.98.151.10

# Run backup
bash /opt/fixitpro-backups/pg_backup_coolify.sh

# Confirm success (look for "BACKUP SUCCESS" at the end)
tail -5 /opt/fixitpro-backups/backup.log
```

Expected output:
```
[2026-08-17 03:33:20] BACKUP SUCCESS
[2026-08-17 03:33:20]   File      : /opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz
[2026-08-17 03:33:20]   Size      : 2.3M
[2026-08-17 03:33:20]   SHA-256   : <hash>
[2026-08-17 03:33:20]   Lines     : 9158
[2026-08-17 03:33:20]   Tables    : 62
[2026-08-17 03:33:20]   gzip test : PASS
```

---

## Configuration

All configuration is via environment variables. Defaults work out-of-the-box for the current deployment.

| Variable | Default | Description |
|----------|---------|-------------|
| `FIXITPRO_PG_CONTAINER` | `postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754` | PostgreSQL container name |
| `FIXITPRO_PG_USER` | `fixitpro` | PostgreSQL user |
| `FIXITPRO_PG_DBNAME` | `fixitpro` | Database name |
| `FIXITPRO_BACKUP_DIR` | `/opt/fixitpro-backups/db` | Backup destination |
| `FIXITPRO_RETENTION_DAYS` | `7` | Days to retain backups |

### Changing retention

```bash
FIXITPRO_RETENTION_DAYS=30 bash /opt/fixitpro-backups/pg_backup_coolify.sh
```

---

## Backup File Format

```
/opt/fixitpro-backups/db/
├── fixitpro_20260817_033319.sql.gz         # compressed SQL dump
├── fixitpro_20260817_033319.sql.gz.sha256  # SHA-256 checksum
└── ...
```

File naming: `fixitpro_YYYYMMDD_HHMMSS.sql.gz`

---

## Retention Policy

Current policy: **7 days** (daily backups = 7 retained copies).

The script deletes `.sql.gz` and `.sha256` files older than `RETENTION_DAYS`. Backups run daily → 7 daily backups kept at all times.

Recommended long-term schedule (see [BACKUP_DISASTER_RECOVERY.md](./BACKUP_DISASTER_RECOVERY.md)):
- Daily backups: 7 copies
- Weekly backups: 4 copies  
- Monthly backups: 3 copies

---

## Scheduled Automation (cron)

Currently: **manual only** (automation not yet configured).

To enable daily backup at 02:00 UTC, run once on the server:

```bash
# Add cron entry (as root)
crontab -e
# Add this line:
0 2 * * * bash /opt/fixitpro-backups/pg_backup_coolify.sh >> /opt/fixitpro-backups/backup.log 2>&1
```

Or using `/etc/cron.d/fixitpro-backup`:

```cron
# FixITPro daily database backup — 02:00 UTC
0 2 * * * root bash /opt/fixitpro-backups/pg_backup_coolify.sh >> /opt/fixitpro-backups/backup.log 2>&1
```

---

## Off-site Backup (Future — Option B)

The current backup is local to the production VPS. If the VPS fails catastrophically, the backup is lost with it. To add S3 off-site backup:

1. Create a Cloudflare R2 bucket (free up to 10GB)
2. Generate R2 access key
3. Set in Coolify environment variables:
   - `BACKUP_S3_ENABLED=true`
   - `BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`
   - `BACKUP_S3_BUCKET=fixitpro-backups`
   - `BACKUP_S3_ACCESS_KEY_ID=<key>`
   - `BACKUP_S3_SECRET_ACCESS_KEY=<secret>`
4. The application's built-in backup module will upload via S3

---

## Verification

After every backup, run:

```bash
# Quick integrity check
gzip -t /opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz && echo "OK"

# Verify checksum
sha256sum -c /opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz.sha256

# Count tables in dump
zcat /opt/fixitpro-backups/db/fixitpro_YYYYMMDD_HHMMSS.sql.gz | grep -c '^COPY '
```

For a full restore test, see [DATABASE_RESTORE.md](./DATABASE_RESTORE.md).
