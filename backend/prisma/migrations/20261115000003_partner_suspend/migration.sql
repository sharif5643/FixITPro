-- Partnerships can be suspended by either shop (and resumed by the shop that suspended).
-- Additive only: two nullable columns.
ALTER TABLE "PartnerRelationship" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "PartnerRelationship" ADD COLUMN "suspendedByTenantId" TEXT;
