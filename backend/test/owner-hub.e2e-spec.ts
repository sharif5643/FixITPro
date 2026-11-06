/**
 * Owner hub ("ห้องเจ้าของร้าน"): only for a shop the super admin switched it on for, only for the
 * owner; its numbers are the daily close's and the profit report's; the evening LINE summary goes
 * once a day to linked owners of shops that have it, and to no one else.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { ModulesService } from '../src/modules/modules.service';
import { OwnerHubService } from '../src/owner-hub/owner-hub.service';
import { LineMessagingService } from '../src/line-messaging/line-messaging.service';
import { bangkokDate } from '../src/common/bangkok-date';

describe('Owner hub (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;
  let managerA: string;
  const pushes: { to: string; text: string }[] = [];

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    managerA = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    jest.spyOn(LineMessagingService.prototype, 'pushCentral').mockImplementation(async (to, text) => { pushes.push({ to, text }); return true; });
  });
  afterAll(async () => {
    await app.get(ModulesService).removeTenantModuleOverride(IDS.tenantA, 'owner_hub').catch(() => undefined);
    await prisma.user.updateMany({ where: { id: { in: [IDS.userOwnerA, IDS.userOwnerB] } }, data: { lineChatId: null, ownerDailyLine: true } });
    jest.restoreAllMocks();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OH-01: off by default — even the owner is refused until the super admin switches it on', async () => {
    const res = await authGet(app, '/api/v1/owner-hub/today', ownerA).expect(403);
    expect(JSON.stringify(res.body)).toContain('ห้องเจ้าของร้าน');
    const mods = (await authGet(app, '/api/v1/modules/enabled', ownerA)).body;
    const list: string[] = Array.isArray(mods) ? mods : mods.modules ?? mods.enabledModules ?? [];
    expect(list).not.toContain('owner_hub');
  });

  it('OH-02: switched on for shop A — owner A sees it, manager A and shop B do not', async () => {
    await app.get(ModulesService).setTenantModuleOverride(IDS.tenantA, 'owner_hub', true);
    await authGet(app, '/api/v1/owner-hub/today', ownerA).expect(200);
    await authGet(app, '/api/v1/owner-hub/today', managerA).expect(403);
    await authGet(app, '/api/v1/owner-hub/today', ownerB).expect(403);
  });

  it('OH-03: the numbers are the daily close and profit report numbers, per branch too', async () => {
    const date = bangkokDate();
    const hub = (await authGet(app, '/api/v1/owner-hub/today', ownerA).expect(200)).body;
    expect(hub.date).toBe(date);
    const close = (await authGet(app, `/api/v1/reports/daily-closing?date=${date}`, ownerA).expect(200)).body;
    const profit = (await authGet(app, `/api/v1/reports/profit?startDate=${date}&endDate=${date}`, ownerA).expect(200)).body;
    expect(hub.total.cash).toBeCloseTo(close.revenue.cash, 2);
    expect(hub.total.transfer).toBeCloseTo(close.revenue.transfer, 2);
    expect(hub.total.drawerOut).toBeCloseTo(close.drawer.outTotal, 2);
    expect(hub.total.revenue).toBeCloseTo(profit.summary.totalRevenue, 2);
    expect(hub.total.netProfit).toBeCloseTo(profit.summary.netProfit, 2);

    // shop A has two branches: one row each, and each row is that branch's own report
    expect(hub.branches.map((b: any) => b.branchId).sort()).toEqual([IDS.branchA1, IDS.branchA2].sort());
    const a1 = hub.branches.find((b: any) => b.branchId === IDS.branchA1);
    const p1 = (await authGet(app, `/api/v1/reports/profit?startDate=${date}&endDate=${date}&branchId=${IDS.branchA1}`, ownerA).expect(200)).body;
    expect(a1.revenue).toBeCloseTo(p1.summary.totalRevenue, 2);

    // one branch picked: that branch only, no per-branch rows
    const one = (await authGet(app, `/api/v1/owner-hub/today?branchId=${IDS.branchA1}`, ownerA).expect(200)).body;
    expect(one.branches).toEqual([]);
    expect(one.total.revenue).toBeCloseTo(p1.summary.totalRevenue, 2);
  });

  it("OH-04: another shop's branch is refused", async () => {
    const res = await authGet(app, `/api/v1/owner-hub/today?branchId=${IDS.branchB1}`, ownerA);
    expect([400, 403]).toContain(res.status);
  });

  it('OH-05: a shift left open more than a day shows under "ต้องจัดการ"', async () => {
    const shift = await prisma.shift.create({
      data: { userId: IDS.userManagerA1, branchId: IDS.branchA2, openBalance: 0, openedAt: new Date(Date.now() - 30 * 3_600_000), isActive: true },
    });
    try {
      const hub = (await authGet(app, '/api/v1/owner-hub/today', ownerA).expect(200)).body;
      const row = hub.actions.longShifts.find((s: any) => s.id === shift.id);
      expect(row).toBeDefined();
      expect(row.hours).toBeGreaterThanOrEqual(29);
      expect(typeof hub.actions.customerDebt.total).toBe('number');
      expect(typeof hub.actions.stock.lowStock).toBe('number');
    } finally {
      await prisma.shift.delete({ where: { id: shift.id } });
    }
  });

  it('OH-06: LINE — test send needs a linked LINE; the evening summary goes once, only where the module is on', async () => {
    await authPost(app, '/api/v1/owner-hub/line/test', ownerA, {}).expect(400);

    await prisma.user.update({ where: { id: IDS.userOwnerA }, data: { lineChatId: `Uowner-a-${Date.now()}` } });
    await prisma.user.update({ where: { id: IDS.userOwnerB }, data: { lineChatId: `Uowner-b-${Date.now()}` } });
    const a = await prisma.user.findUniqueOrThrow({ where: { id: IDS.userOwnerA } });
    const b = await prisma.user.findUniqueOrThrow({ where: { id: IDS.userOwnerB } });

    pushes.length = 0;
    await authPost(app, '/api/v1/owner-hub/line/test', ownerA, {}).expect(201);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].to).toBe(a.lineChatId);
    expect(pushes[0].text).toContain('รายรับวันนี้');
    expect(pushes[0].text).toContain('/owner');

    // fixed clock so the once-a-day marker of this run never meets a real day's
    const svc = app.get(OwnerHubService);
    const at = new Date('2031-01-15T14:00:00Z');
    pushes.length = 0;
    await svc.sendDailySummaries(at);
    expect(pushes.map((p) => p.to)).toContain(a.lineChatId);
    expect(pushes.map((p) => p.to)).not.toContain(b.lineChatId); // shop B does not have the module
    pushes.length = 0;
    await svc.sendDailySummaries(at);
    expect(pushes.map((p) => p.to)).not.toContain(a.lineChatId); // not twice the same day

    // the owner turns it off
    const off = (await request(app.getHttpServer()).put('/api/v1/owner-hub/line/daily').set('Cookie', ownerA).send({ on: false }).expect(200)).body;
    expect(off.dailySummary).toBe(false);
    pushes.length = 0;
    await svc.sendDailySummaries(new Date('2031-01-16T14:00:00Z'));
    expect(pushes.map((p) => p.to)).not.toContain(a.lineChatId);
  });

  it('OH-07: switched off again — refused again', async () => {
    await app.get(ModulesService).setTenantModuleOverride(IDS.tenantA, 'owner_hub', false);
    await authGet(app, '/api/v1/owner-hub/today', ownerA).expect(403);
  });
});
