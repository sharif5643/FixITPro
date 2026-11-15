-- Withholding tax certificates on repair jobs (settle part of a bill without cash). Additive only:
-- one new table.
CREATE TABLE "WithholdingTax" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "repairId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerTaxId" TEXT,
    "certificateNo" TEXT,
    "certificateDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    CONSTRAINT "WithholdingTax_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WithholdingTax_tenantId_certificateDate_idx" ON "WithholdingTax"("tenantId", "certificateDate");
CREATE INDEX "WithholdingTax_repairId_idx" ON "WithholdingTax"("repairId");
