-- Restore DEFAULT on Customer.tags (was dropped by add_expenses migration)
-- tags is NOT NULL so omitting it in INSERT causes a constraint violation without a default.
ALTER TABLE "Customer" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
