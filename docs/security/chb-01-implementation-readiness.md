# CHB-01 Implementation Readiness
**HTTP-only Cookie Authentication — Pre-Implementation Verification Report**

> **Status:** PHASE 1 COMPLETE — DEV trial passed 2026-06-02. Awaiting SUNMI physical test and PROD deploy approval.
> **Date:** 2026-06-01
> **Approved:** 2026-06-01
> **Phase 1 implemented:** 2026-06-02
> **Prerequisite documents:** `chb-01-auth-migration-plan.md`, `chb-01-pre-implementation-review.md`
> **Verification method:** Static code audit and file inspection only. No code was modified.

---

## Summary

| # | Checklist Item | Status |
|---|---------------|--------|
| 1 | SUNMI target device firmware confirmed | VERIFIED — Android 7.1.2; SameSite=Lax required (see `chb-01-sunmi-android7-impact.md`) |
| 2 | Zero use of `@capacitor/http` confirmed (code audit) | VERIFIED |
| 3 | Nginx `nginx.conf` has no `proxy_hide_header Set-Cookie` | VERIFIED |
| 4 | `CORS_ORIGIN` / deployment target resolved | RESOLVED — see decisions below |
| 5 | `/sunmi-health` route classification agreed | VERIFIED — PUBLIC |
| 6 | `/change-password` confirmed as protected | VERIFIED — PROTECTED |
| 7 | Cookie-only Phase 1 (no CSRF) approved | APPROVED |
| 8 | CSRF Phase 2 as separate rollout accepted | APPROVED |
| 9 | Bearer fallback 30-day retirement period accepted | APPROVED |
| 10 | Monitoring/logging plan accepted | APPROVED |

**All checklist items resolved. Phase 1 coding is approved to begin after `chb-01-sunmi-android7-impact.md` is approved.**

---

## Approved Decisions (2026-06-01)

The following decisions were approved and supersede the options presented in the detailed findings.

### D1 — Deployment Target: Option B (LAN deployment first)

Phase 1 targets the existing LAN deployment (`http://192.168.1.171`). The HTTPS cloud deployment (`app.fixitpro.app`) is not a prerequisite for Phase 1.

### D2 — Cookie `Secure` flag: explicit env variable

The `Secure` cookie attribute will be conditioned on a new env var, not `NODE_ENV`:

```typescript
// backend/src/auth/auth.controller.ts (Phase 1 implementation)
secure: process.env.COOKIE_SECURE === 'true',
```

**LAN production env addition:**
```bash
COOKIE_SECURE=false   # HTTP LAN — Secure flag must be off
```

**Future cloud deployment:**
```bash
COOKIE_SECURE=true    # HTTPS — Secure flag on
```

### D3 — `CORS_ORIGIN`: keep current LAN value

`CORS_ORIGIN=http://192.168.1.171:3001` remains unchanged. This is already the correct value for the LAN deployment and matches `web-app/.env.production` (`NEXT_PUBLIC_API_URL=http://192.168.1.171:3000/api/v1`).

### D4 — Phase plan: approved

Cookie-only Phase 1 → 30-day validation window → CSRF Phase 2 → Bearer retirement.

### D5 — CSRF: deferred to Phase 2

No CSRF token, no `csrf_token` cookie, no `X-CSRF-Token` header in Phase 1. `SameSite=Strict` is the sole CSRF defence during Phase 1. Accepted.

### D6 — Bearer fallback: minimum 30-day transition

Bearer header support in `JwtStrategy` remains active for a minimum of 30 days after Phase 1 deploy. Removal requires a separate PR with confirmed evidence that no APK builds are still using Bearer auth.

### D7 — Temporary Bearer fallback logging: approved

The following instrumentation must be included in Phase 1 (not a follow-up):

```typescript
// backend/src/auth/strategies/jwt.strategy.ts — remove at Bearer retirement
if (!req?.cookies?.access_token && ExtractJwt.fromAuthHeaderAsBearerToken()(req)) {
  this.logger.warn(`Bearer fallback used — IP: ${req.ip}, path: ${req.url}`)
}
```

### Remaining hold

**Item 1 (SUNMI firmware) is the sole remaining block.** All other checklist items are either verified or resolved by the decisions above. Coding begins immediately after SUNMI firmware confirmation is provided.

---

## Detailed Findings

---

### 1. SUNMI Firmware Requirements

**Status: NOT VERIFIED**

#### What was checked

- `web-app/android/variables.gradle` — Android SDK configuration
- `web-app/package.json` — Capacitor version
- `web-app/capacitor.config.ts` — server URL and WebView mode
- Project repository — any documented SUNMI device model or firmware spec

#### Evidence

**`variables.gradle`:**
```gradle
minSdkVersion = 24       ← Android 7.0 (Nougat)
compileSdkVersion = 36
targetSdkVersion = 36
```

