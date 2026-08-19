# PHASE 4B.4L — PAID / DELIVERED Repair Cancellation: Audit & Design

**Date:** 2026-08-19
**Phase:** 4B.4L — READ-ONLY Audit + Design (COMPLETE)
**Author:** FixITPro Owner
**Scope:** Code audit, accounting design, adapter primitives + unit tests. NO new endpoint, NO RepairsService wiring, NO production deployment.

---

## 1. Objective

Trace the full lifecycle of a repair that has received final payment (status=DELIVERED), map every journal entry and CDT that would need to be reversed on cancellation, and design the complete accounting treatment for a future "Refund & Cancel" workflow.

---

## 2. Pre-flight State (inherited from 4B.4K)

| Item | Value |
|------|-------|
| Production JE (pilot tenant) | 45 |
| Production JL (total) | 90 |
| Production CDT (pilot tenant) | 92 |
| ACCOUNTING_ACTIVATION_TIMESTAMP | 2026-08-18T04:17:00Z (EXPIRED — do NOT refresh in 4B.4L) |
| Commit running | `8f16d7b` |

No production records were created or modified in this phase.

---

## 3. Code Audit: Repair Lifecycle to DELIVERED

### 3.1 processPayment() — the only path to DELIVERED

`RepairsService.processPayment()` (repairs.service.ts:801):

**Pre-conditions checked:**
- Active shift required
- Repair must be COMPLETED or READY_PICKUP
- `repair.paymentStatus !== 'PAID'` (throws if already paid)
- `dto.amountPaid >= balance` (balance = total − deposit)

**Atomic $transaction:**
```
repair.updateMany (WHERE paymentStatus != PAID):
  paymentStatus = 'PAID'
  paymentMethod = dto.paymentMethod
  paidAmount    = dto.amountPaid
  status        = 'DELIVERED'
  deliveredAt   = now()
  finalCost     = total
  paymentShiftId= activeShift.id

accounting.record(REPAIR_FINAL_PAYMENT, direction=IN, amount=dto.amountPaid)
  → CDT IN (CASH or CLEARING depending on paymentMethod)
```

**Post-commit (no-throw):**
```
repairAccounting.recordFinalPaymentJournal(paid, tenantId, userId):
  JE1: REPAIR_FINAL_PAYMENT  → DR 1100/1120 ฿Y / CR 4200 ฿Y
  JE2: REPAIR_DEPOSIT_SETTLE → DR 2110      ฿X / CR 4200 ฿X  (only if REPAIR_DEPOSIT JE exists)
  JE3..N: REPAIR_COGS        → DR 5200 ฿Z  / CR 1310 ฿Z  (one per active part, sourceId=part.id)
```

**Other post-commit side-effects:**
- LINE notification (non-critical, fire-and-forget)
- `warranties.createForRepair()` (non-critical)

### 3.2 reversePayment() — payment reversal path

`RepairsService.reversePayment()` (repairs.service.ts:921):

**Pre-conditions:**
- `repair.status === 'DELIVERED'` (throws if not)
- `repair.paymentStatus === 'PAID'` (throws if not)

**Atomic $transaction:**
```
RepairPaymentReversal.create(...)

repair.update:
  paymentStatus = 'PENDING'
  paymentMethod = null
  paidAmount    = null
  paidAt        = null
  paymentShiftId= null
  status        = 'COMPLETED'
  deliveredAt   = null

accounting.record(REVERSAL, direction=OUT, amount=repair.paidAmount)
  → CDT OUT (CASH or CLEARING — returns the final payment cash)
```

**Post-commit (no-throw):**
```
repairAccounting.reversePaymentJournal(reversed, tenantId, userId):
  JE: REPAIR_PAYMENT_REVERSAL        → DR 4200 ฿Y / CR 1100/1120 ฿Y  (swaps REPAIR_FINAL_PAYMENT lines)
  JE: REPAIR_DEPOSIT_SETTLE_REVERSAL → DR 4200 ฿X / CR 2110      ฿X  (swaps REPAIR_DEPOSIT_SETTLE lines, if posted)
  NOTE: REPAIR_COGS journals are NOT reversed by reversePayment().
```

After reversePayment():
- Repair is back to status=COMPLETED, paymentStatus=PENDING
- Net position of 2110: still has ฿X credit (deposit liability re-opened by settle reversal)
- Net position of 4200: ฿0 (revenue zeroed by both reversals)
- Net position of 1100/1120: ฿0 for the final payment (CDT OUT returned cash)
- REPAIR_COGS journals remain — **this is the gap identified in 4B.4L**

