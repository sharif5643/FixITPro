/**
 * DEV-ONLY script — seed demo tenants, users, branches, payments and renewals
 * for Super Admin V2 presentation.
 *
 * Run from D:\FixITPro\backend:
 *   npx ts-node scripts/seed-super-admin-demo.ts
 *
 * Safety guards:
 *   - Loads .env.development exclusively
 *   - Aborts if DATABASE_URL contains "fixitpro_prod"
 *   - Idempotent: upserts tenants/users, skips branch/renewal/payment if already present
 */

import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { PrismaClient, TenantStatus, TenantPlan, PaymentStatus } from '@prisma/client';

// ── 1. Load .env.development ──────────────────────────────────────────────────

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
  process.exit(1);
}
const safeUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
console.log('[DEV GUARD] DATABASE_URL =', safeUrl, '✓\n');

// ── 3. Demo data definitions ──────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const OWNER_PASSWORD = 'demo1234';

interface DemoTenant {
  shopName: string;
  ownerName: string;
  email: string;           // tenant unique email (also used as owner user email)
  phone: string;
  status: TenantStatus;
  plan: TenantPlan;
  startDate: Date | null;
  expiryDate: Date | null;
  notes: string;
}

const now = new Date('2026-06-07T12:00:00Z');

const DEMO_TENANTS: DemoTenant[] = [
  {
    shopName: 'Charif PC & All',
    ownerName: 'นายชารีฟ อาลี',
    email: 'demo.charifpc@fixitpro.dev',
    phone: '081-234-5678',
    status: 'ACTIVE',
    plan: 'ENTERPRISE',
    startDate: new Date('2026-06-07'),
    expiryDate: new Date('2027-06-07'),
    notes: 'Enterprise plan — flagship demo tenant',
  },
  {
    shopName: 'TJ Computer',
    ownerName: 'นายธีรวัฒน์ จันทร์ดี',
    email: 'demo.tjcomputer@fixitpro.dev',
    phone: '082-345-6789',
    status: 'ACTIVE',
    plan: 'PRO',
    startDate: new Date('2026-05-12'),
    expiryDate: new Date('2026-06-12'),  // expiring in 5 days
    notes: 'Business plan — expiring soon (renewal pending)',
  },
  {
    shopName: 'Smart Fix Thailand',
    ownerName: 'นางสาวสมใจ รักดี',
    email: 'demo.smartfix@fixitpro.dev',
    phone: '083-456-7890',
    status: 'SUSPENDED',
    plan: 'BASIC',
    startDate: new Date('2026-04-01'),
    expiryDate: new Date('2026-05-01'),
    notes: 'Starter plan — suspended after rejected payment',
  },
  {
    shopName: 'BB IT Service',
    ownerName: 'นายบุญมา บุตรดี',
    email: 'demo.bbit@fixitpro.dev',
    phone: '084-567-8901',
    status: 'EXPIRED',
    plan: 'BASIC',
    startDate: new Date('2026-04-07'),
    expiryDate: new Date('2026-05-07'),  // expired 1 month ago
    notes: 'Starter plan — expired, pending renewal payment',
  },
  {
    shopName: 'PhoneHub Krabi',
    ownerName: 'นางสาวกรณิกา ทะเลสวย',
    email: 'demo.phonehub@fixitpro.dev',
    phone: '085-678-9012',
    status: 'PENDING',
    plan: 'TRIAL',
    startDate: null,
    expiryDate: null,
    notes: 'Founding Customer (Trial) — new registration awaiting activation',
  },
];

