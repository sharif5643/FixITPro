# Phase 4B.3E — POS Accounting Edge-Case Verification

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Verdict:** All executed tests PASS. Double-entry accounting handles all tested POS edge cases correctly.  
**Next step:** Owner approval before Phase 4B.4 (Repair/Expense journal entries).

---

## Pilot Tenant

| Field | Value |
|-------|-------|
| Tenant ID | `cmsc05do8001u7i29q3p5x6zp` |
| Shop | ริวคอม เซอร์วิซ |
| Branch | สาขาหลัก (`cmsc05doa001w7i299y1cr8vf`) |
| Activation Timestamp | `2026-08-18T04:17:00Z` (expires 2026-08-19T04:17:00Z) |

---

## Baseline (Start of Phase 4B.3E)

| Table | Count |
|-------|-------|
| `JournalEntry` | 2 |
| `JournalLine` | 4 |
| `Sale` | 95 |
| `SalePayment` | 62 |
| `CashDrawerTransaction` | 121 |
| `StockMovement` | 268 |

---

## Tests Executed

| # | Test | Status | Note |
|---|------|--------|------|
| 1 | TRANSFER/QR Payment | ✅ PASS | DR 1120, not 1100 |
| 2 | Multi-Item Sale | ✅ PASS | Separate COGS per item |
| 3 | Discount | ✅ PASS | Revenue = final total, COGS unchanged |
| 4 | Zero-Cost Product | ⏭ SKIPPED | No eligible product in pilot tenant |
| 5 | Void | ✅ PASS | Reversal journals, stock restored |
| 6 | Refund | ✅ PASS | Revenue + COGS reversal |
| 7 | Split Payment | ✅ PASS | Per-leg journals, correct cash amount |
| 8 | Reconciliation | ✅ PASS | scanned=7, posted=7, errors=0 |
| 9 | Tenant Isolation | ✅ PASS | Other tenants: 0 JE |

---

## TEST 1 — TRANSFER/QR Payment

**Product:** Apple Cable lightning to usb \*or (`cmsdaqyaa006p11t9ac2remtb`) — cost=฿420, price=฿790  
**Payment:** TRANSFER ฿790  

| Field | Value |
|-------|-------|
| Sale ID | `cmsyjqfqd005an7wbj6fsyr29` |
| Receipt | `RCP-20260818-34E023` |
| SaleItem ID | `cmsyjqfqd005cn7wbytrgvnao` |
| SalePayment ID | `cmsyjqfqd005dn7wbw8epjiki` (TRANSFER, ฿790) |
| Sale total | ฿790.00 |
| costPrice | ฿420.00 |

**Revenue Journal (`JE-20260818-ACDEF659`):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Transfer/Card Clearing | **1120** | **฿790.00** | — |
| Sales Revenue | **4100** | — | **฿790.00** |

**COGS Journal (`JE-20260818-C3B3644C`):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cost of Goods Sold | **5100** | **฿420.00** | — |
| Inventory | **1300** | — | **฿420.00** |

**Verification:**
- Account 1120 (not 1100) correctly used for TRANSFER payment ✅
- Both entries balanced ✅
- CashDrawer: IN ฿790 TRANSFER ✅
- BranchStock: -1 ✅
- Result: **PASS**

---

## TEST 2 — Multi-Item Sale

**Products:**
- Apple Adepter 5W \*แท้ (`cmsdakf71006f11t9e6wr0idf`) — cost=฿250, price=฿490, qty=1
- hoco ew19plus \*ม่วง (`cmsd9sfkd004k11t9io4ubl8r`) — cost=฿120, price=฿390, qty=1

**Payment:** CASH ฿880 (total of both items)

| Field | Value |
|-------|-------|
| Sale ID | `cmsyjquvh005vn7wbt474662z` |
| Receipt | `RCP-20260818-278DFD` |
| SaleItem 1 ID | `cmsyjquvh005xn7wb1ydq8y0y` (Apple Adepter 5W) |
| SaleItem 2 ID | `cmsyjquvh005yn7wbd57fenji` (hoco ew19plus) |
| SalePayment ID | `cmsyjquvh005zn7wbls5nrwud` (CASH, ฿880) |
| Sale total | ฿880.00 |

**Revenue Journal (`JE-20260818-DBF2347C`) — ONE entry, not duplicated:**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cash on Hand | **1100** | **฿880.00** | — |
| Sales Revenue | **4100** | — | **฿880.00** |

