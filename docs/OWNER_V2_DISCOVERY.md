# Owner V2 — Discovery Report

**Date:** 2026-06-07  
**Scope:** Owner-facing system (Desktop dashboard + Sunmi mobile POS)  
**Purpose:** Pre-redesign mapping — routes, APIs, permissions, gaps, recommendations  
**Method:** Read-only static analysis  

---

## Table of Contents

1. [Current Routes](#1-current-routes)
2. [Current Menu Structure](#2-current-menu-structure)
3. [Existing APIs](#3-existing-apis)
4. [Existing Permissions](#4-existing-permissions)
5. [Duplicate Pages](#5-duplicate-pages)
6. [Pages Needing Redesign](#6-pages-needing-redesign)
7. [Recommended Owner V2 Architecture](#7-recommended-owner-v2-architecture)

---

## 1. Current Routes

### 1.1 Desktop Dashboard (`(dashboard)` route group)

| # | Route | File | Title | Owner Only |
|---|---|---|---|---|
| 1 | `/` | `(dashboard)/page.tsx` | แดชบอร์ด | — |
| 2 | `/sales` | `(dashboard)/sales/page.tsx` | ขายสินค้า (POS) | — |
| 3 | `/repairs` | `(dashboard)/repairs/page.tsx` | งานซ่อม | — |
| 4 | `/repairs/[id]` | `(dashboard)/repairs/[id]/page.tsx` | รายละเอียดงานซ่อม | — |
| 5 | `/shifts` | `(dashboard)/shifts/page.tsx` | เปิด/ปิดกะ | — |
| 6 | `/expenses` | `(dashboard)/expenses/page.tsx` | ค่าใช้จ่าย | — |
| 7 | `/products` | `(dashboard)/products/page.tsx` | สินค้า | — |
| 8 | `/categories` | `(dashboard)/categories/page.tsx` | หมวดหมู่สินค้า | — |
| 9 | `/barcode-print` | `(dashboard)/barcode-print/page.tsx` | พิมพ์ Barcode | — |
| 10 | `/transfers` | `(dashboard)/transfers/page.tsx` | โอนสต๊อก | — |
| 11 | `/customers` | `(dashboard)/customers/page.tsx` | ลูกค้า | — |
| 12 | `/customers/[id]` | `(dashboard)/customers/[id]/page.tsx` | รายละเอียดลูกค้า | — |
| 13 | `/debt` | `(dashboard)/debt/page.tsx` | หนี้ค้างชำระ | ✓ |
| 14 | `/warranties` | `(dashboard)/warranties/page.tsx` | การรับประกัน | — |
| 15 | `/claims` | `(dashboard)/claims/page.tsx` | จัดการเคลม | — |
| 16 | `/serials` | `(dashboard)/serials/page.tsx` | Serial / IMEI | — |
| 17 | `/purchase-orders` | `(dashboard)/purchase-orders/page.tsx` | ใบสั่งซื้อ (PO) | — |
| 18 | `/suppliers` | `(dashboard)/suppliers/page.tsx` | ซัพพลายเออร์ | — |
| 19 | `/suppliers/[id]/payables` | `(dashboard)/suppliers/[id]/payables/page.tsx` | รายการเจ้าหนี้ | — |
| 20 | `/reports` | `(dashboard)/reports/page.tsx` | *(redirects → /reports/daily-closing)* | — |
| 21 | `/reports/daily-closing` | `(dashboard)/reports/daily-closing/page.tsx` | รายงานปิดวัน | — |
| 22 | `/reports/profit` | `(dashboard)/reports/profit/page.tsx` | รายงานกำไร | — |
| 23 | `/reports/payables` | `(dashboard)/reports/payables/page.tsx` | รายงานเจ้าหนี้ (AP) | — |
| 24 | `/technicians` | `(dashboard)/technicians/page.tsx` | ประสิทธิภาพช่าง | — |
| 25 | `/technicians/[id]` | `(dashboard)/technicians/[id]/page.tsx` | รายละเอียดช่าง | — |
| 26 | `/analytics` | `(dashboard)/analytics/page.tsx` | วิเคราะห์ข้อมูล | — |
| 27 | `/employees` | `(dashboard)/employees/page.tsx` | พนักงาน | ✓ |
| 28 | `/roles` | `(dashboard)/roles/page.tsx` | สิทธิ์การใช้งาน | ✓ |
| 29 | `/branches` | `(dashboard)/branches/page.tsx` | สาขา (3 tabs) | ✓ |
| 30 | `/notifications` | `(dashboard)/notifications/page.tsx` | การแจ้งเตือน | — |
| 31 | `/audit-logs` | `(dashboard)/audit-logs/page.tsx` | ประวัติกิจกรรม | — |
| 32 | `/data-tools` | `(dashboard)/data-tools/page.tsx` | เครื่องมือข้อมูล | — |
| 33 | `/backup` | `(dashboard)/backup/page.tsx` | Backup ข้อมูล | ✓ |
| 34 | `/settings` | `(dashboard)/settings/page.tsx` | ตั้งค่า | — |
| 35 | `/settings/notifications` | `(dashboard)/settings/notifications/page.tsx` | ตั้งค่าการแจ้งเตือน | — |
| 36 | `/subscription` | `(dashboard)/subscription/page.tsx` | Subscription | ✓ |
| 37 | `/403` | `(dashboard)/403/page.tsx` | Permission Denied | — |
| 38 | `/change-password` | `change-password/page.tsx` | เปลี่ยนรหัสผ่าน | — |
| 39 | `/print/repair/[id]` | `print/repair/[id]/page.tsx` | พิมพ์ใบงานซ่อม | — |
| 40 | `/print/sale/[id]` | `print/sale/[id]/page.tsx` | พิมพ์ใบเสร็จขาย | — |

**Total desktop routes: 40**

### 1.2 Sunmi Mobile POS (`sunmi/` route group)

| # | Route | Title | Available To |
|---|---|---|---|
| 1 | `/sunmi` | เมนูหลัก (grid cards) | All roles |
| 2 | `/sunmi/repair-intake` | รับงานซ่อม | All |
| 3 | `/sunmi/repairs` | งานซ่อมรอดำเนินการ | All |
| 4 | `/sunmi/sales` | ขายสินค้า (POS) | All |
| 5 | `/sunmi/sales/history` | ประวัติการขายวันนี้ | All |
| 6 | `/sunmi/stock` | จัดการสต๊อก | All |
| 7 | `/sunmi/sim-sales` | ขายซิม/แพ็คเกจ | All |
| 8 | `/sunmi/expenses` | บันทึกค่าใช้จ่าย | All |
| 9 | `/sunmi/shifts` | เปิด/ปิดกะ | All |
| 10 | `/sunmi/debt` | เก็บหนี้ค้างชำระ | All |
| 11 | `/sunmi/daily-summary` | สรุปยอดวัน | All |
| 12 | `/sunmi/dashboard` | Owner Dashboard | Owner |
| 13 | `/sunmi/transfers` | คำขอโอนสต๊อก | All |
| 14 | `/sunmi/notifications` | การแจ้งเตือน | All |
| 15 | `/sunmi/printer-test` | ทดสอบเครื่องพิมพ์ | All |

**Total Sunmi routes: 15**

**Grand total routes: 55** (40 desktop + 15 Sunmi)

---

## 2. Current Menu Structure

Source: `src/components/layout/sidebar.tsx`

### 2.1 Desktop Sidebar (w=60, dark slate, fixed left)

```
SHOP BRANDING
  [logo or Smartphone icon]  {shopName}
                             {shopSubtitle}

── (no header) ──────────────────────────────────────────
  LayoutDashboard  แดชบอร์ด                    /
                   perm: null

── การขาย ───────────────────────────────────────────────
  ShoppingCart     ขายสินค้า (POS)             /sales
                   perm: sales.create
  Wrench           งานซ่อม                     /repairs
                   perm: repair.create
  Clock            เปิด/ปิดกะ                  /shifts
                   perm: null
  Receipt          ค่าใช้จ่าย                  /expenses
                   perm: expenses.manage

── สินค้า ───────────────────────────────────────────────
  Package          สินค้า                      /products
                   perm: products.view
  Tag              หมวดหมู่สินค้า              /categories
                   perm: products.view
  Barcode          พิมพ์ Barcode               /barcode-print
                   perm: products.view
  ArrowRightLeft   โอนสต๊อก                    /transfers
                   perm: stock.transfer

─�� ลูกค้า ───────────────────────────────────────────────
  Users            ลูกค้า                      /customers
                   perm: null
  AlertCircle      หนี้ค้างชำระ               /debt
                   perm: null, ownerOnly: true

── รายงาน ───────────────────────────────────────────────
  BookOpen         รายงานปิดวัน                /reports/daily-closing
                   perm: reports.view
  TrendingUp       รายงานกำไร                  /reports/profit
                   perm: reports.view

── การจัดซื้อ ────────────────────────────────────────────
  Building2        ซัพพลายเออร์                /suppliers
                   perm: purchase.create
  ClipboardList    ใบสั่งซื้อ (PO)             /purchase-orders
                   perm: purchase.create
  FileSpreadsheet  รายงานเจ้าหนี้              /reports/payables
                   perm: reports.view

── จัดการ ───────────────────────────────────────────────
  ShieldCheck      Serial / IMEI               /serials
                   perm: serials.manage
  FileWarning      จัดการเคลม                  /claims
                   perm: claims.manage
  BadgeCheck       การรับประกัน                /warranties
                   perm: warranty.view
  BarChart2        ประสิทธิภาพช่าง             /technicians
                   perm: technician.view
  UserCog          พนักงาน                     /employees
                   perm: null, ownerOnly: true
  ShieldAlert      สิทธิ์การใช้งาน             /roles
                   perm: null, ownerOnly: true
  GitBranch        สาขา                        /branches
                   perm: branches.manage, ownerOnly: true
  FolderInput      เครื่องมือข้อมูล            /data-tools
                   perm: data.export
  Bell             การแจ้งเตือน                /notifications
                   perm: notification.view
  Database         Backup ข้อมูล               /backup
                   perm: system.backup, ownerOnly: true
  ScrollText       ประวัติกิจกรรม              /audit-logs
                   perm: audit.view
  Settings         ตั้งค่า                     /settings
                   perm: settings.manage
  CreditCard       Subscription                /subscription
                   perm: null, ownerOnly: true

── footer ───────────────────────────��───────────────────
  "v0.1.0 MVP"
```

**Counts:** 7 sections × avg 4 items = 30 nav items total  
**OWNER-only items:** debt, employees, roles, branches, backup, subscription = **6 items hidden from staff**

### 2.2 Missing from Sidebar (routes exist, no nav link)

| Route | Why it's missing |
|---|---|
| `/analytics` | No sidebar entry — only reachable via dashboard links |
| `/reports/payables` | Is in sidebar under "การจัดซื้อ", but logically belongs in Reports |
| `/suppliers/[id]/payables` | Detail page, reachable from suppliers list only |
| `/customers/[id]` | Detail page, no standalone nav |
| `/repairs/[id]` | Detail page, no standalone nav |
| `/technicians/[id]` | Detail page, no standalone nav |
| `/settings/notifications` | Sub-page, linked from /settings only |
| `/print/*` | Print-only pages, no nav needed |

### 2.3 Sunmi Menu (`/sunmi` grid cards)

The Sunmi home is a 3-column icon grid. Items visible based on role/context.  
No persistent sidebar — each page has back navigation only.

---

## 3. Existing APIs

### 3.1 API Surface Summary

| Domain | Endpoints | Notes |
|---|---|---|
| Auth | 4 | login, logout, me, change-password |
| Dashboard | 1 | overview (large composite response) |
| Sales | 5 | CRUD + void + refund |
| Repairs | 12 | CRUD + parts + images + payment + reverse |
| Customers | 9 | CRUD + notes + tags + debt-summary |
| Products | 11 | CRUD + SKU gen + barcode gen + catalog search + availability |
| Categories | 8 | types CRUD + categories CRUD |
| Stock | 3 | adjust + movements + low-stock |
| Branches | 18 | CRUD + stock + transfers (full lifecycle) + approve/reject/suspend |
| Users | 7 | CRUD + branch assign + toggle + reset-password |
| Permissions | 5 | list + roles + update role + toggle + apply-preset |
| Shifts | 4 | open + close + current + list |
| Expenses | 9 | CRUD + categories + void + summaries |
| Debt Payments | 2 | create + list by repair |
| Purchase Orders | 8 | CRUD + receive + movements + payments |
| Suppliers | 7 | CRUD + aging + statement |
| Serials | 6 | CRUD + bulk + lookup |
| Warranties | 8 | CRUD + stats + void + claim |
| Claims | 6 | CRUD + stats + status update |
| Technicians | 4 | list + leaderboard + detail + daily |
| Reports | 7 | daily + summary + void-log + daily-closing + profit + supplier-aging + owner-dashboard |
| Analytics | 6 | overview + dead-stock + branch-stock + repair-aging + top-profit-products + technician-trends |
| Settings | 2 | get + patch |
| Subscription | 3 | get + patch + renew |
| Notifications | 4 | unread-count + list + read-all + read-one |
| Alerts | 1 | operational |
| Reminders | 4 | active + snooze + settings get/patch |
| Backup | 5 | status + list + create + purge + download |
| Data Tools | 4 | export + template + preview + import |
| Audit Logs | 2 | list + detail |
| Carrier Wallet | 5 | balances + package-sale + topup + movements + package-sales |
| Health | 1 | ping |

**Total: ~179 API endpoints**

### 3.2 Key Composite Responses

**GET /dashboard/overview** — Single large call returning:
- `finance` (revenue/expenses/profit, sales/repair/package breakdown, cash/transfer)
- `repairOps` (open, waiting-approval, waiting-parts, in-progress, overdue, debt)
- `stock` (out-of-stock, low-stock counts)
- `warranties` (active, expiring)
- `notifications` (unread + latest array)
- `topProducts[]` + `topTechnicians[]` + `branchPerformance[]`
- `weeklyRevenue[7]` + `recentActivities[]`
- `currentShift` (is open, opened by)
- `alerts` (9-field operational alert summary)

**GET /reports/daily-closing** — Full daily report:
- `revenue` (POS, repairs, packages, refunds, voided, deposits, outstanding, grand total, by payment method)
- `sales[]`, `voidedSales[]`, `refunds[]`, `repairPayments[]`, `packageSales[]`
- `repairSummary` (new today, by-status counts, overdue)
- `unpaidRepairs[]`
- `shifts[]`

**GET /analytics/overview** — Analytics:
- `deadStockSummary`, `repairAging`, `profitSummary30d`, `branchRisks[]`

---

## 4. Existing Permissions

### 4.1 Role Permission Matrix

Source: `prisma/seed.ts`

| Permission | OWNER | MANAGER | CASHIER | TECHNICIAN | STOCK_STAFF |
|---|---|---|---|---|---|
| products.view | ✓ (all) | ✓ | ✓ | ✓ | ✓ |
| products.create | ✓ | ✓ | — | — | — |
| products.edit | ✓ | ✓ | — | — | — |
| products.view_cost | ✓ | ✓ | — | — | — |
| products.delete | ✓ | — | — | — | — |
| sales.create | ✓ | ✓ | ✓ | — | — |
| sales.discount | ✓ | ✓ | ✓ | — | — |
| sales.refund | ✓ | ✓ | — | — | — |
| repair.create | ✓ | ✓ | ✓ | ✓ | — |
| repair.edit | ✓ | ✓ | ✓ | ✓ | — |
| repair.close | ✓ | ✓ | — | ✓ | — |
| repair.approve_estimate | ✓ | ✓ | — | ✓ | — |
| stock.adjust | ✓ | ✓ | — | — | ✓ |
| stock.transfer | ✓ | ✓ | — | — | ✓ |
| purchase.create | ✓ | ✓ | — | — | ✓ |
| purchase.receive | ✓ | ✓ | — | — | ✓ |
| supplier.pay | ✓ | ✓ | — | — | — |
| reports.view | ✓ | ✓ | — | — | — |
| claims.manage | ✓ | ✓ | — | — | — |
| serials.manage | ✓ | ✓ | ✓ | ✓ | ✓ |
| expenses.manage | ✓ | ✓ | — | — | — |
| warranty.view | ✓ | ✓ | ✓ | ✓ | — |
| warranty.manage | ✓ | ✓ | — | ✓ | — |
| technician.view | ✓ | ✓ | — | ✓ | — |
| data.export | ✓ | ✓ | — | — | — |
| notification.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Not seeded for any role (implicit OWNER only):** |||||
| products.delete | — | — | — | — | — |
| branches.manage | — | — | — | — | — |
| audit.view | — | — | — | — | — |
| notification.manage | — | — | — | — | — |
| data.import | — | — | — | — | — |
| system.backup | — | — | — | — | — |
| settings.manage | — | — | — | — | — |

**Note:** OWNER bypasses all permission checks at the application layer (`hasPermission()` returns `true` for OWNER regardless of stored permissions).

### 4.2 Frontend Permission Enforcement

Source: `src/store/auth.store.ts`, `src/hooks/useBranchContext.ts`

```
Middleware (server)
  → checks cookie presence → redirect to /login if missing
  → no role/page-level check at middleware level

Component level (client)
  → sidebar: items filtered by isVisible(item)
              = item.ownerOnly && !isOwner → hidden
              + item.permission && !hasPerm(item.permission) → hidden
  → page body: individual components check usePermission() or hasPermission()
  → failed API 403 → component shows error or redirect to /403

Branch context (useBranchContext)
  → branchId: staff locked to JWT branchId; OWNER can select or go global
  → isGlobalMode: OWNER with no branch selected → aggregate view
  → isBranchLocked: true for non-OWNER users
  → isSunmi: running on Capacitor (SUNMI device)
```

### 4.3 Controller-Level Guards

| Guard level | Applies to |
|---|---|
| `@Roles('OWNER')` only | `/permissions/*`, `/subscription` |
| `@Roles('OWNER', 'SUPER_ADMIN')` | analytics (some methods) |
| `@RequirePermission(...)` | warranties, claims, analytics, reports, backup, data-tools, technicians, notifications, branches, audit-log |
| `JwtAuthGuard` only (permission in service) | products, repairs, shifts, stock, suppliers, categories, health |
| Super Admin controllers (`@Roles('SUPER_ADMIN')`) | All `/super-admin/*` — fully separate |

---

## 5. Duplicate Pages

### 5.1 Direct Duplicates (same function, two URLs)

| Function | Desktop Route | Sunmi Route | Issue |
|---|---|---|---|
| Repair list | `/repairs` | `/sunmi/repairs` | Different UI, same data — intentional (device split), but feature parity gaps may exist |
| POS sale | `/sales` | `/sunmi/sales` | Same — intentional |
| Shift management | `/shifts` | `/sunmi/shifts` | Same — intentional |
| Expenses | `/expenses` | `/sunmi/expenses` | Same — intentional |
| Debt collection | `/debt` | `/sunmi/debt` | `/debt` is ownerOnly on desktop, `/sunmi/debt` has no role guard — **inconsistency** |
| Daily summary / closing | `/reports/daily-closing` | `/sunmi/daily-summary` | Similar but not identical data — potential divergence |
| Stock transfers | `/transfers` | `/sunmi/transfers` | Same data, different UI — intentional |
| Dashboard overview | `/` | `/sunmi/dashboard` | Both use dashboard/reports API but desktop is richer |

### 5.2 Functional Overlap Within Desktop

| Overlap | Detail |
|---|---|
| `/branches` (Transfers tab) vs `/transfers` | `/branches/page.tsx` has `type Tab = 'branches' \| 'stock' \| 'transfers'` — transfers are accessible from TWO places: `/branches` (ownerOnly) and `/transfers` (all staff with `stock.transfer`) |
| `/reports/payables` vs `/suppliers/[id]/payables` | AP aging list is at `/reports/payables`; per-supplier detail is at `/suppliers/[id]/payables` — logical but the sidebar groups payables under "การจัดซื้อ" not "รายงาน" |
| `/technicians` vs analytics technician trends | `/technicians` shows leaderboard + daily; `/analytics` has a technician-trends section — redundant, not linked |

### 5.3 Unreachable Pages (exist but not navigable)

| Page | How to reach it |
|---|---|
| `/analytics` | No sidebar link — must be linked from dashboard cards/deep-links |
| `/reports/profit` | Sidebar only; no cross-link from daily-closing or dashboard |
| `/settings/notifications` | Only via `/settings` page link, not in sidebar |
| `/barcode-print` | Sidebar; can also be accessed from product list actions |

---

## 6. Pages Needing Redesign

### 6.1 High Priority — Structural Issues

| Page | Current State | Problem |
|---|---|---|
| **`/analytics`** | Fully functional (dead stock, repair aging, profit, branch risk, technician trends) | **No sidebar entry.** Users must reach it via dashboard links. Analytics is one of the most valuable owner pages and is invisible to most users. |
| **`/reports` section** | Only 2 reports in sidebar (daily-closing, profit). 5 more reports exist (summary, void-log, owner-dashboard, supplier-aging, payables) scattered across sections | Reports section is too narrow. Payables is under "การจัดซื้อ" instead of "รายงาน". |
| **`/branches`** | Single page with 3 tabs: Branches, Stock, Transfers (714+ lines) | Tab 3 (Transfers) duplicates standalone `/transfers`. Page is overloaded. `/branches` is ownerOnly but `/transfers` is staff-accessible — confusing split. |
| **`/subscription`** | Read-only status page showing `Subscription` model (old single-row model) | **Architectural mismatch:** Tenant's subscription is managed in `Tenant` + `TenantRenewal` + `TenantPayment` in the multi-tenant system. Owner's `/subscription` reads from the legacy `Subscription` model. Needs reconciliation with the multi-tenant model. |

### 6.2 Medium Priority — UX / Feature Gaps

| Page | Current State | Problem |
|---|---|---|
| **`/`** (Dashboard) | Single large page, all data in one `GET /dashboard/overview` call | Very dense for staff roles. CASHIER sees repair ops and branch performance they can't act on. No role-specific view. |
| **`/settings`** | Long scrollable form with zod validation | Could benefit from tabs (ร้านค้า / ใบเสร็จ / สต๊อก / การพิมพ์) — current version is one long page |
| **`/employees`** | Full CRUD for users — robust but also manages role assignment inline | Role assignment and branch assignment are buried in the edit dialog. No bulk actions. |
| **`/roles`** | Permission matrix toggle table | Works but permissions `products.delete`, `settings.manage`, `branches.manage`, `audit.view`, `system.backup`, `data.import`, `notification.manage` are **never seeded** — they're invisible to staff even though controllers check for them |
| **`/debt`** | ownerOnly on desktop | Staff (cashier/technician) often collect payment in person. The Sunmi `/sunmi/debt` version has no ownerOnly guard. Desktop version should also be accessible to CASHIER. |
| **`/audit-logs`** | Requires `audit.view` permission, which is never seeded | Only OWNER can see it because `audit.view` is defined but never granted to MANAGER |

### 6.3 Low Priority — Minor Gaps

| Page | Issue |
|---|---|
| `/reports/page.tsx` | Just redirects to `/reports/daily-closing` — the `/reports` route itself is wasted |
| `/notifications` | Separate notification page exists, but header has notification bell — duplication of concern |
| `/settings/notifications` | Sub-page at separate URL; only linked from main settings page |
| `/backup` | `system.backup` permission never seeded — only OWNER implicit access works |
| `/data-tools` | `data.import` permission not seeded for any role; import feature silently blocked for MANAGER |
| Sunmi `/sunmi/printer-test` | No functional test — diagnostic page with no real API call |

---

## 7. Recommended Owner V2 Architecture

### 7.1 Navigation Restructure

**Current:** 7 sections, 30 items, flat list  
**Proposed:** 6 sections, 32 items, clearer groupings

```
── (top) ───────────────────────────────────��────────────
  แดชบอร์ด                           /

── การขาย & บริการ ────────────────────────────────────
  ขายสินค้า (POS)                    /sales
  งานซ่อม                            /repairs
  เปิด/ปิดกะ                         /shifts
  ค่าใช้จ่าย                          /expenses
  หนี้ค้างชำระ    [ownerOnly→remove]  /debt  ← open to CASHIER

── สินค้า & สต๊อก ──────────────────────────────��──────
  สินค้า                             /products
  หมวดหมู่สินค้า                     /categories
  โอนสต๊อก                           /transfers
  พิมพ์ Barcode                      /barcode-print

── ลูกค้า & ความเสี่ยง ────────────────────────────────
  ลูกค้า                             /customers
  Serial / IMEI                      /serials
  การรับประกัน                       /warranties
  จัดการเคลม                         /claims

── รายงาน & วิเคราะห์ ────────────────────────────��────
  รายงานปิดวัน                       /reports/daily-closing
  รายงานกำไร                         /reports/profit
  รายงานเจ้าหนี้                     /reports/payables   ← moved here
  วิเคราะห์ข้อมูล    [NEW nav item]   /analytics
  ประสิทธิภาพช่าง                    /technicians

── การจัดซื้อ ───────────────────────────────────────────
  ซัพพลายเออร์                       /suppliers
  ใบสั่งซื้อ (PO)                    /purchase-orders

── จัดการ (owner/admin) ─────────────────────────────────
  พนักงาน            [ownerOnly]      /employees
  สิทธิ์การใช้งาน   [ownerOnly]      /roles
  สาขา               [ownerOnly]      /branches
  ตั้งค่า                             /settings
  Subscription       [ownerOnly]      /subscription
  Backup ข้อมูล     [ownerOnly]      /backup
  ประวัติกิจกรรม                      /audit-logs
  เครื่องมือข้อมูล                    /data-tools
```

Key changes:
- `/analytics` gets a sidebar link (currently invisible)
- `/reports/payables` moves to "รายงาน" section (currently under "การจัดซื้อ")
- "หนี้ค้างชำระ" ownerOnly flag removed (CASHIER needs this)
- "Transfers tab in /branches" consolidated into standalone `/transfers` only

### 7.2 Permission Gaps to Fix

The following permissions are declared in the type system and checked in controllers but **never seeded** — causing silent lockout for MANAGER:

| Permission | Current | Recommended |
|---|---|---|
| `settings.manage` | Not seeded (OWNER only via bypass) | Add to MANAGER |
| `audit.view` | Not seeded | Add to MANAGER |
| `branches.manage` | Not seeded | Add to MANAGER (read-only; create/delete ownerOnly at service level) |
| `data.import` | Not seeded | Add to MANAGER |
| `notification.manage` | Not seeded | Add to MANAGER |
| `products.delete` | Not seeded | Keep OWNER only (intentional) |
| `system.backup` | Not seeded | Keep OWNER only |

### 7.3 Subscription Model Reconciliation

**Current state:**
- `Subscription` model (`src/app/(dashboard)/subscription/page.tsx`) — old single-row subscription table. Shown to OWNER on `/subscription`. Has `SubscriptionRenewal` records.
- `Tenant` + `TenantRenewal` + `TenantPayment` — new multi-tenant model. Managed by Super Admin.

**Problem:** Owner's subscription page reads from `Subscription` (old model), not from `Tenant.plan/status/expiryDate`.

**Recommended for V2:**
- Owner's `/subscription` should read from the `Tenant` record associated with their `tenantId`
- Display: plan name, status, expiryDate, `TenantRenewal` history, `TenantPayment` status
- Replace the old `GET /subscription` with `GET /tenant/my-subscription`

### 7.4 Dashboard Role-Splitting

The current dashboard shows everything to everyone. For V2:

| Role | Recommended default view |
|---|---|
| OWNER | Revenue cards + branch performance + alerts + recent activity |
| MANAGER | Open repairs + stock alerts + staff performance + today's revenue |
| CASHIER | Current shift + today's sales + open repairs needing pickup |
| TECHNICIAN | My assigned repairs + overdue repairs + parts needed |
| STOCK_STAFF | Low stock alerts + pending POs + pending transfers |

API path: `GET /dashboard/overview?view={role}` or separate endpoints per role view.

### 7.5 Consolidate Branches Page

Current `/branches` has three tabs: Branches list, Stock management, Transfers.  
The `Transfers` tab duplicates `/transfers`. For V2:

- `/branches` → Branches list only (CRUD + approve/reject/suspend) — OWNER only
- `/transfers` → Stock transfers — keep separate, accessible to all with `stock.transfer`
- `/branches/[id]/stock` → Branch stock detail (separate deep-link) — OWNER only
- Remove the 3-tab mega-page

### 7.6 Reports Section Expansion

Current sidebar shows 2 reports. Backend has 7 report endpoints. For V2:

| Report | Route | Permission |
|---|---|---|
| รายงานปิดวัน | `/reports/daily-closing` | reports.view |
| รายงานกำไร | `/reports/profit` | reports.view |
| รายงานเจ้าหนี้ (AP) | `/reports/payables` | reports.view |
| บันทึก Void | `/reports/void-log` | reports.view (add to sidebar) |
| สรุปประจำเดือน | `/reports/summary` | reports.view (add to sidebar) |
| รายงานเจ้าของ | `/reports/owner-dashboard` | OWNER only |

### 7.7 Technology Consistency

The system is already consistent:
- **Auth:** HttpOnly cookie (CHB-01), `withCredentials: true` on all Axios calls
- **State:** TanStack React Query for async, Zustand for auth/user session
- **UI:** Radix + Tailwind (shadcn/ui), dark slate theme
- **Forms:** react-hook-form + zod
- **Backend:** NestJS + Prisma 5.x + PostgreSQL
- **Print:** Native Sunmi SDK (Capacitor) for receipts; browser `window.print()` for desktop

No technology changes needed for V2. The stack is mature and consistent.

---

## Summary

| Category | Count |
|---|---|
| Total routes (desktop + Sunmi) | 55 |
| Sidebar nav items | 30 |
| Backend API endpoints | ~179 |
| Defined permissions | 32 |
| Seeded permissions (non-OWNER roles) | 26 |
| Unseeded permissions (silent gaps) | 7 |
| Owner-only desktop routes | 6 |
| Functional duplicates (desktop ↔ Sunmi) | 8 |
| Pages with no sidebar entry | 8 |
| High-priority redesign items | 4 |

**Biggest gaps before V2:**
1. `/analytics` has no sidebar link — most valuable owner insight is buried
2. Permission seeding gaps silently block MANAGER from 7 features
3. Subscription page reads from legacy `Subscription` model, not the multi-tenant `Tenant` model
4. `/branches` is overloaded with 3 concerns in one mega-page
5. Dashboard shows everything to everyone — no role-based view

**No placeholder or coming-soon pages found.** All 55 routes are fully functional with real API integration.
