-- A formal document (e.g. a full tax invoice) can be cancelled and replaced; the cancelled paper is
-- kept. Additive only: three empty columns.
ALTER TABLE "FormalDocument" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "FormalDocument" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "FormalDocument" ADD COLUMN "cancelledBy" TEXT;
