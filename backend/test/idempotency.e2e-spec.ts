/**
 * The same sale / payment sent twice with the same Idempotency-Key (a second tap after the answer
 * was lost, an offline item sent again) is recorded once and the second call gets the first answer.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, testPrisma } from './helpers/seed.helper';
import { closeOpenShiftsOfBranch } from './helpers/shift.helper';

describe('Money requests recorded once (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let shiftId: string;
  let productId: string;
  const run = Date.now().toString(36);
  const post = (path: string, body: object, key?: string) => {
    const r = request(app.getHttpServer()).post(path).set('Cookie', owner);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  };
  const saleBody = (qty = 1) => ({
    branchId: IDS.branchA1, payments: [{ paymentMethod: 'CASH', amount: 100 * qty }],
    items: [{ productId, quantity: qty, price: 100 }],
  });
  const expectedCash = async () =>
    Number((await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body.expectedCashBalance);
  const stock = async () => (await prisma.branchStock.findUniqueOrThrow({ where: { branchId_productId: { branchId: IDS.branchA1, productId } } })).quantity;

  beforeAll(async () => {
    prisma = testPrisma();
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    await closeOpenShiftsOfBranch(app, owner, IDS.branchA1);
    shiftId = (await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201)).body.id;
    const p = await prisma.product.create({ data: { name: `Idem ${run}`, sku: `IDEM-${run}`, type: 'ACCESSORY', price: 100, costPrice: 40, stock: 50, tenantId: IDS.tenantA } as any });
    await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: 50 } });
    productId = p.id;
  });
  afterAll(async () => {
    if (shiftId) await authPost(app, `/api/v1/shifts/${shiftId}/close`, owner, { closeBalance: 0, note: 'e2e' });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IDEM-01: the same sale sent twice is one bill, one stock deduction, one cash entry', async () => {
    const cash0 = await expectedCash(); const st0 = await stock();
    const key = `sale-${run}-0001`;
    const a = await post('/api/v1/sales', saleBody(), key).expect(201);
    const b = await post('/api/v1/sales', saleBody(), key).expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(await prisma.sale.count({ where: { items: { some: { productId } } } })).toBe(1);
    expect(await stock()).toBe(st0 - 1);
    expect(await expectedCash()).toBeCloseTo(cash0 + 100, 2);

    // a new intent (new key) is a new bill
    const c = await post('/api/v1/sales', saleBody(), `sale-${run}-0002`).expect(201);
    expect(c.body.id).not.toBe(a.body.id);
    expect(await stock()).toBe(st0 - 2);
  });

  it('IDEM-02: two taps at the same moment make one bill', async () => {
    const before = await prisma.sale.count({ where: { items: { some: { productId } } } });
    const key = `sale-${run}-0003`;
    const [x, y] = await Promise.all([post('/api/v1/sales', saleBody(), key), post('/api/v1/sales', saleBody(), key)]);
    expect([x.status, y.status].filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
    expect([x.status, y.status].every((s) => s === 201 || s === 409)).toBe(true);
    expect(await prisma.sale.count({ where: { items: { some: { productId } } } })).toBe(before + 1);
  });

  it('IDEM-03: a request that failed can be sent again with the same key; a key cannot be reused for another kind of request', async () => {
    const key = `sale-${run}-0004`;
    await post('/api/v1/sales', { ...saleBody(), payments: [{ paymentMethod: 'CASH', amount: 1 }] }, key).expect(400);
    await post('/api/v1/sales', saleBody(), key).expect(201);
    await post('/api/v1/expenses', { amount: 10, description: 'x', paymentMethod: 'CASH', expenseDate: new Date().toISOString().slice(0, 10) }, key).expect(409);
    await post('/api/v1/sales', saleBody(), 'bad key!').expect(400);
  });

  it('IDEM-04: a debt payment sent twice is taken once', async () => {
    const job = (await authPost(app, '/api/v1/repairs', owner, { deviceBrand: 'X', deviceModel: `Idem ${run}`, issue: 'x', estimateCost: 1000, branchId: IDS.branchA1 }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await authPatch(app, `/api/v1/repairs/${job.id}`, owner, { status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${job.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 400, allowPartial: true }).expect(201);
    const key = `debt-${run}-0001`;
    await post('/api/v1/debt-payments', { repairId: job.id, amount: 300, paymentMethod: 'CASH' }, key).expect(201);
    await post('/api/v1/debt-payments', { repairId: job.id, amount: 300, paymentMethod: 'CASH' }, key).expect(201);
    expect(await prisma.repairAdditionalPayment.count({ where: { repairId: job.id } })).toBe(1);
  });
});
