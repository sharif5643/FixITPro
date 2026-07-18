/**
 * seed-prod-super-admin.ts
 *
 * Creates or resets the SUPER_ADMIN account in production.
 * Safe to re-run: only touches SUPER_ADMIN_EMAIL and ShopSettings row 1.
 * All other users and data are left completely unchanged.
 *
 * RC2-003: Credentials must come from environment variables. Never hardcode them.
 * The script aborts if any required variable is missing or weak.
 *
 * Usage:
 *   SUPER_ADMIN_PASSWORD=<strong-password> npm run seed:prod-super-admin
 *
 * Or set all variables in .env.production before running:
 *   npm run seed:prod-super-admin
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ── Credential policy ─────────────────────────────────────────────────────────
const KNOWN_WEAK_PASSWORDS = new Set([
  'admin1234', 'admin123', 'admin', 'password', '123456',
  'changeme', 'change_this_password', 'REPLACE_WITH_STRONG_PASSWORD',
  'superadmin', 'super', 'fixitpro', 'test', 'qwerty',
]);
const MIN_PASSWORD_LENGTH = 12;

// ── Require DATABASE_URL explicitly — no fallback to hardcoded prod URL ───────
if (!process.env.DATABASE_URL) {
  console.error('');
  console.error('  ERROR: DATABASE_URL is not set.');
  console.error('  Set it explicitly before running this script:');
  console.error('    DATABASE_URL=postgresql://fixitpro_app:<password>@localhost:5432/fixitpro_prod \\');
  console.error('    SUPER_ADMIN_PASSWORD=<strong-password> \\');
  console.error('    npm run seed:prod-super-admin');
  console.error('');
  process.exit(1);
}

const db     = process.env.DATABASE_URL;
const dbName = db.split('/').pop()?.split('?')[0] ?? db;

console.log('');
console.log('  seed-prod-super-admin');
console.log(`  Database : ${dbName}`);
console.log('');

if (dbName.includes('dev') || dbName === 'fixitpro') {
  console.error('  ABORT: DATABASE_URL points to a dev database. Refusing to run.');
  process.exit(1);
}

// ── Validate SUPER_ADMIN_PASSWORD ─────────────────────────────────────────────
const SUPER_ADMIN_EMAIL    = process.env.SUPER_ADMIN_EMAIL ?? 'admin@fixitpro.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!SUPER_ADMIN_PASSWORD) {
  console.error('  ERROR: SUPER_ADMIN_PASSWORD is not set.');
  console.error('  Set it as an environment variable before running this script.');
  process.exit(1);
}

if (SUPER_ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
  console.error(`  ERROR: SUPER_ADMIN_PASSWORD is too short (${SUPER_ADMIN_PASSWORD.length} chars, minimum ${MIN_PASSWORD_LENGTH}).`);
  process.exit(1);
}

if (KNOWN_WEAK_PASSWORDS.has(SUPER_ADMIN_PASSWORD)) {
  console.error('  ERROR: SUPER_ADMIN_PASSWORD is a known weak or placeholder value. Use a strong unique password.');
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;

const prisma = new PrismaClient();

async function main() {
  console.log('  Hashing password...');
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD!, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } });

  if (existing) {
    console.log(`  User found  : ${SUPER_ADMIN_EMAIL} (id=${existing.id})`);
    console.log(`  Role        : ${existing.role}`);
    console.log(`  isActive    : ${existing.isActive}`);
    console.log('  Resetting password hash + ensuring SUPER_ADMIN role + isActive=true...');
    await prisma.user.update({
      where: { email: SUPER_ADMIN_EMAIL },
      data: {
        password:            hashedPassword,
        role:                'SUPER_ADMIN',
        isActive:            true,
        forcePasswordChange: false,
        tenantId:            null,
      },
    });
    console.log('  Super admin : UPDATED');
  } else {
    console.log(`  User not found. Creating ${SUPER_ADMIN_EMAIL}...`);
    await prisma.user.create({
      data: {
        email:               SUPER_ADMIN_EMAIL,
        name:                'Super Admin',
        password:            hashedPassword,
        role:                'SUPER_ADMIN',
        isActive:            true,
        forcePasswordChange: false,
      },
    });
    console.log('  Super admin : CREATED');
  }

  await prisma.shopSettings.upsert({
    where:  { id: 1 },
    create: { id: 1 },
    update: {},
  });
  console.log('  ShopSettings: OK');

  console.log('');
  console.log('  =========================================');
  console.log('  DONE. Super Admin account is ready.');
  console.log(`    Email: ${SUPER_ADMIN_EMAIL}`);
  console.log('    Password: [set via SUPER_ADMIN_PASSWORD env var — not logged]');
  console.log('  =========================================');
  console.log('');
}

main()
  .catch((err) => { console.error('  ERROR:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
