/**
 * Books catch-up: payments taken while a shop's postings could not reach its books are posted
 * when the owner asks; the count shows first, nothing already posted is posted twice.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Books catch-up (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  let shiftId: string;
  let saleId: string;
  const run = String(Date.now()).slice(-6);
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };
  const restoreEnv = () => {
    if (saved.core === undefined) delete process.env.ACCOUNTING_CORE_ENABLED; else process.env.ACCOUNTING_CORE_ENABLED = saved.core;
    if (saved.tenants === undefined) delete process.env.ACCOUNTING_ENABLED_TENANTS; else process.env.ACCOUNTING_ENABLED_TENANTS = saved.tenants;
  };
  const posted = async () => {
    const payments = await prisma.salePayment.findMany({ where: { saleId }, select: { id: true } });
    return prisma.journalEntry.count({ where: { tenantId: IDS.tenantB, sourceType: 'SALE_PAYMENT', sourceId: { in: payments.map((p) => p.id) } } });
  };

  beforeAll(async () => {
    restoreEnv();
    process.env.ACCOUNTING_CORE_ENABLED = 'false';
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const current = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (current.body?.id) await authPost(app, `/api/v1/shifts/${current.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
    const cat = (await authPost(app, '/api/v1/categories', ownerB, { name: `Books cat ${run}` })).body.id;
    const productId = (await authPost(app, '/api/v1/products', ownerB, {
      name: `Books item ${run}`, sku: `BKS-${run}`, type: 'ACCESSORY', price: 100, costPrice: 40, stock: 5,
      branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body.id;
    // Sold while the shop's postings did not reach its books
    saleId = (await authPost(app, '/api/v1/sales', ownerB, {
      paymentMethod: 'CASH', amountPaid: 100, branchId: IDS.branchB1, items: [{ productId, quantity: 1, price: 100 }],
    }).expect(201)).body.id;
  });

  afterAll(async () => {
    restoreEnv();
    await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('BK-01: with accounting off nothing is counted or posted', async () => {
    expect(await posted()).toBe(0);
    const res = (await authGet(app, '/api/v1/admin/accounting/catch-up', ownerB).expect(200)).body;
    expect(res).toMatchObject({ enabled: false, sales: 0 });
  });

  it('BK-02: once on, the owner sees the missing sale and posts it once', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantB;
    const preview = (await authGet(app, '/api/v1/admin/accounting/catch-up', ownerB).expect(200)).body;
    expect(preview.enabled).toBe(true);
    expect(preview.sales).toBeGreaterThanOrEqual(1);
    expect(await posted()).toBe(0);

    await authPost(app, '/api/v1/admin/accounting/catch-up', ownerB, {}).expect(201);
    expect(await posted()).toBe(1);
    expect(await prisma.accountingAccount.count({ where: { tenantId: IDS.tenantB } })).toBeGreaterThan(0);

    const again = (await authGet(app, '/api/v1/admin/accounting/catch-up', ownerB).expect(200)).body;
    await authPost(app, '/api/v1/admin/accounting/catch-up', ownerB, {}).expect(201);
    expect(await posted()).toBe(1);
    expect(again.sales).toBeLessThan(preview.sales);
  });

  it('BK-03: staff without accounting.admin cannot run it', async () => {
    const cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    await authPost(app, '/api/v1/admin/accounting/catch-up', cashier, {}).expect(403);
  });
});
