/**
 * fix-prod-tenant-owner.ts
 *
 * Repairs the FixITPro Shop tenant owner linkage in fixitpro_prod.
 * Safe to re-run — all writes are idempotent.
 * No data is deleted. Only the tenant's email/ownerName and the owner
 * user's tenantId are updated; everything else is untouched.
 *
 * Usage:
 *   npm run fix:prod-tenant-owner
 */

import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:123456@localhost:5432/fixitpro_prod';
}

const dbName = (process.env.DATABASE_URL.split('/').pop() ?? '').split('?')[0];

console.log('');
console.log('  fix-prod-tenant-owner');
console.log(`  Database : ${dbName}`);
console.log('');

if (dbName.includes('dev')) {
  console.error('  ABORT: DATABASE_URL points to a dev database. Refusing to run.');
  process.exit(1);
}

const prisma = new PrismaClient();

const OWNER_EMAIL        = 'owner@fixitpro.com';
const PLACEHOLDER_EMAIL  = 'system@fixitpro.internal';

async function main() {
  // ── 1. Load current state ──────────────────────────────────────────────────
  const tenant = await prisma.tenant.findFirst({
    where: { shopName: 'FixITPro Shop' },
  });

  if (!tenant) {
    console.error('  ERROR: No tenant with shopName "FixITPro Shop" found.');
    process.exit(1);
  }

  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });

  if (!owner) {
    console.error(`  ERROR: User ${OWNER_EMAIL} not found. Run seed:prod-owner first.`);
    process.exit(1);
  }

  console.log('  Current state:');
  console.log(`    Tenant   id         : ${tenant.id}`);
  console.log(`    Tenant   email      : ${tenant.email}`);
  console.log(`    Tenant   ownerName  : ${tenant.ownerName}`);
  console.log(`    Owner    email      : ${owner.email}`);
  console.log(`    Owner    tenantId   : ${owner.tenantId ?? 'null'}`);
  console.log('');

  // ── 2. Check if already correct ───────────────────────────────────────────
  const tenantEmailOk = tenant.email === OWNER_EMAIL;
  const ownerLinkOk   = owner.tenantId === tenant.id;

  if (tenantEmailOk && ownerLinkOk) {
    console.log('  Already correct — nothing to do.');
    console.log('');
    return;
  }

  // ── 3. Apply fixes in a transaction ───────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // 3a. Update tenant.email and ownerName
    if (!tenantEmailOk) {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          email:     OWNER_EMAIL,
          ownerName: owner.name,
          phone:     owner.phone ?? tenant.phone,
        },
      });
      console.log(`  Tenant.email     : ${tenant.email} → ${OWNER_EMAIL}`);
      console.log(`  Tenant.ownerName : ${tenant.ownerName} → ${owner.name}`);
    }

    // 3b. Link owner user to this tenant
    if (!ownerLinkOk) {
      await tx.user.update({
        where: { email: OWNER_EMAIL },
        data: { tenantId: tenant.id },
      });
      console.log(`  User.tenantId    : null → ${tenant.id}`);
    }
  });

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('  =========================================');
  console.log('  DONE. Tenant owner repaired:');
  console.log(`    Tenant   : ${tenant.shopName} (${tenant.id})`);
  console.log(`    Owner    : ${OWNER_EMAIL}`);
  console.log('  Super Admin → Tenants will now show owner@fixitpro.com');
  console.log('  =========================================');
  console.log('');
}

main()
  .catch((err) => { console.error('  ERROR:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