### 3.3 addAdditionalPayment() — additional payment path

`RepairsService.addAdditionalPayment()` (repairs.service.ts:1013):

**Pre-conditions:** `repair.status in ['COMPLETED', 'DELIVERED']`

**Atomic $transaction:**
```
RepairAdditionalPayment.create(...)
accounting.record(REPAIR_ADDITIONAL_PAYMENT, direction=IN, amount=dto.amount)
  → CDT IN
```

**Post-commit:**
```
repairAccounting.recordAdditionalPaymentJournal(payment, repair, tenantId, userId):
  JE: REPAIR_ADDITIONAL_PAYMENT → DR 1100/1120 ฿A / CR 1200 ฿A  (sourceId=payment.id)
```

### 3.4 DELIVERED guard — existing block

`RepairsService.update()` line 327-331:
```typescript
if (repair.status === 'DELIVERED' && dto.status !== undefined) {
  throw new BadRequestException(
    'ไม่สามารถเปลี่ยนสถานะงานซ่อมที่ส่งมอบแล้ว — การชำระเงินถูกบันทึกเรียบร้อยแล้ว',
  );
}
```
**DELIVERED → CANCELLED via the regular update() path is BLOCKED.** This is the correct behavior that must be preserved.

---

## 4. Cancellation Scenarios

| # | Scenario | Current Status |
|---|----------|---------------|
| A | Cancel before payment (deposit only) | **HANDLED** — Phase 4B.4K |
| B | Cancel after reversePayment (COMPLETED, deposit still open) | **HANDLED** — Phase 4B.4K picks up the deposit refund |
| C | Cancel DELIVERED directly (no prior reversePayment) | **BLOCKED** — new "Refund & Cancel" endpoint needed |
| D | Cancel DELIVERED with additional payments | **BLOCKED** — same, plus additional payment reversals needed |

**Scenario B detail (COMPLETED after reversePayment → CANCELLED):**

After reversePayment, the repair has:
- REPAIR_DEPOSIT: DR 1100/1120 ฿X / CR 2110 ฿X (original, intact)
- REPAIR_FINAL_PAYMENT: DR 1100/1120 ฿Y / CR 4200 ฿Y (original, intact)
- REPAIR_DEPOSIT_SETTLE: DR 2110 ฿X / CR 4200 ฿X (original, intact)
- REPAIR_PAYMENT_REVERSAL: DR 4200 ฿Y / CR 1100/1120 ฿Y (posted by reversePayment)
- REPAIR_DEPOSIT_SETTLE_REVERSAL: DR 4200 ฿X / CR 2110 ฿X (posted by reversePayment)
- REPAIR_COGS: DR 5200 ฿Z / CR 1310 ฿Z per part (original, intact — never reversed)

Net: 2110 still has ฿X liability, 4200=0, 1100/1120=0 for final payment.

When this COMPLETED repair is cancelled (via existing update() path):
1. Parts voided + stock returned ✓ (4B.4K)
2. REPAIR_DEPOSIT_REFUND: DR 2110 / CR 1100/1120 ✓ (4B.4K)
3. **REPAIR_COGS_REVERSAL: missing** — this is a remaining gap

The COGS gap exists because reversePayment() does not reverse COGS. Decision deferred to implementation phase.

---

## 5. Case C: DELIVERED Repair Cancellation — Full Accounting Design

### 5.1 Context at time of cancellation request

Assume repair with deposit ฿X, final payment ฿Y (CASH), parts with total COGS ฿Z.

Journals posted before cancellation:
```
REPAIR_DEPOSIT       DR 1100 ฿X / CR 2110 ฿X
REPAIR_FINAL_PAYMENT DR 1100 ฿Y / CR 4200 ฿Y
REPAIR_DEPOSIT_SETTLE DR 2110 ฿X / CR 4200 ฿X
REPAIR_COGS (per part) DR 5200 ฿Z / CR 1310 ฿Z
```

CDTs posted:
```
REPAIR_DEPOSIT:        IN,  CASH, ฿X
REPAIR_FINAL_PAYMENT:  IN,  CASH, ฿Y
```

### 5.2 Required accounting on cancellation

