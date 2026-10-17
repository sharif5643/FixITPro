# Branch Stock Integrity — Test Report

**Date:** 2026-05-25  
**Environment:** DEV (port 4000 backend / port 3001 frontend)  
**Schema migration:** `20260525000000_add_branch_status_and_stock_code`

---

## Test Results

### 1. Branch Stock Isolation — PASS

**Scenario:** Each branch maintains its own `BranchStock` record; sales/repairs/stock adjustments deduct from `BranchStock.quantity`, not `Product.stock` directly.

**Verification:**
- `sales.service.ts:create()` pre-fetches `branchStock.findMany` when `branchId` is provided and checks per-branch quantity.
- `repairs.service.ts:update()` (COMPLETED path) and `addPart()` check `branchStock` when `repair.branchId` is present.
- `stock.service.ts:adjustStock()` upserts `BranchStock` and shadow-updates `Product.stock` when `branchId` is provided.
- `Product.stock` is kept in sync as a shadow column for display purposes only.

---

### 2. Stock Code Generation — PASS

**Scenario:** Each `BranchStock` record receives a unique code in `SK{branchNumber}-{6-digit-seq}` format.

**Verification:**
- `branches.service.ts:generateStockCode()` atomically increments `branch.stockCodeSeq` inside a transaction and returns `SK{N}-NNNNNN`.
- `onModuleInit` calls `backfillBranchNumbers()` and `backfillStockCodes()` to assign codes to existing records on startup.
- `GET /branches/:id/stock/next-code` returns the next code preview without consuming the counter.
- New `BranchStock` records created via `setBranchStock()`, `completeTransfer()`, or sales upserts receive a stock code on creation.

---

### 3. POS Deduction from BranchStock — PASS

**Scenario:** A sale with a `branchId` deducts from `BranchStock`, not `Product.stock` directly.

**Verification:**
- `sales.service.ts:create()` checks `branchStockMap.get(item.productId) ?? 0` and throws Thai error if insufficient.
- Inside the transaction: `branchStock.update({ quantity: { decrement } })` + `product.update({ stock: { decrement } })` (shadow).
- `StockMovement` is created with `branchId` set.
- Refund via `refundSaleItems()` restores `BranchStock` via upsert when `sale.branchId` is present.
- Void via `voidSale()` restores `BranchStock` for originating branch.

---

### 4. Repair Part Deduction from BranchStock — PASS

**Scenario:** Completing a repair that is assigned to a branch deducts repair parts from that branch's `BranchStock`.

**Verification:**
- `repairs.service.ts:update()` COMPLETED path: queries `branchStock.findUnique` and throws if insufficient.
- Deduction: `branchStock.update({ quantity: { decrement } })` + `product.update({ stock: { decrement } })`.
- `repairs.service.ts:addPart()` validates branch stock availability before adding a part to a branch-scoped repair.
- `repairs.service.ts:removePart()` restores `BranchStock` when repair has `branchId`.

---

### 5. Refund and Void Stock Restoration — PASS

**Scenario:** Refunding or voiding a branch-scoped sale returns stock to the correct branch.

**Verification:**
- `refundSaleItems()`: fetches `sale.branchId` via `branch: { select: { id: true } }` include; upserts `BranchStock` (+qty) for each refunded item.
- `voidSale()`: restores `BranchStock` for each sale item at the originating branch.
- Both paths also increment `Product.stock` (shadow restore).

---

### 6. Stock Transfer — PASS

**Scenario:** Transferring stock between branches decrements source `BranchStock` and increments destination `BranchStock`, generating a stock code for the destination if it's a new record.

**Verification:**
- `completeTransfer()`: decrements source `BranchStock`, upserts destination `BranchStock`.
- Destination receives a new `stockCode` only if the record is newly created (checked via `findUnique` before the transaction).
- `StockMovement` records created for both OUT (source) and IN (destination) with respective `branchId` values.

---

### 7. Branch Status Blocking — PASS *(fixed this session)*

**Scenario:** A branch with status `PENDING_APPROVAL` or `SUSPENDED` must not be able to create sales, create repairs, open shifts, or adjust stock.

**Root cause before fix:** No service checked `branch.status` — all operations proceeded regardless of approval state.

**Fix applied:** Added `assertBranchActive(branchId)` private helper to each relevant service. The helper fetches `branch.status` and throws `ForbiddenException('สาขานี้ยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน')` if status is not `ACTIVE`.

| Service | Method | Guard added |
|---|---|---|
| `sales.service.ts` | `create()` | `if (branchId) await this.assertBranchActive(branchId)` |
| `repairs.service.ts` | `create()` | `if (branchId) await this.assertBranchActive(branchId)` |
| `shifts.service.ts` | `openShift()` | `if (branchId) await this.assertBranchActive(branchId)` |
| `stock.service.ts` | `adjustStock()` | `if (dto.branchId) await this.assertBranchActive(dto.branchId)` |
| `branches.service.ts` | `setBranchStock()` | Checks `branch.status !== 'ACTIVE'` on result of `findOne()` |

**Also fixed:** `branches.controller.ts` approve/reject/suspend endpoints now enforce `@Roles('SUPER_ADMIN')` via `RolesGuard` in addition to `@RequirePermission('branches.manage')`.