**COGS Journal 1 (`JE-20260818-0B0FE609`) — Apple Adepter 5W:**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cost of Goods Sold | **5100** | **฿250.00** | — |
| Inventory | **1300** | — | **฿250.00** |

**COGS Journal 2 (`JE-20260818-09695028`) — hoco ew19plus:**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cost of Goods Sold | **5100** | **฿120.00** | — |
| Inventory | **1300** | — | **฿120.00** |

**Verification:**
- Revenue: exactly one entry for the single payment leg (฿880 = sum of items) ✅
- No duplicate revenue ✅
- Each SaleItem has its own SALE_COGS journal ✅
- COGS total = 250+120 = 370 (correct, not inflated) ✅
- Sum of all debits = 880+250+120 = 1,250; sum of all credits = 880+250+120 = 1,250 ✅
- Result: **PASS**

---

## TEST 3 — Discount

**Product:** ลำโพงยาว FOX (`cmsu96obv00p613lls2vgnrld`) — cost=฿150, price=฿590  
**Item-level discount:** ฿90 → item.total = ฿500  
**Payment:** CASH ฿500  

| Field | Value |
|-------|-------|
| Sale ID | `cmsyjrhkb006qn7wbxtpn6k1d` |
| Receipt | `RCP-20260818-7D55B7` |
| SaleItem ID | `cmsyjrhkb006sn7wbcreezz32` |
| SalePayment ID | `cmsyjrhkb006tn7wb3em69ljz` (CASH, ฿500) |
| Sale.total | ฿500.00 (after discount) |
| Sale.subtotal | ฿500.00 (item level: 590−90=500) |
| SaleItem.discount | ฿90.00 |
| costPrice | ฿150.00 |

**Revenue Journal (`JE-20260818-B4892AB4`):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cash on Hand | **1100** | **฿500.00** | — |
| Sales Revenue | **4100** | — | **฿500.00** |

**COGS Journal (`JE-20260818-8B583F77`):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cost of Goods Sold | **5100** | **฿150.00** | — |
| Inventory | **1300** | — | **฿150.00** |

**Verification:**
- Revenue = ฿500 (final Sale.total, NOT pre-discount subtotal ฿590) ✅
- COGS = ฿150 (costPrice × qty, unchanged by discount) ✅
- Both entries balanced ✅
- Result: **PASS**

---

## TEST 4 — Zero-Cost Product

**Status: SKIPPED**

**Reason:** No product with `costPrice = 0` or `costPrice IS NULL` exists in the pilot tenant (`cmsc05do8001u7i29q3p5x6zp`). All active products in the pilot branch have `costPrice > 0`.

**Code Confirmation:** The adapter explicitly handles this case (`sales-accounting.adapter.ts`, line ~217):
```typescript
if (!costPrice.gt(0)) {
  this.logger.warn(
    `SalesAccountingAdapter: skipping COGS for saleItem ${item.id} (sale ${sale.id}): costPrice=0`
  );
  continue;
}
```
No COGS journal is ever created for a zero-cost item. The behavior is confirmed by code inspection and by the existing unit test (`sales-accounting.adapter.spec.ts`, test case for zero-cost items).

**Safe to skip:** This path is exercised by unit tests. A real zero-cost product can be tested if one is added to the pilot inventory.

---

## TEST 5 — Void

**Pre-Void Code Inspection:**

| Property | Value |
|----------|-------|
| Void endpoint | `POST /api/v1/sales/:id/void` |
| Guards | Requires `sales.refund` permission (OWNER has ALL_PERMISSIONS) |
| Shift check | Open shift required |
| Status guard | 409 if already VOIDED |
| Shift guard | 409 if sale's shift is closed |
| Stock restoration | ✅ `BranchStock.quantity += restoreQty`, `StockMovement type=IN` |
| Cash drawer reversal | ✅ `accounting.record(direction=OUT)` per payment leg within the transaction |
| Journal reversal | ✅ `salesAccounting.reverseSaleJournal()` post-transaction — creates NEW reversal JE via `journal.reverse()` |
| Original journal | ✅ Untouched (isVoided=false); original is audit trail |
| Idempotency | ✅ `journal.reverse()` uses `sourceType=JOURNAL_REVERSAL, sourceId=originalJE.id` — idempotent |

**Product:** SIM AIS (`cmsfwymuw00nb1076yzpuuax8`) — cost=฿20, price=฿50  
**Payment:** CASH ฿50  

