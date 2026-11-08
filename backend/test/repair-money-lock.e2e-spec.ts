/**
 * Money on a repair job changes only through the steps that record the cash (intake, payment,
 * debt payment, reversal, refund-and-cancel). Editing it through PATCH /repairs/:id let a cashier
 * erase a customer's debt on a delivered job (raise the deposit) or cut the price after payment,
 * with no cash record. Other fields (note, IMEI, technician…) stay editable.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Repair money lock (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const patch = (id: string, b: object) => request(app.getHttpServer()).patch(`/api/v1/repairs/${id}`).set('Cookie', owner).send(b);
  const newJob = async (deposit: number) => (await authPost(app, '/api/v1/repairs', owner, {
    deviceBrand: 'X', deviceModel: `Lock ${run}`, issue: 'screen', estimateCost: 3000, deposit, branchId: IDS.branchB1,
  }).expect(201)).body;
  const finish = async (id: string) => {
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await patch(id, { status: s }).expect(200);
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

  it('LOCK-01: a delivered job with money owed — deposit, price and discount cannot be edited; the note can', async () => {
    const job = await newJob(500);
    await finish(job.id);
    // pays 1,000 of the 2,500 still owed: delivered, PARTIAL
    await authPost(app, `/api/v1/repairs/${job.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 1000, allowPartial: true }).expect(201);

    const before = await prisma.repair.findUniqueOrThrow({ where: { id: job.id } });
    expect(before.status).toBe('DELIVERED');
    expect(before.paymentStatus).toBe('PARTIAL');

    for (const body of [{ deposit: 2500 }, { finalCost: 1500 }, { discount: 1500 }, { estimatedTotal: 1500 }]) {
      const res = await patch(job.id, body).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/แก้ยอดมัดจำ|แก้ราคาไม่ได้/);
    }
    // sending the same values back (a form that re-sends everything) is fine
    await patch(job.id, { deposit: Number(before.deposit), note: `ok ${run}` }).expect(200);

    const after = await prisma.repair.findUniqueOrThrow({ where: { id: job.id } });
    expect(Number(after.deposit)).toBe(500);
    expect(Number(after.finalCost)).toBe(Number(before.finalCost));
    expect(Number(after.discount ?? 0)).toBe(Number(before.discount ?? 0));
    expect(after.note).toBe(`ok ${run}`);
  });

  it('LOCK-02: an open job — the quote can still change, the deposit cannot (it was taken at intake)', async () => {
    const job = await newJob(300);
    await patch(job.id, { estimatedTotal: 3500 }).expect(200);
    await patch(job.id, { deposit: 0 }).expect(400);
    await patch(job.id, { deposit: 900 }).expect(400);
    const r = await prisma.repair.findUniqueOrThrow({ where: { id: job.id } });
    expect(Number(r.estimatedTotal)).toBe(3500);
    expect(Number(r.deposit)).toBe(300);
  });
});
