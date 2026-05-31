# Phase Summary

**Phase:** 16.11 — MINOR Fixes (N-1 through N-5)
**Date:** 2026-06-01
**Status:** Complete. All 5 MINOR issues resolved. Awaiting Phase 16.12 approval.

---

## Completed

* ✅ N-1 — Pre-tx global stock check documented as optimistic fast-fail (in-tx C-1 guard is authoritative)
* ✅ N-2 — Repair list `findAll` capped at `take: 200` (prevents unbounded query on large backlogs)
* ✅ N-3 — Stock adjust OUT uses conditional `updateMany(WHERE quantity >= demand)` inside tx
* ✅ N-4 — Warranty `warrantyDays < 1` throws; `update` validates `endDate > startDate`
* ✅ N-5 — Debt partial payment preview uses `Math.round(x * 100) / 100` (integer-cent arithmetic)
* ✅ Regression tests: `minor-fixes.test.ts` — 33 new tests
* ✅ TypeScript error in `major-fixes.test.ts` (line 216, dead code) also fixed
* ✅ Audit report: all 5 MINOR items marked ✅ RESOLVED
* ✅ Commit: `4a7c115`

---

## Changed Files

**Backend**
* `backend/src/sales/sales.service.ts` — N-1: clarifying comment on pre-tx optimistic check
* `backend/src/repairs/repairs.service.ts` — N-2: `take: 200` limit on `findAll`
* `backend/src/stock/stock.service.ts` — N-3: OUT path → `updateMany(WHERE quantity >= qty)` inside tx; IN path keeps upsert
* `backend/src/warranties/warranties.service.ts` — N-4: `warrantyDays < 1` guard in `createForRepair` + `createForSaleItem`; `endDate > startDate` guard in `update`

**Frontend**
* `web-app/src/app/(dashboard)/debt/page.tsx` — N-5: `money(Math.round((outstanding - numAmount) * 100) / 100)`

**Tests**
* `web-app/src/__tests__/minor-fixes.test.ts` — NEW, 33 tests
* `web-app/src/__tests__/major-fixes.test.ts` — removed dead TypeScript expression (line 216 fix)

**Docs**
* `docs/qa/phase-16.8-audit-report.md` — N-1…N-5 marked ✅ RESOLVED

---

## Fix Details

### N-1 — Optimistic Pre-tx Comment
The C-1 fix (Phase 16.9) already added in-tx `product.updateMany(WHERE stock >= qty)` as the authoritative check for both branch and global stock paths. N-1's pre-tx check is now documented as a fast-fail optimization only.

### N-2 — Repair List Cap
`take: 200` added to `repairs.findAll`. Newest 200 repairs returned (ordered by `receivedAt desc`). Frontend uses `_count?.images ?? 0` with optional chaining — no UI change. Prevents loading thousands of rows on high-volume branches.

### N-3 — Stock Adjust Conditional Decrement
OUT path: `branchStock.upsert update: { increment: -qty }` → `branchStock.updateMany(WHERE quantity >= qty, decrement)`. If `count=0`, reads current qty and throws with accurate message. Transaction rolls back. IN path unchanged (upsert is correct for additions).

### N-4 — Warranty Date Validation
- `createForRepair` + `createForSaleItem`: throw `BadRequestException` if `warrantyDays < 1`
- `update`: throw `BadRequestException` if `new Date(dto.endDate) <= existing.startDate`

### N-5 — Debt Preview Float Arithmetic
`money(outstanding - numAmount)` → `money(Math.round((outstanding - numAmount) * 100) / 100)`. Eliminates `0.09999999999999998` residuals in displayed remaining balance. (Note: `isFullPay`/`isValid` comparison was already fixed in non-blocker phase N-3.)

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS |
| Backend `nest build` | ✅ PASS |
| Frontend `tsc --noEmit` | ✅ PASS |
| Frontend `next build` | ✅ PASS |
| `minor-fixes.test.ts` | ✅ 33 / 33 |
| Vitest full suite | ✅ 705 / 705 (no regressions) |

Previous baseline: 672 tests. +33 new regression tests.

---

## Audit Report — Current State

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2 | ✅ RESOLVED (Phase 16.9) |
| MAJOR | 4 | ✅ RESOLVED (Phase 16.10) |
| MINOR | 5 | ✅ RESOLVED (Phase 16.11) |
| UX | 4 | Open — awaiting Phase 16.12 |

---

## Remaining Open: 4 UX Findings

| # | Finding |
|---|---------|
| UX-1 | No confirm dialog before large POS checkout (SUNMI) |
| UX-2 | No confirm before repair delivery payment (SUNMI) |
| UX-3 | Single error shown for multiple insufficient-stock parts |
| UX-4 | No "snooze all" button in reminder popup |

---

## Review Questions

* Approve Phase 16.12 — UX fixes (UX-1 through UX-4)?

---

## Next Recommended Action

**Phase 16.12 — UX fixes (awaiting approval)**
All 4 UX issues are frontend-only, no backend changes needed.