**`package.json`:**
```json
"@capacitor/android": "^8.3.3",
"@capacitor/core": "^8.3.3"
```

**`capacitor.config.ts`:**
```typescript
server: {
  ...(SERVER_URL ? { url: SERVER_URL } : {}),
  cleartext: true,       // ← allows HTTP for LAN dev builds
  androidScheme: 'https',
}
```

#### Analysis

| Factor | Value | Risk |
|--------|-------|------|
| `minSdkVersion` | 24 = Android 7.0 | App installs on Android 7.0+ devices |
| SameSite=Strict safe threshold | Android 10 (API 29) / Chromium 80+ | Gap of 3 major Android versions |
| SUNMI WebView update mechanism | Device-specific; SUNMI devices may NOT have Google Play Store | WebView may not auto-update |
| No documented SUNMI model/firmware | Nothing in the repository | Cannot confirm which Android version the target SUNMI hardware runs |

`SameSite=Strict` enforcement requires Chromium 80+ (March 2020). On Android 7/8/9 devices with a system WebView older than Chromium 80, the `SameSite=Strict` attribute is silently ignored — the cookie behaves as if `SameSite=None`, removing the primary CSRF defense. This is especially likely on SUNMI commercial POS terminals that run locked-down Android without access to the Play Store WebView updater.

Note: `androidScheme: 'https'` only applies when the APK serves bundled files locally (when `CAPACITOR_SERVER_URL` is not set). In the current live-server-URL mode (`http://192.168.1.171:3001`), the WebView loads over plain HTTP; `androidScheme` has no effect.

#### Required action before Phase 1

Confirm the specific SUNMI hardware model(s) deployed (e.g., T2 Mini, V2 Pro, D2 Mini). Check the Android firmware version on those devices. If the firmware is Android 10+, this item becomes VERIFIED. If Android 8 or 9, a physical device test is required before deploy to confirm cookie behaviour.

No repository evidence can satisfy this check. It requires physical device inspection.

---

### 2. `@capacitor/http` Usage Audit

**Status: VERIFIED**

#### What was checked

- `@capacitor/http` in `package.json` dependencies
- Source patterns: `@capacitor/http`, `CapacitorHttp`, `Http.request`, `Http.get`, `Http.post` across all of `web-app/src`
- All files using `api.` or `fetch(` (84 files identified)
- Offline sync queue (`hooks/use-sync-queue.ts`)
- Printer utilities (`lib/printer.ts`)

#### Evidence

**`package.json` — installed Capacitor packages:**
```json
"@capacitor/android": "^8.3.3",
"@capacitor/app": "^8.1.0",
"@capacitor/cli": "^8.3.3",
"@capacitor/core": "^8.3.3",
"@capacitor/haptics": "^8.0.2",
"@capacitor/splash-screen": "^8.0.1",
"@capacitor/status-bar": "^8.0.2"
```

`@capacitor/http` is **not installed**.

**Grep results for `@capacitor/http`, `CapacitorHttp`, `Http.request`:**
```
No matches found  (searched: web-app/src, mobile-app)
```

**All authenticated API calls flow through `lib/api.ts` (Axios):**

```typescript
// lib/api.ts — the single Axios instance used by every page and component
const api = axios.create({
  baseURL: _apiUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})
```

**Offline sync queue uses `api` (Axios):**
```typescript
// hooks/use-sync-queue.ts:13
import api from '@/lib/api'
// All processItem() calls use api.post(), api.patch()
```

**`lib/printer.ts`** — uses `window.open()` for browser print and `navigator.share()` for Web Share API. No network calls to the backend.

**`fetch(` search results:** All 84 file matches are React Query `.refetch()` calls (a client-side cache refresh method), not native `window.fetch()` HTTP calls.

#### Conclusion

Zero usage of `@capacitor/http` or `CapacitorHttp` anywhere in the codebase. Every API call is routed through the Axios instance in `lib/api.ts`. Cookie credentials will flow correctly once `withCredentials: true` is added.

---

### 3. Nginx `Set-Cookie` Compatibility

**Status: VERIFIED**

#### What was checked

- `nginx/nginx.conf` — global `http {}` block
- `nginx/templates/app.conf.template` — all server blocks

#### Evidence

**`nginx/nginx.conf` — complete `http {}` block proxy directives:**

```nginx
proxy_http_version      1.1;
proxy_set_header        Upgrade $http_upgrade;
proxy_set_header        Connection 'upgrade';
proxy_set_header        Host $host;
proxy_set_header        X-Real-IP $remote_addr;
proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header        X-Forwarded-Proto $scheme;
proxy_cache_bypass      $http_upgrade;
proxy_read_timeout      120s;
proxy_connect_timeout   10s;
proxy_send_timeout      120s;
```

**`proxy_hide_header` presence:** None. The directive does not appear anywhere in `nginx.conf` or `app.conf.template`.

