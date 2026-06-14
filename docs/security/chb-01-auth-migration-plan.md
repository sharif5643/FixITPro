# CHB-01: Auth Migration Design Review
**HTTP-only Cookie Authentication — Design Plan**

> **Status:** Awaiting approval — DO NOT implement until this document is approved.
> **Date:** 2026-06-01
> **Author:** AI Design Review
> **Ticket:** CHB-01 (last remaining open blocker from Sprint 1)

---

## 1. Current Auth Flow

### Overview

The current implementation uses **JWT tokens stored in `localStorage`** via a Zustand persisted store. Tokens are read by an Axios request interceptor and sent as `Authorization: Bearer <token>` headers on every API call.

### Step-by-step flow

```
1. User submits email + password on /login
2. POST /api/v1/auth/login → NestJS AuthService.login()
3. Backend bcrypt-compares password (salt=12)
4. Backend signs JWT: { sub, email, role, branchId, tenantId }
   - Secret: JWT_SECRET env var
   - Expiry: JWT_EXPIRES_IN env var (default: 7d dev / 8h prod)
5. Response body: { accessToken, user, permissions, redirectTo }
6. Frontend stores full response in Zustand store
7. Zustand persist middleware writes to localStorage key "fixitpro-auth"
   - Stored JSON: { state: { user, accessToken, permissions }, version: 0 }
8. Axios request interceptor (api.ts:30-36) reads localStorage on every request:
   localStorage.getItem('fixitpro-auth') → parse → state.accessToken
   → sets header: Authorization: Bearer <token>
9. Backend JwtStrategy extracts token via ExtractJwt.fromAuthHeaderAsBearerToken()
10. JwtStrategy.validate() does a DB round-trip to check user.isActive
11. On 401: api.ts response interceptor clears localStorage, redirects to /login
12. On logout: clearAuth() calls set({ user: null, accessToken: null, permissions: [] })
    - localStorage is updated automatically by Zustand persist
    - No backend logout endpoint exists
```

### Key files (current)

| File | Role |
|------|------|
| `backend/src/auth/auth.controller.ts` | POST /auth/login, /auth/register, /auth/change-password, GET /auth/me |
| `backend/src/auth/auth.service.ts` | JWT signing, bcrypt, permissions fetch |
| `backend/src/auth/strategies/jwt.strategy.ts` | `fromAuthHeaderAsBearerToken()` extractor |
| `backend/src/main.ts` | Helmet, CORS (`credentials: true`) |
| `web-app/src/store/auth.store.ts` | Zustand store with `persist` → `localStorage` |
| `web-app/src/lib/api.ts` | Axios instance; request interceptor reads localStorage |
| `web-app/src/app/(dashboard)/layout.tsx` | Client-side route guard, reads `accessToken` from store |
| `web-app/src/app/(auth)/login/page.tsx` | Login form, calls `setAuth(user, token, permissions)` |

### Security problem

`localStorage` is accessible to any JavaScript running on the page. A single XSS
vulnerability — in any dependency, ad, or injected script — can silently exfiltrate the token
and allow an attacker to impersonate the user until the token expires (up to 7 days in dev
config). The token cannot be revoked by the server because no token blacklist exists.

---

## 2. Proposed HTTP-only Cookie Flow

### Core principle

The JWT moves from `localStorage` (readable by JS) to an **HttpOnly cookie** (unreadable by JS,
automatically sent by the browser). The Zustand store retains `user` and `permissions` for
client-side permission checks but no longer holds the token itself.

### Step-by-step flow

