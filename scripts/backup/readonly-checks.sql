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

\echo '--- 14. After deploy: new migrations and columns ---'
SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations"
 WHERE migration_name IN ('20261004000005_renewal_payments','20261005000001_package_sale_credit') ORDER BY 1;
SELECT count(*) AS migrations_total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SELECT count(*) AS package_sale_debt_payments FROM "PackageSaleDebtPayment";
SELECT indexname FROM pg_indexes WHERE indexname = 'PackageSale_one_open_debt_per_phone';

\echo '--- 15. package_sales for every package: per shop, has it now / switched off by override / gains it ---'
SELECT t.id, t.plan, t.status,
  EXISTS (SELECT 1 FROM "PackageModule" pm WHERE pm."packageKey" = t.plan::text AND pm."moduleKey" = 'package_sales') AS in_package,
  (SELECT tm.enabled FROM "TenantModule" tm WHERE tm."tenantId" = t.id AND tm."moduleKey" = 'package_sales' AND (tm."expiresAt" IS NULL OR tm."expiresAt" > now())) AS override
FROM "Tenant" t ORDER BY t."createdAt";
SELECT key, "isActive" FROM "AppModule" WHERE key = 'package_sales';

\echo '--- 16. App vs web data shape (counts only) ---'
\echo '16a. Branches per shop and owners without a fixed branch'
SELECT t.id, t.plan,
  (SELECT count(*) FROM "Branch" b WHERE b."tenantId" = t.id AND b."isActive") AS branches,
  (SELECT count(*) FROM "User" u WHERE u."tenantId" = t.id AND u.role = 'OWNER' AND u."branchId" IS NULL) AS owners_no_branch
FROM "Tenant" t ORDER BY t."createdAt";
\echo '16b. Sales without a branch in shops that have branches (last 180 days)'
SELECT u."tenantId", count(*) AS sales_no_branch, min(s."createdAt")::date AS first, max(s."createdAt")::date AS last
FROM "Sale" s JOIN "User" u ON u.id = s."userId"
WHERE s."branchId" IS NULL AND s."createdAt" > now() - interval '180 days'
  AND EXISTS (SELECT 1 FROM "Branch" b WHERE b."tenantId" = u."tenantId")
GROUP BY 1;
\echo '16c. Repairs: accessories stored as ["..."], conditions in note, deposit method'
SELECT count(*) FILTER (WHERE accessories LIKE '[%') AS accessories_json,
       count(*) FILTER (WHERE accessories IS NOT NULL AND accessories NOT LIKE '[%') AS accessories_text,
       count(*) FILTER (WHERE note LIKE 'สภาพ:%') AS conditions_in_note,
       count(*) FILTER (WHERE deposit > 0) AS with_deposit,
       count(*) FILTER (WHERE deposit > 0 AND "depositPaymentMethod" = 'CASH') AS deposit_cash,
       count(*) FILTER (WHERE deposit > 0 AND "depositPaymentMethod" <> 'CASH') AS deposit_other
FROM "Repair";
\echo '16d. Delivered repairs with / without a warranty record (last 180 days)'
SELECT count(*) AS delivered,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Warranty" w WHERE w."repairId" = r.id)) AS with_warranty,
       count(*) FILTER (WHERE r."paymentStatus" = 'PARTIAL') AS partial
FROM "Repair" r WHERE r."deliveredAt" > now() - interval '180 days';
\echo '16e. Repairs stuck waiting for QC, and products that need IMEI at sale'
SELECT count(*) AS qc_pending FROM "Repair" WHERE status = 'QC_PENDING';
SELECT count(*) AS serial_products FROM "Product" WHERE "hasSerial" AND "isActive";
\echo '16f. Shifts vs cash-drawer sessions (last 90 days)'
SELECT (SELECT count(*) FROM "Shift" WHERE "openedAt" > now() - interval '90 days') AS shifts,
       (SELECT count(*) FROM "CashDrawerSession" WHERE "openedAt" > now() - interval '90 days') AS drawer_sessions;

\echo '--- 17. After PR #32: push devices table ---'
SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations" WHERE migration_name = '20261005000003_push_devices';
SELECT count(*) AS push_devices FROM "PushDevice";
SELECT count(*) AS migrations_total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;

\echo '--- 18. Staff whose branch is not an active branch of their own shop (shown as a raw id) ---'
SELECT u.role, u."tenantId", u."branchId", b."tenantId" AS branch_tenant, b."isActive", b.status, b.name IS NOT NULL AS has_name
FROM "User" u LEFT JOIN "Branch" b ON b.id = u."branchId"
WHERE u."branchId" IS NOT NULL
  AND (b.id IS NULL OR b."tenantId" IS DISTINCT FROM u."tenantId" OR NOT b."isActive" OR b.status <> 'ACTIVE');
SELECT b.id, b."tenantId", b."isActive", b.status FROM "Branch" b WHERE b.id = 'cmqhppo2c0014jwr0t9ul5314';

ROLLBACK;
