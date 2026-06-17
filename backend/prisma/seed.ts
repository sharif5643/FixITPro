import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLE_PERMISSIONS: Partial<Record<Role, string[]>> = {
  MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.view_cost',
    'sales.create', 'sales.discount', 'sales.refund',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'supplier.pay',
    'reports.view',
    'claims.manage',
    'serials.manage',
    'expenses.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view', 'notification.manage',
    'data.export', 'data.import',
    'audit.view',
    'settings.manage',
    'branches.manage',
  ],
  CASHIER: [
    'products.view',
    'sales.create', 'sales.discount',
    'repair.create', 'repair.edit',
    'serials.manage',
    'warranty.view',
    'notification.view',
  ],
  TECHNICIAN: [
    'products.view',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate',
    'serials.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view',
  ],
  STOCK_STAFF: [
    'products.view',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'serials.manage',
    'notification.view',
  ],
};

async function main() {
  const password = await bcrypt.hash('admin1234', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@fixitpro.com' },
    update: {},
    create: {
      email: 'owner@fixitpro.com',
      name: 'เจ้าของร้าน',
      password,
      role: 'OWNER',
      isActive: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@fixitpro.com' },
    update: {},
    create: {
      email: 'admin@fixitpro.com',
      name: 'ผู้จัดการ',
      password,
      role: 'MANAGER',
      isActive: true,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@fixitpro.com' },
    update: {},
    create: {
      email: 'staff@fixitpro.com',
      name: 'พนักงาน',
      password,
      role: 'CASHIER',
      isActive: true,
    },
  });

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { tenantId_slug: { tenantId: null as any, slug: 'phones' } },
      update: {},
      create: { name: 'มือถือ', slug: 'phones' },
    }),
    prisma.category.upsert({
      where: { tenantId_slug: { tenantId: null as any, slug: 'accessories' } },
      update: {},
      create: { name: 'อุปกรณ์เสริม', slug: 'accessories' },
    }),
    prisma.category.upsert({
      where: { tenantId_slug: { tenantId: null as any, slug: 'sims' } },
      update: {},
      create: { name: 'ซิมการ์ด', slug: 'sims' },
    }),
    prisma.category.upsert({
      where: { tenantId_slug: { tenantId: null as any, slug: 'parts' } },
      update: {},
      create: { name: 'อะไหล่', slug: 'parts' },
    }),
  ]);

  // Seed default role permissions — additive (skipDuplicates keeps existing manual config)
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS) as [Role, string[]][]) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ role, permission })),
      skipDuplicates: true,
    });
  }

  console.log('Seed completed:');
  console.log('Users:', { owner: owner.email, admin: admin.email, staff: staff.email });
  console.log('Categories:', categories.map(c => c.name));
  console.log('Role permissions: seeded defaults for MANAGER, CASHIER, TECHNICIAN, STOCK_STAFF');
  console.log('\nDefault password for all users: admin1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
