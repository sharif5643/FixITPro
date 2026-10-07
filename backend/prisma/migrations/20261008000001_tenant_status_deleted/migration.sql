-- A trial shop the system admin removed: hidden from lists, its people cannot log in, its email
-- is free to sign up again. Its records stay (restorable). Additive: a new enum value only.
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'DELETED';
