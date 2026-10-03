/**
 * Technician commission report: what each technician earned for repairs handed over and paid
 * in the period, following the shop's setting. It must not change any profit figure.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Technician commission (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let tech: string;

  const techRow = async () =>
    ((await authGet(app, '/api/v1/technicians/commission', owner).expect(200)).body.rows as any[])
      .find((r) => r.technicianId === IDS.userTechA1);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    tech    = (await loginAs(app, CREDS.techA1.email, CREDS.techA1.password)).cookies;
    await authPost(app, '/api/v1/shifts/open', manager, { openBalance: 0 }); // may already be open
  });

  afterAll(async () => {
    await authPatch(app, '/api/v1/settings', owner, { techCommissionType: 'NONE', techCommissionValue: 0 });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COMM-01: earnings follow the setting; profit figures do not move', async () => {
    // Set the rate first so "before" already counts older jobs at the same rate
    await authPatch(app, '/api/v1/settings', owner, { techCommissionType: 'PERCENT_LABOR', techCommissionValue: 30 }).expect(200);
    const before = (await techRow()) ?? { jobs: 0, revenue: 0, commission: 0 };
    const profitBefore = (await authGet(app, `/api/v1/reports/profit?branchId=${IDS.branchA1}`, owner).expect(200)).body.summary;

    const r = (await authPost(app, '/api/v1/repairs', manager, {
      deviceBrand: 'Samsung', deviceModel: 'Comm', issue: 'จอ', estimateCost: 1000, technicianId: IDS.userTechA1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) {
      await authPatch(app, `/api/v1/repairs/${r.id}`, manager, { status: s }).expect(200);
    }
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, manager, { paymentMethod: 'CASH', amountPaid: 1000 }).expect(201);

    let row = await techRow();
    expect(row.jobs - before.jobs).toBe(1);
    // No parts on this job, so 30% of the whole 1000
    expect(Math.round((row.commission - before.commission) * 100) / 100).toBe(300);

    await authPatch(app, '/api/v1/settings', owner, { techCommissionType: 'FIXED', techCommissionValue: 150 }).expect(200);
    row = await techRow();
    // Every job with money kept pays the fixed amount (fully refunded jobs pay nothing)
    expect(row.commission % 150).toBe(0);
    expect(row.commission).toBeGreaterThanOrEqual(150);

    const profitAfter = (await authGet(app, `/api/v1/reports/profit?branchId=${IDS.branchA1}`, owner).expect(200)).body.summary;
    // The new paid job adds its revenue; the commission setting itself never changes profit
    expect(profitAfter.totalRevenue - profitBefore.totalRevenue).toBe(1000);
  });

  it('COMM-02: percent over 100 is refused; technicians cannot see everyone\'s pay', async () => {
    await authPatch(app, '/api/v1/settings', owner, { techCommissionType: 'PERCENT_TOTAL', techCommissionValue: 120 }).expect(400);
    await authGet(app, '/api/v1/technicians/commission', tech).expect(403);
  });
});
