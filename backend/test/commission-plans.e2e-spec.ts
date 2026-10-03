/**
 * Commission plans: each person can have their own rate, repairs can pay a set amount per
 * type of job, and phone sales pay the seller. Refunds and partner-shop fees reduce what is
 * paid. None of this changes stored money or profit figures.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import * as request from 'supertest';

describe('Commission plans (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let cashier: string;
  const run = Date.now().toString(36);
  // A date range that holds only what this test creates is not possible (shared DB),
  // so every check compares before/after for the people involved.
  const put = (body: object, cookie = owner) =>
    request(app.getHttpServer()).put('/api/v1/commission/config').set('Cookie', cookie).send(body);
  const report = async () => (await authGet(app, '/api/v1/commission/report', owner).expect(200)).body;
  const rowOf = (rep: any, userId: string) =>
    rep.rows.find((r: any) => r.userId === userId) ?? { repair: { jobs: 0, commission: 0 }, sale: { units: 0, commission: 0 }, items: [] };

  const deliveredRepair = async (tags: string[], price: number) => {
    const r = (await authPost(app, '/api/v1/repairs', manager, {
      deviceBrand: 'Apple', deviceModel: `Comm ${run}`, issue: 'x', estimateCost: price,
      technicianId: IDS.userTechA1, issueTags: tags,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) {
      await authPatch(app, `/api/v1/repairs/${r.id}`, manager, { status: s }).expect(200);
    }
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, manager, { paymentMethod: 'CASH', amountPaid: price }).expect(201);
    return r;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    await authPost(app, '/api/v1/shifts/open', manager, { openBalance: 0 }); // may already be open
  });

  afterAll(async () => {
    await put({
      repair: { type: 'NONE', value: 0, typeRates: {} }, sale: { type: 'NONE', value: 0, scope: 'PHONE' },
      staff: [{ userId: IDS.userTechA1, repairType: null, saleType: null }],
    });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CP-01: per-type amounts, and a technician\'s own rate overrides the shop rate', async () => {
    await put({ repair: { type: 'BY_TYPE', value: 0, typeRates: { 'หน้าจอ': 150, 'แบตเตอรี่': 80 } } }).expect(200);
    const before = rowOf(await report(), IDS.userTechA1);

    await deliveredRepair(['หน้าจอ', 'แบตเตอรี่'], 1500);
    let after = rowOf(await report(), IDS.userTechA1);
    expect(after.repair.jobs - before.repair.jobs).toBe(1);
    const item = after.items.find((i: any) => i.kind === 'REPAIR' && i.label.includes(run));
    expect(item.commission).toBe(150); // highest type, not 150 + 80

    // This technician gets 40% of the job instead of the per-type amount
    await put({ staff: [{ userId: IDS.userTechA1, repairType: 'PERCENT_TOTAL', repairValue: 40 }] }).expect(200);
    after = rowOf(await report(), IDS.userTechA1);
    expect(after.items.find((i: any) => i.ref === item.ref).commission).toBe(600);
  });

  it('CP-02: a refund lowers the commission', async () => {
    await put({ staff: [{ userId: IDS.userTechA1, repairType: 'PERCENT_TOTAL', repairValue: 10 }] }).expect(200);
    const r = await deliveredRepair([], 1000);
    const ticket = r.ticketNumber;
    const itemOf = async () => rowOf(await report(), IDS.userTechA1).items.find((i: any) => i.ref === ticket);
    expect((await itemOf()).commission).toBe(100);

    await prisma.repairPaymentReversal.create({
      data: { repairId: r.id, amount: 400, paymentMethod: 'CASH', reason: 'e2e', createdById: IDS.userOwnerA },
    });
    expect((await itemOf()).commission).toBe(60);
  });

  it('CP-03: phone sales pay the seller picked at checkout, not the cashier', async () => {
    await put({ sale: { type: 'FIXED_PER_UNIT', value: 300, scope: 'PHONE' } }).expect(200);
    const sellers = (await authGet(app, '/api/v1/commission/sellers', manager).expect(200)).body;
    expect(sellers.enabled).toBe(true);
    expect(sellers.sellers.some((s: any) => s.id === IDS.userTechA1)).toBe(true);

    const productId = (await authPost(app, '/api/v1/products', owner, {
      name: `Phone ${run}`, sku: `CP-${run}`, type: 'PHONE', price: 10000, costPrice: 8000, stock: 3, branchId: IDS.branchA1,
    }).expect(201)).body.id;
    const before = rowOf(await report(), IDS.userTechA1);

    await authPost(app, '/api/v1/sales', manager, {
      paymentMethod: 'CASH', amountPaid: 20000, branchId: IDS.branchA1, sellerId: IDS.userTechA1,
      items: [{ productId, quantity: 2, price: 10000 }],
    }).expect(201);

    const after = rowOf(await report(), IDS.userTechA1);
    expect(after.sale.units - before.sale.units).toBe(2);
    expect(after.sale.commission - before.sale.commission).toBe(600);
  });

  it('CP-04: only staff of this shop can be the seller or get a rate; only the owner changes rates', async () => {
    const productId = (await prisma.product.findFirstOrThrow({ where: { sku: `CP-${run}` } })).id;
    await authPost(app, '/api/v1/sales', manager, {
      paymentMethod: 'CASH', amountPaid: 10000, branchId: IDS.branchA1, sellerId: IDS.userOwnerB,
      items: [{ productId, quantity: 1, price: 10000 }],
    }).expect(400);
    await put({ staff: [{ userId: IDS.userOwnerB, repairType: 'FIXED', repairValue: 999 }] }).expect(400);
    await put({ repair: { type: 'PERCENT_TOTAL', value: 150 } }).expect(400);
    await put({ sale: { type: 'NONE' } }, cashier).expect(403);
    await authGet(app, '/api/v1/commission/report', cashier).expect(403);
  });
});
