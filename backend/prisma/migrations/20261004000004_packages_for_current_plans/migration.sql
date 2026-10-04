-- Packages for the plan keys in use since 20260813000002_rename_tenant_plan_enum
-- (BASIC→LITE, ENTERPRISE→BUSINESS, new PRIVATE). Package/PackageModule still used the old keys,
-- so a shop on LITE/BUSINESS/PRIVATE got no modules from its package (only per-shop overrides).
--
-- Insert-only and idempotent: no existing Package, PackageModule or TenantModule row is changed.
--   LITE     ← BASIC's modules
--   BUSINESS ← ENTERPRISE's modules, only when BUSINESS has none yet
--   PRIVATE  ← BUSINESS's modules, only when PRIVATE has none yet
-- On production BUSINESS already has its modules and every PRIVATE shop already has overrides
-- for at least the same set, so what each shop can use does not change.

INSERT INTO "Package" ("id", "key", "name", "description", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('pkg_lite',     'LITE',     'ไลท์',      'สำหรับร้านเดี่ยวขนาดเล็ก',                true, 2, NOW(), NOW()),
  ('pkg_business', 'BUSINESS', 'บิสซิเนส',  'สำหรับธุรกิจหลายสาขา ครบทุกฟีเจอร์',       true, 4, NOW(), NOW()),
  ('pkg_private',  'PRIVATE',  'ไพรเวท',    'แพ็กเกจเฉพาะร้าน (ตกลงราคาเป็นรายร้าน)',  true, 5, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PackageModule" ("packageKey", "moduleKey")
SELECT 'LITE', pm."moduleKey" FROM "PackageModule" pm
WHERE pm."packageKey" = 'BASIC'
  AND NOT EXISTS (SELECT 1 FROM "PackageModule" x WHERE x."packageKey" = 'LITE')
ON CONFLICT DO NOTHING;

INSERT INTO "PackageModule" ("packageKey", "moduleKey")
SELECT 'BUSINESS', pm."moduleKey" FROM "PackageModule" pm
WHERE pm."packageKey" = 'ENTERPRISE'
  AND NOT EXISTS (SELECT 1 FROM "PackageModule" x WHERE x."packageKey" = 'BUSINESS')
ON CONFLICT DO NOTHING;

INSERT INTO "PackageModule" ("packageKey", "moduleKey")
SELECT 'PRIVATE', pm."moduleKey" FROM "PackageModule" pm
WHERE pm."packageKey" = 'BUSINESS'
  AND NOT EXISTS (SELECT 1 FROM "PackageModule" x WHERE x."packageKey" = 'PRIVATE')
ON CONFLICT DO NOTHING;
