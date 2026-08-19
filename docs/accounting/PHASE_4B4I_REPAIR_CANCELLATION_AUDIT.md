# Phase 4B.4I — Repair Cancellation Accounting Audit

**Date:** 2026-08-19 UTC  
**Type:** READ-ONLY AUDIT — no code changed, no data changed, no migrations  
**Pilot tenant:** `cmsc05do8001u7i29q3p5x6zp`  
**Production baseline (unchanged):** JE=39, JL=78  

---

## 1. Current Cancellation Flow

### Endpoint

```
PATCH /repairs/:id
Body: { "status": "CANCELLED" }
Permission: repair.edit
Guard: JwtAuthGuard → TenantActiveGuard → ModuleGuard → PermissionGuard
```

**No dedicated cancel endpoint exists.** Cancellation is a status transition via the generic `PATCH` handler.

### Controller → Service

```
RepairsController.update(id, dto, actorId, actorName, tenantId)
  → RepairsService.update(id, dto, actorId, actorName, tenantId)
```

File: [repairs.controller.ts:169](backend/src/repairs/repairs.controller.ts#L169)  
File: [repairs.service.ts:408](backend/src/repairs/repairs.service.ts#L408)

### Status Transition Guard

The `update` method has an explicit ALLOWED-transitions map ([repairs.service.ts:353](backend/src/repairs/repairs.service.ts#L353)):

```typescript
if (dto.status !== undefined && dto.status !== repair.status && dto.status !== 'CANCELLED') {
  const ALLOWED = { ... };
  const allowed = ALLOWED[repair.status] ?? [];
  if (!allowed.includes(dto.status)) { throw BadRequestException; }
}
```

**Critical:** The guard condition includes `dto.status !== 'CANCELLED'`. When cancelling, the ALLOWED map is **entirely bypassed**. This means:
- ANY status → CANCELLED is permitted via PATCH
- Including DELIVERED → CANCELLED (no guard, no reversal)

### Transaction Boundary (Cancellation Block)

```typescript
// repairs.service.ts lines 408–448
if (dto.status === 'CANCELLED') {
  return this.prisma.$transaction(async (tx) => {
    // 1. Find all active RepairParts (isVoided: false)
    // 2. For each active part:
    //    a. repairPart.update({ isVoided: true, voidedAt: now })
    //    b. branchStock.upsert({ increment(quantity) })        ← stock returned
    //    c. stockMovement.create({ type: 'REPAIR_RETURN' })    ← audit trail
    //    d. syncShadowStock(productId)                         ← sync Product.stock
    // 3. repair.update({ status: 'CANCELLED' })
    // 4. auditLog.logWithTx(REPAIR_CANCELLED)
    return updated;  // ← EARLY RETURN — no post-commit calls follow
  });
}
```

**The function returns immediately at line 448.** Nothing runs after the transaction.

### What the Cancellation Block Does NOT Do

| Action | Status |
|---|---|
| Reverse deposit CDT | ❌ NOT DONE |
| Create REVERSAL-type CDT | ❌ NOT DONE |
| Call `repairAccounting.*` | ❌ NOT DONE |
| Reverse REPAIR_DEPOSIT journal | ❌ NOT DONE |
| Clear `Repair.deposit` field | ❌ NOT DONE |
| Reset `Repair.paymentStatus` | ❌ NOT DONE |
| Reverse final payment CDT | ❌ NOT DONE |
| Reverse REPAIR_FINAL_PAYMENT journal | ❌ NOT DONE |
| Reverse REPAIR_COGS journal | ❌ NOT DONE |

### Repair Status and Payment Fields After Cancellation

| Field | Value after cancel | Notes |
|---|---|---|
| `Repair.status` | `CANCELLED` | Set correctly |
| `Repair.paymentStatus` | **unchanged** | Stays PENDING or PAID |
| `Repair.deposit` | **unchanged** | Keeps original deposit amount |
| `Repair.paidAmount` | **unchanged** | Null or original paidAmount |
| `Repair.paymentMethod` | **unchanged** | Null or original method |

---

## 2. Deposit Behavior

### At Create Time (deposit > 0)

**Inside `$transaction` in `RepairsService.create()`** ([repairs.service.ts:191](backend/src/repairs/repairs.service.ts#L191)):

```typescript
if ((dto.deposit ?? 0) > 0) {
  await this.accounting.record({
    sourceType:    ACCOUNTING_SOURCE.REPAIR_DEPOSIT,
    sourceId:      newRepair.id,
    paymentMethod: dto.depositPaymentMethod ?? 'CASH',
    amount:        dto.deposit,
    direction:     'IN',
    branchId, tenantId, actorUserId,
  }, tx);
}
```

This creates a `CashDrawerTransaction`:
- `type`: DEPOSIT
- `direction`: IN
- `sourceType`: `REPAIR_DEPOSIT`
- `referenceId`: `Repair.id`
- `idempotencyKey`: `${tenantId}:REPAIR_DEPOSIT:${repairId}:IN`
- `sessionId`: linked to open shift session if CASH and session exists; NULL otherwise

**Post-commit** ([repairs.service.ts:208](backend/src/repairs/repairs.service.ts#L208)):

```typescript
await this.repairAccounting.recordDepositJournal(repair, depositPaymentMethod, tenantId, actorId);
```

This creates a `JournalEntry`:
- `sourceType`: `REPAIR_DEPOSIT`
- `sourceId`: `Repair.id`
- DR 1100 (Cash on Hand) or DR 1120 (Clearing) based on payment method
- CR 2110 (Customer Deposit liability)
- Amount: `Repair.deposit`

### At Cancellation Time

**Neither the CDT nor the journal is reversed.** The cancellation block returns at line 448 before any accounting call. There are no post-commit adapter calls for the cancelled case.

### Deposit Field State After Cancellation

```
Repair.deposit       = 200       ← still shows the original deposit amount
Repair.paymentStatus = PENDING   ← never updated to reflect cancellation
CDT (REPAIR_DEPOSIT) = +200 IN   ← still positive in drawer ledger
JournalEntry         = DR 1100 / CR 2110 ฿200 ← unreversed
```

---

## 3. Cash Drawer Behavior

### Deposit CDT (created at `create()`)

- Written inside `$transaction` with `accounting.record()`
- CASH: linked to open session → drawer balance increased by deposit amount
- Non-CASH: written as unassigned (sessionId=null)

### On Cancellation

**No CDT reversal is created.** The cancellation block calls none of:
- `this.accounting.record({ direction: 'OUT' })` 
- `this.accounting.record({ type: 'REVERSAL' })`

### Cash Drawer Gap

If a deposit refund was given to the customer (physically, outside the system):
- The drawer balance does NOT decrease (no OUT entry)
- The reconciliation report cannot detect this discrepancy
- The CDT remains showing a +deposit even though the cash has left the drawer

---

## 4. Payment Behavior

### `Repair.paymentStatus` Lifecycle

| Event | paymentStatus |
|---|---|
| Repair created | PENDING (default) |
| Deposit collected | PENDING (unchanged — deposit does not set PAID) |
| `processPayment()` called | PAID (set atomically in `$transaction`) |
| `reversePayment()` called | PENDING (reset to PENDING) |
| **CANCELLED (any status)** | **unchanged — NOT reset** |

### Key Finding: DELIVERED → CANCELLED

If a repair was DELIVERED (full payment received) and then CANCELLED via PATCH:
- `paymentStatus` remains `PAID`
- All journals remain (REPAIR_DEPOSIT, REPAIR_FINAL_PAYMENT, REPAIR_DEPOSIT_SETTLE, REPAIR_COGS)
- All CDTs remain (deposit CDT + final payment CDT)
- Parts are voided (stock returned via REPAIR_RETURN)
- The system shows `status=CANCELLED, paymentStatus=PAID` simultaneously — an inconsistent state

**The correct path for a paid repair is:** `reversePayment` first (which reverses FINAL_PAYMENT + DEPOSIT_SETTLE journals and resets to COMPLETED), then CANCELLED. But the code does not enforce this sequence.

---

## 5. Stock Behavior

### On Cancellation (C-1 FIX — verified)

The C-1 fix ([repairs.service.ts:406](backend/src/repairs/repairs.service.ts#L406)) correctly handles stock:

```
For each active RepairPart (isVoided: false):
  1. repairPart.isVoided = true
  2. branchStock.quantity += part.quantity    (stock returned)
  3. StockMovement.create(REPAIR_RETURN)
  4. syncShadowStock(productId)
```

Stock return is **correct and complete** in all cancellation scenarios.

### REPAIR_COGS Journal vs. Stock Return

| Scenario | Stock returned | REPAIR_COGS journal | Gap |
|---|---|---|---|
| Cancel before DELIVERED | ✅ via REPAIR_RETURN | ❌ never created | No gap — COGS only created at delivery |
| Cancel after DELIVERED | ✅ via REPAIR_RETURN | ✅ exists unreversed | **GAP — COGS DR 5200 / CR 1310 unreversed** |

The `REPAIR_COGS` journal is created by `recordFinalPaymentJournal()`, which is called after `processPayment()`. If the repair is cancelled before delivery, no COGS journal exists. If cancelled after delivery, the journal exists but is not reversed.

---

## 6. Existing Accounting Gap — All Scenarios

### A. Cancelled Before Deposit (`deposit = 0`)

| Item | State |
|---|---|
| CDT | None created |
| REPAIR_DEPOSIT journal | None created |
| Accounting gap | **NONE** |

✅ Clean — no money changed hands.

### B. Cancelled After CASH Deposit

| Item | State after cancel |
|---|---|
| CDT | DEPOSIT +฿200 IN (CASH) — unreversed |
| REPAIR_DEPOSIT journal | DR 1100 ฿200 / CR 2110 ฿200 — unreversed |
| Repair.deposit | ฿200 (unchanged) |
| Repair.paymentStatus | PENDING (unchanged) |
| Balance sheet impact | CR 2110 (Customer Deposit) overstated by ฿200 |
| Cash drawer impact | Drawer shows +฿200 that may have been refunded |
| **Accounting gap** | **CONFIRMED GAP** |

### C. Cancelled After TRANSFER/CARD Deposit

| Item | State after cancel |
|---|---|
| CDT | DEPOSIT +฿200 IN (unassigned) — unreversed |
| REPAIR_DEPOSIT journal | DR 1120 ฿200 / CR 2110 ฿200 — unreversed |
| Accounting gap | **CONFIRMED GAP** (Clearing account + liability unreversed) |

### D. Cancelled After Partial Payment (= deposit only, repair not completed)

Same as scenario B or C. In the current system, the only pre-delivery payment is the deposit. There is no "partial final payment" mechanism.

### E. Cancelled After DELIVERED (Full Payment)

| Item | State after cancel |
|---|---|
| REPAIR_DEPOSIT journal | DR 1100 / CR 2110 — unreversed |
| REPAIR_FINAL_PAYMENT journal | DR 1100 / CR 4200 — unreversed |
| REPAIR_DEPOSIT_SETTLE journal | DR 2110 / CR 4200 — unreversed |
| REPAIR_COGS journal | DR 5200 / CR 1310 (per part) — unreversed |
| Deposit CDT | +deposit, unreversed |
| Final payment CDT | +paidAmount, unreversed |
| Repair.paymentStatus | PAID (inconsistent with CANCELLED) |
| Parts | Voided, stock returned ✅ |
| Revenue recognized | ✅ exists but unreversed |
| **Accounting gap** | **CRITICAL — revenue + cash + COGS all unreversed** |

### F. Cancelled After Parts Consumed (In Progress, Not Delivered)

| Item | State after cancel |
|---|---|
| REPAIR_COGS journal | Does not exist — COGS created only at delivery |
| Stock | Returned correctly via REPAIR_RETURN ✅ |
| Deposit journal | Unreversed (if deposit > 0) — same gap as B |
| **Accounting gap** | Same as B/C for deposit; **no COGS gap** |

### G. Cancellation + Refund

No refund mechanism exists in the current code. The system has no `cancelAndRefund` flow. Any refund given to the customer is done outside the system. The accounting gap is identical to B/C.

---

## 7. Reconciliation Behavior (Current)

The reconciliation service correctly flags cancelled repairs with unreversed deposits:

```
classifyRepair(repair):
  if deposit > 0 → expects REPAIR_DEPOSIT journal
  if repair is CANCELLED → REPAIR_DEPOSIT exists but:
    - REPAIR_FINAL_PAYMENT expected? No (not DELIVERED)
    - REPAIR_DEPOSIT_SETTLE expected? No (not DELIVERED)
    → status = POSTED (deposit exists and is correct — the gap is the ABSENCE of a reversal)
```

**Important:** The reconciliation currently classifies a cancelled repair with a posted REPAIR_DEPOSIT as **POSTED** — because the deposit journal IS present and correct. The gap (missing reversal) is not currently flagged as MISSING because the reconciliation does not know whether a deposit reversal should exist (that depends on business policy: refund vs. retain).

This means the cancellation gap is **invisible to the current reconciliation**. Adding it would require knowing the business policy first.

---

## 8. Possible Accounting Options

The following options are based **strictly on actual business behavior found in the code**. No option is approved for implementation.

### Option 1 — Deposit Refunded to Customer

**Business behavior:** Shop returns deposit to customer on cancellation.

**Required journals:**

```
DR 2110  Customer Deposit   ฿200    (close the liability)
CR 1100  Cash on Hand       ฿200    (cash leaves the drawer)
```

- `sourceType`: `REPAIR_DEPOSIT_REVERSAL` (new constant needed)
- `sourceId`: `Repair.id`

**CashDrawer impact:**
- New REVERSAL-type CDT: direction=OUT, amount=deposit
- Must reference original REPAIR_DEPOSIT CDT via `reversalOfId`
- Requires open shift session (CASH refund requires active drawer)

**Reconciliation expectation:**
- After implementation: REPAIR_DEPOSIT + REPAIR_DEPOSIT_REVERSAL both POSTED = OK
- Currently: REPAIR_DEPOSIT POSTED, no reversal expected → POSTED (gap invisible)

**Risk:**
- Requires open shift to create REVERSAL CDT
- If shop gives refund but shift is closed, CDT cannot be created atomically
- Needs new `REPAIR_DEPOSIT_REVERSAL` source constant in `ACCOUNTING_SOURCE` and `JOURNAL_SOURCE`
- Reconciliation must be updated to expect reversal for cancelled repairs with deposit

### Option 2 — Deposit Retained (Cancellation Fee)

**Business behavior:** Shop keeps the deposit as a penalty or cancellation fee.

**Required journals:**

```
DR 2110  Customer Deposit   ฿200    (close the liability — customer forfeits deposit)
CR 4300  Other Income       ฿200    (or existing income account — revenue recognized)
```

- `sourceType`: `REPAIR_DEPOSIT_FORFEITURE` (new constant needed)
- No CDT reversal needed (cash stays in drawer — correct)

**CashDrawer impact:**
- No change needed — REPAIR_DEPOSIT CDT remains as correct IN entry

**Reconciliation expectation:**
- After implementation: REPAIR_DEPOSIT + REPAIR_DEPOSIT_FORFEITURE both POSTED = OK

**Risk:**
- Requires a clear income account for forfeited deposits
- May need to be recorded at cancellation time, not deferred
- Simplest to implement — no cash drawer complication

### Option 3 — Case-by-Case (Operator Choice at Cancellation)

**Business behavior:** Operator decides at cancel time whether to refund or retain.

**UX implication:** Cancellation request would need a DTO field: `depositTreatment: 'REFUND' | 'RETAIN'`

**Risk:**
- Most complex UX
- Requires changes to `UpdateRepairDto`, controller, service, and adapter
- Adds decision surface where errors are possible

### Option 4 — Do Nothing (Defer to Manual Correction)

**Business behavior:** No accounting is done at cancellation. The owner manually creates correcting journal entries via a future admin tool.

**Risk:**
- Reconciliation cannot flag these automatically
- Balance sheet overstated until manually corrected
- Acceptable only as a short-term gap with manual oversight

---

## 9. Recommended Option

**This cannot be determined by the code alone. It is an owner decision.**

The code audit reveals:
1. The deposit CDT and REPAIR_DEPOSIT journal are never reversed on cancellation
2. No refund mechanism exists in the cancellation flow
3. No "retain as fee" journal is created
4. The gap is currently invisible to reconciliation

**Questions the owner must answer:**
- When a repair is cancelled after a deposit: do you refund the deposit?
- Is the policy always refund, always retain, or case-by-case?
- If retain: is it full retention or partial?
- What account should forfeited deposits be recognized in?

Once the policy is decided, the correct implementation option follows naturally.

---

## 10. Required Changes for Future Implementation

The following changes would be needed regardless of which Option is chosen. Listed for planning only — NOT approved.

### Option 1 (Refund) requires:

1. `ACCOUNTING_SOURCE.REPAIR_DEPOSIT_REVERSAL` constant in `accounting.service.ts`
2. `JOURNAL_SOURCE.REPAIR_DEPOSIT_REVERSAL` constant in `journal.service.ts`  
3. `RepairAccountingAdapter.reverseDepositJournal()` method
   - DR 2110 / CR 1100 (CASH) or DR 2110 / CR 1120 (non-CASH)
   - sourceType: REPAIR_DEPOSIT_REVERSAL, sourceId: Repair.id
4. `RepairsService.update()` — add post-commit call after cancellation `$transaction`:
   ```typescript
   if (dto.status === 'CANCELLED' && tenantId) {
     await this.repairAccounting.reverseDepositJournal(repair, tenantId, actorId);
   }
   ```
5. `accounting.service.ts` — add REVERSAL CDT call in cancellation
6. Reconciliation: update `classifyRepair` to expect REPAIR_DEPOSIT_REVERSAL for cancelled repairs with deposit

### Option 2 (Retain) requires:

1. `JOURNAL_SOURCE.REPAIR_DEPOSIT_FORFEITURE` constant
2. `RepairAccountingAdapter.forfeitDepositJournal()` method
   - DR 2110 / CR 4300 (Other Income)
   - sourceType: REPAIR_DEPOSIT_FORFEITURE, sourceId: Repair.id
3. `RepairsService.update()` — same post-commit call
4. Reconciliation: update `classifyRepair` to expect REPAIR_DEPOSIT_FORFEITURE for cancelled repairs

### Common to all options:

- `DELIVERED → CANCELLED` guard: should require `reversePayment` first if `paymentStatus === 'PAID'`
- `Repair.paymentStatus` should be reset to `PENDING` on cancellation
- Reconciliation: `classifyRepair` needs to detect the "CANCELLED with deposit but no reversal/forfeiture" case as `MISSING`

---

## Final Report

| Item | Status |
|---|---|
| **Current behavior** | **GAP** — Deposit CDT and REPAIR_DEPOSIT journal not reversed on cancellation |
| **Deposit handling** | **UNKNOWN** — no policy encoded in code; money retained by default (no refund) |
| **CashDrawer handling** | **GAP** — no REVERSAL CDT created on cancellation |
| **Accounting** | **GAP** — CR 2110 (Customer Deposit) unreversed; DELIVERED cancellations also leave revenue/COGS unreversed |
| **Production data changes** | **0** |
| **JournalEntry created** | **0** |
| **JournalLine created** | **0** |
| **Migration** | **NONE** |
| **Deployment** | **NONE** |

---

**STOP — Audit complete. Do NOT implement cancellation accounting. Do NOT modify CashDrawer. Do NOT modify RepairsService. Do NOT create production transactions. Await owner approval on deposit policy (refund / retain / case-by-case) before any implementation.**
