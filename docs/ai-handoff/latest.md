# Phase Summary

**Phase:** Commercial Hardening Plan
**Date:** 2026-06-01
**Status:** Plan complete. No code modified. Awaiting approval to begin implementation.

---

## Completed

* ✅ Full commercial hardening audit completed across all 52 modules/pages/flows
* ✅ `docs/commercial-readiness/commercial-hardening-plan.md` created (980 lines)
* ✅ Commit: `7f9a259`

---

## Summary of Findings

| Severity | Count | Blocks Selling |
|----------|-------|----------------|
| BLOCKER | 11 | YES |
| HIGH | 14 | YES (before first customer) |
| MEDIUM | 13 | No |
| LOW | 8 | No |
| UX | 4 | No |
| DOCUMENTATION | 2 | Legal risk |
| **Total** | **52** | |

---

## Top 11 BLOCKERs (CHB-01 through CHB-11)

| ID | Issue | File |
|----|-------|------|
| CHB-01 | JWT in localStorage (XSS → token theft) | `web-app/src/store/auth.store.ts:56-57` |
| CHB-02 | Notifications not tenant/user scoped | `backend/src/notifications/notifications.controller.ts` |
| CHB-03 | Debt payment NOT in `$transaction` | `backend/src/debt-payments/debt-payments.service.ts:58-74` |
| CHB-04 | `findOne(id)` no tenant check — ID enumeration | 6 modules |
| CHB-05 | Financial fields no `@Max()` — unlimited amounts | DTOs in 4 modules |
| CHB-06 | Missing `@UseGuards(PermissionGuard)` on 6 modules | notifications, customers, serials, claims, debt-payments, subscription |
| CHB-07 | JWT missing `tenantId` (already in BLK-3) | `backend/src/auth/auth.service.ts:35` |
| CHB-08 | API client falls back to HTTP localhost | `web-app/src/lib/api.ts:10` |
| CHB-09 | No Helmet middleware (already in BLK-1) | `backend/src/main.ts` |
| CHB-10 | Stock transfer/PO receive not atomic | `branches.service.ts`, `purchase-orders.service.ts` |
| CHB-11 | No CSP header (already in production review H-6) | `nginx/templates/app.conf.template` |

---

## Key High Findings

| ID | Issue |
|----|-------|
| CHH-01 | Carrier wallet balance race condition |
| CHH-02 | Missing audit logs on carrier, serials, notifications |
| CHH-03 | Exception filter exposes validation schema |
| CHH-04 | Permission guard queries DB every request |
| CHH-05 | SUNMI repair status transitions out-of-sync with backend M-2 fix |
| CHH-06 | `X-Branch-Id` custom header not validated server-side |
| CHH-11 | No off-site backup |
| CHH-13 | No password policy enforcement |

---

## Estimated Effort

| Sprint | Scope | Hours |
|--------|-------|-------|
| Sprint 1 (Weeks 1-2) | All 11 BLOCKERs | 72h |
| Sprint 2 (Weeks 3-4) | HIGH severity | 39h |
| Sprint 3 (Weeks 5-6) | MEDIUM severity | 80h |
| Sprint 4 (Weeks 7-8) | LOW + UX + tests | 72h |
| **Total** | | **~283h (7–8 weeks)** |

---

## No Code Changes

This phase was documentation and analysis only.  
All existing code is unchanged.  
All prior build/test results still valid: 733/733 vitest.

---

## Review Questions

* Approve Sprint 1 (BLOCKER fixes: CHB-01 through CHB-11)?
* Prioritise a specific BLOCKER to implement first?
* Should CHB-01 (localStorage → HTTP cookie) be tackled separately given its scope?

---

## Next Recommended Action

**Sprint 1 — Commercial BLOCKER Fixes (awaiting approval)**  
Suggested order: CHB-07 (JWT tenantId) → CHB-04 (tenant findOne) → CHB-02 (notification scoping) → CHB-06 (permission guards) → CHB-03 (debt transaction) → CHB-05 (financial @Max) → CHB-10 (stock transfer atomic) → CHB-08 (API baseURL fail-loud) → CHB-09 (Helmet) → CHB-11 (CSP) → CHB-01 (localStorage to cookie — largest scope, do last in sprint 1)
