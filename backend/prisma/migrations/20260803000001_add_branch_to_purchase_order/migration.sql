-- Add branchId (nullable) to PurchaseOrder
-- Existing rows get NULL — they fall back to context-branch at receive time (backward-compatible)

ALTER TABLE "PurchaseOrder" ADD COLUMN "branchId" TEXT;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_branchId_idx" ON "PurchaseOrder"("branchId");
