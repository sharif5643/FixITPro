-- Role permissions per tenant.
-- Existing rows become the system-wide defaults (tenantId = ''), so every shop keeps exactly
-- the permissions it has today. A shop gets its own rows only when its owner edits a role.
-- Additive and idempotent: no row is deleted or changed.

ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "RolePermission_role_permission_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_tenantId_role_permission_key" ON "RolePermission"("tenantId", "role", "permission");
CREATE INDEX IF NOT EXISTS "RolePermission_tenantId_role_idx" ON "RolePermission"("tenantId", "role");
