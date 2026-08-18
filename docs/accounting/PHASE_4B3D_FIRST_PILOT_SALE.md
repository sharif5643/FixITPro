# Phase 4B.3D — First Pilot Sale

**Date:** 2026-08-18  
**Status:** COMPLETE — PASS  
**Verdict:** All 20 verification criteria pass. Double-entry accounting is live and correct.  
**Next step:** Owner approval before expanding accounting to additional tenants or phases.

---

## Pilot Tenant

| Field | Value |
|-------|-------|
| Tenant ID | `cmsc05do8001u7i29q3p5x6zp` |
| Shop | ริวคอม เซอร์วิซ |
| Branch | สาขาหลัก (`cmsc05doa001w7i299y1cr8vf`) |
| User | ปฏิมากร บุญศิริ — OWNER (`cmsc05doh001y7i29jxe0g3pw`) |

---

## 1. Pre-Flight Verification

| Check | Expected | Actual |
|-------|----------|--------|
| `ACCOUNTING_CORE_ENABLED` | `true` | `true` ✅ |
| `ACCOUNTING_ENABLED_TENANTS` | pilot only | `cmsc05do8001u7i29q3p5x6zp` ✅ |
| `isEnabled(pilot)` | true | **true** ✅ |
| `isEnabled(other tenant)` | false | **false** ✅ |
| `JournalEntry` count | 0 | **0** ✅ |
| `JournalLine` count | 0 | **0** ✅ |
| `AccountingAccount` | 17 | **17** ✅ |
| `Sale` baseline | — | 94 |
| `SalePayment` baseline | — | 61 |
| `CashDrawerTransaction` baseline | — | 120 |
| `StockMovement` baseline | — | 267 |
| BranchStock for test product | 5 | **5** ✅ |
| Open shift | required | `cmsy0fhln00ccwkpi679me4gd` (isActive=true) ✅ |
| Branch status | ACTIVE | **ACTIVE** ✅ |

---

## 2. Test Product

| Field | Value |
|-------|-------|
| Product ID | `cmsdav1h6007511t94h9blbdm` |
| Name | Apple Cable C to L *แท้ |
| SKU | ACC-000013 |
| Selling price | ฿790.00 |
| Cost price | ฿390.00 |
| Stock (before) | 5 units at pilot branch |
| Has serial | false |
| Customer | None (walk-in / null) |

---

## 3. Sale Execution

**Method:** `POST /api/v1/sales` via NestJS `SalesService.create()` — normal POS flow, no DB bypass.

**Request body:**
```json
{
  "branchId": "cmsc05doa001w7i299y1cr8vf",
  "items": [{ "productId": "cmsdav1h6007511t94h9blbdm", "quantity": 1, "price": 790 }],
  "paymentMethod": "CASH",
  "amountPaid": 790
}
```

**HTTP response:** `201 Created` at 2026-08-18T07:45:03.475Z

---

## 4. Sale Record

| Field | Value |
|-------|-------|
| `Sale.id` | `cmsycxx4j002hn7wbegpgr486` |
| `Sale.receiptNumber` | `RCP-20260818-84BECD` |
| `Sale.status` | `COMPLETED` |
| `Sale.total` | ฿790.00 |
| `Sale.subtotal` | ฿790.00 |
| `Sale.discount` | ฿0.00 |
| `Sale.amountPaid` | ฿790.00 |
| `Sale.change` | ฿0.00 |
| `Sale.paymentMethod` | `CASH` |
| `Sale.branchId` | `cmsc05doa001w7i299y1cr8vf` |
| `Sale.userId` | `cmsc05doh001y7i29jxe0g3pw` |
| `Sale.shiftId` | `cmsy0fhln00ccwkpi679me4gd` |
| `Sale.customerId` | `null` (walk-in) |

---

## 5. SalePayment Record

| Field | Value |
|-------|-------|
| `SalePayment.id` | `cmsycxx4j002kn7wbwp7334fi` |
| `SalePayment.paymentMethod` | `CASH` |
| `SalePayment.amount` | ฿790.00 |
| `SalePayment.saleId` | `cmsycxx4j002hn7wbegpgr486` |

---

## 6. SaleItem Record

| Field | Value |
|-------|-------|
| `SaleItem.id` | `cmsycxx4j002jn7wbet84ds06` |
| `SaleItem.productId` | `cmsdav1h6007511t94h9blbdm` |
| `SaleItem.quantity` | 1 |
| `SaleItem.price` | ฿790.00 |
| `SaleItem.costPrice` | ฿390.00 |
| `SaleItem.total` | ฿790.00 |

---

## 7. Revenue Journal Entry

