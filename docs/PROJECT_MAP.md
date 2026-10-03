# FixITPro — Project Map

> Orientation for new contributors / AI sessions. Updated 2026-10-01.
> For older detail see `CURRENT_SYSTEM_SUMMARY.md` (2026-05) and `docs/ai-handoff/latest.md` (2026-06).

## What it is

Multi-tenant SaaS back-office for phone shops / repair shops: POS, repairs, multi-branch stock,
SIM/package sales with carrier wallets, shifts and cash drawer, double-entry accounting.

```
Clients
 ├─ Web (Next.js 14, app router)      https://fixitpro.in.th   web-app/src/app/(dashboard)
 ├─ SUNMI V2 Pro POS (Capacitor APK)  /sunmi/*                 web-app/android
 ├─ Staff app (Capacitor APK)         /staff/*                 FixITPro-Staff-v2.0.apk
 └─ Public pages                      /(public), /track/*
        │ HttpOnly cookie JWT (Bearer fallback for old APKs)
Backend  NestJS 10 + Prisma 5       /api/v1   backend/src
        │
PostgreSQL                           backend/prisma (schema.prisma, migrations/)

FixITPro Agent (.exe, Windows)       https://localhost:7777  fixitpro-agent/  — opens cash drawer via ESC/POS
```

Unused / legacy: `server/` (old express), `mobile-app/` (Expo prototype).

## Deploy

Push to `main` → `.github/workflows/deploy.yml` → runs `ci.yml` (backend typecheck + unit + e2e on a
Postgres service, web typecheck + lint + vitest) → only if green: SSH to VPS → Coolify rebuild →
backend container runs `prisma migrate deploy` on start (`backend/docker-entrypoint.sh`) →
workflow polls `https://fixitpro.in.th/login` for 200. Pull requests run `ci.yml` too.
Other branches do not deploy. Secrets come from Coolify env vars (`docker-compose.coolify.yml`).

## Backend modules (`backend/src`)

| Area | Modules |
|---|---|
| Sales | `sales` (POS, split payments, refunds, void), `customers` (CRM, loyalty), `debt-payments` |
| Repairs | `repairs` (largest), `chat` (socket.io `/chat`), `warranties`, `claims`, `technicians`, `public-tracking` |
| Partner repair | `partner-relationships`, `partner-repair-transfers`, `partner-repair-quotations` |
| Stock | `products`, `categories`, `stock`, `serials` (IMEI), `branches` (BranchStock + transfer workflow), `purchase-orders`, `suppliers` |
| Cash | `shifts`, `cash-drawer`, `expenses`, `finance` (daily close, branch P&L), `carrier-wallet` |
| Accounting | `journal` (auto double-entry), `accounting-accounts` (CoA), `accounting-reconciliation`, `reconciliation` |
| SaaS | `super-admin/*`, `modules` (+ `ModuleGuard`), `subscription`, `plan-limits`, `tenant`, `tenant-backup` |
| Other | `auth`, `permissions`, `users`, `settings`, `notifications`, `reminders`, `alerts`, `audit-log`, `line-messaging`, `backup`, `data` |

### Request pipeline
- `JwtStrategy` (`auth/strategies/jwt.strategy.ts`) loads the user + permissions on every request → `req.user = { id, role, tenantId, branchId, permissions }`.
- Guards: `JwtAuthGuard`, `TenantActiveGuard` (blocks writes 2 days after tenant expiry), `PermissionGuard` (`@RequirePermission`), `ModuleGuard` (`@RequireModule`), `RolesGuard`. OWNER / SUPER_ADMIN bypass permission + module checks.
- Global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` — **any field the client sends that the DTO does not declare → 400.**

### Tenant isolation — manual, per service
There is no Prisma middleware. Every service must filter by `tenantId` itself, either directly
(`where: { tenantId }`) or through a relation (repairs/sales: `branch: { tenantId }`).
Users with `tenantId = null` (SUPER_ADMIN / legacy) are unfiltered in most services.
When adding a query, copy the pattern of the neighbouring code and add a case to `backend/test/multi-tenant.e2e-spec.ts`.

Shared-vs-tenant tables:
- `RolePermission.tenantId`: `""` = system defaults; a tenant id = that shop's own set (written when its owner
  edits a role, with a `__custom__` marker row). Read through `permissions/role-permissions.ts#loadRolePermissions`.
