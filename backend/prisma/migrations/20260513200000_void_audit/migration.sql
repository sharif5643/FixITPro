-- Add void audit trail to Sale
ALTER TABLE "Sale"
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidedAt"   TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

CREATE INDEX "Sale_voidedById_idx" ON "Sale"("voidedById");

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
