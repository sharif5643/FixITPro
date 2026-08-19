# Phase 4B.4H — Repair COGS + Debt Payment Pilot

**Date:** 2026-08-18 UTC  
**Pilot tenant:** `cmsc05do8001u7i29q3p5x6zp` (ริวคอม เซอร์วิซ)  
**Branch:** `cmsc05doa001w7i299y1cr8vf` (สาขาหลัก)  
**Deployed commit:** `8a77f6f` (Phase 4B.4G reconciliation — no code changes this phase)  
**Verdict:** ✅ PASS — REPAIR_COGS journal created correctly; debt payment NOT EXECUTED (no outstanding balance)

---

## A. Pre-Deploy Backup

| Field | Value |
|---|---|
| Filename | `/opt/fixitpro-backups/db/fixitpro_pre4B4H_20260818_185953.sql.gz` |
| SHA-256 | `7bd77a60c31c5874e4c81601d27ab90dbe490eec7ff3148dd338ea9eef86528f` |
| Taken at | 2026-08-18T18:59:53Z |

---

## B. Deployed Commit

Running commit: **`8a77f6f`** (feat: extend reconciliation with Repair + Expense scan — Phase 4B.4G)  
No code changes deployed in Phase 4B.4H — this is a live pilot test on the existing deployment.

---

## C. Pre-Flight Verification

### Backend Health
```
{"status":"ok","db":"ok","redis":"ok","timestamp":"2026-08-18T19:26:46.167Z"}
```
- `status: ok` ✅
- `db: ok` ✅
- `redis: ok` ✅

### Accounting Environment
```
ACCOUNTING_CORE_ENABLED=true
ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp
ACCOUNTING_ACTIVATION_TIMESTAMP=2026-08-18T04:17:00Z
```
All unchanged ✅. Activation timestamp age at test time: ~15.2h (within 24h window).

### Pre-Flight Baseline

| Table | Count |
|---|---|
| JournalEntry | 35 ✅ (matches expected) |
| JournalLine | 70 ✅ (matches expected) |
| Repair | 24 |
| RepairPart | 19 |
| RepairAdditionalPayment | 1 |
| CashDrawerTransaction | 135 |
| StockMovement | 286 |

---

## D. Repair Details

### Part Selected for COGS Test

| Field | Value |
|---|---|
| Product.id | `cmsebbvd0001n3r43fnmkyi5g` |
| Product name | Maimi M to USB |
| SKU | ACC-000021 |
| Historical costPrice | ฿100.00 |
| Selling price | ฿190.00 |
| Stock before | 25 units |
| Stock after part added | 24 units |

**Rationale:** Clear costPrice (฿100), adequate stock (25 units), standard accessory product.

### Repair Created

| Field | Value |
|---|---|
| Repair.id | `cmsz2567y00073156grazsexg` |
| Ticket | `REP-20260818-9E5EFE` |
| Device | Samsung Galaxy S24 Ultra |
| Issue | ทดสอบ REPAIR_COGS 4B.4H - อุปกรณ์ชาร์จเสีย |
| Customer | ลูกค้าทดสอบ 4B4H (phone: 0800000002) |
| Deposit | ฿200 CASH |
| Estimate | ฿500 |
| Final cost | ฿500 |
| Status path | RECEIVED → DIAGNOSING → IN_PROGRESS → COMPLETED → DELIVERED |

### Repair Part Added

| Field | Value |
|---|---|
| RepairPart.id | `cmsz25kzz000j3156znyiv9uh` |
| productId | `cmsebbvd0001n3r43fnmkyi5g` |
| quantity | 1 |
| costPrice (snapshot) | ฿100.00 |
| isVoided | false |

Part added at `DIAGNOSING` status. Stock deducted immediately at add time (atomic).

---

## E. COGS Journal Verification

### All Journals for This Repair

