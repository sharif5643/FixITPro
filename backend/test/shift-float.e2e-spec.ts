/**
 * The drawer is not empty when a shift opens: the last close says how much change it left for
 * the next shift, and the next shift opens with that instead of 0 (audit 2026-10: every night
 * close looked "over" by the change left in the drawer).
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Shifts: float left for the next shift (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ann: string;
  let branchId: string;
  const run = Date.now().toString(36);
  const pw = 'E2eTest@2026!';

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    branchId = (await prisma.branch.create({ data: { name: `FL ${run}`, tenantId: IDS.tenantA, status: 'ACTIVE' } as any })).id;
    await prisma.user.create({ data: {
      email: `fl-${run}@e2e.test`, name: `fl ${run}`, password: await bcrypt.hash(pw, 10),
      role: 'CASHIER', isActive: true, tenantId: IDS.tenantA, branchId,
    } });
    ann = (await loginAs(app, `fl-${run}@e2e.test`, pw)).cookies;
  });

  afterAll(async () => {
    await prisma?.shift.updateMany({ where: { branchId, isActive: true }, data: { isActive: false, closedAt: new Date() } });
    await prisma?.branch.updateMany({ where: { id: branchId }, data: { status: 'SUSPENDED' } as any });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FL-01: nothing closed yet → no hint', async () => {
    expect((await authGet(app, '/api/v1/shifts/last-close', ann).expect(200)).body).toEqual({});
  });

  it('FL-02: a close records the float left; the next open reads it', async () => {
    const id = (await authPost(app, '/api/v1/shifts/open', ann, { openBalance: 500 }).expect(201)).body.id;
    await authPost(app, `/api/v1/shifts/${id}/close`, ann, { closeBalance: 500, floatLeft: 1500 }).expect(400);
    await authPost(app, `/api/v1/shifts/${id}/close`, ann, { closeBalance: 500, floatLeft: 300 }).expect(201);
    expect(Number((await prisma.shift.findUniqueOrThrow({ where: { id } })).floatLeft)).toBe(300);
    const last = (await authGet(app, '/api/v1/shifts/last-close', ann).expect(200)).body;
    expect(last).toMatchObject({ shiftId: id, closeBalance: 500, floatLeft: 300 });
  });

  it('FL-03: a close without a float still shows what was counted (float null)', async () => {
    const id = (await authPost(app, '/api/v1/shifts/open', ann, { openBalance: 300 }).expect(201)).body.id;
    await authPost(app, `/api/v1/shifts/${id}/close`, ann, { closeBalance: 800 }).expect(201);
    expect((await authGet(app, '/api/v1/shifts/last-close', ann).expect(200)).body).toMatchObject({ shiftId: id, closeBalance: 800, floatLeft: null });
  });
});
