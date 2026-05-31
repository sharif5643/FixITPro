# Phase 16.8 — Code Audit Report
**Project:** FixITPro v1.0.0-RC1  
**Audit Date:** 2026-06-01  
**Auditor:** Claude Code (automated static analysis + code review)  
**Scope:** All 10 core modules — static code review only. No runtime testing.  
**Status:** CRITICAL issues resolved in Phase 16.9 (2026-06-01). MAJOR/MINOR/UX pending approval.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2 | ✅ RESOLVED (Phase 16.9) |
| MAJOR | 4 | ✅ RESOLVED (Phase 16.10) |
| MINOR | 5 | Open — recommended |
| UX | 4 | Open — recommended |
| **Total** | **15** | |

No new blockers in the original KNOWN_ISSUES list — those were resolved in the non-blocker phase.
All findings below are newly identified from Phase 16.8 static audit.

---

## CRITICAL

---

### C-1 · Sales — Stock Check Outside Transaction (Race Condition) ✅ RESOLVED

**Module:** POS / Sales  
**Severity:** CRITICAL  
**File:** `backend/src/sales/sales.service.ts:86–108`

**Description:**  
The branchStock availability check (lines 86–108) runs outside the `$transaction` block (which starts at line 141). Under PostgreSQL `READ COMMITTED` isolation, two concurrent sale requests can both read the same stock value, both pass the check, then both decrement inside their own transactions — resulting in negative inventory.

**Evidence:**
```typescript
// Lines 86–91 — PRE-TRANSACTION read
const bsRows = await this.prisma.branchStock.findMany({ ... })
for (const r of bsRows) branchStockMap.set(r.productId, r.quantity)

// Lines 95–108 — check happens HERE, outside tx
for (const [pid, totalQty] of demandMap) {
  const available = branchStockMap.get(pid) ?? 0
  if (available < totalQty) throw ...
}

// Line 141 — transaction starts AFTER the check
const sale = await this.prisma.$transaction(async (tx) => { ... })
```

The B-1 fix from Phase 13 ensures the `branchStock.update` is inside the transaction, but the validation read is not. The transaction does not re-validate stock before decrement.

**Impact:** Two cashiers selling the last unit simultaneously → stock goes to -1. Cash drawer reconciliation fails. Audit log shows negative.

**Fix applied (Phase 16.9):** `branchStock.update` replaced with `branchStock.updateMany(WHERE quantity >= demand)`. Atomic conditional decrement — if `count=0`, the transaction throws and rolls back. Same pattern applied to the global (no-branch) `product.updateMany` path.  
**Regression:** `critical-fixes.test.ts` — 14 tests covering concurrent oversell, last-unit race, missing-row path.

---

### C-2 · Repairs — Device History Tenant Isolation Gap ✅ RESOLVED

**Module:** Repairs  
**Severity:** CRITICAL  
**File:** `backend/src/repairs/repairs.service.ts:610`

**Description:**  
`getDeviceHistory` scopes results to the caller's tenant only when `tenantId` is truthy. If the JWT was decoded with a null/missing `tenantId` (token issued before tenant-awareness, or malformed), the guard is silently skipped and all tenants' repair history for that IMEI is returned.

**Evidence:**
```typescript
// Line 610 — conditional tenant filter
const where: any = { deviceImei: imei }
if (tenantId) {          // ← guard skipped if tenantId is null
  where.branch = { tenantId }
}
```

**Impact:** In a multi-tenant deployment, one tenant can view another tenant's customer device history. Data privacy violation. Sensitive repair notes and pricing exposed.

**Fix applied (Phase 16.9):** Guard added: `if (role !== 'SUPER_ADMIN' && !tenantId) throw new ForbiddenException(...)`. `tenantId` filter is now unconditional for all non-SUPER_ADMIN roles. SUPER_ADMIN with `tenantId=null` intentionally searches cross-tenant. Empty string tenantId also rejected (falsy check).  
**Regression:** `critical-fixes.test.ts` — 10 tests covering all roles, null/empty tenantId, SUPER_ADMIN cross-tenant path.

---

## MAJOR

---

### M-1 · Sales — Missing Permission Guard on Sale Creation ✅ RESOLVED

**Module:** POS / Sales  
**Severity:** MAJOR  
**File:** `backend/src/sales/sales.controller.ts:24–31`

