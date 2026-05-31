/**
 * DEV-ONLY script — reset password for owner@fixitpro.com to admin1234
 *
 * Run from D:\FixITPro\backend:
 *   node scripts/reset-dev-owner-password.js
 *
 * Safety guards:
 *   - Loads .env.development exclusively
 *   - Aborts if DATABASE_URL contains "fixitpro_prod" (PROD guard)
 *   - Never writes to .env.production
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

// ── 1. Load .env.development only ────────────────────────────────────────────

const envPath = path.join(__dirname, '..', '.env.development');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env.development not found at', envPath);
  process.exit(1);
}

dotenv.config({ path: envPath, override: true });

// ── 2. PROD guard ─────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is not set after loading .env.development');
  process.exit(1);
}
if (dbUrl.includes('fixitpro_prod')) {
  console.error('ABORT: DATABASE_URL points to fixitpro_prod — this is the PROD database.');
  console.error('       This script must only run against the DEV database.');
  process.exit(1);
}
if (!dbUrl.includes('fixitpro')) {
  console.error('ABORT: DATABASE_URL does not look like the DEV database (expected "fixitpro").');
  console.error('       DATABASE_URL =', dbUrl.replace(/:([^:@]+)@/, ':***@'));
  process.exit(1);
}

const safeUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
console.log('[DEV GUARD] DATABASE_URL =', safeUrl, '✓');

// ── 3. Reset password ─────────────────────────────────────────────────────────

const TARGET_EMAIL    = 'owner@fixitpro.com';
const TARGET_PASSWORD = 'admin1234';
const BCRYPT_ROUNDS   = 12;

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    console.log(`\nHashing password (bcrypt, ${BCRYPT_ROUNDS} rounds)...`);
    const hash = await bcrypt.hash(TARGET_PASSWORD, BCRYPT_ROUNDS);

    console.log(`Updating user: ${TARGET_EMAIL}`);
    const user = await prisma.user.update({
      where:  { email: TARGET_EMAIL },
      data:   { password: hash, isActive: true },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    console.log('\n✅  Password reset successful');
    console.log('   email    :', user.email);
    console.log('   name     :', user.name);
    console.log('   role     :', user.role);
    console.log('   isActive :', user.isActive);
    console.log('\n   Login with: email=owner@fixitpro.com  password=admin1234');
  } catch (err) {
    if (err.code === 'P2025') {
      console.error(`ERROR: User "${TARGET_EMAIL}" not found in the DEV database.`);
    } else {
      console.error('ERROR:', err.message ?? err);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
