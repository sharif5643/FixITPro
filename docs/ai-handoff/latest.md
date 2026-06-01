# Phase Summary

**Phase:** S1.2 — Sprint 1 Group 2: Data Isolation & Permission Hardening  
**Date:** 2026-06-01  
**Status:** Complete. CHB-02, CHB-04, CHB-06 resolved. Awaiting S1.3 (Group 3 — Financial Integrity) approval.

---

## Completed

* ✅ CHB-02 — Notification branch scoping: `notificationScope()` helper + all four query methods accept `branchId`/`role` from JWT; controller wired up
* ✅ CHB-04 — `findOne` ownership checks: branch check on `Expense`, creator check on `Claim`, branch check on `DebtPayment.create` (via linked repair); Customer/SerialNumber documented as no-path (schema migration required)
* ✅ CHB-06 — Permission guards: `PermissionGuard` + `@RequirePermission` on all 6 module write endpoints; `SubscriptionController` restricted to OWNER/SUPER_ADMIN via `RolesGuard`; `notification.manage` added to MANAGER preset
* ✅ Commit: Sprint 1.2 - Data isolation and permission hardening

---

## Changed Files

| File | Change |
|------|--------|
| `backend/src/notifications/notifications.controller.ts` | CHB-02 + CHB-06: user context extracted from JWT; `PermissionGuard` added; `notification.manage`/`notification.view` on PATCH endpoints |
| `backend/src/notifications/notifications.module.ts` | CHB-06: `PermissionGuard` added to providers |
| `backend/src/notifications/notifications.service.ts` | CHB-02: `notificationScope()` helper; `findAll`, `getUnreadCount`, `markRead`, `markAllRead` branch-scoped |
| `backend/src/expenses/expenses.service.ts` | CHB-04: `findOne(id, branchId?, isElevated?)` — 403 on branch mismatch |
| `backend/src/expenses/expenses.controller.ts` | CHB-04: `findOne` route passes `branchId`/`role` |
| `backend/src/claims/claims.service.ts` | CHB-04: `findOne(id, userId?, isElevated?)` — 403 if not creator and not elevated |
| `backend/src/claims/claims.controller.ts` | CHB-04 + CHB-06: user context on `findOne`; `claims.manage` on write endpoints |
| `backend/src/claims/claims.module.ts` | CHB-06: `PermissionGuard` added |
| `backend/src/customers/customers.controller.ts` | CHB-06: `sales.create` on `POST /` and `PUT /:id` |
| `backend/src/customers/customers.module.ts` | CHB-06: `PermissionGuard` added |
| `backend/src/serials/serials.controller.ts` | CHB-06: `serials.manage` on `POST /`, `POST /bulk`, `PATCH /:id` |
| `backend/src/serials/serials.module.ts` | CHB-06: `PermissionGuard` added |
| `backend/src/debt-payments/debt-payments.service.ts` | CHB-04 + CHB-06: branch check on `create()`; accepts `branchId`/`role` |
| `backend/src/debt-payments/debt-payments.controller.ts` | CHB-04 + CHB-06: user context passed; `repair.close` on `POST /` |
| `backend/src/debt-payments/debt-payments.module.ts` | CHB-06: `PermissionGuard` added |
| `backend/src/subscription/subscription.controller.ts` | CHB-06: `OWNER`/`SUPER_ADMIN` role guard on `PATCH /` and `POST /renew` |
| `backend/src/subscription/subscription.module.ts` | CHB-06: `RolesGuard` added |
| `backend/src/permissions/permissions.service.ts` | CHB-06: `notification.manage` added to MANAGER preset |
| `docs/commercial-readiness/tenant-ownership-matrix.md` | NEW — entity isolation matrix and implementation strategy for CHB-04/06 |
| `docs/commercial-readiness/s1.2-summary.md` | NEW — full S1.2 sprint summary |
| `docs/commercial-readiness/commercial-hardening-plan.md` | CHB-02, CHB-04, CHB-06 marked ✅ RESOLVED; checklist updated |

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS — 0 errors |
| Backend `nest build` | ✅ PASS — exit 0 |
| Frontend `tsc --noEmit` | ✅ PASS — 0 errors |
| Vitest full suite | ✅ 762 / 762 (no regressions) |

---

## Known Schema Limitations (Not Blocked — Documented)

| Entity | Gap | Required fix |
|--------|-----|-------------|
| `Customer` | No `tenantId` or `branchId` — global shared resource | Add `Customer.tenantId` (schema migration) |
| `SerialNumber` | Via `Product` — `Product` has no tenant field | Add `Product.tenantId` (schema migration) |
| `Notification` (null branchId) | System-wide notifications visible across tenants | Add `Notification.tenantId` (schema migration) |

---

## Remaining Open Blockers

| ID | Status |
|----|--------|
| CHB-01 | Open — localStorage token (largest scope, own track) |
| CHB-03 | Open — Debt payment `$transaction` |
| CHB-05 | Open — Financial `@Max()` DTOs |
| CHB-10 | Open — Atomic stock transfer / PO receive |
| CHB-11 | Open — CSP header in nginx |

---

## Next Recommended Action

**S1.3 — Group 3: Financial Integrity (awaiting approval)**  
CHB-03 (debt payment `$transaction`) → CHB-05 (`@Max()` on financial DTOs) → CHB-10 (atomic stock transfer/PO receive)
