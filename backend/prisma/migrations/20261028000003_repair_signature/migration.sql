-- Customer signatures captured on screen for a repair (intake / price approval). Additive only: a new table.
CREATE TABLE IF NOT EXISTS "RepairSignature" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "signerName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairSignature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RepairSignature_repairId_kind_key" ON "RepairSignature"("repairId", "kind");
DO $$ BEGIN
  ALTER TABLE "RepairSignature" ADD CONSTRAINT "RepairSignature_repairId_fkey"
    FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