// ── 4. Seed logic ─────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    console.log(`Hashing demo password (bcrypt, ${BCRYPT_ROUNDS} rounds)...`);
    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, BCRYPT_ROUNDS);
    console.log('Password hash ready.\n');

    for (const td of DEMO_TENANTS) {
      // ── Upsert tenant ─────────────────────────────────────────────────────
      const tenant = await prisma.tenant.upsert({
        where: { email: td.email },
        update: {
          shopName: td.shopName,
          ownerName: td.ownerName,
          phone: td.phone,
          status: td.status,
          plan: td.plan,
          startDate: td.startDate,
          expiryDate: td.expiryDate,
          notes: td.notes,
        },
        create: {
          shopName: td.shopName,
          ownerName: td.ownerName,
          email: td.email,
          phone: td.phone,
          status: td.status,
          plan: td.plan,
          startDate: td.startDate,
          expiryDate: td.expiryDate,
          notes: td.notes,
        },
      });

      console.log(`  ✓ Tenant: ${tenant.shopName} (${tenant.status}, ${tenant.plan}) [${tenant.id}]`);

      // ── Upsert owner user ─────────────────────────────────────────────────
      const owner = await prisma.user.upsert({
        where: { email: td.email },
        update: {
          name: td.ownerName,
          phone: td.phone,
          tenantId: tenant.id,
          isActive: td.status === 'ACTIVE',
        },
        create: {
          email: td.email,
          name: td.ownerName,
          phone: td.phone,
          password: passwordHash,
          role: 'OWNER',
          isActive: td.status === 'ACTIVE',
          tenantId: tenant.id,
        },
      });

      // ── Find-or-create branch ─────────────────────────────────────────────
      const branchName = `${td.shopName} สาขาหลัก`;
      let branch = await prisma.branch.findFirst({ where: { name: branchName } });
      if (!branch) {
        branch = await prisma.branch.create({
          data: {
            name: branchName,
            address: `ที่อยู่สาขาหลัก ${td.shopName}`,
            isActive: td.status === 'ACTIVE',
            isDefault: true,
            status: td.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
          },
        });
        // Link owner to branch
        await prisma.user.update({
          where: { id: owner.id },
          data: { branchId: branch.id },
        });
        console.log(`    ✓ Branch created: ${branchName}`);
      } else {
        // Ensure owner is linked to the branch
        if (!owner.branchId) {
          await prisma.user.update({
            where: { id: owner.id },
            data: { branchId: branch.id },
          });
        }
        console.log(`    ↩ Branch exists: ${branchName}`);
      }

      // ── Renewals (skip if already present) ───────────────────────────────
      const renewalCount = await prisma.tenantRenewal.count({ where: { tenantId: tenant.id } });
      if (renewalCount === 0) {
        await seedRenewals(prisma, tenant.id, td);
        console.log(`    ✓ Renewals seeded`);
      } else {
        console.log(`    ↩ Renewals already present (${renewalCount})`);
      }

      // ── Payments (skip if already present) ───────────────────────────────
      const paymentCount = await prisma.tenantPayment.count({ where: { tenantId: tenant.id } });
      if (paymentCount === 0) {
        await seedPayments(prisma, tenant.id, td, owner.id);
        console.log(`    ✓ Payments seeded`);
      } else {
        console.log(`    ↩ Payments already present (${paymentCount})`);
      }

      // ── Password reset flag for audit log ────────────────────────────────
      if (td.shopName === 'Smart Fix Thailand' && !owner.passwordResetAt) {
        await prisma.user.update({
          where: { id: owner.id },
          data: { passwordResetAt: new Date('2026-04-15T10:30:00Z') },
        });
        console.log(`    ✓ passwordResetAt set (audit: PASSWORD_RESET)`);
      }

      console.log('');
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const [tenantCount, userCount, branchCount, renewalCount, paymentCount] =
      await Promise.all([
        prisma.tenant.count(),
        prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
        prisma.branch.count(),
        prisma.tenantRenewal.count(),
        prisma.tenantPayment.count(),
      ]);

    console.log('── Summary ──────────────────────────────────────');
    console.log(`  Tenants  : ${tenantCount}`);
    console.log(`  Users    : ${userCount} (excl. SUPER_ADMIN)`);
    console.log(`  Branches : ${branchCount}`);
    console.log(`  Renewals : ${renewalCount}`);
    console.log(`  Payments : ${paymentCount}`);
    console.log('─────────────────────────────────────────────────');
    console.log('\n✅  Demo seed complete. Login: demo owner password = demo1234');
  } finally {
    await prisma.$disconnect();
  }
}

// ── Renewal helper ────────────────────────────────────────────────────────────

async function seedRenewals(
  prisma: PrismaClient,
  tenantId: string,
  td: DemoTenant,
) {
  if (td.status === 'PENDING') return; // pending tenants have no renewals yet

  const planDuration: Record<TenantPlan, number> = {
    TRIAL: 30,
    BASIC: 30,
    PRO: 30,
    ENTERPRISE: 365,
  };

  // Initial activation renewal
  await prisma.tenantRenewal.create({
    data: {
      tenantId,
      action: 'ACTIVATE',
      plan: td.plan,
      duration: planDuration[td.plan],
      expiryDate: td.expiryDate ?? new Date('2026-12-31'),
      note: `เปิดใช้งานแพ็คเกจ ${planLabel(td.plan)}`,
      createdAt: td.startDate ?? new Date('2026-04-01'),
    },
  });

  // Extra RENEW record for TJ Computer (previously renewed once)
  if (td.shopName === 'TJ Computer') {
    await prisma.tenantRenewal.create({
      data: {
        tenantId,
        action: 'RENEW',
        plan: td.plan,
        duration: 30,
        expiryDate: new Date('2026-06-12'),
        note: 'ต่ออายุแพ็คเกจ Business 1 เดือน',
        createdAt: new Date('2026-05-12T09:00:00Z'),
      },
    });
  }
}

