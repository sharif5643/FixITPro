# CHB-01 Pre-Implementation Review
**HTTP-only Cookie Authentication — Conditions for Implementation**

> **Status:** Awaiting approval — DO NOT implement until this document is approved.
> **Date:** 2026-06-01
> **Prerequisite reading:** `docs/security/chb-01-auth-migration-plan.md`
> **Scope:** This document does NOT modify any code. It documents verification checks
> and phased plan structure required before the first line of implementation is written.

---

## 1. Cookie Compatibility Verification

Each environment must satisfy the conditions below before Phase 1 implementation begins.

### 1.1 `app.fixitpro.app` (production web dashboard)

| Check | Expected | Verification method |
|-------|----------|---------------------|
| Served over HTTPS | Yes — Nginx enforces redirect from 80 → 443 | `nginx/templates/app.conf.template` confirms `return 301 https://` |
| `Secure` cookie attribute required | Yes | Backend: `secure: process.env.NODE_ENV === 'production'` |
| Cookie same-site with API (`api.fixitpro.app`) | Yes — both share eTLD+1 `fixitpro.app` | RFC 6265bis: same registrable domain = same-site; `SameSite=Strict` is safe |
| Nginx strips `Set-Cookie` | No — must confirm | `app.conf.template` has no `proxy_hide_header Set-Cookie`; re-verify if `nginx.conf` adds one at the `http {}` level |
| `CORS_ORIGIN` includes `app.fixitpro.app` | Required | `main.ts` already enforces CORS_ORIGIN in prod; value must be set in `.env.prod` |

**Blocker before Phase 1:** Confirm `nginx.conf` global context has no `proxy_hide_header Set-Cookie` directive.

---

### 1.2 `api.fixitpro.app` (production backend)

| Check | Expected | Verification method |
|-------|----------|---------------------|
| Served over HTTPS | Yes | `app.conf.template` — separate SSL server block for `${API_DOMAIN}` |
| Cookie sent from `app` origin to `api` | Yes — same-site (see §1.1) | No cross-site context; `SameSite=Strict` allows the request |
| `credentials: true` in CORS | Already set | `main.ts:46` — `app.enableCors({ credentials: true })` |
| `cookie-parser` installed | NOT YET | Must install before backend deployment: `npm install cookie-parser @types/cookie-parser` |
| `app.use(cookieParser())` in `main.ts` | NOT YET | Required before `res.cookie()` calls will be read by `req.cookies` |
| Rate limit on `/api/v1/auth/login` | Already set | `app.conf.template:64-68` — `limit_req zone=api_auth burst=5 nodelay` |

**Blocker before Phase 1:** `cookie-parser` is not yet installed. No code change is made in this document; installation is a Phase 1 task.

---

### 1.3 `localhost` (development environment)

| Check | Expected | Verification method |
|-------|----------|---------------------|
| HTTPS required for `Secure` | No — dev uses HTTP | Backend: `secure: process.env.NODE_ENV === 'production'` — `Secure` is omitted in dev |
| `SameSite=Strict` works on localhost | Yes — browser treats `localhost` as same-site | No additional config needed |
| `CORS_ORIGIN` in dev | `true` (open) | `main.ts:46` — when `corsOrigin` is falsy, `origin: true` is used |
| Port separation (`localhost:3000` app ↔ `localhost:4000` api) | Treated as different origins by browser | Because ports differ, `withCredentials: true` on Axios is required even in dev |
| Dev cookie readable in browser DevTools | Yes — `HttpOnly` blocks JS but DevTools Application tab shows it | Use to confirm cookie is set after login |

**Action before Phase 1:** Verify that `.env.development` has `PORT=4000` for the backend (main.ts already warns if dev starts on 3000).

---

### 1.4 SUNMI WebView (Capacitor APK on Android)

| Check | Expected | Verification method |
|-------|----------|---------------------|
| HttpOnly cookie supported in AndroidWebView | Yes — AndroidWebView is Chromium-based | Full cookie support; cookie jar persists across app restarts |
| Firmware target | Android 10+ (Chromium 80+) | `SameSite=Strict` enforcement requires Chromium ≥ 80. Must confirm target SUNMI model firmware version before deploy |
| `Secure` cookie works in APK | Yes — APK calls `api.fixitpro.app` over HTTPS | Same as production web; `Secure` attribute is satisfied |
| `withCredentials: true` in Capacitor context | Required | Axios instance must set `withCredentials: true`; WebView cookie jar will be used |
| Capacitor HTTP plugin bypass risk | Must audit | If any request uses `@capacitor/http` instead of Axios, cookies are NOT sent. Audit all API calls before Phase 1 |
| Cookie cleared on logout | Must verify | Pair `res.clearCookie()` on backend with `WebView.clearCache()` if needed for APK cookie jar flush |
| SUNMI platform detection | `platform.ts` → `isSunmiShell()` | Detection is unaffected by this migration; no change to `platform.ts` needed |

