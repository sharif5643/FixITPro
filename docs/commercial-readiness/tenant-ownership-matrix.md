# Tenant Ownership Matrix — FixITPro v1.0.0-RC1

**Date:** 2026-06-01  
**Purpose:** Defines how each entity relates to a tenant, the ownership verification strategy for `findOne` calls, and role-based access expectations. Used to implement CHB-04 correctly.

---

## Critical Architecture Finding

**`Branch` has no direct `tenantId` field.**  
The only direct `Tenant` relationship in the Prisma schema is `User.tenantId → Tenant.id`.  

```
Tenant ←─── User.tenantId          (direct)
Tenant ←── NOT on Branch           (no direct link)
```

This means tenant isolation for branch-owned data (Sales, Repairs, Expenses, Notifications) **cannot** currently be enforced via a `WHERE branch.tenantId = :tenantId` filter — that field does not exist on the Branch model. The previous `getDeviceHistory` C-2 fix used `where.branch = { tenantId }` with `where: any`, which **silently produces no filter** because `Branch.tenantId` is not in the schema.

### Correct isolation paths available today:

| Path | Method | Performance |
|------|--------|-------------|
| `User.tenantId` | Filter by the user's tenant from their JWT | O(1) lookup |
| `repair.branchId / expense.branchId / notification.branchId` | Filter by user's JWT `branchId` | O(1) lookup |
| Tenant → Users → Branches → Data | Multi-hop join (no index chain) | Slow for large sets |

### For full multi-tenant SaaS isolation without schema migration:
Use **user-scoped branchId** from JWT for non-elevated roles. OWNER sees their branches' data only (via user's branchId or an explicit branch list). SUPER_ADMIN sees all.

### Schema migration needed for full isolation (future phase):
Add `tenantId String?` to `Branch` with a back-relation to `Tenant`. Until then, all tenant isolation goes through `user.branchId` from JWT.

---

## Entity Matrix

| # | Entity | Model | Tenant Relationship | Isolation Available? |
|---|--------|-------|---------------------|----------------------|
| 1 | Notification | `Notification` | Via `branchId → Branch` (no tenant on Branch) | Branch-scoped only |
| 2 | Expense | `Expense` | Via `branchId → Branch` (no tenant on Branch) | Branch-scoped only |
| 3 | Customer | `Customer` | **None** — no branchId, no tenantId | ⚠️ Shared across all tenants |
| 4 | SerialNumber | `SerialNumber` | Via `productId → Product` (no tenant on Product) | ⚠️ No isolation path |
| 5 | Claim | `Claim` | Via `customerId → Customer` (no isolation on Customer) | ⚠️ No isolation path |
| 6 | Repair | `Repair` | Via `branchId → Branch` | Branch-scoped only |
| 7 | Sale | `Sale` | Via `branchId → Branch` + `userId → User.tenantId` | Branch + user-tenant |
| 8 | DebtPayment | `RepairAdditionalPayment` | Via `repairId → Repair → branchId` | Branch-scoped (indirect) |
| 9 | Subscription | `Subscription` | **Singleton** — no tenant concept in schema | ⚠️ Platform-wide singleton |
| 10 | StockTransfer | `StockTransfer` | Via `fromBranchId` / `toBranchId` | Branch-scoped only |
| 11 | Warranty | `Warranty` | Via `repairId → Repair → branchId` (indirect) | Branch-scoped (indirect) |
| 12 | User | `User` | `tenantId` — **direct** | ✅ Full tenant isolation |

---

## Per-Module Detail

---

### 1. Notification

**Tenant relationship path:** `Notification.branchId → Branch.id` (Branch has no tenantId)

**Current state:** `findAll()`, `getUnreadCount()`, `markRead()`, `markAllRead()` have no user/branch filter — return all notifications across all tenants.

**Ownership verification strategy:**
```typescript
// Non-elevated (MANAGER, CASHIER, TECHNICIAN, STOCK_STAFF):
WHERE branchId = user.branchId OR branchId IS NULL

// OWNER: sees all notifications in their branches.
// Since Branch has no tenantId, OWNER sees ALL notifications in their branch(es)
// identified by their own branchId. If OWNER has no branchId, sees all null-branchId
// notifications (system-wide).

// SUPER_ADMIN: sees all (no filter applied).
```

**findOne ownership check:** Verify `notification.branchId === user.branchId` or `notification.branchId === null` (system-wide) for non-elevated users.

**OWNER behavior:** Sees notifications for their branch and system-wide (null branchId). If OWNER's JWT has null branchId (multi-branch OWNER), sees all null-branchId notifications + explicit branch selections.

**SUPER_ADMIN behavior:** No filter — sees all notifications across all tenants. Required for platform support.

**Limitation:** Two tenants using the same server would see each other's `branchId: null` system notifications. Full isolation requires adding `tenantId` to `Notification` schema (future migration).

---

### 2. Expense

**Tenant relationship path:** `Expense.branchId → Branch.id` (Branch has no tenantId)

**Current state:** `findOne(id)` returns any expense by ID with no ownership check.

