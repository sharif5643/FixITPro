-- New system account 1130 "Carrier Wallet Balance" for shops that already have a chart of
-- accounts (new shops get it from the template). Insert-only; nothing else is touched.
INSERT INTO "AccountingAccount" ("id", "code", "name", "nameTh", "type", "isSystem", "isActive", "sortOrder", "tenantId", "createdAt")
SELECT 'coa1130' || substr(md5(t."tenantId"), 1, 18), '1130', 'Carrier Wallet Balance', 'เงินในกระเป๋าค่ายมือถือ',
       'ASSET'::"AccountType", true, true, 35, t."tenantId", now()
FROM (SELECT DISTINCT "tenantId" FROM "AccountingAccount" WHERE "tenantId" IS NOT NULL) t
ON CONFLICT ("code", "tenantId") DO NOTHING;