| Field | Value |
|-------|-------|
| Sale ID | `cmsyjshcx007bn7wb5t3dd1bu` |
| Receipt | `RCP-20260818-DBF19B` |
| SaleItem ID | `cmsyjshcx007dn7wbnizrn5xf` |
| SalePayment ID | `cmsyjshcx007en7wbkn6l3v8p` (CASH, ฿50) |
| Post-void status | `VOIDED` |
| voidReason | "4B.3E void test" |

**Original Journals (intact, isVoided=false):**

| Entry Number | sourceType | DR | CR | Amount |
|-------------|-----------|----|----|--------|
| `JE-20260818-ADD5C7F6` | SALE_PAYMENT | 1100 | 4100 | ฿50.00 |
| `JE-20260818-81B9D90B` | SALE_COGS | 5100 | 1300 | ฿20.00 |

**Reversal Journals (NEW entries, sourceType=JOURNAL_REVERSAL):**

| Entry Number | sourceType | sourceId (original JE.id) | DR | CR | Amount |
|-------------|-----------|--------------------------|----|----|--------|
| `JE-20260818-A3DCF53E` | JOURNAL_REVERSAL | original revenue JE id | 4100 | 1100 | ฿50.00 |
| `JE-20260818-5814C8B3` | JOURNAL_REVERSAL | original COGS JE id | 1300 | 5100 | ฿20.00 |

**Net accounting effect:**

| Account | Original | Reversal | Net |
|---------|---------|---------|-----|
| 1100 Cash | +50 (DR) | −50 (CR) | **0** |
| 4100 Revenue | −50 (CR) | +50 (DR) | **0** |
| 5100 COGS | +20 (DR) | −20 (CR) | **0** |
| 1300 Inventory | −20 (CR) | +20 (DR) | **0** |

**Cash Drawer:**

| CDT | Direction | Amount | referenceId |
|-----|----------|--------|-------------|
| SALE_PAYMENT | IN | ฿50.00 | SalePayment.id |
| SALE_REFUND | OUT | ฿50.00 | SalePayment.id |
| **Net** | — | **฿0.00** | — |

**Stock:** SIM AIS BranchStock = 24 (unchanged — SALE then IN restore, net 0) ✅  
**Reconciliation status:** POSTED ✅ (JOURNAL_REVERSAL entries found for both original JEs → `voidMissing=false`)  
**Result: PASS**

---

## TEST 6 — Refund

**Pre-Refund Code Inspection:**

| Property | Value |
|----------|-------|
| Refund endpoint | `POST /api/v1/sales/:id/refund` |
| Guards | `sales.refund` permission |
| Stock restoration | ✅ `BranchStock.quantity += refundItem.quantity`, `StockMovement type=REFUND` |
| Cash drawer reversal | ✅ `accounting.record(direction=OUT, sourceType=SALE_REFUND)` within transaction |
| Revenue reversal JE | ✅ `SALE_REFUND`, `sourceId=refund.id` — DR 4100 / CR 1100 (or 1120) |
| COGS reversal JE | ✅ `SALE_REFUND_COGS`, `sourceId="${refund.id}:${saleItemId}"` — DR 1300 / CR 5100 |
| Idempotency | ✅ Both sourceIds are unique compound keys; idempotent via `findBySource` + DB partial unique index |

**Product:** SIM DTAC (`cmsfx0ans00nh1076exluaava`) — cost=฿20, price=฿50  
**Payment:** CASH ฿50  

| Field | Value |
|-------|-------|
| Sale ID | `cmsyjuclq008kn7wbg9q3os1o` |
| Receipt | `RCP-20260818-C16C6B` |
| SaleItem ID | `cmsyjuclq008mn7wb6tqk2lcs` |
| SalePayment ID | `cmsyjuclq008nn7wbvhcktu5h` (CASH, ฿50) |
| SaleRefund ID | `cmsyjv2oy009yn7wblv1yw1pi` |
| Refund Number | `REF-20260818-014306` |
| totalRefund | ฿50.00 |
| Refund paymentMethod | CASH |
| Post-refund sale status | REFUNDED |

**Revenue Reversal (`JE-20260818-0B793B4A`, SALE_REFUND):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Sales Revenue | **4100** | **฿50.00** | — |
| Cash on Hand | **1100** | — | **฿50.00** |

