#!/bin/bash
# ============================================================
# FixITPro — SSL Certificate Initialization
# Run ONCE after deploying nginx with init config
# Usage: bash scripts/init-ssl.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.prod"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $ENV_FILE"

# Load env vars
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.prod not found. Copy .env.prod.example and fill in values first."
  exit 1
fi
source "$ENV_FILE"

# Validate required domains are set
for var in APP_DOMAIN API_DOMAIN ADMIN_DOMAIN CERTBOT_EMAIL; do
  if [ -z "${!var:-}" ]; then
    echo "❌ $var is not set in .env.prod"
    exit 1
  fi
done

echo "╔══════════════════════════════════════════════╗"
echo "║   FixITPro — SSL Certificate Setup           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  APP domain:   $APP_DOMAIN"
echo "  API domain:   $API_DOMAIN"
echo "  ADMIN domain: $ADMIN_DOMAIN"
echo "  Email:        $CERTBOT_EMAIL"
echo ""

# ── Phase 1: Start nginx with HTTP-only init config ───────────────────────────
echo "▶ Phase 1: Starting nginx with HTTP-only config..."

# Use init template (no SSL) temporarily
cp "$APP_DIR/nginx/templates/app.conf.template" \
   "$APP_DIR/nginx/templates/app.conf.template.bak"
cp "$APP_DIR/nginx/templates/init.conf.template" \
   "$APP_DIR/nginx/templates/app.conf.template"

# Start only nginx (with certbot volumes mounted)
$COMPOSE up -d nginx certbot
echo "  Waiting 5s for nginx to start..."
sleep 5

# Verify nginx is responding on port 80
if ! curl -sf "http://$APP_DOMAIN/.well-known/acme-challenge/test" 2>/dev/null | grep -q ""; then
  echo "  ✓ Nginx is responding on HTTP (certbot webroot ready)"
fi

# ── Phase 2: Obtain SSL certificates ─────────────────────────────────────────
echo ""
echo "▶ Phase 2: Obtaining SSL certificates from Let's Encrypt..."

# Download recommended SSL options from certbot
if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
  $COMPOSE run --rm certbot \
    bash -c "curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    > /etc/letsencrypt/options-ssl-nginx.conf"
fi

if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
  $COMPOSE run --rm certbot \
    bash -c "curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
    > /etc/letsencrypt/ssl-dhparams.pem"
fi

# Get one SAN certificate covering all three subdomains
$COMPOSE run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d "$APP_DOMAIN" \
  -d "$API_DOMAIN" \
  -d "$ADMIN_DOMAIN"

echo "  ✓ Certificates obtained!"

# ── Phase 3: Switch nginx to full HTTPS config ────────────────────────────────
echo ""
echo "▶ Phase 3: Switching nginx to full HTTPS config..."

# Restore the real app config
cp "$APP_DIR/nginx/templates/app.conf.template.bak" \
   "$APP_DIR/nginx/templates/app.conf.template"
rm -f "$APP_DIR/nginx/templates/app.conf.template.bak"

# Reload nginx with new config
$COMPOSE restart nginx
echo "  Waiting 3s for nginx to reload..."
sleep 3

# ── Phase 4: Verify HTTPS works ───────────────────────────────────────────────
echo ""
echo "▶ Phase 4: Verifying HTTPS..."
if curl -sf "https://$APP_DOMAIN" > /dev/null 2>&1; then
  echo "  ✓ https://$APP_DOMAIN — OK"
else
  echo "  ⚠  https://$APP_DOMAIN — Could not reach (app might still be building)"
fi
if curl -sf "https://$API_DOMAIN/api/v1/health" > /dev/null 2>&1; then
  echo "  ✓ https://$API_DOMAIN/api/v1/health — OK"
else
  echo "  ⚠  https://$API_DOMAIN/api/v1/health — Not ready yet (backend still starting)"
fi

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  ✓ SSL setup complete!                             ║"
echo "║                                                    ║"
echo "║  Certificates are at:                             ║"
echo "║  /etc/letsencrypt/live/$APP_DOMAIN/               ║"
echo "║                                                    ║"
echo "║  Auto-renewal: certbot container renews every 12h ║"
echo "║  Nginx reload cron: daily at 03:05 AM             ║"
echo "╚════════════════════════════════════════════════════╝"
