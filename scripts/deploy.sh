#!/bin/bash
# ============================================================
# FixITPro — Production Deploy Script
# Usage: bash scripts/deploy.sh [--skip-build] [--no-pull]
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.prod"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $ENV_FILE"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

SKIP_BUILD=false
NO_PULL=false
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
  [[ "$arg" == "--no-pull"    ]] && NO_PULL=true
done

# ── Preflight checks ─────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║   FixITPro — Production Deployment           ║"
echo "╚══════════════════════════════════════════════╝"
echo "  Time:    $TIMESTAMP"
echo "  Dir:     $APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.prod not found at $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"
echo "  App:     https://$APP_DOMAIN"
echo "  API:     https://$API_DOMAIN"
echo ""

# ── Pull latest code ─────────────────────────────────────────
if [ "$NO_PULL" = false ]; then
  echo "▶ [1/7] Pulling latest code from git..."
  cd "$APP_DIR"
  git pull origin main
  echo "  ✓ Code updated"
else
  echo "▶ [1/7] Skipping git pull (--no-pull)"
fi

# ── Tag current images as rollback ───────────────────────────
echo ""
echo "▶ [2/6] Saving current images as rollback snapshot..."
docker tag fixitpro-backend:latest  fixitpro-backend:rollback  2>/dev/null \
  && echo "  ✓ Backend rollback saved" || echo "  ℹ  No previous backend image to save (first deploy)"
docker tag fixitpro-frontend:latest fixitpro-frontend:rollback 2>/dev/null \
  && echo "  ✓ Frontend rollback saved" || echo "  ℹ  No previous frontend image to save (first deploy)"

# ── Build images ─────────────────────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  echo ""
  echo "▶ [3/6] Building Docker images..."
  $COMPOSE build --no-cache backend frontend
  echo "  ✓ Images built"
else
  echo "▶ [3/6] Skipping build (--skip-build)"
fi

# ── Start/update services ─────────────────────────────────────
echo ""
echo "▶ [4/7] Starting services..."
$COMPOSE up -d postgres redis
echo "  Waiting for database..."
sleep 5

# Wait for postgres to be healthy
MAX_WAIT=60
WAITED=0
until $COMPOSE exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "❌ PostgreSQL did not become healthy within ${MAX_WAIT}s"
    exit 1
  fi
  echo "  Waiting for PostgreSQL... (${WAITED}s)"
  sleep 5
  WAITED=$((WAITED + 5))
done
echo "  ✓ PostgreSQL ready"

# Start backend (migrations run in entrypoint)
$COMPOSE up -d backend
echo "  ✓ Backend starting (running migrations)..."
sleep 10

# Start frontend
$COMPOSE up -d frontend
echo "  ✓ Frontend starting..."

# Start/reload nginx
$COMPOSE up -d nginx certbot

# ── Health checks ─────────────────────────────────────────────
echo ""
echo "▶ [5/7] Running health checks..."
sleep 15

HEALTH_ATTEMPTS=0
MAX_HEALTH_ATTEMPTS=12
until curl -sf "https://$API_DOMAIN/api/v1/health" > /dev/null 2>&1; do
  HEALTH_ATTEMPTS=$((HEALTH_ATTEMPTS + 1))
  if [ $HEALTH_ATTEMPTS -ge $MAX_HEALTH_ATTEMPTS ]; then
    echo "  ⚠  API health check timed out — check logs:"
    echo "     docker compose -f $APP_DIR/docker-compose.prod.yml logs backend"
    break
  fi
  echo "  Waiting for API... (attempt $HEALTH_ATTEMPTS/$MAX_HEALTH_ATTEMPTS)"
  sleep 10
done

if curl -sf "https://$API_DOMAIN/api/v1/health" > /dev/null 2>&1; then
  echo "  ✓ API health: OK"
fi
if curl -sf "https://$APP_DOMAIN" > /dev/null 2>&1; then
  echo "  ✓ App health: OK"
fi

# ── Cleanup old images ────────────────────────────────────────
echo ""
echo "▶ [6/7] Cleaning up old Docker images..."
docker image prune -f --filter "until=24h" 2>/dev/null || true
echo "  ✓ Cleanup done"

# ── Print status ─────────────────────────────────────────────
echo ""
echo "▶ [7/7] Service status:"
$COMPOSE ps

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  ✓ Deployment complete!                               ║"
echo "║                                                       ║"
echo "║  App:   https://$APP_DOMAIN"
echo "║  API:   https://$API_DOMAIN/api/v1"
echo "║  Health: https://$API_DOMAIN/api/v1/health"
echo "║                                                       ║"
echo "║  Useful commands:                                     ║"
echo "║  Logs:    docker compose ... logs -f backend          ║"
echo "║  Shell:   docker compose ... exec backend sh          ║"
echo "║  DB:      docker compose ... exec postgres psql ...   ║"
echo "╚═══════════════════════════════════════════════════════╝"
