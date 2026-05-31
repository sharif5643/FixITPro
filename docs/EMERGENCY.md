# FixITPro — Emergency Incident Guide

Quick reference for handling production incidents. All admin commands assume you are in `/home/appuser/fixitpro` on the VPS.

---

## Severity Levels

| Level | Meaning | Target Response |
|-------|---------|----------------|
| P1 | System completely down / data loss risk | < 15 min |
| P2 | Core feature broken (POS, repairs) | < 1 hour |
| P3 | Non-critical feature degraded | < 4 hours |

---

## P1 — System Is Down

### Step 1: Diagnose

```bash
bash scripts/admin.sh service-status
bash scripts/admin.sh logs nginx 50
bash scripts/admin.sh logs backend 100
```

### Step 2: Quick Restart

```bash
# Restart everything (safe, preserves data)
docker compose -f docker-compose.prod.yml --env-file .env.prod restart

# Or restart specific service
bash scripts/admin.sh restart backend
bash scripts/admin.sh restart nginx
```

### Step 3: If Restart Fails — Full Redeploy

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
bash scripts/deploy.sh
```

### Step 4: If Database Unreachable

```bash
# Check postgres container
docker compose -f docker-compose.prod.yml --env-file .env.prod logs postgres

# Restart postgres (will trigger backend restart too)
docker compose -f docker-compose.prod.yml --env-file .env.prod restart postgres

# Wait ~30s then check backend health
curl https://api.yourdomain.com/api/v1/health
```

---

## P1 — Data Loss / Accidental Delete

### Restore from Backup

```bash
# List available backups
ls -lh backups/

# Stop backend (prevent writes during restore)
docker compose -f docker-compose.prod.yml --env-file .env.prod stop backend

# Restore latest backup (replace FILENAME)
source .env.prod
gunzip -c backups/fixitpro_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Restart backend
docker compose -f docker-compose.prod.yml --env-file .env.prod start backend
```

> Always test the restore in a staging environment first when possible.

---

## P1 — SSL Certificate Expired

```bash
# Force renew
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm certbot renew --force-renewal

# Reload nginx
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec nginx nginx -s reload

# Verify
echo | openssl s_client -connect api.yourdomain.com:443 2>/dev/null \
  | openssl x509 -noout -enddate
```

---

## P2 — Stuck Shift (Can't Close)

A shift stays open if the staff member's session is lost or the browser crashed.

```bash
# List all open shifts
bash scripts/admin.sh list-shifts

# Force close by shift ID
bash scripts/admin.sh force-close-shift <SHIFT_ID>
```

---

## P2 — User Can't Log In

```bash
# Reset user password
bash scripts/admin.sh reset-password user@example.com
```

Then communicate the new password to the user securely (phone call, not SMS/email if possible).

---

## P2 — Compromised Account

```bash
# Immediately disable the account
bash scripts/admin.sh disable-user compromised@example.com

# Check recent activity (admin log)
grep "compromised@example.com" /var/log/fixitpro-admin.log

# Re-enable after investigation + password reset
bash scripts/admin.sh reset-password compromised@example.com
bash scripts/admin.sh enable-user compromised@example.com
```

---

## P2 — High CPU / Memory

```bash
# Check Docker resource usage
docker stats --no-stream

# Check slow database queries
bash scripts/admin.sh slow-queries

# Check disk space
df -h
bash scripts/admin.sh db-size

# If disk > 85%, clean up old Docker images
docker image prune -f
docker system prune -f  # removes stopped containers + dangling images
```

---

## P3 — Subscription Expired

```bash
# Check current status
bash scripts/admin.sh subscription-status

# Extend by N days
bash scripts/admin.sh extend-subscription 30
```

---

## P3 — Backend Out of Memory (OOM Kill)

```bash
# Check if container restarted
docker inspect fixitpro_backend --format='{{.RestartCount}}'

# Increase Node.js heap (edit docker-compose.prod.yml)
# Under backend → environment, add:
# NODE_OPTIONS=--max-old-space-size=512

# Then redeploy backend
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --no-deps backend
```

---

## Rollback to Previous Version

If a new deploy broke production:

```bash
cd /home/appuser/fixitpro

# Find the previous working commit
git log --oneline -10

# Roll back code
git checkout <previous-commit-hash>

# Redeploy
bash scripts/deploy.sh
```

> Note: Never rollback the database schema — it may break the old code in different ways. Assess data impact before rolling back.

---

## Emergency Contacts

Update this section with your actual contacts:

| Role | Name | Contact |
|------|------|---------|
| Owner / Decision Maker | — | — |
| Developer / DevOps | — | — |
| Hosting Provider Support | — | — |

---

## Audit Log

All admin actions are logged:

```bash
# View recent admin actions
tail -50 /var/log/fixitpro-admin.log

# Search for specific user actions
grep "email=user@example.com" /var/log/fixitpro-admin.log

# View today's actions
grep "$(date '+%Y-%m-%d')" /var/log/fixitpro-admin.log
```

---

## Post-Incident Checklist

After resolving any P1/P2 incident:

- [ ] System health check: `bash scripts/validate.sh`
- [ ] Confirm backup ran successfully: `ls -lh backups/`
- [ ] Review audit log for any unexpected actions
- [ ] Document: what happened, root cause, resolution, prevention
- [ ] If data was restored — notify shop owner of any lost transactions
