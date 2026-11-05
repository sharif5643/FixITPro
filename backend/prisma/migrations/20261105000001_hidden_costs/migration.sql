-- Hidden costs (ต้นทุนแฝง): give-aways on a bill and delivery fees for a repair's parts.
-- Additive only: new nullable / defaulted columns and a new table. No existing row changes.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "giveawayOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "freebies" JSONB;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "isFreebie" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "freebieValue" DECIMAL(10,2);

CREATE TABLE IF NOT EXISTS "RepairExtraCost" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "fromDrawer" BOOLEAN NOT NULL DEFAULT true,
    "shiftId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repairId" TEXT NOT NULL,
    CONSTRAINT "RepairExtraCost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RepairExtraCost_repairId_idx" ON "RepairExtraCost"("repairId");
CREATE INDEX IF NOT EXISTS "RepairExtraCost_createdAt_idx" ON "RepairExtraCost"("createdAt");
DO $$ BEGIN
  ALTER TABLE "RepairExtraCost" ADD CONSTRAINT "RepairExtraCost_repairId_fkey"
    FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
