# FixITPro — Full UAT Test Plan
**Date:** 2026-05-30  
**Environment:** DEV only (localhost:3001 / API :4000)  
**Test accounts:** owner@fixitpro.com / 123456@gmail.com (MANAGER สาขา2) / 1234567@gmail.com (MANAGER สาขา3)

---

## Module 1: Login & Authentication

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| AUTH-T01 | Valid owner login | OWNER | POST /auth/login email=owner@fixitpro.com pw=admin1234 | 200, token returned, role=OWNER |
| AUTH-T02 | Valid manager login | MANAGER | Login with real manager credential | 200, role=MANAGER, branchId populated |
| AUTH-T03 | Wrong password rejected | Any | Login with wrong password | 401 |
| AUTH-T04 | Expired token blocked | Any | Use expired/tampered JWT | 401 |
| AUTH-T05 | Force password change | Any | User with forcePasswordChange=true | Redirected to change-password page |
| AUTH-T06 | Session persists refresh | OWNER | Reload browser after login | Stays logged in (localStorage token) |
| AUTH-T07 | Logout clears session | OWNER | Click logout | Token cleared, redirect to /login |

---

## Module 2: Branch Context

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| BRANCH-T01 | OWNER sees all branches | OWNER | GET /branches | All active branches returned |
| BRANCH-T02 | OWNER can create branch | OWNER | POST /branches name="สาขาทดสอบ" | 201, branch created |
| BRANCH-T03 | MANAGER cannot create branch | MANAGER | POST /branches | 403 |
| BRANCH-T04 | MANAGER can list branches | MANAGER | GET /branches | 200 (read-only) |
| BRANCH-T05 | BranchSelector shows correct branch | MANAGER | Open desktop UI | BranchSelector shows own branch |
| BRANCH-T06 | Branch filter scopes dashboard | OWNER | Select specific branch in dashboard | Data filtered to selected branch |
| BRANCH-T07 | Non-OWNER branchId enforced | MANAGER | Attempt POST /sales with different branchId in body | Backend uses JWT branchId, ignores body value |

---

## Module 3: Product Catalog

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| PROD-T01 | List products | MANAGER | GET /products | Returns data[] with total |
| PROD-T02 | Create product | MANAGER | POST /products | 201, product created with auto SKU |
| PROD-T03 | Edit product | MANAGER | PATCH /products/:id | 200, product updated |
| PROD-T04 | Auto-generate SKU | MANAGER | GET /products/generate-sku?type=PHONE | Returns SKU like PHN-XXXX |
| PROD-T05 | Auto-generate barcode | MANAGER | GET /products/generate-barcode | Returns 13-digit EAN |
| PROD-T06 | CASHIER cannot create product | CASHIER | POST /products | 403 |
| PROD-T07 | Product search by name | OWNER | GET /products?search=iPhone | Filtered results |
| PROD-T08 | Product with branch stock | OWNER | GET /products?branchId=xxx | Returns branchQuantity, otherBranchTotal |
| PROD-T09 | Category filter | OWNER | GET /products?categoryId=xxx | Only products in category |
| PROD-T10 | Low stock filter | OWNER | GET /products?lowStock=true | Only products below minStock |

---

## Module 4: Branch Stock Management

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| STOCK-T01 | View branch stock list | OWNER | GET /branches/:branchId/stock | Returns per-branch quantities |
| STOCK-T02 | Add product to branch | MANAGER | POST /branches/:id/stock (or via stock adjust) | BranchStock record created |
| STOCK-T03 | Adjust stock IN | MANAGER | POST /stock/adjust type=IN | Stock increases, StockMovement logged |
| STOCK-T04 | Adjust stock OUT | MANAGER | POST /stock/adjust type=OUT | Stock decreases |
| STOCK-T05 | Stock cannot go negative (guard) | MANAGER | Adjust OUT more than available | 400 error or negative check |
| STOCK-T06 | Same product in multiple branches | OWNER | List product across branches | branchBreakdown shows each branch separately |
| STOCK-T07 | CASHIER cannot adjust stock | CASHIER | POST /stock/adjust | 403 |
| STOCK-T08 | Stock code auto-assigned | MANAGER | Create BranchStock | stockCode auto-generated |

---

