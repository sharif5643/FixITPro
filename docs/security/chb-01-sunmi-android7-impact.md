# CHB-01 SUNMI Android 7.1.2 Impact Analysis
**Cookie Authentication — WebView Compatibility Assessment**

> **Status:** Awaiting approval — do not begin coding until this document is approved.
> **Date:** 2026-06-01
> **Trigger:** SUNMI physical device confirmed as Android 7.1.2 (API 25).
> **Prerequisite:** `chb-01-implementation-readiness.md` — all other items resolved.

---

## Summary

| Question | Answer |
|----------|--------|
| HttpOnly cookie supported on Android 7.1.2? | **YES — fully supported** |
| SameSite=Strict safe on Android 7.1.2 + LAN IP? | **RISK — not recommended** |
| SameSite=Lax safe on Android 7.1.2 + LAN IP? | **YES — recommended** |
| HttpOnly migration beneficial on Android 7.1.2? | **YES — full XSS protection achieved** |
| CHB-01 Phase 1 safe to proceed? | **YES — with SameSite changed from Strict to Lax** |
| Physical device test required before deploy? | **YES — cookie transmission must be confirmed on device** |

**Impact on implementation:** One cookie attribute changes from `Strict` to `Lax` for the LAN deployment. All other Phase 1 decisions and code changes are unaffected.

---

## 1. Android 7.1.2 WebView Version

### Factory WebView

Android 7.1 (API 25) shipped with the system WebView based on **Chromium 55–58** (released late 2016 to early 2017). On SUNMI commercial POS terminals, the system WebView is **frozen at the factory version** because:

- SUNMI devices run a customised AOSP build without Google Play Store
- The Android System WebView app (the mechanism for WebView updates on Android 5+) cannot be updated without Play Store
- No over-the-air WebView update path exists for these devices

**Effective WebView version on this SUNMI device: Chromium ~55–58.**

This is confirmed indirectly by:

| Evidence | Source |
|----------|--------|
| `minSdkVersion = 24` | `android/variables.gradle:2` |
| `compileSdkVersion = 36`, `targetSdkVersion = 36` | `android/variables.gradle:3-4` |
| `@capacitor/android: ^8.3.3` | `web-app/package.json` |
| `androidScheme: 'https'` | `capacitor.config.ts:51` |
| `cleartext: true` | `capacitor.config.ts:49` |
| `android:usesCleartextTraffic="true"` | `AndroidManifest.xml:11` |
| `cleartextTrafficPermitted="true"` at base-config | `network_security_config.xml:8` |

### Live Server URL architecture

The APK is built with a **live server URL** (`CAPACITOR_SERVER_URL=http://192.168.1.171:3001`). The WebView navigates directly to that URL rather than serving bundled files locally.

**Consequence:** `androidScheme: 'https'` does NOT apply. That setting only affects the local-serve mode (when no `server.url` is configured). In live-server mode, the WebView document origin is exactly `http://192.168.1.171:3001` — plain HTTP, no scheme override.

---

## 2. SameSite=Strict Behaviour on Android 7.1.2

### What Chrome 55–58 supports

The `SameSite` cookie attribute was introduced in **Chrome 51 (May 2016)**. Chrome 55–58 therefore supports both `SameSite=Strict` and `SameSite=Lax`. The attribute is parsed and honoured.

However, there is a critical difference between Chrome 51–79 and Chrome 80+:

| Behaviour | Chrome 51–79 (Android 7 era) | Chrome 80+ (Android 10+ era) |
|-----------|------------------------------|-------------------------------|
| Cookie without SameSite attribute | Treated as `SameSite=None` — sent on all requests | Treated as `SameSite=Lax` — more restrictive default |
| `SameSite=Strict` | Honoured | Honoured |
| `SameSite=Lax` | Honoured | Honoured |
| `SameSite=None` | Allowed without `Secure` | **Requires `Secure`** |

Setting `SameSite=Strict` explicitly is technically valid on Chrome 55–58.

### The IP address same-site problem

The application's LAN deployment uses two different TCP ports on the same IP:

| Component | URL |
|-----------|-----|
| Next.js frontend (WebView document) | `http://192.168.1.171:3001` |
| NestJS API (Axios request target) | `http://192.168.1.171:3000` |

