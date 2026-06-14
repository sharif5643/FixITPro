# Coolify Deploy Prep (2026-06-14)

## What Was Done

Prepared FixITPro for Coolify deployment. No business logic changed. No new features.

---

## Files Added

### `docker-compose.coolify.yml` (new — root)

Coolify-compatible compose file with 3 services only:
- `postgres` (postgres:15-alpine, healthcheck, internal network only)
- `backend` (NestJS, `expose: 3000`, depends_on postgres healthy)
- `frontend` (Next.js standalone, `expose: 3000`, depends_on backend)

Key differences from `docker-compose.prod.yml`:
- No `nginx` service (Coolify Traefik handles SSL + routing)
- No `certbot` service
- No `redis` service (not used in backend code)
- No `ports:` host binding on 80/443 (Coolify manages externally)
- Uses `expose:` to document container ports for Coolify UI

---

## Files Modified

### `backend/package.json`
- `start:prod`: `set NODE_ENV=production && node dist/main` → `node dist/main`
- `set` is Windows CMD syntax; NODE_ENV is set via Docker environment variables

### `backend/.env.production.example`
- Removed Windows absolute paths (`D:\FixITPro_Prod_Uploads`, `D:\FixITPro_Backups`, `D:\FixITPro\backend\logs`)
- `BACKUP_DIR` → `/app/backups` (Docker container path, matches volume mount)
- `UPLOADS_BASE_DIR` / `UPLOADS_DIR` removed (Docker uses fixed `/app/uploads` via entrypoint)
- `CORS_ORIGIN` example updated to HTTPS domain format
- `DATABASE_URL` updated to use Docker service name `postgres` as host
- Added note clarifying Docker vs direct VPS deployment

### `.env.prod.example` (root)
- Removed Redis section (`REDIS_PASSWORD`) — Redis removed from Coolify compose
- Removed old `APP_VERSION` tag at top; moved to bottom as optional
- Added `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL` fields (were missing)
- Added comment distinguishing Mode A (VPS+nginx) vs Mode B (Coolify)
- `CERTBOT_EMAIL` kept but marked nginx-mode only

### `.gitignore` (root)
- Removed `!.env.apk.local` whitelist — `.env.apk.local` contains LAN IPs, should be gitignored
- `.env.apk` (template, no secrets) remains tracked with clarifying comment

---

## Verification Results

| Check | Result |
|-------|--------|
| `backend: npm run build` | ✅ 0 errors |
| `frontend: npm run build` | ✅ 0 errors, 72/72 pages |
| `npx prisma validate` | ✅ schema valid |
| compose YAML structure | ✅ no 80/443 ports, no redis/nginx/certbot, all required services/volumes present |
| `start:prod` Linux syntax | ✅ `node dist/main` |
| Windows paths in .env examples | ✅ none found |
| `.env.apk.local` gitignore | ✅ no longer whitelisted |

---

## Coolify Deploy — Required Environment Variables

Set these in **Coolify UI → Environment Variables** before first deploy:

```
POSTGRES_DB=fixitpro
POSTGRES_USER=fixitpro_user
POSTGRES_PASSWORD=<openssl rand -base64 32>
JWT_SECRET=<openssl rand -base64 64>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://app.yourshop.com
NEXT_PUBLIC_API_URL=https://api.yourshop.com/api/v1
```

## Coolify Deploy — Domain Routing (configure in Coolify UI)

| Service | Domain | Container Port |
|---------|--------|----------------|
| `frontend` | `app.yourshop.com` | 3000 |
| `backend` | `api.yourshop.com` | 3000 |

---

## Remaining Issues

### P1 (should fix before high traffic)
- `PermissionGuard` does a DB query per protected request — known, documented in PROD_DEPLOY_CHECKLIST.md
- No refresh token — JWT expires after 8h, users must re-login
- Repair images on Docker volume only — no S3/R2 backup if server is replaced

### P2 (post-launch)
- Thermal printer: browser `window.print()` only — no native ESC/POS
- No Service Worker / offline support
- `prisma:migrate` script label points to `migrate dev` (dev-only, confusing name)
- `<img>` tags in receipt/repair components (Next.js Image optimization warnings)
