-- Phase 4A.1: Journal idempotency — partial unique index
-- Prevents duplicate JournalEntry records for the same (sourceType, sourceId, tenantId)
-- when both sourceType and sourceId are non-NULL (business-originated journals).
-- Manual journals (sourceType/sourceId NULL) are intentionally excluded from this constraint.
--
-- NOTE: PostgreSQL partial unique indexes cannot be expressed in the Prisma schema DSL.
-- This migration is managed manually. Do NOT run 'prisma migrate dev' without first
-- reviewing this constraint, as Prisma may generate a DROP INDEX migration for it.
--
-- Additive only — no DROP, DELETE, TRUNCATE, UPDATE, or ALTER on existing tables.

CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
  ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
