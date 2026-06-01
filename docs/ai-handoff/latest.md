# Phase Summary

**Phase:** S1.3 — Sprint 1 Group 3: Money & Stock Integrity  
**Date:** 2026-06-01  
**Status:** Complete. CHB-03 and CHB-10 resolved. Awaiting S1.4 approval.

---

## Completed

* ✅ CHB-03 — Debt payment `$transaction`: `repairAdditionalPayment.create`, `repair.update`, and `auditLog.create` now execute atomically in one Prisma transaction; notifications remain fire-and-forget outside
* ✅ CHB-10 — Atomic stock transfer receive: replaced unconditional `{ decrement }` with `updateMany WHERE quantity >= transferQty` in both `receiveTransfer` and `completeTransfer`; rejected transfers (`count === 0`) throw `BadRequestException`
* ✅ CHB-10 — Atomic PO goods receive: re-reads each `PurchaseOrderItem.receivedQty` inside the existing `$transaction` to prevent concurrent requests from double-counting with stale pre-read data
* ✅ Regression tests: `s1.3-money-stock.test.ts` — 21 new tests across CHB-03 and CHB-10

---

## Changed Files

| File | Change |
|------|--------|
| `backend/src/debt-payments/debt-payments.service.ts` | CHB-03: three DB writes wrapped in single `$transaction`; `auditLog.create` moved inside tx; notifications remain outside |
| `backend/src/branches/branches.service.ts` | CHB-10: `receiveTransfer` + `completeTransfer` — `branchStock.update({ decrement })` replaced with `branchStock.updateMany WHERE quantity >= transferQty` |
| `backend/src/purchase-orders/purchase-orders.service.ts` | CHB-10: `receiveGoods` — re-reads `purchaseOrderItem.receivedQty` inside `$transaction` before validating and incrementing |
| `web-app/src/__tests__/s1.3-money-stock.test.ts` | NEW — 21 regression tests for CHB-03 atomicity and CHB-10 concurrent stock safety |
| `docs/commercial-readiness/commercial-hardening-plan.md` | CHB-03, CHB-10 marked ✅ RESOLVED; checklist updated to 783/783 |

---

## Exact Fixes

### CHB-03 — Debt payment `$transaction`

**Before (non-atomic):**
```typescript
// Three separate DB calls — if repair.update fails, payment record orphans
const payment = await this.prisma.repairAdditionalPayment.create({ ... });
await this.prisma.repair.update({ data: { paymentStatus } });
await this.auditLog.log({ ... });  // silent try/catch — could also fail
```

**After (atomic):**
```typescript
const payment = await this.prisma.$transaction(async (tx) => {
  const pmt = await tx.repairAdditionalPayment.create({ ... });
  await tx.repair.update({ data: { paymentStatus } });
  await tx.auditLog.create({ data: { ... } });  // throws on failure → rollback
  return pmt;
});
// Notifications remain outside — fire-and-forget, safe to miss
```

### CHB-10 — Stock transfer deduction guard

**Before (race condition):**
```typescript
// Pre-check outside tx (TOCTOU window)
if (fromStock.quantity < transfer.quantity) throw ...;
// Inside tx — unconditional; concurrent tx can push stock negative
await branchStock.update({ data: { quantity: { decrement: transfer.quantity } } });
```

**After (atomic):**
```typescript
// Inside tx — updateMany with WHERE guard; count=0 means guard failed
const deducted = await branchStock.updateMany({
  where: { branchId, productId, quantity: { gte: transfer.quantity } },
  data:  { quantity: { decrement: transfer.quantity } },
});
if (deducted.count === 0) throw new BadRequestException('สต็อกไม่เพียงพอ (อาจมีการโอนพร้อมกัน)');
```

Applied to: `receiveTransfer` and `completeTransfer`.

### CHB-10 — PO receive double-receive prevention

**Before (stale read):**
```typescript
// pre-flight check reads po.items outside the tx
// Inside tx: increment without re-checking — concurrent calls both pass
await tx.purchaseOrderItem.update({ data: { receivedQty: { increment } } });
```

**After (fresh read inside tx):**
```typescript
// Inside $transaction — re-read to get current receivedQty
const freshItem = await tx.purchaseOrderItem.findUnique({ where: { id } });
const remainingQty = freshItem.quantity - freshItem.receivedQty;
if (recv.quantity > remainingQty) throw new BadRequestException('รับเกินจำนวน (อาจมีการรับพร้อมกัน)');
await tx.purchaseOrderItem.update({ data: { receivedQty: { increment } } });
```

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS — 0 errors |
| Backend `nest build` | ✅ PASS — exit 0 |
| Vitest full suite | ✅ 783 / 783 (25 test files, +21 new) |

Previous baseline: 762 tests. +21 regression tests for CHB-03 and CHB-10.

---

## Remaining Open Blockers

| ID | Status |
|----|--------|
| CHB-01 | Open — localStorage token (own track) |
| CHB-05 | Open — Financial `@Max()` DTOs |
| CHB-11 | Open — CSP header in nginx |

---

## Next Recommended Action

**S1.4 — Group 4: Input Validation (awaiting approval)**  
CHB-05 — `@Max()` bounds on all financial DTOs (`debt-payments`, `expenses`, `carrier-wallet`, `purchase-orders`)