| Step | JE / CDT | DR | CR | Amount | sourceType | sourceId |
|------|---------|----|----|--------|------------|----------|
| 1 | JE reversal: final payment | 4200 | 1100/1120 | ฿Y | REPAIR_PAYMENT_REVERSAL | repair.id |
| 2 | JE reversal: deposit settle | 4200 | 2110 | ฿X | REPAIR_DEPOSIT_SETTLE_REVERSAL | repair.id |
| 3 | JE: deposit refund | 2110 | 1100/1120 | ฿X | REPAIR_DEPOSIT_REFUND | repair.id |
| 4 | JE reversal: COGS (per part) | 1310 | 5200 | ฿Z | REPAIR_COGS_REVERSAL | part.id |
| 5 | CDT: final payment refund | OUT | — | ฿Y | REVERSAL / REPAIR_FINAL_PAYMENT_REFUND | repair.id |
| 6 | CDT: deposit refund | OUT | — | ฿X | REPAIR_DEPOSIT_REFUND | repair.id |
| 7 | Stock: return all active parts | — | — | qty | REPAIR_RETURN (StockMovement) | — |
| 8 | Status: repair.status = CANCELLED | — | — | — | — | — |

### 5.3 Net ledger effect after cancellation (Scenario C)

| Account | Opening | After Cancel | Net |
|---------|---------|--------------|-----|
| 1100 CASH | +฿X+฿Y (two CDTs IN) | −฿X−฿Y (two CDTs OUT) | ฿0 |
| 2110 Customer Deposit | +฿X (deposit) −฿X (settle) = 0 | −฿X (refund) + ฿X (settle reversal) = 0 → net 0 | ฿0 |
| 4200 Repair Revenue | −฿Y−฿X (FINAL_PMT + SETTLE) | +฿Y+฿X (reversals) | ฿0 |
| 5200 Repair COGS | +฿Z (COGS) | −฿Z (COGS reversal) | ฿0 |
| 1310 Parts Inventory | −฿Z (COGS) | +฿Z (COGS reversal) | ฿0 |

All accounts net to ฿0 for this repair — correct for a full cancellation.

### 5.4 Case D: with additional payments

Additional CDT: IN ฿A (REPAIR_ADDITIONAL_PAYMENT)
Additional JE: DR 1100/1120 ฿A / CR 1200 ฿A (REPAIR_ADDITIONAL_PAYMENT, sourceId=payment.id)

Additional reversal required:
| Step | JE / CDT | DR | CR | Amount | sourceType | sourceId |
|------|---------|----|----|--------|------------|----------|
| 5a | JE reversal: additional payment | 1200 | 1100/1120 | ฿A | REPAIR_ADDITIONAL_PAYMENT_REVERSAL | payment.id |
| 6a | CDT: additional payment refund | OUT | — | ฿A | (new sourceType TBD) | payment.id |

---

## 6. Status Transition Policy

### Recommendation: Keep existing DELIVERED guard; add explicit "Refund & Cancel" endpoint

**Option A (Blocked — current):** DELIVERED → CANCELLED is blocked. Operator must:
1. Call POST /repairs/:id/reverse-payment → repair → COMPLETED
2. Wait for customer to return device + receive cash back
3. Call PATCH /repairs/:id { status: CANCELLED } → deposit refund runs
- **Gap:** REPAIR_COGS not reversed; CDT for final payment refund already handled by reversePayment

**Option B (New endpoint — recommended):** POST /repairs/:id/refund-and-cancel
- Combines step 1+3 atomically with COGS reversal
- Single operation for operators; complete audit trail
- Requires owner approval before implementation

**Recommended: Option B** — existing DELIVERED guard stays (no accidental direct cancel), new endpoint added for authorized cancellations.

---

## 7. New Constants Added (this phase)

### 7.1 journal.service.ts — JOURNAL_SOURCE

```typescript
REPAIR_COGS_REVERSAL:              'REPAIR_COGS_REVERSAL',
REPAIR_ADDITIONAL_PAYMENT_REVERSAL:'REPAIR_ADDITIONAL_PAYMENT_REVERSAL',
```

### 7.2 ACCOUNTING_SOURCE (future — needs implementation phase)

```typescript
REPAIR_FINAL_PAYMENT_REFUND: 'REPAIR_FINAL_PAYMENT_REFUND',
REPAIR_ADDITIONAL_PAYMENT_REFUND: 'REPAIR_ADDITIONAL_PAYMENT_REFUND',
```
These CDT source types for the new "Refund & Cancel" endpoint are designed but NOT added yet.

---

## 8. New Adapter Methods Added (this phase)

### 8.1 `recordCogsReversalJournal(repair, tenantId, actorId)`

Public no-throw wrapper. Internal: `_recordCogsReversalJournal()`.