**Ownership verification strategy:**
```typescript
// All roles: verify expense.branchId === user.branchId before returning
// OWNER with null branchId: no restriction (sees all branches — current design)
// SUPER_ADMIN: no restriction
const expense = await prisma.expense.findUnique({ where: { id } });
if (!expense) throw new NotFoundException();
if (!IS_ELEVATED(role) && expense.branchId !== user.branchId) {
  throw new ForbiddenException();
}
```

**OWNER behavior:** Full access — expenses across all branches visible. OWNER has null branchId in JWT by convention.

**SUPER_ADMIN behavior:** Full access across all deployments. No filter applied.

**Limitation:** Same as Notification — two tenants sharing a server see each other's expenses if they somehow share branchIds (unlikely but not impossible without Branch.tenantId).

---

### 3. Customer

**Tenant relationship path:** **NONE** — `Customer` has no `branchId`, no `tenantId`, no indirect link to a tenant.

**Current state:** Customers are a global shared resource. Any authenticated user can retrieve any customer by ID or search all customers.

**Ownership verification strategy:**
```
⚠️ TRUE ISOLATION REQUIRES SCHEMA MIGRATION.

Adding Customer.tenantId is needed for commercial multi-tenant deployment.

Until then, the practical mitigation is:
1. Ensure only authenticated users can access customer data (JwtAuthGuard — already present).
2. Phone uniqueness check (already in place — phone: String? @unique) prevents
   different tenants from creating duplicate customer records by phone.
3. Document this limitation explicitly in the commercial onboarding runbook.

For CHB-04 findOne: no cross-tenant ownership check possible today.
Return 404 for non-existent IDs (already done). No additional scoping.
```

**OWNER behavior:** Full access to all customers (current design — global shared resource).

**SUPER_ADMIN behavior:** Full access. Same as OWNER for current schema.

**Recommended future fix:** Add `tenantId String?` to `Customer`. Migrate existing records with a data migration script.

---

### 4. SerialNumber

**Tenant relationship path:** `SerialNumber.productId → Product.id` — Product has no tenantId or branchId directly.

**Current state:** `findOne(id)` and `lookup(serial)` return any serial by ID/value with no scoping.

**Ownership verification strategy:**
```
⚠️ PARTIAL ISOLATION ONLY.

SerialNumber.productId → Product → no tenant/branch field.
True isolation requires Product.tenantId (schema migration).

Practical mitigation for CHB-04:
- Serial numbers are unique globally (@@unique([serial])). If a serial string
  is known, it can be looked up. Risk: competitor could look up a serial number
  if they know/guess it (e.g., after seeing a device).
- For findOne(id): no ownership check possible. Ensure 404 for non-existent IDs.
- For lookup(serial): returns status and sale date. Low risk — this is needed for
  warranty claims by customers. Consider making public or adding rate-limit.
```

