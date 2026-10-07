-- Cashiers take payment for repairs and hand devices back (permission repair.close), which also
-- covers later payments, debt payments and the warranty issued at handover.
-- Adds the permission to the system-wide CASHIER defaults only (tenantId ''), and only where
-- those defaults exist. Shops that set their own cashier permissions keep them exactly as they
-- are. Insert only: nothing is updated or deleted.
INSERT INTO "RolePermission" ("id", "role", "permission", "tenantId")
SELECT 'rp_cashier_repair_close_default', 'CASHIER', 'repair.close', ''
WHERE EXISTS (SELECT 1 FROM "RolePermission" WHERE "tenantId" = '' AND "role" = 'CASHIER')
ON CONFLICT ("tenantId", "role", "permission") DO NOTHING;
