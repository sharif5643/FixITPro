-- Phase 2: SaaS Module System
-- Creates AppModule, Package, PackageModule, TenantModule tables
-- and seeds default module definitions + package→module mappings.
-- All INSERTs use ON CONFLICT DO NOTHING — safe to re-run.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE "AppModule" (
  "key"         TEXT    NOT NULL PRIMARY KEY,
  "name"        TEXT    NOT NULL,
  "description" TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "Package" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "key"         TEXT        NOT NULL UNIQUE,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "PackageModule" (
  "packageKey" TEXT NOT NULL,
  "moduleKey"  TEXT NOT NULL,
  PRIMARY KEY ("packageKey", "moduleKey"),
  FOREIGN KEY ("packageKey") REFERENCES "Package"("key")  ON DELETE CASCADE,
  FOREIGN KEY ("moduleKey")  REFERENCES "AppModule"("key") ON DELETE CASCADE
);
CREATE INDEX "PackageModule_packageKey_idx" ON "PackageModule"("packageKey");

CREATE TABLE "TenantModule" (
  "tenantId"  TEXT        NOT NULL,
  "moduleKey" TEXT        NOT NULL,
  "enabled"   BOOLEAN     NOT NULL,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenantId", "moduleKey"),
  FOREIGN KEY ("tenantId")  REFERENCES "Tenant"("id")    ON DELETE CASCADE,
  FOREIGN KEY ("moduleKey") REFERENCES "AppModule"("key") ON DELETE CASCADE
);
CREATE INDEX "TenantModule_tenantId_idx" ON "TenantModule"("tenantId");

-- ── Seed: AppModule registry ──────────────────────────────────────────────────

INSERT INTO "AppModule" ("key", "name", "description") VALUES
  ('pos',            'POS / ขายสินค้า',        'ระบบขายสินค้าและ POS'),
  ('repairs',        'งานซ่อม',                 'ระบบรับและติดตามงานซ่อม'),
  ('inventory',      'สต็อกสินค้า',             'ระบบจัดการสินค้าและสต็อก'),
  ('customers',      'ลูกค้า',                  'ระบบจัดการข้อมูลลูกค้า'),
  ('expenses',       'ค่าใช้จ่าย',              'ระบบบันทึกและติดตามค่าใช้จ่าย'),
  ('reports',        'รายงาน',                  'รายงานการขาย รายวัน และกำไร'),
  ('warranties',     'การรับประกัน',            'ระบบออกและติดตามการรับประกัน'),
  ('serials',        'Serial / IMEI',           'ระบบติดตาม Serial Number และ IMEI'),
  ('claims',         'จัดการเคลม',              'ระบบรับและจัดการการเคลมสินค้า'),
  ('analytics',      'วิเคราะห์เชิงลึก',        'Dashboard และการวิเคราะห์ข้อมูลเชิงลึก'),
  ('suppliers',      'ซัพพลายเออร์ & PO',       'ระบบจัดการซัพพลายเออร์และใบสั่งซื้อ'),
  ('carrier_wallet', 'กระเป๋าค่ายมือถือ',       'ระบบจัดการยอดค่ายมือถือ AIS/TRUE/DTAC/NT'),
  ('technicians',    'ประสิทธิภาพช่าง',         'Dashboard สรุปงานและประสิทธิภาพช่างซ่อม'),
  ('branches',       'จัดการสาขา',              'ระบบจัดการหลายสาขาและโอนสต็อกระหว่างสาขา'),
  ('backup',         'Backup ข้อมูล',            'ระบบสำรองและกู้คืนข้อมูล'),
  ('audit_log',      'ประวัติกิจกรรม',          'บันทึกการใช้งานและการเปลี่ยนแปลงทั้งหมด'),
  ('data_tools',     'เครื่องมือข้อมูล',        'นำเข้า/ส่งออกข้อมูลสินค้าและลูกค้า')
ON CONFLICT ("key") DO NOTHING;

-- ── Seed: Packages ────────────────────────────────────────────────────────────

INSERT INTO "Package" ("id", "key", "name", "description", "sortOrder") VALUES
  ('pkg_trial',      'TRIAL',      'Founding Customer', 'Early access — ราคาพิเศษสำหรับลูกค้าแรก',  0),
  ('pkg_basic',      'BASIC',      'Starter',           'สาขาเดียว ฟีเจอร์หลักครบ',                 1),
  ('pkg_pro',        'PRO',        'Business',          'หลายสาขา Analytics และฟีเจอร์ครบชุด',      2),
  ('pkg_enterprise', 'ENTERPRISE', 'Enterprise',        'ไม่จำกัดสาขา ทุกโมดูล',                    3)
ON CONFLICT ("key") DO NOTHING;

-- ── Seed: PackageModule — TRIAL (core features) ───────────────────────────────

INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('TRIAL', 'pos'),       ('TRIAL', 'repairs'),   ('TRIAL', 'inventory'),
  ('TRIAL', 'customers'), ('TRIAL', 'expenses'),  ('TRIAL', 'warranties'),
  ('TRIAL', 'reports')
ON CONFLICT DO NOTHING;

-- ── Seed: PackageModule — BASIC (core + tracking) ────────────────────────────

INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('BASIC', 'pos'),       ('BASIC', 'repairs'),    ('BASIC', 'inventory'),
  ('BASIC', 'customers'), ('BASIC', 'expenses'),   ('BASIC', 'warranties'),
  ('BASIC', 'reports'),   ('BASIC', 'serials'),    ('BASIC', 'claims'),
  ('BASIC', 'audit_log'), ('BASIC', 'backup'),     ('BASIC', 'data_tools')
ON CONFLICT DO NOTHING;

-- ── Seed: PackageModule — PRO (full suite) ───────────────────────────────────

INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('PRO', 'pos'),           ('PRO', 'repairs'),       ('PRO', 'inventory'),
  ('PRO', 'customers'),     ('PRO', 'expenses'),      ('PRO', 'warranties'),
  ('PRO', 'reports'),       ('PRO', 'serials'),       ('PRO', 'claims'),
  ('PRO', 'audit_log'),     ('PRO', 'backup'),        ('PRO', 'data_tools'),
  ('PRO', 'analytics'),     ('PRO', 'suppliers'),     ('PRO', 'carrier_wallet'),
  ('PRO', 'technicians'),   ('PRO', 'branches')
ON CONFLICT DO NOTHING;

-- ── Seed: PackageModule — ENTERPRISE (all modules) ───────────────────────────

INSERT INTO "PackageModule" ("packageKey", "moduleKey") VALUES
  ('ENTERPRISE', 'pos'),           ('ENTERPRISE', 'repairs'),       ('ENTERPRISE', 'inventory'),
  ('ENTERPRISE', 'customers'),     ('ENTERPRISE', 'expenses'),      ('ENTERPRISE', 'warranties'),
  ('ENTERPRISE', 'reports'),       ('ENTERPRISE', 'serials'),       ('ENTERPRISE', 'claims'),
  ('ENTERPRISE', 'audit_log'),     ('ENTERPRISE', 'backup'),        ('ENTERPRISE', 'data_tools'),
  ('ENTERPRISE', 'analytics'),     ('ENTERPRISE', 'suppliers'),     ('ENTERPRISE', 'carrier_wallet'),
  ('ENTERPRISE', 'technicians'),   ('ENTERPRISE', 'branches')
ON CONFLICT DO NOTHING;
