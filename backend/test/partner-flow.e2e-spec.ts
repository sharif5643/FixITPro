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
});
