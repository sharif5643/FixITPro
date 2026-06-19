-- Migration: Repair Parts Immediate Deduction
-- Adds costPrice/sellPrice snapshots, soft-delete, and REPAIR_RETURN movement type
-- Safe: all columns are nullable or have defaults; enum ADD VALUE is non-destructive

-- 1. Add REPAIR_RETURN to StockMovementType enum (idempotent on re-run)
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'REPAIR_RETURN';

-- 2. Add new columns to RepairPart
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2);
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "sellPrice" DECIMAL(10,2);
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "isVoided"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "voidedAt"  TIMESTAMP(3);

-- 3. Backfill existing rows: costPrice = price, sellPrice = price (best approximation)
UPDATE "RepairPart"
SET "costPrice" = price,
    "sellPrice" = price
WHERE "costPrice" IS NULL;

-- 4. Index for fast active-parts lookup
CREATE INDEX IF NOT EXISTS "RepairPart_isVoided_idx" ON "RepairPart"("isVoided");
