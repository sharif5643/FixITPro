# PHASE 4B.4K — Repair Deposit Refund: Implementation + Controlled Pilot

**Date:** 2026-08-19
**Phase:** 4B.4K — Implementation + Controlled Pilot (COMPLETE)
**Author:** FixITPro Owner
**Commit:** `8f16d7b`

---

## 1. Objective

Wire the Phase 4B.4J `recordDepositRefundJournal()` adapter method into `RepairsService.update()` for the CANCELLED path, create a refund `CashDrawerTransaction` atomically, and verify end-to-end in production with exactly one controlled pilot repair.

---

## 2. Production Pre-flight

| Check | Value |
|-------|-------|
| Container (pre-deploy) | `backend-z9m1c1i9nr6kbyo4qn0vuv1b-185527769839` |
| Commit running | image tag `c0ebfcb...` |
| Backup file | `/opt/fixitpro-backups/db/fixitpro_20260819_pre4B4K.sql.gz` |
| Backup SHA-256 | `98a491e1975891e5349257bd47bea0096b35f58dc4bae953b97260c6e5082ef2` |
| Backup size | 2.3 MB |
| Health | `status:ok, db:ok, redis:ok` |
| `ACCOUNTING_CORE_ENABLED` | `true` |
| `ACCOUNTING_ENABLED_TENANTS` | `cmsc05do8001u7i29q3p5x6zp` (pilot only) |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | `2026-08-18T04:17:00Z` |
| JE (pilot tenant) | 43 |
| JL (total) | 86 |
| Repairs (total) | 25 |
| CDT (pilot tenant) | 90 |
| StockMovements | 289 |

**Explained delta from 4B.4H baseline (JE=39→43, JL=78→86):** Two legitimate POS sales in the pilot tenant on 2026-08-19 (RCP-20260819-9A5B66 and RCP-20260819-F7CA0A), each generating SALE_PAYMENT + SALE_COGS JEs (+4 JEs, +8 JLs).

---

## 3. Implementation (RepairsService.update — CANCELLED block)

Changes to `backend/src/repairs/repairs.service.ts`:

**Before the `$transaction`:** Look up the original deposit CDT to find the payment method used when the deposit was collected. If no CDT found (accounting was off at create time), skip the refund CDT and journal.

**Inside the `$transaction` (atomic):** Create refund CDT via `this.accounting.record()`:
```typescript
await this.accounting.record({
  sourceType:    ACCOUNTING_SOURCE.REPAIR_DEPOSIT_REFUND,
  sourceId:      repair.id,
  paymentMethod: depositPaymentMethod,  // same as original deposit CDT
  amount:        deposit,
  direction:     'OUT',
  branchId:      repairBranchId,
  tenantId,
  actorUserId:   actorId ?? '',
  note:          repair.ticketNumber,
}, tx);
```

**Post-commit:** Create refund journal via `this.repairAccounting.recordDepositRefundJournal()`:
```typescript
await this.repairAccounting.recordDepositRefundJournal(updated as any, tenantId, actorId);
```

**Error handling:** CDT lookup errors are caught and logged; on error, `depositPaymentMethod` is null and both CDT + journal are skipped (business transaction is never affected).

**Idempotency:**
- CDT: `accounting.record()` uses idempotencyKey `tenantId:REPAIR_DEPOSIT_REFUND:repairId:OUT` — duplicate calls return existing record
- JE: `recordDepositRefundJournal()` delegates to `JournalService.create()` which calls `findBySource(REPAIR_DEPOSIT_REFUND, repair.id, tenantId)` first — returns `{created:false}` on duplicate

---

## 4. Tests (468 total, 0 regressions)

### 4.1 New tests: K01-K10 (`repairs.service.spec.ts`)

| Test | Description | Result |
|------|-------------|--------|
| K01 | Cancel without deposit → no CDT lookup, no accounting.record, no recordDepositRefundJournal | PASS |
| K02 | CASH deposit → accounting.record with REPAIR_DEPOSIT_REFUND, OUT, CASH, amount=200 | PASS |
| K03 | TRANSFER deposit → accounting.record with TRANSFER | PASS |
| K04 | No original deposit CDT found → skip CDT + journal | PASS |
| K05 | recordDepositRefundJournal called with correct repair.id and tenantId | PASS |
| K06 | Idempotent: second call produces second accounting.record (idempotency inside service) | PASS |
| K07 | DELIVERED repair → BadRequestException (cannot cancel paid repair) | PASS |
| K08 | tenantId propagated to CDT lookup and accounting.record | PASS |
| K09 | CDT lookup error → cancellation still succeeds (CDT and journal skipped) | PASS |
| K10 | Stock returned for each part with REPAIR_USE movement | PASS |

### 4.2 Prior test suites (all still passing)

- H01-H15: adapter unit tests (15 tests)
- G21-G26: reconciliation classification tests (6 tests)
- All 458 pre-existing tests

**Full suite: 468/468 PASS**

---

## 5. Deployment

| Item | Value |
|------|-------|
| Commit | `8f16d7b` |
| Pushed | 2026-08-19, via HTTPS with credential manager |
| Coolify auto-deploy | Triggered by GitHub webhook |
| New container | `backend-z9m1c1i9nr6kbyo4qn0vuv1b-1787118171` |
| Image tag | `z9m1c1i9nr6kbyo4qn0vuv1b_backend:8f16d7bfa00051354067cf2bccc7c59cc15bf501` |
| Post-deploy health | `status:ok, db:ok, redis:ok` |
| Migrations | None (no migration required) |

