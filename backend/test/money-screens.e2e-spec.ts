/**
 * Every screen that shows today's money must show the same numbers.
 * Scenario (one day, one branch):
 *  - 2 × 1000 (cost 600), 100 off the line and 50 off the bill, cash        → 1850, cost 1200
 *  - 1 × 500 (cost 200) paid 200 cash + 300 transfer                        →  500, cost  200
 *  - 1 × 500 by transfer, then voided                                       →    0
 *  - 1 × 1000 by transfer, then refunded by transfer                        →    0
 *  - repair 2000: 500 cash deposit, a 200-cost part, 1500 transfer at pickup → 2000, cost  200
 *  - SIM package 100 (dealer cost 96), cash                                 → profit 4
 *  - expense 300 cash
 * Before: the SUNMI owner dashboard ignored refunds and deposits (sales 3350, repairs 1500);
 * the daily close put a split bill under one method and repairs without their deposit; the
 * analytics 30-day profit ignored discounts, refunds and repairs.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Money screens agree (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let c: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const q = `branchId=${IDS.branchB1}`;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  const snapshot = async () => {
    const owner = (await authGet(app, `/api/v1/reports/owner-dashboard?${q}`, c).expect(200)).body.today;
    const ownerWeek = (await authGet(app, `/api/v1/reports/owner-dashboard?${q}`, c).expect(200)).body.weeklyRevenue.at(-1);
    const dash = (await authGet(app, `/api/v1/dashboard/overview?${q}`, c).expect(200)).body.finance;
    const close = (await authGet(app, `/api/v1/reports/daily-closing?date=${today}&${q}`, c).expect(200)).body.revenue;
    const a30 = (await authGet(app, `/api/v1/analytics/overview?${q}`, c).expect(200)).body.profitSummary30d;
    return { owner, ownerWeek, dash, close, a30 };
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    c = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const cur = await authGet(app, '/api/v1/shifts/current', c);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, c, { closeBalance: 0, note: 'e2e cleanup' });
    shiftId = (await authPost(app, '/api/v1/shifts/open', c, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    await authPost(app, `/api/v1/shifts/${shiftId}/close`, c, { closeBalance: 0, note: 'e2e' });
    await app.close();
    await prisma.$disconnect();
  });

  it('MONEY-02: owner dashboard, main dashboard, daily close and analytics show the same money', async () => {
    const before = await snapshot();
    const patch = (p: string, b: object) => request(app.getHttpServer()).patch(p).set('Cookie', c).send(b);
    const cat = (await authPost(app, '/api/v1/categories', c, { name: `Screens ${run}` })).body.id;
    const mk = async (n: string, price: number, costPrice: number) => {
      const b = (await authPost(app, '/api/v1/products', c, {
        name: `${n} ${run}`, sku: `${n}-${run}`, type: 'ACCESSORY', price, costPrice, stock: 20, branchId: IDS.branchB1, categoryId: cat,
      }).expect(201)).body;
      return b.id ?? b.product?.id;
    };
    const P1 = await mk('SCR1', 1000, 600);
    const P2 = await mk('SCR2', 500, 200);
    const sale = async (b: object) => {
      const s = (await authPost(app, '/api/v1/sales', c, { branchId: IDS.branchB1, ...b }).expect(201)).body;
      return s.id ?? s.sale?.id;
    };

    await sale({ paymentMethod: 'CASH', amountPaid: 1850, discount: 50, items: [{ productId: P1, quantity: 2, price: 1000, discount: 100 }] });
    await sale({ payments: [{ paymentMethod: 'CASH', amount: 200 }, { paymentMethod: 'TRANSFER', amount: 300 }], items: [{ productId: P2, quantity: 1, price: 500 }] });
    const voided = await sale({ paymentMethod: 'TRANSFER', amountPaid: 500, items: [{ productId: P2, quantity: 1, price: 500 }] });
    await authPost(app, `/api/v1/sales/${voided}/void`, c, { reason: 'e2e' }).expect(201);
    const refunded = await sale({ paymentMethod: 'TRANSFER', amountPaid: 1000, items: [{ productId: P1, quantity: 1, price: 1000 }] });
    const itemId = (await authGet(app, `/api/v1/sales/${refunded}`, c)).body.items[0].id;
    await authPost(app, `/api/v1/sales/${refunded}/refund`, c, {
      reason: 'e2e', paymentMethod: 'TRANSFER', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 1000 }],
    }).expect(201);

    const r = (await authPost(app, '/api/v1/repairs', c, {
      deviceBrand: 'X', deviceModel: `Scr ${run}`, issue: 'x', estimateCost: 2000, deposit: 500, depositPaymentMethod: 'CASH', branchId: IDS.branchB1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS']) await patch(`/api/v1/repairs/${r.id}`, { status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/parts`, c, { productId: P2, quantity: 1 }).expect(201);
    await patch(`/api/v1/repairs/${r.id}`, { status: 'COMPLETED' }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, c, { paymentMethod: 'TRANSFER', amountPaid: 1500 }).expect(201);

    await authPost(app, '/api/v1/carrier-wallet/topup', c, { carrier: 'AIS', amount: 1000 }).expect(201);
    await authPost(app, '/api/v1/carrier-wallet/package-sale', c, {
      carrier: 'AIS', saleType: 'PROMO', packageAmount: 100, dealerCost: 96, paymentMethod: 'CASH', amountPaid: 100, cashierName: 'e2e',
    }).expect(201);

    const ecat = (await authPost(app, '/api/v1/expenses/categories', c, { name: `Scr ${run}`, code: `scr_${run}`.replace(/[^a-z_]/g, 'x') }).expect(201)).body.id;
    await authPost(app, '/api/v1/expenses', c, {
      expenseDate: today, amount: 300, description: 'e2e', paymentMethod: 'CASH', categoryId: ecat, branchId: IDS.branchB1,
    }).expect(201);

    const after = await snapshot();
    const d = (a: unknown, b: unknown) => Math.round((Number(a ?? 0) - Number(b ?? 0)) * 100) / 100;

    // The reference: main dashboard (same rules as the profit report, checked in MONEY-01)
    expect(d(after.dash.salesRevenue, before.dash.salesRevenue)).toBe(2350);
    expect(d(after.dash.repairRevenue, before.dash.repairRevenue)).toBe(2000);
    expect(d(after.dash.totalRevenue, before.dash.totalRevenue)).toBe(4354);
    expect(d(after.dash.grossProfit, before.dash.grossProfit)).toBe(2754);
    expect(d(after.dash.netProfit, before.dash.netProfit)).toBe(2454);

    // SUNMI owner dashboard: same today, same chart bar, cash / transfer by payment leg
    expect(d(after.owner.salesRevenue, before.owner.salesRevenue)).toBe(2350);
    expect(d(after.owner.repairRevenue, before.owner.repairRevenue)).toBe(2000);
    expect(d(after.owner.totalRevenue, before.owner.totalRevenue)).toBe(4354);
    expect(d(after.owner.cashIn, before.owner.cashIn)).toBe(d(after.dash.cashIn, before.dash.cashIn));
    expect(d(after.owner.transferIn, before.owner.transferIn)).toBe(d(after.dash.transferIn, before.dash.transferIn));
    expect(d(after.ownerWeek.total, before.ownerWeek.total)).toBe(4354);

    // Daily close: each method adds up to its total (split bill per leg, refund off its method, deposit counted)
    const sum = (o: Record<string, number> = {}) => Object.values(o).reduce((a, b) => a + Number(b), 0);
    expect(d(sum(after.close.pos.breakdown), sum(before.close.pos.breakdown))).toBe(2350);
    expect(d(after.close.pos.breakdown.CASH, before.close.pos.breakdown.CASH)).toBe(2050);
    expect(d(after.close.pos.breakdown.TRANSFER, before.close.pos.breakdown.TRANSFER)).toBe(300);
    expect(d(sum(after.close.repairs.breakdown), sum(before.close.repairs.breakdown))).toBe(2000);
    expect(d(after.close.repairs.breakdown.CASH, before.close.repairs.breakdown.CASH)).toBe(500);

    // Analytics 30-day gross profit: the dashboard's gross profit, not list price minus cost
    expect(d(after.a30.totalRevenue, before.a30.totalRevenue)).toBe(4354);
    expect(d(after.a30.grossProfit, before.a30.grossProfit)).toBe(2754);

    // Most profitable products: after the line discount, refunded units taken out
    const top = (await authGet(app, `/api/v1/analytics/top-profit-products?${q}&startDate=${today}&endDate=${today}`, c).expect(200)).body;
    const p1 = top.find((x: any) => x.product.id === P1);
    const p2 = top.find((x: any) => x.product.id === P2);
    expect(p1).toMatchObject({ revenue: 1900, cost: 1200, grossProfit: 700 });
    expect(p2).toMatchObject({ revenue: 500, cost: 200, grossProfit: 300 });
  });
});