## Module 5: POS Sale

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| POS-T01 | Create sale with 1 item | CASHIER | POST /sales with lineItems | 201, sale created, stock decremented |
| POS-T02 | Multi-item sale | CASHIER | POST /sales with 3 items | 201, all stocks decremented |
| POS-T03 | Sale scoped to branch | CASHIER | Create sale | sale.branchId = JWT branchId |
| POS-T04 | Payment cash | CASHIER | Sale paymentMethod=CASH | cashAmount recorded |
| POS-T05 | Payment transfer | CASHIER | Sale paymentMethod=TRANSFER | QR code shows in receipt |
| POS-T06 | Discount applied | CASHIER | Sale with discount | total - discount calculated correctly |
| POS-T07 | Stock decremented immediately | CASHIER | Create sale, then GET /products | branchQuantity reduced |
| POS-T08 | Barcode scan to cart | CASHIER | Scan barcode on POS page | Product added to cart |
| POS-T09 | Customer linked to sale | CASHIER | Select customer, create sale | sale.customerId populated |
| POS-T10 | Shift required for sale | CASHIER | Try sale with no open shift | Shift required prompt |

---

## Module 6: Refund / Void

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| REFUND-T01 | Void sale | MANAGER | POST /sales/:id/void | Sale voided, stock restored |
| REFUND-T02 | Partial refund | MANAGER | POST /sales/:id/refund with items | Refund created, partial stock restored |
| REFUND-T03 | CASHIER cannot void | CASHIER | POST /sales/:id/void | 403 |
| REFUND-T04 | Already voided cannot be voided again | MANAGER | Void an already-voided sale | 400 |
| REFUND-T05 | Refund creates debt if unpaid | MANAGER | Refund with customerId | Customer debt updated |

---

## Module 7: Repair Intake

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| REPAIR-T01 | Create repair | CASHIER | POST /repairs with device info | 201, status=RECEIVED |
| REPAIR-T02 | Repair has branchId | CASHIER | Create repair | repair.branchId = JWT branchId |
| REPAIR-T03 | Auto repair number | CASHIER | Create repair | repairNumber auto-generated |
| REPAIR-T04 | Customer linked | CASHIER | Create repair with phone | Customer created/linked |
| REPAIR-T05 | Intake receipt print | CASHIER (SUNMI) | Complete intake → print | Thermal receipt with device info |
| REPAIR-T06 | Offline intake queued | CASHIER (SUNMI) | Offline → intake | Queued in IDB, synced on reconnect |

---

## Module 8: Repair Kanban / Workflow

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| KANBAN-T01 | View repair list | TECHNICIAN | GET /repairs | Returns repairs scoped to branch |
| KANBAN-T02 | Move repair status | TECHNICIAN | PATCH /repairs/:id/status | Status updated, audit logged |
| KANBAN-T03 | Full status progression | TECHNICIAN | RECEIVED → DIAGNOSING → IN_PROGRESS → COMPLETED | Each transition succeeds |
| KANBAN-T04 | Add repair part | TECHNICIAN | POST /repairs/:id/parts | Part linked, stock checked |
| KANBAN-T05 | Complete repair deducts stock | TECHNICIAN | Set status=COMPLETED | Part stock deducted (once only) |
| KANBAN-T06 | Cannot add part after COMPLETED | TECHNICIAN | Add part to COMPLETED repair | 400 error |
| KANBAN-T07 | Approve estimate | TECHNICIAN | POST /repairs/:id/status → WAITING_APPROVAL | Estimate sent for approval |

---

## Module 9: Repair Payment & Delivery

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| REPPAY-T01 | Mark repair paid | CASHIER | POST /repairs/:id/payment | paymentStatus=PAID, paidAmount stored |
| REPPAY-T02 | Delivery receipt print | CASHIER (SUNMI) | POST payment → print | Thermal receipt with warranty text |
| REPPAY-T03 | Repair appears in daily report | OWNER | GET /reports/daily after payment | repairPayments includes this repair |
| REPPAY-T04 | Repair revenue in shift | CASHIER | Close shift after repair payment | repairRevenue in shift summary |

---

## Module 10: Debt Payment

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| DEBT-T01 | View customer debt | OWNER | GET /customers/:id debt tab | Outstanding balance shown |
| DEBT-T02 | Record debt payment | OWNER | POST /debt-payments | Balance reduces |
| DEBT-T03 | Debt from refund | MANAGER | Issue refund for indebted customer | debt increases |