```
1. User submits email + password on /login (no change)
2. POST /api/v1/auth/login (no change)
3. Backend validates credentials (no change)
4. Backend signs JWT (no change)
5. Instead of returning accessToken in body, backend calls res.cookie():
   Set-Cookie: access_token=<jwt>;
     HttpOnly;
     Secure (prod only);
     SameSite=Strict;
     Path=/;
     Max-Age=<JWT_EXPIRES_IN in seconds>
6. Response body: { user, permissions, redirectTo }  ← no accessToken
7. Frontend stores only { user, permissions } in Zustand
   → accessToken field removed from persisted state
8. Zustand persist writes: { state: { user, permissions }, version: 0 }
9. Browser automatically attaches cookie on every request to the same origin
   (no interceptor needed for token attachment)
10. Axios must set withCredentials: true so the browser sends the cookie cross-origin
    (for the API subdomain case — api.fixitpro.app vs app.fixitpro.app)
11. Backend JwtStrategy reads token from cookie instead of Authorization header
    extractor: fromExtractors([req => req?.cookies?.access_token])
12. JwtStrategy.validate() unchanged
13. On 401: response interceptor clears Zustand state, redirects to /login (no localStorage)
14. Logout: new POST /auth/logout endpoint clears the cookie server-side:
    res.clearCookie('access_token', { path: '/' })
    + Zustand clearAuth() for client-side state
```

### Cookie attributes

| Attribute | Value | Reason |
|-----------|-------|--------|
| `HttpOnly` | always | Blocks JS access — the core XSS defense |
| `Secure` | production only | Requires HTTPS; dev uses HTTP so omit in dev |
| `SameSite` | `Strict` | Blocks cookie from cross-site requests (CSRF primary defense) |
| `Path` | `/` | Cookie sent to all paths |
| `Max-Age` | `JWT_EXPIRES_IN` in seconds | Browser auto-expires cookie; matches JWT expiry |
| `Domain` | not set (leave to browser) | Avoids sharing cookie across subdomains unintentionally |

### Why SameSite=Strict and not Lax?

`Lax` allows the cookie on top-level navigations (clicking a link), which is fine for most apps.
`Strict` blocks the cookie on ALL cross-site requests including navigations. For a POS/repair
management dashboard that users navigate to directly (not via external links), `Strict` gives
maximum CSRF protection with no UX cost. If a future marketing page needs to link to the app with
the user pre-authenticated, this can be revisited.

---

## 3. CSRF Strategy

### Why CSRF matters with cookies

When authentication is cookie-based, browsers automatically include the cookie on requests
originating from other sites (unless blocked by SameSite). A malicious page could embed a form
that POSTs to `api.fixitpro.app/api/v1/sales` and the browser would attach the auth cookie.

### Primary defense: SameSite=Strict

`SameSite=Strict` (proposed in §2) means the browser will not attach the cookie on any
cross-site request — even legitimate ones like redirects from external OAuth providers. This
alone defeats the vast majority of CSRF attacks with zero application code.

### Secondary defense: Double-Submit Cookie pattern

Despite `SameSite=Strict`, a defense-in-depth CSRF token is recommended for state-changing
endpoints (POST, PUT, PATCH, DELETE). The double-submit pattern works without server-side state:

```
1. On login (or via GET /auth/csrf), backend generates a random CSRF token (32 bytes, hex)
2. Backend sets TWO cookies:
   a. access_token (HttpOnly, see §2)
   b. csrf_token=<random>; SameSite=Strict; Secure; Path=/  ← NOT HttpOnly (must be JS-readable)
3. Frontend reads csrf_token cookie via document.cookie and stores in memory (not localStorage)
4. Axios request interceptor adds header: X-CSRF-Token: <value-from-cookie>
   (only on non-GET requests)
5. Backend middleware validates:
   - X-CSRF-Token header present
   - Value matches csrf_token cookie
   - If mismatch → 403 Forbidden
```

**Why this works:** An attacker's cross-site page cannot read the `csrf_token` cookie (same-origin
policy for JS). It cannot forge the `X-CSRF-Token` header because it doesn't know the value. The
attack is blocked even if SameSite protection is somehow bypassed.

### Endpoints that require CSRF validation

All state-changing endpoints except login itself:

- POST /auth/logout
- POST /auth/change-password
- All POST/PUT/PATCH/DELETE routes in the API

### Endpoints exempt from CSRF

- GET requests (read-only, safe methods)
- POST /auth/login (unauthenticated; no cookie to steal yet)
- POST /auth/register (unauthenticated)
- GET /auth/csrf (token issuance endpoint)

