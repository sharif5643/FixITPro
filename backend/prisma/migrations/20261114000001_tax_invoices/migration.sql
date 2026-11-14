-- Tax invoices for shops that charge VAT: abbreviated tax invoices and credit notes, with a
-- running number per shop, branch and year. Additive only: two new tables and two empty columns on
-- purchase orders; nothing existing changes.
CREATE TABLE "TaxInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reference" TEXT,
    "customerName" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "vatBase" DECIMAL(12,2) NOT NULL,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "vatPercent" DECIMAL(5,2) NOT NULL,
    "refId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "vatBookedAt" TIMESTAMP(3),
    "cancelBookedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaxInvoice_tenantId_kind_number_key" ON "TaxInvoice"("tenantId", "kind", "number");
CREATE INDEX "TaxInvoice_tenantId_issuedAt_idx" ON "TaxInvoice"("tenantId", "issuedAt");
CREATE INDEX "TaxInvoice_sourceType_sourceId_idx" ON "TaxInvoice"("sourceType", "sourceId");

CREATE TABLE "TaxInvoiceCounter" (
    "tenantId" TEXT NOT NULL,
    "branchKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaxInvoiceCounter_pkey" PRIMARY KEY ("tenantId", "branchKey", "kind", "year")
);

-- The supplier's tax invoice number and date on a purchase order (purchase tax report)
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierTaxInvoiceNo" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierTaxInvoiceDate" TIMESTAMP(3);
