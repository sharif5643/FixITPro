# FixITPro — CHANGELOG

All notable changes to the Premium UX redesign on branch `feature/premium-ui-v2`.

---

## [Unreleased] — Phase A: Premium UX Completion

### Sprint 1.8–1.10 — 2026-07-20 · Commits `c1bbd27` `d3d1c49` `1d1ffc2` `083749c`

#### Changed — Global Dark Mode Completion (40+ files)
- **border-gray sweep** — `border-gray-200/300/400` → `border-slate-200/300` + `dark:border-slate-700/60` across 11 files
- **technicians/[id]** — STATUS_COLOR full dark variants; KpiCard `rounded-2xl` + premium shadow + `dark:bg-[#1E293B]`; all section containers upgraded
- **warranties** — EXPIRED badge bg fixed; modal textarea premium tokens; mobile info tiles `dark:bg-slate-800/60`
- **claims** — 10 containers `rounded-2xl` + `dark:bg-[#1E293B]`; blue/teal info boxes dark variants
- **serials** — filter button containers + section cards dark mode
- **data-tools** — section panels, table containers, result cards dark mode
- **product dialogs** — `cross-branch-availability`, `product-catalog-enroll`, `product-form` border normalization
- **technicians list** — all 8 section containers premium card treatment
- **backup** — info cards + action cards dark mode
- **settings/notifications** — 4 section cards dark mode
- **reports/profit** — stat cards + drill cards dark; hover lift `-translate-y-0.5`; button toggle dark
- **employees** — badge dark:bg + serial input dark:bg
- **debt** — skeleton `dark:bg-slate-700/60`; empty state dark
- **subscription** — 2 section cards dark mode
- **repairs list** — floating view toggle pill dark mode
- **repair-form-dialog** — all 10 bg-white containers: badges, action rows, product search, button toggles, select trigger
- **repair-mobile-list** — card buttons, header rows, filter toggle, skeleton
- **executive-mobile-dashboard** — sticky header, pill badge, 4 section cards, stat mini cards
- **customer-detail-dialog** — 3 stat cells dark mode
- **reminders** — card dark mode + hover lift
- **repairs/[id]** — view toggle pill dark mode
- **payables** — report card dark mode
- **shifts** — emerald chip `dark:bg-transparent dark:text-emerald-400`

#### QA
- TypeScript: 0 errors
- Build: ✓ Compiled successfully

---

### Sprint 1.7 — 2026-07-20 · Commit `a1229d2`

#### Changed — Complete Dark Mode Token Upgrade (46 files)
- **Kanban board** (`repair-kanban-board.tsx`) — fixed context menu popup `dark:bg-[#1E293B]` surface + `dark:border-slate-700/60` quick-action divider
- **Border sweep** — `dark:border-slate-700` → `dark:border-slate-700/60` across 30 files (zero remaining)
- **Skeleton sweep** — `bg-slate-100 dark:bg-slate-800` → `dark:bg-slate-700/60` (21 files — all animate-pulse elements)
- **Surface sweep** — `bg-white dark:bg-slate-800` → `dark:bg-[#1E293B]` (10 files — cards, dialogs, inputs)
- **Form input sweep** — standalone `dark:bg-slate-800` inputs/selects → `dark:bg-[#1E293B]` (branches, cart, payment panel)
- **Hover state sweep** — `dark:hover:bg-slate-800` → `dark:hover:bg-slate-700/40` (12 files — nav, buttons, rows)
- **Design system** — `FiButton` secondary: `dark:bg-slate-700/40 dark:hover:bg-slate-700/60`; outline/ghost: `dark:hover:bg-slate-700/40`
- **Status badges** — DELIVERED neutral badge: `dark:bg-slate-700/40` (muted, not solid)
- **Public pages** — track page Card: `dark:bg-[#1E293B]`

#### QA
- TypeScript: 0 errors
- Dark mode scan: 0 remaining `dark:bg-slate-800` or `dark:border-slate-700` (non-opacity) across entire codebase

---

### Sprint 1.6 — 2026-07-19 · Commit (pending)