---

## 4. SUNMI Compatibility Analysis

### What SUNMI is

SUNMI devices are Android-based POS terminals (e.g., T2 Mini, V2 Pro). The FixITPro app runs on
SUNMI in two modes detected by `platform.ts`:

| Mode | Detection | Notes |
|------|-----------|-------|
| **Capacitor APK** | `Capacitor.isNativePlatform() === true` | Next.js app compiled to APK via Capacitor |
| **Sunmi Mode** | `NEXT_PUBLIC_APP_MODE=sunmi` | Dev/test: browser simulating SUNMI |

`Platform.isSunmiShell()` returns true for either case and triggers redirect to `/sunmi` instead
of `/` (see `layout.tsx:42`).

### Cookie support in Capacitor WebView (Android)

Capacitor on Android uses `AndroidWebView`, which is a Chromium-based browser. HttpOnly cookies
are fully supported and behave identically to desktop Chrome. The WebView cookie jar persists
across app restarts (unless the user clears app data).

**Key requirements for Capacitor + HttpOnly cookies:**

1. **`withCredentials: true` on Axios** — already required for cross-origin cookie sending.
2. **`Secure` attribute** — Production API runs over HTTPS (`api.fixitpro.app`), so `Secure`
   cookies work. In dev, `Secure` must be omitted (localhost is HTTP).
3. **`SameSite=Strict` in WebView** — Chromium 80+ (Android 10+) enforces SameSite. The SUNMI
   APK makes same-origin requests (the API URL is set at build time via `NEXT_PUBLIC_API_URL`),
   so `SameSite=Strict` is satisfied.
4. **Capacitor HTTP plugin** — If the app uses `@capacitor/http` for any requests (instead of
   native `fetch`/`axios`), those requests may NOT include browser cookies. Audit all HTTP calls
   to confirm they go through Axios, not the Capacitor plugin.

### SUNMI firmware risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Older SUNMI firmware (Android 8/9) may use WebView < Chromium 80 | Medium | Test on target SUNMI model before release; `SameSite=None; Secure` as fallback if needed |
| WebView may block third-party cookies from API subdomain | Low | Both app and API are first-party (fixitpro.app); no third-party context |
| `clearCookie` on logout may not work across WebView sessions | Low | Pair with Capacitor's `WebView.clearCache()` call on logout |

### Network context

The SUNMI APK communicates with the API server directly over HTTPS. Cookie handling is no
different from a desktop browser making the same call. The existing `credentials: true` in
`main.ts` CORS config already enables cookie passing.

---

## 5. Next.js Compatibility Analysis

### App Router architecture (Next.js 14)

The project uses the **App Router** (`web-app/src/app/`). This is significant because:

- **Server Components** can read cookies via `cookies()` from `next/headers`.
- **Client Components** (marked `'use client'`) cannot access HttpOnly cookies (by design).
- **Next.js Middleware** (`middleware.ts`) runs on the Edge and can read cookies before the page
  renders, enabling server-side route protection.

### Current client-side guard (problem)

`(dashboard)/layout.tsx` is a `'use client'` component that:
1. Waits for Zustand to hydrate from localStorage (`_hasHydrated` flag).
2. Reads `accessToken` from the store.
3. Redirects to `/login` if missing.

This creates a flash: the loading spinner appears before the redirect fires. With HttpOnly cookies,
the token is never in client-side storage, so this guard must be redesigned.

### Proposed approach: Next.js Middleware for route protection

A new `web-app/src/middleware.ts` will run on the Edge before any page renders:

```typescript
// web-app/src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/403', '/sunmi']

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
}
```

This eliminates the loading-spinner flash and is more secure (protection happens before JS runs).

### Zustand store compatibility

The Zustand store continues to serve client-side permission checks but is restructured:

| Field | Before | After |
|-------|--------|-------|
| `user` | persisted to localStorage | persisted to localStorage |
| `accessToken` | persisted to localStorage | **removed** |
| `permissions` | persisted to localStorage | persisted to localStorage |
| `_hasHydrated` | transient | transient — still needed |

