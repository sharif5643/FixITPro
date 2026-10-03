/**
 * A branchId from the client must belong to the caller's shop. Before, an owner who passed
 * another shop's branch id got that shop's dashboard and reports, and could create records in it.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Branch belongs to the caller\'s shop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('BRT-01: reading another shop\'s branch is refused', async () => {
    for (const path of [
      '/api/v1/dashboard/overview',
      '/api/v1/reports/profit',
      '/api/v1/reports/daily-closing',
      '/api/v1/analytics/overview',
      '/api/v1/finance/summary',
    ]) {
      await authGet(app, `${path}?branchId=${IDS.branchB1}`, ownerA).expect(403);
      await authGet(app, `${path}?branchId=${IDS.branchA1}`, ownerA).expect(200);
    }
    // The owner of shop B still reads their own branch
    await authGet(app, `/api/v1/dashboard/overview?branchId=${IDS.branchB1}`, ownerB).expect(200);
  });

  it('BRT-02: creating a record in another shop\'s branch is refused', async () => {
    const before = await prisma.repair.count({ where: { branchId: IDS.branchB1 } });
    await authPost(app, '/api/v1/repairs', ownerA, {
      deviceBrand: 'X', deviceModel: 'Cross shop', issue: 'x', branchId: IDS.branchB1,
    }).expect(403);
    expect(await prisma.repair.count({ where: { branchId: IDS.branchB1 } })).toBe(before);
  });

  it('BRT-03: "all branches" and no branch keep working', async () => {
    await authGet(app, '/api/v1/dashboard/overview', ownerA).expect(200);
    await authGet(app, '/api/v1/dashboard/overview?branchId=all', ownerA).expect(200);
  });
});
