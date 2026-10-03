/**
 * Notifications stay inside their shop, and the unread badge counts recent alerts only.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Notification scope (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  const run = Date.now().toString(36);
  const created: string[] = [];

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: created } } });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('NOTIF-01: the dashboard never shows another shop\'s notifications', async () => {
    const other = await prisma.notification.create({
      data: { type: 'SYSTEM', title: `other-shop-${run}`, message: 'x', tenantId: IDS.tenantB, branchId: null },
    });
    created.push(other.id);

    for (const q of [`?branchId=${IDS.branchA1}`, '']) {
      const body = (await authGet(app, `/api/v1/dashboard/overview${q}`, ownerA).expect(200)).body;
      const titles = (body.notifications.latest as any[]).map((n) => n.title);
      expect(titles).not.toContain(`other-shop-${run}`);
    }
  });

  it('NOTIF-02: unread badge counts the last 30 days; older unread stay in the list', async () => {
    const before = (await authGet(app, '/api/v1/notifications/unread-count', ownerA).expect(200)).body.count;
    const old = await prisma.notification.create({
      data: {
        type: 'SYSTEM', title: `old-${run}`, message: 'x', tenantId: IDS.tenantA,
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });
    const fresh = await prisma.notification.create({
      data: { type: 'SYSTEM', title: `fresh-${run}`, message: 'x', tenantId: IDS.tenantA },
    });
    created.push(old.id, fresh.id);

    const after = (await authGet(app, '/api/v1/notifications/unread-count', ownerA).expect(200)).body.count;
    expect(after - before).toBe(1);

    const list = (await authGet(app, '/api/v1/notifications?limit=100&isRead=false', ownerA).expect(200)).body.items as any[];
    expect(list.map((n) => n.title)).toEqual(expect.arrayContaining([`old-${run}`, `fresh-${run}`]));
  });
});
