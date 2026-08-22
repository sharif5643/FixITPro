-- Phase 4C.2: Partner Relationship Management
-- Adds the PartnerRelationship table to support cross-tenant partner repair workflows.
-- Purely additive — no changes to existing tables (column-level).
-- Relation fields on Tenant and User are Prisma-only metadata; no DB columns are added.

-- CreateEnum
CREATE TYPE "PartnerRelationshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "PartnerRelationship" (
    "id" TEXT NOT NULL,
    "status" "PartnerRelationshipStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "initiatorTenantId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "respondedById" TEXT,

    CONSTRAINT "PartnerRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerRelationship_initiatorTenantId_partnerTenantId_key"
  ON "PartnerRelationship"("initiatorTenantId", "partnerTenantId");

-- CreateIndex
CREATE INDEX "PartnerRelationship_initiatorTenantId_status_idx"
  ON "PartnerRelationship"("initiatorTenantId", "status");

-- CreateIndex
CREATE INDEX "PartnerRelationship_partnerTenantId_status_idx"
  ON "PartnerRelationship"("partnerTenantId", "status");

-- CreateIndex
CREATE INDEX "PartnerRelationship_status_idx"
  ON "PartnerRelationship"("status");

-- CreateIndex
CREATE INDEX "PartnerRelationship_createdAt_idx"
  ON "PartnerRelationship"("createdAt");

-- AddForeignKey
ALTER TABLE "PartnerRelationship"
  ADD CONSTRAINT "PartnerRelationship_initiatorTenantId_fkey"
  FOREIGN KEY ("initiatorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRelationship"
  ADD CONSTRAINT "PartnerRelationship_partnerTenantId_fkey"
  FOREIGN KEY ("partnerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRelationship"
  ADD CONSTRAINT "PartnerRelationship_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRelationship"
  ADD CONSTRAINT "PartnerRelationship_respondedById_fkey"
  FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
