#!/usr/bin/env bash
# =============================================================================
# RC2-003 Part D: FixITPro database restore script
#
# USAGE:
#   ./scripts/restore.sh <backup-file.sql>
#
# REQUIREMENTS:
#   - psql client installed and in PATH
#   - DATABASE_URL env var set to the target database
#     (or PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE individually)
#   - BACKUP_DIR env var set (default: /app/backups)
#
# DESIGN:
#   - CLI-only. Never accessible via HTTP. Requires explicit confirmation.
#   - Creates a pre-restore backup before touching the target database.
#   - Verifies database connectivity after restore.
#   - Runs basic integrity checks (table counts).
#
# STAGING RESTORE TEST PROCEDURE (run before any production restore):
#   1. Point DATABASE_URL at your staging database (never prod during a test).
#   2. Run: ./scripts/restore.sh <backup-file.sql>
#   3. Verify row counts match expectations in the "Integrity check" output.
#   4. Spot-check a few records via psql or the web app on staging.
#   5. If the staging restore passes, proceed with production.
# =============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
TIMESTAMP=$(date +"%Y%m%dT%H%M%S")

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; NC='\033[0m'
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
info() { echo "        $*"; }

echo ""
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  FixITPro Database Restore — RC2-003                        │"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""

# ── 1. Check argument ─────────────────────────────────────────────────────────
if [[ -z "$BACKUP_FILE" ]]; then
  err "No backup file specified."
  echo ""
  info "Usage: $0 <backup-file.sql>"
  info "Example: $0 /app/backups/fixitpro_prod_2026-07-18T020000.sql"
  echo ""
  exit 1
fi

# Resolve path: bare filename → BACKUP_DIR/filename
if [[ "$BACKUP_FILE" != /* ]]; then
  BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
fi

# ── 2. Validate backup file ───────────────────────────────────────────────────
if [[ ! -f "$BACKUP_FILE" ]]; then
  err "Backup file not found: $BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
if [[ "$BACKUP_SIZE" -eq 0 ]]; then
  err "Backup file is empty: $BACKUP_FILE"
  exit 1
fi

ok "Backup file: $BACKUP_FILE ($(numfmt --to=iec-i "$BACKUP_SIZE" 2>/dev/null || echo "${BACKUP_SIZE} bytes"))"

# ── 3. Parse DATABASE_URL ────────────────────────────────────────────────────
if [[ -n "${DATABASE_URL:-}" ]]; then
  # Extract components from postgresql://user:pass@host:port/dbname
  DB_USER=$(echo "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
  DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
  DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
  DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')
  export PGPASSWORD="$DB_PASS"
else
  DB_USER="${PGUSER:-postgres}"
  DB_HOST="${PGHOST:-localhost}"
  DB_PORT="${PGPORT:-5432}"
  DB_NAME="${PGDATABASE:-fixitpro_prod}"
fi

info "Target database: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""

# Safety guard: refuse to restore to a dev database
if [[ "$DB_NAME" == *"dev"* ]] || [[ "$DB_NAME" == "fixitpro" ]]; then
  err "DATABASE_URL points to '${DB_NAME}' which looks like a dev database."
  err "This script is for production restores only."
  err "Set DATABASE_URL to the production database before running."
  exit 1
fi

# ── 4. Explicit confirmation ──────────────────────────────────────────────────
echo "  ╔═══════════════════════════════════════════════════════════════╗"
echo "  ║  WARNING: This will OVERWRITE all data in ${DB_NAME}!"
echo "  ║  A pre-restore backup will be created first."
echo "  ╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo -n "  Type RESTORE (all caps) to continue: "
read -r CONFIRM
echo ""

if [[ "$CONFIRM" != "RESTORE" ]]; then
  warn "Aborted by operator (confirmation not given)."
  exit 0
fi

# ── 5. Pre-restore backup ─────────────────────────────────────────────────────
PRE_RESTORE_FILE="${BACKUP_DIR}/pre_restore_${DB_NAME}_${TIMESTAMP}.sql"
mkdir -p "$BACKUP_DIR"

info "Creating pre-restore backup: $PRE_RESTORE_FILE"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -F p -f "$PRE_RESTORE_FILE" "$DB_NAME"; then
  PRE_SIZE=$(stat -c%s "$PRE_RESTORE_FILE" 2>/dev/null || stat -f%z "$PRE_RESTORE_FILE")
  ok "Pre-restore backup created ($(numfmt --to=iec-i "$PRE_SIZE" 2>/dev/null || echo "${PRE_SIZE} bytes"))"
else
  err "Pre-restore backup FAILED. Aborting restore to protect existing data."
  exit 1
fi
echo ""

# ── 6. Drop and recreate database ────────────────────────────────────────────
info "Dropping and recreating ${DB_NAME}…"

# Connect to postgres (maintenance DB) to drop/recreate the app database
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"${DB_NAME}\";"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "CREATE DATABASE \"${DB_NAME}\";"

ok "Database recreated"

# ── 7. Restore ────────────────────────────────────────────────────────────────
info "Restoring from $BACKUP_FILE…"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_FILE" > /dev/null 2>&1; then
  ok "Restore complete"
else
  err "psql restore returned a non-zero exit code."
  warn "The pre-restore backup is at: $PRE_RESTORE_FILE"
  warn "To rollback: run this script again with the pre-restore backup file."
  exit 1
fi
echo ""

# ── 8. Verify connectivity ────────────────────────────────────────────────────
info "Verifying database connectivity…"
CONN_TEST=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1;" 2>&1)
if [[ "$CONN_TEST" == "1" ]]; then
  ok "Database is reachable"
else
  err "Connectivity check failed: $CONN_TEST"
  exit 1
fi

# ── 9. Basic integrity checks ─────────────────────────────────────────────────
info "Running integrity checks…"
echo ""

TABLES=('"User"' '"Repair"' '"Sale"' '"Product"' '"Tenant"')
ALL_OK=true

for TABLE in "${TABLES[@]}"; do
  COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null || echo "ERROR")
  if [[ "$COUNT" == "ERROR" ]]; then
    warn "Table ${TABLE}: query failed (table may not exist)"
    ALL_OK=false
  else
    ok "Table ${TABLE}: ${COUNT} rows"
  fi
done

echo ""

if $ALL_OK; then
  echo "  ╔═══════════════════════════════════════════════════════════════╗"
  echo "  ║  RESTORE SUCCESSFUL                                           ║"
  echo "  ║  Pre-restore backup: $PRE_RESTORE_FILE"
  echo "  ╚═══════════════════════════════════════════════════════════════╝"
else
  echo "  ╔═══════════════════════════════════════════════════════════════╗"
  echo "  ║  RESTORE COMPLETE WITH WARNINGS — review output above         ║"
  echo "  ╚═══════════════════════════════════════════════════════════════╝"
fi

echo ""
info "Next steps:"
info "  1. Run Prisma migrations if restoring to a newer schema version:"
info "       cd backend && npx prisma migrate deploy"
info "  2. Restart the backend service."
info "  3. Verify the application is functional."
info "  4. Keep the pre-restore backup for at least 7 days."
echo ""