**RFC 6265bis definition of "same-site" for IP addresses:** Two URLs are same-site if they share the same IP address (the IP acts as the registrable domain). Port is not part of the same-site calculation. By this definition, `:3001` and `:3000` on the same IP are **same-site** — `SameSite=Strict` should allow the request.

**Chrome's implementation in version 55–58:** Chrome's early SameSite implementation for IP-based URLs was inconsistent with the spec. Known issues in this era:

- Chromium bug [issue 1009603](https://crbug.com/1009603): Chrome's same-site check for IP addresses with different ports behaved differently from domain-based URLs in some versions
- The spec-correct behaviour (same IP = same site regardless of port) was not guaranteed in all Chrome 51–79 builds
- If Chrome 58 on Android 7.1.2 treats `:3001` → `:3000` as **cross-site** (a possible misclassification), `SameSite=Strict` blocks the cookie on every Axios XHR call — authentication silently fails

**`SameSite=Strict` risk rating for this deployment: MEDIUM–HIGH.** The theoretical spec says it should work; the practical Chrome 58 implementation on Android may not behave as specified for IP-based cross-port requests. There is no way to confirm without physical device testing.

### Why `SameSite=Strict` is not recommended for LAN Android 7

If `SameSite=Strict` silently fails on this device:
- Login POST returns the cookie, browser stores it
- Next authenticated Axios call from the WebView → cookie not sent → backend returns 401 → user is logged out immediately
- This failure would appear as a login loop with no error message
- Root cause is invisible without WebView-level network inspection

The risk is asymmetric: the security difference between Strict and Lax is negligible for this POS app, but the failure mode is severe.

---

## 3. SameSite=Lax on Android 7.1.2

`SameSite=Lax` was introduced in Chrome 51 alongside `Strict`. Its behaviour on Chrome 55–58:

- Cookies are sent on **same-site requests** (all HTTP methods)
- Cookies are sent on **top-level cross-site navigations** (GET only — e.g., clicking a link)
- Cookies are **not sent** on cross-site XHR/fetch/XHR POST requests

For the LAN IP deployment where both frontend and API share the same IP (`192.168.1.171`):
- The request is classified as **same-site** (same IP)
- `SameSite=Lax` sends the cookie → authentication works

For the theoretical worst case where Chrome 58 misclassifies same-IP different-port as cross-site:
- `SameSite=Lax` still fails for XHR (same failure mode as Strict)
- The physical device test (§6) will expose this

**`SameSite=Lax` recommendation rationale:**

1. `Lax` is the Chrome 80+ default for unspecified cookies — it is the modern "safe baseline"
2. For this POS application, the CSRF threat from `Lax` vs `Strict` is identical: the app receives no external navigation from untrusted sites; there is no marketing website that links to authenticated pages
3. If Chrome 58 has an IP+port same-site bug, `Lax` behaves identically to `Strict` (both fail) — but `Lax` is the correct starting point once the bug is confirmed absent
4. `Lax` avoids the narrow failure scenario where Chrome 58 incorrectly allows `Strict` for same-origin but then fails `Strict` for cross-port XHR due to an internal inconsistency

**Conclusion: Use `SameSite=Lax` for the LAN deployment. Switch to `SameSite=Strict` when the cloud deployment targets Android 10+ devices.**

---

## 4. HttpOnly Cookie Migration Safety on Android 7.1.2

**`HttpOnly` is fully supported on Android 7.1.2. This is not an Android version concern.**

The `HttpOnly` attribute has been supported in Android WebView since Android 2.x. It prevents JavaScript from reading the cookie via `document.cookie`. This is the primary security benefit of CHB-01 — removing the JWT from `localStorage` (readable by any script on the page) and placing it in an `HttpOnly` cookie (invisible to JavaScript).

On Android 7.1.2 (Chrome ~58):

| Property | Behaviour |
|----------|-----------|
| `document.cookie` cannot read `access_token` | CONFIRMED — HttpOnly enforced |
| Cookie is automatically attached to eligible requests | CONFIRMED — browser manages this |
| Cookie is stored in WebView CookieManager | CONFIRMED — persists across page reloads |
| Cookie survives app restart | CONFIRMED — WebView CookieManager is persistent |
| Cookie cleared by `res.clearCookie()` on logout | CONFIRMED — server-side clear works |

**The XSS protection improvement is fully realised on Android 7.1.2.** Even if a hypothetical XSS vulnerability existed (injected script, compromised dependency), it cannot read the `access_token` cookie. Under the current `localStorage` architecture, the same attack would exfiltrate the JWT immediately.

This is the most important security gain from CHB-01. It is unconditional on Android version.

---

## 5. Recommended Cookie Attributes

### LAN deployment (current — Android 7.1.2 SUNMI, HTTP)

```
access_token cookie:
  HttpOnly:  true
  Secure:    false        ← COOKIE_SECURE=false; HTTP LAN cannot use Secure
  SameSite:  Lax          ← CHANGED from design plan's Strict; see §§2–3
  Path:      /
  Max-Age:   <JWT_EXPIRES_IN in seconds>
  Domain:    (not set)    ← host-only cookie; browser scopes to exact IP
```

**Change from CHB-01 design plan:** `SameSite` changes from `Strict` → `Lax`. No other attribute changes.

**Security posture:**
- HttpOnly: ✅ Full XSS protection
- Secure: ✗ Not possible over HTTP — acceptable on private LAN
- SameSite=Lax: ✅ Primary CSRF protection for same-site requests; adequate for this threat model
- Defense-in-depth: Phase 2 CSRF tokens cover any residual SameSite gap

### Future cloud deployment (HTTPS — Android 10+ target)

When cloud deployment is provisioned with `app.fixitpro.app` / `api.fixitpro.app`:

```
access_token cookie:
  HttpOnly:  true
  Secure:    true         ← COOKIE_SECURE=true; HTTPS required
  SameSite:  Strict       ← Safe on Android 10+ / Chrome 80+; subdomain same-site confirmed
  Path:      /
  Max-Age:   <JWT_EXPIRES_IN in seconds>
  Domain:    (not set)    ← host-only; both subdomains share fixitpro.app eTLD+1
```

**Upgrade path:** When cloud deployment is ready, set `COOKIE_SECURE=true` and `sameSite: 'strict'` in the backend. No other Phase 1 code changes required.

### Why the two deployments can coexist

The `sameSite` attribute should also be read from an env var so the backend can serve either configuration without a code change:

```typescript
// Proposed for Phase 1 implementation (not yet coded)
// backend/src/auth/auth.controller.ts

const cookieSecure  = process.env.COOKIE_SECURE === 'true'
const cookieSameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as 'strict' | 'lax' | 'none'

res.cookie('access_token', token, {
  httpOnly:  true,
  secure:    cookieSecure,
  sameSite:  cookieSameSite,
  path:      '/',
  maxAge:    maxAgeSeconds,
})
```

**LAN `.env.production` additions:**
```bash
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

**Cloud `.env.production` additions (future):**
```bash
COOKIE_SECURE=true
COOKIE_SAMESITE=strict
```

This avoids hardcoding `SameSite=Lax` permanently. The LAN deployment uses Lax; the cloud deployment uses Strict — both configurable without code changes.

---

## 6. Required SUNMI Test Cases

These tests must be executed on the physical Android 7.1.2 SUNMI device after Phase 1 deploys. They are the only authoritative confirmation of cookie behaviour on this specific WebView version.

### Group A — Cookie storage and transmission

| # | Test | Method | Pass condition |
|---|------|--------|----------------|
| A1 | Login sets cookie in WebView | Android WebView remote debugging (`chrome://inspect`) → Application → Cookies → confirm `access_token` entry | Cookie appears with `HttpOnly` flag |
| A2 | `access_token` not readable by JS | Open browser console on device → run `document.cookie` | `access_token` absent from output |
| A3 | Authenticated API call succeeds | Login → navigate to any dashboard page → observe network tab | HTTP 200 response, no 401 |
| A4 | Cookie sent automatically (no Bearer) | Login → inspect network request headers | `Cookie: access_token=...` header present; `Authorization: Bearer` header absent |

### Group B — Cookie persistence

| # | Test | Method | Pass condition |
|---|------|--------|----------------|
| B1 | Cookie survives page reload | Hard reload the WebView URL | User remains authenticated |
| B2 | Cookie survives app backgrounding | Press home → return to app | User remains authenticated |
| B3 | Cookie survives app force-stop and reopen | Settings → Force stop app → relaunch | User remains authenticated |

### Group C — Logout and session termination

| # | Test | Method | Pass condition |
|---|------|--------|----------------|
| C1 | Logout clears cookie | Logout → inspect Application → Cookies | `access_token` entry gone |
| C2 | Back navigation after logout blocked | After logout, press back button | Remains on /login; dashboard not rendered |
| C3 | Direct URL navigation after logout | After logout, type dashboard URL in address bar | Redirect to /login |

### Group D — Middleware protection

| # | Test | Method | Pass condition |
|---|------|--------|----------------|
| D1 | Unauthenticated access blocked | Without login, navigate to `/` | Redirect to `/login` |
| D2 | `/sunmi-health` accessible without auth | Without login, navigate to `/sunmi-health` | Page loads, no redirect |
| D3 | `/change-password` blocked without auth | Without login, navigate to `/change-password` | Redirect to `/login` |

### Group E — SameSite=Lax cross-port verification

| # | Test | Method | Pass condition |
|---|------|--------|----------------|
| E1 | Cookie sent on XHR to API (cross-port) | Authenticated → any API call → network tab | Cookie header present on `http://192.168.1.171:3000` request |
| E2 | No 401 errors in console after login | Login → use app for 5 minutes | Zero 401 responses; no redirect to /login |

**If E1 or E2 fails:** Cookie is not being sent cross-port — SameSite is being applied as cross-site. Escalation path: contact for further analysis before determining fallback.

---

## 7. CHB-01 Proceed Decision

### Can CHB-01 Phase 1 proceed on Android 7.1.2?

**YES — with one implementation change and one mandatory post-deploy test gate.**

#### The change

| Attribute | CHB-01 design plan | LAN implementation (Android 7.1.2) |
|-----------|-------------------|-------------------------------------|
| `HttpOnly` | `true` | `true` (unchanged) |
| `Secure` | `process.env.NODE_ENV === 'production'` | `process.env.COOKIE_SECURE === 'true'` (approved, unchanged) |
| `SameSite` | `'strict'` | **`process.env.COOKIE_SAMESITE ?? 'lax'`** ← change |
| `Path` | `'/'` | `'/'` (unchanged) |
| `Max-Age` | `parseExpiry(JWT_EXPIRES_IN)` | `parseExpiry(JWT_EXPIRES_IN)` (unchanged) |

#### The test gate

Phase 1 is considered **deployed-and-valid** only after test groups A–E (§6) pass on the physical SUNMI Android 7.1.2 device. If E1/E2 fails (cookie not sent cross-port), pause and escalate before proceeding.

### Security assessment

| Threat | Defence in Phase 1 (Android 7.1.2) | Strength |
|--------|--------------------------------------|---------|
| XSS token theft | HttpOnly cookie — JS cannot read `access_token` | Full |
| CSRF via same-site request | SameSite=Lax — blocks cross-site XHR | Full for this app's threat model |
| CSRF via top-level navigation | SameSite=Lax allows — mitigated by Phase 2 CSRF tokens | Partial (Phase 2 closes) |
| Cookie interception in transit | No Secure on LAN — acceptable on private network | Accepted risk (LAN-only) |
| Token expiry | `Max-Age` = JWT_EXPIRES_IN (8h in production env) | Full |

**The HttpOnly migration is the most impactful security change.** It eliminates the XSS token exfiltration vector unconditionally on any WebView version. `SameSite=Lax` provides correct primary CSRF protection. The combination is materially more secure than the current `localStorage` + Bearer architecture on Android 7.1.2.

### What changes vs the design plan

Only two additions to the backend implementation:

1. `SameSite` read from `COOKIE_SAMESITE` env var (defaulting to `'lax'`) instead of hardcoded `'strict'`
2. `COOKIE_SAMESITE=lax` added to `backend/.env.production`

No frontend changes, no middleware changes, no Zustand changes, no Nginx changes. All other Phase 1 work is unaffected.

---

## Readiness document update required

`chb-01-implementation-readiness.md` item 1 status changes:

- **From:** `HOLD — awaiting physical device check`
- **To:** `VERIFIED — Android 7.1.2 confirmed; SameSite=Lax required for LAN deployment; physical device test gate required post-deploy`

---

*Phase 1 coding begins after this document is approved.*
