/**
 * seed-prod-owner.ts
 *
 * Creates or repairs the OWNER account in fixitpro_prod.
 * Safe to re-run: only touches owner@fixitpro.com and ShopSettings row 1.
 * All other users and data are left completely unchanged.
 *
 * Usage:
 *   npm run seed:prod-owner
 * or explicitly:
 *   DATABASE_URL=postgresql://postgres:123456@localhost:5432/fixitpro_prod npx ts-node prisma/seed-prod-owner.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Default to PROD if no DATABASE_URL is set — never touches DEV.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:123456@localhost:5432/fixitpro_prod';
}

const db = process.env.DATABASE_URL;
const dbName = db.split('/').pop()?.split('?')[0] ?? db;

console.log('');
console.log('  seed-prod-owner');
console.log(`  Database : ${dbName}`);
console.log('');

if (dbName.includes('dev')) {
  console.error('  ABORT: DATABASE_URL points to a dev database. Refusing to run.');
  process.exit(1);
}

const prisma = new PrismaClient();

const OWNER_EMAIL    = 'owner@fixitpro.com';
const OWNER_PASSWORD = 'admin1234';
const BCRYPT_ROUNDS  = 12; // must match AuthService

async function main() {
  // ── 1. Hash password (same method as AuthService) ──────────────────────────
  console.log('  Hashing password...');
  const hashedPassword = await bcrypt.hash(OWNER_PASSWORD, BCRYPT_ROUNDS);

  // ── 2. Upsert owner user ───────────────────────────────────────────────────
  // update block always runs so an existing user with a broken hash is repaired.
  // Only owner@fixitpro.com is touched — no other rows are written.
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

  // ── 3. Ensure ShopSettings row exists ─────────────────────────────────────
  await prisma.shopSettings.upsert({
    where:  { id: 1 },
    create: { id: 1 },
    update: {},
  });
  console.log('  ShopSettings: OK');

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('  =========================================');
  console.log('  DONE. Login credentials:');
  console.log(`    Email    : ${OWNER_EMAIL}`);
  console.log(`    Password : ${OWNER_PASSWORD}`);
  console.log('  =========================================');
  console.log('');
}

main()
  .catch((err) => { console.error('  ERROR:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
