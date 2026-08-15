-- Phase 17: Add DailyClose table for end-of-day cash reconciliation.

CREATE TABLE "DailyClose" (
  "id"              TEXT NOT NULL,
  "date"            TEXT NOT NULL,
  "posRevenue"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "repairRevenue"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "packageRevenue"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "expenseTotal"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "grandTotal"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cashRevenue"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "transferRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cardRevenue"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "actualCash"      DECIMAL(12,2),
  "cashDifference"  DECIMAL(12,2),
  "notes"           TEXT,
  "closedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"        TEXT,
  "branchId"        TEXT,
  "closedById"      TEXT NOT NULL,

  CONSTRAINT "DailyClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyClose_date_branchId_tenantId_key" ON "DailyClose"("date", "branchId", "tenantId");
CREATE INDEX "DailyClose_tenantId_date_idx" ON "DailyClose"("tenantId", "date");
CREATE INDEX "DailyClose_branchId_date_idx" ON "DailyClose"("branchId", "date");

ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_tenantId_fkey"   FOREIGN KEY ("tenantId")   REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
