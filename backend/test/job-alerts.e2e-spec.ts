/**
 * Technicians hear about repair jobs: a job with no technician alerts every technician of the
 * branch (cleared once someone is assigned), and staff can link their LINE to the shop's own
 * LINE Official Account by sending it a code, through that shop's signed webhook.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Job alerts for technicians, in the app and on LINE (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let manager: string;
  let tech: string;
  const run = Date.now().toString(36);
  const SECRET = `test-secret-${run}`;
  let saved: { lineChannelAccessToken: string | null; lineChannelSecret: string | null; lineNotifyEnabled: boolean; lineOaId: string | null } | null;

  const myJobAlerts = async (cookie: string) =>
    ((await authGet(app, '/api/v1/notifications?isRead=false&limit=50', cookie).expect(200)).body.items as any[])
      .filter((n) => n.type === 'REPAIR_NEW' || n.type === 'REPAIR_ASSIGNED');

  const sendToShopOa = (tenantId: string, text: string, secret = SECRET, lineUserId = `U${run}`) => {
    const body = JSON.stringify({ events: [{ type: 'message', source: { userId: lineUserId }, message: { type: 'text', text } }] });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
    return request(app.getHttpServer()).post(`/api/v1/public/line/webhook/${tenantId}`)
      .set('Content-Type', 'application/json').set('x-line-signature', signature).send(body);
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    tech    = (await loginAs(app, CREDS.techA1.email, CREDS.techA1.password)).cookies;
    // The shop may have no settings row yet
    await prisma.shopSettings.upsert({ where: { tenantId: IDS.tenantA }, create: { tenantId: IDS.tenantA }, update: {} });
    saved = await prisma.shopSettings.findUnique({
      where: { tenantId: IDS.tenantA },
      select: { lineChannelAccessToken: true, lineChannelSecret: true, lineNotifyEnabled: true, lineOaId: true },
    });
  });

  afterAll(async () => {
    if (saved) await prisma.shopSettings.update({ where: { tenantId: IDS.tenantA }, data: saved });
    await prisma.user.update({ where: { id: IDS.userTechA1 }, data: { lineNotifyId: null } });
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

  it('JA-02: a staff member links LINE by sending the shop OA a code; the webhook is verified with that shop\'s secret', async () => {
    // Shop not connected yet: a code is given but the app says the shop is not ready
    await prisma.shopSettings.update({ where: { tenantId: IDS.tenantA }, data: { lineChannelAccessToken: null, lineChannelSecret: null, lineNotifyEnabled: false } });
    expect((await authPost(app, '/api/v1/line/staff/link-code', tech, {}).expect(201)).body.shopReady).toBe(false);
    await sendToShopOa(IDS.tenantA, 'FIX-000000').expect(401);                 // no secret → webhook refused

    await prisma.shopSettings.update({
      where: { tenantId: IDS.tenantA },
      data: { lineChannelAccessToken: 'test-token', lineChannelSecret: SECRET, lineNotifyEnabled: true, lineOaId: '@fixtest' },
    });
    const code = (await authPost(app, '/api/v1/line/staff/link-code', tech, {}).expect(201)).body;
    expect(code).toMatchObject({ shopReady: true, oaId: '@fixtest' });
    expect(code.code).toMatch(/^FIX-\d{6}$/);
    expect(code.addFriendUrl).toContain('line.me');

    await sendToShopOa(IDS.tenantA, code.code, 'wrong-secret').expect(401);    // forged call
    await sendToShopOa(IDS.tenantB, code.code).expect(401);                    // other shop has no secret
    expect((await authGet(app, '/api/v1/line/staff/status', tech).expect(200)).body.linked).toBe(false);

    await sendToShopOa(IDS.tenantA, code.code.toLowerCase().replace('-', '')).expect(200);
    expect((await authGet(app, '/api/v1/line/staff/status', tech).expect(200)).body.linked).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: IDS.userTechA1 } })).lineNotifyId).toBe(`U${run}`);

    // A code works once
    await sendToShopOa(IDS.tenantA, code.code, SECRET, `Uother${run}`).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: IDS.userTechA1 } })).lineNotifyId).toBe(`U${run}`);

    await request(app.getHttpServer()).delete('/api/v1/line/staff/link').set('Cookie', tech).expect(200);
    expect((await authGet(app, '/api/v1/line/staff/status', tech).expect(200)).body.linked).toBe(false);
  });

  it('JA-03: the shop LINE secret is never sent back to the browser', async () => {
    const owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    const s = (await authGet(app, '/api/v1/settings', owner).expect(200)).body;
    expect(s.lineChannelSecret).toMatch(/^\*{4}/);
    expect(s.lineChannelSecret).not.toContain(SECRET);
  });
});