| JE.id | sourceType | sourceId | Debit | Credit | Balanced |
|---|---|---|---|---|---|
| `cmsz2568t000b3156ek3vwvr0` | REPAIR_DEPOSIT | `cmsz2567y00073156grazsexg` | ฿200.00 | ฿200.00 | ✅ |
| `cmsz265h8000v3156ao38p8ei` | REPAIR_FINAL_PAYMENT | `cmsz2567y00073156grazsexg` | ฿300.00 | ฿300.00 | ✅ |
| `cmsz265hn001031569xo61vs4` | REPAIR_DEPOSIT_SETTLE | `cmsz2567y00073156grazsexg` | ฿200.00 | ฿200.00 | ✅ |
| `cmsz265hy001531561sn2d8g4` | REPAIR_COGS | `cmsz25kzz000j3156znyiv9uh` | ฿100.00 | ฿100.00 | ✅ |

### REPAIR_COGS Journal Detail

| Account | Code | Debit | Credit |
|---|---|---|---|
| Repair Parts Cost | **5200** | **฿100.00** | — |
| Repair Parts Inventory | **1310** | — | **฿100.00** |

- **sourceType:** `REPAIR_COGS` ✅
- **sourceId:** `cmsz25kzz000j3156znyiv9uh` (RepairPart.id) ✅
- **Amount:** ฿100 = costPrice (฿100) × quantity (1) ✅
- **Balanced:** DR ฿100 = CR ฿100 ✅
- **tenantId:** `cmsc05do8001u7i29q3p5x6zp` ✅
- **isVoided:** false ✅
- **Duplicate check:** exactly 1 REPAIR_COGS journal for this part ✅

### Full Repair Journal Summary

| Account | Code | Role | Total DR | Total CR |
|---|---|---|---|---|
| Cash on Hand | 1100 | Asset | ฿500.00 | — |
| Customer Deposit | 2110 | Liability | ฿200.00 | ฿200.00 |
| Repair Parts Inventory | 1310 | Asset | — | ฿100.00 |
| Repair Revenue | 4200 | Revenue | — | ฿500.00 |
| Repair Parts Cost | 5200 | COGS | ฿100.00 | — |

**Revenue recognized:** ฿300 (REPAIR_FINAL_PAYMENT) + ฿200 (REPAIR_DEPOSIT_SETTLE) = **฿500** = finalCost ✅  
**Cash collected:** ฿200 (deposit) + ฿300 (final payment) = **฿500** ✅  
**COGS:** ฿100 = costPrice × qty ✅  
**Gross profit (from repair):** ฿500 revenue − ฿100 COGS = **฿400** ✅

---

## F. Stock Movement

| Type | productId | quantity | repairPartId | branchId |
|---|---|---|---|---|
| REPAIR_USE | `cmsebbvd0001n3r43fnmkyi5g` | 1 | `cmsz25kzz000j3156znyiv9uh` | `cmsc05doa001w7i299y1cr8vf` |

- Exactly 1 REPAIR_USE movement ✅
- Stock before: 25 → after: 24 (−1) ✅
- No duplicate stock movement ✅

---

## G. Reconciliation

**Run at:** 2026-08-18T19:33:32.321Z  
**Endpoint:** `POST /api/v1/admin/accounting/run-reconciliation`  
**Tenant:** `cmsc05do8001u7i29q3p5x6zp` only

### Summary
```json
{
  "scanned": 11,
  "posted": 11,
  "missing": 0,
  "recovered": 0,
  "errors": 0,
  "notApplicable": 0
}
```

### Repair Items
| repairId | Ticket | Status |
|---|---|---|
| `cmsyyg3i80007tj5af0k5xohi` | REP-20260818-EC2331 (Phase 4B.4F pilot) | POSTED ✅ |
| `cmsz2567y00073156grazsexg` | **REP-20260818-9E5EFE (Phase 4B.4H pilot)** | **POSTED ✅** |

REPAIR_COGS detected as POSTED — amount matches, sourceId correct ✅

### POS Sales
8 sales — all POSTED ✅ (unchanged from prior phases)

### Expense Items
1 expense — POSTED ✅ (unchanged from prior phases)

---

## H. Debt Payment

**NOT EXECUTED** — No legitimate outstanding balance.

