/**
 * Partner repair, end to end between two shops: shop A sends a job to shop B, B takes it through
 * to returning the device, A confirms it came back. While the device is at B, A cannot take
 * payment and hand the job over. A job B rejected can be sent again.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Partner repair flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;
  let shiftA: string;
  let relationshipId: string;
  const run = Date.now().toString(36);
  const patch = (id: string, b: object) => request(app.getHttpServer()).patch(`/api/v1/repairs/${id}`).set('Cookie', ownerA).send(b);
  const newJob = async () => (await authPost(app, '/api/v1/repairs', ownerA, {
    deviceBrand: 'Apple', deviceModel: `PF ${run}`, issue: 'board', estimateCost: 3000, branchId: IDS.branchA1,
  }).expect(201)).body.id as string;
  const send = (repairId: string) => authPost(app, `/api/v1/repairs/${repairId}/partner-transfer`, ownerA, {
    partnerTenantId: IDS.tenantB, relationshipId, sharedDeviceInfo: { deviceBrand: 'Apple', deviceModel: `PF ${run}`, issue: 'board' },
  });
  const step = (cookie: string, id: string, action: string, body: object = {}) =>
    authPost(app, `/api/v1/partner-transfers/${id}/${action}`, cookie, body);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const rel = await prisma.partnerRelationship.upsert({
      where: { initiatorTenantId_partnerTenantId: { initiatorTenantId: IDS.tenantA, partnerTenantId: IDS.tenantB } },
      update: { status: 'ACCEPTED' },
      create: { initiatorTenantId: IDS.tenantA, partnerTenantId: IDS.tenantB, status: 'ACCEPTED', requestedById: IDS.userOwnerA },
    });
    relationshipId = rel.id;
    const cur = await authGet(app, '/api/v1/shifts/current', ownerA);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, ownerA, { closeBalance: 0, note: 'e2e cleanup' });
    shiftA = (await authPost(app, '/api/v1/shifts/open', ownerA, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    if (shiftA) await authPost(app, `/api/v1/shifts/${shiftA}/close`, ownerA, { closeBalance: 0, note: 'e2e' });
    // leave shops A and B unlinked, as other test files expect (partner code tests link them themselves)
    const ids = (await prisma.partnerRepairTransfer.findMany({ where: { relationshipId }, select: { id: true } })).map((t) => t.id);
    await prisma.partnerRepairTransferEvent.deleteMany({ where: { transferId: { in: ids } } });
    await prisma.partnerRepairQuotationEvent.deleteMany({ where: { quotation: { transferId: { in: ids } } } });
    await prisma.partnerRepairQuotation.deleteMany({ where: { transferId: { in: ids } } });
    await prisma.partnerRepairTransfer.deleteMany({ where: { id: { in: ids } } });
    await prisma.partnerRelationship.delete({ where: { id: relationshipId } }).catch(() => undefined);
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PF-01: no payment while the device is at the partner; after A confirms it is back, payment goes through', async () => {
    const repairId = await newJob();
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await patch(repairId, { status: s }).expect(200);
    const t = (await send(repairId).expect(201)).body;

    // B sees it as a job sent to them; A sees it as one it sent
    const listB = (await authGet(app, '/api/v1/partner-transfers', ownerB).expect(200)).body;
    expect(listB.find((x: any) => x.id === t.id)?.partnerTenantId).toBe(IDS.tenantB);

    await step(ownerB, t.id, 'accept').expect((r) => expect([200, 201]).toContain(r.status));
    await step(ownerB, t.id, 'device-received').expect((r) => expect([200, 201]).toContain(r.status));

    const pay = () => authPost(app, `/api/v1/repairs/${repairId}/payment`, ownerA, { paymentMethod: 'CASH', amountPaid: 3000 });
    const blocked = await pay().expect(400);
    expect(JSON.stringify(blocked.body)).toContain('ร้านพาร์ทเนอร์');

    await step(ownerB, t.id, 'start').expect((r) => expect([200, 201]).toContain(r.status));
    await step(ownerB, t.id, 'complete', { completionNote: 'เปลี่ยนชิป' }).expect((r) => expect([200, 201]).toContain(r.status));
    await step(ownerB, t.id, 'return-device').expect((r) => expect([200, 201]).toContain(r.status));
    await pay().expect(400); // returned by B, not yet confirmed by A
    // only the shop that sent the job confirms the device came back
    await step(ownerB, t.id, 'owner-received').expect((r) => expect([403, 404]).toContain(r.status));
    await step(ownerA, t.id, 'owner-received').expect((r) => expect([200, 201]).toContain(r.status));

    await pay().expect(201);
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: repairId } })).status).toBe('DELIVERED');
  });

  it('PF-02: a job the partner rejected can be sent again', async () => {
    const repairId = await newJob();
    const first = (await send(repairId).expect(201)).body;
    await send(repairId).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400)); // one active transfer at a time
    await step(ownerB, first.id, 'reject', { rejectionNote: 'ไม่มีอะไหล่' }).expect((r) => expect([200, 201]).toContain(r.status));
    const second = (await send(repairId).expect(201)).body;
    expect(second.id).not.toBe(first.id);
  });

  it('PF-03: the agreed price is locked once the partner accepted; the other shop sees no staff names', async () => {
    const repairId = await newJob();
    const t = (await send(repairId).expect(201)).body;
    const price = (cookie: string, amount: number) =>
      request(app.getHttpServer()).patch(`/api/v1/partner-transfers/${t.id}/price`).set('Cookie', cookie).send({ agreedPartnerPrice: amount });
    // before B accepts, A's offer can still change
    await price(ownerA, 800).expect(200);
    await step(ownerB, t.id, 'accept').expect((r) => expect([200, 201]).toContain(r.status));
    // after: not by A alone
    await price(ownerA, 100).expect(409);
    expect(Number((await prisma.partnerRepairTransfer.findUniqueOrThrow({ where: { id: t.id } })).agreedPartnerPrice)).toBe(800);
    // a double click on the same step moves it once
    const [x, y] = await Promise.all([step(ownerB, t.id, 'device-received'), step(ownerB, t.id, 'device-received')]);
    expect([x.status, y.status].filter((c) => c === 409)).toHaveLength(1);
    expect([x.status, y.status].filter((c) => c < 300)).toHaveLength(1);
    expect(await prisma.partnerRepairTransferEvent.count({ where: { transferId: t.id, event: 'DEVICE_RECEIVED' } })).toBe(1);

    // a new price goes through a quotation the other side accepts
    const q = (await authPost(app, `/api/v1/partner-transfers/${t.id}/quotations`, ownerB, { amount: 950, note: 'อะไหล่แพงขึ้น' }).expect(201)).body;
    await authPost(app, `/api/v1/partner-quotations/${q.id}/accept`, ownerA, {}).expect((r) => expect([200, 201]).toContain(r.status));
    await authPost(app, `/api/v1/partner-quotations/${q.id}/accept`, ownerA, {}).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    expect(Number((await prisma.partnerRepairTransfer.findUniqueOrThrow({ where: { id: t.id } })).agreedPartnerPrice)).toBe(950);

    // history: each shop sees its own staff, the other shop only as a shop
    const evB = (await authGet(app, `/api/v1/partner-transfers/${t.id}/events`, ownerB).expect(200)).body;
    const fromA = evB.filter((e: any) => e.tenantId === IDS.tenantA);
    expect(fromA.length).toBeGreaterThan(0);
    expect(fromA.every((e: any) => e.actorName === 'ร้านต้นทาง' && e.actorId === null)).toBe(true);
    const evA = (await authGet(app, `/api/v1/partner-transfers/${t.id}/events`, ownerA).expect(200)).body;
    expect(evA.filter((e: any) => e.tenantId === IDS.tenantB).every((e: any) => e.actorName === 'ร้านพาร์ทเนอร์')).toBe(true);
    expect(evA.find((e: any) => e.tenantId === IDS.tenantA)?.actorName).not.toBe('ร้านต้นทาง');
    const qevA = (await authGet(app, `/api/v1/partner-quotations/${q.id}/events`, ownerA).expect(200)).body;
    expect(qevA.filter((e: any) => e.tenantId === IDS.tenantB).every((e: any) => e.actorName === 'ร้านพาร์ทเนอร์')).toBe(true);
    const relB = (await authGet(app, '/api/v1/partner-relationships', ownerB).expect(200)).body.find((r: any) => r.id === relationshipId);
    expect(relB.requestedBy).toBeNull();
  });

  it('PF-04: a suspended partnership stops work moving forward, but the device can still come home', async () => {
    const repairId = await newJob();
    const t = (await send(repairId).expect(201)).body;
    await step(ownerB, t.id, 'accept').expect((r) => expect([200, 201]).toContain(r.status));
    await step(ownerB, t.id, 'device-received').expect((r) => expect([200, 201]).toContain(r.status));

    // B suspends
    await authPost(app, `/api/v1/partner-relationships/${relationshipId}/suspend`, ownerB, {}).expect(200);
    // no new job, no forward step, no new price
    const other = await newJob();
    await send(other).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    await step(ownerB, t.id, 'start').expect(403);
    await authPost(app, `/api/v1/partner-transfers/${t.id}/quotations`, ownerB, { amount: 500 }).expect(403);
    // asking again by email does not lift it, and A cannot lift B's suspension
    const emailB = (await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantB }, select: { email: true } })).email;
    if (emailB) await authPost(app, '/api/v1/partner-relationships', ownerA, { partnerEmail: emailB }).expect(403);
    await authPost(app, `/api/v1/partner-relationships/${relationshipId}/resume`, ownerA, {}).expect(403);
    expect((await prisma.partnerRelationship.findUniqueOrThrow({ where: { id: relationshipId } })).status).toBe('SUSPENDED');

    // the device still comes home: B returns it unrepaired, A confirms; A cannot "recall" a device
    // that is at B (the job would look closed while the phone is still out)
    await step(ownerA, t.id, 'recall', { recallNote: 'ขอเครื่องคืน' }).expect(409);
    await step(ownerB, t.id, 'return-device').expect((r) => expect([200, 201]).toContain(r.status));
    await step(ownerA, t.id, 'owner-received').expect((r) => expect([200, 201]).toContain(r.status));

    // B opens it again: work goes on as before
    await authPost(app, `/api/v1/partner-relationships/${relationshipId}/resume`, ownerB, {}).expect(200);
    await send(other).expect(201);
  });
});
