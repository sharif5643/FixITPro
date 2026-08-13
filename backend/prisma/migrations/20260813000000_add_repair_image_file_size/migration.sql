-- Phase 10: Add fileSize to RepairImage for storage quota tracking.
-- Nullable: existing rows pre-Phase 10 will have NULL (treated as 0 in quota calc).
ALTER TABLE "RepairImage" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
