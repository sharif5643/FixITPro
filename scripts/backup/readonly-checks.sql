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

-- 22. Shift cash differences: one row per closed shift of the busiest shop (amounts only)
\echo '22a. Closed shifts of the busiest shop, last 45 days: opening, counted, expected and its parts'
WITH shop AS (SELECT 'cmsc05do8001u7i29q3p5x6zp'::text AS id)
SELECT to_char(sh."openedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS opened,
  to_char(sh."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS closed,
  sh."openBalance" AS open_bal, sh."closeBalance" AS counted,
  (a."afterData"->>'expectedBalance')::numeric AS expected, (a."afterData"->>'difference')::numeric AS diff,
  (SELECT coalesce(sum(sp.amount), 0) FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED' AND sp."paymentMethod"::text = 'CASH') AS cash_legs,
  (SELECT coalesce(sum(s.total), 0) FROM "Sale" s WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED' AND s."paymentMethod"::text = 'CASH'
     AND NOT EXISTS (SELECT 1 FROM "SalePayment" sp WHERE sp."saleId" = s.id)) AS cash_no_legs,
  (SELECT coalesce(sum(sp.amount), 0) FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED' AND sp."paymentMethod"::text <> 'CASH') AS other_legs,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id) AS sales,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id AND s.status::text = 'VOIDED') AS voided,
  (SELECT count(*) FROM "Shift" o WHERE o.id <> sh.id AND o."branchId" IS NOT DISTINCT FROM sh."branchId"
     AND o."openedAt" < coalesce(sh."closedAt", now()) AND coalesce(o."closedAt", now()) > sh."openedAt") AS overlapping,
  (SELECT count(*) FROM "ShiftMember" m WHERE m."shiftId" = sh.id) AS members,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id AND s."createdAt" > sh."closedAt") AS sales_after_close,
  (SELECT count(*) FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" WHERE b."tenantId" = shop.id AND s."shiftId" IS DISTINCT FROM sh.id
     AND s."createdAt" BETWEEN sh."openedAt" AND sh."closedAt" AND s."branchId" IS NOT DISTINCT FROM sh."branchId") AS other_shift_sales_meanwhile
FROM "Shift" sh CROSS JOIN shop JOIN "Branch" b ON b.id = sh."branchId" AND b."tenantId" = shop.id
LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
WHERE sh."closedAt" > now() - interval '45 days' ORDER BY sh."openedAt";
\echo '22b. Same shop: shifts per user and branch, and how many branches'
SELECT b.id AS branch, u.role, count(*) AS shifts, sum(CASE WHEN sh."isActive" THEN 1 ELSE 0 END) AS open
FROM "Shift" sh JOIN "Branch" b ON b.id = sh."branchId" JOIN "User" u ON u.id = sh."userId"
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' GROUP BY 1, 2 ORDER BY 1, 2;
\echo '22c. Same shop: the sale whose payments differ from its total'
SELECT s."createdAt"::date, s.status, s."paymentMethod", s.total, s."amountPaid", s.change,
  (SELECT json_agg(json_build_object('m', sp."paymentMethod", 'a', sp.amount)) FROM "SalePayment" sp WHERE sp."saleId" = s.id) AS legs
FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND s.status::text <> 'VOIDED'
  AND EXISTS (SELECT 1 FROM "SalePayment" sp WHERE sp."saleId" = s.id)
  AND abs((SELECT sum(sp.amount) FROM "SalePayment" sp WHERE sp."saleId" = s.id) - s.total) > 0.01;

\echo '--- 23. Repair discount typed at intake: was it taken off when the customer paid? ---'
SELECT b."tenantId",
  count(*) FILTER (WHERE r.discount > 0) AS with_intake_discount,
  count(*) FILTER (WHERE r.discount > 0 AND r."paymentStatus" = 'PAID') AS paid,
  count(*) FILTER (WHERE r.discount > 0 AND r."paymentStatus" = 'PAID'
                   AND r."finalCost" >= coalesce(r."estimatedTotal", r."estimateCost")) AS paid_full_price,
  sum(r.discount) FILTER (WHERE r.discount > 0 AND r."paymentStatus" = 'PAID'
                   AND r."finalCost" >= coalesce(r."estimatedTotal", r."estimateCost")) AS discount_not_given
FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId"
GROUP BY 1 HAVING count(*) FILTER (WHERE r.discount > 0) > 0 ORDER BY 1;

\echo '--- 24. Stock: does each branch balance match its movement history? ---'
-- Signed movement: in = +, out = -; ADJUST is stored with its sign.
\echo '24a. Branch stock vs the sum of its movements, per shop (rows that differ / with no movement at all)'
WITH mv AS (
  SELECT m."branchId", m."productId",
    sum(CASE WHEN m.type::text IN ('IN','REFUND','REPAIR_RETURN','TRANSFER_IN') THEN m.quantity
             WHEN m.type::text IN ('OUT','SALE','REPAIR_USE','TRANSFER_OUT') THEN -m.quantity
             WHEN m.type::text = 'ADJUST' THEN m.quantity ELSE 0 END) AS net,
    count(*) AS moves
  FROM "StockMovement" m WHERE m."branchId" IS NOT NULL GROUP BY 1, 2)
SELECT b."tenantId", count(*) AS stock_rows,
  count(*) FILTER (WHERE bs.quantity <> coalesce(mv.net, 0)) AS differ,
  count(*) FILTER (WHERE bs.quantity <> coalesce(mv.net, 0) AND mv.moves IS NULL) AS differ_no_moves,
  sum(bs.quantity - coalesce(mv.net, 0)) FILTER (WHERE bs.quantity <> coalesce(mv.net, 0)) AS units_unexplained,
  count(*) FILTER (WHERE bs.quantity < 0) AS negative
FROM "BranchStock" bs JOIN "Branch" b ON b.id = bs."branchId"
LEFT JOIN mv ON mv."branchId" = bs."branchId" AND mv."productId" = bs."productId"
GROUP BY 1 ORDER BY 1;
\echo '24b. Biggest differences (shop, product type, stock, movements say)'
WITH mv AS (
  SELECT m."branchId", m."productId",
    sum(CASE WHEN m.type::text IN ('IN','REFUND','REPAIR_RETURN','TRANSFER_IN') THEN m.quantity
             WHEN m.type::text IN ('OUT','SALE','REPAIR_USE','TRANSFER_OUT') THEN -m.quantity
             WHEN m.type::text = 'ADJUST' THEN m.quantity ELSE 0 END) AS net,
    count(*) AS moves, min(m."createdAt")::date AS first_move
  FROM "StockMovement" m WHERE m."branchId" IS NOT NULL GROUP BY 1, 2)
SELECT b."tenantId", p.type, p."hasSerial", bs.quantity AS stock, coalesce(mv.net, 0) AS movements_say,
  coalesce(mv.moves, 0) AS moves, mv.first_move, p."createdAt"::date AS product_created
FROM "BranchStock" bs JOIN "Branch" b ON b.id = bs."branchId" JOIN "Product" p ON p.id = bs."productId"
LEFT JOIN mv ON mv."branchId" = bs."branchId" AND mv."productId" = bs."productId"
WHERE bs.quantity <> coalesce(mv.net, 0)
ORDER BY abs(bs.quantity - coalesce(mv.net, 0)) DESC LIMIT 25;
\echo '24c. Product total vs the sum of its branches (should always match)'
SELECT p."tenantId", count(*) AS products,
  count(*) FILTER (WHERE p.stock <> coalesce(t.total, 0)) AS total_differs
FROM "Product" p LEFT JOIN (SELECT "productId", sum(quantity) AS total FROM "BranchStock" GROUP BY 1) t ON t."productId" = p.id
WHERE p."isActive" GROUP BY 1 ORDER BY 1;
\echo '24d. Products with serial / IMEI: units in stock vs serials marked in stock'
SELECT p."tenantId", count(*) AS serial_products,
  count(*) FILTER (WHERE coalesce(t.total, 0) <> coalesce(sn.n, 0)) AS count_differs,
  sum(coalesce(t.total, 0)) AS units, sum(coalesce(sn.n, 0)) AS serials_in_stock
FROM "Product" p
LEFT JOIN (SELECT "productId", sum(quantity) AS total FROM "BranchStock" GROUP BY 1) t ON t."productId" = p.id
LEFT JOIN (SELECT "productId", count(*) AS n FROM "SerialNumber" WHERE status::text = 'IN_STOCK' GROUP BY 1) sn ON sn."productId" = p.id
WHERE p."hasSerial" AND p."isActive" GROUP BY 1 ORDER BY 1;
\echo '24e. Stock of one shop held on a branch of another shop'
SELECT count(*) AS cross_shop_rows FROM "BranchStock" bs JOIN "Branch" b ON b.id = bs."branchId" JOIN "Product" p ON p.id = bs."productId"
WHERE p."tenantId" IS DISTINCT FROM b."tenantId";
\echo '24f. Movements by type in the last 90 days, per shop'
SELECT b."tenantId", m.type::text, count(*) AS moves, sum(m.quantity) AS units
FROM "StockMovement" m JOIN "Branch" b ON b.id = m."branchId"
WHERE m."createdAt" > now() - interval '90 days' GROUP BY 1, 2 ORDER BY 1, 2;
\echo '24g. Stock value at cost and products sold below cost (last 90 days), per shop'
SELECT p."tenantId", sum(greatest(bs.quantity, 0) * p."costPrice") AS stock_value_at_cost,
  count(DISTINCT p.id) FILTER (WHERE p."costPrice" = 0 AND bs.quantity > 0) AS in_stock_no_cost
FROM "BranchStock" bs JOIN "Product" p ON p.id = bs."productId" GROUP BY 1 ORDER BY 1;
SELECT b."tenantId", count(*) AS lines_below_cost, sum((si."costPrice" * si.quantity) - si.total) AS loss
FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" JOIN "Branch" b ON b.id = s."branchId"
WHERE s."createdAt" > now() - interval '90 days' AND s.status::text <> 'VOIDED' AND si."costPrice" > 0
  AND si.total < si."costPrice" * si.quantity GROUP BY 1 ORDER BY 1;

\echo '24h. Sale lines sold below cost (last 90 days): what they were'
SELECT b."tenantId", s."createdAt"::date AS day, s."receiptNumber", left(p.name, 40) AS product, si.quantity, si.price, si.total,
  si."costPrice" AS cost_each_at_sale, p."costPrice" AS cost_now, p.price AS price_now
FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" JOIN "Branch" b ON b.id = s."branchId" JOIN "Product" p ON p.id = si."productId"
WHERE s."createdAt" > now() - interval '90 days' AND s.status::text <> 'VOIDED' AND si."costPrice" > 0
  AND si.total < si."costPrice" * si.quantity ORDER BY (si."costPrice" * si.quantity - si.total) DESC LIMIT 10;
\echo '24i. Products with serial / IMEI whose stock and in-stock serials differ'
SELECT p."tenantId", left(p.name, 40) AS product, coalesce(t.total, 0) AS units, coalesce(sn.n, 0) AS serials_in_stock
FROM "Product" p
LEFT JOIN (SELECT "productId", sum(quantity) AS total FROM "BranchStock" GROUP BY 1) t ON t."productId" = p.id
LEFT JOIN (SELECT "productId", count(*) AS n FROM "SerialNumber" WHERE status::text = 'IN_STOCK' GROUP BY 1) sn ON sn."productId" = p.id
WHERE p."hasSerial" AND p."isActive" AND coalesce(t.total, 0) <> coalesce(sn.n, 0) ORDER BY 1, 2;
\echo '24j. Busiest shop: stock rows with no movement at all — when were they created and how much stock'
SELECT p."createdAt"::date AS product_created, count(*) AS rows, sum(bs.quantity) AS units
FROM "BranchStock" bs JOIN "Branch" b ON b.id = bs."branchId" JOIN "Product" p ON p.id = bs."productId"
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp'
  AND NOT EXISTS (SELECT 1 FROM "StockMovement" m WHERE m."branchId" = bs."branchId" AND m."productId" = bs."productId")
GROUP BY 1 ORDER BY 1;
\echo '24k. Busiest shop: audit trail of stock that came in without a movement (product created / enrolled / set)'
SELECT al.action, count(*) AS times, min(al."createdAt")::date AS first, max(al."createdAt")::date AS last
FROM "AuditLog" al WHERE al.action IN ('PRODUCT_CREATED', 'BRANCH_STOCK_ENROLLED', 'STOCK_ADJUSTED', 'DATA_IMPORT', 'PRODUCTS_IMPORTED')
  AND al."actorId" IN (SELECT id FROM "User" WHERE "tenantId" = 'cmsc05do8001u7i29q3p5x6zp')
GROUP BY 1 ORDER BY 1;
\echo '24l. Opening balances backfilled by migration 20261017000001 (history only; 24a should now show 0 differ)'
SELECT b."tenantId", count(*) AS rows,
  count(*) FILTER (WHERE m.quantity > 0) AS opening_rows, sum(m.quantity) FILTER (WHERE m.quantity > 0) AS opening_units,
  count(*) FILTER (WHERE m.quantity < 0) AS out_rows, sum(m.quantity) FILTER (WHERE m.quantity < 0) AS out_units
FROM "StockMovement" m JOIN "Branch" b ON b.id = m."branchId"
WHERE m."referenceType" = 'OPENING_BALANCE'
GROUP BY 1 ORDER BY 1;
\echo '24m. Gaps still left for that backfill to fill (before it runs: what it will add; after: 0 rows)'
WITH mv AS (
  SELECT m."branchId", m."productId",
    sum(CASE WHEN m.type::text IN ('IN','REFUND','REPAIR_RETURN','TRANSFER_IN') THEN m.quantity
             WHEN m.type::text IN ('OUT','SALE','REPAIR_USE','TRANSFER_OUT') THEN -m.quantity
             WHEN m.type::text = 'ADJUST' THEN m.quantity ELSE 0 END) AS net
  FROM "StockMovement" m WHERE m."branchId" IS NOT NULL GROUP BY 1, 2)
SELECT b."tenantId",
  count(*) FILTER (WHERE bs.quantity > coalesce(mv.net, 0)) AS opening_rows,
  sum(bs.quantity - coalesce(mv.net, 0)) FILTER (WHERE bs.quantity > coalesce(mv.net, 0)) AS opening_units,
  count(*) FILTER (WHERE bs.quantity < coalesce(mv.net, 0)) AS out_rows,
  sum(bs.quantity - coalesce(mv.net, 0)) FILTER (WHERE bs.quantity < coalesce(mv.net, 0)) AS out_units
FROM "BranchStock" bs JOIN "Branch" b ON b.id = bs."branchId"
LEFT JOIN mv ON mv."branchId" = bs."branchId" AND mv."productId" = bs."productId"
WHERE bs.quantity <> coalesce(mv.net, 0)
  AND NOT EXISTS (SELECT 1 FROM "StockMovement" x WHERE x."branchId" = bs."branchId" AND x."productId" = bs."productId" AND x."referenceType" = 'OPENING_BALANCE')
GROUP BY 1 ORDER BY 1;


\echo '--- 25. Why closed shifts of the busiest shop do not balance (amounts and times only) ---'
\echo '25a. Per closed shift (45 days): what was counted vs what came in by every method, and the day/night split'
WITH shop AS (SELECT 'cmsc05do8001u7i29q3p5x6zp'::text AS id)
SELECT to_char(sh."openedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS opened,
  to_char(sh."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS closed,
  round(extract(epoch FROM sh."closedAt" - sh."openedAt") / 3600) AS hours,
  sh."closeBalance" - sh."openBalance" AS counted_takings,
  (a."afterData"->>'expectedBalance')::numeric - sh."openBalance" AS expected_takings,
  (SELECT coalesce(sum(sp.amount), 0) FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED' AND sp."paymentMethod"::text = 'CASH') AS sale_cash,
  (SELECT coalesce(sum(sp.amount), 0) FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED' AND sp."paymentMethod"::text = 'TRANSFER') AS sale_transfer,
  (SELECT coalesce(sum(sp.amount), 0) FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED' AND sp."paymentMethod"::text NOT IN ('CASH', 'TRANSFER')) AS sale_other,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED'
     AND extract(hour FROM s."createdAt" AT TIME ZONE 'Asia/Bangkok') BETWEEN 8 AND 17) AS sales_daytime,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id AND s.status::text <> 'VOIDED'
     AND NOT extract(hour FROM s."createdAt" AT TIME ZONE 'Asia/Bangkok') BETWEEN 8 AND 17) AS sales_night,
  (SELECT count(*) FROM "Repair" r WHERE r."paymentShiftId" = sh.id) AS repairs_paid,
  (SELECT count(*) FROM "ShiftCashMovement" m WHERE m."shiftId" = sh.id) AS cash_moves,
  (SELECT count(*) FROM "Expense" e WHERE e."shiftId" = sh.id) AS expenses,
  length(coalesce(sh.note, '')) AS note_len
FROM "Shift" sh CROSS JOIN shop JOIN "Branch" b ON b.id = sh."branchId" AND b."tenantId" = shop.id
LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
WHERE sh."closedAt" > now() - interval '45 days' ORDER BY sh."openedAt";

\echo '25b. Same shop, last 45 days: sales by hour of day (Bangkok) — when does the shop record sales?'
SELECT extract(hour FROM s."createdAt" AT TIME ZONE 'Asia/Bangkok')::int AS hour, count(*) AS sales, sum(s.total) AS amount
FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND s.status::text <> 'VOIDED' AND s."createdAt" > now() - interval '45 days'
GROUP BY 1 ORDER BY 1;

\echo '25c. Same shop: the 8 shifts with the biggest difference — each sale in them (time, total, how paid, items)'
WITH big AS (
  SELECT sh.id FROM "Shift" sh JOIN "Branch" b ON b.id = sh."branchId"
  LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
  WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND sh."closedAt" > now() - interval '45 days'
  ORDER BY abs(coalesce((a."afterData"->>'difference')::numeric, 0)) DESC LIMIT 8)
SELECT to_char(sh."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD') AS shift_closed,
  to_char(s."createdAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS sold, s.total, s."paymentMethod" AS method,
  (SELECT string_agg(sp."paymentMethod"::text || ' ' || sp.amount, ' + ') FROM "SalePayment" sp WHERE sp."saleId" = s.id) AS legs,
  (SELECT count(*) FROM "SaleItem" si WHERE si."saleId" = s.id) AS lines,
  (SELECT left(string_agg(DISTINCT p.type::text, ','), 30) FROM "SaleItem" si JOIN "Product" p ON p.id = si."productId" WHERE si."saleId" = s.id) AS types
FROM big JOIN "Shift" sh ON sh.id = big.id JOIN "Sale" s ON s."shiftId" = sh.id AND s.status::text <> 'VOIDED'
ORDER BY sh."closedAt", s."createdAt";

\echo '25d. Same shop: what the close records say for those shifts (stored breakdown)'
WITH big AS (
  SELECT sh.id, sh."closedAt" FROM "Shift" sh JOIN "Branch" b ON b.id = sh."branchId"
  LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
  WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND sh."closedAt" > now() - interval '45 days'
  ORDER BY abs(coalesce((a."afterData"->>'difference')::numeric, 0)) DESC LIMIT 8)
SELECT to_char(big."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD') AS shift_closed,
  (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(a."afterData"::jsonb) k) AS keys_saved,
  a."afterData"->>'expectedBalance' AS expected, a."afterData"->>'difference' AS diff
FROM big LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = big.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
ORDER BY big."closedAt";

\echo '25e. Shifts open for more than 24 hours: per shop, when opened, sales since, last sale, by whom (role)'
SELECT b."tenantId", to_char(sh."openedAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS opened, u.role,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id) AS sales_in_shift,
  (SELECT to_char(max(s."createdAt") AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') FROM "Sale" s WHERE s."shiftId" = sh.id) AS last_sale,
  (SELECT count(*) FROM "Tenant" t WHERE t.id = b."tenantId" AND t.status::text = 'ACTIVE') AS shop_active
FROM "Shift" sh JOIN "User" u ON u.id = sh."userId" LEFT JOIN "Branch" b ON b.id = sh."branchId"
WHERE sh."isActive" AND sh."openedAt" < now() - interval '24 hours' ORDER BY sh."openedAt";

\echo '25f. Sales with no payment rows: when, how paid, voided or not (per shop)'
SELECT b."tenantId", min(s."createdAt")::date AS first, max(s."createdAt")::date AS last, s."paymentMethod", s.status, count(*) AS sales, sum(s.total) AS amount
FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
WHERE NOT EXISTS (SELECT 1 FROM "SalePayment" sp WHERE sp."saleId" = s.id)
GROUP BY 1, 4, 5 ORDER BY 1, 4, 5;


\echo '25g. Busiest shop: sales recorded at 0 baht — how many, items, what the goods list at, and how the 0 came about'
SELECT to_char(date_trunc('week', s."createdAt" AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD') AS week,
  count(DISTINCT s.id) AS zero_sales, sum(si.quantity) AS units,
  sum(p.price * si.quantity) AS list_value, sum(si."costPrice" * si.quantity) AS cost_value,
  count(*) FILTER (WHERE si.price = 0) AS lines_priced_0,
  count(*) FILTER (WHERE si.price > 0 AND si.discount >= si.price * si.quantity) AS lines_discounted_to_0,
  count(DISTINCT s.id) FILTER (WHERE s.discount > 0) AS bill_discount,
  count(DISTINCT s.id) FILTER (WHERE s.note IS NOT NULL AND s.note <> '') AS with_note,
  count(DISTINCT s."userId") AS by_users
FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" JOIN "SaleItem" si ON si."saleId" = s.id JOIN "Product" p ON p.id = si."productId"
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND s.status::text <> 'VOIDED' AND s.total = 0
GROUP BY 1 ORDER BY 1;
\echo '25h. Busiest shop: shifts with 0-baht sales — list value of those goods vs the extra cash counted'
SELECT to_char(sh."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD') AS shift_closed,
  (a."afterData"->>'difference')::numeric AS extra_cash_counted,
  sum(p.price * si.quantity) AS zero_sales_list_value, count(DISTINCT s.id) AS zero_sales
FROM "Sale" s JOIN "Shift" sh ON sh.id = s."shiftId" JOIN "Branch" b ON b.id = s."branchId"
JOIN "SaleItem" si ON si."saleId" = s.id JOIN "Product" p ON p.id = si."productId"
LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND s.status::text <> 'VOIDED' AND s.total = 0 AND sh."closedAt" IS NOT NULL
GROUP BY sh.id, sh."closedAt", a."afterData" ORDER BY sh."closedAt";
\echo '25i. Busiest shop: big phone sales recorded as cash (could they have been transfers?) — per sale, last 45 days'
SELECT to_char(s."createdAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS sold, s.total, s."paymentMethod",
  to_char(sh."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD') AS shift_closed, (a."afterData"->>'difference')::numeric AS shift_diff
FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" LEFT JOIN "Shift" sh ON sh.id = s."shiftId"
LEFT JOIN LATERAL (SELECT al."afterData" FROM "AuditLog" al WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id ORDER BY al."createdAt" DESC LIMIT 1) a ON true
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND s.status::text <> 'VOIDED' AND s.total >= 5000 AND s."createdAt" > now() - interval '45 days'
ORDER BY s."createdAt";


\echo '25j. Busiest shop: what the notes on 0-baht sales say (grouped, first 40 characters)'
SELECT left(regexp_replace(coalesce(s.note, '(none)'), '[0-9]{6,}', '#', 'g'), 40) AS note, count(*) AS sales,
  sum(s.subtotal) AS subtotal, min(s."createdAt")::date AS first, max(s."createdAt")::date AS last
FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
WHERE b."tenantId" = 'cmsc05do8001u7i29q3p5x6zp' AND s.status::text <> 'VOIDED' AND s.total = 0
GROUP BY 1 ORDER BY 2 DESC LIMIT 25;

\echo '--- 26. Who opens, joins and closes shifts (roles and times only) ---'
\echo '26a. Open shifts right now: per shop and branch, opened by (role), people still joined, how many open in that branch'
SELECT b."tenantId", sh."branchId", to_char(sh."openedAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS opened, u.role AS opener_role,
  (SELECT count(*) FROM "ShiftMember" m WHERE m."shiftId" = sh.id AND m."leftAt" IS NULL) AS joined_now,
  count(*) OVER (PARTITION BY sh."branchId") AS open_in_branch,
  (SELECT count(*) FROM "Sale" s WHERE s."shiftId" = sh.id) AS sales
FROM "Shift" sh JOIN "User" u ON u.id = sh."userId" LEFT JOIN "Branch" b ON b.id = sh."branchId"
WHERE sh."isActive" ORDER BY 1, 2, 3;
\echo '26b. Joined members still marked in a shift that is already closed (should be 0)'
SELECT count(*) AS members_left_open_on_closed_shifts
FROM "ShiftMember" m JOIN "Shift" sh ON sh.id = m."shiftId" WHERE m."leftAt" IS NULL AND NOT sh."isActive";
\echo '26c. Last 60 days: shifts of the same branch that were open at the same time (two drawers instead of one)'
SELECT b."tenantId", count(*) AS overlapping_pairs,
  min(a."openedAt")::date AS first, max(a."openedAt")::date AS last
FROM "Shift" a JOIN "Shift" c ON c."branchId" = a."branchId" AND c.id > a.id
  AND c."openedAt" < coalesce(a."closedAt", now()) AND a."openedAt" < coalesce(c."closedAt", now())
JOIN "Branch" b ON b.id = a."branchId"
WHERE a."openedAt" > now() - INTERVAL '60 days'
GROUP BY 1 ORDER BY 1;
\echo '26d. Join / leave / handover / close-by-someone-else, per shop, last 60 days'
SELECT u."tenantId", al.action, count(*) AS times, max(al."createdAt")::date AS last
FROM "AuditLog" al JOIN "User" u ON u.id = al."actorId"
WHERE al.action IN ('SHIFT_JOINED','SHIFT_LEFT','SHIFT_HANDOVER') AND al."createdAt" > now() - INTERVAL '60 days'
GROUP BY 1, 2
UNION ALL
SELECT u."tenantId", 'CLOSED_BY_NOT_OPENER', count(*), max(al."createdAt")::date
FROM "AuditLog" al JOIN "Shift" sh ON sh.id = al."entityId" JOIN "User" u ON u.id = sh."userId"
WHERE al.action = 'SHIFT_CLOSED' AND al."actorId" <> sh."userId" AND al."createdAt" > now() - INTERVAL '60 days'
GROUP BY 1 ORDER BY 1, 2;
\echo '26e. Shops with a joined shift in the last 30 days: each such shift (roles, times, who closed, sales per person)'
SELECT b."tenantId", to_char(sh."openedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS opened,
  to_char(sh."closedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') AS closed, ou.role AS opener,
  (SELECT string_agg(mu.role || ' ' || to_char(m."joinedAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI') || '→' ||
     coalesce(to_char(m."leftAt" AT TIME ZONE 'Asia/Bangkok', 'MM-DD HH24:MI'), 'still'), ', ')
   FROM "ShiftMember" m JOIN "User" mu ON mu.id = m."userId" WHERE m."shiftId" = sh.id) AS members,
  (SELECT CASE WHEN al."actorId" = sh."userId" THEN 'opener' ELSE cu.role::text END
   FROM "AuditLog" al JOIN "User" cu ON cu.id = al."actorId"
   WHERE al.action = 'SHIFT_CLOSED' AND al."entityId" = sh.id LIMIT 1) AS closed_by,
  (SELECT string_agg(x.role || ':' || x.n, ' ') FROM (SELECT su.role::text AS role, count(*) AS n FROM "Sale" s JOIN "User" su ON su.id = s."userId"
     WHERE s."shiftId" = sh.id GROUP BY 1) x) AS sales_by_role
FROM "Shift" sh JOIN "User" ou ON ou.id = sh."userId" LEFT JOIN "Branch" b ON b.id = sh."branchId"
WHERE EXISTS (SELECT 1 FROM "ShiftMember" m WHERE m."shiftId" = sh.id) AND sh."openedAt" > now() - INTERVAL '30 days'
ORDER BY 1, sh."openedAt" DESC LIMIT 40;
\echo '26f. Cash drawer sessions (the second, older drawer record) still OPEN, per branch, and whether a shift is open there'
SELECT cs."tenantId", cs."branchId", to_char(cs."openedAt" AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS opened,
  EXISTS (SELECT 1 FROM "Shift" sh WHERE sh."branchId" = cs."branchId" AND sh."isActive") AS shift_open_now
FROM "CashDrawerSession" cs WHERE cs.status::text = 'OPEN' ORDER BY 1, 3;

\echo '--- 27. Printing: paper width each shop has set (the apps print 58mm / 384 dots) ---'
SELECT ss."tenantId", ss."paperWidth", t.status AS shop_status,
  (SELECT count(*) FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" WHERE b."tenantId" = ss."tenantId" AND s."createdAt" > now() - INTERVAL '30 days') AS sales_30d,
  (SELECT count(*) FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = ss."tenantId" AND r."receivedAt" > now() - INTERVAL '30 days') AS repairs_30d
FROM "ShopSettings" ss LEFT JOIN "Tenant" t ON t.id = ss."tenantId"
ORDER BY 4 DESC NULLS LAST, 1;

\echo '--- 28. Repair quotes: intake estimate (estimateCost) vs the latest quote sent (estimatedTotal) ---'
\echo '28a. Per shop, last 90 days: jobs re-quoted to a different price, of them still open, and the largest change'
SELECT b."tenantId", count(*) AS jobs_90d,
  count(*) FILTER (WHERE r."estimatedTotal" IS NOT NULL AND r."estimateCost" IS NOT NULL AND r."estimatedTotal" <> r."estimateCost") AS requoted,
  count(*) FILTER (WHERE r."estimatedTotal" IS NOT NULL AND r."estimateCost" IS NOT NULL AND r."estimatedTotal" <> r."estimateCost"
    AND r.status::text NOT IN ('DELIVERED','CANCELLED')) AS requoted_open,
  count(*) FILTER (WHERE r."estimatedTotal" IS NOT NULL AND r."estimateCost" IS NULL) AS quote_only,
  max(abs(r."estimatedTotal" - r."estimateCost")) AS max_change
FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId"
WHERE r."receivedAt" > now() - INTERVAL '90 days'
GROUP BY 1 ORDER BY 3 DESC, 1;
\echo '28b. Jobs whose labour + parts split no longer adds up to the latest quote (split shown in the staff app)'
SELECT b."tenantId", count(*) AS jobs
FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId"
WHERE r."estimatedLaborCost" IS NOT NULL AND r."estimatedPartsCost" IS NOT NULL AND r."estimatedTotal" IS NOT NULL
  AND r."estimatedLaborCost" + r."estimatedPartsCost" <> r."estimatedTotal"
GROUP BY 1 ORDER BY 2 DESC;

ROLLBACK;