**COGS Reversal (`JE-20260818-1428BC03`, SALE_REFUND_COGS):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Inventory | **1300** | **฿20.00** | — |
| Cost of Goods Sold | **5100** | — | **฿20.00** |

**sourceId for COGS reversal:** `cmsyjv2oy009yn7wblv1yw1pi:cmsyjuclq008mn7wb6tqk2lcs` (composite) ✅

**Cash Drawer:**

| CDT | Direction | Amount |
|-----|----------|--------|
| SALE_PAYMENT (IN) | IN | ฿50.00 |
| SALE_REFUND (OUT) | OUT | ฿50.00 |

**Stock:** SIM DTAC BranchStock = 19 (restored, net 0) ✅  
**Reconciliation status:** POSTED ✅  
**Result: PASS**

---

## TEST 7 — Split Payment

**Product:** Apple Cable C to L \*แท้ (`cmsdav1h6007511t94h9blbdm`) — cost=฿390, price=฿790  
**Payments:** CASH ฿290 + TRANSFER ฿500 = total ฿790 (no change)  

| Field | Value |
|-------|-------|
| Sale ID | `cmsyjugxg0095n7wb4rrx52vz` |
| Receipt | `RCP-20260818-7A027A` |
| SaleItem ID | `cmsyjugxg0097n7wbijlu037g` |
| SalePayment 1 | `cmsyjugxg0098n7wbzgytsvj0` (CASH, ฿290) |
| SalePayment 2 | `cmsyjugxg0099n7wbnjylyhgy` (TRANSFER, ฿500) |
| Sale.total | ฿790.00 |
| costPrice | ฿390.00 |

**Revenue Journal 1 (`JE-20260818-7074937F`) — CASH leg:**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cash on Hand | **1100** | **฿290.00** | — |
| Sales Revenue | **4100** | — | **฿290.00** |

*Cash journal amount = Sale.total (฿790) − nonCashTotal (฿500) = ฿290 — NOT the tendered amount. Correct: no change was involved.*

**Revenue Journal 2 (`JE-20260818-AC82EAC8`) — TRANSFER leg:**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Transfer/Card Clearing | **1120** | **฿500.00** | — |
| Sales Revenue | **4100** | — | **฿500.00** |

**COGS Journal (`JE-20260818-AEE5B4E0`):**

| Account | Code | Debit | Credit |
|---------|------|-------|--------|
| Cost of Goods Sold | **5100** | **฿390.00** | — |
| Inventory | **1300** | — | **฿390.00** |

**Revenue check:** 290 + 500 = **฿790.00** = Sale.total ✅  
**No duplicate revenue** — separate journal per payment leg, single revenue account ✅  
**COGS unchanged** by split payment method ✅  
**Result: PASS**

---

## Account Mapping Summary

| Payment Method | DR Account | CR Account |
|---------------|-----------|-----------|
| CASH | 1100 Cash on Hand | 4100 Sales Revenue |
| TRANSFER | 1120 Transfer/Card Clearing | 4100 Sales Revenue |
| CARD | 1120 Transfer/Card Clearing | 4100 Sales Revenue |
| COGS (any) | 5100 Cost of Goods Sold | 1300 Inventory |

| Operation | Entry | DR | CR |
|-----------|-------|----|----|
| Revenue reversal (void) | JOURNAL_REVERSAL | 4100 | 1100/1120 |
| COGS reversal (void) | JOURNAL_REVERSAL | 1300 | 5100 |
| Revenue reversal (refund) | SALE_REFUND | 4100 | 1100/1120 |
| COGS reversal (refund) | SALE_REFUND_COGS | 1300 | 5100 |

---

## TEST 8 — Reconciliation

**POST /api/v1/admin/accounting/run-reconciliation** at 2026-08-18T11:00:28Z:

```json
{
  "scannedAt": "2026-08-18T11:00:28.096Z",
  "tenantId": "cmsc05do8001u7i29q3p5x6zp",
  "activationTs": "2026-08-18T04:17:00.000Z",
  "summary": {
    "scanned": 7,
    "posted": 7,
    "missing": 0,
    "recovered": 0,
    "errors": 0
  }
}
```