**`app.conf.template` — API server block:**

```nginx
location / {
    limit_req        zone=api_general burst=30 nodelay;
    limit_req_status 429;
    limit_conn       conn_limit 20;
    proxy_pass       http://backend:3000;
}
```

No `proxy_hide_header` directive. No `add_header` directives in the API server block that would interfere with `Set-Cookie` passthrough.

#### Conclusion

Nginx will pass `Set-Cookie` response headers from NestJS to the browser without modification. No configuration change to Nginx is needed for Phase 1.

---

### 4. `CORS_ORIGIN` Production Requirements

**Status: RESOLVED — decisions D1, D2, D3 applied**

#### What was checked

- `backend/.env.production` — the active production environment file
- `web-app/.env.production` — the active frontend production environment file
- `.env.prod.example` — the Docker/cloud deployment template
- `backend/src/main.ts` — CORS enforcement logic

#### Evidence

**Active production backend env (`backend/.env.production`):**

```bash
NODE_ENV=production
PORT=3000
CORS_ORIGIN=http://192.168.1.171:3001   ← LAN IP, HTTP
DB_HOST=localhost
UPLOADS_BASE_DIR=D:/FixITPro/uploads    ← Windows path confirms local deployment
```

**Active production frontend env (`web-app/.env.production`):**

```bash
NEXT_PUBLIC_API_URL=http://192.168.1.171:3000/api/v1   ← HTTP, LAN IP
NEXT_PUBLIC_APP_MODE=web
```

**`main.ts` — CORS and cookie `Secure` behaviour:**

```typescript
// CORS — reads CORS_ORIGIN
app.enableCors({
  origin: corsOrigin ? corsOrigin.split(',') : true,
  credentials: true,
})

// Cookie Secure flag (from design plan, not yet implemented):
secure: process.env.NODE_ENV === 'production'
// → NODE_ENV=production + HTTP = Secure cookie over HTTP → browser silently drops cookie
```

#### Blocking Issues

**Issue A — CORS_ORIGIN value mismatch:**

The checklist required `CORS_ORIGIN` to include `https://app.fixitpro.app`. The active production value is `http://192.168.1.171:3001`. When `withCredentials: true` is used on the Axios instance (required for cookies), the browser enforces strict origin matching. If the frontend origin does not exactly match the CORS `origin` list, the browser will reject the preflight and the cookie will not be sent.

| Required | Actual | Match |
|----------|--------|-------|
| `https://app.fixitpro.app` | `http://192.168.1.171:3001` | NO |

**Issue B — `Secure` cookie flag over HTTP:**

The CHB-01 design plan conditions the `Secure` cookie attribute on `NODE_ENV === 'production'`. The active production environment has `NODE_ENV=production` but runs on HTTP (LAN, no TLS). When the backend sets `Secure: true` on an HTTP response, the browser silently discards the cookie. The migration would appear to work during testing (no errors), but authentication would fail because no cookie is ever stored.

#### Root cause

