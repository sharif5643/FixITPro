# Phase Summary

**Phase:** 16.9 — Critical Fixes (C-1 + C-2)
**Date:** 2026-06-01
**Status:** Complete. Both CRITICAL issues resolved. Awaiting Phase 16.10 approval.

---

## Completed

* ✅ C-1 — Sales stock race condition fixed (atomic conditional decrement)
* ✅ C-2 — Device history tenant isolation gap fixed (mandatory tenantId guard)
* ✅ Regression tests: `critical-fixes.test.ts` — 24 new tests (14 for C-1, 10 for C-2)
* ✅ `docs/qa/phase-16.8-audit-report.md` updated — both CRITICAL items marked ✅ RESOLVED
* ✅ Commit: `755e58a` — "phase 16.9: fix C-1 stock race + C-2 tenant isolation gap"

---

## Changed Files

**Backend (source fixes)**
* `backend/src/sales/sales.service.ts`
  - `branchStock.update` → `branchStock.updateMany(WHERE quantity >= demand)` inside tx
  - `product.update` (global path) → `product.updateMany(WHERE stock >= demand)` inside tx
  - Shadow update for branchId path kept as-is (informational only, no guard needed)
* `backend/src/repairs/repairs.service.ts`
  - Added guard: `if (role !== 'SUPER_ADMIN' && !tenantId) throw ForbiddenException`
  - Tenant filter now unconditional for all non-SUPER_ADMIN roles
  - SUPER_ADMIN with `tenantId=null` → cross-tenant search (intentional, documented)

**Tests (new)**
* `web-app/src/__tests__/critical-fixes.test.ts` — 24 tests

**Docs**
* `docs/qa/phase-16.8-audit-report.md` — C-1 and C-2 marked ✅ RESOLVED with fix details

---

## Fix Details

### C-1 — Atomic Conditional Decrement

**Before:** `branchStock.update({ decrement: qty })` — always decrements, no stock check inside tx.  
Two concurrent requests could both pass the pre-transaction stock check, then both decrement → negative stock.

**After:**
```typescript
const bsResult = await tx.branchStock.updateMany({
  where: { branchId, productId, quantity: { gte: item.quantity } },
  data: { quantity: { decrement: item.quantity } },
})
if (bsResult.count === 0) throw BadRequestException(...)
```
If stock is insufficient at write time, `count=0` → exception → full transaction rollback.
Same pattern applied to the global `product.stock` path.

### C-2 — Mandatory Tenant Guard

**Before:** `if (tenantId) { where.branch = { tenantId } }` — skipped silently when null.

**After:**
```typescript
if (role !== 'SUPER_ADMIN' && !tenantId) {
  throw new ForbiddenException('Tenant context required')
}
```
SUPER_ADMIN without tenantId is intentionally allowed for cross-tenant support queries.
All other roles (OWNER, MANAGER, CASHIER, TECHNICIAN, STOCK_STAFF) must have tenantId.

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS — 0 errors |
| Backend `nest build` | ✅ PASS — exit 0 |
| Frontend `tsc --noEmit` | ✅ PASS — 0 errors |
| Frontend `next build` | ✅ PASS — exit 0 |
| `critical-fixes.test.ts` | ✅ 24 / 24 passed |
| Vitest full suite | ✅ 618 / 618 passed (no regressions) |

Previous baseline: 594 tests. +24 new regression tests.

---

## Remaining Issues (from Phase 16.8 Audit)

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| M-1 | MAJOR | `POST /sales` missing `@RequirePermission('sales.create')` | Open |
| M-2 | MAJOR | Repair status allows skipping steps (RECEIVED → COMPLETED) | Open |
| M-3 | MAJOR | `product?.name` null in repair stock error message | Open |
| M-4 | MAJOR | File upload MIME-only validation (no extension whitelist) | Open |
| N-1 | MINOR | Global stock pre-tx check (shadow of C-1 on no-branch path) | Open |
| N-2 | MINOR | N+1 query on repair list | Open |
| N-3 | MINOR | Stock adjust no in-tx re-validation | Open |
| N-4 | MINOR | Warranty expiry > issuance date not validated | Open |
| N-5 | MINOR | Debt partial payment preview float arithmetic | Open |
| UX-1–4 | UX | Confirm dialogs, snooze-all, error batching | Open |

---

## Risks

* ⚠️ M-1 remains — any authenticated user can create sales via direct API call
* ⚠️ Phase 16 migration still pending on PROD

---

## Review Questions

* Approve Phase 16.10 — MAJOR fixes (M-1 through M-4)?
* Fix all 4 MAJOR issues in one phase, or split?

---

## Next Recommended Action

**Phase 16.10 — MAJOR fixes (awaiting approval)**
Priority order: M-1 (security), M-2 (data integrity), M-3 (UX/error quality), M-4 (security)
