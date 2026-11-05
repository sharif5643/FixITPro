/**
 * Hidden costs (ต้นทุนแฝง) count where they belong, once:
 *  - give-aways on a bill: free to the customer, their cost against that bill
 *  - a parts delivery fee: a repair job's cost when it names the job, else a shop expense;
 *    from the drawer (the shift's cash goes down) or paid by the owner (it does not)
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Hidden costs: give-aways and delivery fees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let c: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const q = `branchId=${IDS.branchB1}`;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const profit = async () => (await authGet(app, `/api/v1/reports/profit?startDate=${today}&endDate=${today}&${q}`, c).expect(200)).body;
  const expected = async () => Number((await authGet(app, '/api/v1/shifts/current', c).expect(200)).body.expectedCashBalance);
  const d = (a: unknown, b: unknown) => Math.round((Number(a ?? 0) - Number(b ?? 0)) * 100) / 100;
  const mk = async (n: string, price: number, costPrice: number, extra: object = {}) => {
    const b = (await authPost(app, '/api/v1/products', c, {
      name: `${n} ${run}`, sku: `${n}-${run}`, type: 'ACCESSORY', price, costPrice, stock: 10, branchId: IDS.branchB1, ...extra,
    }).expect(201)).body;
    return b.id ?? b.product?.id;
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

  it('HC-01: give-aways are free to the customer, their cost counts against the bill', async () => {
    const basin = await mk('BASIN', 0, 45, { giveawayOnly: true });
    const film = await mk('FILM', 199, 30);
    const phone = await mk('PHONE', 28900, 25000, { freebies: [{ productId: basin, quantity: 1 }, { productId: film, quantity: 1 }] });
    const stored = (await authGet(app, `/api/v1/products?search=PHONE-${run}&${q}`, c)).body;
    const list = Array.isArray(stored) ? stored : stored.items;
    expect(list.find((p: any) => p.id === phone).freebies).toEqual([{ productId: basin, quantity: 1 }, { productId: film, quantity: 1 }]);

    // A give-away is never sold, and does not make a bill on its own
    await authPost(app, '/api/v1/sales', c, { branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 100, items: [{ productId: basin, quantity: 1, price: 100 }] }).expect(400);
    await authPost(app, '/api/v1/sales', c, { branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 0, items: [{ productId: film, quantity: 1, price: 0, isFreebie: true }] }).expect(400);

    const before = await profit();
    const cashBefore = await expected();
    const sale = (await authPost(app, '/api/v1/sales', c, {
      branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 28900,
      items: [
        { productId: phone, quantity: 1, price: 28900 },
        // the price sent for a give-away is ignored: it is free
        { productId: film, quantity: 1, price: 199, isFreebie: true },
        { productId: basin, quantity: 1, price: 0, isFreebie: true },
      ],
    }).expect(201)).body;
    const saleId = sale.id ?? sale.sale?.id;
    const detail = (await authGet(app, `/api/v1/sales/${saleId}`, c).expect(200)).body;
    expect(Number(detail.total)).toBe(28900);
    const line = (pid: string) => detail.items.find((i: any) => i.productId === pid);
    expect(line(film)).toMatchObject({ isFreebie: true });
    expect(Number(line(film).total)).toBe(0);
    expect(Number(line(film).freebieValue)).toBe(199);
    expect(line(basin).freebieValue).toBeNull();
    // stock of the give-aways went down
    const bs = await prisma.branchStock.findMany({ where: { branchId: IDS.branchB1, productId: { in: [film, basin] } } });
    expect(bs.map((b) => b.quantity)).toEqual([9, 9]);

    const after = await profit();
    expect(d(after.pos.revenue, before.pos.revenue)).toBe(28900);
    expect(d(after.pos.cogs, before.pos.cogs)).toBe(25075);           // phone + film + basin
    expect(d(after.pos.freebieCost, before.pos.freebieCost)).toBe(75);
    expect(d(after.pos.profit, before.pos.profit)).toBe(3825);
    expect(d(after.hiddenCosts.freebies.sales, before.hiddenCosts.freebies.sales)).toBe(75);
    // no "sold below cost" warning for a give-away
    expect(after.costWarnings.belowCost.find((x: any) => x.productId === film)).toBeUndefined();
    expect(d(await expected(), cashBefore)).toBe(28900);
  });

  it('HC-02: a delivery fee for a job is that job\'s cost; without a job it is a shop expense', async () => {
    const screen = await mk('SCREEN', 0, 1200);
    const before = await profit();
    const cashBefore = await expected();
    const dash0 = (await authGet(app, `/api/v1/dashboard/overview?${q}`, c).expect(200)).body.finance;

    const r = (await authPost(app, '/api/v1/repairs', c, {
      deviceBrand: 'Apple', deviceModel: `11 ${run}`, issue: 'จอแตก', estimateCost: 2500, branchId: IDS.branchB1,
    }).expect(201)).body;
    const patch = (b: object) => request(app.getHttpServer()).patch(`/api/v1/repairs/${r.id}`).set('Cookie', c).send(b);
    for (const s of ['DIAGNOSING', 'IN_PROGRESS']) await patch({ status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/parts`, c, { productId: screen, quantity: 1 }).expect(201);

    // 80 from the drawer for this job's parts
    const fee = (await authPost(app, '/api/v1/shifts/delivery-fee', c, { amount: 80, repairId: r.id }).expect(201)).body;
    expect(fee).toMatchObject({ kind: 'REPAIR', amount: 80, fromDrawer: true });
    expect(d(await expected(), cashBefore)).toBe(-80);
    // another shop's job cannot be named
    const other = await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password);
    await authPost(app, '/api/v1/shifts/delivery-fee', other.cookies, { amount: 80, repairId: r.id, fromDrawer: false }).expect(404);

    await patch({ status: 'COMPLETED' }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, c, { paymentMethod: 'CASH', amountPaid: 2500 }).expect(201);

    // 80 for parts of no job, paid by the owner: an expense, not out of the drawer
    const shop = (await authPost(app, '/api/v1/shifts/delivery-fee', c, { amount: 80, fromDrawer: false, note: 'รอบบ่าย' }).expect(201)).body;
    expect(shop).toMatchObject({ kind: 'EXPENSE', fromDrawer: false });
    expect(d(await expected(), cashBefore)).toBe(-80 + 2500);
    // and one paid from the drawer: the drawer goes down
    await authPost(app, '/api/v1/shifts/delivery-fee', c, { amount: 60 }).expect(201);
    expect(d(await expected(), cashBefore)).toBe(-80 + 2500 - 60);

    const after = await profit();
    expect(d(after.repair.revenue, before.repair.revenue)).toBe(2500);
    expect(d(after.repair.partsCost, before.repair.partsCost)).toBe(1200);
    expect(d(after.repair.deliveryCost, before.repair.deliveryCost)).toBe(80);
    expect(d(after.repair.profit, before.repair.profit)).toBe(1220);
    const job = after.repair.items.find((i: any) => i.ticketNumber === r.ticketNumber);
    expect(job).toMatchObject({ deliveryCost: 80, profit: 1220 });
    expect(d(after.expenses.total, before.expenses.total)).toBe(140);
    expect(after.expenses.breakdown.find((x: any) => x.code === 'parts_delivery')).toBeTruthy();
    expect(d(after.hiddenCosts.delivery.total, before.hiddenCosts.delivery.total)).toBe(220);
    expect(d(after.hiddenCosts.delivery.jobs, before.hiddenCosts.delivery.jobs)).toBe(80);
    expect(d(after.summary.netProfit, before.summary.netProfit)).toBe(1220 - 140);

    // The dashboard agrees (same money rules)
    const dash1 = (await authGet(app, `/api/v1/dashboard/overview?${q}`, c).expect(200)).body.finance;
    expect(d(dash1.repairCOGS, dash0.repairCOGS)).toBe(1280);
    expect(d(dash1.netProfit, dash0.netProfit)).toBe(1220 - 140);
  });
});
