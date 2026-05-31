# Phase Summary

**Phase:** 16.10 — MAJOR Fixes (M-1 through M-4)
**Date:** 2026-06-01
**Status:** Complete. All 4 MAJOR issues resolved. Awaiting Phase 16.11 approval.

---

## Completed

* ✅ M-1 — `POST /sales` now requires `sales.create` permission
* ✅ M-2 — Repair status transitions enforce explicit allowed-transitions map
* ✅ M-3 — Null product name in repair part stock error replaced with ID fallback
* ✅ M-4 — File upload validates both MIME + extension; stored filename uses MIME-derived extension
* ✅ Regression tests: `major-fixes.test.ts` — 54 new tests
* ✅ `docs/qa/phase-16.8-audit-report.md` updated — all 4 MAJOR items marked ✅ RESOLVED
* ✅ Commit: `e53a209` — "phase 16.10: fix M-1…M-4"

---

## Changed Files

**Backend**
* `backend/src/sales/sales.controller.ts`
  - Added `@UseGuards(PermissionGuard)` + `@RequirePermission('sales.create')` to `@Post()`
* `backend/src/repairs/repairs.service.ts`
  - Replaced open-ended forward-skip guard with `ALLOWED` transitions map
  - `product?.name` → `productName = product?.name ?? \`[ID: ${part.productId}]\``
  - Error message now includes `(ต้องการ: N)` quantity for clarity
* `backend/src/repairs/repairs.controller.ts`
  - Added `ALLOWED_IMAGE_EXTS` Set and `MIME_TO_EXT` map
  - `fileFilter` now checks MIME **and** extension
  - `filename` callback now derives extension from `MIME_TO_EXT` (not `extname(originalname)`)

**Tests**
* `web-app/src/__tests__/major-fixes.test.ts` — 54 new tests

**Docs**
* `docs/qa/phase-16.8-audit-report.md` — M-1…M-4 marked ✅ RESOLVED

---

## Fix Details

### M-1 — Sales Permission Guard
```typescript
@Post()
@UseGuards(PermissionGuard)          // ← added
@RequirePermission('sales.create')   // ← added
create(...) { ... }
```
TECHNICIAN / STOCK_STAFF with valid JWT can no longer ring up sales via direct API call.

### M-2 — Explicit Status Transitions
```typescript
const ALLOWED: Record<string, string[]> = {
  'RECEIVED':         ['DIAGNOSING'],
  'DIAGNOSING':       ['WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'],
  'WAITING_APPROVAL': ['APPROVED'],
  'APPROVED':         ['WAITING_PARTS', 'IN_PROGRESS'],
  'WAITING_PARTS':    ['IN_PROGRESS'],
  'IN_PROGRESS':      ['COMPLETED', 'WAITING_PARTS'],
  'COMPLETED':        [],
}
if (!allowed.includes(dto.status)) throw BadRequestException(...)
```
RECEIVED→COMPLETED (and all other multi-step skips) now throw.

### M-3 — Null-Safe Product Name
```typescript
const productName = product?.name ?? `[ID: ${part.productId}]`
```
Error message never shows "undefined" even if product was deleted after part was added.

### M-4 — File Upload Dual Validation
```typescript
const ALLOWED_IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.gif'])
const MIME_TO_EXT = { 'image/jpeg':'.jpg', 'image/png':'.png', ... }

fileFilter: check MIME startsWith('image/') AND ext in ALLOWED_IMAGE_EXTS
filename:   safeExt = MIME_TO_EXT[mimetype] ?? '.jpg'  // never from originalname
```
`shell.jpg.php` → blocked (ext `.php` not in whitelist). Stored filename is always MIME-safe.

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS |
| Backend `nest build` | ✅ PASS |
| Frontend `tsc --noEmit` | ✅ PASS |
| Frontend `next build` | ✅ PASS |
| `major-fixes.test.ts` | ✅ 54 / 54 |
| Vitest full suite | ✅ 672 / 672 (no regressions) |

Previous baseline: 618 tests. +54 new regression tests.

---

## Remaining Open Issues (from Phase 16.8 Audit)

| # | Severity | Issue |
|---|----------|-------|
| N-1 | MINOR | Global stock path pre-tx check (no-branch sales race) |
| N-2 | MINOR | N+1 query on repair list |
| N-3 | MINOR | Stock adjust no in-tx re-validation |
| N-4 | MINOR | Warranty expiry > issuance date not validated |
| N-5 | MINOR | Debt partial payment preview float arithmetic |
| UX-1 | UX | No confirm dialog before large POS checkout |
| UX-2 | UX | No confirm before repair delivery payment |
| UX-3 | UX | Single error for multiple stock failures |
| UX-4 | UX | No "snooze all" in reminder popup |

---

## PROD-Readiness Status

| Category | Before 16.9–16.10 | Now |
|---|---|---|
| CRITICAL issues | 2 | 0 ✅ |
| MAJOR issues | 4 | 0 ✅ |
| MINOR issues | 5 | 5 (non-blocking) |
| UX issues | 4 | 4 (non-blocking) |

---

## Review Questions

* Approve Phase 16.11 — MINOR fixes (N-1 through N-5)?
* Approve Phase 16.12 — UX fixes (UX-1 through UX-4)?
* Or combine MINOR + UX into a single phase?

---

## Next Recommended Action

**Phase 16.11 — MINOR fixes (awaiting approval)**  
All 5 minor issues are low-risk, isolated changes. Can be done in one phase.