- `CategoryType.tenantId`: `NULL` = shared type (read-only for shops); otherwise owned by that tenant.
- Rate limiting relies on `app.set('trust proxy', TRUST_PROXY ?? 1)` in `main.ts` to see real client IPs behind Traefik.

Refunds/exchanges: `SalesService.lockAndValidateRefund` locks the sale row and caps refund price per unit at what the
customer paid (line total / qty) and total refunds at the bill total. The UI default comes from `web-app/src/lib/refund.ts`.

## Money on dashboards and reports

`backend/src/common/money/period-money.ts` is the single definition used by `/dashboard/overview`,
`/dashboard/owner-summary`, `/reports/profit` and `/reports/daily-closing`:
POS = bill totals (after discounts) − refunds paid in the period, cost minus refunded items;
repairs = money received (deposit at intake, payment at pickup incl. partial, later debt
payments); packages count their profit; cash/transfer split from payment legs.
Covered by `test/money-consistency.e2e-spec.ts` (all screens must equal shift expected cash).

## Carrier wallet / package sales

- One `CarrierWallet` per (tenantId, carrier) — created on first use. Movement types: OPENING / TOPUP / DEDUCTION / ADJUSTMENT.
- `POST /carrier-wallet/package-sale` — deducts `dealerCost` (default 97% of price) from the wallet; profit = price − deduction. `saleType` PROMO / TOPUP / BUNDLE.
- `POST /carrier-wallet/sim-sale` — SIM card sale, no wallet deduction (`saleType = SIM_SALE`).
- `POST /carrier-wallet/topup`, `GET /balances`, `GET /movements`, `GET /package-sales/list`, `POST /reconcile` (shift close).
- `POST /carrier-wallet/adjust` (OWNER only): set a wallet to an exact balance with a reason, e.g. to clear test top-ups; recorded as an ADJUSTMENT movement.
- Receipt numbers `PKG-YYYYMMDD-####` use the Bangkok date; conflicts retry the transaction.
- Dates in query params are Bangkok calendar days (`YYYY-MM-DD`).
- Shift summary (`GET /shifts/current`, close result) includes `packageSalesByCarrier`.

## Frontend (`web-app/src`)

- Pages: `app/(dashboard)/*` (desktop), `app/sunmi/*` (SUNMI POS), `app/staff/*` (staff app), `app/super-admin/*`, `app/print/*` (printable docs), `app/(public)/*`.
- Data: TanStack Query + axios (`lib/api.ts`), auth/modules from `useAuthStore` (`hasModule`).
- Printing: `lib/printer.ts` (thermal HTML builders), `lib/sunmi-printer.ts`, `lib/cash-drawer.ts` (talks to the agent).
- Offline queue for SUNMI: `lib/offline-queue.ts` + `hooks/use-sync-queue.ts`.

## Running checks

```bash
# backend
cd backend && npm ci && npx prisma generate
npx tsc --noEmit -p tsconfig.json
npx jest --ci                                   # unit (mocked Prisma)
# e2e needs Postgres at postgres:123456@localhost:5432/fixitpro_test (see jest.e2e.config.ts)
npx jest --config jest.e2e.config.ts --runInBand --forceExit

# web
cd web-app && npm ci
npx tsc --noEmit && npx next lint && npx vitest run
```

All suites are expected to pass; CI blocks the deploy otherwise.

## Public repair tracking (`/track`, no login)

- Phone search → status, device, dates and a **masked** ticket (`REP-20261002-••••C3`) only.
- Full ticket number (receipt / QR) → status and history; + matching phone (last 9 digits) → masked
  customer name, outstanding balance (incl. debt payments), photos, QC, warranties.
- Throttled by `public_tracking` only (the auth throttlers are skipped on this controller).
