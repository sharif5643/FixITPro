/**
 * Technicians hear about repair jobs: a job with no technician alerts every technician of the
 * branch (cleared once someone is assigned); the one assigned gets their own alert.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import * as request from 'supertest';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Job alerts for technicians (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let manager: string;
  let tech: string;
  const run = Date.now().toString(36);

  const myJobAlerts = async (cookie: string) =>
    ((await authGet(app, '/api/v1/notifications?isRead=false&limit=50', cookie).expect(200)).body.items as any[])
      .filter((n) => n.type === 'REPAIR_NEW' || n.type === 'REPAIR_ASSIGNED');

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    tech    = (await loginAs(app, CREDS.techA1.email, CREDS.techA1.password)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('JA-01: a job with no technician alerts the branch technicians; assigning it clears that and alerts the one assigned', async () => {
    const r = (await authPost(app, '/api/v1/repairs', manager, {
      deviceBrand: 'Apple', deviceModel: `Alert ${run}`, issue: 'จอแตก', estimateCost: 1500,
    }).expect(201)).body;

    const before = await myJobAlerts(tech);
    const fresh = before.find((n) => n.entityId === r.id);
    expect(fresh).toMatchObject({ type: 'REPAIR_NEW', userId: IDS.userTechA1 });
    expect(fresh.message).toContain(r.ticketNumber);
    // Not shown to the manager who took the job in
    expect((await myJobAlerts(manager)).some((n) => n.entityId === r.id)).toBe(false);

    await authPatch(app, `/api/v1/repairs/${r.id}`, manager, { technicianId: IDS.userTechA1 }).expect(200);
    const after = (await myJobAlerts(tech)).filter((n) => n.entityId === r.id);
    expect(after.map((n) => n.type)).toEqual(['REPAIR_ASSIGNED']);
  });

  it('JA-02: a phone registers for the account signed in on it, moves with the next sign-in, and is forgotten on sign-out', async () => {
    const token = `fcm-${run}-${'x'.repeat(40)}`;
    await authPost(app, '/api/v1/push/devices', tech, { token: 'short' }).expect(400);
    await authPost(app, '/api/v1/push/devices', tech, { token, app: 'staff' }).expect(201);
    expect(await prisma.pushDevice.findUnique({ where: { token } })).toMatchObject({ userId: IDS.userTechA1, tenantId: IDS.tenantA, app: 'staff' });

    // The manager signs in on the same phone: it now gets the manager's alerts only
    await authPost(app, '/api/v1/push/devices', manager, { token, app: 'staff' }).expect(201);
    expect((await prisma.pushDevice.findUnique({ where: { token } }))!.userId).toBe(IDS.userManagerA1);
    expect(await prisma.pushDevice.count({ where: { token } })).toBe(1);

    // Signing out sends the phone's token; the server stops notifying that phone
    const s = await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', s.cookies).set('X-Push-Token', token).expect(201);
    expect(await prisma.pushDevice.findUnique({ where: { token } })).toBeNull();
  });
});