**Blocker before Phase 1:** Confirm SUNMI device firmware version. If Android 8/9 is in use, `SameSite=Strict` may silently fail — test on physical device before production deploy.

**Blocker before Phase 1:** Audit codebase to confirm zero use of `@capacitor/http` for authenticated API calls.

---

## 2. Middleware Route Audit

No `middleware.ts` currently exists in the web-app. Phase 1 introduces it.

### 2.1 Protected Routes (require valid `access_token` cookie)

These routes must redirect to `/login` if the cookie is absent:

| Route pattern | Group | Notes |
|---------------|-------|-------|
| `/` | Dashboard root | Default landing after login |
| `/(dashboard)/*` | All dashboard pages | 30+ routes: products, sales, repairs, customers, reports, etc. |
| `/change-password` | Standalone page | Requires authenticated user |
| `/print/sale/[id]` | Print preview | Requires auth; receipt data is fetched server-side |
| `/print/repair/[id]` | Print preview | Requires auth |
| `/sunmi/*` | SUNMI shell routes | All SUNMI pages require auth (dashboard, sales, repairs, etc.) |
| `/super-admin/*` | Super-admin panel | Additionally IP-restricted by Nginx; middleware still enforces cookie |

Full protected route list (from `web-app/src/app/` directory scan):

```
/
/(dashboard)/analytics
/(dashboard)/audit-logs
/(dashboard)/backup
/(dashboard)/barcode-print
/(dashboard)/branches
/(dashboard)/categories
/(dashboard)/claims
/(dashboard)/customers
/(dashboard)/customers/[id]
/(dashboard)/data-tools
/(dashboard)/debt
/(dashboard)/employees
/(dashboard)/expenses
/(dashboard)/notifications
/(dashboard)/products
/(dashboard)/purchase-orders
/(dashboard)/repairs
/(dashboard)/repairs/[id]
/(dashboard)/reports
/(dashboard)/reports/daily-closing
/(dashboard)/reports/payables
/(dashboard)/reports/profit
/(dashboard)/roles
/(dashboard)/sales
/(dashboard)/serials
/(dashboard)/settings
/(dashboard)/shifts
/(dashboard)/subscription
/(dashboard)/suppliers
/(dashboard)/suppliers/[id]/payables
/(dashboard)/technicians
/(dashboard)/technicians/[id]
/(dashboard)/transfers
/(dashboard)/warranties
/change-password
/print/sale/[id]
/print/repair/[id]
/sunmi
/sunmi/daily-summary
/sunmi/dashboard
/sunmi/debt
/sunmi/expenses
/sunmi/notifications
/sunmi/printer-test
/sunmi/repair-intake
/sunmi/repairs
/sunmi/sales
/sunmi/sales/history
/sunmi/shifts
/sunmi/sim-sales
/sunmi/stock
/sunmi/sunmi-health
/sunmi/transfers
/super-admin/subscriptions
/super-admin/tenants
```

---

### 2.2 Public Routes (no cookie required)

These routes must be reachable without authentication:

| Route | Reason |
|-------|--------|
| `/login` | Auth entry point — no cookie exists yet |
| `/(auth)/login` | Next.js route group alias for `/login` |
| `/(dashboard)/403` | Rendered after auth but permission denied — must not redirect-loop |

**Decision required:** `/change-password` is a standalone page outside `(dashboard)`. Determine whether it requires the cookie (user is already logged in) or is accessible to unauthenticated users (e.g., for a password-reset flow). Current code at `web-app/src/app/change-password/page.tsx` suggests it is post-login only. **Treat as protected.**

---

### 2.3 Matcher Verification

The Next.js middleware `matcher` must include all app routes and exclude static assets. The proposed pattern from the design plan is:

```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
}
```

Verification checklist:

| Pattern excluded | Why | Status |
|-----------------|-----|--------|
| `_next/static` | Hashed JS/CSS bundles — no auth needed | Included in exclusion |
| `_next/image` | Next.js image optimizer | Included in exclusion |
| `favicon.ico` | Browser prefetch — no auth | Included in exclusion |
| `uploads` | Repair images served by Nginx directly; also served as static by NestJS at `/uploads` path | Included in exclusion |
| `api/v1/*` | Backend routes are NOT served through the Next.js frontend | N/A — middleware only runs on Next.js pages |

