/**
 * Every plan a shop can be on has a package. After the plan rename (BASIC→LITE,
 * ENTERPRISE→BUSINESS, new PRIVATE) the packages kept the old keys, so staff of a shop on
 * LITE/BUSINESS/PRIVATE got no modules unless someone added per-shop overrides.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { ModulesService } from '../src/modules/modules.service';

describe('Packages exist for every current plan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let manager: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
  });

  afterAll(async () => {
    await prisma.tenant.update({ where: { id: IDS.tenantA }, data: { plan: 'PRO' } });
    await app.get(ModulesService).invalidateCache(IDS.tenantA);
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PLAN-01: each current plan has package modules', async () => {
    for (const plan of ['TRIAL', 'LITE', 'PRO', 'BUSINESS', 'PRIVATE']) {
      expect(await prisma.packageModule.count({ where: { packageKey: plan } })).toBeGreaterThan(0);
    }
  });

  it('PLAN-02: staff of a LITE or PRIVATE shop can use the POS without per-shop overrides', async () => {
    for (const plan of ['LITE', 'PRIVATE'] as const) {
      await prisma.tenant.update({ where: { id: IDS.tenantA }, data: { plan } });
      await app.get(ModulesService).invalidateCache(IDS.tenantA);
      const enabled = (await authGet(app, '/api/v1/modules/enabled', manager).expect(200)).body;
      const keys: string[] = Array.isArray(enabled) ? enabled : enabled.modules ?? enabled.enabledModules ?? [];
      expect(keys).toEqual(expect.arrayContaining(['pos', 'repair', 'stock']));
    }
  });
});