---

## 6. Controlled Pilot

### 6.1 Pilot Repair

| Field | Value |
|-------|-------|
| Repair ID | `cmszsu565001n11bebjlzqg3n` |
| Ticket | `REP-20260819-3056A0` |
| Device | Xiaomi Redmi 12 |
| Issue | [4B.4K PILOT] หน้าจอแตก |
| Deposit | ฿150 |
| Deposit Payment | CASH |
| Status after create | RECEIVED |
| Created at | 2026-08-19T07:55 UTC |
| Parts | None |

### 6.2 Deposit Created (at repair creation)

| JE | Entry | DR | CR |
|----|-------|----|----|
| `JE-20260819-9FA3B51D` | REPAIR_DEPOSIT | 1100 ฿150 | 2110 ฿150 |

CDT: `DEPOSIT, IN, CASH, ฿150`

### 6.3 Cancellation

- Method: `PATCH /api/v1/repairs/cmszsu565001n11bebjlzqg3n { "status": "CANCELLED" }`
- Response: `status: CANCELLED` ✓

### 6.4 Verification A-K

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| A: Repair status | CANCELLED | CANCELLED | ✓ |
| B: Original deposit JE untouched | REPAIR_DEPOSIT DR 1100 ฿150 | Unchanged | ✓ |
| C: Exactly 1 REPAIR_DEPOSIT_REFUND JE | 1 JE | JE-20260819-F24D05BB | ✓ |
| D: Journal balanced | DR = CR = ฿150 | DR 150 = CR 150 | ✓ |
| E: DR account = 2110 (Customer Deposit) | 2110 | 2110 | ✓ |
| F: CR account = 1100 (CASH, matches original) | 1100 | 1100 | ✓ |
| G: Exactly 1 CDT OUT | REVERSAL, OUT, CASH | REVERSAL, OUT, CASH, ฿150 | ✓ |
| H: Refund amount = deposit | ฿150 | ฿150 | ✓ |
| I: No stock movement (no parts) | SM=289 | SM=289 | ✓ |
| J: Reconciliation = POSTED | POSTED | isCancelled=true, hasDepositJE=true, hasRefundJE=true, amounts match → POSTED | ✓ |
| K: Other tenants = 0 new JEs | 0 | 0 | ✓ |

### 6.5 Idempotency Verification

Re-called `PATCH /repairs/:id { status: CANCELLED }` on the already-CANCELLED repair.

- Response: 200, same repair data returned
- JE count: unchanged (REPAIR_DEPOSIT_REFUND not duplicated)
- CDT count: unchanged (no duplicate REVERSAL CDT)
- Confirmed: both `accounting.record()` and `JournalService.create()` are fully idempotent

---

## 7. Post-Pilot Row Count Deltas

| Table | Pre-pilot | Post-pilot | Delta | Explanation |
|-------|-----------|------------|-------|-------------|
| JournalEntry (pilot tenant) | 43 | 45 | +2 | REPAIR_DEPOSIT (at create) + REPAIR_DEPOSIT_REFUND (at cancel) |
| JournalLine (total) | 86 | 90 | +4 | 2 lines × 2 JEs |
| Repair (total) | 25 | 26 | +1 | Pilot repair REP-20260819-3056A0 |
| RepairPart | — | — | 0 | No parts |
| CashDrawerTransaction (pilot) | 90 | 92 | +2 | DEPOSIT IN ฿150 + REVERSAL OUT ฿150 |
| StockMovement | 289 | 289 | 0 | No parts → no stock movements |

No unexplained delta.

---

## 8. Known Limitations

1. **Activation timestamp expiry**: `ACCOUNTING_ACTIVATION_TIMESTAMP=2026-08-18T04:17:00Z` expired after 24 hours (at 2026-08-19T04:17Z). The reconciliation API returned `scanned: 0` because of the 24h safety guard. The reconciliation was verified manually via Prisma query. **Action required:** Update activation timestamp if the reconciliation API needs to be used again.

2. **No parts cancellation test**: The pilot repair had no parts. Parts void + stock return was already tested in Phase 4B.4H (REPAIR_COGS pilot) and covered in unit tests (K10).

3. **TRANSFER/CARD refund not piloted**: Only CASH refund was piloted. TRANSFER/CARD path is covered by H02 adapter tests and K03 service tests.

4. **RepairsService.update(CANCELLED) re-runs for already-CANCELLED repair**: The CANCELLED guard allows CANCELLED → CANCELLED transitions (condition: `dto.status !== 'CANCELLED'` means it only blocks non-CANCELLED new status). The idempotency ensures no duplicate records. If needed, a future guard can explicitly return early for CANCELLED → CANCELLED.

---

## 9. Verdict

**PHASE 4B.4K: COMPLETE — PASS.**

- Implementation: `RepairsService.update()` CANCELLED path wired with CDT OUT + JE post-commit
- Tests: 468/468 pass (10 new K-series tests)
- Deployment: commit `8f16d7b`, auto-deployed via Coolify
- Pilot repair REP-20260819-3056A0 (Xiaomi Redmi 12, ฿150 CASH deposit): all 11 checks A-K pass
- No unexplained deltas in any row count

STOPPED per phase specification. Awaiting owner approval for next phase.
