# FixITPro — Production Deploy Checklist

> **Rule**: PROD DB is never touched during development. Additive migrations only. Never reset or drop DB.
> **ห้ามใช้ migrate dev บน PROD | ห้าม reset/drop PROD DB | backup ก่อน deploy ทุกครั้ง**

---

## 0. Pre-Deploy Environment Validation

```powershell
# Run this FIRST — fails fast if env files are wrong
.\scripts\validate-prod-env.ps1
```

- [ ] `validate-prod-env.ps1` exits with 0 (all checks PASS)
- [ ] No FAIL items (WARN items are acceptable with documented reason)
- [ ] `backend/.env.production` → NODE_ENV=production, PORT=3000, DATABASE_URL=fixitpro_prod
- [ ] `web-app/.env.production` → NEXT_PUBLIC_API_URL=http://192.168.1.171:3000/api/v1
- [ ] `web-app/.env.apk.production` → CAPACITOR_SERVER_URL=http://192.168.1.171:3001

---

## 0b. Backup Before Deploy

```powershell
# Always backup PROD DB before deploying
# ห้าม deploy โดยไม่มี backup

# Option 1: Manual pg_dump
pg_dump -U postgres -d fixitpro_prod -F c -f "D:/FixITPro/backups/pre-deploy-$(Get-Date -Format 'yyyyMMdd-HHmm').dump"

# Option 2: Trigger API backup (if PROD is running)
# POST http://192.168.1.171:3000/api/v1/backup/manual  (OWNER token)
```

- [ ] Pre-deploy backup created and verified

---

## 1. Pre-Deploy Build Verification (run in DEV first)

- [ ] `cd backend && npx tsc --noEmit` — zero errors
- [ ] `cd backend && npm run build` — dist/ generated clean
- [ ] `cd web-app && npx tsc --noEmit` — zero errors
- [ ] `cd web-app && npm run build` — .next/ generated clean
- [ ] `cd backend && npx prisma validate` — schema valid
- [ ] `cd backend && npx prisma migrate status` — all migrations Applied, none Pending

---

## 2. Environment Variables

### Backend (`backend/.env.production`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | YES | `postgresql://<user>:<pass>@<host>:5432/fixitpro_prod` |
| `PORT` | YES | `3000` (or your PROD port) |
| `JWT_SECRET` | YES | Min 32 chars, random. **Never reuse DEV secret.** |
| `JWT_EXPIRES_IN` | YES | `7d` |
| `NODE_ENV` | YES | `production` |
| `BACKUP_DIR` | YES | Absolute path to backup storage (e.g. `D:\FixITPro_Backups`) |
| `UPLOADS_DIR` | YES | Absolute path for repair image uploads (e.g. `D:\FixITPro_Prod_Uploads\repairs`) |
| `DB_USER` | — | Only needed if direct psql scripts run separately |
| `DB_PASSWORD` | — | Only needed if direct psql scripts run separately |

### Frontend (`web-app/.env.production`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | YES | Full URL to backend API: `https://api.yourdomain.com/api/v1` |

---

## 3. Database Migration

```bash
cd backend
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

- `migrate deploy` only — never `migrate dev` or `migrate reset` on PROD
- All 34+ migrations are applied in order; the last one is `20260524030000_add_branches`
- After migration, run `npx prisma generate` to regenerate the client if deploying fresh

---

## 4. First-Time PROD Setup (run once after migration)

### 4a. Create OWNER account
```
POST /api/v1/auth/register
{ email, password, name, role: "OWNER" }
```
Or use the admin seed script if one exists.

### 4b. Create Default Branch
- Log in as OWNER
- Go to **จัดการ → สาขา** → Add branch, check **สาขาหลัก (default)**
- At least one branch must exist as the default

### 4c. Configure Shop Settings
- Go to **ตั้งค่า** → fill in:
  - ชื่อร้าน (shop name)
  - คำบรรยาย (subtitle)
  - Logo URL (optional)
  - Receipt header/footer
  - Tax settings

### 4d. Seed Role Permissions
- Go to **จัดการ → สิทธิ์การใช้งาน**
- Assign permissions for each role (MANAGER, CASHIER, TECHNICIAN, STOCK_STAFF)
- OWNER and SUPER_ADMIN get all permissions automatically from `ALL_PERMISSIONS`

### 4e. Create Employee Accounts
- Go to **จัดการ → พนักงาน** → create accounts and assign branches
- Ensure each non-OWNER user has a `branchId` set

---

## 5. Security Checklist

- [ ] `JWT_SECRET` is at least 32 random characters (not `your_secret_key`)
- [ ] PROD database has a strong password (not `123456`)
- [ ] CORS origin is locked to your frontend domain in `backend/src/main.ts`
- [ ] `NODE_ENV=production` — disables stack traces in error responses
- [ ] HTTPS is terminated at the reverse proxy (nginx/Caddy) — backend runs HTTP internally
- [ ] BACKUP_DIR and UPLOADS_DIR are outside the app directory (not inside `dist/`)
- [ ] PROD DB user has only the privileges Prisma needs (no superuser)
- [ ] Firewall: PostgreSQL port (5432) not exposed publicly

---

## 6. CORS Configuration Check

Open `backend/src/main.ts` and confirm the CORS origin is not `*` in production:

```typescript
// Should be:
app.enableCors({ origin: 'https://yourfrontend.com', credentials: true })
// NOT:
app.enableCors({ origin: '*' })
```

---

## 7. Permission Guard Performance Note

`PermissionGuard` currently queries `rolePermission` on every protected request. For high-traffic PROD, consider replacing the DB lookup with `user.permissions.includes(permission)` using the JWT-embedded permissions. This is a latency optimization, not a correctness issue — OWNER/SUPER_ADMIN still bypass via role check.

---

## 8. Deployment Steps (standard)

```powershell
# 0. Validate env files first (ALWAYS)
.\scripts\validate-prod-env.ps1
# Must exit 0 before proceeding

