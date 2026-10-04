-- Read-only production checks, run by the restore-drill workflow.
-- Everything runs in a READ ONLY transaction that is rolled back: Postgres refuses any write.
-- Shops are shown by id only (no names).
BEGIN TRANSACTION READ ONLY;

\echo '--- 1. Package keys ---'
SELECT key FROM "Package" ORDER BY key;

\echo '--- 2. PackageModule rows per package key ---'
SELECT "packageKey", count(*) FROM "PackageModule" GROUP BY 1 ORDER BY 1;

\echo '--- 3. Shops per plan ---'
SELECT plan, count(*) FROM "Tenant" GROUP BY 1 ORDER BY 1;

\echo '--- 4. AppModule keys ---'
SELECT key FROM "AppModule" ORDER BY key;

\echo '--- 5. Per shop: id | plan | status | package has modules | enabled overrides | disabled overrides | created ---'
SELECT t.id, t.plan, t.status,
       (SELECT count(*) FROM "PackageModule" pm WHERE pm."packageKey" = t.plan::text) AS package_modules,
       (SELECT count(*) FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND tm.enabled) AS overrides_on,
       (SELECT count(*) FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND NOT tm.enabled) AS overrides_off,
       t."createdAt"
FROM "Tenant" t ORDER BY t."createdAt";

\echo '--- 6. TenantPlan enum values ---'
SELECT unnest(enum_range(NULL::"TenantPlan"))::text;

ROLLBACK;
