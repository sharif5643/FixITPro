#!/bin/bash
# ============================================================
# FixITPro — Database & File Backup Script
# Runs daily via cron: 0 2 * * * bash /srv/fixitpro/scripts/backup.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.prod"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $ENV_FILE"

BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

source "$ENV_FILE"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/logs"

echo "[$TIMESTAMP] Starting backup..."

# ── PostgreSQL dump ───────────────────────────────────────────
DB_FILE="$BACKUP_DIR/db/fixitpro_${TIMESTAMP}.sql.gz"

$COMPOSE exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-password \
  | gzip -9 > "$DB_FILE"

DB_SIZE=$(du -sh "$DB_FILE" | cut -f1)
echo "[$TIMESTAMP] ✓ Database backup: $DB_FILE ($DB_SIZE)"

# ── Verify backup is valid ─────────────────────────────────────
if ! gunzip -t "$DB_FILE" 2>/dev/null; then
  echo "[$TIMESTAMP] ❌ Backup file is corrupted!"
  exit 1
fi

# ── Cleanup old backups ────────────────────────────────────────
find "$BACKUP_DIR/db" -name "*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
REMAINING=$(ls "$BACKUP_DIR/db" | wc -l)
echo "[$TIMESTAMP] ✓ Cleaned old backups. Remaining: $REMAINING files"

# ── Disk usage report ─────────────────────────────────────────
DISK_USAGE=$(df -h / | awk 'NR==2{print $5}')
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[$TIMESTAMP] Disk: $DISK_USAGE used | Backup dir: $BACKUP_SIZE"

# ── Alert if disk > 85% ───────────────────────────────────────
DISK_PCT=$(df / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 85 ]; then
  echo "[$TIMESTAMP] ⚠  DISK ALERT: ${DISK_PCT}% used!"
fi

echo "[$TIMESTAMP] Backup complete."
