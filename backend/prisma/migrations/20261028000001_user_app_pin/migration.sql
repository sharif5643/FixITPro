-- Staff app lock (PIN / fingerprint). Additive only: two columns, existing rows get no PIN.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appPinHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appPinFailures" INTEGER NOT NULL DEFAULT 0;
