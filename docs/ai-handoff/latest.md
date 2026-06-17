# Production Deployment Fixes (2026-06-16)

## What Was Done

Fixed three production-blocking issues on the live Coolify deployment at `91.98.151.10`. This was hands-on production debugging (SSH + Coolify internals), not local code changes for most of it — see below for what's actually in the repo vs. what's only in Coolify's database.

---

## 1. Production seed scripts couldn't run in Docker (repo change, committed `a9ffa10`)

**Problem**: `npm run seed:prod-super-admin` / `seed:prod-owner` failed in the production container because `npm prune --omit=dev` stripped `ts-node`/`typescript`.

**Fix**:
- Moved `ts-node` and `typescript` from `devDependencies` to `dependencies` in `backend/package.json`
- Switched all seed/script npm scripts to `ts-node --transpile-only` (avoids needing devDependency-only `@types/*` packages for full type-checking)
- Added `COPY` of `scripts/` and `tsconfig.json` into `backend/Dockerfile` runner stage
- Verified locally with `npm run build`

## 2. Hardcoded `:3000` in production API URL (repo change, committed `64abc5c`)

**Problem**: `docker-compose.coolify.yml` had `NEXT_PUBLIC_API_URL: http://91.98.151.10:3000/api/v1` baked into the frontend build — violates "no hardcoded port in production" requirement.

**Fix**: Changed to `http://91.98.151.10/api/v1` in `docker-compose.coolify.yml`.

**Caveat discovered later**: this alone was insufficient — see issue 3.

## 3. Login returned 405, backend completely unreachable publicly (Coolify DB fix, NOT in repo)

**Root cause** (two layers, both inside Coolify's own Postgres DB, not in this repo):

a) Coolify's `environment_variables` table had 3 duplicate/corrupted rows for `NEXT_PUBLIC_API_URL` (one `NULL`, one empty value with the correct URL stuck in the `comment` field instead) — these silently overrode the compose file's build arg, so frontend builds kept baking in an empty API URL regardless of what was in `docker-compose.coolify.yml`. Fixed by editing rows directly via `php artisan tinker` + Eloquent inside the `coolify` container.

b) **Bigger issue**: Coolify generates Traefik routing per-service from `applications.docker_compose_domains` (a DB column), not from compose file labels. Only `frontend` had a domain assigned (`http://91.98.151.10:3000` → generates `Host(...) && PathPrefix('/')`, a catch-all). `backend` had **no domain at all**, so it had zero public routes — all traffic including `/api/v1/*` was hitting the Next.js frontend, which returned 405 for the login POST.

**Fix** (applied entirely via Coolify's DB + its own redeploy job, see [[fixitpro-coolify-debug-toolkit]] memory):
- Set `docker_compose_domains.backend.domain = "http://91.98.151.10/api"` → generates `PathPrefix('/api')` for backend
- Set `application_settings.is_stripprefix_enabled = false` (otherwise Traefik strips `/api` before forwarding, breaking NestJS's `api/v1` global prefix)
- Triggered redeploy via `queue_application_deployment()`, polled to `finished`

**Verified working**:
```
POST http://91.98.151.10/api/v1/auth/login → 201, returns user + permissions
GET  http://91.98.151.10/                  → 200 (frontend unaffected)
```

**Full detail saved in persistent memory** (not just this doc): `project_fixitpro_deployment.md` and `fixitpro_coolify_debug_toolkit.md` in the agent's memory store — these explain the Coolify routing architecture and give reusable SSH/tinker commands for future deploys.

**CSP `eval()` warning** seen in user's screenshots: investigated, confirmed production currently sends **no** `Content-Security-Policy` header at all (no nginx in this deployment path — the CSP config in `nginx/templates/app.conf.template` isn't wired into `docker-compose.coolify.yml`). Likely stale browser state from before the 405 fix; not an active issue.

---

## State of Coolify's DB (informational — lives outside this repo, will NOT survive a Coolify reinstall/migration)

- `applications.docker_compose_domains` = `{"backend":{"domain":"http://91.98.151.10/api"},"frontend":{"domain":"http://91.98.151.10:3000"}}`
- `application_settings.is_stripprefix_enabled` = `false`
- `environment_variables` row for `NEXT_PUBLIC_API_URL` (non-preview) = `http://91.98.151.10/api/v1`

If this Coolify instance is ever rebuilt/migrated, these three settings need to be reapplied manually (or this doc/memory used as the runbook).

---

## Remaining Issues (carried over, still open)

### P1 (should fix before high traffic)
- `PermissionGuard` does a DB query per protected request
- No refresh token — JWT expires after 8h, users must re-login
- Repair images on Docker volume only — no S3/R2 backup if server is replaced
- Production secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN: "*"`) are hardcoded in `docker-compose.coolify.yml` rather than Coolify env vars — flagged earlier in session, not yet actioned, needs explicit go-ahead before touching since it's a credential-rotation change

### P2 (post-launch)
- Thermal printer: browser `window.print()` only — no native ESC/POS (note: SUNMI APK has native ESC/POS, this applies to desktop web only)
- No Service Worker / offline support on desktop web (SUNMI APK has its own offline queue)
- `<img>` tags in receipt/repair components (Next.js Image optimization warnings)
