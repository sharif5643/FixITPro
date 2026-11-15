/**
 * Front-counter money rules:
 *  - staff cannot take more off a repair's quoted price than the shop allows, whether as a
 *    discount or by typing the price itself lower at pickup
 *  - cash for a debt needs an open shift (it used to go into no shift); a transfer does not
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, testPrisma } from './helpers/seed.helper';
import { closeOpenShiftsOfBranch } from './helpers/shift.helper';

describe('Front-counter money rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let cashier: string;
  const run = Date.now().toString(36);
  const job = async (price: number) => {
    const j = (await authPost(app, '/api/v1/repairs', owner, { deviceBrand: 'X', deviceModel: `FM ${run}`, issue: 'x', estimateCost: price, branchId: IDS.branchA1 }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await authPatch(app, `/api/v1/repairs/${j.id}`, owner, { status: s }).expect(200);
    return j.id as string;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    cashier = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;   // staff: a manager, limited like any non-owner
    await authPatch(app, '/api/v1/settings', owner, { staffDiscountLimitPercent: 10 }).expect(200);
    await closeOpenShiftsOfBranch(app, owner, IDS.branchA1);
  });
  afterAll(async () => {
    await prisma.shopSettings.updateMany({ where: { tenantId: IDS.tenantA }, data: { staffDiscountLimitPercent: null } });
    for (const c of [owner, cashier]) {
      const cur = (await authGet(app, '/api/v1/shifts/current', c)).body;
      if (cur?.id) await authPost(app, `/api/v1/shifts/${cur.id}/close`, c, { closeBalance: Number(cur.expectedCashBalance ?? 0), note: 'e2e' });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FM-01: staff typing the price lower than quoted counts against the discount limit', async () => {
    await authPost(app, '/api/v1/shifts/open', cashier, { openBalance: 0 }).expect(201);
    const id = await job(3000);
    // 3,000 quoted typed as 1,000 (67% off): refused for staff
    const r = await authPost(app, `/api/v1/repairs/${id}/payment`, cashier, { paymentMethod: 'CASH', amountPaid: 1000, finalCost: 1000 }).expect(400);
    expect(JSON.stringify(r.body)).toContain('10%');
    // within the limit (2,700 = 10% off) is fine
    await authPost(app, `/api/v1/repairs/${id}/payment`, cashier, { paymentMethod: 'CASH', amountPaid: 2700, finalCost: 2700 }).expect(201);
    // a higher price (more work) is not a discount
    const id2 = await job(1000);
    await authPost(app, `/api/v1/repairs/${id2}/payment`, cashier, { paymentMethod: 'CASH', amountPaid: 1500, finalCost: 1500 }).expect(201);
    // the owner may agree any price
    const id3 = await job(3000);
    const cur = (await authGet(app, '/api/v1/shifts/current', cashier)).body;
    await authPost(app, `/api/v1/shifts/${cur.id}/close`, cashier, { closeBalance: Number(cur.expectedCashBalance ?? 0), note: 'e2e' });
    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201);
    await authPost(app, `/api/v1/repairs/${id3}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 1000, finalCost: 1000 }).expect(201);
  });

  it('FM-02: cash for a debt needs an open shift; a transfer does not', async () => {
    await closeOpenShiftsOfBranch(app, owner, IDS.branchA1);
    const id = await job(1000);
    if (!(await authGet(app, '/api/v1/shifts/current', owner)).body?.id) await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201);
    await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 400, allowPartial: true }).expect(201);
    const cur = (await authGet(app, '/api/v1/shifts/current', owner)).body;
    await authPost(app, `/api/v1/shifts/${cur.id}/close`, owner, { closeBalance: Number(cur.expectedCashBalance ?? 0), note: 'e2e' });
    const r = await authPost(app, '/api/v1/debt-payments', owner, { repairId: id, amount: 100, paymentMethod: 'CASH' }).expect(400);
    expect(JSON.stringify(r.body)).toContain('เปิดกะ');
    await authPost(app, '/api/v1/debt-payments', owner, { repairId: id, amount: 100, paymentMethod: 'TRANSFER' }).expect(201);
  });
});
