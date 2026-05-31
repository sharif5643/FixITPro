# FixITPro — Current System Summary
**Date:** 2026-05-30  
**Environment:** DEV only

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Client Tier                                        │
│  ┌───────────────────┐  ┌──────────────────────┐   │
│  │  Desktop Browser  │  │  SUNMI V2 Pro (APK)  │   │
│  │  Next.js :3001    │  │  Capacitor Android   │   │
│  └─────────┬─────────┘  └──────────┬───────────┘   │
└────────────┼────────────────────────┼───────────────┘
             │ HTTP/REST              │ HTTP/REST (LAN)
┌────────────▼────────────────────────▼───────────────┐
│  API Tier — NestJS :4000                            │
│  /api/v1/* — JWT Bearer auth                        │
│  Permission guard + Role guard on all endpoints     │
└─────────────────────┬───────────────────────────────┘
                      │ Prisma 5.x
┌─────────────────────▼───────────────────────────────┐
│  Data Tier — PostgreSQL :5432                       │
│  DB: fixitpro  (DEV)                                │
│  35 migrations applied                              │
└─────────────────────────────────────────────────────┘
```

---

## Environment

| Item | DEV | PROD |
|---|---|---|
| Backend port | 4000 | (not deployed) |
| Frontend port | 3001 | (not deployed) |
| DB name | fixitpro | fixitpro_prod |
| API prefix | /api/v1 | /api/v1 |
| APK app ID | com.fixitpro.dev | com.fixitpro |
| APK server URL | http://192.168.1.172:3001 | (not set) |
| NODE_ENV | development | production |
| JWT expiry | 7d | 7d |

---

## Backend — NestJS Modules

| Module | Controller prefix | Key permissions |
|---|---|---|
| Auth | /auth | — |
| Users | /users | owner-only write |
| Categories | /categories | products.view |
| Products | /products | products.view / products.create |
| Stock | /stock | stock.adjust |
| Branches | /branches | branches.manage (write only) |
| Stock Transfers | /branches/transfers/* | stock.transfer |
| Sales | /sales | sales.create |
| Repairs | /repairs | repair.create / repair.edit |
| Shifts | /shifts | — (all authenticated) |
| Expenses | /expenses | expenses.manage (write only) |
| Customers | /customers | — (all authenticated) |
| Suppliers | /suppliers | purchase.create |
| Purchase Orders | /purchase-orders | purchase.create |
| Reports | /reports | reports.view |
| Dashboard | /dashboard | reports.view |
| Analytics | /analytics | reports.view |
| Notifications | /notifications | notification.view |
| Audit Log | /audit-logs | audit.view |
| Permissions | /permissions | owner-only write |
| Serials | /serials | serials.manage |
| Warranties | /warranties | warranty.view |
| Claims | /claims | claims.manage |
| Technicians | /technicians | technician.view |
| Debt Payments | /debt-payments | — |
| Settings | /settings | settings.manage (write only) |
| Subscription | /subscription | owner-only write |
| Carrier Wallet | /carrier-wallet | — |
| Backup | /backup | system.backup |
| Data Tools | /data | data.export |
| Super Admin | /super-admin | super-admin role only |

**Permission enforcement:**
- OWNER/SUPER_ADMIN bypass all permission checks
- Read endpoints mostly open to all authenticated users
- Write/delete endpoints gated by permission + role guards
- Branch scoping enforced in JWT: non-OWNER cannot inject arbitrary branchId

---

## Database Migrations (35 total)

| Migration | Date | Summary |
|---|---|---|
| 20260502162133_init | 2026-05-02 | Core schema |
| 20260503182429_add_repair_workflow | 2026-05-03 | Repair statuses |
| 20260503185201_add_settings_subscription | 2026-05-03 | Settings, Subscription |
| 20260504070943_add_repair_payment | 2026-05-04 | Repair payment fields |
| 20260504085234_add_supplier_purchase_order | 2026-05-04 | Supplier/PO |
| 20260504092000_add_stock_movement_reference | 2026-05-04 | StockMovement ref |
| 20260504100436_add_supplier_payment | 2026-05-04 | AP payments |
| 20260504160734_add_warranty_serial | 2026-05-04 | Warranty/Serial |
| 20260504162906_add_claim_system | 2026-05-04 | Claims |
| 20260505035827_add_category_type | 2026-05-05 | Category types |
| 20260505111223_add_permission_system | 2026-05-05 | RolePermission table |
| 20260505123036_add_performance_indexes | 2026-05-05 | DB indexes |
| 20260508000000_add_saas_tenants | 2026-05-08 | Multi-tenant |
| 20260508010000_add_payment_verification | 2026-05-08 | Payment verification |
| 20260508191212_fix_final_sync | 2026-05-08 | Schema sync fixes |
| 20260509073421_add_shop_subtitle | 2026-05-09 | ShopSettings subtitle |
| 20260509083050_add_repair_payment_shift | 2026-05-09 | Repair payment shift link |
| 20260509105213_add_password_reset_fields | 2026-05-09 | Password reset |
| 20260512000001_add_repair_intake_fields | 2026-05-12 | Repair intake fields |
| 20260512122624_add_repair_images | 2026-05-12 | Repair images |
| 20260513000000_add_receipt_settings | 2026-05-13 | Receipt settings |
| 20260513100000_carrier_wallet | 2026-05-13 | Carrier wallet system |
| 20260513200000_void_audit | 2026-05-13 | Void/audit |
| 20260514000000_refund_debt_crm | 2026-05-14 | Refund/debt/CRM |
| 20260516014603_add_expenses | 2026-05-16 | Expenses module |
| 20260516021607_add_profit_fields | 2026-05-16 | Profit tracking |
| 20260516044920_add_po_duedate | 2026-05-16 | PO due date |
| 20260516073000_restore_customer_tags_default | 2026-05-16 | Customer tags |
| 20260518000000_add_expense_shift_id | 2026-05-18 | Expense-shift link |
| 20260523000000_add_audit_log | 2026-05-23 | Audit log table |
| 20260523000001_add_notification | 2026-05-23 | Notifications table |
| 20260524000000_add_customer_note | 2026-05-24 | Customer notes |
| 20260524010000_add_warranty | 2026-05-24 | Warranty expansion |
| 20260524030000_add_branches | 2026-05-24 | Branches + BranchStock |
| 20260525000000_add_branch_status_and_stock_code | 2026-05-25 | Branch status, stock codes |
| 20260529200647_add_transfer_workflow | 2026-05-29 | StockTransfer full workflow |

---

## Frontend Pages (Next.js App Router)

### Desktop — `(dashboard)` layout

| Route | Page | Permission |
|---|---|---|
| / | Dashboard (overview) | reports.view |
| /products | Product catalog + branch stock | products.view |
| /categories | Category management | products.view |
| /barcode-print | Barcode label print | products.view |
| /transfers | **Stock transfer management** | stock.transfer |
| /sales | POS sales + refund/void | sales.create |
| /repairs | Repair Kanban + list | repair.create |
| /repairs/[id] | Repair detail | repair.create |
| /shifts | Shift open/close | — |
| /expenses | Expense management | expenses.manage (write) |
| /customers | CRM customer list | — |
| /customers/[id] | Customer detail + history | — |
| /debt | Outstanding debt | owner-only |
| /suppliers | Supplier list | purchase.create |
| /suppliers/[id]/payables | AP payables | purchase.create |
| /purchase-orders | PO management | purchase.create |
| /serials | Serial/IMEI tracking | serials.manage |
| /warranties | Warranty management | warranty.view |
| /claims | Claim management | claims.manage |
| /technicians | Technician performance | technician.view |
| /technicians/[id] | Technician detail | technician.view |
| /reports/daily-closing | Daily closing report | reports.view |
| /reports/profit | Profit report | reports.view |
| /reports/payables | AP payables report | reports.view |
| /analytics | Advanced analytics | reports.view |
| /employees | Employee management | owner-only |
| /roles | Role permissions | owner-only |
| /branches | Branch management + transfers | branches.manage (owner-only) |
| /data-tools | Import/export | data.export |
| /notifications | Notification center | notification.view |
| /backup | DB backup management | system.backup (owner-only) |
| /audit-logs | Activity audit log | audit.view |
| /settings | Shop settings | settings.manage (write) |
| /subscription | Subscription status | owner-only |

### SUNMI APK — `/sunmi/*` routes

| Route | Description |
|---|---|
| /sunmi | Home (dashboard cards) |
| /sunmi/sales | POS sale flow |
| /sunmi/sales/history | Sale history |
| /sunmi/sim-sales | Carrier package sales (wallet) |
| /sunmi/repairs | Repair Kanban |
| /sunmi/repair-intake | New repair intake |
| /sunmi/stock | Stock management |
| /sunmi/transfers | Stock transfer management |
| /sunmi/shifts | Shift management |
| /sunmi/expenses | Expense entry |
| /sunmi/notifications | Notifications |
| /sunmi/debt | Debt collection |
| /sunmi/daily-summary | Daily summary |
| /sunmi/dashboard | Dashboard |
| /sunmi/printer-test | Printer diagnostics |
| /sunmi-health | Diagnostic page (no auth) |

---

## Multi-Branch Stock Architecture

```
Product (global catalog)
  └── BranchStock (per-branch inventory)
        ├── branchId
        ├── productId
        ├── quantity       ← authoritative stock count
        ├── minStock
        └── stockCode

Product.stock = shadow aggregate (sum of all branch stocks)
Product.branchQuantity = resolved per request when branchId passed
```

**Branch scoping rules:**
- OWNER: can view all branches, no branchId filter needed
- MANAGER/CASHIER/TECHNICIAN/STOCK_STAFF: JWT contains `branchId`, enforced server-side
- All sales, repairs, shifts, expenses automatically scoped to JWT branchId
- Non-OWNER cannot inject a different branchId in request

**GET /products?branchId=xxx** returns:
- `branchQuantity` — stock at requested branch
- `otherBranchTotal` — total stock at all other branches  
- `branchBreakdown` — per-branch quantities

---

## Stock Transfer Workflow

```
PENDING ──► APPROVED ──► IN_TRANSIT ──► RECEIVED
    │            │
    ▼            ▼
REJECTED      CANCELLED
```

| Status | Who acts | Stock movement |
|---|---|---|
| PENDING | Created by requester | None |
| APPROVED | Source branch approves | None |
| IN_TRANSIT | Source branch dispatches | None |
| RECEIVED | Destination branch receives | Stock moves: source-qty, dest+qty |
| REJECTED | Source branch rejects | None |
| CANCELLED | Either branch cancels | None |

**Access:** `stock.transfer` permission OR OWNER  
**API:** `GET /branches/transfers/list` (+ `?status=` + `?branchId=`)  
**Actions:** PATCH `.../approve|reject|dispatch|receive|cancel`

---

## Offline Queue (SUNMI)

**Library:** `lib/offline-queue.ts` — IndexedDB-backed queue with in-memory fallback

**Supported offline operations:**
- `REPAIR_CREATE` — repair intake on SUNMI offline
- `EXPENSE_CREATE` — expense entry on SUNMI offline
- `NOTIFICATION_READ` — mark notification read

**Sync behavior:**
- `hooks/use-sync-queue.ts` — auto-syncs on reconnect
- `components/offline-banner.tsx` — shows orange banner when offline or pending > 0
- `components/layout/sync-status-indicator.tsx` — compact header icon for desktop
- IDB wrapped in try/catch; falls back to in-memory if IDB unavailable

---

## Backup & Logging

**Backup:**
- `@nestjs/schedule` + `@Cron('0 2 * * *')` — 2 AM daily auto-backup
- `purgeOldBackups(retention: 30 days, min: 7 kept)`
- Windows Task Scheduler: `scripts/backup.ps1` + `scripts/setup-backup-task.ps1`

**Logging:**
- `winston` + `nest-winston` — structured logging
- Transports: `error.log` (10MB×5 files), `combined.log` (20MB×7 files)
- Frontend: `ErrorBoundary` component at app root

---

## Thermal Printer Flow (SUNMI APK)

```
UI action (sale/repair/expense)
  → PrinterFlowSheet component
      → Step 1: Printer picker
           InnerPrinter (SUNMI AIDL) or Bluetooth (RFCOMM/SPP)
      → Step 2: Thermal preview (58mm, Courier New)
      → Step 3: Print → spinner → success
  → Web fallback: window.print() popup
```

**Supported receipt types:**
- Sale receipt (`buildReceiptHtml`)
- Repair intake (`buildRepairIntakeHtml`)
- Repair delivery (`buildRepairDeliveryHtml`)
- Package sale — carrier wallet (`buildPackageSaleHtml`)
- SIM sale — product-based (`buildSimSaleHtml`)
- Expense slip (`buildExpenseSlipHtml`)
- Daily closing (`buildDailyClosingHtml`)

**All receipts support:** `showLogo`, `showTaxId`, `paymentQrUrl`, `repairWarrantyText`

---

## Permissions & Roles

| Role | Description | Key permissions |
|---|---|---|
| OWNER | All permissions, no restriction | Everything |
| SUPER_ADMIN | System-level, cross-tenant | Everything |
| MANAGER | Branch manager | 23 permissions (see below) |
| CASHIER | Counter staff | 8 permissions |
| TECHNICIAN | Repair tech | 10 permissions |
| STOCK_STAFF | Warehouse staff | 8 permissions |

**MANAGER permissions (DEV DB):**
products.view/create/edit/delete/view_cost, sales.create/discount/refund, repair.create/edit/close/approve_estimate, stock.adjust/transfer, purchase.create/receive, supplier.pay, reports.view, claims.manage, serials.manage, settings.manage, expenses.manage

**CASHIER permissions (DEV DB):**
products.view, sales.create/discount, repair.create/edit, serials.manage, warranty.view, notification.view

**Permission storage:** `rolePermission` DB table (per-role overrideable via /roles page)  
**Startup seeding:** `PermissionsService.onModuleInit()` seeds defaults if table empty for role  
**Seed script:** `prisma/seed.ts` seeds on fresh DB  
**OWNER always gets ALL permissions** regardless of DB state

---

## Known Limitations / Gaps

| # | Area | Description | Severity |
|---|---|---|---|
| L01 | PROD deploy | No production environment deployed yet | Blocker for launch |
| L02 | Seed users | `admin@fixitpro.com`/`staff@fixitpro.com` not created in current DEV DB | Low (real users exist) |
| L03 | APK PROD build | APK only has DEV build (com.fixitpro.dev, LAN IP baked in) | Blocker for APK release |
| L04 | PWA offline cache | next-pwa not yet implemented (Phase 2B pending) | Medium |
| L05 | /expenses write | `expenses.manage` required for write, but GET is open | Design decision |
| L06 | /settings write | `settings.manage` required for write, but GET is open | Design decision |
| L07 | Branches list | GET /branches open to all authenticated (no `branches.manage` on GET) | Design decision |
| L08 | JWT secret | Default `your_secret_key` in .env — must change before PROD | Critical for PROD |
| L09 | Analytics cashier | CASHIER blocked from analytics (reports.view required) | By design |
| L10 | Transfer spoofing | MANAGER/STOCK_STAFF can approve transfers across branches (no from-branch validation) | Medium risk |
| L11 | SUNMI transfers | Desktop /transfers page exists; /sunmi/transfers also exists | Both work |
| L12 | branchId=null cashier | CASHIER with no branchId assigned can still log in and operate | Edge case |
