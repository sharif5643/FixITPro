#!/usr/bin/env bash
# ============================================================
# FixITPro — Backup Restore Drill (Coolify/Docker)
#
# Proves a backup can actually be restored. Restores it into a TEMPORARY database
# (fixitpro_backup_verify) inside the same PostgreSQL container, compares it with the
# live database, then drops the temporary database.
#
# Production is only READ (row counts). Nothing is written to it.
#
# Usage:
#   bash pg_restore_verify.sh                      # newest backup in $BACKUP_DIR
#   bash pg_restore_verify.sh <backup_file.sql.gz> # a specific backup
#
# Exit code 0 = restore worked and the data looks complete; non-zero = investigate.
# ============================================================
set -euo pipefail

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
PROD_DB="${FIXITPRO_PG_DBNAME:-fixitpro}"
BACKUP_DIR="${FIXITPRO_BACKUP_DIR:-/opt/fixitpro-backups/db}"
VERIFY_DB="fixitpro_backup_verify"
LOG_FILE="${FIXITPRO_RESTORE_LOG:-/opt/fixitpro-backups/restore_verify.log}"

# Tables a shop cannot lose. Restored count must be > 0 when production has rows.
KEY_TABLES=(Tenant Branch User Customer Product BranchStock Sale SaleItem SalePayment Repair
  RepairAdditionalPayment StockMovement Shift CashDrawerTransaction CarrierWallet PackageSale)

mkdir -p "$(dirname "$LOG_FILE")"
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
psql_c() { docker exec "$CONTAINER" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -At "$@"; }

cleanup() {
  docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -q \
    -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\";" >/dev/null 2>&1 || true
}
fail() { log "FAIL: $*"; cleanup; exit 1; }
trap cleanup EXIT
trap 'log "FAIL: command failed at line $LINENO (database unreachable?)"' ERR

# Never let a misconfiguration point the drill at production.
[ "$VERIFY_DB" != "$PROD_DB" ] || { echo "VERIFY_DB equals PROD_DB — refusing"; exit 2; }

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1 || true)
  [ -n "$BACKUP_FILE" ] || { echo "No *.sql.gz backups in $BACKUP_DIR"; exit 1; }
fi
[ -f "$BACKUP_FILE" ] || { echo "Backup file not found: $BACKUP_FILE"; exit 1; }

log "=========================================="
log "Restore drill — START"
log "Backup : $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1), $(date -r "$BACKUP_FILE" '+%Y-%m-%d %H:%M'))"
log "Target : $VERIFY_DB (temporary)"
log "=========================================="

[ -n "$CONTAINER" ] || fail "Could not find the PostgreSQL container (running: $(docker ps --format '{{.Names}}' | tr '\n' ' '))"
log "Container : $CONTAINER"
docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null | grep -q running \
  || fail "PostgreSQL container '$CONTAINER' is not running"

# ── 1. File integrity ─────────────────────────────────────────────────────────
gzip -t "$BACKUP_FILE" || fail "gzip integrity check failed"
if [ -f "${BACKUP_FILE}.sha256" ]; then
  sha256sum -c "${BACKUP_FILE}.sha256" --quiet || fail "SHA-256 checksum mismatch"
  log "gzip + SHA-256: OK"
else
  log "gzip: OK (no .sha256 file)"
fi

# ── 2. Disk space: the restore needs roughly the live database size again ────
DB_BYTES=$(psql_c -d "$PROD_DB" -c "SELECT pg_database_size('$PROD_DB');")
FREE_BYTES=$(( $(df --output=avail -k / | tail -1) * 1024 ))
log "Live DB size: $((DB_BYTES / 1024 / 1024)) MB, free disk: $((FREE_BYTES / 1024 / 1024)) MB"
[ "$FREE_BYTES" -gt $(( DB_BYTES * 2 )) ] || fail "Not enough free disk for a safe restore (need 2x live DB size)"

# ── 3. Restore into a fresh temporary database; any SQL error fails the drill ─
cleanup
psql_c -d postgres -c "CREATE DATABASE \"$VERIFY_DB\" OWNER \"$PG_USER\";" >/dev/null
log "Restoring..."
START=$(date +%s)
if ! zcat "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$VERIFY_DB" \
      -q -v ON_ERROR_STOP=1 >/dev/null 2>>"$LOG_FILE"; then
  fail "psql reported an error while restoring (see $LOG_FILE)"
fi
log "Restore finished in $(( $(date +%s) - START ))s"

# ── 4. Compare schema and data with production ───────────────────────────────
count_tables() { psql_c -d "$1" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"; }
count_migr()   { psql_c -d "$1" -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;"; }

T_LIVE=$(count_tables "$PROD_DB"); T_REST=$(count_tables "$VERIFY_DB")
M_LIVE=$(count_migr "$PROD_DB");   M_REST=$(count_migr "$VERIFY_DB")
log "Tables     : backup $T_REST / live $T_LIVE"
log "Migrations : backup $M_REST / live $M_LIVE"
PROBLEMS=0
[ "$T_REST" -gt 0 ] || { log "PROBLEM: restored database has no tables"; PROBLEMS=$((PROBLEMS+1)); }
# A deploy after the backup can add migrations/tables; fewer is expected then, more is not.
[ "$M_REST" -le "$M_LIVE" ] || { log "PROBLEM: backup has more migrations than live"; PROBLEMS=$((PROBLEMS+1)); }

log "--- Rows: backup / live (backup is older, so it may be a little lower) ---"
for t in "${KEY_TABLES[@]}"; do
  exists=$(psql_c -d "$PROD_DB" -c "SELECT to_regclass('public.\"$t\"') IS NOT NULL;")
  [ "$exists" = "t" ] || continue
  live=$(psql_c -d "$PROD_DB" -c "SELECT COUNT(*) FROM \"$t\";")
  rest=$(psql_c -d "$VERIFY_DB" -c "SELECT COUNT(*) FROM \"$t\";" 2>/dev/null || echo "missing")
  flag=""
  if [ "$rest" = "missing" ] || { [ "$live" -gt 0 ] && [ "$rest" -eq 0 ]; }; then
    flag="  <-- PROBLEM"; PROBLEMS=$((PROBLEMS+1))
  fi
  printf '  %-26s %10s / %-10s%s\n' "$t" "$rest" "$live" "$flag" | tee -a "$LOG_FILE"
done

LATEST=$(psql_c -d "$VERIFY_DB" -c "SELECT to_char((MAX(\"createdAt\") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') FROM \"Sale\";" 2>/dev/null || echo "-")
log "Newest sale in backup (Bangkok time): ${LATEST:--}"

# ── 5. Result (the EXIT trap drops the temporary database) ───────────────────
log "=========================================="
if [ "$PROBLEMS" -eq 0 ]; then
  log "RESTORE DRILL PASSED — this backup can be restored"
  log "=========================================="
  exit 0
fi
log "RESTORE DRILL FOUND $PROBLEMS PROBLEM(S) — see above"
log "=========================================="
exit 1