The `_hasHydrated` flag and the hydration wait in `layout.tsx` remain necessary — even without
a token, the layout still needs to know whether the user object is available before rendering
permission-gated UI elements.

The `layout.tsx` guard logic becomes: check `user !== null` (not `accessToken !== null`). The
middleware handles the unauthenticated redirect; the layout only needs to handle the
user-info-loading state.

### Server component access pattern

After migration, server components needing the current user can:

```typescript
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose' // lightweight, Edge-compatible

export default async function SecurePage() {
  const token = cookies().get('access_token')?.value
  // Verify inline if needed, or trust the middleware pre-check
}
```

This is optional — most user data is already in Zustand from the login response.

---

## 6. Rollback Strategy

### Rollback window: 2 weeks after deploy

The migration affects both backend and frontend. If critical issues emerge post-deploy, a full
rollback should take < 30 minutes using the following plan.

### Compatibility bridge (recommended during migration)

**Backend**: Update `JwtStrategy` to accept token from EITHER cookie OR Bearer header.

```typescript
jwtFromRequest: ExtractJwt.fromExtractors([
  (req) => req?.cookies?.access_token ?? null,        // Cookie (new)
  ExtractJwt.fromAuthHeaderAsBearerToken()(req),      // Bearer (legacy fallback)
]),
```

This means old frontend builds (still using localStorage/Bearer) continue to work during the
transition. Deploy backend first, then frontend.

### Feature flag

Add env var `NEXT_PUBLIC_AUTH_COOKIE=true` to the frontend build. When `false`, revert to the
old localStorage path. This allows:
- Rolling forward: set flag to `true` in production
- Rolling back: set flag to `false` and redeploy (< 5 min with current CI)

### Rollback steps

```
1. Set NEXT_PUBLIC_AUTH_COOKIE=false in production .env
2. Trigger frontend redeploy (next build + PM2 restart)
3. Backend continues to accept both Cookie and Bearer — no backend redeploy needed
4. Remove cookie auth from JwtStrategy in a follow-up PR once root cause is resolved
```

### Data at risk

- **Sessions:** All logged-in users are logged out on frontend redeploy (Zustand store shape
  changes). This is acceptable for an auth security migration.
- **No database migrations required** — this is a stateless token mechanism change.

---

## 7. Required Backend Changes

### 7.1 Install `cookie-parser`

NestJS does not parse cookies by default. Add middleware:

```
npm install cookie-parser
npm install -D @types/cookie-parser
```

In `main.ts`:
```typescript
import cookieParser from 'cookie-parser'
app.use(cookieParser())
```

### 7.2 Update `auth.controller.ts`

**Login:** Accept `@Res({ passthrough: true }) res: Response` and call `res.cookie()`.

```typescript
@Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.authService.login(dto)
  const maxAge = parseExpiry(process.env.JWT_EXPIRES_IN ?? '8h') // seconds
  res.cookie('access_token', result.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  })
  res.cookie('csrf_token', result.csrfToken, {
    httpOnly: false,          // Must be JS-readable
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  })
  const { accessToken, csrfToken, ...body } = result
  return body  // { user, permissions, redirectTo }
}
```

**Add logout endpoint:**

```typescript
@Post('logout')
logout(@Res({ passthrough: true }) res: Response) {
  res.clearCookie('access_token', { path: '/' })
  res.clearCookie('csrf_token', { path: '/' })
  return { message: 'Logged out' }
}
```

**Add CSRF endpoint (for initial token fetch, e.g., before login):**

```typescript
@Get('csrf')
csrf(@Res({ passthrough: true }) res: Response) {
  const token = crypto.randomBytes(32).toString('hex')
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  })
  return { csrfToken: token }
}
```

### 7.3 Update `auth.service.ts`

Add CSRF token generation to `login()` return value:

```typescript
import { randomBytes } from 'crypto'

async login(dto: LoginDto) {
  // ... existing logic unchanged ...
  const csrfToken = randomBytes(32).toString('hex')
  return { accessToken: token, csrfToken, user: {...}, permissions, redirectTo }
}
```