**Open question for approval:** The `/sunmi-health` route (`web-app/src/app/sunmi-health/`) is a health-check endpoint. Confirm whether it should be public (accessible without cookie for uptime monitoring) or protected. If public, add `sunmi-health` to the exclusion pattern.

---

## 3. Cookie-Only Migration Plan (Phase 1 — No CSRF)

CSRF is explicitly deferred to Phase 2 (see §4). Phase 1 delivers the security benefit of moving the JWT from `localStorage` to an HttpOnly cookie. `SameSite=Strict` provides primary CSRF protection during the Phase 1 window.

### Phase 1 scope

**What changes:**
- Backend sets `access_token` as HttpOnly cookie on login
- Backend adds `/auth/logout` endpoint that clears the cookie
- Backend `JwtStrategy` reads from cookie first, falls back to Bearer header (transition safety)
- Frontend removes `accessToken` from Zustand store
- Frontend adds `withCredentials: true` to Axios
- Frontend removes the Bearer token interceptor
- Next.js middleware (`middleware.ts`) created for server-side route protection

**What does NOT change in Phase 1:**
- No CSRF tokens, no `csrf_token` cookie, no `X-CSRF-Token` header
- No CSRF guard middleware
- No `GET /auth/csrf` endpoint
- No changes to `/auth/register`
- No changes to `JwtStrategy.validate()` logic
- No database changes

### Phase 1 backend steps (ordered)

1. `npm install cookie-parser @types/cookie-parser`
2. `main.ts` — add `app.use(cookieParser())`
3. `auth.controller.ts` — login sets `access_token` cookie; add `/auth/logout` endpoint
4. `auth.service.ts` — login return value removes `accessToken` from response body
5. `jwt.strategy.ts` — change extractor to: cookie first, Bearer fallback

### Phase 1 frontend steps (ordered)

1. `auth.store.ts` — remove `accessToken` from state and persistence; update `setAuth` to 2-argument signature
2. `api.ts` — remove Bearer interceptor; add `withCredentials: true`; update 401 handler (no localStorage to clear)
3. `login/page.tsx` — update `setAuth` call to match new 2-argument signature
4. `middleware.ts` — create new file with cookie check and route matcher
5. `(dashboard)/layout.tsx` — change guard from `accessToken` to `user`
6. All logout trigger sites — add `api.post('/auth/logout')` before `clearAuth()`

### Phase 1 verification gates (before merging)

- [ ] Login response sets `access_token` cookie with `HttpOnly` flag (verify in browser DevTools → Application → Cookies)
- [ ] `document.cookie` does NOT contain `access_token` (verified in browser console)
- [ ] `localStorage.getItem('fixitpro-auth')` contains no `accessToken` field after login
- [ ] Authenticated page refresh without Zustand state still loads (cookie carries auth)
- [ ] Logout clears cookie (`Set-Cookie: access_token=; Max-Age=0`)
- [ ] Unauthenticated request to a protected route redirects to `/login` (middleware, not client JS)
- [ ] SUNMI APK: login → persist → app restart → still authenticated (manual device test)
- [ ] Bearer token from an old APK build is still accepted (fallback remains active in Phase 1)

---

## 4. CSRF Phase 2 Plan (Separate Rollout)

CSRF Phase 2 begins only after Phase 1 has been in production for **a minimum of 30 days** with no regressions. It is a separate PR/deploy with its own approval gate.

### Why separate?

- Phase 1 already achieves meaningful security improvement (`localStorage` → HttpOnly cookie + `SameSite=Strict`).
- CSRF token plumbing (cookie + header + guard) adds surface area. Staging separately reduces blast radius if an issue emerges.
- `SameSite=Strict` provides primary CSRF protection during the Phase 1 window; the incremental risk of deferring the double-submit pattern is low.

### Phase 2 scope

**Adds:**
- `csrf_token` cookie (not HttpOnly, JS-readable) set on login alongside `access_token`
- `GET /auth/csrf` endpoint for refreshing the CSRF token
- `CsrfGuard` (`backend/src/common/guards/csrf.guard.ts`) — validates `X-CSRF-Token` header matches `csrf_token` cookie value
- Axios interceptor reads `csrf_token` from `document.cookie` and adds `X-CSRF-Token` header on POST/PUT/PATCH/DELETE
- `auth.service.ts` — generates `csrfToken` (32 bytes hex) as part of login

**Does NOT change in Phase 2:**
- Cookie attributes for `access_token` (unchanged from Phase 1)
- Route matcher or Next.js middleware
- JWT validation logic

### Phase 2 CSRF guard exemptions