---

## Module 11: Stock Transfer Request

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| XFER-T01 | Request transfer from product list | MANAGER | Click ArrowRightLeft on out-of-stock product | CrossBranchAvailabilityDialog opens |
| XFER-T02 | Transfer button shows when stock=0 + otherBranchTotal>0 | MANAGER | View product row | Transfer button visible |
| XFER-T03 | Transfer button hidden when stock>0 | MANAGER | Product has stock | No transfer button |
| XFER-T04 | Transfer button hidden for CASHIER | CASHIER | View same product | No transfer button |
| XFER-T05 | Transfer button hidden in view-all mode | OWNER | Switch to All Branches view | No transfer button |
| XFER-T06 | Submit transfer request | MANAGER | Complete dialog → submit | Transfer created with PENDING status |
| XFER-T07 | Transfer notification sent | OWNER | Create transfer | Source branch gets STOCK_TRANSFER_PENDING notification |

---

## Module 12: Transfer Approve / Dispatch / Receive

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| XFER-T08 | Approve transfer | MANAGER (source) | PATCH .../approve | status=APPROVED |
| XFER-T09 | Reject transfer | MANAGER (source) | PATCH .../reject with reason | status=REJECTED, rejectReason stored |
| XFER-T10 | Cancel PENDING transfer | Any | PATCH .../cancel with reason | status=CANCELLED |
| XFER-T11 | Dispatch transfer | MANAGER (source) | PATCH .../dispatch | status=IN_TRANSIT |
| XFER-T12 | Receive transfer | MANAGER (dest) | PATCH .../receive | status=RECEIVED, stock moves |
| XFER-T13 | Stock moves only on receive | OWNER | Check stock before/after | Source-qty, dest+qty only after receive |
| XFER-T14 | Desktop /transfers page accessible | MANAGER | Navigate to /transfers | Page loads, shows own branch transfers |
| XFER-T15 | OWNER sees all transfers | OWNER | Navigate to /transfers | All branches shown |
| XFER-T16 | Status filter works | OWNER | Click "รออนุมัติ" tab | Only PENDING transfers shown |
| XFER-T17 | Transfer notification deep link | MANAGER | Click STOCK_TRANSFER_APPROVED notification | Routes to /transfers |

---

## Module 13: Expenses

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| EXP-T01 | Create expense | MANAGER | POST /expenses | 201, expense created |
| EXP-T02 | Expense linked to shift | MANAGER | Create during open shift | expense.shiftId populated |
| EXP-T03 | Expense in daily report | OWNER | GET /reports/daily | expenses section includes it |
| EXP-T04 | CASHIER cannot create expense | CASHIER | POST /expenses | 403 |
| EXP-T05 | Offline expense queued | MANAGER (SUNMI) | Offline → create expense | Queued, synced on reconnect |
| EXP-T06 | Expense print slip | MANAGER (SUNMI) | Create expense → print | Thermal slip with category/amount |

---

## Module 14: Shift Open / Close

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| SHIFT-T01 | Open shift | CASHIER | POST /shifts/open | Shift created, openBalance stored |
| SHIFT-T02 | Only one active shift per branch | CASHIER | Try to open when shift open | 400 error |
| SHIFT-T03 | Close shift with summary | CASHIER | POST /shifts/close | Shift closed, summary calculated |
| SHIFT-T04 | Close shift shows discrepancy | CASHIER | Close with wrong physical cash | mismatch = physicalCash - expectedBalance |
| SHIFT-T05 | Carrier wallet opening balance | CASHIER | Open shift with carrier wallets | AIS/TRUE/DTAC/NT balances recorded |
| SHIFT-T06 | Shift summary includes repairs | CASHIER | Close after repair payment | repairRevenue in summary |
| SHIFT-T07 | Daily closing print | CASHIER (SUNMI) | Close shift → print | Thermal daily closing receipt |
| SHIFT-T08 | Shift scoped to branch | CASHIER | Open shift | shift.branchId = JWT branchId |

---

