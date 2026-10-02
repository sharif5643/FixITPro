/**
 * Change given back must not count as money received.
 * Before: a 100-baht cash sale paid with 500 put 500 into shift expected cash and the
 * cash-drawer ledger; a repair balance of 800 paid with 1000 recorded 1000 as revenue.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Cash change handling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  let shiftId: string;
  let productId: string;
  const run = Date.now().toString(36);

  const expectedCash = async () =>
    Number((await authGet(app, '/api/v1/shifts/current', ownerB).expect(200)).body.expectedCashBalance);
  const patch = (path: string, body: object) =>
    request(app.getHttpServer()).patch(path).set('Cookie', ownerB).send(body);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;

    const current = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (current.body?.id) {
      await authPost(app, `/api/v1/shifts/${current.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    }
    shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
    const cat = (await authPost(app, '/api/v1/categories', ownerB, { name: `Change cat ${run}` })).body.id;
    productId = (await authPost(app, '/api/v1/products', ownerB, {
      name: `Change item ${run}`, sku: `CHG-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 10,
      branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body.id;
  });

  afterAll(async () => {
    await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app.close();
    await prisma.$disconnect();
  });

  it('CHG-01: cash sale 100 paid with 500 adds 100 to expected cash; receipt keeps change 400', async () => {
    const before = await expectedCash();
    const sale = await authPost(app, '/api/v1/sales', ownerB, {
      paymentMethod: 'CASH', amountPaid: 500, branchId: IDS.branchB1,
      items: [{ productId, quantity: 1, price: 100 }],
    }).expect(201);
    expect(Number(sale.body.change)).toBe(400);
    expect(Number(sale.body.amountPaid)).toBe(500);

    const legs = await prisma.salePayment.findMany({ where: { saleId: sale.body.id } });
    expect(legs.reduce((s, l) => s + Number(l.amount), 0)).toBe(100);
    expect(await expectedCash()).toBeCloseTo(before + 100, 2);
  });

  it('CHG-02: split CASH 300 + TRANSFER 100 for a 350 total keeps cash 250, transfer 100', async () => {
    const before = await expectedCash();
    const sale = await authPost(app, '/api/v1/sales', ownerB, {
      branchId: IDS.branchB1,
      payments: [{ paymentMethod: 'CASH', amount: 300 }, { paymentMethod: 'TRANSFER', amount: 100 }],
      items: [{ productId, quantity: 3, price: 100 }, { productId, quantity: 1, price: 50 }],
    });
    expect(sale.status).toBe(201);
    const legs = await prisma.salePayment.findMany({ where: { saleId: sale.body.id } });
    const byMethod = Object.fromEntries(legs.map((l) => [l.paymentMethod, Number(l.amount)]));
    expect(byMethod).toEqual({ CASH: 250, TRANSFER: 100 });
    expect(await expectedCash()).toBeCloseTo(before + 250, 2);
  });

  it('CHG-03: repair balance 800 paid with 1000 records 800', async () => {
    const before = await expectedCash();
    const repair = (await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'X', deviceModel: 'Y', issue: 'screen', estimateCost: 800, branchId: IDS.branchB1,
    }).expect(201)).body;
    for (const status of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) {
      await patch(`/api/v1/repairs/${repair.id}`, { status }).expect(200);
    }
    await authPost(app, `/api/v1/repairs/${repair.id}/payment`, ownerB, {
      paymentMethod: 'CASH', amountPaid: 1000,
    }).expect(201);

    const saved = await prisma.repair.findUniqueOrThrow({ where: { id: repair.id } });
    expect(Number(saved.paidAmount)).toBe(800);
    expect(await expectedCash()).toBeCloseTo(before + 800, 2);
  });

  const newRepair = async (extra: object = {}) =>
    (await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'X', deviceModel: 'Y', issue: 'battery', estimateCost: 1000, branchId: IDS.branchB1, ...extra,
    }).expect(201)).body;
  const complete = async (id: string) => {
    for (const status of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) {
      await patch(`/api/v1/repairs/${id}`, { status }).expect(200);
    }
  };

  it('CHG-04: a cash deposit at intake counts in the shift; refunding it on cancel removes it', async () => {
    const before = await expectedCash();
    const repair = await newRepair({ deposit: 200, depositPaymentMethod: 'CASH' });
    expect(await expectedCash()).toBeCloseTo(before + 200, 2);

    await patch(`/api/v1/repairs/${repair.id}`, { status: 'CANCELLED' }).expect(200);
    expect(await expectedCash()).toBeCloseTo(before, 2);
  });

  it('CHG-05: a transfer deposit does not change expected cash', async () => {
    const before = await expectedCash();
    await newRepair({ deposit: 300, depositPaymentMethod: 'TRANSFER' });
    expect(await expectedCash()).toBeCloseTo(before, 2);
  });

  it('CHG-06: debt payment counts in the shift and uses the real outstanding balance', async () => {
    const repair = await newRepair();
    await complete(repair.id);
    // 1000 due, 600 paid at handover → 400 owed
    await authPost(app, `/api/v1/repairs/${repair.id}/payment`, ownerB, {
      paymentMethod: 'CASH', amountPaid: 600, allowPartial: true,
    }).expect(201);

    const before = await expectedCash();
    await authPost(app, '/api/v1/debt-payments', ownerB, { repairId: repair.id, amount: 401, paymentMethod: 'CASH' }).expect(400);
    const res = await authPost(app, '/api/v1/debt-payments', ownerB, { repairId: repair.id, amount: 400, paymentMethod: 'CASH' }).expect(201);
    expect(res.body.repair.paymentStatus).toBe('PAID');
    expect(res.body.repair.remainingAfter).toBe(0);
    expect(await expectedCash()).toBeCloseTo(before + 400, 2);
  });

  it('CHG-07: two simultaneous debt payments cannot both succeed', async () => {
    const repair = await newRepair();
    await complete(repair.id);
    await authPost(app, `/api/v1/repairs/${repair.id}/payment`, ownerB, {
      paymentMethod: 'CASH', amountPaid: 600, allowPartial: true,
    }).expect(201);

    const pay = () => authPost(app, '/api/v1/debt-payments', ownerB, { repairId: repair.id, amount: 400, paymentMethod: 'CASH' });
    const results = await Promise.all([pay(), pay()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const total = await prisma.repairAdditionalPayment.aggregate({ where: { repairId: repair.id }, _sum: { amount: true } });
    expect(Number(total._sum.amount)).toBe(400);
  });

  it('CHG-08: owner of another shop cannot record a debt payment on this repair', async () => {
    const repair = await newRepair();
    await complete(repair.id);
    await authPost(app, `/api/v1/repairs/${repair.id}/payment`, ownerB, {
      paymentMethod: 'CASH', amountPaid: 600, allowPartial: true,
    }).expect(201);
    const ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    await authPost(app, '/api/v1/debt-payments', ownerA, { repairId: repair.id, amount: 100, paymentMethod: 'CASH' }).expect(404);
  });
});