| Route/method | Exempt | Reason |
|--------------|--------|--------|
| `GET *` | Yes | Safe method; no state change |
| `POST /auth/login` | Yes | Unauthenticated; no cookie to steal yet |
| `POST /auth/register` | Yes | Unauthenticated |
| `GET /auth/csrf` | Yes | Token issuance; no state change |
| All other POST/PUT/PATCH/DELETE | No — CSRF required | State-changing; must validate token |

### Phase 2 verification gates

- [ ] `csrf_token` cookie is NOT HttpOnly (readable by `document.cookie`)
- [ ] `X-CSRF-Token` header is present on all non-GET API requests (Network tab)
- [ ] Request with mismatched token returns `403 Forbidden`
- [ ] Request with missing header returns `403 Forbidden`
- [ ] GET requests are not blocked by the guard
- [ ] Login and register are not blocked (guard is not applied to unauthenticated endpoints)
- [ ] SUNMI APK: CSRF header sent correctly from Capacitor WebView context (manual test)

---

## 5. Bearer Fallback Retirement Plan

The Bearer header fallback in `JwtStrategy` is a compatibility bridge for old APK builds that still send `Authorization: Bearer <token>`. It must not be permanent.

### Retirement constraints

- **Minimum transition period: 30 days** after Phase 1 production deploy.
- Retirement is blocked until all deployed APK builds are confirmed to use cookie-based auth.
- Retirement is a separate PR — not bundled with Phase 1 or Phase 2.

### Retirement timeline

| Day | Event |
|-----|-------|
| 0 | Phase 1 deployed to production. Bearer fallback active. Both cookie and Bearer auth accepted. |
| 0–7 | Monitor logs: identify any requests arriving with `Authorization: Bearer` headers (indicates old APK builds still in use). |
| 7–30 | Coordinate APK update rollout. All SUNMI devices must be updated to the Phase 1 APK before retirement. |
| ≥ 30 | Retirement gate review: confirm zero Bearer-authenticated requests in logs over the preceding 7 days. |
| ≥ 30 | If gate passes: open retirement PR. Remove Bearer extractor from `JwtStrategy`. |
| ≥ 30 | If gate fails: extend transition period. Investigate which devices have not updated. |

### Retirement PR scope (future — do not implement now)

Single file change only:

**`backend/src/auth/strategies/jwt.strategy.ts`**

```typescript
// BEFORE (Phase 1 state — both extractors active)
jwtFromRequest: ExtractJwt.fromExtractors([
  (req: any) => req?.cookies?.access_token ?? null,
  ExtractJwt.fromAuthHeaderAsBearerToken(),  // ← REMOVE this line
]),

// AFTER (retirement state — cookie only)
jwtFromRequest: ExtractJwt.fromExtractors([
  (req: any) => req?.cookies?.access_token ?? null,
]),
```

No other files change at retirement.

### Monitoring requirement

Before retirement is approved, the following must be confirmed via server logs or Nginx access logs:

- Zero requests in the past 7 days have been authenticated via Bearer token.
- All active SUNMI devices are on a firmware/APK version that uses cookie auth.

If log instrumentation is not in place to distinguish cookie-auth vs Bearer-auth requests at the time of Phase 1 deploy, add a log line in `JwtStrategy` before Phase 1 ships:

```typescript
// Temporary — remove at Bearer retirement
if (!req?.cookies?.access_token && ExtractJwt.fromAuthHeaderAsBearerToken()(req)) {
  this.logger.warn(`Bearer fallback used: ${req.ip} ${req.url}`)
}
```

---

## Approval Checklist

The following must be confirmed in writing before Phase 1 implementation begins:

### Cookie compatibility
- [ ] SUNMI target device firmware version confirmed (Android 10+ = safe; Android 8/9 = manual test required)
- [ ] Zero use of `@capacitor/http` for authenticated calls confirmed (code audit)
- [ ] Nginx `nginx.conf` global context has no `proxy_hide_header Set-Cookie`
- [ ] `CORS_ORIGIN` value in `.env.prod` includes `app.fixitpro.app`

### Middleware
- [ ] `/sunmi-health` route classification agreed: **public** or **protected**
- [ ] `/change-password` confirmed as **protected** (post-login only; no unauthenticated password reset flow)

### Phase plan
- [ ] Cookie-only Phase 1 (no CSRF) approved as the implementation order
- [ ] CSRF Phase 2 accepted as a separate rollout after minimum 30-day Phase 1 validation
- [ ] Bearer fallback minimum 30-day retirement period accepted
- [ ] Monitoring/logging plan for Bearer fallback usage accepted (or logging instrumentation added at Phase 1)

---

*Implementation begins only after all items above are checked and this document receives explicit written approval.*
