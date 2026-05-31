-- ============================================================
-- Migration: add_payment_verification
-- Adds TenantPayment table for manual payment verification flow
-- ============================================================

-- ── 1. Create PaymentStatus enum ─────────────────────────────
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- ── 2. Create TenantPayment table ────────────────────────────
CREATE TABLE "TenantPayment" (
  "id"               TEXT             NOT NULL,
  "plan"             "TenantPlan"     NOT NULL,
  "duration"         INTEGER          NOT NULL,
  "customExpiryDate" TIMESTAMP(3),
  "paymentReference" TEXT,
  "paymentDate"      TIMESTAMP(3),
  "paymentAmount"    DECIMAL(10, 2),
  "paymentNote"      TEXT,
  "status"           "PaymentStatus"  NOT NULL DEFAULT 'PENDING',
  "adminNote"        TEXT,
  "verifiedAt"       TIMESTAMP(3),
  "activatedAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"         TEXT             NOT NULL,
  "verifiedById"     TEXT,
  "activatedById"    TEXT,

  CONSTRAINT "TenantPayment_pkey" PRIMARY KEY ("id")
);

-- ── 3. Indexes ────────────────────────────────────────────────
CREATE INDEX "TenantPayment_tenantId_status_idx" ON "TenantPayment"("tenantId", "status");
CREATE INDEX "TenantPayment_status_createdAt_idx" ON "TenantPayment"("status", "createdAt");

-- ── 4. Foreign keys ───────────────────────────────────────────
ALTER TABLE "TenantPayment"
  ADD CONSTRAINT "TenantPayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TenantPayment"
  ADD CONSTRAINT "TenantPayment_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TenantPayment"
  ADD CONSTRAINT "TenantPayment_activatedById_fkey"
  FOREIGN KEY ("activatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