| Component | Amount |
|---|---|
| finalCost | ฿500 |
| deposit collected | ฿200 |
| final payment collected | ฿300 |
| Total collected | ฿500 |
| Outstanding balance | **฿0** |

The repair was paid in full in a single `processPayment` call. `paymentStatus = PAID`. No `RepairAdditionalPayment` record was created. No debt payment manufactured.

---

## I. CashDrawer Verification

| Event | Amount | CDT created |
|---|---|---|
| Repair creation (deposit) | ฿200 CASH | +1 CDT ✅ |
| Final payment | ฿300 CASH | +1 CDT ✅ |

CashDrawerTransaction count: 135 → **137** (+2) ✅  
No duplicate CDT. All linked to active shift `cmsy0fhln00ccwkpi679me4gd`.

---

## J. Tenant Isolation

```
Distinct tenants with JE: 1
Tenant: cmsc05do8001u7i29q3p5x6zp only
Other tenants: 0 JE, 0 JL
```

All 39 JournalEntry records belong exclusively to the pilot tenant ✅

---

## K. Idempotency

Reconciliation was run once after the repair was delivered. JE=39, JL=78 confirmed unchanged after scan — reconciliation for repairs/expenses is read-only (no auto-recovery). ✅

No duplicate JournalEntry for any sourceType/sourceId combination.

---

## L. Before / After Counts

| Table | Before | After | Delta | Explanation |
|---|---|---|---|---|
| JournalEntry | 35 | 39 | +4 | REPAIR_DEPOSIT + REPAIR_FINAL_PAYMENT + REPAIR_DEPOSIT_SETTLE + REPAIR_COGS |
| JournalLine | 70 | 78 | +8 | 2 lines per JE × 4 JE |
| Repair | 24 | 25 | +1 | 1 new repair created |
| RepairPart | 19 | 20 | +1 | 1 part added (Maimi M to USB) |
| RepairAdditionalPayment | 1 | 1 | 0 | No debt payment — fully paid |
| CashDrawerTransaction | 135 | 137 | +2 | 1 deposit CDT + 1 final payment CDT |
| StockMovement | 286 | 287 | +1 | REPAIR_USE for Maimi M to USB ×1 |

All deltas explained. No unexpected changes ✅

---

## M. Known Cancellation Gap

Repair cancellation is **not tested or modified** in this phase. If a repair with a deposit were CANCELLED:
- No REPAIR_PAYMENT_REVERSAL journal would be created
- No REPAIR_DEPOSIT_SETTLE_REVERSAL journal would be created
- The ฿ liability in account 2110 (Customer Deposit) would remain unreversed
- The reconciliation would classify such a repair as MISSING (correctly flagging the gap)

**This gap requires a separate owner decision on refund policy. Do NOT fix silently.**

---

## Verdict

| Test | Result |
|---|---|
| Pre-flight checks | ✅ PASS |
| REPAIR_DEPOSIT | ✅ PASS — DR 1100 ฿200 / CR 2110 ฿200 |
| REPAIR_FINAL_PAYMENT | ✅ PASS — DR 1100 ฿300 / CR 4200 ฿300 |
| REPAIR_DEPOSIT_SETTLE | ✅ PASS — DR 2110 ฿200 / CR 4200 ฿200 |
| **REPAIR_COGS** | ✅ **PASS — DR 5200 ฿100 / CR 1310 ฿100** |
| Stock deduction | ✅ PASS — 25→24, REPAIR_USE movement |
| Reconciliation (COGS POSTED) | ✅ PASS |
| Debt payment | NOT EXECUTED — no outstanding balance |
| Idempotency | ✅ PASS — 0 duplicate journals after re-scan |
| Tenant isolation | ✅ PASS — pilot tenant only |
| Row count deltas | ✅ PASS — all explained |

**Overall: PASS**

---

**STOP — Do NOT create another Repair. Do NOT create another Expense. Do NOT enable another tenant. Do NOT fix cancellation. Do NOT implement Exchange. Do NOT modify production configuration. Await owner approval.**
