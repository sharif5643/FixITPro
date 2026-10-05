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

\echo '--- 7. Per shop: modules it ends up WITHOUT (package + overrides, expired overrides ignored) ---'
SELECT t.id, t.plan, string_agg(m.key, ', ' ORDER BY m.key) AS missing
FROM "Tenant" t CROSS JOIN "AppModule" m
WHERE NOT (
  (EXISTS (SELECT 1 FROM "PackageModule" pm WHERE pm."packageKey" = t.plan::text AND pm."moduleKey" = m.key)
   AND NOT EXISTS (SELECT 1 FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND tm."moduleKey" = m.key AND NOT tm.enabled AND (tm."expiresAt" IS NULL OR tm."expiresAt" > now())))
  OR EXISTS (SELECT 1 FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND tm."moduleKey" = m.key AND tm.enabled AND (tm."expiresAt" IS NULL OR tm."expiresAt" > now()))
)
GROUP BY t.id, t.plan, t."createdAt" ORDER BY t."createdAt";

\echo '--- 8. Overrides that have an expiry date ---'
SELECT "tenantId", "moduleKey", enabled, "expiresAt" FROM "TenantModule" WHERE "expiresAt" IS NOT NULL ORDER BY 1, 2;

\echo '--- 9. Shop status and expiry (who the new read-only rule would touch today) ---'
SELECT t.id, t.plan, t.status, t."expiryDate"::date AS expiry,
       CASE WHEN t.status = 'SUSPENDED' THEN 'READ-ONLY (suspended)'
            WHEN t."expiryDate" IS NOT NULL AND now() > t."expiryDate" + interval '7 days' THEN 'READ-ONLY (expired > 7d)'
            WHEN t."expiryDate" IS NOT NULL AND now() > t."expiryDate" + interval '2 days' THEN 'blocked today, saves after change (2d -> 7d)'
            ELSE 'can save' END AS after_change
FROM "Tenant" t ORDER BY t."createdAt";

\echo '--- 10. Package prices (shown on the renewal page) ---'
SELECT key, name, price, "isActive" FROM "Package" ORDER BY "sortOrder", key;

\echo '--- 11. Platform payment settings and pending payments ---'
SELECT count(*) AS platform_rows, max("promptpayId") IS NOT NULL AS has_promptpay FROM "ShopSettings" WHERE "tenantId" IS NULL;
SELECT status, count(*) FROM "TenantPayment" GROUP BY status;

\echo '--- 12. Modules in each package ---'
SELECT "packageKey", string_agg("moduleKey", ', ' ORDER BY "moduleKey") FROM "PackageModule" GROUP BY 1 ORDER BY 1;

\echo '--- 13. Per shop: modules it would LOSE if renewed onto each plan (overrides kept) ---'
WITH eff AS (
  SELECT t.id AS tenant, p.key AS plan, m.key AS module,
    ((EXISTS (SELECT 1 FROM "PackageModule" pm WHERE pm."packageKey" = p.key AND pm."moduleKey" = m.key)
      AND NOT EXISTS (SELECT 1 FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND tm."moduleKey" = m.key AND NOT tm.enabled AND (tm."expiresAt" IS NULL OR tm."expiresAt" > now())))
     OR EXISTS (SELECT 1 FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND tm."moduleKey" = m.key AND tm.enabled AND (tm."expiresAt" IS NULL OR tm."expiresAt" > now()))) AS has
  FROM "Tenant" t CROSS JOIN (SELECT key FROM "Package" WHERE key IN ('LITE','PRO','BUSINESS','PRIVATE')) p CROSS JOIN "AppModule" m
)
SELECT t.id, t.plan AS now_plan, e.plan AS renew_as,
       coalesce(string_agg(e.module, ', ' ORDER BY e.module) FILTER (WHERE cur.has AND NOT e.has), '-') AS would_lose
FROM "Tenant" t
JOIN eff e ON e.tenant = t.id
JOIN eff cur ON cur.tenant = t.id AND cur.plan = t.plan::text AND cur.module = e.module
GROUP BY t.id, t.plan, e.plan, t."createdAt" ORDER BY t."createdAt", e.plan;

ROLLBACK;
