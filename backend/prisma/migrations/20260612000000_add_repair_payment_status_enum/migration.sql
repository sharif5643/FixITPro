-- ────────────────────────────────────────────────────────────────────────────
-- P0-5: Convert Repair.paymentStatus from TEXT → RepairPaymentStatus enum
--
-- WHY hand-crafted:
--   Prisma's auto-generator emits DROP COLUMN + ADD COLUMN for this change,
--   which destroys all existing paymentStatus data. The USING cast below
--   converts every value in-place with no data loss.
--
-- Three valid values confirmed across the entire codebase: PENDING, PARTIAL, PAID
-- ────────────────────────────────────────────────────────────────────────────

-- Step 1 ── Pre-flight guard
-- Aborts the entire migration (no changes made) if any row contains a value
-- that cannot be cast to RepairPaymentStatus.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Repair"
    WHERE "paymentStatus" NOT IN ('PENDING', 'PARTIAL', 'PAID')
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: Repair table contains unexpected paymentStatus values. '
      'Inspect with: SELECT DISTINCT "paymentStatus", COUNT(*) FROM "Repair" GROUP BY 1';
  END IF;
END $$;

-- Step 2 ── Create the enum type
CREATE TYPE "RepairPaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- Step 3 ── Drop the text default (required before ALTER COLUMN TYPE in PostgreSQL)
ALTER TABLE "Repair" ALTER COLUMN "paymentStatus" DROP DEFAULT;

-- Step 4 ── Convert the column in-place using an explicit USING cast
--           Every existing value is preserved; no rows are touched otherwise.
ALTER TABLE "Repair"
  ALTER COLUMN "paymentStatus" TYPE "RepairPaymentStatus"
  USING "paymentStatus"::"RepairPaymentStatus";

-- Step 5 ── Restore the default using the new enum type
ALTER TABLE "Repair"
  ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING'::"RepairPaymentStatus";
