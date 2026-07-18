import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export const TEST_DB_URL =
  'postgresql://postgres:123456@localhost:5432/fixitpro_test';

const E2E_TENANT_IDS  = ['e2e-tenant-a-000000000000000001', 'e2e-tenant-b-000000000000000002'];
const E2E_BRANCH_IDS  = [
  'e2e-branch-a1-00000000000000001',
  'e2e-branch-a2-00000000000000002',
  'e2e-branch-b1-00000000000000003',
];
const E2E_USER_IDS = [
  'e2e-user-owner-a-0000000000001',
  'e2e-user-mgr-a1-000000000001',
  'e2e-user-mgr-a2-000000000002',
  'e2e-user-cash-a1-00000000001',
  'e2e-user-tech-a1-00000000001',
  'e2e-user-stock-a1-0000000001',
  'e2e-user-owner-b-0000000000001',
  'e2e-user-disabled-000000000001',
];

const ROLE_PRESETS: Record<string, string[]> = {
  MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.view_cost',
    'sales.create', 'sales.discount', 'sales.refund',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'supplier.pay', 'reports.view', 'claims.manage', 'serials.manage',
    'expenses.manage', 'warranty.view', 'warranty.manage',
    'technician.view', 'notification.view', 'notification.manage', 'data.export',
    'cash_drawer.open_session', 'cash_drawer.join_session', 'cash_drawer.withdraw',
    'cash_drawer.deposit', 'cash_drawer.view_balance', 'cash_drawer.close_session',
    'cash_drawer.approve_difference', 'cash_drawer.manual_open',
  ],
  CASHIER: [
    'products.view', 'sales.create', 'sales.discount',
    'repair.create', 'repair.edit',
    'serials.manage', 'warranty.view', 'notification.view',
    'cash_drawer.open_session', 'cash_drawer.join_session',
    'cash_drawer.withdraw', 'cash_drawer.deposit',
    'cash_drawer.view_balance', 'cash_drawer.close_session',
  ],
  TECHNICIAN: [
    'products.view',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
    'serials.manage', 'warranty.view', 'warranty.manage', 'technician.view', 'notification.view',
  ],
  STOCK_STAFF: [
    'products.view', 'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive', 'serials.manage', 'notification.view',
  ],
};

async function h(pw: string) { return bcrypt.hash(pw, 10); }