**Description:**  
The `POST /sales` endpoint (create sale) has only a class-level `@UseGuards(JwtAuthGuard)` and no `@RequirePermission` decorator. Any authenticated user — including TECHNICIAN or STOCK_STAFF — can create a sale directly via the API, bypassing the role-based POS access control. In contrast, `void` and `refund` endpoints on the same controller correctly require `sales.refund` permission.

**Evidence:**
```typescript
@UseGuards(JwtAuthGuard)   // ← class level only
@Controller('sales')
export class SalesController {

  @Post()                  // ← NO @RequirePermission here
  create(@Body() dto: CreateSaleDto, ...) {
    return this.salesService.create(dto, ...)
  }

  @Post(':id/void')
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.refund')  // ← correctly guarded
  voidSale(...) { ... }
```

**Impact:** Any logged-in user can ring up sales. TECHNICIAN role could process sales without CASHIER permissions. Revenue manipulation risk.

**Fix applied (Phase 16.10):** `@UseGuards(PermissionGuard)` and `@RequirePermission('sales.create')` added to `POST /sales`. Consistent with void/refund endpoints in the same controller.  
**Regression:** `major-fixes.test.ts` — permission key consistency + role matrix tests.

---

### M-2 · Repairs — Status Transition Allows Skipping Steps ✅ RESOLVED

**Module:** Repairs  
**Severity:** MAJOR  
**File:** `backend/src/repairs/repairs.service.ts:189–200`

**Description:**  
The status transition guard only prevents backward moves (`toIdx < fromIdx`) and has guards for specific cases (WAITING_APPROVAL→COMPLETED, DELIVERED, CANCELLED). However, it allows any forward skip. A repair in `RECEIVED` status can jump directly to `COMPLETED` (or `IN_PROGRESS`), bypassing `DIAGNOSING`, `WAITING_APPROVAL`, `APPROVED`, and `WAITING_PARTS`.

**Evidence:**
```typescript
// Lines 189–200
if (dto.status !== undefined && dto.status !== repair.status && dto.status !== 'CANCELLED') {
  const STATUS_ORDER = ['RECEIVED','DIAGNOSING','WAITING_APPROVAL','APPROVED',
                        'WAITING_PARTS','IN_PROGRESS','COMPLETED']
  const fromIdx = STATUS_ORDER.indexOf(repair.status)
  const toIdx   = STATUS_ORDER.indexOf(dto.status)
  if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {  // ← only blocks backward
    throw new BadRequestException('ไม่สามารถย้อนสถานะ')
  }
}
```

When status reaches COMPLETED (line 215: `updateData.completedAt = new Date()`), parts are deducted. This means stock can be deducted for a repair that was never diagnosed or approved.

**Impact:** Staff can skip the approval step; repair income recorded without customer approval; stock deducted for unchecked repairs.

**Fix applied (Phase 16.10):** `ALLOWED` transitions map replaces the open-ended `toIdx > fromIdx` guard. Each status has an explicit list of valid next states. RECEIVED→COMPLETED (and all other multi-step skips) now throw `BadRequestException`.  
**Regression:** `major-fixes.test.ts` — 27 transition tests covering all valid paths, blocked skips, backward moves, CANCELLED, and terminal COMPLETED state.

---

### M-3 · Repairs — Product Name Null-Safety in Stock Error Message ✅ RESOLVED

**Module:** Repairs  
**Severity:** MAJOR (degrades to MINOR if product always exists, but unsafe reference)  
**File:** `backend/src/repairs/repairs.service.ts:245–248`

**Description:**  
When a repair's branch stock is insufficient at COMPLETED transition, the error message queries `tx.product.findUnique` but uses optional chaining `product?.name`. If the product was deleted or soft-deleted between part addition and repair completion, `product` is `null`, and the error reads: `"สต็อกสาขาไม่พอสำหรับ "undefined""`. The error still throws, so no data loss occurs, but the operator cannot identify which part is missing.

**Evidence:**
```typescript
// Lines 244–248
const product = await tx.product.findUnique({
  where: { id: part.productId }, select: { name: true }
})
throw new BadRequestException(
  `สต็อกสาขาไม่พอสำหรับ "${product?.name}" มีอยู่ในสาขา: ${available} ชิ้น`
  //                            ↑ null → "undefined" in message
)
```

**Impact:** Operator confusion; cannot determine which product to restock.

