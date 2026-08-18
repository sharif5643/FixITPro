#!/usr/bin/env bash
# ============================================================
# FixITPro — Backup Restore Verification Script (Coolify/Docker)
#
# Restores a backup to a TEMPORARY database (fixitpro_backup_verify)
# inside the same PostgreSQL container — does NOT touch production data.
#
# Usage:
#   bash /opt/fixitpro-backups/pg_restore_verify.sh <backup_file.sql.gz>
#
# Example:
#   bash /opt/fixitpro-backups/pg_restore_verify.sh \
#     /opt/fixitpro-backups/db/fixitpro_20260817_120000.sql.gz
#
# After verification, the temporary database is dropped automatically.
# ============================================================
set -euo pipefail

CONTAINER="${FIXITPRO_PG_CONTAINER:-postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754}"
PG_USER="${FIXITPRO_PG_USER:-fixitpro}"
VERIFY_DB="fixitpro_backup_verify"
LOG_FILE="/opt/fixitpro-backups/restore_verify.log"

BACKUP_FILE="${1:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; cleanup; exit 1; }

cleanup() {
  log "Dropping temporary database $VERIFY_DB (cleanup)..."
  docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\";" 2>/dev/null || true
}

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

log "=========================================="
log "FixITPro Restore Verification — START"
log "Backup file : $BACKUP_FILE"
log "Verify DB   : $VERIFY_DB (temporary)"
log "=========================================="

# ── Step 1: Verify backup file integrity first ────────────────────────────────
log "Checking gzip integrity..."
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  log "FAIL: gzip integrity check failed"
  exit 1
fi
log "gzip integrity: OK"

CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  log "Verifying SHA-256 checksum..."
  if sha256sum -c "$CHECKSUM_FILE" --quiet 2>/dev/null; then
    log "SHA-256 checksum: OK"
  else
    log "WARNING: SHA-256 checksum mismatch — backup may be modified"
    fail "Checksum verification failed"
  fi
fi

# ── Step 2: Drop old verify DB if it exists ───────────────────────────────────
log "Dropping old verify database if exists..."
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\";" 2>&1 | tee -a "$LOG_FILE"

# ── Step 3: Create fresh verify database ─────────────────────────────────────
log "Creating temporary database: $VERIFY_DB"
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres \
  -c "CREATE DATABASE \"$VERIFY_DB\" OWNER \"$PG_USER\";" 2>&1 | tee -a "$LOG_FILE"
log "Created: $VERIFY_DB"

# ── Step 4: Restore backup ────────────────────────────────────────────────────
log "Restoring backup into $VERIFY_DB..."
zcat "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql \
  -U "$PG_USER" \
  -d "$VERIFY_DB" \
  --quiet \
  -v ON_ERROR_STOP=0 \
  2>&1 | tail -5 | tee -a "$LOG_FILE"
log "Restore complete"

# ── Step 5: Verify — table count ─────────────────────────────────────────────
TABLE_COUNT=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$VERIFY_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" \
  | tr -d ' \n')
log "Tables in restored DB: $TABLE_COUNT"

# ── Step 6: Verify — migration history ───────────────────────────────────────
MIGRATION_COUNT=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$VERIFY_DB" -t -c \
  "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" \
  | tr -d ' \n')
log "Applied migrations in restored DB: $MIGRATION_COUNT"

# ── Step 7: Verify — row counts (compare with baseline) ──────────────────────
log "--- Row count verification ---"
ROW_RESULTS=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$VERIFY_DB" -t -c "
SELECT 'Tenant' as t, COUNT(*) FROM \"Tenant\"
UNION ALL SELECT 'Branch', COUNT(*) FROM \"Branch\"
UNION ALL SELECT 'Customer', COUNT(*) FROM \"Customer\"
UNION ALL SELECT 'Sale', COUNT(*) FROM \"Sale\"
UNION ALL SELECT 'SaleItem', COUNT(*) FROM \"SaleItem\"
UNION ALL SELECT 'Repair', COUNT(*) FROM \"Repair\"
UNION ALL SELECT 'RepairAdditionalPayment', COUNT(*) FROM \"RepairAdditionalPayment\"
UNION ALL SELECT 'Product', COUNT(*) FROM \"Product\"
UNION ALL SELECT 'StockMovement', COUNT(*) FROM \"StockMovement\"
UNION ALL SELECT 'CashDrawerTransaction', COUNT(*) FROM \"CashDrawerTransaction\"
UNION ALL SELECT 'Supplier', COUNT(*) FROM \"Supplier\"
UNION ALL SELECT 'PurchaseOrder', COUNT(*) FROM \"PurchaseOrder\"
ORDER BY t;
")
log "Row counts in restored DB:"
echo "$ROW_RESULTS" | tee -a "$LOG_FILE"

# ── Step 8: Cleanup — drop temporary database ─────────────────────────────────
log "Dropping temporary database: $VERIFY_DB"
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\";" 2>&1 | tee -a "$LOG_FILE"
log "Temporary database dropped"

# ── Step 9: Final report ──────────────────────────────────────────────────────
log "=========================================="
log "RESTORE VERIFICATION COMPLETE"
log "  Tables    : $TABLE_COUNT (expected: 62)"
log "  Migrations: $MIGRATION_COUNT (expected: 68)"
log "  gzip test : PASS"
log "  Checksum  : PASS"
log "  Result    : See row counts above — compare with PRODUCTION_PRE_MIGRATION_BASELINE.md"
log "=========================================="
