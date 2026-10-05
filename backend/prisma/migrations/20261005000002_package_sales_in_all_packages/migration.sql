-- SIM / package sales ("package_sales") for every package. Until now no package included it,
-- so only shops with a per-shop override could open the SIM screens.
--
-- Insert-only and idempotent: adds one PackageModule row per package that lacks it; nothing
-- existing is changed or removed. A shop that has package_sales switched off with its own
-- override keeps it off (overrides still win).

INSERT INTO "AppModule" ("key", "name", "description", "isActive")
VALUES ('package_sales', 'ขายซิม / แพ็กเกจ', 'ระบบบันทึกการขายซิมการ์ดและแพ็กเกจอินเทอร์เน็ต', true)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PackageModule" ("packageKey", "moduleKey")
SELECT p."key", 'package_sales' FROM "Package" p
ON CONFLICT DO NOTHING;
