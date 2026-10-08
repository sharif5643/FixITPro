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
\echo '20f. Activity since the shop''s first journal entry: repairs paid / with an entry, deposits / with an entry, SIM sales'
WITH first AS (SELECT "tenantId", min("createdAt") AS t0 FROM "JournalEntry" GROUP BY 1)
SELECT f."tenantId",
  (SELECT count(*) FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = f."tenantId" AND r."updatedAt" >= f.t0 AND r."paidAmount" > 0) AS repairs_paid,
  (SELECT count(*) FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = f."tenantId" AND r."updatedAt" >= f.t0 AND r."paidAmount" > 0
     AND EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."sourceType" = 'REPAIR_FINAL_PAYMENT' AND j."sourceId" = r.id)) AS with_entry,
  (SELECT count(*) FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = f."tenantId" AND r."receivedAt" >= f.t0 AND r.deposit > 0) AS deposits,
  (SELECT count(*) FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = f."tenantId" AND r."receivedAt" >= f.t0 AND r.deposit > 0
     AND EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."sourceType" = 'REPAIR_DEPOSIT' AND j."sourceId" = r.id)) AS deposit_entries,
  (SELECT count(*) FROM "PackageSale" p WHERE p."tenantId" = f."tenantId" AND p."createdAt" >= f.t0) AS sim_sales,
  (SELECT count(*) FROM "Expense" e JOIN "Branch" b ON b.id = e."branchId" WHERE b."tenantId" = f."tenantId" AND e."createdAt" >= f.t0) AS expenses
FROM first f;

-- 21. Money: do the stored figures add up? (counts and sums per shop, no customer data)
\echo '21a. Sales whose total does not match subtotal - discount, or whose items do not add up to the subtotal'
SELECT b."tenantId", count(*) AS sales,
  count(*) FILTER (WHERE s.total <> s.subtotal - s.discount) AS total_mismatch,
  count(*) FILTER (WHERE abs(s.subtotal - coalesce((SELECT sum(i.total) FROM "SaleItem" i WHERE i."saleId" = s.id), 0)) > 0.01) AS items_mismatch,
  count(*) FILTER (WHERE s.total < 0 OR s.subtotal < 0 OR s.discount < 0) AS negative
FROM "Sale" s LEFT JOIN "Branch" b ON b.id = s."branchId" WHERE s.status::text <> 'VOIDED' GROUP BY 1 ORDER BY 2 DESC;
\echo '21b. Sales whose payments do not add up to the total (non-voided)'
SELECT b."tenantId",
  count(*) FILTER (WHERE p.n = 0) AS no_payment_rows,
  count(*) FILTER (WHERE p.n > 0 AND abs(p.paid - s.total) > 0.01) AS paid_differs,
  sum(p.paid - s.total) FILTER (WHERE p.n > 0 AND abs(p.paid - s.total) > 0.01) AS diff_sum,
  count(*) FILTER (WHERE s."paymentMethod"::text = 'CASH' AND abs((s."amountPaid" - s.change) - s.total) > 0.01) AS cash_change_mismatch
