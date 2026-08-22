-- Phase 4C.5 — Partner Repair Quotation tables

CREATE TYPE "PartnerRepairQuotationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTER_OFFER', 'EXPIRED', 'CANCELLED');

CREATE TABLE "PartnerRepairQuotation" (
    "id"                 TEXT NOT NULL,
    "version"            INTEGER NOT NULL,
    "status"             "PartnerRepairQuotationStatus" NOT NULL DEFAULT 'PENDING',
    "proposedAmount"     DECIMAL(12,2) NOT NULL,
    "currency"           TEXT NOT NULL DEFAULT 'THB',
    "note"               TEXT,
    "respondedAt"        TIMESTAMP(3),
    "expiresAt"          TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    "transferId"         TEXT NOT NULL,
    "proposedByTenantId" TEXT NOT NULL,
    "proposedByUserId"   TEXT NOT NULL,
    "respondedByUserId"  TEXT,

    CONSTRAINT "PartnerRepairQuotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerRepairQuotationEvent" (
    "id"          TEXT NOT NULL,
    "event"       TEXT NOT NULL,
    "amount"      DECIMAL(12,2),
    "note"        TEXT,
    "actorId"     TEXT,
    "actorName"   TEXT,
    "tenantId"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quotationId" TEXT NOT NULL,

    CONSTRAINT "PartnerRepairQuotationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerRepairQuotation_transferId_version_key"
    ON "PartnerRepairQuotation"("transferId", "version");

CREATE INDEX "PartnerRepairQuotation_transferId_idx"
    ON "PartnerRepairQuotation"("transferId");

CREATE INDEX "PartnerRepairQuotation_proposedByTenantId_idx"
    ON "PartnerRepairQuotation"("proposedByTenantId");

CREATE INDEX "PartnerRepairQuotationEvent_quotationId_idx"
    ON "PartnerRepairQuotationEvent"("quotationId");

ALTER TABLE "PartnerRepairQuotation"
    ADD CONSTRAINT "PartnerRepairQuotation_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "PartnerRepairTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairQuotation"
    ADD CONSTRAINT "PartnerRepairQuotation_proposedByTenantId_fkey"
    FOREIGN KEY ("proposedByTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairQuotation"
    ADD CONSTRAINT "PartnerRepairQuotation_proposedByUserId_fkey"
    FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairQuotation"
    ADD CONSTRAINT "PartnerRepairQuotation_respondedByUserId_fkey"
    FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerRepairQuotationEvent"
    ADD CONSTRAINT "PartnerRepairQuotationEvent_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "PartnerRepairQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
