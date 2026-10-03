-- Each person's own rate per repair type (baht or percent per type). Nullable, additive.
ALTER TABLE "StaffCommission" ADD COLUMN IF NOT EXISTS "repairRates" JSONB;