| Sale | Receipt | Type | Status |
|------|---------|------|--------|
| `cmsycxx4j002hn7wbegpgr486` | RCP-20260818-84BECD | COMPLETED (4B.3D pilot) | **POSTED** |
| `cmsyjqfqd005an7wbj6fsyr29` | RCP-20260818-34E023 | COMPLETED (T1 TRANSFER) | **POSTED** |
| `cmsyjquvh005vn7wbt474662z` | RCP-20260818-278DFD | COMPLETED (T2 MULTI-ITEM) | **POSTED** |
| `cmsyjrhkb006qn7wbxtpn6k1d` | RCP-20260818-7D55B7 | COMPLETED (T3 DISCOUNT) | **POSTED** |
| `cmsyjshcx007bn7wb5t3dd1bu` | RCP-20260818-DBF19B | VOIDED (T5) | **POSTED** |
| `cmsyjuclq008kn7wbg9q3os1o` | RCP-20260818-C16C6B | REFUNDED (T6) | **POSTED** |
| `cmsyjugxg0095n7wb4rrx52vz` | RCP-20260818-7A027A | COMPLETED (T7 SPLIT) | **POSTED** |

No duplicate journals. No recovered items. No errors. ✅

---

## TEST 9 — Tenant Isolation

| Metric | Value |
|--------|-------|
| JournalEntry for OTHER tenants | **0** ✅ |
| JournalLine for OTHER tenants | **0** ✅ |
| All 20 JournalEntry rows belong to pilot tenant | ✅ |

---

## TEST 10 — Final Counts

| Table | Baseline (start of 4B.3E) | After 4B.3E | Delta |
|-------|--------------------------|-------------|-------|
| `JournalEntry` | 2 | **20** | +18 |
| `JournalLine` | 4 | **40** | +36 |
| `JournalEntry` (JOURNAL_REVERSAL only) | 0 | **2** | +2 (T5 void) |
| `Sale` | 95 | **101** | +6 |
| `SalePayment` | 62 | **69** | +7 |
| `CashDrawerTransaction` | 121 | **130** | +9 |
| `StockMovement` | 268 | **277** | +9 |

### Delta breakdown

| Test | JE | JL | Sale | SP | CDT | SM |
|------|----|----|------|----|-----|-----|
| T1 TRANSFER | +2 | +4 | +1 | +1 | +1 | +1 |
| T2 MULTI-ITEM | +3 | +6 | +1 | +1 | +1 | +2 |
| T3 DISCOUNT | +2 | +4 | +1 | +1 | +1 | +1 |
| T5 VOID (sale) | +2 | +4 | +1 | +1 | +1 | +1 |
| T5 VOID (void) | +2 | +4 | 0 | 0 | +1 | +1 |
| T6 REFUND (sale) | +2 | +4 | +1 | +1 | +1 | +1 |
| T6 REFUND (refund) | +2 | +4 | 0 | 0 | +1 | +1 |
| T7 SPLIT | +3 | +6 | +1 | +2 | +2 | +1 |
| **Total** | **+18** | **+36** | **+6** | **+7** | **+9** | **+9** |

---

## Transaction Summary Table (TEST 10)

| Test | Sale ID | Payment IDs | Expected Journal | Actual Journal | Debit Total | Credit Total | COGS | CashDrawer | Stock | Recon | Result |
|------|---------|-------------|-----------------|----------------|-------------|--------------|------|-----------|-------|-------|--------|
| 4B.3D | `cmsycxx4j002hn7wbegpgr486` | `cmsycxx4j002kn7wbwp7334fi` (CASH 790) | DR 1100/CR 4100 + DR 5100/CR 1300 | Matched | ฿1,180 | ฿1,180 | ฿390 | IN 790 | -1 | POSTED | ✅ |
| T1 TRANSFER | `cmsyjqfqd005an7wbj6fsyr29` | `cmsyjqfqd005dn7wbw8epjiki` (TRANSFER 790) | DR 1120/CR 4100 + DR 5100/CR 1300 | Matched | ฿1,210 | ฿1,210 | ฿420 | IN 790 | -1 | POSTED | ✅ |
| T2 MULTI | `cmsyjquvh005vn7wbt474662z` | `cmsyjquvh005zn7wbls5nrwud` (CASH 880) | DR 1100/CR 4100 + 2×COGS | Matched | ฿1,250 | ฿1,250 | ฿370 | IN 880 | -2 | POSTED | ✅ |
| T3 DISC | `cmsyjrhkb006qn7wbxtpn6k1d` | `cmsyjrhkb006tn7wb3em69ljz` (CASH 500) | DR 1100/CR 4100=500 + DR 5100/CR 1300=150 | Matched | ฿650 | ฿650 | ฿150 | IN 500 | -1 | POSTED | ✅ |
| T4 ZERO | — | — | — | SKIPPED | — | — | — | — | — | — | ⏭ |
| T5 VOID | `cmsyjshcx007bn7wb5t3dd1bu` | `cmsyjshcx007en7wbkn6l3v8p` (CASH 50) | 2 orig + 2 reversal | Matched | ฿140 | ฿140 | net 0 | net 0 | net 0 | POSTED | ✅ |
| T6 REFUND | `cmsyjuclq008kn7wbg9q3os1o` | `cmsyjuclq008nn7wbvhcktu5h` (CASH 50) | sale + refund reversals | Matched | ฿140 | ฿140 | net 0 | net 0 | net 0 | POSTED | ✅ |
| T7 SPLIT | `cmsyjugxg0095n7wb4rrx52vz` | `...98` (CASH 290) + `...99` (TRANSFER 500) | 2 revenue JE + COGS | Matched | ฿1,180 | ฿1,180 | ฿390 | IN 290+500 | -1 | POSTED | ✅ |