**Fix applied (Phase 16.10):** `const productName = product?.name ?? \`[ID: ${part.productId}]\`` — error message is always readable. `needed: N` quantity also added to the message for clearer operator guidance.  
**Regression:** `major-fixes.test.ts` — 5 tests covering null product, deleted product, and message content.

---

### M-4 · File Upload — Insufficient File-Type Validation ✅ RESOLVED

**Module:** Repairs (Image Upload)  
**Severity:** MAJOR  
**File:** `backend/src/repairs/repairs.controller.ts` (uploadImages handler)

**Description:**  
The `FilesInterceptor` validates `mimetype.startsWith('image/')` but MIME types are client-supplied and easily forged. A file named `shell.php` with `Content-Type: image/jpeg` will pass the filter. The stored filename is randomised (Date.now + random extension), which is good, but the original extension is preserved with `extname(file.originalname)`. A file named `malicious.php.jpg` would be stored with `.jpg` extension but the check only looks at MIME.

**Impact:** If the uploads directory is ever served directly (e.g. Nginx misconfiguration), an uploaded web shell could execute. Currently mitigated by random filename, but not safe by design.

**Fix applied (Phase 16.10):**  
1. `fileFilter` now checks **both** MIME (`startsWith('image/')`) AND extension (`ALLOWED_IMAGE_EXTS` set).  
2. `filename` callback now uses `MIME_TO_EXT[file.mimetype]` — stored filename extension comes from validated MIME, never from `extname(originalname)`. `shell.jpg.php` → stored as `timestamp.jpg`.  
**Regression:** `major-fixes.test.ts` — 19 tests: allowed files, forged MIME, dangerous extensions, MIME-derived naming.

---

## MINOR

---

### N-1 · Sales — Pre-Transaction Stock Snapshot May Be Stale (Global Stock Path)

**Module:** POS / Sales  
**Severity:** MINOR  
**File:** `backend/src/sales/sales.service.ts:104`

**Description:**  
When `branchId` is null (no-branch sale), stock is checked against `product.stock` (the global counter, line 104). This value is fetched outside the transaction at line 68 (`prisma.product.findMany`). The same race as C-1 applies here, but is lower severity because global no-branch sales are uncommon in a branch-based deployment.

**Evidence:** `else if (product.stock < totalQty)` at line 104 — `product.stock` read at line 68, outside tx.

**Recommended Fix:** Same as C-1 — re-validate inside transaction, or use a no-branch guard to require branchId on all sales.

---

### N-2 · Repairs — N+1 Query on Repair List

**Module:** Repairs  
**Severity:** MINOR  
**File:** `backend/src/repairs/repairs.service.ts:135–144`

**Description:**  
`findAll` includes `_count: { select: { images: true } }`. Prisma generates a separate `COUNT` subquery per repair row. For a branch with 200 open repairs, this is ~200 extra DB round-trips on the list page. The `parts` include also pulls all part details (with product name) for every repair in the list, even though the list view only shows a part count summary.

**Impact:** Slow repairs list on SUNMI; noticeable lag with >50 repairs.

**Recommended Fix:** Remove `_count` from list query; add a `take:` limit; use pagination. Return part count via aggregation in a single query.

---

### N-3 · Stock Adjust — No In-Transaction Re-Validation

**Module:** Inventory / Stock  
**Severity:** MINOR  
**File:** `backend/src/stock/stock.service.ts` (adjustStock method)

**Description:**  
`adjustStock` reads the current stock quantity before the transaction to validate sufficient stock for `OUT` adjustments, but does not re-validate inside the transaction before the `upsert`. Two concurrent `OUT` adjustments can both pass the pre-check and both decrement.

**Impact:** Same class of issue as C-1 but lower exposure (stock adjustments are manager-only and less frequent than sales).

**Recommended Fix:** Re-read stock inside `$transaction` before decrement; throw if insufficient.

---

### N-4 · Warranty — Expiry Date Not Validated Against Issue Date

**Module:** Warranty  
**Severity:** MINOR  
**File:** `backend/src/warranties/warranties.service.ts` (create method — exact line to be confirmed)

**Description:**  
Warranty creation does not validate that `expiresAt > issuedAt`. A warranty with an expiry date in the past (or before issuance) can be created, showing as immediately expired. Staff confusion; incorrect "expiring soon" badge logic.

**Recommended Fix:** Add `if (dto.expiresAt <= issuedAt) throw BadRequestException(...)` in the service.

---

### N-5 · Debt Page — Partial Payment Preview Uses Float Arithmetic

