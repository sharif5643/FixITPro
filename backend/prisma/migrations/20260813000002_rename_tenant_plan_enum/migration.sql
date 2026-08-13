-- Phase 16: Rename TenantPlan enum values and add PRIVATE.
-- ALTER TYPE ... RENAME VALUE (PostgreSQL 10+) is atomic — all rows updated automatically.
-- BASIC → LITE  (Starter tier, 1 branch / 5 GB)
-- ENTERPRISE → BUSINESS  (Multi-branch tier, unlimited / 100 GB)
-- PRIVATE added for custom contracts

ALTER TYPE "TenantPlan" RENAME VALUE 'BASIC' TO 'LITE';
ALTER TYPE "TenantPlan" RENAME VALUE 'ENTERPRISE' TO 'BUSINESS';
ALTER TYPE "TenantPlan" ADD VALUE IF NOT EXISTS 'PRIVATE';