---

## Production Impact

- All test transactions are real production records (no DB bypass was used)
- Stock was decremented and restored correctly by the service's own logic
- No accounting data was inserted manually
- No code was modified
- No environment variables were changed
- No other tenant was enabled or affected

**Real stock net change after all tests:**

| Product | Before | After | Net |
|---------|--------|-------|-----|
| Apple Cable lightning (`cmsdaqyaa006p11t9ac2remtb`) | 3 | **2** | -1 (T1, permanent) |
| Apple Adepter 5W (`cmsdakf71006f11t9e6wr0idf`) | 3 | **2** | -1 (T2, permanent) |
| hoco ew19plus (`cmsd9sfkd004k11t9io4ubl8r`) | 2 | **1** | -1 (T2, permanent) |
| ลำโพงยาว FOX (`cmsu96obv00p613lls2vgnrld`) | 3 | **2** | -1 (T3, permanent) |
| SIM AIS (`cmsfwymuw00nb1076yzpuuax8`) | 24 | **24** | 0 (T5: void restored) |
| SIM DTAC (`cmsfx0ans00nh1076exluaava`) | 19 | **19** | 0 (T6: refund restored) |
| Apple Cable C to L (`cmsdav1h6007511t94h9blbdm`) | 4 | **3** | -1 (T7, permanent) |

---

## Test Suite

```
Test Suites: 28 passed, 28 total
Tests:       353 passed, 353 total
Snapshots:   0 total
Time:        62.722 s
```

All 353 existing tests pass. No regressions introduced.

---

## Final Report

| # | Criterion | Result |
|---|-----------|--------|
| 1 | TRANSFER uses account 1120 (not 1100) | ✅ PASS |
| 2 | Multi-item: single revenue entry, separate COGS per item | ✅ PASS |
| 3 | Discount: revenue = final total, COGS = costPrice (unchanged) | ✅ PASS |
| 4 | Zero-cost: no COGS journal created | ⏭ SKIPPED (code confirmed) |
| 5 | Void: original journals intact, reversal journals net to 0 | ✅ PASS |
| 6 | Refund: revenue + COGS reversal, stock/CDT restored | ✅ PASS |
| 7 | Split payment: correct per-leg journals, total = Sale.total | ✅ PASS |
| 8 | Reconciliation: all 7 sales POSTED, 0 missing, 0 errors | ✅ PASS |
| 9 | Tenant isolation: 0 JE for other tenants | ✅ PASS |
| 10 | All counts match expected deltas | ✅ PASS |
| 11 | Test suite | ✅ 353/353 |
| — | **FINAL VERDICT** | **PASS** |

---

## STOPPED

Phase 4B.3E is complete.

**Awaiting owner approval before:**
1. **Phase 4B.4** — Repair journal entries (service revenue DR 1100/1120 / CR 4200, parts COGS)
2. **Phase 4B.5** — Exchange flow journal entries
3. **Increasing pilot volume** — enabling additional test sales
4. **Enabling other tenants**

**Active safety notes:**
- `ACCOUNTING_ACTIVATION_TIMESTAMP = 2026-08-18T04:17:00Z` expires **2026-08-19T04:17:00Z** — if Coolify redeploys after that, update Coolify DB id=51 before deploying
- All accounting env vars are in the running Docker container and Coolify DB — a normal Coolify redeploy will read from Coolify DB and preserve them