export default async function globalSetup() {
  // ── 1. Ensure schema is current ───────────────────────────────────────────────
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'ignore',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  try {
    // ── 2. Reset rolePermission to current presets ────────────────────────────
    for (const [role, permissions] of Object.entries(ROLE_PRESETS)) {
      await prisma.rolePermission.deleteMany({ where: { role: role as any } });
      if (permissions.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissions.map((permission) => ({ role: role as any, permission })),
          skipDuplicates: true,
        });
      }
    }

    // ── 3. Clean previous E2E data (full teardown in dependency order) ────────
    await prisma.refreshToken.deleteMany({ where: { userId: { in: E2E_USER_IDS } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: E2E_USER_IDS } } });
    await prisma.cashDrawerTransaction.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    await (prisma as any).cashDrawerParticipant.deleteMany({
      where: { session: { branchId: { in: E2E_BRANCH_IDS } } },
    }).catch(() => {/* table might not exist */});
    await prisma.cashDrawerSession.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    await prisma.cashDrawer.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    await prisma.shift.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    // Delete repair children before repairs
    await (prisma as any).repairPaymentReversal.deleteMany({
      where: { repair: { branchId: { in: E2E_BRANCH_IDS } } },
    }).catch(() => {});
    await (prisma as any).repairPart.deleteMany({
      where: { repair: { branchId: { in: E2E_BRANCH_IDS } } },
    }).catch(() => {});
    await prisma.repair.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    await prisma.sale.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: E2E_BRANCH_IDS } } });
    await prisma.expenseCategory.deleteMany({ where: { tenantId: { in: E2E_TENANT_IDS } } });
    await prisma.customer.deleteMany({ where: { tenantId: { in: E2E_TENANT_IDS } } });
    await prisma.user.deleteMany({ where: { id: { in: E2E_USER_IDS } } });
    await prisma.branch.deleteMany({ where: { id: { in: E2E_BRANCH_IDS } } });
    await prisma.tenant.deleteMany({ where: { id: { in: E2E_TENANT_IDS } } });

    // ── 4. Seed tenants ───────────────────────────────────────────────────────
    await prisma.tenant.createMany({
      data: [
        {
          id: 'e2e-tenant-a-000000000000000001',
          shopName: 'E2E Shop A', ownerName: 'Owner A',
          email: 'shop-a@e2e.test', status: 'ACTIVE', plan: 'PRO',
          expiryDate: new Date('2030-01-01'),
        },
        {
          id: 'e2e-tenant-b-000000000000000002',
          shopName: 'E2E Shop B', ownerName: 'Owner B',
          email: 'shop-b@e2e.test', status: 'ACTIVE', plan: 'PRO',
          expiryDate: new Date('2030-01-01'),
        },
      ],
      skipDuplicates: true,
    });

    // ── 5. Seed branches ──────────────────────────────────────────────────────
    await prisma.branch.createMany({
      data: [
        { id: 'e2e-branch-a1-00000000000000001', name: 'Branch A1',
          tenantId: 'e2e-tenant-a-000000000000000001',
          status: 'ACTIVE', isDefault: true, cashDrawerPolicy: 'ALLOW_UNASSIGNED' },
        { id: 'e2e-branch-a2-00000000000000002', name: 'Branch A2',
          tenantId: 'e2e-tenant-a-000000000000000001',
          status: 'ACTIVE', cashDrawerPolicy: 'ALLOW_UNASSIGNED' },
        { id: 'e2e-branch-b1-00000000000000003', name: 'Branch B1',
          tenantId: 'e2e-tenant-b-000000000000000002',
          status: 'ACTIVE', isDefault: true, cashDrawerPolicy: 'ALLOW_UNASSIGNED' },
      ],
      skipDuplicates: true,
    });

    // ── 6. Seed users ─────────────────────────────────────────────────────────
    const users = [
      { id: 'e2e-user-owner-a-0000000000001',    email: 'owner-a@e2e.test',    pw: 'E2eTest@2026!', name: 'Owner A',    role: 'OWNER',       tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a1-00000000000000001', isActive: true },
      { id: 'e2e-user-mgr-a1-000000000001',      email: 'mgr-a1@e2e.test',     pw: 'E2eTest@2026!', name: 'Manager A1', role: 'MANAGER',     tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a1-00000000000000001', isActive: true },
      { id: 'e2e-user-mgr-a2-000000000002',      email: 'mgr-a2@e2e.test',     pw: 'E2eTest@2026!', name: 'Manager A2', role: 'MANAGER',     tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a2-00000000000000002', isActive: true },
      { id: 'e2e-user-cash-a1-00000000001',      email: 'cashier-a1@e2e.test', pw: 'E2eTest@2026!', name: 'Cashier A1', role: 'CASHIER',     tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a1-00000000000000001', isActive: true },
      { id: 'e2e-user-tech-a1-00000000001',      email: 'tech-a1@e2e.test',    pw: 'E2eTest@2026!', name: 'Tech A1',    role: 'TECHNICIAN',  tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a1-00000000000000001', isActive: true },
      { id: 'e2e-user-stock-a1-0000000001',      email: 'stock-a1@e2e.test',   pw: 'E2eTest@2026!', name: 'Stock A1',   role: 'STOCK_STAFF', tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a1-00000000000000001', isActive: true },
      { id: 'e2e-user-owner-b-0000000000001',    email: 'owner-b@e2e.test',    pw: 'E2eTest@2026!', name: 'Owner B',    role: 'OWNER',       tenantId: 'e2e-tenant-b-000000000000000002', branchId: 'e2e-branch-b1-00000000000000003', isActive: true },
      { id: 'e2e-user-disabled-000000000001',    email: 'disabled@e2e.test',   pw: 'E2eTest@2026!', name: 'Disabled',   role: 'CASHIER',     tenantId: 'e2e-tenant-a-000000000000000001', branchId: 'e2e-branch-a1-00000000000000001', isActive: false },
    ];

    for (const u of users) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id, email: u.email, name: u.name, password: await h(u.pw),
          role: u.role as any, tenantId: u.tenantId, branchId: u.branchId, isActive: u.isActive,
        },
        update: {
          email: u.email, name: u.name, password: await h(u.pw),
          role: u.role as any, tenantId: u.tenantId, branchId: u.branchId, isActive: u.isActive,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  process.env.TEST_DATABASE_URL = TEST_DB_URL;
}