### 7.4 Update `jwt.strategy.ts`

Change token extractor to read from cookie, with Bearer fallback during transition:

```typescript
super({
  jwtFromRequest: ExtractJwt.fromExtractors([
    (req: any) => req?.cookies?.access_token ?? null,
    ExtractJwt.fromAuthHeaderAsBearerToken(),  // remove after migration complete
  ]),
  passReqToCallback: false,
  ignoreExpiration: false,
  secretOrKey: configService.get<string>('JWT_SECRET'),
})
```

### 7.5 Add CSRF guard middleware

New file: `backend/src/common/guards/csrf.guard.ts`

```typescript
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest()
    const header = req.headers['x-csrf-token']
    const cookie = req.cookies?.csrf_token
    if (!header || !cookie || header !== cookie) {
      throw new ForbiddenException('Invalid CSRF token')
    }
    return true
  }
}
```

Apply globally to all state-changing routes, or as a decorator on individual endpoints.
Exempt: GET requests, POST /auth/login, POST /auth/register, GET /auth/csrf.

### 7.6 Summary of backend file changes

| File | Change |
|------|--------|
| `backend/src/main.ts` | Add `app.use(cookieParser())` |
| `backend/src/auth/auth.controller.ts` | Cookie setter in login, add logout, add csrf endpoints |
| `backend/src/auth/auth.service.ts` | Return `csrfToken` from `login()` |
| `backend/src/auth/strategies/jwt.strategy.ts` | Cookie extractor + Bearer fallback |
| `backend/src/common/guards/csrf.guard.ts` | New file — CSRF validation guard |
| `backend/package.json` | Add `cookie-parser` dependency |

---

## 8. Required Frontend Changes

### 8.1 Update Zustand store (`auth.store.ts`)

Remove `accessToken` from state and persistence:

```typescript
interface AuthState {
  user: AuthUser | null
  // accessToken: string | null  ← REMOVE
  permissions: string[]
  _hasHydrated: boolean
  setAuth: (user: AuthUser, permissions: string[]) => void  // ← signature change
  // ...
}

// partialize: remove accessToken
partialize: (state) => ({
  user: state.user,
  permissions: state.permissions,
  // accessToken removed
})
```

Update `setAuth` call sites to match new 2-argument signature.

### 8.2 Update Axios instance (`api.ts`)

- Remove the request interceptor that reads localStorage for the token.
- Add `withCredentials: true` to the Axios defaults.
- Add CSRF token interceptor:

```typescript
const api = axios.create({
  baseURL: _apiUrl,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // ← send cookies cross-origin
  timeout: 30_000,
})

// CSRF header for state-changing requests
api.interceptors.request.use((config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method ?? '')) {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/)
    if (match) config.headers['X-CSRF-Token'] = decodeURIComponent(match[1])
  }
  // X-Branch-Id (unchanged)
  try {
    const branchId = useBranchStore.getState().selectedBranchId
    if (branchId) config.headers['X-Branch-Id'] = branchId
  } catch { /* continue */ }
  return config
})

// 401 handler: clear Zustand state (no localStorage to clear)
if (status === 401 && !isAuthEndpoint) {
  useAuthStore.getState().clearAuth()
  window.location.href = '/login'
}
```

### 8.3 Update login page (`login/page.tsx`)

Change `setAuth(user, token, permissions)` → `setAuth(user, permissions)`:

```typescript
// Before
store.setAuth(data.user, data.accessToken, data.permissions)

// After
store.setAuth(data.user, data.permissions)
// accessToken no longer in response body — ignore if present
```

### 8.4 Add Next.js Middleware (`middleware.ts`)

New file: `web-app/src/middleware.ts` — see §5 for full implementation.

This replaces the client-side `accessToken` check in `layout.tsx`.

### 8.5 Update dashboard layout (`(dashboard)/layout.tsx`)

Change auth check from `accessToken` to `user`:

