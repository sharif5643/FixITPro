-- The Super Admin sets how many branches a shop may open. Additive only: a nullable column;
-- empty (every existing shop) keeps the plan's limit.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "maxBranches" INTEGER;
