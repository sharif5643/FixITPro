/**
 * A SIM / package sale has no branch column: the shift it was sold in says where. With one branch
 * picked, the profit report, the daily close and the daily report count only that branch's SIM
 * sales (before, the profit report and both daily screens counted every branch's).
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { bangkokDate } from '../src/common/bangkok-date';

describe('SIM sales per branch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let shiftId: string;
  let saleId: string;
  const run = Date.now().toString(36);
  const date = bangkokDate();

  const numbers = async (branchId?: string) => {
    const b = branchId ? `&branchId=${branchId}` : '';
    const profit = (await authGet(app, `/api/v1/reports/profit?startDate=${date}&endDate=${date}${b}`, ownerA).expect(200)).body;
    const close = (await authGet(app, `/api/v1/reports/daily-closing?date=${date}${b}`, ownerA).expect(200)).body;
    const daily = (await authGet(app, `/api/v1/reports/daily?date=${date}${b}`, ownerA).expect(200)).body;
    return {
      profitSim: profit.package.profit as number,
      net: profit.summary.netProfit as number,
      revenue: profit.summary.totalRevenue as number,
      closeSim: close.revenue.packages.total as number,
      closeIds: (close.packageSales.items as { id: string }[]).map((p) => p.id),
      dailyIds: (daily.packageSales.items as { id: string }[]).map((p) => p.id),
    };
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    shiftId = (await prisma.shift.create({
      data: { userId: IDS.userManagerA1, branchId: IDS.branchA2, openBalance: 0, isActive: false, closedAt: new Date() },
    })).id;
  });

  afterAll(async () => {
    if (saleId) await prisma.packageSale.delete({ where: { id: saleId } }).catch(() => undefined);
    await prisma.shift.delete({ where: { id: shiftId } }).catch(() => undefined);
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SIMB-01: a SIM sale in branch A2 counts for A2 and the whole shop, never for A1', async () => {
    const before = { a1: await numbers(IDS.branchA1), a2: await numbers(IDS.branchA2), all: await numbers() };

    const owner = await prisma.user.findUniqueOrThrow({ where: { id: IDS.userOwnerA } });
    saleId = (await prisma.packageSale.create({
      data: {
        receiptNumber: `SIMB-${run}`, carrier: 'AIS', packageAmount: 200, walletDeduction: 163, profit: 37,
        paymentMethod: 'CASH', amountPaid: 200, change: 0, cashierName: owner.name,
        createdById: owner.id, tenantId: IDS.tenantA, shiftId,
      },
    })).id;

    const a1 = await numbers(IDS.branchA1);
    const a2 = await numbers(IDS.branchA2);
    const all = await numbers();

    // branch A1 did not sell it
    expect(a1.profitSim).toBeCloseTo(before.a1.profitSim, 2);
    expect(a1.net).toBeCloseTo(before.a1.net, 2);
    expect(a1.closeSim).toBeCloseTo(before.a1.closeSim, 2);
    expect(a1.closeIds).not.toContain(saleId);
    expect(a1.dailyIds).not.toContain(saleId);

    // branch A2 did: profit, revenue, net profit and both daily screens move by its 37 commission
    expect(a2.profitSim - before.a2.profitSim).toBeCloseTo(37, 2);
    expect(a2.revenue - before.a2.revenue).toBeCloseTo(37, 2);
    expect(a2.net - before.a2.net).toBeCloseTo(37, 2);
    expect(a2.closeSim - before.a2.closeSim).toBeCloseTo(37, 2);
    expect(a2.closeIds).toContain(saleId);
    expect(a2.dailyIds).toContain(saleId);

    // the whole shop: once
    expect(all.profitSim - before.all.profitSim).toBeCloseTo(37, 2);
    expect(all.net - before.all.net).toBeCloseTo(37, 2);

    // and the SIM line agrees with the totals it is part of
    for (const n of [a1, a2, all]) expect(n.profitSim).toBeCloseTo(n.closeSim, 2);
  });
});