```typescript
// Before
const accessToken = useAuthStore((state) => state.accessToken)
if (!accessToken) { router.replace('/login'); return }

// After
const user = useAuthStore((state) => state.user)
if (!user) { router.replace('/login'); return }
```

The middleware handles the no-cookie case before the page renders. The layout guard is now a
secondary check for the client-side state (e.g., after `clearAuth()` is called).

### 8.6 Update logout flow

Add an API call to the backend logout endpoint before clearing state:

```typescript
async function logout() {
  await api.post('/auth/logout').catch(() => {}) // best-effort; always clear local state
  useAuthStore.getState().clearAuth()
  router.replace('/login')
}
```

### 8.7 Summary of frontend file changes

| File | Change |
|------|--------|
| `web-app/src/store/auth.store.ts` | Remove `accessToken` field and persistence |
| `web-app/src/lib/api.ts` | Add `withCredentials: true`; replace Bearer interceptor with CSRF interceptor |
| `web-app/src/app/(auth)/login/page.tsx` | Update `setAuth` call (2 args) |
| `web-app/src/app/(dashboard)/layout.tsx` | Guard on `user` not `accessToken` |
| `web-app/src/middleware.ts` | New file — Edge middleware cookie check |
| All logout trigger sites | Add `api.post('/auth/logout')` call |

---

## 9. Required Tests

### 9.1 Backend unit tests

| Test | File |
|------|------|
| Login response sets `access_token` cookie with HttpOnly flag | `auth.controller.spec.ts` |
| Login response sets `csrf_token` cookie without HttpOnly flag | `auth.controller.spec.ts` |
| Login response body does NOT contain `accessToken` | `auth.controller.spec.ts` |
| Logout endpoint clears both cookies | `auth.controller.spec.ts` |
| JwtStrategy accepts token from cookie | `jwt.strategy.spec.ts` |
| JwtStrategy accepts token from Bearer header (fallback) | `jwt.strategy.spec.ts` |
| CsrfGuard blocks request with missing X-CSRF-Token header | `csrf.guard.spec.ts` |
| CsrfGuard blocks request with mismatched token | `csrf.guard.spec.ts` |
| CsrfGuard passes request with matching header and cookie | `csrf.guard.spec.ts` |
| CsrfGuard does not apply to GET requests | `csrf.guard.spec.ts` |

### 9.2 Backend E2E tests

| Test | File |
|------|------|
| Full login → authenticated request → logout cycle via cookies | `auth.e2e-spec.ts` |
| Authenticated request without cookie returns 401 | `auth.e2e-spec.ts` |
| State-changing request without X-CSRF-Token returns 403 | `auth.e2e-spec.ts` |
| Cookie expiry respected (token expired → 401) | `auth.e2e-spec.ts` |

### 9.3 Frontend unit tests

| Test | File |
|------|------|
| Auth store `setAuth` stores user + permissions but NOT token | `auth.store.test.ts` |
| Auth store `clearAuth` clears user and permissions | `auth.store.test.ts` |
| `localStorage.getItem('fixitpro-auth')` contains no `accessToken` after login | `auth.store.test.ts` |
| Axios request interceptor adds `X-CSRF-Token` header on POST | `api.test.ts` |
| Axios request interceptor does NOT add `X-CSRF-Token` on GET | `api.test.ts` |
| 401 response triggers `clearAuth()`, not `localStorage.removeItem` | `api.test.ts` |

### 9.4 Frontend integration tests (Playwright or Cypress)

| Test | Notes |
|------|-------|
| Login → page shows dashboard without flash/redirect loop | No localStorage token visible in DevTools |
| Refresh page → still authenticated (cookie persists) | Core cookie benefit |
| Open DevTools Application tab → no `accessToken` in localStorage | Regression guard |
| Browser JS cannot read `access_token` cookie | `document.cookie` does not contain it |
| Logout → cookie cleared → redirect to /login → cannot navigate back | History push blocked |
| Unauthenticated user navigating to `/` → redirect to `/login` (middleware) | No flash |
| CSRF token present in request headers for POST requests | Network tab check |

### 9.5 SUNMI-specific tests

