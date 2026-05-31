# Phase 16.8 — SUNMI QA Checklist
**Device:** SUNMI V2 Pro (Android 11, WebView)  
**App:** FixITPro DEV APK (com.fixitpro.dev)  
**Backend:** http://192.168.1.172:4000 (LAN)  
**Frontend:** http://192.168.1.172:3001 (LAN)  
**Date:** _______________  
**Tester:** _______________  

Legend: ✅ PASS · ❌ FAIL · ⚠️ PARTIAL · — SKIP (feature not applicable)

---

## Pre-Test Setup

| # | Step | Result | Notes |
|---|------|--------|-------|
| S-1 | Backend server running on dev machine | | |
| S-2 | Frontend dev server running on dev machine | | |
| S-3 | SUNMI connected to same LAN as dev machine | | |
| S-4 | APK installed and launches without crash | | |
| S-5 | Login as OWNER (`owner@fixitpro.com` / `admin1234`) | | |
| S-6 | Verify home screen loads (no blank/error) | | |

---

## 1. Authentication & Session

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| A-1 | Login with valid credentials | JWT stored; redirect to dashboard | | |
| A-2 | Login with wrong password | "Invalid credentials" error shown | | |
| A-3 | Leave app idle 7+ days, reopen | Session expired; redirect to login | | |
| A-4 | Login as CASHIER role | Repair and POS tabs visible; analytics hidden | | |
| A-5 | Login as TECHNICIAN role | Repairs visible; POS/reports hidden | | |
| A-6 | Logout button | Returns to login screen; token cleared | | |

---

## 2. Shift Management

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| SH-1 | Open shift (enter opening cash balance) | Shift created; shift bar shows open | | |
| SH-2 | Attempt sale with no open shift | Error: "กรุณาเปิดกะก่อน" | | |
| SH-3 | Open second shift while first is active | Error: "You already have an open shift" | | |
| SH-4 | Close shift (enter actual cash balance) | Shift summary shown; isActive=false | | |
| SH-5 | Shift summary shows correct CASH total | Sum matches POS + repair cash payments | | |
| SH-6 | Shift mismatch notification appears | Notification shown if |diff| > threshold | | |
| SH-7 | AIS/TRUE/DTAC opening balances | Carrier wallet recorded on open | | |

---

## 3. POS / Sales (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| P-1 | Open POS screen; product grid loads | Products with images/prices visible | | |
| P-2 | Tap product → adds to cart | Cart updates; quantity = 1 | | |
| P-3 | Tap same product again | Quantity increments (not duplicate row) | | |
| P-4 | Add same product in two separate taps | Stock check uses combined quantity | | |
| P-5 | Apply item-level discount | Subtotal reduces; discount shown on row | | |
| P-6 | Apply order-level discount equal to subtotal | Total = ฿0; allowed | | |
| P-7 | Apply order-level discount greater than subtotal | Error: "Discount cannot exceed subtotal" | | |
| P-8 | Enter cash amount = exact total | Change = ฿0.00 shown | | |
| P-9 | Enter cash amount less than total | Checkout button disabled | | |
| P-10 | Checkout via TRANSFER method | Sale recorded; paymentMethod=TRANSFER | | |
| P-11 | Serial-number product — checkout without serial | Error: "requires serial number" | | |
| P-12 | Serial-number product — checkout with correct serial | Sale completes; serial marked SOLD | | |
| P-13 | Product with zero stock | Error shown; cannot add to cart | | |
| P-14 | Receipt prints to SUNMI built-in printer | Thermal receipt output correct | | |
| P-15 | Barcode scan adds product to cart | Correct product added | | |
| P-16 | Customer search during checkout | Customer list loads; selection recorded | | |
| P-17 | Sale saved to correct branch | GET /sales shows correct branchId | | |
| P-18 | BranchStock decremented after sale | GET /stock shows reduced qty | | |

---

## 4. Repair Intake (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| RI-1 | Open repair intake screen | Form loads; all steps visible | | |
| RI-2 | Complete Step 1 — Customer (new walk-in) | Customer created or selected | | |
| RI-3 | Complete Step 2 — Device info (IMEI scan) | IMEI field populated from camera scan | | |
| RI-4 | Complete Step 3 — Issue description | Text entered; max length enforced | | |
| RI-5 | Set due date (today + 3 days) | Date picker works; min=today enforced | | |
| RI-6 | Upload repair intake photo | Camera opens; image attached to form | | |
| RI-7 | Submit repair form | Repair created; status=RECEIVED; ticket # shown | | |
| RI-8 | Print repair intake receipt | Thermal print of intake form | | |
| RI-9 | Ticket number is unique across submissions | No duplicate ticket numbers | | |
| RI-10 | Repair intake without customer (walk-in) | Repair created with null customerId | | |

