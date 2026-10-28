-- Each staff member saves their own signature once; it prints as the shop's signature on the
-- slips they take in. Additive only: a nullable column.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signatureImage" TEXT;
