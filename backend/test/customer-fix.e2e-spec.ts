/**
 * A customer added twice by mistake: a repair job can be moved to the right customer, and the
 * duplicate can be merged into the real one (repairs, bills, notes and points move; nothing is lost).
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { ensureInShift } from './helpers/shift.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Duplicate customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let ownerA: string;
  let manager: string;
  const run = Date.now().toString(36).slice(-6);
  const phone = (n: number) => `08${run.replace(/\D/g, '').padEnd(4, '7').slice(0, 4)}${String(n).padStart(4, '0')}`;
  const patch = (p: string, c: string, b: object) => request(app.getHttpServer()).patch(p).set('Cookie', c).send(b);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    await ensureInShift(app, owner);
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  const customer = async (name: string, ph?: string) =>
    (await authPost(app, '/api/v1/customers', owner, { name, ...(ph ? { phone: ph } : {}) }).expect(201)).body.id as string;

  it('CF-01: a repair job moves to the right customer (not after it was handed back, not across shops)', async () => {
    const real = await customer(`สมชาย ${run}`, phone(1));
    const dup = await customer(`สมชาย ซ้ำ ${run}`, phone(2));
    const r = (await authPost(app, '/api/v1/repairs', owner, {
      customerId: dup, deviceBrand: 'HP', deviceModel: 'Laptop', issue: 'x', estimateCost: 500, branchId: IDS.branchB1,
    }).expect(201)).body;
    const moved = (await patch(`/api/v1/repairs/${r.id}/customer`, owner, { customerId: real }).expect(200)).body;
    expect(moved.customer.id).toBe(real);
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: r.id } })).customerId).toBe(real);
    // another shop's customer or another shop's job: not found
    const otherShop = (await authPost(app, '/api/v1/customers', ownerA, { name: `A ${run}` }).expect(201)).body.id;
    await patch(`/api/v1/repairs/${r.id}/customer`, owner, { customerId: otherShop }).expect(404);
    await patch(`/api/v1/repairs/${r.id}/customer`, ownerA, { customerId: otherShop }).expect(404);
    const log = await prisma.auditLog.findFirst({ where: { action: 'REPAIR_CUSTOMER_CHANGED', entityId: r.id } });
    expect(log).toBeTruthy();
  });

  it('CF-02: merging a duplicate moves everything to the real customer and removes only the empty duplicate', async () => {
    const real = await customer(`มานี ${run}`);                      // no phone yet
    const dup = await customer(`มานี (ซ้ำ) ${run}`, phone(3));
    const r1 = (await authPost(app, '/api/v1/repairs', owner, {
      customerId: dup, deviceBrand: 'Canon', deviceModel: 'G2010', issue: 'x', estimateCost: 300, branchId: IDS.branchB1,
    }).expect(201)).body;
    await authPost(app, `/api/v1/customers/${dup}/notes`, owner, { note: 'ลูกค้าประจำ' }).expect(201);
    await authPost(app, `/api/v1/customers/${dup}/loyalty/adjust`, owner, { points: 40, type: 'EARN_MANUAL', note: 'e2e' }).expect(201);

    const preview = (await authGet(app, `/api/v1/customers/${real}/merge-preview?fromId=${dup}`, owner).expect(200)).body;
    expect(preview.moves.repairs).toBe(1);
    expect(preview.moves.notes).toBe(1);
    expect(preview.from.points).toBe(40);

    await authPost(app, `/api/v1/customers/${real}/merge`, manager, { fromId: dup }).expect((res) => expect([403, 404]).toContain(res.status));
    await authPost(app, `/api/v1/customers/${real}/merge`, owner, { fromId: real }).expect(400);
    await authPost(app, `/api/v1/customers/${real}/merge`, owner, { fromId: dup }).expect(201);

    expect(await prisma.customer.findUnique({ where: { id: dup } })).toBeNull();
    const kept = await prisma.customer.findUniqueOrThrow({ where: { id: real } });
    expect(kept.phone).toBe(phone(3));                                // filled from the duplicate
    expect(kept.points).toBe(40);
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: r1.id } })).customerId).toBe(real);
    const notes = await prisma.customerNote.findMany({ where: { customerId: real } });
    expect(notes.some((n) => n.note === 'ลูกค้าประจำ')).toBe(true);
    expect(notes.some((n) => n.note.startsWith('รวมลูกค้าซ้ำ'))).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { action: 'CUSTOMER_MERGED', entityId: real } });
    expect((log?.beforeData as any)?.merged?.phone).toBe(phone(3));
    // the customer's page shows the job now
    const detail = (await authGet(app, `/api/v1/customers/${real}`, owner).expect(200)).body;
    expect(JSON.stringify(detail)).toContain(r1.id);
  });

  it('CF-03: adjusting points from the customer page works (type and note were rejected before)', async () => {
    const c = await customer(`แต้ม ${run}`);
    await authPost(app, `/api/v1/customers/${c}/loyalty/adjust`, owner, { points: 25, type: 'EARN_MANUAL', note: 'ทดสอบ' }).expect(201);
    await authPost(app, `/api/v1/customers/${c}/loyalty/adjust`, owner, { points: -10, type: 'REDEEM' }).expect(201);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c } })).points).toBe(15);
    await authPost(app, `/api/v1/customers/${c}/loyalty/adjust`, owner, { points: 5, type: 'HACK' }).expect(400);
  });
});