---

## 5. Repairs Kanban (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| RK-1 | Repairs list loads (filtered by branch) | All active repairs shown | | |
| RK-2 | Advance repair status (RECEIVED → DIAGNOSING) | Status updated; audit log entry created | | |
| RK-3 | Attempt backward status (DIAGNOSING → RECEIVED) | Error: "ไม่สามารถย้อนสถานะ" | | |
| RK-4 | WAITING_APPROVAL → mark COMPLETED (no approval) | Error: "ต้องได้รับการอนุมัติก่อน" | | |
| RK-5 | Add parts to repair | Part added; product listed on repair | | |
| RK-6 | Complete repair → stock deducted | Parts deducted from BranchStock | | |
| RK-7 | Complete same repair twice (race test) | Second attempt is no-op (parts already deducted) | | |
| RK-8 | Payment tab → enter final cost + deposit | finalCost saved; paymentStatus=PENDING | | |
| RK-9 | Payment tab → pay full amount (DELIVERED) | paymentStatus=PAID; status=DELIVERED | | |
| RK-10 | Payment receipt prints on SUNMI printer | Thermal receipt shows correct amount | | |
| RK-11 | SLA badge shows red for overdue repairs | Red badge after due date passes | | |
| RK-12 | Device history lookup by IMEI | Shows only repairs for same tenant | | |
| RK-13 | VIP customer repair → reminder card appears | VIP_REPAIR chip shown in reminder popup | | |

---

## 6. Stock View (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| ST-1 | Stock list loads for current branch | Per-branch quantities shown | | |
| ST-2 | Low-stock items highlighted | Yellow/red severity badge visible | | |
| ST-3 | Out-of-stock item shows 0 qty | Red "หมด" badge shown | | |
| ST-4 | Stock refreshes after sale | Qty decreases after POS transaction | | |

---

## 7. Stock Transfer (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| TR-1 | Create transfer request (from current branch) | Transfer created; status=PENDING | | |
| TR-2 | Approve transfer (OWNER only) | Status→APPROVED; stock moved | | |
| TR-3 | Non-OWNER cannot approve | Button hidden or 403 returned | | |
| TR-4 | Confirm action dialog shown before approve | Dialog appears: "Confirm transfer?" | | |
| TR-5 | Source branch stock decremented | GET /stock shows reduced qty on from-branch | | |
| TR-6 | Destination branch stock incremented | GET /stock shows increased qty on to-branch | | |
| TR-7 | TRANSFER_PENDING reminder card | Reminder popup shows pending transfer chip | | |

---

## 8. Expenses (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| EX-1 | Add expense during open shift | Expense saved with shiftId | | |
| EX-2 | Expense reduces expectedCashBalance in shift summary | Shift close shows deduction | | |
| EX-3 | Add expense with no open shift | Error or warning shown | | |
| EX-4 | Void expense | voidedAt set; excluded from shift totals | | |
| EX-5 | Print expense slip on SUNMI printer | Thermal output correct | | |

---

## 9. Notifications (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| N-1 | Notification bell shows unread count | Badge number correct (null-safe) | | |
| N-2 | Open notifications page | List loads; unread items highlighted | | |
| N-3 | Mark notification as read | Badge count decrements | | |
| N-4 | SHIFT_MISMATCH notification generated | Appears after shift close with large diff | | |
| N-5 | LOW_STOCK notification visible | Shows when stock < threshold | | |

---

