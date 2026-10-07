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

\echo '--- 19. Owner branches stored under another shop: who they belong to and what uses them ---'
SELECT u."tenantId" AS owner_shop, t."shopName" AS owner_shop_name, b.id AS branch, b.name, b."tenantId" AS branch_shop,
       b."isDefault", b."createdAt"::date AS created, t."createdAt"::date AS shop_created
FROM "User" u JOIN "Branch" b ON b.id = u."branchId" JOIN "Tenant" t ON t.id = u."tenantId"
WHERE b."tenantId" IS DISTINCT FROM u."tenantId";
SELECT u.role, u."tenantId", u."branchId" FROM "User" u
WHERE u."branchId" IN (SELECT b.id FROM "User" o JOIN "Branch" b ON b.id = o."branchId" WHERE b."tenantId" IS DISTINCT FROM o."tenantId");
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'branchId' ORDER BY table_name LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "branchId" IN (SELECT b.id FROM "User" o JOIN "Branch" b ON b.id = o."branchId" WHERE b."tenantId" IS DISTINCT FROM o."tenantId")', r.table_name) INTO n;
    IF n > 0 THEN RAISE NOTICE 'rows on misfiled branches: % = %', r.table_name, n; END IF;
  END LOOP;
END $$;
\echo '19b. Sales on those branches by the shop of the seller'
SELECT s."branchId", u."tenantId" AS seller_shop, count(*) FROM "Sale" s JOIN "User" u ON u.id = s."userId"
WHERE s."branchId" IN (SELECT b.id FROM "User" o JOIN "Branch" b ON b.id = o."branchId" WHERE b."tenantId" IS DISTINCT FROM o."tenantId")
GROUP BY 1, 2;
\echo '19c. Branches of the default shop'
SELECT id, name, "isDefault", "createdAt"::date FROM "Branch" WHERE "tenantId" = 'cldefaulttenant0000000001' ORDER BY "createdAt";

\echo '19d. Branches of the three shops, and the repair on a misfiled branch'
SELECT b."tenantId", b.id, b.name, b."isDefault", b."isActive", b.status, b."createdAt"::date,
       (SELECT count(*) FROM "Sale" s WHERE s."branchId" = b.id) AS sales,
       (SELECT count(*) FROM "BranchStock" bs WHERE bs."branchId" = b.id) AS stock_rows,
       (SELECT count(*) FROM "User" u WHERE u."branchId" = b.id) AS users
FROM "Branch" b WHERE b."tenantId" IN ('cmqhhqsq50021eml4edc5gwx2','cmqhhn73r001ieml4jy6c5u8e','cmqhhyx57002seml4zjqk4t9u') ORDER BY 1, b."createdAt";
SELECT r."branchId", c."tenantId" AS customer_shop, r.status, r."receivedAt"::date FROM "Repair" r LEFT JOIN "Customer" c ON c.id = r."customerId"
WHERE r."branchId" IN ('cmqhhqsq70022eml4abkjnf8b','cmqhhn73t001jeml4fmikfb0y','cmqhhyx5a002teml4w9butbi8');
SELECT t.id, t.plan, t.status FROM "Tenant" t WHERE t.id IN ('cmqhhqsq50021eml4edc5gwx2','cmqhhn73r001ieml4jy6c5u8e','cmqhhyx57002seml4zjqk4t9u');

-- 20. Accounting: are the books complete? (the reconciliation safety net has been blocked)
\echo '20a. Journal entries per shop'
SELECT j."tenantId", count(*) AS entries, min(j."createdAt")::date AS first_entry, max(j."createdAt") AS last_entry
FROM "JournalEntry" j GROUP BY 1 ORDER BY 2 DESC;
\echo '20b. Journal entries by source in the last 30 days'
SELECT j."tenantId", j."sourceType", count(*) FROM "JournalEntry" j
WHERE j."createdAt" > now() - interval '30 days' GROUP BY 1, 2 ORDER BY 1, 3 DESC;
\echo '20c. Sale payments since the shop''s first journal entry: all / with an entry'
WITH first AS (SELECT "tenantId", min("createdAt") AS t0 FROM "JournalEntry" GROUP BY 1)
SELECT b."tenantId", count(*) AS payments,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."sourceType" = 'SALE_PAYMENT' AND j."sourceId" = sp.id)) AS with_entry
FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" JOIN "Branch" b ON b.id = s."branchId" JOIN first f ON f."tenantId" = b."tenantId"
WHERE s."createdAt" >= f.t0 AND s.status::text <> 'VOIDED' GROUP BY 1;
\echo '20d. Sale payments without an entry, by day'
WITH first AS (SELECT "tenantId", min("createdAt") AS t0 FROM "JournalEntry" GROUP BY 1)
SELECT b."tenantId", s."createdAt"::date AS day, count(*) AS missing, sum(sp.amount) AS amount
FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" JOIN "Branch" b ON b.id = s."branchId" JOIN first f ON f."tenantId" = b."tenantId"
WHERE s."createdAt" >= f.t0 AND s.status::text <> 'VOIDED'
  AND NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."sourceType" = 'SALE_PAYMENT' AND j."sourceId" = sp.id)
GROUP BY 1, 2 ORDER BY 1, 2;
\echo '20e. Expenses since the shop''s first journal entry: all / with an entry'
WITH first AS (SELECT "tenantId", min("createdAt") AS t0 FROM "JournalEntry" GROUP BY 1)
SELECT b."tenantId", count(*) AS expenses,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."sourceType" = 'EXPENSE_PAYMENT' AND j."sourceId" = e.id)) AS with_entry
FROM "Expense" e JOIN "Branch" b ON b.id = e."branchId" JOIN first f ON f."tenantId" = b."tenantId"
WHERE e."createdAt" >= f.t0 AND e."voidedAt" IS NULL GROUP BY 1;

ROLLBACK;
