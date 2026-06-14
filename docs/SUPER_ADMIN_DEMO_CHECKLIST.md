# Super Admin V2 — Demo Checklist

**Wednesday presentation pre-flight. Complete all items before screen share.**

---

## Environment

- [ ] Backend running: `cd D:\FixITPro\backend && npm run start:dev`
  - Confirm: no red errors in terminal
  - Confirm: `Nest application successfully started` in logs
  - URL: http://localhost:3000/api/v1

- [ ] Frontend running: `cd D:\FixITPro\web-app && npm run dev`
  - Confirm: `✓ Ready in` shown in terminal
  - URL: http://localhost:3001

- [ ] Database accessible: PostgreSQL at localhost:5432/fixitpro
  - Quick check: open Prisma Studio `npx prisma studio` or just try login

---

## Login

- [ ] Open http://localhost:3001/login in Chrome
- [ ] Login with: `superadmin@fixitpro.com` / `admin1234`
- [ ] Confirm: redirected to `/super-admin` Dashboard
- [ ] Confirm: no red console errors (F12 → Console tab)

---

## Demo Data

- [ ] Run seed if not done: `cd D:\FixITPro\backend && npm run seed:demo`
- [ ] Confirm 5 demo tenants exist: Charif PC & All, TJ Computer, Smart Fix Thailand, BB IT Service, PhoneHub Krabi
- [ ] Confirm status variety visible on Tenants list: ACTIVE (green), SUSPENDED (orange), EXPIRED (red), PENDING (blue)
- [ ] Confirm Analytics shows MRR > 0 (needs at least 1 activated payment in last 30 days)
- [ ] Confirm Audit Logs shows variety: TENANT_CREATED, ACTIVATE, PAYMENT_VERIFIED, PAYMENT_REJECTED

---

## Page Load Check (Quick)

Open each URL and confirm it loads without error:

- [ ] `/super-admin` — Dashboard
- [ ] `/super-admin/tenants` — Tenants list
- [ ] `/super-admin/tenants/:id` — Pick any active tenant, verify detail tabs load
- [ ] `/super-admin/analytics` — MRR/ARR cards + charts visible
- [ ] `/super-admin/audit-logs` — Event list visible
- [ ] `/super-admin/branches` — Branches list with tenant column
- [ ] `/super-admin/users` — Users list with role badges
- [ ] `/super-admin/payments` — Payments list
- [ ] `/super-admin/settings` — Platform/Security/Shop settings visible

---

## Actions (Pre-demo Smoke Test)

- [ ] Tenants → Renew one tenant → Status updates to ACTIVE
- [ ] Payments → Verify one PENDING payment → Status changes
- [ ] Settings → Edit shop name → Save → Confirm update persists

---

## Browser / Display

- [ ] Browser: Chrome (latest), no extensions that inject scripts
- [ ] Browser zoom: **90%** recommended (fits all columns on 1920px), **100%** max
- [ ] Screen resolution: 1920×1080 or higher
- [ ] Dark theme: already applied (no action needed — app is dark-mode only)
- [ ] Close unneeded tabs to avoid notification noise

---

## No Red Console Errors

- [ ] Open DevTools (F12) → Console tab
- [ ] Navigate through all pages — confirm no red errors
- [ ] Yellow warnings are OK (React hydration minor warnings are expected)
- [ ] Network tab: confirm API calls return 200 (no 401 / 500)

---

## Post-Demo Reset (Optional)

If the demo modifies data (e.g., renew an EXPIRED tenant), you can restore:
- Re-run `npm run seed:demo` — it will upsert tenants back to demo state
- Or manually re-suspend / expire from the UI (for next presentation)

---

## Emergency Fallback

If backend fails to start:
1. Kill port 3000: `npx kill-port 3000` (or Task Manager → node.exe)
2. Restart: `npm run start:dev`

If frontend fails:
1. Delete `.next` cache: `Remove-Item D:\FixITPro\web-app\.next -Recurse -Force`
2. Restart: `npm run dev`

If login fails (wrong password):
1. Run: `node scripts/reset-dev-owner-password.js` from backend dir (for owner@fixitpro.com)
2. For superadmin: the superadmin password is always `admin1234` after initial seed