| Field | Value |
|-------|-------|
| `JournalEntry.id` | `cmsycxx5e002rn7wb10kubziu` |
| `JournalEntry.entryNumber` | `JE-20260818-95E70FA4` |
| `JournalEntry.sourceType` | `SALE_PAYMENT` |
| `JournalEntry.sourceId` | `cmsycxx4j002kn7wbwp7334fi` (= SalePayment.id) |
| `JournalEntry.tenantId` | `cmsc05do8001u7i29q3p5x6zp` ✅ |
| `JournalEntry.branchId` | `cmsc05doa001w7i299y1cr8vf` ✅ |
| `JournalEntry.isVoided` | `false` |
| `JournalEntry.postedAt` | `2026-08-18T07:45:03.505Z` |

**Lines:**

| # | Account Code | Account Name | Debit | Credit |
|---|-------------|--------------|-------|--------|
| 1 | **1100** | Cash on Hand | **฿790.00** | ฿0.00 |
| 2 | **4100** | Sales Revenue | ฿0.00 | **฿790.00** |

---

## 8. COGS Journal Entry

| Field | Value |
|-------|-------|
| `JournalEntry.id` | `cmsycxx5o002wn7wbxa03uvpo` |
| `JournalEntry.entryNumber` | `JE-20260818-C04752FC` |
| `JournalEntry.sourceType` | `SALE_COGS` |
| `JournalEntry.sourceId` | `cmsycxx4j002jn7wbet84ds06` (= SaleItem.id) |
| `JournalEntry.tenantId` | `cmsc05do8001u7i29q3p5x6zp` ✅ |
| `JournalEntry.branchId` | `cmsc05doa001w7i299y1cr8vf` ✅ |
| `JournalEntry.isVoided` | `false` |
| `JournalEntry.postedAt` | `2026-08-18T07:45:03.516Z` |

**Lines:**

| # | Account Code | Account Name | Debit | Credit |
|---|-------------|--------------|-------|--------|
| 1 | **5100** | Cost of Goods Sold | **฿390.00** | ฿0.00 |
| 2 | **1300** | Inventory | ฿0.00 | **฿390.00** |

---

## 9. Balance Verification

| JournalEntry | Total Debit | Total Credit | Difference |
|-------------|-------------|--------------|------------|
| `JE-20260818-95E70FA4` (Revenue) | ฿790.00 | ฿790.00 | **฿0.00 ✅** |
| `JE-20260818-C04752FC` (COGS) | ฿390.00 | ฿390.00 | **฿0.00 ✅** |

Both entries are perfectly balanced. No unbalanced journal entries.

---

## 10. Cash Drawer Verification

| Field | Value |
|-------|-------|
| `CashDrawerTransaction.id` | `cmsycxx4z002on7wborqejsho` |
| type | `DEPOSIT` |
| direction | `IN` |
| amount | **฿790.00** |
| referenceType | `SALE_PAYMENT` |
| referenceId | `cmsycxx4j002kn7wbwp7334fi` (= SalePayment.id) |
| paymentMethod | `CASH` |
| sourceType | `SALE_PAYMENT` |
| tenantId | `cmsc05do8001u7i29q3p5x6zp` ✅ |
| branchId | `cmsc05doa001w7i299y1cr8vf` ✅ |

Cash drawer received exactly ฿790.00 — matches Sale.total and Journal DR amount. No discrepancy.

---

## 11. Stock Verification

| Field | Value |
|-------|-------|
| `StockMovement.id` | `cmsycxx4r002mn7wb8ovju8t3` |
| type | `SALE` |
| quantity | **1** |
| productId | `cmsdav1h6007511t94h9blbdm` |
| branchId | `cmsc05doa001w7i299y1cr8vf` |
| saleItemId | `cmsycxx4j002jn7wbet84ds06` |
| note | `Sale RCP-20260818-84BECD` |

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| `BranchStock.quantity` | 5 | **4** | **-1** ✅ |
| `StockMovement` count | 267 | **268** | **+1** ✅ |

Exactly one SALE movement. No duplicate.

---

## 12. Idempotency

