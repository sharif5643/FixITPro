/**
 * The dashboard's "หนี้ค้างชำระ" must match the หนี้ค้างชำระ page (/repairs/outstanding).
 * Before: it summed (price − deposit) of repairs that were finished but not yet collected,
 * ignored repairs handed over with a balance still owed, and the UI labelled the baht
 * total as a number of items.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Dashboard debt (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  let shiftId: string;

  const patch = (path: string, body: object) =>
    request(app.getHttpServer()).patch(path).set('Cookie', ownerB).send(body);
  const newRepair = async (cost: number) =>
    (await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'X', deviceModel: 'Debt', issue: 'screen', estimateCost: cost, branchId: IDS.branchB1,
    }).expect(201)).body;
  const complete = async (id: string) => {
    for (const status of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) {
      await patch(`/api/v1/repairs/${id}`, { status }).expect(200);
    }
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const current = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (current.body?.id) {
      await authPost(app, `/api/v1/shifts/${current.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    }
    shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app.close();
    await prisma.$disconnect();
  });

  it('DASH-01: dashboard debt equals the outstanding list (count and baht)', async () => {
    // owed after handover: 1000 − 600 paid, then 100 more as a debt payment → 300
    const owed = await newRepair(1000);
    await complete(owed.id);
    await authPost(app, `/api/v1/repairs/${owed.id}/payment`, ownerB, {
      paymentMethod: 'CASH', amountPaid: 600, allowPartial: true,
    }).expect(201);
    await authPost(app, '/api/v1/debt-payments', ownerB, { repairId: owed.id, amount: 100, paymentMethod: 'CASH' }).expect(201);
    // finished but not collected yet — not a debt
    const waiting = await newRepair(700);
    await complete(waiting.id);

    const outstanding = (await authGet(app, `/api/v1/repairs/outstanding?branchId=${IDS.branchB1}`, ownerB).expect(200)).body as any[];
    const expectedTotal = outstanding.reduce((s, r) => s + Number(r.outstandingAmount), 0);
    const expectedCount = outstanding.filter((r) => Number(r.outstandingAmount) > 0).length;
    expect(outstanding.find((r) => r.id === owed.id)?.outstandingAmount).toBe(300);
    expect(outstanding.find((r) => r.id === waiting.id)).toBeUndefined();

    const dash = (await authGet(app, `/api/v1/dashboard/overview?branchId=${IDS.branchB1}`, ownerB).expect(200)).body;
    expect(dash.alerts.unpaidDebt).toBeCloseTo(expectedTotal, 2);
    expect(dash.alerts.unpaidDebtCount).toBe(expectedCount);
    expect(dash.repairOps.unpaidDebtTotal).toBeCloseTo(expectedTotal, 2);
  });
});
