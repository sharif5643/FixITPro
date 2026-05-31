-- CreateTable
CREATE TABLE "RepairImage" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairImage_repairId_idx" ON "RepairImage"("repairId");

-- AddForeignKey
ALTER TABLE "RepairImage" ADD CONSTRAINT "RepairImage_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
