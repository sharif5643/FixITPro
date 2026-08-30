-- Add PackageSaleType enum and saleType field to PackageSale
DO $$ BEGIN
  CREATE TYPE "PackageSaleType" AS ENUM ('SIM_SALE', 'PROMO', 'TOPUP', 'BUNDLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "PackageSale"
  ADD COLUMN IF NOT EXISTS "saleType" "PackageSaleType" NOT NULL DEFAULT 'PROMO';

-- Register package_sales module in AppModule table
INSERT INTO "AppModule" ("key", "name", "description", "isActive")
VALUES (
  'package_sales',
  'ขายซิม / แพ็กเกจ',
  'ระบบบันทึกการขายซิมการ์ดและแพ็กเกจอินเทอร์เน็ต',
  true
)
ON CONFLICT ("key") DO NOTHING;