**Module:** Debt  
**Severity:** MINOR** (the `isFullPay`/`isValid` comparison was fixed in N-3, but the *preview text* was not)  
**File:** `web-app/src/app/(dashboard)/debt/page.tsx:373–374`

**Description:**  
Line 373 renders the remaining-after-partial-payment preview:
```tsx
money(outstanding - numAmount)
```
This subtraction still uses raw float arithmetic. While it doesn't affect the transaction amount (which the server calculates), the *displayed* remaining balance can show `฿99.9900000001` instead of `฿99.99` for certain amounts.

**Recommended Fix:**
```tsx
money(Math.round((outstanding - numAmount) * 100) / 100)
```

---

## UX

---

### UX-1 · SUNMI Sales — No Confirmation Before Large Checkout

**Module:** POS / Sales (SUNMI)  
**Severity:** UX  
**File:** `web-app/src/app/sunmi/sales/page.tsx` (CheckoutDialog confirm button)

**Description:**  
The checkout confirmation button completes the transaction on a single tap with no secondary "Are you sure?" step. On the SUNMI device (touchscreen, gloved hands common in repair shop), accidental taps can trigger ฿5000+ transactions. Once committed, a void requires manager-level `sales.refund` permission.

**Recommended Fix:** For totals above a configurable threshold (e.g. ฿1000), show a `ConfirmActionDialog` before mutating. Below threshold, single-tap is acceptable for speed.

---

### UX-2 · Repair Delivery — No Confirmation Before Payment Commit

**Module:** Repairs (SUNMI)  
**Severity:** UX  
**File:** `web-app/src/app/sunmi/repairs/page.tsx` (DELIVER tab, payment button)

**Description:**  
The "รับชำระ + ส่งมอบ" button triggers `deliverMutation.mutate()` directly without a confirmation dialog. This is the final, irreversible step of a repair — it sets `paymentStatus=PAID` and `status=DELIVERED`. Accidental tap on SUNMI means calling the owner to manually fix in the database.

**Recommended Fix:** Wrap in `ConfirmActionDialog`. The `confirm-action-dialog.tsx` component already exists in the codebase — use it here.

---

### UX-3 · Stock Error — Only First Failing Part Named in Error

**Module:** Repairs  
**Severity:** UX  
**File:** `backend/src/repairs/repairs.service.ts:244–248` (inside `$transaction`)

**Description:**  
When multiple parts are insufficient, the loop throws on the *first* failing part and stops. The technician sees one error, corrects it, re-submits, then gets a second error for the next part. With 4-part repairs this becomes a frustrating multi-round error loop.

**Recommended Fix:** Collect all insufficient parts first, then throw a single error listing all of them:
```typescript
const shortages = []
for (const part of freshParts) {
  if (available < part.quantity) shortages.push({ name, available, needed: part.quantity })
}
if (shortages.length > 0) throw new BadRequestException(
  `สต็อกไม่พอ: ${shortages.map(s => `${s.name} (มี ${s.available}, ต้องการ ${s.needed})`).join(', ')}`
)
```

---

### UX-4 · Reminder Popup — No "Dismiss All" Option

**Module:** Reminder System  
**Severity:** UX  
**File:** `web-app/src/components/alerts/reminder-popup.tsx`

**Description:**  
The reminder popup shows multiple cards (VIP, URGENT, PARTS, etc.) and requires snoozeing each one individually. On a busy day with 8 reminders, staff must tap "snooze" 8 times before they can use the app. No "snooze all for 15 min" or "dismiss all non-critical" option exists.

**Recommended Fix:** Add a "ซ่อนทั้งหมด 15 นาที" (snooze all 15 min) button at the bottom of the popup. Exclude CRITICAL cards from bulk snooze.

---

## Module Verification Summary

| Module | Status | Critical | Major | Minor | UX | Notes |
|--------|--------|----------|-------|-------|----|-------|
| POS / Sales | ⚠️ Minor/UX remain | ~~C-1~~ ✅ | ~~M-1~~ ✅ | N-1 | UX-1 | All critical+major resolved |
| Repairs | ⚠️ Minor/UX remain | ~~C-2~~ ✅ | ~~M-2~~, ~~M-3~~, ~~M-4~~ ✅ | N-2 | UX-2, UX-3 | All critical+major resolved |
| Inventory / Stock | ⚠️ Issues found | — | — | N-3 | — | Concurrent adjust |
| Stock Transfer | ✅ No new issues | — | — | — | — | Guards + confirm dialog in place |
| Expenses | ✅ No new issues | — | — | — | — | Shift-linked, voided correctly |
| Notifications | ✅ No new issues | — | — | — | — | Null-safe (N-5 fix applied) |
| Reminder System | ✅ No new issues | — | — | — | UX-4 | Phase 16 feature — needs device test |
| Audit Log | ✅ No new issues | — | — | — | — | Logs all required actions |
| Warranty | ⚠️ Minor issue | — | — | N-4 | — | Expiry validation missing |
| Dashboard | ✅ No new issues | — | — | — | — | N-5 fix applied |