**OWNER behavior:** Full access to all serials (their shop's inventory).

**SUPER_ADMIN behavior:** Full access across all deployments.

**Recommended future fix:** Add `tenantId` to `Product` and filter serials via `product.tenantId`.

---

### 5. Claim

**Tenant relationship path:** `Claim.customerId → Customer` (no tenant) or `Claim.serialNumberId → SerialNumber` (no tenant).

**Current state:** `findOne(id)` returns any claim. No scoping.

**Ownership verification strategy:**
```
⚠️ NO DIRECT ISOLATION PATH.

Claim is linked to Customer and SerialNumber — neither has tenant isolation.
Claims also lack branchId or userId.

Practical mitigation for CHB-04:
- Verify claim.createdById === user.id OR user is elevated.
- This scopes individual technicians/managers to claims they created.
- OWNER and SUPER_ADMIN see all claims.
- Not a full tenant isolation — it's a creator-scoped check.
```

**OWNER behavior:** Full access — sees all claims in the system.

**SUPER_ADMIN behavior:** Full access across all deployments.

**Recommended future fix:** Add `branchId` to `Claim` linking it to the branch where the claim was filed. Filter claims by branchId for non-elevated users.

---

### 6. Repair

**Tenant relationship path:** `Repair.branchId → Branch.id` (Branch has no tenantId)

**Existing handling:** `findAll` is already branch-scoped via role/branchId in the controller. `findOne(id)` performs no ownership check currently.

**Ownership verification strategy:**
```typescript
// Non-elevated: verify repair.branchId === user.branchId
// OWNER (no branchId): no restriction — sees all repairs
// SUPER_ADMIN: no restriction
```

**OWNER behavior:** Full access. OWNER's branchId in JWT is null — they see all branches.

**SUPER_ADMIN behavior:** Full access.

---

### 7. Sale

**Tenant relationship path:** `Sale.branchId → Branch.id` (Branch no tenantId) AND `Sale.userId → User.tenantId` (indirect tenant link via user).

**Strongest isolation available:** `WHERE sale.userId IN (SELECT id FROM User WHERE tenantId = :tenantId)` — but expensive. Practical: use `branchId`.

**Ownership verification strategy:** Same as Repair — branchId filter.

---

### 8. DebtPayment (RepairAdditionalPayment)

**Tenant relationship path:** `RepairAdditionalPayment.repairId → Repair.branchId → Branch.id`

**Ownership verification strategy:** Fetch the associated repair; verify `repair.branchId === user.branchId` for non-elevated.

---

### 9. Subscription

**Tenant relationship path:** `Subscription` is a singleton model — no `tenantId`, no `branchId`. Designed for single-tenant LAN deployment.

**Current state:** PATCH and POST endpoints have NO guards — any authenticated user can modify subscription status.

**Ownership verification strategy:**
```
NOT a multi-tenant entity. In the current architecture, Subscription is
per-deployment (one per server).

For CHB-06 fix: restrict write endpoints to OWNER and SUPER_ADMIN via RolesGuard.
This is a role check, not a tenant check.
```

**OWNER behavior:** Can view and modify their shop's subscription.

**SUPER_ADMIN behavior:** Can modify all subscriptions (platform admin).

**Commercial note:** For true multi-tenant SaaS, Subscription needs a `tenantId` and must be migrated to `TenantRenewal`/`TenantPayment` tables (already exist in schema). This is a future phase item.

---

### 10. StockTransfer

**Tenant relationship path:** `StockTransfer.fromBranchId → Branch.id` (no tenantId on Branch)

**Ownership verification strategy:** Verify `transfer.fromBranchId === user.branchId` or `transfer.toBranchId === user.branchId` for non-elevated. OWNER sees all.

---

### 11. Warranty

**Tenant relationship path:** `Warranty.repairId → Repair.branchId → Branch.id` (indirect) OR `Warranty.saleItemId → SaleItem.saleId → Sale.branchId → Branch.id` (indirect)

**Ownership verification strategy:** Branch-scoped via the linked Repair or Sale's branchId. Currently no direct filter — findAll does not scope by branch.

---

## Implementation Strategy for CHB-04

Given the schema constraints, CHB-04 applies **three tiers** of ownership verification:

### Tier 1 — Branch-scoped entities (implemented now)
For entities with a direct `branchId` field: `Expense`, `Notification`, `Repair`, `Sale`.

```typescript
// Service method pattern:
async findOne(id: string, userBranchId: string | null, isElevated: boolean) {
  const record = await this.prisma.entity.findUnique({ where: { id } });
  if (!record) throw new NotFoundException();
  if (!isElevated && record.branchId !== userBranchId) throw new ForbiddenException();
  return record;
}
```

### Tier 2 — Creator-scoped entities (implemented now, pending schema migration)
For entities with `createdById` but no branchId: `Claim`.

```typescript
async findOne(id: string, userId: string, isElevated: boolean) {
  const record = await this.prisma.claim.findUnique({ where: { id } });
  if (!record) throw new NotFoundException();
  if (!isElevated && record.createdById !== userId) throw new ForbiddenException();
  return record;
}
```

### Tier 3 — No isolation path today (documented, schema migration required)
`Customer`, `SerialNumber`. These entities are global — any authenticated user can access them by ID. **Document this in the commercial onboarding runbook as a known limitation.**

---

## Permission Guard Matrix (CHB-06)

| Controller | Endpoint | Current | Required |
|------------|----------|---------|----------|
| NotificationsController | `PATCH /read-all` | JwtAuthGuard | `notification.manage` |
| NotificationsController | `PATCH /:id/read` | JwtAuthGuard | `notification.view` |
| CustomersController | `POST /` | JwtAuthGuard | `sales.create` (customer creation = sales context) |
| CustomersController | `PUT /:id` | JwtAuthGuard | `sales.create` |
| SerialsController | `POST /` | JwtAuthGuard | `serials.manage` |
| SerialsController | `POST /bulk` | JwtAuthGuard | `serials.manage` |
| SerialsController | `PATCH /:id` | JwtAuthGuard | `serials.manage` |
| ClaimsController | `POST /` | JwtAuthGuard | `claims.manage` |
| ClaimsController | `PATCH /:id/status` | JwtAuthGuard | `claims.manage` |
| ClaimsController | `PATCH /:id` | JwtAuthGuard | `claims.manage` |
| DebtPaymentsController | `POST /` | JwtAuthGuard | `repair.close` |
| SubscriptionController | `PATCH /` | JwtAuthGuard | OWNER/SUPER_ADMIN role only |
| SubscriptionController | `POST /renew` | JwtAuthGuard | OWNER/SUPER_ADMIN role only |

---

## Summary

| Entity | Isolation Type | CHB-04 Action | CHB-06 Action |
|--------|---------------|---------------|---------------|
| Notification | Branch-scoped | Add branchId check in findOne | Add `notification.view` to markRead |
| Expense | Branch-scoped | Add branchId check in findOne | (already guarded in service) |
| Customer | ⚠️ None | Document limitation — no check possible | Add `sales.create` to write endpoints |
| SerialNumber | ⚠️ None | Document limitation — no check possible | Add `serials.manage` to write endpoints |
| Claim | Creator-scoped | Add createdById check in findOne | Add `claims.manage` to write endpoints |
| DebtPayment | Branch (indirect) | Verify via linked repair's branchId | Add `repair.close` to POST |
| Subscription | Singleton | N/A — not multi-tenant | Add OWNER/SUPER_ADMIN role guard |