# 1. Pull latest code on PROD server
git pull origin main

# 2. Install dependencies
cd backend; npm ci --omit=dev
cd ../web-app; npm ci --omit=dev

# 3. Apply migrations (NEVER migrate reset/dev) — ห้ามใช้ migrate dev หรือ reset
cd ../backend
$env:DATABASE_URL = "postgresql://postgres:PASS@localhost:5432/fixitpro_prod?connection_limit=10"
npx prisma migrate deploy    # deploy only — never migrate dev, never migrate reset
npx prisma generate

# 4. Build backend
npm run build

# 5. Build frontend (uses .env.production automatically)
cd ../web-app
npm run build

# 6. Restart services (pm2 example)
pm2 restart fixitpro-backend
pm2 restart fixitpro-frontend

# 7. Run PROD smoke test
cd ../
.\scripts\smoke-test-prod.ps1
```

## 8b. PROD APK Build

```powershell
# Build PROD APK (after frontend is built and deployed to 192.168.1.171:3001)
cd web-app

# Sync Capacitor with PROD server URL (com.fixitpro.pos)
npm run apk:prod:sync   # sets CAPACITOR_SERVER_URL=http://192.168.1.171:3001

# Build PROD APK (prod flavor, debug signing for LAN)
npm run apk:prod:build  # runs: cd android && .\gradlew assembleProdDebug

# Install to connected SUNMI device
npm run apk:prod:install
# Path: android/app/build/outputs/apk/prod/debug/app-prod-debug.apk
```

**APK Safety rules:**
- `npm run apk:prod` → always uses PROD IP (192.168.1.171) — do NOT edit inline
- `npm run apk:dev` → always uses DEV IP (192.168.1.172) — kept separate
- Never run plain `npx cap sync android` — always use apk:dev or apk:prod scripts

---

## 9. Post-Deploy Smoke Tests

```powershell
# Automated PROD smoke test (read-only, 16 checks)
.\scripts\smoke-test-prod.ps1
```

Manual checks after smoke test:
- [ ] `GET /api/v1/health` → `{ status: "ok" }`
- [ ] Login as OWNER → JWT returned, branchId in payload
- [ ] Open shift → shift created with correct branchId
- [ ] Create a sale → sale saved with branchId
- [ ] Open `/branches` → branch list loads
- [ ] Open `/audit-logs` → entries visible to OWNER
- [ ] Trigger backup → file created in BACKUP_DIR
- [ ] Non-OWNER user cannot see other branch's data
- [ ] SUNMI APK (com.fixitpro.pos) loads without white screen
- [ ] APK can login and complete a POS sale

---

## 10. Rollback Plan

- Migrations are additive (no column drops) — rolling back the app to the previous build is safe without reverting migrations
- If a migration must be reverted: manually write a reverse SQL — never use `migrate reset`
- Keep the previous `dist/` build archived before deploying so a rollback is a simple process restart

---

## Known Limitations (resolve before full PROD launch)

| Issue | Impact | Fix |
|---|---|---|
| `PermissionGuard` does a DB query per request | Latency on protected endpoints | Use `user.permissions.includes(permission)` from JWT |
| `X-Branch-Id` header set by frontend but not read by backend | Cosmetic only — scoping uses JWT | Document or remove from frontend interceptor |
| No refresh token — JWT expires after 7d | Users logged out after 7 days | Implement refresh token flow |
| Repair images stored on local disk | Data loss risk if server is replaced | Migrate to object storage (S3/Cloudflare R2) |