## 10. Reminder System — Phase 16 (CRITICAL FOR THIS PHASE)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| R-1 | Reminder popup appears on dashboard load | Popup shows if active reminders exist | | |
| R-2 | VIP_REPAIR card shows for VIP-tagged customer | Repair with VIP customer triggers card | | |
| R-3 | URGENT_REPAIR card shows for overdue repairs | SLA overdue repair triggers urgent card | | |
| R-4 | PARTS_REQUEST_PENDING card after 24h | Repair in WAITING_PARTS >24h shows card | | |
| R-5 | TRANSFER_PENDING card for pending transfers | Pending stock transfer shows card | | |
| R-6 | PICKUP_WAITING card for COMPLETED repairs | Repair completed but not delivered shows card | | |
| R-7 | Snooze 5 min — card disappears | Popup dismissed; re-appears after 5 min | | |
| R-8 | Snooze 15 min — card disappears | Popup dismissed; re-appears after 15 min | | |
| R-9 | Snooze 30 min — card disappears | Popup dismissed; re-appears after 30 min | | |
| R-10 | CRITICAL reminder — no dismiss button | Cannot close CRITICAL card without snoozing | | |
| R-11 | Anti-spam: same entity doesn't re-sound within 5 min | Sound plays once; no repeat for 5 min | | |
| R-12 | Web Audio tone plays on SUNMI WebView | Sound audible on device speaker | | |
| R-13 | VIP_REPAIR uses distinct audio tone | Tone differs from URGENT_REPAIR | | |
| R-14 | CRITICAL overlay pulse effect visible | Pulsing red overlay on CRITICAL reminder | | |
| R-15 | Settings → disable specific reminder type | Toggle off → that type no longer shows | | |
| R-16 | OWNER scope toggle → shows all branches | Scope=branch vs all-branches data | | |
| R-17 | Snooze recorded in audit log | `/audit-logs` shows REMINDER_SNOOZED entry | | |
| R-18 | Settings change recorded in audit log | `/audit-logs` shows REMINDER_SETTINGS_UPDATED | | |
| R-19 | Reminder poll interval respects settings | No excessive API calls observed | | |

---

## 11. Dashboard (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| D-1 | Dashboard loads without crash | All cards render; no null errors | | |
| D-2 | Revenue figures match expected sales | Total = POS + repairs + packages | | |
| D-3 | Low stock / out-of-stock alerts show | Alert chips match inventory state | | |
| D-4 | Notification bell shows correct count (null-safe) | Count shows 0 when API returns null | | |
| D-5 | Branch performance section (OWNER only) | Shows per-branch revenue | | |
| D-6 | Weekly revenue chart renders | Bar/line chart visible without crash | | |
| D-7 | Current shift widget shows correct state | Open shift shows name, open time | | |

---

## 12. Daily Summary / Closing (SUNMI Screen)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| DS-1 | Daily summary page loads | Revenue, expense, shift data shown | | |
| DS-2 | Print daily closing receipt | Thermal print output correct | | |
| DS-3 | Carrier wallet balances shown | AIS/TRUE/DTAC/NT totals visible | | |

---

## 13. Warranty (Desktop Only — Not SUNMI)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| W-1 | Active warranties list loads | List with expiry dates shown | | |
| W-2 | Expiring-soon badge visible | Yellow badge for <30 days | | |
| W-3 | Claim filed against warranty | Claim linked to warranty record | | |

---

## 14. Printer Hardware Tests (SUNMI Built-in Printer)

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| PR-1 | SUNMI AIDL printer detected | InnerPrinter mode selected automatically | | |
| PR-2 | Sale receipt prints with correct data | Items, totals, payment method correct | | |
| PR-3 | Repair intake receipt prints | Customer, device, issue, due date correct | | |
| PR-4 | Repair delivery receipt prints | Final cost, paid amount, warranty note correct | | |
| PR-5 | Expense slip prints | Amount, category, date correct | | |
| PR-6 | Daily closing receipt prints | All session totals correct | | |
| PR-7 | Printer paper-out graceful error | Error shown; app doesn't crash | | |
| PR-8 | Logo on receipt (if configured) | Logo printed if showLogo=true in settings | | |

---

## 15. Offline / Network Tests

| # | Scenario | Expected | Result | Notes |
|---|----------|----------|--------|-------|
| OF-1 | Disable WiFi while using app | Error shown; no silent data loss | | |
| OF-2 | Re-enable WiFi | App reconnects; data syncs | | |
| OF-3 | Server restart during transaction | Transaction fails gracefully; no duplicate | | |

---

## Defects Found During Testing

| # | Severity | Module | Description | Screenshot |
|---|----------|--------|-------------|------------|
| | | | | |

---

## Sign-Off

| | |
|---|---|
| **Tester** | |
| **Date** | |
| **PASS / FAIL / PARTIAL** | |
| **Blocking issues** | |
| **Notes for next session** | |
