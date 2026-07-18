-- =============================================================================
-- RC2-003: Create a dedicated least-privilege application role for FixITPro.
--
-- Run this script ONCE as the postgres superuser before the first deployment:
--   psql -U postgres -d postgres -f scripts/create-app-role.sql
--
-- Replace 'REPLACE_WITH_STRONG_PASSWORD' with the actual password first.
-- After creating the role, update DATABASE_URL in .env.production:
--   DATABASE_URL="postgresql://fixitpro_app:<password>@localhost:5432/fixitpro_prod?..."
--
-- Role capabilities (intentionally minimal):
--   ✅ LOGIN — can authenticate
--   ✅ CONNECT — can connect to the fixitpro_prod database
--   ✅ USAGE on public schema — can see objects
--   ✅ SELECT, INSERT, UPDATE, DELETE on all tables — normal DML
--   ✅ USAGE + SELECT on all sequences — for SERIAL / IDENTITY columns
--   ✅ CREATE on public schema — required for Prisma migrate deploy
--   ❌ SUPERUSER — not granted
--   ❌ CREATEDB — not granted
--   ❌ CREATEROLE — not granted
--   ❌ REPLICATION — not granted
--
-- Migration note:
--   Prisma migrate deploy runs DDL (CREATE TABLE, ALTER TABLE, etc.).
--   These operations require CREATE on the public schema. For maximum security
--   you may use a separate migration role with superuser for schema changes and
--   restrict the runtime fixitpro_app role to DML only, but that requires a
--   two-role deploy pipeline (see docs/disaster-recovery.md for details).
-- =============================================================================

\set ON_ERROR_STOP on

-- 1. Create the role if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fixitpro_app'
  ) THEN
    CREATE ROLE fixitpro_app
      WITH LOGIN
      PASSWORD 'REPLACE_WITH_STRONG_PASSWORD'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
    RAISE NOTICE 'Role fixitpro_app created.';
  ELSE
    RAISE NOTICE 'Role fixitpro_app already exists — skipping CREATE ROLE.';
    RAISE NOTICE 'To rotate the password: ALTER ROLE fixitpro_app WITH PASSWORD ''<new-password>'';';
  END IF;
END $$;

-- 2. Grant CONNECT on the production database.
--    Change fixitpro_prod to match your actual database name if different.
GRANT CONNECT ON DATABASE fixitpro_prod TO fixitpro_app;

-- 3. Grant USAGE on the public schema so the role can see objects.
GRANT USAGE ON SCHEMA public TO fixitpro_app;

-- 4. Grant CREATE on public schema so Prisma migrate deploy can create tables.
GRANT CREATE ON SCHEMA public TO fixitpro_app;

-- 5. Grant DML on all existing tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fixitpro_app;

-- 6. Grant sequence access for SERIAL/IDENTITY columns.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fixitpro_app;

-- 7. Set default privileges so future tables/sequences (from migrations) are
--    automatically accessible to fixitpro_app without re-running this script.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fixitpro_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fixitpro_app;

-- 8. Verify the role attributes (review output below to confirm no superuser).
SELECT
  rolname,
  rolsuper      AS "superuser",
  rolcreaterole AS "createrole",
  rolcreatedb   AS "createdb",
  rolcanlogin   AS "login",
  rolreplication AS "replication"
FROM pg_roles
WHERE rolname = 'fixitpro_app';
