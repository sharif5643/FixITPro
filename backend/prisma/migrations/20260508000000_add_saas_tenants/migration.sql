-- ============================================================
-- Migration: add_saas_tenants
-- Safe, non-breaking. Migrates existing data to default tenant.
-- ============================================================

-- ── 1. Extend Role enum with SUPER_ADMIN ─────────────────────
--
-- ALTER TYPE ... ADD VALUE does not touch the type itself or any
-- dependent objects (defaults, columns), so it is safe inside a
-- Prisma-managed transaction on PostgreSQL 12+.
-- IF NOT EXISTS makes the statement idempotent (safe on replay).
--
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- ── 2. Create TenantStatus enum ──────────────────────────────
CREATE TYPE "TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- ── 3. Create TenantPlan enum ─────────────────────────────────
CREATE TYPE "TenantPlan" AS ENUM ('TRIAL', 'BASIC', 'PRO', 'ENTERPRISE');

-- ── 4. Create Tenant table ────────────────────────────────────
CREATE TABLE "Tenant" (
  "id"         TEXT             NOT NULL,
  "shopName"   TEXT             NOT NULL,
  "ownerName"  TEXT             NOT NULL,
  "phone"      TEXT,
  "email"      TEXT             NOT NULL,
  "status"     "TenantStatus"   NOT NULL DEFAULT 'PENDING',
  "plan"       "TenantPlan"     NOT NULL DEFAULT 'TRIAL',
  "startDate"  TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_email_key"      ON "Tenant"("email");
CREATE        INDEX "Tenant_status_idx"     ON "Tenant"("status");
CREATE        INDEX "Tenant_expiryDate_idx" ON "Tenant"("expiryDate");

-- ── 5. Create TenantRenewal table ────────────────────────────
CREATE TABLE "TenantRenewal" (
  "id"         TEXT          NOT NULL,
  "action"     TEXT          NOT NULL,
  "plan"       "TenantPlan"  NOT NULL,
  "duration"   INTEGER       NOT NULL,
  "expiryDate" TIMESTAMP(3)  NOT NULL,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"   TEXT          NOT NULL,

  CONSTRAINT "TenantRenewal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantRenewal_tenantId_idx" ON "TenantRenewal"("tenantId");

ALTER TABLE "TenantRenewal"
  ADD CONSTRAINT "TenantRenewal_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 6. Add tenantId column to User ───────────────────────────
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;

-- ── 7. Seed default tenant for existing data ─────────────────
--
-- A fixed ID so the UPDATE below can reference it without a
-- subquery. This tenant is ENTERPRISE/ACTIVE with a 10-year
-- expiry so existing shops are never locked out.
--
INSERT INTO "Tenant" (
  "id", "shopName", "ownerName", "phone", "email",
  "status", "plan", "startDate", "expiryDate",
  "createdAt", "updatedAt"
) VALUES (
  'cldefaulttenant0000000001',
  'FixITPro Shop',
  'Owner',
  NULL,
  'system@fixitpro.internal',
  'ACTIVE',
  'ENTERPRISE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '3650 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- ── 8. Migrate all existing users to the default tenant ──────
UPDATE "User" SET "tenantId" = 'cldefaulttenant0000000001';

-- ── 9. Add FK + index on User.tenantId ───────────────────────
ALTER TABLE "User"
  ADD CONSTRAINT "User_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