## Module 15: Daily Closing Print

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| PRINT-T01 | Daily closing from shifts page | MANAGER | Close shift → "พิมพ์สรุปกะ" | PrinterFlowSheet opens |
| PRINT-T02 | Preview shows correct totals | MANAGER | View preview | Revenue, expenses, expected cash correct |
| PRINT-T03 | Print to InnerPrinter | MANAGER (SUNMI) | Select InnerPrinter → print | ESC/POS sent via AIDL |
| PRINT-T04 | Print to Bluetooth printer | MANAGER (SUNMI) | Select BT printer → print | ESC/POS sent via RFCOMM |
| PRINT-T05 | Web fallback | Desktop | Open print dialog | window.print() fallback |

---

## Module 16: Notifications

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| NOTIF-T01 | View notifications | MANAGER | GET /notifications | Items with type/title/message |
| NOTIF-T02 | Mark single as read | MANAGER | PATCH /notifications/:id/read | isRead=true |
| NOTIF-T03 | Mark all as read | MANAGER | PATCH /notifications/read-all | All notifications marked read |
| NOTIF-T04 | Transfer notification shows type label | MANAGER | View transfer notification | Shows "คำขอโอนสต๊อก" label |
| NOTIF-T05 | Transfer notification routes to /transfers | MANAGER | Click transfer notification | Router.push('/transfers') |
| NOTIF-T06 | Bell badge shows unread count | Any | Unread notifications exist | Badge shows count in header |
| NOTIF-T07 | CASHIER cannot create notifications | CASHIER | Direct GET /notifications | 200 (has notification.view) |
| NOTIF-T08 | Low stock notification triggered | OWNER | Product stock falls below minStock | LOW_STOCK notification generated |

---

## Module 17: Audit Logs

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| AUDIT-T01 | View audit logs | OWNER | GET /audit-logs | List of actions with actor/entity |
| AUDIT-T02 | CASHIER blocked from audit | CASHIER | GET /audit-logs | 403 |
| AUDIT-T03 | Sale creates audit entry | CASHIER | Create sale | SALE_CREATED entry in logs |
| AUDIT-T04 | Role change audit | OWNER | Change role permissions | ROLE_PERMISSIONS_SET logged |
| AUDIT-T05 | Transfer approval audit | MANAGER | Approve transfer | STOCK_TRANSFER_APPROVED logged |
| AUDIT-T06 | Filter by action | OWNER | GET /audit-logs?action=SALE_CREATED | Only sale actions returned |

---

## Module 18: Analytics

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| ANALY-T01 | Analytics overview | OWNER | GET /analytics/overview | Returns revenue/repair/stock stats |
| ANALY-T02 | Dead stock report | OWNER | GET /analytics/dead-stock | Products with no movement |
| ANALY-T03 | Repair aging | OWNER | GET /analytics/repair-aging | Repairs by age bucket |
| ANALY-T04 | Branch stock comparison | OWNER | GET /analytics/branch-stock | Per-branch stock levels |
| ANALY-T05 | Top profit products | OWNER | GET /analytics/top-profit-products | Products by profit |
| ANALY-T06 | Technician trends | OWNER | GET /analytics/technician-trends | Tech performance over time |
| ANALY-T07 | CASHIER blocked | CASHIER | GET /analytics/overview | 403 |
| ANALY-T08 | Manager allowed | MANAGER | GET /analytics/overview | 200 (has reports.view) |

---

## Module 19: Backup

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| BACKUP-T01 | Manual backup | OWNER | POST /backup/manual | Backup file created |
| BACKUP-T02 | List backups | OWNER | GET /backup | List of backup files with size/date |
| BACKUP-T03 | Backup retention | OWNER | Check after >30 backups | Old backups purged, min 7 kept |
| BACKUP-T04 | MANAGER blocked | MANAGER | GET /backup | 403 |

---

## Module 20: Offline Queue (SUNMI)

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| OFFLINE-T01 | Banner appears when offline | Any | Disable WiFi on SUNMI | Orange banner appears |
| OFFLINE-T02 | Repair intake queued offline | CASHIER | Offline → create repair | "บันทึกในเครื่องแล้ว" toast, queue +1 |
| OFFLINE-T03 | Expense queued offline | CASHIER | Offline → create expense | Expense queued |
| OFFLINE-T04 | Notification mark-read queued | Any | Offline → mark notification | Queued silently |
| OFFLINE-T05 | Sync completes on reconnect | CASHIER | Reconnect WiFi | Queue processes, banner clears |
| OFFLINE-T06 | Sync status indicator shows | Desktop | Reconnecting | SyncStatusIndicator in header shows |
| OFFLINE-T07 | IDB fallback to in-memory | Any | IDB unavailable | Operations still queue in memory |
| OFFLINE-T08 | Failed items retry | Any | API returns 500 on sync | Item stays in FAILED state, retry possible |

