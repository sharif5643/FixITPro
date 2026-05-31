#!/bin/bash
# ============================================================
# FixITPro — Rollback Script
# Restores the previous Docker images saved before the last deploy.
#
# Usage:
#   bash scripts/rollback.sh              # Roll back to saved :rollback images
#   bash scripts/rollback.sh --list       # List available rollback snapshots
#   bash scripts/rollback.sh --git-only   # Re-deploy from previous git commit only
#
# How it works:
#   deploy.sh tags running images as fixitpro-{backend,frontend}:rollback
#   before building new ones. This script swaps :latest back to :rollback
#   and restarts the affected containers — no rebuild needed (~30 seconds).
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.prod"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $ENV_FILE"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.prod not found at $ENV_FILE"
  exit 1
fi
source "$ENV_FILE"

echo "╔══════════════════════════════════════════════╗"
echo "║   FixITPro — Rollback                        ║"
echo "╚══════════════════════════════════════════════╝"
echo "  Time: $TIMESTAMP"
echo ""

# ── --list: show available rollback images ────────────────────────────────────
if [[ "${1:-}" == "--list" ]]; then
  echo "Available rollback snapshots:"
  echo ""
  echo "  fixitpro-backend images:"
  docker images fixitpro-backend --format "    {{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" | sort -r
  echo ""
  echo "  fixitpro-frontend images:"
  docker images fixitpro-frontend --format "    {{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" | sort -r
  exit 0
fi

# ── --git-only: just reset git and let operator re-deploy ────────────────────
if [[ "${1:-}" == "--git-only" ]]; then
  echo "▶ Resetting git to previous commit..."
  cd "$APP_DIR"
  PREV_COMMIT=$(git log --oneline -2 | tail -1 | awk '{print $1}')
  echo "  Current: $(git log --oneline -1)"
  echo "  Rolling back to: $PREV_COMMIT"
  read -rp "Confirm git reset to $PREV_COMMIT? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then echo "Aborted."; exit 0; fi
  git reset --hard "$PREV_COMMIT"
  echo "  ✓ Git reset done. Run deploy.sh to rebuild and redeploy."
  exit 0
fi

# ── Default: image-level rollback (fast, no rebuild) ─────────────────────────

# Verify rollback images exist
BACKEND_ROLLBACK=$(docker images -q fixitpro-backend:rollback 2>/dev/null || true)
FRONTEND_ROLLBACK=$(docker images -q fixitpro-frontend:rollback 2>/dev/null || true)

if [ -z "$BACKEND_ROLLBACK" ] && [ -z "$FRONTEND_ROLLBACK" ]; then
  echo "❌ No rollback images found."
  echo ""
  echo "   Rollback images are saved automatically by deploy.sh before each build."
  echo "   If this is the first deploy, there is nothing to roll back to."
  echo ""
  echo "   Options:"
  echo "     bash scripts/rollback.sh --list       List all available images"
  echo "     bash scripts/rollback.sh --git-only   Reset git to previous commit"
  exit 1
fi

echo "  Backend rollback image:  $(docker images fixitpro-backend:rollback --format '{{.CreatedAt}}' 2>/dev/null || echo 'NOT FOUND')"
echo "  Frontend rollback image: $(docker images fixitpro-frontend:rollback --format '{{.CreatedAt}}' 2>/dev/null || echo 'NOT FOUND')"
echo ""
read -rp "Roll back now? This will restart backend and frontend. (yes/no): " confirm
if [ "$confirm" != "yes" ]; then echo "Aborted."; exit 0; fi

# ── Save current images as emergency snapshot ────────────────────────────────
echo ""
echo "▶ [1/4] Saving current images as emergency snapshot..."
docker tag fixitpro-backend:latest  "fixitpro-backend:emergency-${TIMESTAMP}"  2>/dev/null || true
docker tag fixitpro-frontend:latest "fixitpro-frontend:emergency-${TIMESTAMP}" 2>/dev/null || true
echo "  ✓ Snapshots saved as :emergency-${TIMESTAMP}"

# ── Swap rollback → latest ────────────────────────────────────────────────────
echo ""
echo "▶ [2/4] Restoring rollback images..."
if [ -n "$BACKEND_ROLLBACK" ]; then
  docker tag fixitpro-backend:rollback fixitpro-backend:latest
  echo "  ✓ Backend restored"
fi
if [ -n "$FRONTEND_ROLLBACK" ]; then
  docker tag fixitpro-frontend:rollback fixitpro-frontend:latest
  echo "  ✓ Frontend restored"
fi

# ── Restart services with restored images ─────────────────────────────────────
echo ""
echo "▶ [3/4] Restarting services..."
$COMPOSE up -d --no-build backend frontend
echo "  Waiting for services to start..."
sleep 15

# ── Health check ─────────────────────────────────────────────────────────────
echo ""
echo "▶ [4/4] Health check..."
if curl -sf "https://$API_DOMAIN/api/v1/health" > /dev/null 2>&1; then
  echo "  ✓ API health: OK"
else
  echo "  ⚠  API health check failed — check logs:"
  echo "     $COMPOSE logs --tail=50 backend"
fi

echo ""
echo "╔═════════════════════════════════════════════════════════╗"
echo "║  Rollback complete                                      ║"
echo "║                                                         ║"
echo "║  To verify:  curl https://$API_DOMAIN/api/v1/health    ║"
echo "║  To re-deploy with fix: bash scripts/deploy.sh         ║"
echo "╚═════════════════════════════════════════════════════════╝"