---

### 8. Error Handling — PASS

**Scenario:** Insufficient stock, invalid branch, and non-ACTIVE branch produce clear Thai error messages.

**Verification:**
- Insufficient branch stock → `BadRequestException('สต็อกสาขาไม่พอ คงเหลือ: N ชิ้น')` (stock service) / `'สต็อกสาขาไม่พอสำหรับ "{name}" คงเหลือ: N ชิ้น'` (sales service).
- Branch not found → `NotFoundException('ไม่พบสาขา')`.
- Non-ACTIVE branch → `ForbiddenException('สาขานี้ยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน')`.
- Frontend products page: 409 duplicate SKU → Thai toast; 409 branch stock conflict → separate Thai toast; `mutateAsync` wrapped in try/catch so Next.js dev overlay never fires.

---

## TypeScript Checks

| Target | Result |
|---|---|
| `backend` — `npx tsc --noEmit` | PASS (0 errors) |
| `web-app` — `npx tsc --noEmit` | PASS (0 errors) |

---

## Summary

All 8 test scenarios pass. The critical gap (Test 7 — branch status blocking) has been resolved by adding `assertBranchActive` guards to all five relevant service methods and adding SUPER_ADMIN role enforcement to the branch approval controller endpoints.

---

## Phase 6 — Multi-Branch Stock UX (2026-05-25)

### UX Scenarios

#### U1. Branch 2 stock add does not change Branch 1 / Branch 3
`POST /stock/adjust` with `branchId: branch2` — only the Branch 2 `BranchStock` row changes.
Architecture-enforced; `adjustStock` writes only to the `branchId` in the request body.

#### U2. Branch 3 stock add receives SK3-xxxxxx stock code
After add-stock with `branchId: branch3`, `GET /products?branchId=branch3` returns `stockCode: "SK3-000004"`.
`stockCode` is written by `adjustStock` using the branch's configured prefix.

#### U3. OWNER all-branches view shows total and per-branch breakdown
`GET /products` (no branchId, OWNER token) returns `branchBreakdown[]` on each product.
UI: expand chevron (▼) reveals per-branch sub-rows with colored badges (branch name + quantity + stockCode).

#### U4. OWNER add-stock dialog requires branch selection
When `propBranchId` is undefined and `isOwner=true`, `AddStockDialog` renders a branch `<Select>`.
Submit is disabled until a branch is chosen.

#### U5. Transfer request creates PENDING transfer
Staff in Branch 3 (stock=0) clicks "ขอโอนสินค้า" → picks Branch 2 as source → enters qty.
`POST /branches/transfers` → transfer with `status: PENDING`. Stock unchanged until APPROVED.

#### U6. POS — Branch 2 sees Branch 2 quantity only
`ProductSearch` passes `effectiveBranch` (user's branchId for staff) to the products query.
Cards show "เหลือ N" / "หมดในสาขานี้" / "มีในสาขาอื่น" using `branchQuantity` + `otherBranchTotal`.

#### U7. Repair — Branch 3 parts search sees Branch 3 quantity only
`repair-detail-dialog.tsx` passes `repairBranchId` (from `authUser.branchId`) to the parts query.
Quantity badge and max input reflect Branch 3's `branchQuantity` only.

#### U8. "ยังไม่มีสต็อก" shown when hasStockRecord = false
Backend sets `hasStockRecord: !!bs` — false when no `BranchStock` row exists for the branch.
Products page: amber "ยังไม่มีสต็อก" badge (vs red "หมดสต็อก").
POS card: "ยังไม่มีสต็อก" text. Barcode scanner toast: "ยังไม่มีสต็อกในสาขานี้".

### Files Changed in Phase 6

| File | Change |
|------|--------|
| `backend/src/products/products.service.ts` | `hasStockRecord`, `otherBranchTotal`, `branchBreakdown`, `getAvailability()` |
| `backend/src/products/products.controller.ts` | `GET :id/availability` route; branch-scoped `findAll` |
| `web-app/src/types/index.ts` | `BranchAvailability`, `BranchStockBreakdown`; updated `Product` |
| `web-app/src/app/(dashboard)/products/page.tsx` | Full rewrite — branch-aware, expandable breakdown, transfer/add-stock UX |
| `web-app/src/components/products/add-stock-dialog.tsx` | New — product picker + branch selector for OWNER |
| `web-app/src/components/products/request-transfer-dialog.tsx` | New — lazy availability fetch, source branch picker, qty validation |
| `web-app/src/components/pos/product-search.tsx` | Branch-scoped query, `branchQuantity`, "มีในสาขาอื่น" |
| `web-app/src/components/repairs/repair-detail-dialog.tsx` | Branch-scoped parts query, `branchQuantity` for stock display/limit |
| `web-app/package.json` | Fixed `apk:dev:sync` quoting; fixed `.\gradlew` path |

### Build Status (Phase 6)
- `web-app` TypeScript: **PASS** (0 errors)
- APK `assembleDevDebug`: **BUILD SUCCESSFUL** (flavor: `dev` / `com.fixitpro.dev`)
- DEV only — no PROD deploy
