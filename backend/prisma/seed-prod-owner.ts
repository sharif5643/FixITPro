/**
 * seed-prod-owner.ts
 *
 * Creates or resets the initial OWNER account in production.
 * Safe to re-run: only touches OWNER_EMAIL and ShopSettings row 1.
 * All other users and data are left completely unchanged.
 *
 * RC2-003: Credentials must come from environment variables. Never hardcode them.
 * The script aborts if any required variable is missing or weak.
 *
 * Usage:
 *   OWNER_INITIAL_PASSWORD=<strong-password> npm run seed:prod-owner
 *
 * Or set all variables in .env.production before running.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ── Credential policy ─────────────────────────────────────────────────────────
const KNOWN_WEAK_PASSWORDS = new Set([
  'admin1234', 'admin123', 'admin', 'password', '123456',
  'changeme', 'change_this_password', 'REPLACE_WITH_STRONG_PASSWORD',
  'owner', 'fixitpro', 'test', 'qwerty', 'owner1234',
]);
const MIN_PASSWORD_LENGTH = 12;

// ── Require DATABASE_URL explicitly — no fallback to hardcoded prod URL ───────
if (!process.env.DATABASE_URL) {
  console.error('');
  console.error('  ERROR: DATABASE_URL is not set.');
  console.error('  Set it explicitly before running this script:');
  console.error('    DATABASE_URL=postgresql://fixitpro_app:<password>@localhost:5432/fixitpro_prod \\');
  console.error('    OWNER_INITIAL_PASSWORD=<strong-password> \\');
  console.error('    npm run seed:prod-owner');
  console.error('');
  process.exit(1);
}

const db     = process.env.DATABASE_URL;
const dbName = db.split('/').pop()?.split('?')[0] ?? db;

console.log('');
console.log('  seed-prod-owner');
console.log(`  Database : ${dbName}`);
console.log('');

if (dbName.includes('dev') || dbName === 'fixitpro') {
  console.error('  ABORT: DATABASE_URL points to a dev database. Refusing to run.');
  process.exit(1);
}

// ── Validate OWNER_INITIAL_PASSWORD ──────────────────────────────────────────
const OWNER_EMAIL    = process.env.OWNER_EMAIL ?? 'owner@fixitpro.com';
const OWNER_PASSWORD = process.env.OWNER_INITIAL_PASSWORD;

if (!OWNER_PASSWORD) {
  console.error('  ERROR: OWNER_INITIAL_PASSWORD is not set.');
  console.error('  Set it as an environment variable before running this script.');
  process.exit(1);
}

if (OWNER_PASSWORD.length < MIN_PASSWORD_LENGTH) {
  console.error(`  ERROR: OWNER_INITIAL_PASSWORD is too short (${OWNER_PASSWORD.length} chars, minimum ${MIN_PASSWORD_LENGTH}).`);
  process.exit(1);
}

if (KNOWN_WEAK_PASSWORDS.has(OWNER_PASSWORD)) {
  console.error('  ERROR: OWNER_INITIAL_PASSWORD is a known weak or placeholder value. Use a strong unique password.');
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;

const prisma = new PrismaClient();

async function main() {
  console.log('  Hashing password...');
  const hashedPassword = await bcrypt.hash(OWNER_PASSWORD!, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });

  if (existing) {
    console.log(`  User found  : ${OWNER_EMAIL} (id=${existing.id})`);
    console.log(`  isActive    : ${existing.isActive}`);
    console.log('  Resetting password hash + ensuring isActive=true...');
    await prisma.user.update({
      where: { email: OWNER_EMAIL },
      data: {
        password:            hashedPassword,
        isActive:            true,
        forcePasswordChange: false,
      },
    });
    console.log('  Owner user  : UPDATED');
  } else {
    console.log(`  User not found. Creating ${OWNER_EMAIL}...`);
    await prisma.user.create({
      data: {
        email:               OWNER_EMAIL,
        name:                'เจ้าของร้าน',
        password:            hashedPassword,
        role:                'OWNER',
        isActive:            true,
        forcePasswordChange: false,
      },
    });
    console.log('  Owner user  : CREATED');
  }

  await prisma.shopSettings.upsert({
    where:  { id: 1 },
    create: { id: 1 },
    update: {},
  });
  console.log('  ShopSettings: OK');

  console.log('');
  console.log('  =========================================');
  console.log('  DONE. Owner account is ready.');
  console.log(`    Email: ${OWNER_EMAIL}`);
  console.log('    Password: [set via OWNER_INITIAL_PASSWORD env var — not logged]');
  console.log('  =========================================');
  console.log('');
}

main()
  .catch((err) => { console.error('  ERROR:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
