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
#   FIXITPRO_MIN_KEEP      Newest backups always kept regardless of age (default: 7)
#
# Security: no credentials are stored in this script.
# pg_dump connects via Unix socket inside Docker (no password needed).
# ============================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# Coolify recreates the database container with a new name suffix, so a hard-coded name goes
# stale and every run fails with "not running". Use FIXITPRO_PG_CONTAINER if it names a running
# container, otherwise the running container whose name starts with the Coolify resource id,
# otherwise the only running postgres-image container.
PG_RESOURCE_PREFIX="${FIXITPRO_PG_PREFIX:-postgres-z9m1c1i9nr6kbyo4qn0vuv1b}"
resolve_pg_container() {
  if [ -n "${FIXITPRO_PG_CONTAINER:-}" ] && \
     docker inspect "$FIXITPRO_PG_CONTAINER" --format '{{.State.Status}}' 2>/dev/null | grep -q running; then
    echo "$FIXITPRO_PG_CONTAINER"; return
  fi
  local by_prefix by_image
  by_prefix=$(docker ps --format '{{.Names}}' | grep -E "^${PG_RESOURCE_PREFIX}" || true)
  if [ "$(printf '%s' "$by_prefix" | grep -c .)" = "1" ]; then echo "$by_prefix"; return; fi
  by_image=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /(^|\/)postgres(:|$)/ {print $1}')
  if [ "$(printf '%s' "$by_image" | grep -c .)" = "1" ]; then echo "$by_image"; return; fi
  echo ""
}
CONTAINER="$(resolve_pg_container)"
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
log "Database  : $PG_DB"
log "Output    : $BACKUP_FILE"
log "Retention : ${RETENTION_DAYS} days"
log "=========================================="

# ── Step 1: Verify container is running ───────────────────────────────────────
[ -n "$CONTAINER" ] || fail "Could not find the PostgreSQL container (running: $(docker ps --format '{{.Names}}' | tr '\n' ' '))"
log "Container : $CONTAINER"
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
# Always keep the newest MIN_KEEP backups, whatever their age: when backups had silently
# failed for over a week, age-only cleanup deleted every old file and left a single copy.
MIN_KEEP="${FIXITPRO_MIN_KEEP:-7}"
log "Cleaning backups older than ${RETENTION_DAYS} days (always keeping the newest ${MIN_KEEP})..."
BEFORE=$(find "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" | wc -l)
ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +"$((MIN_KEEP + 1))" | while read -r old; do
  if [ -n "$(find "$old" -mtime "+${RETENTION_DAYS}")" ]; then
    rm -f -- "$old" "${old}.sha256"
  fi
done
AFTER=$(find "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" | wc -l)
log "Cleanup: removed $((BEFORE - AFTER)) backup(s), $AFTER remaining"

# ── Step 7b: Off-site copy ───────────────────────────────────────────────────
# A backup on the same server is lost with the server. When /opt/fixitpro-backups/offsite.env
# exists (written by the restore-drill workflow from GitHub secrets, root-only), the backup is
# encrypted with its passphrase (AES-256, openssl) and copied with rclone to OFFSITE_REMOTE.
# Copies older than OFFSITE_KEEP_DAYS (default 30) are removed there. A failed upload is logged
# as an error but never removes or fails the local backup.
OFFSITE_ENV="/opt/fixitpro-backups/offsite.env"
OFFSITE_STATUS="not configured"
if [ -f "$OFFSITE_ENV" ]; then
  # shellcheck disable=SC1090
  . "$OFFSITE_ENV"
  if [ -n "${OFFSITE_REMOTE:-}" ] && [ -n "${OFFSITE_PASSPHRASE:-}" ] && command -v rclone >/dev/null 2>&1; then
    ENC_FILE="/tmp/$(basename "$BACKUP_FILE").enc"
    if openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$BACKUP_FILE" -out "$ENC_FILE" -pass env:OFFSITE_PASSPHRASE \
       && rclone --config /opt/fixitpro-backups/rclone.conf copy "$ENC_FILE" "$OFFSITE_REMOTE" --retries 3 \
       && rclone --config /opt/fixitpro-backups/rclone.conf copy "$CHECKSUM_FILE" "$OFFSITE_REMOTE" --retries 3; then
      OFFSITE_STATUS="uploaded to $OFFSITE_REMOTE (encrypted)"
      rclone --config /opt/fixitpro-backups/rclone.conf delete "$OFFSITE_REMOTE" --min-age "${OFFSITE_KEEP_DAYS:-30}d" 2>>"$LOG_FILE" || true
    else
      OFFSITE_STATUS="FAILED"
      log "ERROR: off-site copy failed — the local backup is kept"
    fi
    rm -f "$ENC_FILE"
  else
    OFFSITE_STATUS="incomplete config (OFFSITE_REMOTE / OFFSITE_PASSPHRASE / rclone)"
  fi
fi
log "Off-site  : $OFFSITE_STATUS"

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
log "  Off-site  : $OFFSITE_STATUS"
log "=========================================="
