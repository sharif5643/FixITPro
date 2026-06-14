-- FixITPro: Restructure module system — 17 granular keys → 8 business-level keys
-- Safe to re-run: all INSERTs use ON CONFLICT DO NOTHING / DO UPDATE

-- Step 1: Clear old data (FK order: TenantModule → PackageModule → AppModule)
DELETE FROM "TenantModule";
DELETE FROM "PackageModule";
DELETE FROM "AppModule";

-- Step 2: Insert 8 new business-level modules
INSERT INTO "AppModule" ("key", "name", "description", "isActive") VALUES
  ('pos',             'ขายสินค้า (POS)',       'ระบบขายสินค้าหน้าร้าน Point of Sale',          true),
  ('repair',          'งานซ่อม',               'รับซ่อม, รับประกัน, เคลมสินค้า, ช่างเทคนิค', true),
  ('stock',           'คลังสินค้า',            'สินค้า, สต็อก, Serial/IMEI, บาร์โค้ด',        true),
  ('finance',         'การเงิน',               'ค่าใช้จ่าย, ซัพพลายเออร์, สั่งซื้อ, หนี้',   true),
  ('crm',             'ลูกค้าสัมพันธ์ (CRM)', 'ระบบลูกค้า, ติดตาม, ประวัติการซื้อ',          true),
  ('line_notify',     'แจ้งเตือน LINE',        'ส่งแจ้งเตือนผ่าน LINE Notify / Messaging',     true),
  ('report',          'รายงาน',                'รายงาน, วิเคราะห์, ประวัติกิจกรรม, Backup',   true),
  ('user_management', 'จัดการผู้ใช้',          'พนักงาน, บทบาท, สาขา, สิทธิ์การใช้งาน',      true)
ON CONFLICT ("key") DO UPDATE SET
  "name"        = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isActive"    = EXCLUDED."isActive";

-- Step 3: Ensure Package rows exist (upsert — safe to re-run)
INSERT INTO "Package" ("id", "key", "name", "description", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'TRIAL',      'ทดลองใช้',        'ทดลองใช้ฟรี — POS, ซ่อม และสต็อกพื้นฐาน',    true, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'BASIC',      'เบสิก',           'สำหรับร้านเดี่ยวขนาดเล็ก',                    true, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'PRO',        'โปร',             'สำหรับร้านที่ต้องการฟีเจอร์ครบครัน',          true, 3, NOW(), NOW()),
  (gen_random_uuid()::text, 'ENTERPRISE', 'เอ็นเตอร์ไพรส์', 'สำหรับธุรกิจหลายสาขา ครบทุกฟีเจอร์',         true, 4, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET
  "name"        = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updatedAt"   = NOW();

-- Step 4: Package → Module mappings
-- TRIAL: core shop operations (3 modules)
INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('TRIAL', 'pos'),
  ('TRIAL', 'repair'),
  ('TRIAL', 'stock')
ON CONFLICT DO NOTHING;

-- BASIC: + CRM + Reports (5 modules)
INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('BASIC', 'pos'),
  ('BASIC', 'repair'),
  ('BASIC', 'stock'),
  ('BASIC', 'crm'),
  ('BASIC', 'report')
ON CONFLICT DO NOTHING;

-- PRO: + Finance + LINE Notify (7 modules)
INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('PRO', 'pos'),
  ('PRO', 'repair'),
  ('PRO', 'stock'),
  ('PRO', 'crm'),
  ('PRO', 'report'),
  ('PRO', 'finance'),
  ('PRO', 'line_notify')
ON CONFLICT DO NOTHING;

-- ENTERPRISE: all 8 modules
INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('ENTERPRISE', 'pos'),
  ('ENTERPRISE', 'repair'),
  ('ENTERPRISE', 'stock'),
  ('ENTERPRISE', 'crm'),
  ('ENTERPRISE', 'report'),
  ('ENTERPRISE', 'finance'),
  ('ENTERPRISE', 'line_notify'),
  ('ENTERPRISE', 'user_management')
ON CONFLICT DO NOTHING;