For each part in `repair.parts` (including voided — their COGS was posted before voiding):
- `findBySource(REPAIR_COGS, part.id, tenantId)` → if not found, debug-log and skip
- Swap lines: `DR 5200 / CR 1310` → `DR 1310 / CR 5200`
- `journal.create({ sourceType: REPAIR_COGS_REVERSAL, sourceId: part.id })`

Idempotent: `JournalService.create()` returns `{created:false}` on duplicate.

### 8.2 `recordAdditionalPaymentReversalJournal(payment, repair, tenantId, actorId)`

Public no-throw wrapper. Internal: `_recordAdditionalPaymentReversalJournal()`.

- `findBySource(REPAIR_ADDITIONAL_PAYMENT, payment.id, tenantId)` → if not found, warn and skip
- Swap lines: `DR 1100/1120 / CR 1200` → `DR 1200 / CR 1100/1120`
- `journal.create({ sourceType: REPAIR_ADDITIONAL_PAYMENT_REVERSAL, sourceId: payment.id })`

Idempotent.

---

## 9. Idempotency Design

All journal entries for the "Refund & Cancel" workflow use the existing idempotency mechanism:
`JournalService.findBySource(sourceType, sourceId, tenantId)` before `create()`.

| Journal | sourceType | sourceId | Idempotency key |
|---------|-----------|----------|-----------------|
| Payment reversal | REPAIR_PAYMENT_REVERSAL | repair.id | already exists in 4B.4K |
| Settle reversal | REPAIR_DEPOSIT_SETTLE_REVERSAL | repair.id | already exists in 4B.4K |
| Deposit refund | REPAIR_DEPOSIT_REFUND | repair.id | already exists in 4B.4J |
| COGS reversal | REPAIR_COGS_REVERSAL | part.id | **new — this phase** |
| Addl payment reversal | REPAIR_ADDITIONAL_PAYMENT_REVERSAL | payment.id | **new — this phase** |

If the "Refund & Cancel" endpoint is called twice, all journal.create() calls return `{created:false}` on the second call. No duplicate journals.

---

## 10. Reconciliation Design (deferred to implementation phase)

The reconciliation classifier update is deferred because it requires:
1. Collecting voided parts (parts are voided during cancellation, but REPAIR_COGS_REVERSAL uses voided part IDs)
2. Knowing a repair "was DELIVERED" before cancellation — inferred from `journalIndex.has('REPAIR_FINAL_PAYMENT:${repair.id}')`, not from a model field
3. Additional query clauses in `scanRepairs()` for REPAIR_COGS_REVERSAL + REPAIR_ADDITIONAL_PAYMENT_REVERSAL

### Reconciliation expectation design (for future implementation):

For a cancelled repair where `journalIndex.has('REPAIR_FINAL_PAYMENT:repair.id')`:
1. Expect REPAIR_PAYMENT_REVERSAL (sourceId=repair.id) — already in scope
2. Expect REPAIR_DEPOSIT_SETTLE_REVERSAL if REPAIR_DEPOSIT_SETTLE was posted
3. Expect REPAIR_DEPOSIT_REFUND if REPAIR_DEPOSIT was posted
4. Expect REPAIR_COGS_REVERSAL (sourceId=part.id) for every part that has a REPAIR_COGS journal
5. Expect REPAIR_ADDITIONAL_PAYMENT_REVERSAL (sourceId=payment.id) for every additional payment with a REPAIR_ADDITIONAL_PAYMENT journal

Designed test scenarios (G27-G31) — to be implemented in the reconciliation update phase:

| Test | Description |
|------|-------------|
| G27 | Cancelled DELIVERED repair, all reversals posted → POSTED |
| G28 | Cancelled DELIVERED repair, COGS_REVERSAL missing → MISSING |
| G29 | Cancelled DELIVERED repair, COGS_REVERSAL amount mismatch → ERROR |
| G30 | Cancelled DELIVERED with additional payment, all reversals → POSTED |
| G31 | Cancelled DELIVERED with additional payment, ADDITIONAL_PAYMENT_REVERSAL missing → MISSING |

---

## 11. Test Results

### 11.1 New tests: L01-L13 (`repair-accounting.adapter.spec.ts`)

