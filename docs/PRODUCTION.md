# FixITPro — Production Deployment Guide

## Prerequisites

- Ubuntu 22.04 VPS (2 CPU / 2 GB RAM minimum)
- Domain names pointed to server IP:
  - `app.yourdomain.com` → frontend
  - `api.yourdomain.com` → backend API
- SSH access as root or sudo user

---

## First-Time Setup

### 1. Provision Server

```bash
# Copy setup script to server
scp scripts/server-setup.sh root@YOUR_SERVER_IP:/tmp/

# Run on server
ssh root@YOUR_SERVER_IP
bash /tmp/server-setup.sh
```

This installs Docker, creates `appuser`, configures UFW (ports 22/80/443), sets up fail2ban, 2 GB swap, and cron jobs.

### 2. Upload Project

```bash
# From your local machine
scp -r . appuser@YOUR_SERVER_IP:/home/appuser/fixitpro/
ssh appuser@YOUR_SERVER_IP
cd /home/appuser/fixitpro
```

Or clone from Git:

```bash
ssh appuser@YOUR_SERVER_IP
git clone https://github.com/YOUR_ORG/fixitpro.git /home/appuser/fixitpro
cd /home/appuser/fixitpro
```

### 3. Configure Environment

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Fill in every value — the file must not be committed to Git.

```env
APP_DOMAIN=app.yourdomain.com
API_DOMAIN=api.yourdomain.com
POSTGRES_USER=fixitpro
POSTGRES_PASSWORD=change_this_strong_password
POSTGRES_DB=fixitpro_prod
REDIS_PASSWORD=change_this_redis_password
JWT_SECRET=change_this_64char_random_secret
CERTBOT_EMAIL=admin@yourdomain.com

# Super Admin credentials (used only by seed:superadmin)
SUPER_ADMIN_EMAIL=superadmin@fixitpro.com
SUPER_ADMIN_PASSWORD=change_this_strong_password
SUPER_ADMIN_NAME=Super Admin
```

Generate strong secrets:

```bash
openssl rand -base64 48   # for POSTGRES_PASSWORD / REDIS_PASSWORD
openssl rand -base64 64   # for JWT_SECRET
```

### 4. Make Scripts Executable

```bash
chmod +x scripts/*.sh
```

### 5. Initialize SSL (First Time Only)

```bash
bash scripts/init-ssl.sh
```

This starts nginx on port 80, obtains Let's Encrypt certificates, then switches nginx to HTTPS. Run once per domain.

### 6. Deploy Application

```bash
bash scripts/deploy.sh
```

The deploy script:
1. Pulls latest code (if using git)
2. Builds Docker images
3. Starts postgres + redis
4. Waits for database to be healthy
5. Runs `prisma migrate deploy`
6. Starts backend, frontend, nginx
7. Runs health checks

### 7. Seed Initial Data

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend npx prisma db seed
```

### 8. Create Super Admin Account

The SUPER_ADMIN account manages all shops (tenants) from `/super-admin/tenants`.
It is never created from the login page — only via this script.

**Local (development):**
```bash
cd backend
SUPER_ADMIN_EMAIL=superadmin@fixitpro.com \
SUPER_ADMIN_PASSWORD=your_secure_password \
SUPER_ADMIN_NAME="Super Admin" \
npm run seed:superadmin
```

**Production:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend npm run seed:superadmin
```

Running it again on an existing email updates the password and forces the role to `SUPER_ADMIN` — safe to re-run anytime (e.g., after a password rotation).

### 9. Run Validation

```bash
export OWNER_EMAIL=owner@yourshop.com
export OWNER_PASS=your_owner_password
bash scripts/validate.sh
```

---

## Routine Operations

### Deploy Update

```bash
cd /home/appuser/fixitpro
git pull
bash scripts/deploy.sh
```

### View Logs

```bash
bash scripts/admin.sh logs backend 200
bash scripts/admin.sh logs frontend 100
bash scripts/admin.sh logs nginx 50
```

### Service Status

```bash
bash scripts/admin.sh service-status
```

### Restart a Service

```bash
bash scripts/admin.sh restart backend
bash scripts/admin.sh restart frontend
bash scripts/admin.sh restart nginx
```

### Manual Backup

```bash
bash scripts/backup.sh
# or
bash scripts/admin.sh backup-now
```

Backups are stored in `./backups/` and kept for 30 days.

### Database Shell

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec postgres psql -U fixitpro -d fixitpro_prod
```

### Run Prisma Migration (after schema change)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend npx prisma migrate deploy
```

---

## SSL Renewal

Certbot auto-renews via cron (set up by `server-setup.sh`). To renew manually:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm certbot renew
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec nginx nginx -s reload
```

---

## Monitoring

### Check disk usage

```bash
df -h
bash scripts/admin.sh db-size
```

### Check slow queries

```bash
bash scripts/admin.sh slow-queries
```

### Check subscription status

```bash
bash scripts/admin.sh subscription-status
```

---

## Docker Compose Reference

All docker-compose commands use this pattern:

```bash
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

$COMPOSE ps
$COMPOSE logs -f backend
$COMPOSE restart nginx
$COMPOSE down         # stop all
$COMPOSE down -v      # stop + delete volumes (DESTRUCTIVE)
```

---

## Useful Ports (internal only — firewalled externally)

| Service  | Internal Port |
|----------|---------------|
| Backend  | 3000          |
| Frontend | 3000          |
| Postgres | 5432          |
| Redis    | 6379          |
| Nginx    | 80, 443       |

---

## File Locations on Server

| Path | Purpose |
|------|---------|
| `/home/appuser/fixitpro/` | Application root |
| `/home/appuser/fixitpro/.env.prod` | Secrets (never commit) |
| `/home/appuser/fixitpro/backups/` | Database backups |
| `/home/appuser/fixitpro/certbot/` | Let's Encrypt certs + webroot |
| `/var/log/fixitpro-admin.log` | Admin action audit log |
