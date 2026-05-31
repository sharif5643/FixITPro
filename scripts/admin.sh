#!/bin/bash
# ============================================================
# FixITPro — Emergency Admin Tools
# Usage: bash scripts/admin.sh <command> [options]
# Must be run from the project root directory on the VPS
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.prod"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $ENV_FILE"
LOG_FILE="/var/log/fixitpro-admin.log"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.prod not found"; exit 1
fi
source "$ENV_FILE"

# Audit log helper
audit_log() {
  local action="$1"
  local detail="$2"
  local ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$ts] ADMIN_ACTION: $action | $detail | operator=$(whoami)" | tee -a "$LOG_FILE"
}

# DB query helper
db_query() {
  $COMPOSE exec -T postgres psql \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-password -t -c "$1" 2>/dev/null | tr -d ' '
}

db_query_pretty() {
  $COMPOSE exec -T postgres psql \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-password -c "$1" 2>/dev/null
}

db_exec() {
  $COMPOSE exec -T postgres psql \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-password -c "$1" 2>/dev/null
}

# ── Commands ──────────────────────────────────────────────────

cmd_help() {
  echo ""
  echo "FixITPro Emergency Admin Tools"
  echo "================================"
  echo "Usage: bash scripts/admin.sh <command>"
  echo ""
  echo "Commands:"
  echo "  list-users                  List all users with roles"
  echo "  reset-password <email>      Reset user password"
  echo "  disable-user <email>        Disable user account"
  echo "  enable-user <email>         Enable user account"
  echo "  list-shifts                 List all open shifts"
  echo "  force-close-shift <id>      Force close an active shift"
  echo "  extend-subscription <days>  Extend subscription by N days"
  echo "  subscription-status         Show current subscription info"
  echo "  db-size                     Show database table sizes"
  echo "  slow-queries                Show recent slow query summary"
  echo "  service-status              Show all Docker service status"
  echo "  logs <service> [lines]      Tail service logs (backend/frontend/nginx)"
  echo "  restart <service>           Restart a specific service"
  echo "  backup-now                  Run emergency database backup"
  echo ""
}

cmd_list_users() {
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  All Users                                           ║"
  echo "╚══════════════════════════════════════════════════════╝"
  db_query_pretty "SELECT id, email, name, role, \"isActive\", \"lastLoginAt\" FROM \"User\" ORDER BY \"createdAt\";"
}