FROM "Sale" s LEFT JOIN "Branch" b ON b.id = s."branchId"
CROSS JOIN LATERAL (SELECT count(*) AS n, coalesce(sum(sp.amount), 0) AS paid FROM "SalePayment" sp WHERE sp."saleId" = s.id) p
WHERE s.status::text <> 'VOIDED' GROUP BY 1 ORDER BY 1;
\echo '21c. Sale payment problems by day (last 60 days): sales with payments that differ from the total'
SELECT b."tenantId", s."createdAt"::date AS day, count(*) AS sales, sum(p.paid - s.total) AS diff
FROM "Sale" s LEFT JOIN "Branch" b ON b.id = s."branchId"
CROSS JOIN LATERAL (SELECT count(*) AS n, coalesce(sum(sp.amount), 0) AS paid FROM "SalePayment" sp WHERE sp."saleId" = s.id) p
WHERE s.status::text <> 'VOIDED' AND p.n > 0 AND abs(p.paid - s.total) > 0.01 AND s."createdAt" > now() - interval '60 days'
GROUP BY 1, 2 ORDER BY 1, 2;
\echo '21d. Refunds: more refunded than sold, item quantities, refund total vs its items, status'
SELECT b."tenantId",
  count(DISTINCT s.id) AS sales_with_refund,
  count(DISTINCT s.id) FILTER (WHERE r.refunded > s.total + 0.01) AS refunded_more_than_total,
  count(DISTINCT s.id) FILTER (WHERE s.status::text = 'COMPLETED') AS still_completed,
  count(DISTINCT s.id) FILTER (WHERE s.status::text = 'REFUNDED' AND r.refunded < s.total - 0.01) AS refunded_status_but_partial,
  (SELECT count(*) FROM "SaleItem" i JOIN "Sale" s2 ON s2.id = i."saleId" LEFT JOIN "Branch" b2 ON b2.id = s2."branchId"
     WHERE b2."tenantId" IS NOT DISTINCT FROM b."tenantId" AND (i."refundedQty" > i.quantity OR i."refundedQty" < 0)) AS item_over_refunded,
  (SELECT count(*) FROM "SaleRefund" rf JOIN "Sale" s3 ON s3.id = rf."saleId" LEFT JOIN "Branch" b3 ON b3.id = s3."branchId"
     WHERE b3."tenantId" IS NOT DISTINCT FROM b."tenantId"
       AND abs(rf."totalRefund" - coalesce((SELECT sum(ri.total) FROM "SaleRefundItem" ri WHERE ri."refundId" = rf.id), 0)) > 0.01) AS refund_vs_items
FROM "Sale" s LEFT JOIN "Branch" b ON b.id = s."branchId"
JOIN LATERAL (SELECT sum(rf."totalRefund") AS refunded FROM "SaleRefund" rf WHERE rf."saleId" = s.id) r ON r.refunded IS NOT NULL
GROUP BY 1 ORDER BY 1;
\echo '21e. Repairs: payment status vs amounts, deposits, reversals'
SELECT b."tenantId", count(*) AS repairs,
  count(*) FILTER (WHERE r."paymentStatus"::text = 'PAID' AND coalesce(r."paidAmount", 0) = 0 AND r.deposit = 0 AND coalesce(r."finalCost", 0) > 0) AS paid_without_amount,
  count(*) FILTER (WHERE r."paymentStatus"::text = 'PENDING' AND coalesce(r."paidAmount", 0) > 0) AS pending_with_amount,
  count(*) FILTER (WHERE r."finalCost" IS NOT NULL AND coalesce(r."paidAmount", 0) + r.deposit
                    > r."finalCost" - coalesce(r.discount, 0) + coalesce((SELECT sum(a.amount) FROM "RepairAdditionalPayment" a WHERE a."repairId" = r.id), 0) + 0.01) AS paid_more_than_cost,
  count(*) FILTER (WHERE r.deposit < 0 OR coalesce(r."paidAmount", 0) < 0 OR coalesce(r."finalCost", 0) < 0) AS negative,
  count(*) FILTER (WHERE r.status::text = 'DELIVERED' AND r."paymentStatus"::text <> 'PAID') AS delivered_not_paid,
  (SELECT count(*) FROM "RepairPaymentReversal" v JOIN "Repair" r2 ON r2.id = v."repairId" LEFT JOIN "Branch" b2 ON b2.id = r2."branchId"
     WHERE b2."tenantId" IS NOT DISTINCT FROM b."tenantId") AS reversals
FROM "Repair" r LEFT JOIN "Branch" b ON b.id = r."branchId" GROUP BY 1 ORDER BY 2 DESC;
\echo '21f. Closed shifts (last 90 days): counted vs expected cash as recorded at close'
SELECT b."tenantId", count(*) AS closed,
  count(*) FILTER (WHERE abs((a."afterData"->>'difference')::numeric) >= 1) AS with_difference,
  sum((a."afterData"->>'difference')::numeric) FILTER (WHERE (a."afterData"->>'difference')::numeric < 0) AS short_total,
  sum((a."afterData"->>'difference')::numeric) FILTER (WHERE (a."afterData"->>'difference')::numeric > 0) AS over_total,
  count(*) FILTER (WHERE a.id IS NULL) AS no_close_record
