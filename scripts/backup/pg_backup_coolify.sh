#!/usr/bin/env bash
# ============================================================
# FixITPro — Production PostgreSQL Backup (Coolify/Docker)
# Server: 91.98.151.10
#
# Usage:
#   bash /opt/fixitpro-backups/pg_backup_coolify.sh
#
# Environment (set before running or in /etc/environment):
#   FIXITPRO_PG_CONTAINER  PostgreSQL container name
#   FIXITPRO_PG_USER       PostgreSQL user (default: fixitpro)
#   FIXITPRO_PG_DBNAME     PostgreSQL database (default: fixitpro)
#   FIXITPRO_BACKUP_DIR    Backup destination (default: /opt/fixitpro-backups/db)
#   FIXITPRO_RETENTION_DAYS  Days to keep backups (default: 7)
#
# Security: no credentials are stored in this script.
# pg_dump connects via Unix socket inside Docker (no password needed).
# ============================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
CONTAINER="${FIXITPRO_PG_CONTAINER:-postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754}"
PG_USER="${FIXITPRO_PG_USER:-fixitpro}"
PG_DB="${FIXITPRO_PG_DBNAME:-fixitpro}"
BACKUP_DIR="${FIXITPRO_BACKUP_DIR:-/opt/fixitpro-backups/db}"
RETENTION_DAYS="${FIXITPRO_RETENTION_DAYS:-7}"
LOG_FILE="/opt/fixitpro-backups/backup.log"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/fixitpro_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# ── Logging ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$BACKUP_DIR"

log "=========================================="
log "FixITPro Production Backup — START"
log "Container : $CONTAINER"
log "Database  : $PG_DB"
log "Output    : $BACKUP_FILE"
log "Retention : ${RETENTION_DAYS} days"
log "=========================================="

# ── Step 1: Verify container is running ───────────────────────────────────────
if ! docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null | grep -q 'running'; then
  fail "PostgreSQL container '$CONTAINER' is not running"
fi
log "Container status: running"

# ── Step 2: Verify database is accessible (READ-ONLY check) ──────────────────
DB_CHECK=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -c \
  "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" 2>&1)
if echo "$DB_CHECK" | grep -q "ERROR\|error\|FATAL"; then
  fail "Cannot connect to database: $DB_CHECK"
fi
MIGRATION_COUNT=$(echo "$DB_CHECK" | tr -d ' \n')
log "Database accessible — applied migrations: $MIGRATION_COUNT"

# ── Step 3: Run pg_dump ───────────────────────────────────────────────────────
log "Running pg_dump (plain SQL format, gzip compressed)..."
docker exec "$CONTAINER" pg_dump \
  -U "$PG_USER" \
  -d "$PG_DB" \
  --no-password \
  --verbose \
  2>>"$LOG_FILE" \
  | gzip -9 > "$BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
  fail "Backup file was not created: $BACKUP_FILE"
fi

# Restrict access to root only — backup contains all production data
chmod 600 "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
BACKUP_BYTES=$(stat -c%s "$BACKUP_FILE")

if [ "$BACKUP_BYTES" -lt 1000 ]; then
  fail "Backup file is suspiciously small (${BACKUP_BYTES} bytes) — aborting"
fi

log "pg_dump complete — size: $BACKUP_SIZE ($BACKUP_BYTES bytes)"

# ── Step 4: Generate SHA-256 checksum ────────────────────────────────────────
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
chmod 600 "$CHECKSUM_FILE"
CHECKSUM=$(awk '{print $1}' "$CHECKSUM_FILE")
log "SHA-256: $CHECKSUM"
log "Checksum saved: $CHECKSUM_FILE"

# ── Step 5: Verify gzip integrity ────────────────────────────────────────────
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  fail "gzip integrity check FAILED on $BACKUP_FILE"
fi
log "gzip integrity: OK"

# ── Step 6: Quick restore scan (pg_restore --list on gzip SQL is not supported)
# For plain SQL format: count lines and scan for key markers
LINE_COUNT=$(zcat "$BACKUP_FILE" | wc -l)
TABLE_COUNT=$(zcat "$BACKUP_FILE" | grep -c '^COPY ' || true)

log "Backup SQL lines: $LINE_COUNT"
log "COPY statements (tables): $TABLE_COUNT"

if [ "$LINE_COUNT" -lt 100 ]; then
  fail "Backup has too few lines ($LINE_COUNT) — likely incomplete"
fi

# ── Step 7: Retention cleanup ────────────────────────────────────────────────
log "Cleaning backups older than ${RETENTION_DAYS} days..."
BEFORE=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "*.sql.gz.sha256" -mtime "+${RETENTION_DAYS}" -delete
AFTER=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
log "Cleanup: removed $((BEFORE - AFTER)) backup(s), $AFTER remaining"

# ── Step 8: Disk usage report ─────────────────────────────────────────────────
DISK_PCT=$(df / | awk 'NR==2{print $5}' | tr -d '%')
DISK_AVAIL=$(df -h / | awk 'NR==2{print $4}')
log "Disk: ${DISK_PCT}% used, ${DISK_AVAIL} available"
if [ "$DISK_PCT" -gt 80 ]; then
  log "WARNING: Disk usage is above 80% (${DISK_PCT}%)"
fi

# ── Step 9: Final status ──────────────────────────────────────────────────────
log "=========================================="
log "BACKUP SUCCESS"
log "  File      : $BACKUP_FILE"
log "  Size      : $BACKUP_SIZE"
log "  SHA-256   : $CHECKSUM"
log "  Lines     : $LINE_COUNT"
log "  Tables    : $TABLE_COUNT"
log "  gzip test : PASS"
log "=========================================="
