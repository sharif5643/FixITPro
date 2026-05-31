/**
 * seed-prod-super-admin.ts
 *
 * Creates or repairs the SUPER_ADMIN account in fixitpro_prod.
 * Safe to re-run: only touches admin@fixitpro.com and ShopSettings row 1.
 * All other users and data are left completely unchanged.
 *
 * Usage:
 *   npm run seed:prod-super-admin
 * or explicitly:
 *   DATABASE_URL=postgresql://postgres:123456@localhost:5432/fixitpro_prod npx ts-node prisma/seed-prod-super-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Default to PROD if no DATABASE_URL is set — never touches DEV.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:123456@localhost:5432/fixitpro_prod';
}

const db     = process.env.DATABASE_URL;
const dbName = db.split('/').pop()?.split('?')[0] ?? db;

console.log('');
console.log('  seed-prod-super-admin');
console.log(`  Database : ${dbName}`);
console.log('');

if (dbName.includes('dev')) {
  console.error('  ABORT: DATABASE_URL points to a dev database. Refusing to run.');
  process.exit(1);
}

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL    = 'admin@fixitpro.com';
const SUPER_ADMIN_PASSWORD = 'admin1234';
const BCRYPT_ROUNDS        = 12; // must match AuthService

async function main() {
  // ── 1. Hash password (same method as AuthService) ──────────────────────────
  console.log('  Hashing password...');
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, BCRYPT_ROUNDS);

  // ── 2. Upsert SUPER_ADMIN user ─────────────────────────────────────────────
  // update block always runs so an existing user with a broken hash is repaired.
  // Only admin@fixitpro.com is touched — no other rows are written.
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
  console.log('  DONE. Super Admin login credentials:');
  console.log(`    Email    : ${SUPER_ADMIN_EMAIL}`);
  console.log(`    Password : ${SUPER_ADMIN_PASSWORD}`);
  console.log('  After login, redirects to: /super-admin/tenants');
  console.log('  =========================================');
  console.log('');
}

main()
  .catch((err) => { console.error('  ERROR:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
