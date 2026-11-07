/**
 * A module the super admin switches off for a shop is off for its owner too — the menu list from
 * /auth/me and every route of that module — while the till keeps product lookups and adding a
 * customer when only stock / customers are off.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { ModulesService } from '../src/modules/modules.service';

describe('Owner follows the modules the super admin switched off (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let mods: ModulesService;
  const run = Date.now().toString(36);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    mods = app.get(ModulesService);
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });
  afterAll(async () => {
    for (const k of ['finance', 'stock', 'crm']) await mods.removeTenantModuleOverride(IDS.tenantA, k).catch(() => undefined);
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OM-01: before — the owner uses finance, and it is in their module list', async () => {
    await authGet(app, '/api/v1/expenses', owner).expect(200);
    const me = (await authGet(app, '/api/v1/auth/me', owner).expect(200)).body;
    expect(me.enabledModules).toContain('finance');
  });

  it('OM-02: switched off — refused on its routes and gone from the owner\'s list', async () => {
    await mods.setTenantModuleOverride(IDS.tenantA, 'finance', false);
    const res = await authGet(app, '/api/v1/expenses', owner).expect(403);
    expect(JSON.stringify(res.body)).toContain('ไม่ได้เปิด');
    await authGet(app, '/api/v1/suppliers', owner).expect(403);
    const me = (await authGet(app, '/api/v1/auth/me', owner).expect(200)).body;
    expect(me.enabledModules).not.toContain('finance');
    expect(me.enabledModules).toContain('pos');
  });

  it('OM-03: a till-only shop — products can be looked up and customers added, not managed', async () => {
    await mods.setTenantModuleOverride(IDS.tenantA, 'stock', false);
    await mods.setTenantModuleOverride(IDS.tenantA, 'crm', false);
    await authGet(app, '/api/v1/products', owner).expect(200);
    await authPost(app, '/api/v1/products', owner, { name: `x${run}`, sku: `OM-${run}`, price: 10, costPrice: 5 }).expect(403);
    const c = await authPost(app, '/api/v1/customers', owner, { name: `ลูกค้า ${run}`, phone: `09${run.slice(-8).replace(/\D/g, '1').padEnd(8, '1')}` });
    expect([200, 201]).toContain(c.status);
    const me = (await authGet(app, '/api/v1/auth/me', owner).expect(200)).body;
    expect(me.enabledModules).not.toContain('stock');
    expect(me.enabledModules).not.toContain('crm');
  });

  it('OM-05: without reports — the end-of-day slip and today\'s figures still work; deep reports do not', async () => {
    await mods.setTenantModuleOverride(IDS.tenantA, 'report', false);
    try {
      await authGet(app, '/api/v1/reports/daily-closing', owner).expect(200);
      await authGet(app, '/api/v1/reports/owner-dashboard', owner).expect(200);
      await authGet(app, '/api/v1/reports/profit', owner).expect(403);
    } finally {
      await mods.removeTenantModuleOverride(IDS.tenantA, 'report');
    }
  });

  it('OM-04: switched back on — works again', async () => {
    for (const k of ['finance', 'stock', 'crm']) await mods.removeTenantModuleOverride(IDS.tenantA, k);
    await authGet(app, '/api/v1/expenses', owner).expect(200);
    const me = (await authGet(app, '/api/v1/auth/me', owner).expect(200)).body;
    expect(me.enabledModules).toEqual(expect.arrayContaining(['finance', 'stock', 'crm']));
  });
});