cmd_reset_password() {
  local email="${1:-}"
  if [ -z "$email" ]; then
    read -rp "Enter user email: " email
  fi

  # Verify user exists
  local user_id
  user_id=$(db_query "SELECT id FROM \"User\" WHERE email='$email' LIMIT 1;")
  if [ -z "$user_id" ]; then
    echo "❌ User not found: $email"
    exit 1
  fi

  # Generate random password or accept input
  read -rsp "New password (leave empty for auto-generate): " new_pass
  echo ""
  if [ -z "$new_pass" ]; then
    new_pass=$(openssl rand -base64 12 | tr -d '=+/')
    echo "  Auto-generated password: $new_pass"
  fi

  # Hash with bcrypt using node
  local hashed
  hashed=$($COMPOSE exec -T backend node -e "
    const bcrypt = require('bcrypt');
    bcrypt.hash('$new_pass', 12).then(h => { process.stdout.write(h); });
  " 2>/dev/null)

  db_exec "UPDATE \"User\" SET password='$hashed', \"updatedAt\"=NOW() WHERE email='$email';"
  audit_log "RESET_PASSWORD" "email=$email"
  echo "✓ Password reset for: $email"
  echo "  Communicate new password to user securely."
}

cmd_disable_user() {
  local email="${1:-}"
  if [ -z "$email" ]; then
    read -rp "Enter user email to disable: " email
  fi

  local role
  role=$(db_query "SELECT role FROM \"User\" WHERE email='$email' LIMIT 1;")
  if [ -z "$role" ]; then
    echo "❌ User not found: $email"; exit 1
  fi
  if [ "$role" = "OWNER" ]; then
    echo "❌ Cannot disable OWNER account"; exit 1
  fi

  db_exec "UPDATE \"User\" SET \"isActive\"=false, \"updatedAt\"=NOW() WHERE email='$email';"
  audit_log "DISABLE_USER" "email=$email role=$role"
  echo "✓ User disabled: $email"
}

cmd_enable_user() {
  local email="${1:-}"
  if [ -z "$email" ]; then
    read -rp "Enter user email to enable: " email
  fi

  db_exec "UPDATE \"User\" SET \"isActive\"=true, \"updatedAt\"=NOW() WHERE email='$email';"
  audit_log "ENABLE_USER" "email=$email"
  echo "✓ User enabled: $email"
}

cmd_list_shifts() {
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Open Shifts                                         ║"
  echo "╚══════════════════════════════════════════════════════╝"
  db_query_pretty "
    SELECT s.id, u.name as \"Staff\", s.\"openedAt\", s.\"openBalance\",
           COUNT(sa.id) as \"Sales\"
    FROM \"Shift\" s
    JOIN \"User\" u ON s.\"userId\" = u.id
    LEFT JOIN \"Sale\" sa ON sa.\"shiftId\" = s.id
    WHERE s.\"isActive\" = true
    GROUP BY s.id, u.name, s.\"openedAt\", s.\"openBalance\"
    ORDER BY s.\"openedAt\" DESC;
  "
}

cmd_force_close_shift() {
  local shift_id="${1:-}"
  if [ -z "$shift_id" ]; then
    cmd_list_shifts
    read -rp "Enter shift ID to force close: " shift_id
  fi

  local exists
  exists=$(db_query "SELECT id FROM \"Shift\" WHERE id='$shift_id' AND \"isActive\"=true LIMIT 1;")
  if [ -z "$exists" ]; then
    echo "❌ Active shift not found: $shift_id"; exit 1
  fi

  echo "⚠  Force closing shift $shift_id..."
  read -rp "Confirm? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Aborted."; exit 0
  fi

  db_exec "
    UPDATE \"Shift\"
    SET \"isActive\"=false, \"closedAt\"=NOW(), note=COALESCE(note,'') || ' [FORCE CLOSED by admin]'
    WHERE id='$shift_id';
  "
  audit_log "FORCE_CLOSE_SHIFT" "shift_id=$shift_id"
  echo "✓ Shift $shift_id force closed"
}

cmd_extend_subscription() {
  local days="${1:-}"
  if [ -z "$days" ]; then
    cmd_subscription_status
    read -rp "Extend by how many days? " days
  fi

  if ! [[ "$days" =~ ^[0-9]+$ ]]; then
    echo "❌ Invalid number: $days"; exit 1
  fi

  db_exec "
    UPDATE \"Subscription\"
    SET \"expiryDate\" = \"expiryDate\" + INTERVAL '${days} days',
        status = 'ACTIVE',
        \"updatedAt\" = NOW();
  "

  # Log renewal
  db_exec "
    INSERT INTO \"SubscriptionRenewal\" (id, action, \"expiryDate\", note, \"createdAt\", \"subscriptionId\")
    SELECT gen_random_uuid()::text, 'ADMIN_EXTEND',
           \"expiryDate\",
           'Extended ${days} days by admin',
           NOW(),
           id
    FROM \"Subscription\"
    LIMIT 1;
  "

  audit_log "EXTEND_SUBSCRIPTION" "days=$days"
  echo "✓ Subscription extended by $days days"
  cmd_subscription_status
}

cmd_subscription_status() {
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Subscription Status                                 ║"
  echo "╚══════════════════════════════════════════════════════╝"
  db_query_pretty "SELECT \"planName\", status, \"startDate\", \"expiryDate\",
    CASE WHEN \"expiryDate\" > NOW() THEN CEIL(EXTRACT(EPOCH FROM \"expiryDate\" - NOW())/86400)::int
         ELSE 0 END AS \"daysLeft\"
    FROM \"Subscription\" LIMIT 1;"
}

cmd_db_size() {
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Database Table Sizes                                ║"
  echo "╚══════════════════════════════════════════════════════╝"
  db_query_pretty "
    SELECT schemaname, tablename,
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
           pg_total_relation_size(schemaname||'.'||tablename) AS bytes
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY bytes DESC;
  "
}

cmd_service_status() {
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Service Status                                      ║"
  echo "╚══════════════════════════════════════════════════════╝"
  $COMPOSE ps
}

cmd_logs() {
  local service="${1:-backend}"
  local lines="${2:-100}"
  $COMPOSE logs --tail="$lines" -f "$service"
}

cmd_restart() {
  local service="${1:-}"
  if [ -z "$service" ]; then
    read -rp "Service to restart (backend/frontend/nginx): " service
  fi
  echo "⚠  Restarting $service..."
  $COMPOSE restart "$service"
  audit_log "RESTART_SERVICE" "service=$service"
  echo "✓ $service restarted"
}

cmd_backup_now() {
  echo "▶ Running emergency backup..."
  bash "$SCRIPT_DIR/backup.sh"
}

# ── Router ────────────────────────────────────────────────────
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  help|--help|-h)        cmd_help ;;
  list-users)            cmd_list_users ;;
  reset-password)        cmd_reset_password "${1:-}" ;;
  disable-user)          cmd_disable_user "${1:-}" ;;
  enable-user)           cmd_enable_user "${1:-}" ;;
  list-shifts)           cmd_list_shifts ;;
  force-close-shift)     cmd_force_close_shift "${1:-}" ;;
  extend-subscription)   cmd_extend_subscription "${1:-}" ;;
  subscription-status)   cmd_subscription_status ;;
  db-size)               cmd_db_size ;;
  service-status)        cmd_service_status ;;
  logs)                  cmd_logs "${1:-backend}" "${2:-100}" ;;
  restart)               cmd_restart "${1:-}" ;;
  backup-now)            cmd_backup_now ;;
  *)
    echo "❌ Unknown command: $COMMAND"
    cmd_help
    exit 1
    ;;
esac
