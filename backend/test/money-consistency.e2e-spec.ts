/**
 * Money screens must agree with what actually happened at the till.
 * Scenario: 2 × 100 (cost 50) with a 20 bill discount, then 1 unit refunded for 90;
 * repair 1000 with a 200 cash deposit and 800 at pickup; repair 500 paid 300, 200 owed.
 * Before: refunds were never subtracted, the profit report ignored the bill discount, and
 * deposits / partial payments were not revenue (dashboard 980 vs 1390 actually received).
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Money consistency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const q = `branchId=${IDS.branchB1}`;
  const patch = (p: string, b: object) => request(app.getHttpServer()).patch(p).set('Cookie', ownerB).send(b);

  const snapshot = async () => {
    const dash = (await authGet(app, `/api/v1/dashboard/overview?${q}`, ownerB).expect(200)).body.finance;
    const profit = (await authGet(app, `/api/v1/reports/profit?${q}`, ownerB).expect(200)).body;
    const close = (await authGet(app, `/api/v1/reports/daily-closing?${q}`, ownerB).expect(200)).body.revenue;
    const shift = Number((await authGet(app, '/api/v1/shifts/current', ownerB).expect(200)).body.expectedCashBalance);
    return { dash, profit, close, shift };
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const cur = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app.close();
    await prisma.$disconnect();
  });

  it('MONEY-01: dashboard, profit report, daily close and shift cash agree', async () => {
    const before = await snapshot();

    const cat = (await authPost(app, '/api/v1/categories', ownerB, { name: `Money ${run}` })).body.id;
    const prod = (await authPost(app, '/api/v1/products', ownerB, {
      name: `Money ${run}`, sku: `MON-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 10,
      branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body;
    const productId = prod.id ?? prod.product?.id;
    const sale = (await authPost(app, '/api/v1/sales', ownerB, {
      paymentMethod: 'CASH', amountPaid: 180, discount: 20, branchId: IDS.branchB1,
      items: [{ productId, quantity: 2, price: 100 }],
    }).expect(201)).body;
    const saleId = sale.id ?? sale.sale?.id;
    const itemId = (await authGet(app, `/api/v1/sales/${saleId}`, ownerB)).body.items[0].id;
    await authPost(app, `/api/v1/sales/${saleId}/refund`, ownerB, {
      reason: 'e2e', paymentMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 90 }],
    }).expect(201);

    const r1 = (await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'X', deviceModel: 'Dep', issue: 'x', estimateCost: 1000, deposit: 200,
      depositPaymentMethod: 'CASH', branchId: IDS.branchB1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await patch(`/api/v1/repairs/${r1.id}`, { status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${r1.id}/payment`, ownerB, { paymentMethod: 'CASH', amountPaid: 800 }).expect(201);

    const r2 = (await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'X', deviceModel: 'Part', issue: 'x', estimateCost: 500, branchId: IDS.branchB1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await patch(`/api/v1/repairs/${r2.id}`, { status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${r2.id}/payment`, ownerB, {
      paymentMethod: 'CASH', amountPaid: 300, allowPartial: true,
    }).expect(201);

    const after = await snapshot();
    const d = (a: number, b: number) => Math.round((Number(a) - Number(b)) * 100) / 100;

    // POS: 180 − 90 refunded = 90, cost of the 1 unit kept = 50
    expect(d(after.dash.salesRevenue, before.dash.salesRevenue)).toBe(90);
    expect(d(after.dash.posCOGS, before.dash.posCOGS)).toBe(50);
    expect(d(after.profit.pos.revenue, before.profit.pos.revenue)).toBe(90);
    expect(d(after.profit.pos.cogs, before.profit.pos.cogs)).toBe(50);
    expect(d(after.close.pos.total, before.close.pos.total)).toBe(90);

    // Repairs: 200 deposit + 800 + 300 actually received
    expect(d(after.dash.repairRevenue, before.dash.repairRevenue)).toBe(1300);
    expect(d(after.profit.repair.revenue, before.profit.repair.revenue)).toBe(1300);
    expect(d(after.close.repairs.total, before.close.repairs.total)).toBe(1300);

    // Totals and cash agree with the drawer
    expect(d(after.dash.totalRevenue, before.dash.totalRevenue)).toBe(1390);
    expect(d(after.profit.summary.totalRevenue, before.profit.summary.totalRevenue)).toBe(1390);
    expect(d(after.close.grandTotal, before.close.grandTotal)).toBe(1390);
    expect(d(after.dash.cashIn, before.dash.cashIn)).toBe(1390);
    expect(d(after.close.cash, before.close.cash)).toBe(1390);
    expect(d(after.shift, before.shift)).toBe(1390);
  });
});
