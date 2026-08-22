# Accounting System — Production Rollout Plan
**Phase 4B.5 — 2026-08-21**

---

## Current State

| Component | Status |
|---|---|
| Pilot tenant (`cmsc05do8001u7i29q3p5x6zp`) | ACTIVE — accounting enabled |
| All other tenants (8) | INACTIVE — no COA, no accounting |
| Reconciliation | BLOCKED (timestamp 32h old — needs refresh) |
| Feature flag | PILOT mode: `ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp` |

---

## Safety Controls (NEVER bypass)

1. `ACCOUNTING_CORE_ENABLED=true` + empty `ACCOUNTING_ENABLED_TENANTS` = nobody enabled (fail-closed)
2. Full rollout only via `ACCOUNTING_ENABLED_TENANTS="*"` — explicit sentinel; requires owner approval
3. `ACCOUNTING_ACTIVATION_TIMESTAMP` must be set before enabling any tenant
4. Reconciliation is blocked if timestamp > 24h old; refresh before enabling new tenant
5. COA must be initialized for a tenant before activating accounting
6. Never enable `*` without owner approval

---

## Rollout Stages

### Stage 1 — Pilot Tenant (COMPLETED)
- **Tenant:** `cmsc05do8001u7i29q3p5x6zp` (ริวคอม เซอร์วิซ)
- **Status:** ACTIVE since 2026-08-19
- **Evidence:** 110 JEs, 0 unbalanced, all pilots passed

---

### Stage 2 — COA Initialization for Next Tenant
**Owner approval required before starting.**

1. Select a candidate tenant (ACTIVE status, branches > 0, not EXPIRED/TRIAL)
2. Call `POST /admin/accounting/init-coa/{tenantId}` (or equivalent) to seed 17 standard accounts
3. Verify: 17 AccountingAccounts created, all active, all required codes present
4. Do NOT enable accounting yet

**Candidate tenants (as of 2026-08-21):**

| Tenant ID | Shop Name | Plan | Status | Branches |
|---|---|---|---|---|
| `cldefaulttenant0000000001` | FixITPro Shop | BUSINESS | ACTIVE | 5 |
| `cmqgw3ysh0003f963vgqh32j2` | ร้านชาริฟพีซี@ออล์ | PRIVATE | ACTIVE | 2 |
| `cmqhhn73r001ieml4jy6c5u8e` | Toymobile | BUSINESS | ACTIVE | 2 |
| `cmqm68640000kos0q0wos3zzv` | ร้านชาริฟพีซี&ออล์ | BUSINESS | ACTIVE | 1 |

> ⚠️ Skip expired tenants (`cmqjn635f0003twxdzufhno05`, `cmrr3tpal00246zh9g5vedoaw`) — no active subscription.
> ⚠️ Skip zero-branch tenants (`cmqhhqsq50021eml4edc5gwx2`, `cmqhhyx57002seml4zjqk4t9u`) — no branches to generate transactions.

---

### Stage 3 — Enable One Additional Tenant
**Owner approval required before starting.**

1. Refresh `ACCOUNTING_ACTIVATION_TIMESTAMP` to current UTC
2. Redeploy backend with updated env
3. Add the new tenant ID to `ACCOUNTING_ENABLED_TENANTS`:
   ```
   ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp,{newTenantId}
   ```
4. Verify activation: make a test sale, confirm JEs created

---

### Stage 4 — Observe and Reconcile
**Duration: minimum 48 hours.**

1. Refresh `ACCOUNTING_ACTIVATION_TIMESTAMP` to current UTC before starting
2. Monitor reconciliation endpoint: `POST /admin/accounting/run-reconciliation?tenantId={id}`
3. Check for:
   - Missing SALE_PAYMENT, SALE_COGS journals
   - Missing REPAIR_DEPOSIT, REPAIR_FINAL_PAYMENT journals
   - Unbalanced JEs (should be 0)
   - Cross-tenant contamination (should be 0)
4. Reconciliation auto-recovers missing journals (idempotent)
5. Resolve any ERROR-status items manually

---

### Stage 5 — Gradual Expansion
**Owner approval required for each new tenant.**

- Repeat Stages 2–4 for each additional tenant
- Minimum 48h observation period per tenant before adding another
- Maximum 2 new tenants per deployment cycle

---

### Stage 6 — Full Rollout
**Owner approval required. This is an irreversible production change.**

Only after ALL of the following:
- [ ] All ACTIVE tenants have completed COA initialization
- [ ] All ACTIVE tenants have 48h observation period complete
- [ ] Zero reconciliation errors across all tenants
- [ ] Owner explicitly approves `ACCOUNTING_ENABLED_TENANTS="*"`

**Command (production env change):**
```
ACCOUNTING_ENABLED_TENANTS=*
```

This enables accounting for ALL current and future tenants automatically.

---

## Reconciliation Timestamp Refresh Procedure

The `ACCOUNTING_ACTIVATION_TIMESTAMP` must be within 24 hours for reconciliation to run.

**Before enabling any new tenant:**
```bash
# Set to current UTC time
ACCOUNTING_ACTIVATION_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Update in Coolify env vars, then redeploy
```

**Current value:** `2026-08-19T23:10:50Z` (32h old — needs refresh before next stage)

---

## Rollback Procedure

### Disable accounting for a specific tenant:
1. Remove tenant ID from `ACCOUNTING_ENABLED_TENANTS`
2. Redeploy backend
3. Existing JEs are preserved (immutable) — no data loss
4. New transactions will not generate JEs

### Disable accounting entirely:
1. Set `ACCOUNTING_CORE_ENABLED=false`
2. Redeploy backend
3. Existing JEs preserved
4. All accounting creation stops immediately

---

## COA Initialization Procedure (per tenant)

The `AccountingAccountsService` exposes `initializeCoa(tenantId)` which seeds 17 standard accounts. This is called via:
- Admin UI: Accounting settings for tenant
- API: `POST /admin/accounting/init-coa` (if wired)
- Script: `node init-coa.js {tenantId}` (if created)

Required accounts for activation:
1100 Cash, 1120 Clearing, 1300 Inventory, 1310 Parts Inventory,
2110 Customer Deposit, 4100 Sales Revenue, 4200 Repair Revenue,
5100 COGS, 5200 Repair COGS, 6100 Operating Expense, 6200 Other Expense