| Test | Description | Result |
|------|-------------|--------|
| L01 | COGS reversal — single part with REPAIR_COGS JE → DR 1310 / CR 5200, sourceType=REPAIR_COGS_REVERSAL, sourceId=part.id | PASS |
| L02 | COGS reversal — multiple parts → one REPAIR_COGS_REVERSAL journal per part with a COGS JE | PASS |
| L03 | COGS reversal — no REPAIR_COGS JE found for a part → skip without creating reversal | PASS |
| L04 | COGS reversal — voided part with existing REPAIR_COGS JE → still reverses (historical cost must be reversed) | PASS |
| L05 | COGS reversal — no parts → no journals created, no findBySource calls | PASS |
| L06 | COGS reversal — public wrapper swallows errors, does not rethrow | PASS |
| L07 | COGS reversal — tenant not in allowlist → no-op (no findBySource, no create) | PASS |
| L08 | COGS reversal — idempotent: JournalService returns {created:false}, no error | PASS |
| L09 | Additional payment reversal — CASH → DR 1200 / CR 1100 (swapped), sourceType=REPAIR_ADDITIONAL_PAYMENT_REVERSAL | PASS |
| L10 | Additional payment reversal — TRANSFER → DR 1200 / CR 1120 | PASS |
| L11 | Additional payment reversal — no REPAIR_ADDITIONAL_PAYMENT JE found → warns, no reversal | PASS |
| L12 | Additional payment reversal — public wrapper swallows errors | PASS |
| L13 | Additional payment reversal — idempotent: JournalService returns {created:false}, no error | PASS |

### 11.2 Full test suite

```
Test Suites: 30 passed, 30 total
Tests:       481 passed, 481 total
Time:        ~182s
```

All existing 468 tests continue to pass.

---

## 12. Production Safety Verification

| Check | Result |
|-------|--------|
| JournalEntry rows (production) | 45 — unchanged |
| JournalLine rows (total) | 90 — unchanged |
| RepairsService.update() CANCELLED block | No changes |
| New endpoint created | None |
| Migrations created | None |
| Production deployment | None |
| ACCOUNTING_ACTIVATION_TIMESTAMP | 2026-08-18T04:17:00Z — unchanged |

---

## 13. Known Gaps (deferred to implementation phase)

1. **COGS reversal not called from anywhere yet.** `recordCogsReversalJournal()` is implemented and tested but not wired. The caller will be the future "Refund & Cancel" endpoint.

2. **COGS gap in Scenario B (cancel after reversePayment):** When a DELIVERED repair goes through `reversePayment()` (DELIVERED → COMPLETED) and is then cancelled via the existing path, the REPAIR_COGS journals are not reversed. The deposit refund is handled (4B.4K), but COGS reversal requires the parts list at cancellation time. The cancellation CANCELLED block voids parts and returns stock but does not call `recordCogsReversalJournal()`. This gap will be addressed when the CANCELLED block is updated.

3. **Reconciliation classifier not yet updated** for cancelled DELIVERED repairs. Designed (Section 10) but deferred.

4. **CDT source type for final payment refund not defined.** When "Refund & Cancel" is implemented, CDT OUT for the final payment refund needs a sourceType. Candidates: reuse `ACCOUNTING_SOURCE.REVERSAL` (like reversePayment does) or define a new `REPAIR_FINAL_PAYMENT_REFUND`.

5. **No pilot repair tested.** This is READ-ONLY design; no production repairs were created or modified.

---

## 14. Pending Implementation (Requires Owner Approval)

1. **POST /repairs/:id/refund-and-cancel endpoint** — new controller method + DTO
2. **RepairsService.refundAndCancel()** — orchestrates all steps:
   - Pre-conditions: status=DELIVERED, paymentStatus=PAID
   - $transaction: void parts + stock return + CDT OUTs (final payment + deposit + per-additional-payment)
   - Post-commit: `reversePaymentJournal` + `recordDepositRefundJournal` + `recordCogsReversalJournal` + per-payment `recordAdditionalPaymentReversalJournal`
3. **Update CANCELLED block** to call `recordCogsReversalJournal()` so Scenario B gap is closed
4. **Update reconciliation classifier** + tests G27-G31
5. **Controlled pilot** — one DELIVERED repair → refund-and-cancel → verify all journals

---

## 15. Verdict

**PHASE 4B.4L: AUDIT + DESIGN COMPLETE.**

- Full code audit of DELIVERED repair lifecycle: documented
- Cancellation scenarios A-D: mapped with full journal sequences
- New constants: REPAIR_COGS_REVERSAL, REPAIR_ADDITIONAL_PAYMENT_REVERSAL added
- New adapter primitives: `recordCogsReversalJournal` + `recordAdditionalPaymentReversalJournal` implemented and tested
- Test results: 481/481 PASS (13 new L-series tests)
- No production data touched. No endpoint created. No RepairsService wiring.

STOPPED per phase specification. Awaiting owner approval for implementation phase.
