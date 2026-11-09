/**
 * Audit round 3 — money at the counter:
 *  - money paid before pickup is taken off the pickup bill (the customer used to pay it twice)
 *  - after a payment is reversed, paying again asks only for what is still owed
 *  - a price below what the customer already paid is refused (the excess used to be kept silently)
 *  - extra payments: never more than what is owed, never on a fully paid job, always in a shift
 *  - a sale's change must come out of cash: a card or transfer above the bill is refused
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Audit fixes round 3 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const patch = (id: string, b: object) => request(app.getHttpServer()).patch(`/api/v1/repairs/${id}`).set('Cookie', owner).send(b);
  const readyJob = async (estimate: number, deposit: number) => {
    const job = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'X', deviceModel: `R3 ${run}`, issue: 'battery', estimateCost: estimate, deposit, branchId: IDS.branchB1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await patch(job.id, { status: s }).expect(200);
    return job.id as string;
  };
  const collected = async (id: string) => {
    const r = await prisma.repair.findUniqueOrThrow({ where: { id }, include: { additionalPayments: true } });
    return Number(r.deposit ?? 0) + Number(r.paidAmount ?? 0) + r.additionalPayments.reduce((s, p) => s + Number(p.amount), 0);
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const cur = await authGet(app, '/api/v1/shifts/current', owner);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, owner, { closeBalance: 0, note: 'e2e cleanup' });
    shiftId = (await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    if (shiftId) await authPost(app, `/api/v1/shifts/${shiftId}/close`, owner, { closeBalance: 0, note: 'e2e' });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('R3-01: paid 1,000 before pickup on a 2,000 job (500 deposit) — pickup takes 500, the shop gets 2,000 in all', async () => {
    const id = await readyJob(2000, 500);
    await authPost(app, `/api/v1/repairs/${id}/additional-payment`, owner, { amount: 1000, paymentMethod: 'CASH' }).expect(201);
    // more than is left (500) is refused
    await authPost(app, `/api/v1/repairs/${id}/additional-payment`, owner, { amount: 600, paymentMethod: 'CASH' }).expect(400);
    // pickup: customer hands 500 — that is the whole balance now
    await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 500 }).expect(201);
    const r = await prisma.repair.findUniqueOrThrow({ where: { id } });
    expect(r.paymentStatus).toBe('PAID');
    expect(Number(r.paidAmount)).toBe(500);
    expect(await collected(id)).toBe(2000);
    // fully paid: nothing more can be taken
    await authPost(app, `/api/v1/repairs/${id}/additional-payment`, owner, { amount: 100, paymentMethod: 'CASH' }).expect(400);
  });

  it('R3-02: a price below what the customer already paid is refused, not kept silently', async () => {
    const id = await readyJob(1000, 1000);
    const res = await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 0, finalCost: 700 }).expect(400);
    expect(JSON.stringify(res.body)).toContain('ต่ำกว่าเงินที่ลูกค้าจ่ายมาแล้ว');
    // at the full price the deposit covers it
    await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 0 }).expect(201);
    expect(await collected(id)).toBe(1000);
  });

  it('R3-03: a card above the bill (split) is refused; cash above the bill gives change', async () => {
    const cat = (await authPost(app, '/api/v1/categories', owner, { name: `R3 ${run}` })).body.id;
    const p = (await authPost(app, '/api/v1/products', owner, {
      name: `R3 Case ${run}`, sku: `R3-${run}`, type: 'ACCESSORY', price: 1000, costPrice: 400, stock: 10, branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body;
    const productId = p.id ?? p.product?.id;
    const sale = (payments: object[]) => authPost(app, '/api/v1/sales', owner, {
      branchId: IDS.branchB1, payments, items: [{ productId, quantity: 1, price: 1000 }],
    });
    const bad = await sale([{ paymentMethod: 'CARD', amount: 1200 }]).expect(400);
    expect(JSON.stringify(bad.body)).toContain('เงินทอนต้องมาจากเงินสด');
    await sale([{ paymentMethod: 'TRANSFER', amount: 500 }, { paymentMethod: 'CARD', amount: 600 }]).expect(400);
    const ok = (await sale([{ paymentMethod: 'CASH', amount: 1200 }]).expect(201)).body;
    expect(Number(ok.change)).toBe(200);
  });
});