---

## Module 21: SUNMI APK

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| APK-T01 | App loads without white screen | CASHIER | Open APK | SUNMI home screen loads |
| APK-T02 | Login on device | CASHIER | Enter credentials | Login succeeds, token stored |
| APK-T03 | POS sale on device | CASHIER | Scan barcode → add to cart → checkout | Sale created, stock decremented |
| APK-T04 | Repair intake on device | CASHIER | New repair intake flow | Repair created |
| APK-T05 | Carrier package sale | CASHIER | Select carrier → amount → confirm | Wallet deducted, receipt shown |
| APK-T06 | View transfers | MANAGER | Navigate to โอนสต็อก tab | Transfer list loads |
| APK-T07 | Notifications on device | Any | Navigate to notifications | Notifications load |
| APK-T08 | sunmi-health page | Any | Visit /sunmi-health | Shows platform/IDB/API/online status |
| APK-T09 | Error boundary catches crash | Any | Forced error | Dark-theme error page with reload button |
| APK-T10 | ADB install | Dev | adb install -r app-dev-debug.apk | Installs and opens |

---

## Module 22: Printer Flow

| Test ID | Description | Role | Steps | Expected |
|---|---|---|---|---|
| PRINTER-T01 | Printer picker loads | CASHIER | Open PrinterFlowSheet | InnerPrinter status shown |
| PRINTER-T02 | InnerPrinter binding | CASHIER (SUNMI OEM) | Select InnerPrinter | AIDL binds, status=connected |
| PRINTER-T03 | Bluetooth printer discovery | CASHIER | Open BT picker | Paired devices listed |
| PRINTER-T04 | Set default printer | CASHIER | Toggle "บันทึกเป็น default" | Saved to SharedPreferences |
| PRINTER-T05 | Auto-load default | CASHIER | Reopen PrinterFlowSheet | Skips picker, goes to preview |
| PRINTER-T06 | Sale receipt preview | CASHIER | POS checkout → print | 58mm thermal preview shown |
| PRINTER-T07 | Repair delivery receipt | CASHIER | Repair payment → print | Repair receipt preview with warranty text |
| PRINTER-T08 | Expense slip | MANAGER | Create expense → print | Expense slip preview |
| PRINTER-T09 | Daily closing | MANAGER | Close shift → print | Daily closing receipt preview |
| PRINTER-T10 | Web fallback | Desktop | Open PrinterFlowSheet | window.print() opens |
| PRINTER-T11 | Share receipt (LINE/WhatsApp) | CASHIER | Share button | Web Share API opens |

---

## Scenario A — New Branch Stock

| Step | Action | Expected |
|---|---|---|
| A1 | OWNER creates Branch 2 | Branch appears in branch list |
| A2 | MANAGER (B2) creates new product with stock=10 | Product in catalog, BranchStock B2=10 |
| A3 | GET /products?branchId=B2 | branchQuantity=10 |
| A4 | GET /products?branchId=B3 | branchQuantity=0 or not in BranchStock |
| A5 | OWNER views all branches | Product shows under B2 with qty 10 |

---

## Scenario B — Existing Product Enroll in New Branch

| Step | Action | Expected |
|---|---|---|
| B1 | Product X exists in B1 with stock=5 | Confirmed in catalog |
| B2 | MANAGER (B3) finds Product X in catalog | GET /products returns product |
| B3 | MANAGER (B3) adjusts stock IN for Product X | BranchStock B3 created with qty=N |
| B4 | Product X not duplicated | Still one Product record |
| B5 | GET /products?branchId=B3 | Shows B3 stock separately |

---

## Scenario C — POS Scoped to Branch

| Step | Action | Expected |
|---|---|---|
| C1 | B2 has Product Y stock=5 | Confirmed |
| C2 | CASHIER (B2) sells 1 of Product Y | Sale created |
| C3 | GET /products?branchId=B2 | branchQuantity=4 |
| C4 | GET /products?branchId=B3 | branchQuantity unchanged |
| C5 | OWNER GET /products (all) | Total product.stock=sum of all branches |