---

## Audit Verification Checklist

### Audit Log — Verified Actions

The following actions should generate audit log entries. Verify in `/audit-logs` after testing:

| Action | Module | Expected in Audit Log |
|--------|--------|----------------------|
| SALE_CREATED | Sales | ✅ Implemented in sales.service.ts |
| SHIFT_OPENED | Shifts | ✅ Implemented in shifts.service.ts |
| SHIFT_CLOSED | Shifts | ✅ Implemented in shifts.service.ts |
| REPAIR_CREATED | Repairs | ✅ Implemented in repairs.service.ts |
| REPAIR_UPDATED | Repairs | ✅ Implemented in repairs.service.ts |
| STOCK_ADJUSTED | Stock | ✅ Implemented in stock.service.ts |
| TRANSFER_CREATED | Branches | Needs verification |
| TRANSFER_APPROVED | Branches | Needs verification |
| EXPENSE_CREATED | Expenses | Needs verification |
| REMINDER_SNOOZED | Reminders | ✅ Implemented in reminders.service.ts |
| REMINDER_SETTINGS_UPDATED | Reminders | ✅ Implemented in reminders.service.ts |
| ROLE_PERMISSIONS_SET | Permissions | ✅ Implemented |
| USER_CREATED | Users | ✅ Implemented |

### Audit Log — Gaps Identified

| Gap | Module | Severity |
|-----|--------|----------|
| SALE_VOIDED not confirmed in audit log | Sales | MINOR |
| REPAIR_PAYMENT not confirmed in audit log | Repairs | MINOR |
| EXPENSE_VOIDED not confirmed in audit log | Expenses | MINOR |

---

## Phase 16 Reminder System — Specific Verification

| Item | Status |
|------|--------|
| `ReminderSettings` table exists in DEV DB | ✅ Migration 20260601000000 applied |
| `ReminderSnooze` table exists in DEV DB | ✅ Migration 20260601000000 applied |
| `RemindersModule` registered in `app.module.ts` | ✅ Verified in source |
| `purgeExpiredSnoozes` cron job defined | ✅ In reminders.service.ts |
| OWNER scope toggle (`?scope=branch`) | ✅ In reminders.controller.ts |
| Anti-spam 5-min gate on sound replay | ✅ In reminder-popup.tsx (`soundedAtRef`) |
| 5 audio tone profiles | ✅ In alert-sound.ts (`playTypedSound`) |
| CRITICAL no-dismiss enforcement | ✅ In reminder-popup.tsx |
| Migration pending on PROD | ⚠️ Not yet deployed to PROD |

---

## Recommended Fix Priority

### Must fix before PROD deploy:
1. **C-1** — Re-validate stock inside transaction (sales)
2. **C-2** — Make tenantId mandatory in getDeviceHistory
3. **M-1** — Add `@RequirePermission('sales.create')` to POST /sales
4. **M-2** — Enforce step-by-step status transitions in repairs

### Fix before or shortly after PROD:
5. **M-3** — Null-safe product name in repair error message
6. **M-4** — File upload extension whitelist
7. **N-1** — Global stock re-validation inside transaction
8. **UX-2** — Confirm dialog before repair delivery payment

### Post-PROD patch:
9. **N-2** — Paginate repair list; remove N+1 count query
10. **N-3** — In-transaction re-validation for stock adjustments
11. **N-4** — Warranty expiry > issuance date validation
12. **N-5** — Integer-cent arithmetic in debt partial payment preview
13. **UX-1** — Confirm dialog for high-value POS checkout
14. **UX-3** — Batch stock shortage error message
15. **UX-4** — "Snooze all" button in reminder popup

---

## Files Not Changed in This Phase

This report is read-only. No source files were modified during Phase 16.8.  
All changes await owner approval.

**Awaiting approval before fixing any issues.**