FROM "Shift" sh LEFT JOIN "Branch" b ON b.id = sh."branchId"
LEFT JOIN LATERAL (SELECT al.id, al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
WHERE sh."closedAt" > now() - interval '90 days' GROUP BY 1 ORDER BY 1;
\echo '21g. Shifts still open: per shop, and how long'
SELECT b."tenantId", count(*) AS open_shifts, count(*) FILTER (WHERE sh."openedAt" < now() - interval '24 hours') AS open_over_24h,
  min(sh."openedAt")::date AS oldest
FROM "Shift" sh LEFT JOIN "Branch" b ON b.id = sh."branchId" WHERE sh."isActive" GROUP BY 1 ORDER BY 1;
\echo '21h. Money taken outside any shift (last 60 days): sales, repair payments, expenses'
SELECT b."tenantId",
  count(*) FILTER (WHERE x.kind = 'sale') AS sales, sum(x.amt) FILTER (WHERE x.kind = 'sale') AS sales_amt,
  count(*) FILTER (WHERE x.kind = 'repair') AS repairs, sum(x.amt) FILTER (WHERE x.kind = 'repair') AS repairs_amt,
  count(*) FILTER (WHERE x.kind = 'expense') AS expenses, sum(x.amt) FILTER (WHERE x.kind = 'expense') AS expenses_amt
FROM (
  SELECT 'sale' AS kind, s."branchId", s.total AS amt FROM "Sale" s
    WHERE s."shiftId" IS NULL AND s.status::text <> 'VOIDED' AND s."createdAt" > now() - interval '60 days'
  UNION ALL SELECT 'repair', r."branchId", r."paidAmount" FROM "Repair" r
    WHERE r."paymentShiftId" IS NULL AND coalesce(r."paidAmount", 0) > 0 AND r."paidAt" > now() - interval '60 days'
  UNION ALL SELECT 'expense', e."branchId", e.amount FROM "Expense" e
    WHERE e."shiftId" IS NULL AND e."voidedAt" IS NULL AND e."createdAt" > now() - interval '60 days'
) x LEFT JOIN "Branch" b ON b.id = x."branchId" GROUP BY 1 ORDER BY 1;
\echo '21i. SIM wallets: balance vs last movement, broken movement chain, negative balance'
SELECT w."tenantId", w.carrier, w.balance, m.last_after,
  (w.balance <> coalesce(m.last_after, w.balance)) AS balance_differs,
  (SELECT count(*) FROM "CarrierWalletMovement" mv WHERE mv."walletId" = w.id
     AND NOT CASE mv.type::text
       WHEN 'TOPUP' THEN mv."balanceAfter" = mv."balanceBefore" + mv.amount
       WHEN 'DEDUCTION' THEN mv."balanceAfter" = mv."balanceBefore" - mv.amount
       WHEN 'ADJUSTMENT' THEN abs(mv."balanceAfter" - mv."balanceBefore") = mv.amount
       ELSE mv."balanceAfter" = mv.amount END) AS bad_steps,
  (w.balance < 0) AS negative,
  (SELECT count(*) FROM (SELECT mv."balanceBefore", lag(mv."balanceAfter") OVER (ORDER BY mv."createdAt", mv.id) AS prev
     FROM "CarrierWalletMovement" mv WHERE mv."walletId" = w.id) q WHERE q.prev IS NOT NULL AND q.prev <> q."balanceBefore") AS chain_breaks
FROM "CarrierWallet" w
LEFT JOIN LATERAL (SELECT mv."balanceAfter" AS last_after FROM "CarrierWalletMovement" mv WHERE mv."walletId" = w.id ORDER BY mv."createdAt" DESC, mv.id DESC LIMIT 1) m ON true
ORDER BY 1, 2;
\echo '21j. SIM sales: profit, amount due vs debt payments, settled flag'
SELECT p."tenantId", count(*) AS sim_sales,
  count(*) FILTER (WHERE abs(p.profit - (p."packageAmount" - p."walletDeduction")) > 0.01) AS profit_mismatch,
  count(*) FILTER (WHERE p."amountDue" > 0) AS on_credit,
  count(*) FILTER (WHERE p."amountDue" > 0 AND d.paid > p."amountDue" + 0.01) AS overpaid_debt,
  count(*) FILTER (WHERE p."amountDue" > 0 AND p."settledAt" IS NOT NULL AND d.paid < p."amountDue" - 0.01) AS settled_but_short,
  count(*) FILTER (WHERE p."amountDue" > 0 AND p."settledAt" IS NULL AND d.paid >= p."amountDue" - 0.01) AS paid_not_marked,
  sum(p."amountDue" - d.paid) FILTER (WHERE p."amountDue" > 0 AND p."settledAt" IS NULL) AS outstanding
FROM "PackageSale" p
CROSS JOIN LATERAL (SELECT coalesce(sum(dp.amount), 0) AS paid FROM "PackageSaleDebtPayment" dp WHERE dp."packageSaleId" = p.id) d
GROUP BY 1 ORDER BY 1;
\echo '21k. Cash drawer sessions: expected vs movements, difference vs counted, sessions left open'
SELECT cs."tenantId", count(*) AS sessions,
  count(*) FILTER (WHERE cs.status::text = 'OPEN') AS open_now,
  count(*) FILTER (WHERE cs.status::text = 'OPEN' AND cs."openedAt" < now() - interval '24 hours') AS open_over_24h,
  count(*) FILTER (WHERE cs."countedAmount" IS NOT NULL AND cs."expectedAmount" IS NOT NULL
                    AND abs(coalesce(cs."differenceAmount", 0) - (cs."countedAmount" - cs."expectedAmount")) > 0.01) AS diff_field_wrong,
  count(*) FILTER (WHERE cs."expectedAmount" IS NOT NULL AND abs(cs."expectedAmount" - t.net) > 0.01) AS expected_vs_movements,
  count(*) FILTER (WHERE abs(coalesce(cs."differenceAmount", 0)) >= 1) AS with_difference
FROM "CashDrawerSession" cs
CROSS JOIN LATERAL (SELECT coalesce(sum(CASE WHEN ct.direction::text = 'IN' THEN ct.amount ELSE -ct.amount END), 0) AS net
  FROM "CashDrawerTransaction" ct WHERE ct."sessionId" = cs.id) t
GROUP BY 1 ORDER BY 1;
\echo '21l. Books: entries that do not balance, entries without lines, voided'
SELECT j."tenantId", count(*) AS entries,
  count(*) FILTER (WHERE l.n = 0) AS no_lines,
  count(*) FILTER (WHERE l.n > 0 AND l.dr <> l.cr) AS unbalanced,
  sum(l.dr - l.cr) FILTER (WHERE l.dr <> l.cr) AS unbalanced_by,
  count(*) FILTER (WHERE j."isVoided") AS voided,
  count(*) - count(DISTINCT (j."sourceType", j."sourceId")) FILTER (WHERE j."sourceId" IS NOT NULL AND NOT j."isVoided")
    - count(*) FILTER (WHERE j."sourceId" IS NULL OR j."isVoided") AS duplicate_source
FROM "JournalEntry" j
CROSS JOIN LATERAL (SELECT count(*) AS n, coalesce(sum(jl.debit), 0) AS dr, coalesce(sum(jl.credit), 0) AS cr FROM "JournalLine" jl WHERE jl."entryId" = j.id) l
GROUP BY 1 ORDER BY 2 DESC;
\echo '21m. Expenses: zero or negative, no branch, voided'
SELECT b."tenantId", count(*) AS expenses, sum(e.amount) FILTER (WHERE e."voidedAt" IS NULL) AS amount,
  count(*) FILTER (WHERE e.amount <= 0) AS zero_or_negative, count(*) FILTER (WHERE e."branchId" IS NULL) AS no_branch,
  count(*) FILTER (WHERE e."voidedAt" IS NOT NULL) AS voided
FROM "Expense" e LEFT JOIN "Branch" b ON b.id = e."branchId" GROUP BY 1 ORDER BY 1;
\echo '21n. Daily closes: cash counted vs expected, and the last close'
SELECT dc."tenantId", count(*) AS closes,
  count(*) FILTER (WHERE dc."actualCash" IS NOT NULL AND abs(coalesce(dc."cashDifference", 0)) >= 1) AS with_cash_difference,
  max(dc.date) AS last_close
FROM "DailyClose" dc GROUP BY 1 ORDER BY 1;

ROLLBACK;
