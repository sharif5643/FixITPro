-- Sprint: Accounting Hardening & Reconciliation
-- Adds CashDrawerPolicy to Branch, structured fields + idempotencyKey to CashDrawerTransaction,
-- makes sessionId/cashDrawerId nullable for ALLOW_UNASSIGNED entries,
-- and backfills referenceType/referenceId/sourceType/paymentMethod from existing metadata JSON.

-- CreateEnum
CREATE TYPE "CashDrawerPolicy" AS ENUM ('STRICT', 'ALLOW_UNASSIGNED');

-- DropForeignKey (will be re-added as nullable below)
ALTER TABLE "CashDrawerTransaction" DROP CONSTRAINT "CashDrawerTransaction_cashDrawerId_fkey";
ALTER TABLE "CashDrawerTransaction" DROP CONSTRAINT "CashDrawerTransaction_sessionId_fkey";

-- AlterTable Branch
ALTER TABLE "Branch" ADD COLUMN "cashDrawerPolicy" "CashDrawerPolicy" NOT NULL DEFAULT 'STRICT';

-- AlterTable CashDrawerTransaction: add structured columns, make session/drawer nullable
ALTER TABLE "CashDrawerTransaction"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "paymentMethod"  TEXT,
  ADD COLUMN "sourceType"     TEXT,
  ALTER COLUMN "sessionId"    DROP NOT NULL,
  ALTER COLUMN "cashDrawerId" DROP NOT NULL;

-- Unique index for idempotencyKey
CREATE UNIQUE INDEX "CashDrawerTransaction_idempotencyKey_key"
  ON "CashDrawerTransaction"("idempotencyKey");

-- Index for sourceType queries
CREATE INDEX "CashDrawerTransaction_sourceType_idx"
  ON "CashDrawerTransaction"("sourceType");

-- Re-add FK constraints as nullable (SET NULL on delete)
ALTER TABLE "CashDrawerTransaction"
  ADD CONSTRAINT "CashDrawerTransaction_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CashDrawerSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashDrawerTransaction"
  ADD CONSTRAINT "CashDrawerTransaction_cashDrawerId_fkey"
  FOREIGN KEY ("cashDrawerId") REFERENCES "CashDrawer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: populate sourceType, referenceType, referenceId from metadata JSON
-- (metadata was written by AccountingService as { sourceType, sourceId })
UPDATE "CashDrawerTransaction"
SET
  "sourceType"    = metadata::jsonb ->> 'sourceType',
  "referenceType" = metadata::jsonb ->> 'sourceType',
  "referenceId"   = metadata::jsonb ->> 'sourceId',
  "paymentMethod" = 'CASH'
WHERE
  metadata IS NOT NULL
  AND metadata::jsonb ->> 'sourceId' IS NOT NULL
  AND "referenceId" IS NULL;