The CHB-01 design was written assuming the HTTPS cloud deployment (`app.fixitpro.app` + Nginx + Let's Encrypt). The active production environment is the LAN deployment (Windows, HTTP, LAN IP). These are two distinct deployment targets with different requirements.

#### Resolution (Decision D1 + D2 + D3)

**Option B selected — LAN deployment.**

- `CORS_ORIGIN=http://192.168.1.171:3001` — already correct, no change required.
- `Secure` cookie flag will use `COOKIE_SECURE=false` in the LAN env (decision D2). The `NODE_ENV`-based condition in the design plan is replaced by this explicit var.
- `SameSite=Strict` and `HttpOnly` remain the primary security controls. Absence of `Secure` is acceptable on a private LAN segment.
- When the cloud deployment is provisioned in future, set `COOKIE_SECURE=true` and update `CORS_ORIGIN=https://app.fixitpro.app`.

---

### 5. `/sunmi-health` Route Classification

**Status: VERIFIED — PUBLIC**

#### What was checked

- `web-app/src/app/sunmi-health/page.tsx` — full file

#### Evidence

```typescript
// web-app/src/app/sunmi-health/page.tsx — line 5-7 (comment block)
// Bare-bones diagnostic page — no auth, no providers, no offline queue.
// Load http://192.168.1.172:3001/sunmi-health in the SUNMI browser to verify
// that the Next.js server is reachable and the WebView can execute JS.
```

The page:
- Has **no `import` of `useAuthStore`** — cannot read auth state
- Makes **no API calls** to the backend
- Checks IndexedDB, Capacitor platform, network status, `NEXT_PUBLIC_API_URL`
- Is explicitly described as a pre-login connectivity diagnostic tool
- Contains a "Go to Login" button — confirms it is accessed before authentication

The page is used to verify that the SUNMI WebView can reach the Next.js server before the user logs in. Requiring auth to reach it would defeat its purpose (you cannot diagnose connectivity issues if the diagnostic page is behind auth).

#### Required middleware update

The Phase 1 `middleware.ts` `PUBLIC_PATHS` array must include `/sunmi-health`:

```typescript
const PUBLIC_PATHS = ['/login', '/register', '/403', '/sunmi-health']
```

Alternatively, exclude it from the `matcher` pattern:

```typescript
matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads|sunmi-health).*)']
```

Either approach is correct. The middleware PR must implement one of them.

---

### 6. `/change-password` Route Classification

**Status: VERIFIED — PROTECTED**

#### What was checked

- `web-app/src/app/change-password/page.tsx` — full file
- `web-app/src/app/(auth)/login/page.tsx` — redirect logic
- `web-app/src/app/(dashboard)/layout.tsx` — auth guard and `forcePasswordChange` handling
- `backend/src/auth/auth.controller.ts` — backend guard on `POST /auth/change-password`

#### Evidence

**The page reads the authenticated user from Zustand (`change-password/page.tsx:31-32`):**
```typescript
const user = useAuthStore((s) => s.user)
const updateUser = useAuthStore((s) => s.updateUser)
```

**The backend endpoint requires JWT auth (`auth.controller.ts:23-26`):**
```typescript
@UseGuards(JwtAuthGuard)
@Post('change-password')
changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
  return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword)
}
```

**Login redirects here after successful authentication (`login/page.tsx:74-75`):**
```typescript
if (user.forcePasswordChange) {
  router.push('/change-password')
}
```

**Dashboard layout also forces the redirect (`layout.tsx:46-48`):**
```typescript
if (user?.forcePasswordChange && pathname !== '/change-password') {
  router.replace('/change-password')
}
```

**The page is NOT inside the `(dashboard)` route group** — `src/app/change-password/page.tsx` sits outside `(dashboard)/`, so the dashboard layout's auth guard does NOT protect it. Currently, an unauthenticated user can load the page (no client-side redirect). The backend will return `401` on form submission, but the page renders without error. This is a pre-existing gap that Phase 1 middleware will close.

#### Classification: PROTECTED

The page is exclusively reached via post-login redirect when `forcePasswordChange === true`. It calls a JWT-guarded backend endpoint. Without a valid token/cookie, the form submission will fail with 401.

After Phase 1 middleware, an unauthenticated request to `/change-password` will be redirected to `/login` before the page renders. This is the correct and expected behavior — no code change needed beyond the middleware itself.

#### No ambiguity

There is no unauthenticated password-reset flow (e.g., "forgot password via email link"). The only path to this page is: login successfully → backend sets `forcePasswordChange=true` on the user → redirect. The page must remain protected.

---

## Phase Plan Sign-off (Items 7–10)

The following items are design decisions that cannot be verified by code audit. They require written confirmation from the approving party.

| # | Item | Requires |
|---|------|---------|
| 7 | Cookie-only Phase 1 (no CSRF) approved as implementation order | Written approval |
| 8 | CSRF Phase 2 accepted as separate rollout, minimum 30-day gate | Written approval |
| 9 | Bearer fallback minimum 30-day retirement period accepted | Written approval |
| 10 | Monitoring/logging plan for Bearer fallback usage accepted | Written approval |

For item 10: if no server-side logging distinguishes cookie-auth from Bearer-auth requests, the following instrumentation must be added to `jwt.strategy.ts` at Phase 1 deploy:

```typescript
// Temporary log — remove at Bearer retirement
if (!req?.cookies?.access_token && ExtractJwt.fromAuthHeaderAsBearerToken()(req)) {
  this.logger.warn(`Bearer fallback used — IP: ${req.ip}, path: ${req.url}`)
}
```

Without this, retirement cannot be safely timed (no evidence of which devices are still using old APKs).

---

## Pre-Phase 1 Action List

| Action | Status | Blocking |
|--------|--------|---------|
| SUNMI firmware confirmed (Android 7.1.2) | COMPLETE — see `chb-01-sunmi-android7-impact.md` | — |
| Deployment target decision (LAN vs Cloud) | RESOLVED — Option B (LAN) | — |
| `CORS_ORIGIN` update | RESOLVED — current value correct | — |
| `COOKIE_SECURE=false` + `COOKIE_SAMESITE=lax` added to LAN env plan | APPROVED — Phase 1 implementation task | — |
| Add `/sunmi-health` to middleware `PUBLIC_PATHS` | APPROVED — Phase 1 implementation task | — |
| Phase plan sign-off (items 7–10) | APPROVED | — |
| `chb-01-sunmi-android7-impact.md` approved | **PENDING — awaiting approval** | YES |

---

*Phase 1 coding begins after `chb-01-sunmi-android7-impact.md` is approved.*
