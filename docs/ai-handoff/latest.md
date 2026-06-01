# Phase Summary

**Phase:** S1.1 — Sprint 1 Group 1 Foundation
**Date:** 2026-06-01
**Status:** Complete. 6 foundation fixes applied. Awaiting S1.2 (Group 2 — Data Isolation) approval.

---

## Completed

* ✅ CHB-07 — `tenantId` added to JWT payload in `auth.service.ts` (login + register)
* ✅ CHB-09 / BLK-1 — `helmet` v8.2.0 installed; `app.use(helmet())` in `main.ts`
* ✅ BLK-2 — CORS fail-loud: throws `Error` at startup if `CORS_ORIGIN` unset in production
* ✅ CHB-08 — API client throws at module load if `NEXT_PUBLIC_API_URL` is unset (no silent localhost fallback)
* ✅ BLK-4 — Health endpoint now probes DB (`SELECT 1`); returns `503` when database unreachable
* ✅ BLK-5 — `validate-prod-env.ps1` check `BE-13` added: `SUPER_ADMIN_PASSWORD` must not be a placeholder
* ✅ Regression tests: `s1-group1-foundation.test.ts` — 29 new tests
* ✅ Commit: `3147266`

---

## Changed Files

| File | Change |
|------|--------|
| `backend/src/auth/auth.service.ts` | CHB-07: `tenantId` added to both `login()` and `register()` JWT sign calls |
| `backend/src/auth/strategies/jwt.strategy.ts` | CHB-07: payload type updated to include `branchId` and `tenantId` fields |
| `backend/src/health.controller.ts` | BLK-4: injects PrismaService; `SELECT 1` probe; returns 503 on DB failure |
| `backend/src/main.ts` | CHB-09/BLK-1: `app.use(helmet())`; BLK-2: CORS fail-loud if `CORS_ORIGIN` unset in prod |
| `backend/package.json` + `package-lock.json` | CHB-09: `helmet@8.2.0` dependency added |
| `web-app/src/lib/api.ts` | CHB-08: throws at module init if `NEXT_PUBLIC_API_URL` missing |
| `scripts/validate-prod-env.ps1` | BLK-5: check `BE-13` added for `SUPER_ADMIN_PASSWORD` |
| `web-app/src/__tests__/s1-group1-foundation.test.ts` | NEW — 29 regression tests |
| `docs/commercial-readiness/commercial-hardening-plan.md` | CHB-07, CHB-08, CHB-09, BLK-2, BLK-4, BLK-5 marked ✅ RESOLVED |
| `docs/release-readiness/v1.0.0-rc1-review.md` | Added to git (was untracked) |

---

## Security Impact

| Fix | Impact |
|-----|--------|
| CHB-07 — tenantId in JWT | Tenant isolation is now first-class in the token. Downstream Group 2 fixes (notification scoping, findOne tenant check) depend on this being present. |
| CHB-09 / BLK-1 — Helmet | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `X-DNS-Prefetch-Control` now set on ALL responses including direct SUNMI LAN access that bypasses Nginx. |
| BLK-2 — CORS fail-loud | Production deployment with a missing `CORS_ORIGIN` now throws immediately at startup instead of silently accepting all origins. Zero-line attack surface eliminated. |
| CHB-08 — API URL fail-loud | Missing `NEXT_PUBLIC_API_URL` causes `next build` to fail. Silent localhost fallback in production is eliminated. |
| BLK-4 — Health DB probe | Container healthchecks now correctly reflect real app state. Docker will restart containers when DB is down instead of continuing to route traffic to a non-functional backend. |
| BLK-5 — SA password check | `validate-prod-env.ps1` blocks deployment if `SUPER_ADMIN_PASSWORD` is a placeholder. First-deploy admin account cannot be created with a known-weak password. |

---

## Migration Impact

None. No schema changes. No database migrations required. Helm and JWT changes are code-only.

The `tenantId` in the JWT token is backwards-compatible:
- Old tokens (without `tenantId`) continue to work — `jwt.strategy.ts` still does a full DB lookup and populates `tenantId` from the database regardless of token payload.
- New tokens include `tenantId` as a signed claim, providing belt-and-suspenders tenant context.

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS — 0 errors |
| Backend `nest build` | ✅ PASS — exit 0 |
| Frontend `tsc --noEmit` | ✅ PASS — 0 errors |
| Frontend `next build` | ✅ PASS — exit 0 |
| `s1-group1-foundation.test.ts` | ✅ 29 / 29 |
| Vitest full suite | ✅ 762 / 762 (no regressions) |

Previous baseline: 733 tests. +29 new regression tests.

---

## Remaining Open Blockers

| ID | Status |
|----|--------|
| CHB-01 | Open — localStorage token (largest scope, own track) |
| CHB-02 | Open — Notification tenant scoping |
| CHB-03 | Open — Debt payment `$transaction` |
| CHB-04 | Open — `findOne` tenant ownership check (6 modules) |
| CHB-05 | Open — Financial `@Max()` DTOs |
| CHB-06 | Open — Missing permission guards (6 modules) |
| CHB-10 | Open — Atomic stock transfer / PO receive |
| CHB-11 | Open — CSP header in nginx |

---

## Review Questions

* Approve S1.2 — Group 2 Data Isolation (CHB-02, CHB-04, CHB-06)?
* CHB-02 and CHB-04 both depend on CHB-07 (✅ done) — ready to proceed.

---

## Next Recommended Action

**S1.2 — Group 2: Data Isolation (awaiting approval)**  
CHB-02 (notification scoping) → CHB-04 (tenant findOne check × 6 modules) → CHB-06 (permission guards × 6 modules)
