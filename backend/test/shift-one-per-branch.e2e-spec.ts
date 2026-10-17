/**
 * One branch, one cash drawer, one open shift (audit 2026-10: a second person opened their own
 * shift next to an open one, and when one closed the other stayed open). Whoever comes next joins;
 * the owner / manager can count and close any open shift without joining it; the others in the
 * shift are told who closed it; a shift left open a day is reported to the shop once a day.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { ShiftsService } from '../src/shifts/shifts.service';

describe('Shifts: one open shift per branch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let ann: string;
  let bob: string;
  let annId: string;
  let bobId: string;
  let branchId: string;
  const branches: string[] = [];
  let shiftId: string;
  const run = Date.now().toString(36);
  const pw = 'E2eTest@2026!';

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    // A branch of its own, so shifts other tests leave open do not get in the way
    branchId = (await prisma.branch.create({ data: {
      name: `SB ${run}`, tenantId: IDS.tenantA, status: 'ACTIVE',
    } as any })).id;
    branches.push(branchId);
    const staff = async (name: string) => (await prisma.user.create({ data: {
      email: `${name}-${run}@e2e.test`, name: `${name} ${run}`, password: await bcrypt.hash(pw, 10),
      role: 'CASHIER', isActive: true, tenantId: IDS.tenantA, branchId,
    } })).id;
    annId = await staff('ann');
    bobId = await staff('bob');
    ann = (await loginAs(app, `ann-${run}@e2e.test`, pw)).cookies;
    bob = (await loginAs(app, `bob-${run}@e2e.test`, pw)).cookies;
  });

  afterAll(async () => {
    // Test branches must not count towards the shop's plan limit in later tests
    await prisma?.shift.updateMany({ where: { branchId: { in: branches }, isActive: true }, data: { isActive: false, closedAt: new Date() } });
    await prisma?.branch.updateMany({ where: { id: { in: branches } }, data: { status: 'SUSPENDED' } as any });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SB-01: a second "open" in the same branch is refused with the shift to join; joining works', async () => {
    shiftId = (await authPost(app, '/api/v1/shifts/open', ann, { openBalance: 500 }).expect(201)).body.id;
    const res = await authPost(app, '/api/v1/shifts/open', bob, { openBalance: 0 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BRANCH_SHIFT_OPEN');
    expect(res.body.data.shiftId).toBe(shiftId);
    expect(res.body.message).toContain('เข้าร่วมกะ');
    await authPost(app, `/api/v1/shifts/${shiftId}/join`, bob, {}).expect(201);
    expect(await prisma.shift.count({ where: { branchId, isActive: true } })).toBe(1);
  });

  it('SB-02: two people pressing "open" at the same moment get one shift, not two', async () => {
    const other = (await prisma.branch.create({ data: {
      name: `SB2 ${run}`, tenantId: IDS.tenantA, status: 'ACTIVE',
    } as any })).id;
    branches.push(other);
    const mk = async (name: string) => {
      await prisma.user.create({ data: {
        email: `${name}-${run}@e2e.test`, name, password: await bcrypt.hash(pw, 10),
        role: 'CASHIER', isActive: true, tenantId: IDS.tenantA, branchId: other,
      } });
      return (await loginAs(app, `${name}-${run}@e2e.test`, pw)).cookies;
    };
    const [c1, c2] = [await mk('race1'), await mk('race2')];
    const r = await Promise.all([
      authPost(app, '/api/v1/shifts/open', c1, { openBalance: 0 }),
      authPost(app, '/api/v1/shifts/open', c2, { openBalance: 0 }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await prisma.shift.count({ where: { branchId: other, isActive: true } })).toBe(1);
  });

  it('SB-03: the owner sees every open shift with what the drawer should hold, and closes one without joining', async () => {
    const list = (await authGet(app, '/api/v1/shifts/open-now', owner).expect(200)).body as any[];
    const mine = list.find((x) => x.id === shiftId);
    expect(mine).toMatchObject({ user: { id: annId }, members: [expect.stringContaining('bob')], expectedCashBalance: 500 });
    // Staff do not get the list
    expect((await authGet(app, '/api/v1/shifts/open-now', bob).expect(200)).body).toEqual([]);

    await authPost(app, `/api/v1/shifts/${shiftId}/close`, owner, { closeBalance: 500 }).expect(201);
    expect(await prisma.shift.count({ where: { branchId, isActive: true } })).toBe(0);
    expect(await prisma.shiftMember.count({ where: { shiftId, leftAt: null } })).toBe(0);
    // The audit names who closed it, not who opened it
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SHIFT_CLOSED', entityId: shiftId } });
    expect(log.actorName).not.toContain('ann');
  });

  it('SB-04: the opener and the member are each told who closed it; their shift screen says so too', async () => {
    for (const userId of [annId, bobId]) {
      const n = await prisma.notification.findFirst({ where: { type: 'SHIFT_CLOSED_BY_OTHER', entityId: shiftId, userId } });
      expect(n?.title).toContain('ปิดแล้วโดย');
    }
    const seen = (await authGet(app, '/api/v1/shifts/closed-by-other', bob).expect(200)).body;
    expect(seen).toMatchObject({ shiftId, openedBy: expect.stringContaining('ann') });
    expect(seen.closedBy).toBeTruthy();
    // Back in a shift: nothing to show any more
    await authPost(app, '/api/v1/shifts/open', bob, { openBalance: 0 }).expect(201);
    expect((await authGet(app, '/api/v1/shifts/closed-by-other', bob).expect(200)).body).toEqual({});
  });

  it('SB-05: a shift open over a day is reported to the shop once, not every hour', async () => {
    const bobShift = (await authGet(app, '/api/v1/shifts/current', bob).expect(200)).body.id;
    await prisma.shift.update({ where: { id: bobShift }, data: { openedAt: new Date(Date.now() - 30 * 3600_000) } });
    const svc = app.get(ShiftsService);
    await svc.notifyLongOpenShifts();
    await svc.notifyLongOpenShifts();
    const told = await prisma.notification.findMany({ where: { type: 'SHIFT_LONG_OPEN', entityId: bobShift } });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ tenantId: IDS.tenantA, branchId });
    expect(told[0].title).toContain('30 ชั่วโมง');
    await authPost(app, `/api/v1/shifts/${bobShift}/close`, bob, { closeBalance: 0 }).expect(201);
  });
});