| Test | Method |
|------|--------|
| Login on SUNMI APK sets cookie in Android WebView cookie jar | Manual test on device |
| Refresh SUNMI app → user remains authenticated | Manual test |
| Logout on SUNMI → cookie cleared, redirect to login | Manual test |
| APK does not use `@capacitor/http` for auth-protected calls | Code audit |

---

## 10. Migration Risks

### Risk matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1: Cookie blocked on API subdomain** | Medium | High | Ensure `CORS_ORIGIN` includes `app.fixitpro.app`; `credentials: true` already set |
| **R2: SUNMI WebView firmware < Chromium 80** | Low | High | Test on target device model before deploy; fallback: `SameSite=None; Secure` |
| **R3: Capacitor HTTP plugin bypasses cookie jar** | Low | High | Audit all API calls — confirm all use Axios, not `@capacitor/http` |
| **R4: Next.js middleware breaks static asset requests** | Medium | Medium | `matcher` pattern must exclude `_next/static`, `_next/image`, `uploads` (included in plan) |
| **R5: Zustand hydration race condition** | Low | Medium | `_hasHydrated` pattern unchanged; layout guard updated to check `user` not `accessToken` |
| **R6: Missing CSRF token causes 403 on first load** | Medium | Medium | Fetch CSRF token as part of the login response (included in plan); fallback: GET /auth/csrf |
| **R7: Old APK build (localStorage) vs new backend (cookie)** | Medium | Medium | Bearer fallback in JwtStrategy covers this; remove after all APKs updated |
| **R8: Cookie not sent on API subdomain (SameSite=Strict)** | Low | High | Test: `app.fixitpro.app` requests to `api.fixitpro.app` are same-site (both `.fixitpro.app`); browser treats these as same-site, so Strict is satisfied |
| **R9: Nginx strips Set-Cookie headers** | Low | High | Confirm Nginx `proxy_pass` does NOT strip `Set-Cookie`; check `proxy_hide_header` directives |
| **R10: All logged-in sessions invalidated on deploy** | Certain | Low | Expected behavior for a security migration; communicate to users |

### R8 deeper analysis (cross-subdomain SameSite)

RFC 6265bis defines "same-site" as same registrable domain (eTLD+1). `app.fixitpro.app` and
`api.fixitpro.app` share the registrable domain `fixitpro.app`, so they are **same-site**.
`SameSite=Strict` is satisfied for requests from `app.fixitpro.app` → `api.fixitpro.app`.

This means the proposed architecture is safe with `SameSite=Strict`.

### Breaking changes summary

| Component | Breaking change | Recovery |
|-----------|----------------|---------|
| Frontend | `setAuth` signature changes from 3 args to 2 | Update all call sites before deploy |
| Frontend | `accessToken` removed from Zustand state | Any component reading `store.accessToken` will get `undefined` — find all usages |
| Backend | Login response no longer includes `accessToken` in body | Frontend must not rely on it |
| Backend | New `/auth/logout` endpoint required | Logout was previously client-side only |
| Infrastructure | `cookie-parser` package required | Install before deploy |

### Post-migration cleanup (after 2-week validation window)

- Remove Bearer token fallback from `JwtStrategy`
- Remove `NEXT_PUBLIC_AUTH_COOKIE` feature flag if used
- Remove any localStorage-reading code paths
- Add token rotation / refresh token mechanism (separate ticket)

---

## Approval Checklist

Before implementation begins, confirm:

- [ ] Cookie subdomain behaviour verified (app ↔ api same-site)
- [ ] SUNMI target device firmware version confirmed (Android 10+ for safe SameSite=Strict)
- [ ] Nginx `proxy_pass` config reviewed — no `proxy_hide_header Set-Cookie`
- [ ] CSRF guard scope agreed (global middleware vs per-endpoint decorator)
- [ ] Feature flag approach agreed (env var vs code branch)
- [ ] All Capacitor HTTP calls confirmed to use Axios, not `@capacitor/http`
- [ ] Communication plan for session invalidation on deploy

---

*Do not begin implementation until this document receives explicit approval.*