#### Changed — Global Dark Mode Pass (40 files)
- **Dashboard pages** — systematic upgrade of all remaining `dark:bg-slate-900` → `dark:bg-[#1E293B]` and `dark:border-slate-800` → `dark:border-slate-700/60` across every `(dashboard)` route
- **Barcode Print** — search dropdown, item list rows, preview area, quantity buttons — full dark mode
- **Audit Logs** — table container, detail modal, comparison table, meta row box, raw JSON block — all upgraded
- **Analytics** — page bg `dark:bg-[#0F172A]`, header bar dark, date pickers dark, skeleton `dark:bg-slate-700/60`, bucket buttons, repair aging list, branch stock items, profit bar
- **Reports** — `daily-closing` detail cards `dark:bg-slate-800/60`, date nav buttons; `payables` table header; `profit` table header
- **Dashboard** — quick-link rows, stat rows hover, `dark:bg-slate-800/30` for subtle row backgrounds
- **Subscription** — contact CTA box, empty state, history table header — all dark
- **Data Tools** — CSV preview table header dark
- **Branches** — all modals and cards upgraded
- **Shared components** — `sidebar`, `header`, `side-nav`, `bottom-tab-bar`, `cash-drawer-widget`, `branch-ranking-table`, `data-table`, `loading-skeleton`, `product-search`, `cart-panel`, `repair-kanban-board`, `fi/input`, login page, public track page — 0 remaining old patterns

#### QA
- TypeScript: 0 errors
- Build: ✓ Compiled successfully (all routes)
- Dark mode pattern scan: 0 remaining `dark:bg-slate-900` or `dark:border-slate-800` instances across entire codebase

---

### Sprint 1.5 — 2026-07-19 · Commit `3596a6f`

#### Changed
- **StatCard** (`components/ui/stat-card.tsx`) — removed `border-l-4`, added `rounded-2xl`, premium shadow, hover lift (`-translate-y-0.5`), `h-10 w-10` icon with `group-hover:scale-105`, top accent strip for urgent state
- **FilterBar** (`components/ui/filter-bar.tsx`) — search input `dark:bg-[#1E293B]` + `focus:ring-2 focus:ring-blue-500/20`
- **MetricCard** (`components/reports/drill-drawer.tsx`) — full dark mode: `dark:bg-[#1E293B]`, `font-extrabold`, hover lift on clickable variant
- **DrillDrawer** (`components/reports/drill-drawer.tsx`) — full dark mode rewrite: `dark:bg-[#1E293B]` header, `dark:bg-[#0F172A]` body, `backdrop-blur-sm` overlay
- **Customers page** (`app/(dashboard)/customers/page.tsx`) — CRM stats `rounded-2xl` + `dark:bg-[#1E293B]` + premium shadow; mobile cards dark mode; VIP/Regular/New tier badges dark
- **Reports Daily-Closing** (`app/(dashboard)/reports/daily-closing/page.tsx`) — SectionHeader icon pills (blue-50/blue-900/30); all tables `rounded-2xl dark:bg-[#1E293B]`; repair buttons hover lift; expense buttons dark mode; skeletons upgraded
- **Shifts page** (`app/(dashboard)/shifts/page.tsx`) — active shift emerald card dark mode; no-shift hero gradient icon (`from-emerald-500 to-teal-600`); global mode notice dark; close result dark; `diffCls` helper full dark mode
- **Settings page** (`app/(dashboard)/settings/page.tsx`) — ToggleSwitch dark dividers; tab nav dark hover + active shadow; BellRing/LINE/Backup link cards `rounded-2xl` + full dark

#### QA
- TypeScript: 0 errors
- Build: ✓ Compiled successfully
- Tests: 1215/1217 (2 pre-existing failures — see BUG.md UI-001)

---

## [Phase 1] — 2026-07-19 · Commit `6f1c23d`

### Added
- **Premium Design System** — token set: `#0F172A` dark bg, `#1E293B` dark surface, `#F8FAFC` light bg, `shadow-[0_2px_8px_rgba(0,0,0,0.06)]` card shadow
- **AppShell** — SideNav (gradient logo, rounded-xl active items, role-based nav), TopBar (FiAvatar, role badge), BottomTabBar (mobile), FiCard/FiButton/FiInput/FiBadge/FiAvatar design-system components

### Changed
- **Login page** — split brand panel + form panel layout, mobile collapse, feature pills
- **Dashboard** — KpiCard V4 (`rounded-2xl`, hover lift, top accent), greeting gradient, section icon pills
- **POS/Sales** — panels premium, no-shift hero gradient icon (emerald→teal)
- **Repairs list** — dark mode page bg, header shadow, search blue focus ring, kanban cards premium

#### QA
- TypeScript: 0 errors
- Build: ✓ Compiled successfully
- Tests: 1215/1217 (2 pre-existing failures)

---

## Previous Releases

### Sprint 1-3 + RC2 + PC-001 — Commit `044032f`
- Super-admin production dashboard and pilot acceptance report
- Daily shift opening and closing checklists
- All core business features complete
