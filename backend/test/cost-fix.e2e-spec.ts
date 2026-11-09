/**
 * The owner fixes a cost typed wrong (or never typed): the product, and with fixBills the bills
 * already sold with a plainly wrong cost (0, or above what the line sold for). A bill sold at a
 * sensible cost keeps it. Every fix is in the audit log. Only the owner can do it.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { bangkokDate } from '../src/common/bangkok-date';

describe('Fix a wrong cost (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  let ownerA: string;
  let managerA: string;
  let shiftId: string;
  let productId: string;
  const run = Date.now().toString(36);
  const date = bangkokDate();
  const profit = async () =>
    (await authGet(app, `/api/v1/reports/profit?startDate=${date}&endDate=${date}&branchId=${IDS.branchB1}`, ownerB).expect(200)).body;
  const sell = async () =>
    (await authPost(app, '/api/v1/sales', ownerB, {
      branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 1000, items: [{ productId, quantity: 1, price: 1000 }],
    }).expect(201)).body;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    managerA = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    const cur = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
    const cat = (await authPost(app, '/api/v1/categories', ownerB, { name: `Fix ${run}` })).body.id;
    const p = (await authPost(app, '/api/v1/products', ownerB, {
      name: `Phone typo ${run}`, sku: `FIX-${run}`, type: 'ACCESSORY', price: 1000, costPrice: 1500, stock: 10,
      branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body;
    productId = p.id ?? p.product?.id;
  });

  afterAll(async () => {
    if (shiftId) await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIX-01: the wrong bill gets the right cost, a sensible one keeps its own, profit moves by the difference', async () => {
    const before = await profit();
    const wrong = await sell(); // sold with cost 1500 for 1000 → shows a 500 loss
    await prisma.product.update({ where: { id: productId }, data: { costPrice: 700 } });
    const fine = await sell(); // sold with cost 700: the real cost that day
    const mid = await profit();
    expect(mid.summary.netProfit - before.summary.netProfit).toBeCloseTo((1000 - 1500) + (1000 - 700), 2);
    expect(mid.costWarnings.belowCost.map((w: any) => w.productId)).toContain(productId);

    const pre = (await authGet(app, `/api/v1/reports/fix-cost/preview?productId=${productId}&costPrice=600`, ownerB).expect(200)).body;
    expect(pre.lines.map((l: any) => l.saleId)).toEqual([wrong.id]);
    expect(pre.profitChange).toBeCloseTo(900, 2);

    const res = (await authPost(app, '/api/v1/reports/fix-cost', ownerB, { productId, costPrice: 600, fixBills: true }).expect(201)).body;
    expect(res.linesFixed).toBe(1);
    expect(res.profitChange).toBeCloseTo(900, 2);

    const items = await prisma.saleItem.findMany({ where: { productId }, select: { saleId: true, costPrice: true } });
    expect(Number(items.find((i) => i.saleId === wrong.id)!.costPrice)).toBe(600);
    expect(Number(items.find((i) => i.saleId === fine.id)!.costPrice)).toBe(700);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).costPrice)).toBe(600);

    const after = await profit();
    expect(after.summary.netProfit - mid.summary.netProfit).toBeCloseTo(900, 2);
    expect(after.costWarnings.belowCost.map((w: any) => w.productId)).not.toContain(productId);
    // what the customer paid did not change
    expect(after.summary.totalRevenue).toBeCloseTo(mid.summary.totalRevenue, 2);

    const log = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_COST_FIXED', entityId: productId } });
    expect((log!.beforeData as any).costPrice).toBe(700);
    expect((log!.beforeData as any).lines[0].costPrice).toBe(1500);
    expect((log!.afterData as any).linesFixed).toBe(1);
  });

  it('FIX-02: product only (fixBills false) leaves every bill as it was', async () => {
    await prisma.product.update({ where: { id: productId }, data: { costPrice: 0 } });
    const sale = await sell(); // no cost
    await authPost(app, '/api/v1/reports/fix-cost', ownerB, { productId, costPrice: 650, fixBills: false }).expect(201);
    const line = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(Number(line.costPrice)).toBe(0);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).costPrice)).toBe(650);
  });

  it('FIX-03: not the owner, another shop, or no cost → refused', async () => {
    await authPost(app, '/api/v1/reports/fix-cost', managerA, { productId, costPrice: 600, fixBills: true }).expect(403);
    await authPost(app, '/api/v1/reports/fix-cost', ownerA, { productId, costPrice: 600, fixBills: true }).expect(404);
    await authGet(app, `/api/v1/reports/fix-cost/preview?productId=${productId}`, ownerA).expect(404);
    await authPost(app, '/api/v1/reports/fix-cost', ownerB, { productId, costPrice: 0, fixBills: true }).expect(400);
  });
});
