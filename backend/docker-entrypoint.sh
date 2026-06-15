#!/bin/sh
set -e

# Ensure uploads subdirectories exist (idempotent — safe on every restart).
# The volume mount at /app/uploads is writable by the nestjs user.
mkdir -p /app/uploads/repairs

echo "[entrypoint] Running Prisma migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting FixITPro Backend..."
exec node dist/src/main