// ── Payment helper ────────────────────────────────────────────────────────────

async function seedPayments(
  prisma: PrismaClient,
  tenantId: string,
  td: DemoTenant,
  ownerId: string,
) {
  const planPricing: Record<TenantPlan, number> = {
    TRIAL: 0,
    BASIC: 1500,
    PRO: 2500,
    ENTERPRISE: 9900,
  };
  const amount = planPricing[td.plan];

  if (td.shopName === 'Charif PC & All') {
    // Activated Enterprise payment (contributes to MRR/analytics)
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'ENTERPRISE',
        duration: 365,
        paymentReference: 'TRF-CHF-20260601',
        paymentDate: new Date('2026-06-01'),
        paymentAmount: amount,
        paymentNote: 'โอนผ่านธนาคาร Enterprise Annual',
        status: 'VERIFIED',
        adminNote: 'ยืนยันแล้ว ครบจำนวน',
        verifiedAt: new Date('2026-06-01T10:00:00Z'),
        activatedAt: new Date('2026-06-01T10:05:00Z'),
        verifiedById: null,
        activatedById: null,
      },
    });

  } else if (td.shopName === 'TJ Computer') {
    // Previous activated payment
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'PRO',
        duration: 30,
        paymentReference: 'TRF-TJC-20260512',
        paymentDate: new Date('2026-05-12'),
        paymentAmount: amount,
        paymentNote: 'โอนผ่านธนาคาร Business Plan',
        status: 'VERIFIED',
        verifiedAt: new Date('2026-05-12T11:00:00Z'),
        activatedAt: new Date('2026-05-12T11:10:00Z'),
        adminNote: 'ยืนยันแล้ว',
      },
    });
    // Pending renewal payment
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'PRO',
        duration: 30,
        paymentReference: null,
        paymentDate: null,
        paymentAmount: amount,
        paymentNote: 'รอการชำระเงิน ต่ออายุ Business Plan',
        status: 'PENDING',
      },
    });

  } else if (td.shopName === 'Smart Fix Thailand') {
    // Rejected payment
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'BASIC',
        duration: 30,
        paymentReference: 'TRF-SMF-20260420',
        paymentDate: new Date('2026-04-20'),
        paymentAmount: amount,
        paymentNote: 'โอนผ่านธนาคาร',
        status: 'REJECTED',
        adminNote: 'ยอดไม่ตรง กรุณาโอนใหม่',
        verifiedAt: new Date('2026-04-21T09:00:00Z'),
      },
    });

  } else if (td.shopName === 'BB IT Service') {
    // Previous activated payment (expired plan)
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'BASIC',
        duration: 30,
        paymentReference: 'TRF-BBI-20260407',
        paymentDate: new Date('2026-04-07'),
        paymentAmount: amount,
        paymentNote: 'Starter Plan 1 Month',
        status: 'VERIFIED',
        verifiedAt: new Date('2026-04-07T14:00:00Z'),
        activatedAt: new Date('2026-04-07T14:05:00Z'),
        adminNote: 'ยืนยันแล้ว',
      },
    });
    // New renewal — pending
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'PRO',
        duration: 30,
        paymentReference: null,
        paymentDate: null,
        paymentAmount: planPricing['PRO'],
        paymentNote: 'ต้องการอัปเกรดเป็น Business Plan',
        status: 'PENDING',
      },
    });

  } else if (td.shopName === 'PhoneHub Krabi') {
    // Trial — pending activation payment
    await prisma.tenantPayment.create({
      data: {
        tenantId,
        plan: 'TRIAL',
        duration: 30,
        paymentReference: null,
        paymentDate: null,
        paymentAmount: 0,
        paymentNote: 'ทดลองใช้ฟรี 30 วัน รอการ activate',
        status: 'PENDING',
      },
    });
  }
}

function planLabel(plan: TenantPlan): string {
  const labels: Record<TenantPlan, string> = {
    TRIAL: 'Founding Customer',
    BASIC: 'Starter',
    PRO: 'Business',
    ENTERPRISE: 'Enterprise',
  };
  return labels[plan];
}

main().catch((e) => {
  console.error('SEED ERROR:', e);
  process.exit(1);
});
