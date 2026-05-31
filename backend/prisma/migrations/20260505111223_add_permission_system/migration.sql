-- PermissionSystem Migration
-- 1. Migrate Role enum (ADMIN→MANAGER, STAFF→CASHIER, add TECHNICIAN/STOCK_STAFF)
-- 2. Add lastLoginAt to User
-- 3. Create RolePermission table
-- 4. Seed default permissions

BEGIN;

-- Convert role column to text so we can drop the old enum
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;

-- Drop old enum
DROP TYPE "Role";

-- Create new enum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF');

-- Migrate existing data
UPDATE "User" SET "role" = 'MANAGER' WHERE "role" = 'ADMIN';
UPDATE "User" SET "role" = 'CASHIER' WHERE "role" = 'STAFF';

-- Convert column back to new enum
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CASHIER';

-- Ensure all users without a valid role default to CASHIER
UPDATE "User" SET "role" = 'CASHIER' WHERE "role" NOT IN ('OWNER','MANAGER','CASHIER','TECHNICIAN','STOCK_STAFF');

-- Add lastLoginAt
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Create RolePermission table
CREATE TABLE "RolePermission" (
  "id"         TEXT NOT NULL,
  "role"       "Role" NOT NULL,
  "permission" TEXT NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");

-- Seed default permissions
-- MANAGER: all except settings.manage
INSERT INTO "RolePermission" ("id","role","permission") VALUES
  (gen_random_uuid()::text,'MANAGER','products.view'),
  (gen_random_uuid()::text,'MANAGER','products.create'),
  (gen_random_uuid()::text,'MANAGER','products.edit'),
  (gen_random_uuid()::text,'MANAGER','products.delete'),
  (gen_random_uuid()::text,'MANAGER','products.view_cost'),
  (gen_random_uuid()::text,'MANAGER','sales.create'),
  (gen_random_uuid()::text,'MANAGER','sales.discount'),
  (gen_random_uuid()::text,'MANAGER','sales.refund'),
  (gen_random_uuid()::text,'MANAGER','repair.create'),
  (gen_random_uuid()::text,'MANAGER','repair.edit'),
  (gen_random_uuid()::text,'MANAGER','repair.close'),
  (gen_random_uuid()::text,'MANAGER','repair.approve_estimate'),
  (gen_random_uuid()::text,'MANAGER','stock.adjust'),
  (gen_random_uuid()::text,'MANAGER','purchase.create'),
  (gen_random_uuid()::text,'MANAGER','purchase.receive'),
  (gen_random_uuid()::text,'MANAGER','supplier.pay'),
  (gen_random_uuid()::text,'MANAGER','reports.view'),
  (gen_random_uuid()::text,'MANAGER','claims.manage'),
  (gen_random_uuid()::text,'MANAGER','serials.manage');

-- CASHIER: POS + basic product view
INSERT INTO "RolePermission" ("id","role","permission") VALUES
  (gen_random_uuid()::text,'CASHIER','products.view'),
  (gen_random_uuid()::text,'CASHIER','sales.create'),
  (gen_random_uuid()::text,'CASHIER','sales.discount');

-- TECHNICIAN: repair + serial
INSERT INTO "RolePermission" ("id","role","permission") VALUES
  (gen_random_uuid()::text,'TECHNICIAN','products.view'),
  (gen_random_uuid()::text,'TECHNICIAN','repair.create'),
  (gen_random_uuid()::text,'TECHNICIAN','repair.edit'),
  (gen_random_uuid()::text,'TECHNICIAN','repair.close'),
  (gen_random_uuid()::text,'TECHNICIAN','repair.approve_estimate'),
  (gen_random_uuid()::text,'TECHNICIAN','serials.manage');

-- STOCK_STAFF: stock + purchase
INSERT INTO "RolePermission" ("id","role","permission") VALUES
  (gen_random_uuid()::text,'STOCK_STAFF','products.view'),
  (gen_random_uuid()::text,'STOCK_STAFF','products.create'),
  (gen_random_uuid()::text,'STOCK_STAFF','products.edit'),
  (gen_random_uuid()::text,'STOCK_STAFF','stock.adjust'),
  (gen_random_uuid()::text,'STOCK_STAFF','purchase.create'),
  (gen_random_uuid()::text,'STOCK_STAFF','purchase.receive'),
  (gen_random_uuid()::text,'STOCK_STAFF','serials.manage');

COMMIT;