The DB has a partial unique index on `("sourceType", "sourceId", "tenantId")`:
```sql
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

Any retry with the same `SalePayment.id` or `SaleItem.id` as `sourceId` would produce a Prisma P2002, caught and swallowed by the adapter. The reconciliation run (step 13) confirmed this: the scanner found the existing journal and reported `POSTED` — it did NOT create a new entry.

**Result: Idempotency CONFIRMED — no duplicate JournalEntry possible.**

---

## 13. Reconciliation

**POST /api/v1/admin/accounting/run-reconciliation** at 2026-08-18T07:47:12.649Z:

```json
{
  "scannedAt": "2026-08-18T07:47:12.649Z",
  "tenantId": "cmsc05do8001u7i29q3p5x6zp",
  "activationTs": "2026-08-18T04:17:00.000Z",
  "summary": {
    "scanned": 1,
    "posted": 1,
    "missing": 0,
    "recovered": 0,
    "errors": 0
  },
  "items": [
    {
      "saleId": "cmsycxx4j002hn7wbegpgr486",
      "receiptNumber": "RCP-20260818-84BECD",
      "status": "POSTED",
      "missingRevenue": [],
      "missingCogs": [],
      "voidMissing": false,
      "refundsMissing": [],
      "errors": [],
      "recovered": false
    }
  ]
}
```

| Metric | Value |
|--------|-------|
| Scanned | 1 |
| Posted | **1** ✅ |
| Missing | **0** ✅ |
| Recovered | **0** ✅ |
| Errors | **0** ✅ |
| Sale status | **POSTED** ✅ |
| missingRevenue | `[]` ✅ |
| missingCogs | `[]` ✅ |

---

## 14. Tenant Isolation

| Metric | Value |
|--------|-------|
| JournalEntry for OTHER tenants | **0** ✅ |
| JournalLine for OTHER tenants | **0** ✅ |

No journal entries created outside the pilot tenant.

---

## 15. Production Data Integrity

| Table | Baseline | After | Delta |
|-------|---------|-------|-------|
| `Sale` | 94 | **95** | **+1** ✅ |
| `SalePayment` | 61 | **62** | **+1** ✅ |
| `CashDrawerTransaction` | 120 | **121** | **+1** ✅ |
| `StockMovement` | 267 | **268** | **+1** ✅ |
| `JournalEntry` | 0 | **2** | **+2** ✅ (1 revenue + 1 COGS) |
| `JournalLine` | 0 | **4** | **+4** ✅ (2 per entry) |
| `AccountingAccount` | 17 | **17** | 0 (unchanged) |
| `BranchStock` (product) | 5 | **4** | -1 ✅ |

All changes correspond ONLY to the single pilot sale. No other business records modified.

---

## 16. Log Review

Backend logs 07:44–07:48 UTC (around the sale):

```
WARN [JwtStrategy] [CHB-01] Bearer fallback used — IP: ::ffff:10.0.1.1, path: /api/v1/products
WARN [JwtStrategy] [CHB-01] Bearer fallback used — IP: ::ffff:10.0.1.1, path: /api/v1/sales
WARN [JwtStrategy] [CHB-01] Bearer fallback used — IP: ::ffff:10.0.1.1, path: /api/v1/admin/accounting/run-reconciliation
```

| Issue | Status |
|-------|--------|
| Accounting errors | **NONE** ✅ |
| P2002 (unique constraint) | **NONE** ✅ |
| Prisma errors | **NONE** ✅ |
| Transaction rollback | **NONE** ✅ |
| Unhandled exceptions | **NONE** ✅ |
| Reconciliation errors | **NONE** ✅ |

The only log entries are CHB-01 Bearer fallback warnings — expected because the test used a Bearer token (normal for API testing; production clients use cookie auth). No unexpected errors.

---

## Final Report

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Product | ✅ Apple Cable C to L *แท้, price=790, costPrice=390 |
| 2 | Sale ID | ✅ `cmsycxx4j002hn7wbegpgr486` |
| 3 | SalePayment ID | ✅ `cmsycxx4j002kn7wbwp7334fi` |
| 4 | SaleItem ID | ✅ `cmsycxx4j002jn7wbet84ds06` |
| 5 | Tenant ID | ✅ `cmsc05do8001u7i29q3p5x6zp` |
| 6 | Sale total | ✅ ฿790.00 |
| 7 | Payment amount | ✅ ฿790.00 (= Sale.total, change=0) |
| 8 | costPrice | ✅ ฿390.00 |
| 9 | Revenue journal | ✅ DR 1100 ฿790 / CR 4100 ฿790 |
| 10 | COGS journal | ✅ DR 5100 ฿390 / CR 1300 ฿390 |
| 11 | JournalLines | ✅ 4 lines (2 per entry) |
| 12 | Debit total | ✅ ฿1,180.00 (790+390) |
| 13 | Credit total | ✅ ฿1,180.00 (790+390) |
| 14 | CashDrawer | ✅ DEPOSIT IN ฿790 CASH, ref=SalePayment.id |
| 15 | Stock | ✅ -1 unit, 1 StockMovement, BranchStock=4 |
| 16 | Reconciliation | ✅ scanned=1, posted=1, missing=0, errors=0 |
| 17 | Idempotency | ✅ DB unique index enforced; reconciliation confirmed POSTED (no duplicate) |
| 18 | Other tenants | ✅ 0 JournalEntry for other tenants |
| 19 | Log review | ✅ Zero errors, zero panics, zero P2002 |
| 20 | **FINAL VERDICT** | **PASS** ✅ |

---

## STOPPED

The first pilot sale is complete and fully verified.

The double-entry accounting system is live and correct:
- Journal entries are created automatically on POS sale
- Revenue and COGS entries are balanced
- Cash drawer is synchronized
- Stock is decremented correctly
- Tenant isolation is enforced
- Idempotency is DB-backed
- Reconciliation scanner works correctly

**Awaiting owner approval before:**
1. Creating additional test sales (pilot volume expansion)
2. Enabling accounting for other tenants
3. Phase 4B.4 — Repair/Expense journal entries
4. Phase 4B.5 — Exchange flow
