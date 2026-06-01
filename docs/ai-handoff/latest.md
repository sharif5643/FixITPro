# Phase Summary

**Phase:** S1.4 — Sprint 1 Group 4: Validation & CSP Hardening  
**Date:** 2026-06-01  
**Status:** Complete. CHB-05 and CHB-11 resolved. CHB-01 remains open (own track).

---

## Completed

* ✅ CHB-05 — `@Max()` bounds on all financial DTOs: 16 DTO files updated; covers money amounts, unit prices, quantities, stock counts, VAT %, warranty days, carrier wallet amounts, shift cash balances
* ✅ CHB-11 — CSP header in nginx: three server blocks in `app.conf.template` now emit `Content-Security-Policy` on every response
* ✅ Regression tests: `s1.4-validation-csp.test.ts` — 84 new tests

---

## Changed Files

### CHB-05 — Financial DTO `@Max()` bounds (16 files)

| File | Fields capped |
|------|--------------|
| `debt-payments/dto/create-debt-payment.dto.ts` | `amount` → `@Max(10_000_000)` |
| `expenses/dto/create-expense.dto.ts` | `amount` → `@Max(10_000_000)` |
| `carrier-wallet/dto/topup.dto.ts` | `amount` → `@Max(100_000)` |
| `carrier-wallet/dto/package-sale.dto.ts` | `packageAmount`, `amountPaid` → `@Max(100_000)` |
| `purchase-orders/dto/create-po.dto.ts` | `quantity` → `@Max(10_000)`, `unitCost` → `@Max(1_000_000)`, `discount` → `@Max(10_000_000)`, `vatPercent` → `@Max(100)` |
| `purchase-orders/dto/create-payment.dto.ts` | `amount` → `@Max(10_000_000)` |
| `repairs/dto/create-repair.dto.ts` | `estimateCost`, `deposit` → `@Max(10_000_000)` |
| `repairs/dto/update-repair.dto.ts` | `estimateCost`, `finalCost`, `deposit`, `estimatedLaborCost`, `estimatedPartsCost`, `estimatedTotal`, `actualLaborCost` → `@Max(10_000_000)` |
| `repairs/dto/repair-payment.dto.ts` | `amountPaid`, `finalCost` → `@Max(10_000_000)`, `warrantyDays` → `@Max(3_650)` |
| `repairs/dto/additional-payment.dto.ts` | `amount` → `@Max(10_000_000)` (+ added `@Type(() => Number)`) |
| `repairs/dto/add-repair-part.dto.ts` | `quantity` → `@Max(10_000)`, `price` → `@Max(1_000_000)` |
| `sales/dto/create-sale.dto.ts` | `quantity` → `@Max(10_000)`, `price`, `discount` → `@Max(1_000_000)`, `amountPaid`, `discount` → `@Max(10_000_000)` |
| `sales/dto/refund-sale.dto.ts` | `quantity` → `@Max(10_000)`, `refundPrice` → `@Max(1_000_000)` |
| `products/dto/create-product.dto.ts` | `price`, `costPrice` → `@Max(1_000_000)`, `stock`, `minStock` → `@Max(100_000)`, `warrantyDays` → `@Max(3_650)` |
| `shifts/dto/open-shift.dto.ts` | `openBalance`, all carrier balances → `@Max(1_000_000)` |
| `shifts/dto/close-shift.dto.ts` | `closeBalance` → `@Max(1_000_000)` |
| `branches/dto/create-transfer.dto.ts` | `quantity` → `@Max(10_000)` |
| `branches/dto/set-branch-stock.dto.ts` | `quantity`, `minStock` → `@Max(100_000)` |
| `stock/dto/adjust-stock.dto.ts` | `quantity` → `@Min(-100_000) @Max(100_000)` |
| `super-admin/payments/dto/create-payment.dto.ts` | `paymentAmount` → `@Max(10_000_000)` |

### CHB-11 — CSP header in nginx (1 file, 3 server blocks)

| Server block | CSP added |
|---|---|
| `api.fixitpro.app` | `default-src 'none'; frame-ancestors 'none'; object-src 'none'` |
| `app.fixitpro.app` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss: https:; frame-ancestors 'none'; object-src 'none'` |
| `admin.fixitpro.app` | Same as app dashboard |

---

## DTO Limit Reference

| Limit constant | Value | Applied to |
|---|---|---|
| `MAX_MONEY` | 10,000,000 | Transaction-level amounts (expenses, payments, repair costs, sale totals) |
| `MAX_UNIT_PRICE` | 1,000,000 | Per-item price / cost (products, sale items, repair parts) |
| `MAX_QUANTITY` | 10,000 | Items per transaction / transfer |
| `MAX_STOCK_QTY` | 100,000 | Inventory / branch stock quantity |
| `MAX_CARRIER` | 100,000 | Carrier wallet topup / package sale |
| `MAX_SHIFT_CASH` | 1,000,000 | Cash drawer opening / closing balance |
| `MAX_VAT_PERCENT` | 100 | VAT percentage |
| `MAX_WARRANTY_DAYS` | 3,650 | Warranty duration (10 years) |
| `MAX_STOCK_ADJ` | ±100,000 | Stock adjustment (negative allowed for OUT type) |

---

## Build / Test Results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ PASS — 0 errors |
| Backend `nest build` | ✅ PASS — exit 0 |
| Vitest full suite | ✅ 867 / 867 (26 test files, +84 new) |

Previous baseline: 783 tests. +84 regression tests for CHB-05 and CHB-11.

---

## Remaining Open Blockers

| ID | Status |
|----|--------|
| **CHB-01** | Open — localStorage token (own track — requires frontend auth architecture change) |

---

## Sprint 1 Blocker Resolution Summary

| ID | Sprint | Status |
|----|--------|--------|
| CHB-01 | Own track | ⏳ Open |
| CHB-02 | S1.2 | ✅ Resolved |
| CHB-03 | S1.3 | ✅ Resolved |
| CHB-04 | S1.2 | ✅ Resolved |
| CHB-05 | S1.4 | ✅ Resolved |
| CHB-06 | S1.2 | ✅ Resolved |
| CHB-07 | S1.1 | ✅ Resolved |
| CHB-08 | S1.1 | ✅ Resolved |
| CHB-09 | S1.1 | ✅ Resolved |
| CHB-10 | S1.3 | ✅ Resolved |
| CHB-11 | S1.4 | ✅ Resolved |

10 of 11 blockers resolved. Only CHB-01 (localStorage token) remains open.
