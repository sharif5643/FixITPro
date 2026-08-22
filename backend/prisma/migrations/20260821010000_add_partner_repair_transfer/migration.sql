-- CreateEnum
CREATE TYPE "PartnerRepairTransferStatus" AS ENUM (
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'REJECTED',
  'DEVICE_RECEIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'DEVICE_RETURNED',
  'OWNER_RECEIVED',
  'CANCELLED',
  'RECALLED'
);

-- CreateTable
CREATE TABLE "PartnerRepairTransfer" (
  "id"                 TEXT NOT NULL,
  "status"             "PartnerRepairTransferStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
  "agreedPartnerPrice" DECIMAL(10,2),
  "pricingNote"        TEXT,
  "sharedDeviceInfo"   JSONB,
  "sharedImageUrls"    JSONB,
  "partnerWorkNote"    TEXT,
  "partnerPartsNote"   TEXT,
  "sentAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt"         TIMESTAMP(3),
  "rejectedAt"         TIMESTAMP(3),
  "rejectionNote"      TEXT,
  "deviceReceivedAt"   TIMESTAMP(3),
  "partnerStartedAt"   TIMESTAMP(3),
  "completedAt"        TIMESTAMP(3),
  "completionNote"     TEXT,
  "returnedAt"         TIMESTAMP(3),
  "ownerReceivedAt"    TIMESTAMP(3),
  "cancelledAt"        TIMESTAMP(3),
  "cancellationNote"   TEXT,
  "recalledAt"         TIMESTAMP(3),
  "recallNote"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "repairId"           TEXT NOT NULL,
  "relationshipId"     TEXT NOT NULL,
  "ownerTenantId"      TEXT NOT NULL,
  "ownerBranchId"      TEXT,
  "partnerTenantId"    TEXT NOT NULL,
  "partnerBranchId"    TEXT,
  "sentById"           TEXT NOT NULL,
  "acceptedById"       TEXT,
  "rejectedById"       TEXT,
  "receivedById"       TEXT,
  "partnerStartedById" TEXT,
  "completedById"      TEXT,
  "returnedById"       TEXT,
  "ownerReceivedById"  TEXT,
  "cancelledById"      TEXT,
  "recalledById"       TEXT,
  CONSTRAINT "PartnerRepairTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRepairTransferEvent" (
  "id"         TEXT NOT NULL,
  "event"      TEXT NOT NULL,
  "note"       TEXT,
  "actorId"    TEXT,
  "actorName"  TEXT,
  "actorRole"  TEXT,
  "tenantId"   TEXT,
  "metadata"   JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transferId" TEXT NOT NULL,
  CONSTRAINT "PartnerRepairTransferEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey — PartnerRepairTransfer
ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_relationshipId_fkey"
  FOREIGN KEY ("relationshipId") REFERENCES "PartnerRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_ownerTenantId_fkey"
  FOREIGN KEY ("ownerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_ownerBranchId_fkey"
  FOREIGN KEY ("ownerBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_partnerTenantId_fkey"
  FOREIGN KEY ("partnerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_partnerBranchId_fkey"
  FOREIGN KEY ("partnerBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_sentById_fkey"
  FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_partnerStartedById_fkey"
  FOREIGN KEY ("partnerStartedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_returnedById_fkey"
  FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_ownerReceivedById_fkey"
  FOREIGN KEY ("ownerReceivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairTransfer" ADD CONSTRAINT "PartnerRepairTransfer_recalledById_fkey"
  FOREIGN KEY ("recalledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey — PartnerRepairTransferEvent
ALTER TABLE "PartnerRepairTransferEvent" ADD CONSTRAINT "PartnerRepairTransferEvent_transferId_fkey"
  FOREIGN KEY ("transferId") REFERENCES "PartnerRepairTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — PartnerRepairTransfer
CREATE INDEX "PartnerRepairTransfer_repairId_idx" ON "PartnerRepairTransfer"("repairId");
CREATE INDEX "PartnerRepairTransfer_ownerTenantId_status_idx" ON "PartnerRepairTransfer"("ownerTenantId", "status");
CREATE INDEX "PartnerRepairTransfer_partnerTenantId_status_idx" ON "PartnerRepairTransfer"("partnerTenantId", "status");
CREATE INDEX "PartnerRepairTransfer_status_idx" ON "PartnerRepairTransfer"("status");
CREATE INDEX "PartnerRepairTransfer_createdAt_idx" ON "PartnerRepairTransfer"("createdAt");

-- CreateIndex — PartnerRepairTransferEvent
CREATE INDEX "PartnerRepairTransferEvent_transferId_idx" ON "PartnerRepairTransferEvent"("transferId");
CREATE INDEX "PartnerRepairTransferEvent_createdAt_idx" ON "PartnerRepairTransferEvent"("createdAt");

-- Partial unique index: only one active transfer per repair
-- Terminal statuses (CANCELLED, REJECTED, RECALLED, OWNER_RECEIVED) are excluded,
-- allowing a new transfer to be created after a terminal one closes.
CREATE UNIQUE INDEX "PartnerRepairTransfer_repairId_active_key"
  ON "PartnerRepairTransfer" ("repairId")
  WHERE "status" NOT IN ('CANCELLED', 'REJECTED', 'RECALLED', 'OWNER_RECEIVED');