---

## Scenario D — Full Transfer Workflow

| Step | Action | Expected |
|---|---|---|
| D1 | B3 has Product Z stock=0, B2 has stock=5 | Confirmed |
| D2 | MANAGER (B3) clicks transfer button on Product Z | otherBranchTotal>0, button shows |
| D3 | Submit transfer request B2→B3, qty=2 | Transfer PENDING |
| D4 | Stock B2=5, B3=0 (no change yet) | Confirmed |
| D5 | MANAGER (B2) approves transfer | Status=APPROVED |
| D6 | Stock still B2=5, B3=0 | Confirmed |
| D7 | MANAGER (B2) dispatches | Status=IN_TRANSIT |
| D8 | Stock still B2=5, B3=0 | Confirmed |
| D9 | MANAGER (B3) receives | Status=RECEIVED |
| D10 | Stock B2=3, B3=2 | Confirmed — stock moved only on receive |

---

## Scenario E — Complete Repair Lifecycle

| Step | Action | Expected |
|---|---|---|
| E1 | Create repair for device | status=RECEIVED |
| E2 | TECHNICIAN moves to DIAGNOSING | Status updated |
| E3 | TECHNICIAN adds part (qty=1) | Part linked, no stock change yet |
| E4 | TECHNICIAN moves to IN_PROGRESS | Status updated |
| E5 | TECHNICIAN moves to COMPLETED | **Stock deducted once** for part |
| E6 | Try to add another part | 400 (LOCKED) |
| E7 | CASHIER marks repair paid | paymentStatus=PAID |
| E8 | Check daily report | Repair revenue appears |
| E9 | Print delivery receipt | Thermal receipt with warranty text |

---

## Scenario F — Offline Queue

| Step | Action | Expected |
|---|---|---|
| F1 | SUNMI connected to LAN | Normal operation |
| F2 | Disable WiFi | Orange offline banner appears |
| F3 | Create repair intake | "บันทึกในเครื่องแล้ว" toast, queue=1 |
| F4 | Create expense | Queue=2 |
| F5 | Check queue status | Both items PENDING |
| F6 | Re-enable WiFi | Auto-sync starts |
| F7 | Check server | Both records appear in backend |
| F8 | Queue cleared | Banner disappears |

---

## Scenario G — SUNMI Full Flow

| Step | Action | Expected |
|---|---|---|
| G1 | Open APK (com.fixitpro.dev) | Loads without white screen |
| G2 | Login as CASHIER | SUNMI home screen |
| G3 | Scan product barcode → add to cart | Product appears in cart |
| G4 | Complete POS sale | Receipt preview, print to printer |
| G5 | Create repair intake | Repair created, print intake slip |
| G6 | View transfer requests | /sunmi/transfers loads |
| G7 | Check notifications | Notification list loads |
| G8 | Test printer | Printer test receipt prints |
| G9 | Open /sunmi-health | Shows platform=true, IDB=available, API=connected |

---

## Permission Matrix

| Endpoint | OWNER | MANAGER | CASHIER | TECHNICIAN | STOCK_STAFF |
|---|---|---|---|---|---|
| POST /products | Y | Y | N (403) | N | N |
| POST /sales | Y | Y | Y | N | N |
| POST /repairs | Y | Y | Y | Y | N |
| POST /stock/adjust | Y | Y | N | N | Y |
| GET /branches/transfers/list | Y | Y | N (403) | N (403) | Y |
| PATCH .../approve | Y | Y | N | N | N |
| POST /expenses | Y | Y | N (403) | N | N |
| GET /reports/daily | Y | Y | N (403) | N | N |
| GET /analytics/overview | Y | Y | N (403) | N | N |
| GET /dashboard/overview | Y | Y | N (403) | N | N |
| GET /branches (list) | Y | Y | Y | Y | Y |
| POST /branches | Y | N (403) | N (403) | N | N |
| GET /notifications | Y | Y | Y | Y | Y |
| GET /audit-logs | Y | N* | N (403) | N | N |
| PATCH /settings | Y | Y | N (403) | N | N |

*MANAGER audit-log access depends on `audit.view` permission (not in default preset)
