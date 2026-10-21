-- Cash left in the drawer at close for the next shift (its opening float). Additive only.
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "floatLeft" DECIMAL(10,2);
