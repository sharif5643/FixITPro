-- READ ONLY: preview of how the carrier-wallet migration will assign data
-- 1) Current wallets and which shop each will belong to
SELECT w.carrier, w.balance,
       COALESCE(t."shopName", '(ไม่มีร้าน / legacy)') AS will_belong_to
FROM "CarrierWallet" w
LEFT JOIN LATERAL (
  SELECT u."tenantId" FROM "CarrierWalletMovement" m JOIN "User" u ON u.id = m."createdById"
  WHERE m."walletId" = w.id AND u."tenantId" IS NOT NULL
  ORDER BY m."createdAt" DESC LIMIT 1
) last ON true
LEFT JOIN "Tenant" t ON t.id = last."tenantId"
ORDER BY w.carrier;

-- 2) Which shops (and staff without a shop) have used package sales / wallets
SELECT COALESCE(t."shopName", '(ไม่มีร้าน / legacy)') AS shop,
       COUNT(*) FILTER (WHERE src = 'sale')     AS package_sales,
       COUNT(*) FILTER (WHERE src = 'movement') AS wallet_movements,
       MAX(at) AS last_used
FROM (
  SELECT "createdById" AS uid, 'sale' AS src, "createdAt" AS at FROM "PackageSale"
  UNION ALL
  SELECT "createdById", 'movement', "createdAt" FROM "CarrierWalletMovement"
) x
LEFT JOIN "User" u ON u.id = x.uid
LEFT JOIN "Tenant" t ON t.id = u."tenantId"
GROUP BY 1 ORDER BY last_used DESC;
