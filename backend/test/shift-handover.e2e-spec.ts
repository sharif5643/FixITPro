/**
 * Hand-over: the person who opened a shared shift leaves early. They close their shift and hand
 * it to someone still working in it; that person sees the counted cash and carrier wallets and
 * opens their own shift with them. A different count alerts the owner. SIM / package profit is
 * hidden from people who do not see reports.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Shift hand-over (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let manager: string;
  let tech: string;
  let cashier: string;
  let owner: string;

  // No shift of any kind for this person
  const clear = async (cookie: string) => {
    const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
    if (!cur?.id) return;
    if (cur.joined) await authPost(app, '/api/v1/shifts/leave', cookie, {}).expect(201);
    else await authPost(app, `/api/v1/shifts/${cur.id}/close`, cookie, { closeBalance: Number(cur.expectedCashBalance ?? 0) }).expect(201);
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    tech    = (await loginAs(app, CREDS.techA1.email, CREDS.techA1.password)).cookies;
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('HO-01: close and hand over to someone in the shift; they take it over with the counted amounts', async () => {
    await clear(manager);
    await clear(tech);
    const opened = (await authPost(app, '/api/v1/shifts/open', manager, { openBalance: 1000 }).expect(201)).body;
    await authPost(app, `/api/v1/shifts/${opened.id}/join`, tech, {}).expect(201);
    const techId = (await authGet(app, '/api/v1/shifts/current', manager).expect(200)).body.members[0].userId;
    expect((await authGet(app, '/api/v1/shifts/handover', tech).expect(200)).body).toEqual({});

    // Only someone working in this shift can take it over
    await authPost(app, `/api/v1/shifts/${opened.id}/close`, manager, { closeBalance: 1000, handoverToUserId: 'nobody' }).expect(400);

    await authPost(app, `/api/v1/shifts/${opened.id}/close`, manager, { closeBalance: 1000, handoverToUserId: techId }).expect(201);
    const pending = (await authGet(app, '/api/v1/shifts/handover', tech).expect(200)).body;
    expect(pending).toMatchObject({ shiftId: opened.id, cash: 1000 });
    expect(pending.wallets.map((w: any) => w.carrier).sort()).toEqual(['AIS', 'DTAC', 'NT', 'TRUE']);
    expect((await authGet(app, '/api/v1/shifts/handover', manager).expect(200)).body).toEqual({});

    // The one taking over counts 50 baht less: the owner is told
    const mine = (await authPost(app, '/api/v1/shifts/open', tech, { openBalance: 950, handoverFromShiftId: opened.id }).expect(201)).body;
    const alert = await prisma.notification.findFirst({ where: { type: 'SHIFT_MISMATCH', entityId: mine.id } });
    expect(alert?.tenantId).toBe(IDS.tenantA);
    expect(alert?.title).toContain('-50');
    expect((await authGet(app, '/api/v1/shifts/handover', tech).expect(200)).body).toEqual({});
    await clear(tech);
  });

  it('HO-02: SIM / package profit is hidden from the cashier, shown to the owner', async () => {
    await clear(cashier);
    await authPost(app, '/api/v1/shifts/open', cashier, { openBalance: 0 }).expect(201);
    await authPost(app, '/api/v1/carrier-wallet/topup', cashier, { carrier: 'AIS', amount: 500 }).expect(201);
    const sale = (await authPost(app, '/api/v1/carrier-wallet/package-sale', cashier, {
      carrier: 'AIS', packageAmount: 100, paymentMethod: 'CASH', amountPaid: 100, cashierName: 'e2e',
    }).expect(201)).body;
    expect(sale.profit).toBeUndefined();
    expect(sale.walletDeduction).toBe(97);

    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const path = `/api/v1/carrier-wallet/package-sales/list?startDate=${today}&endDate=${today}`;
    expect(JSON.stringify((await authGet(app, path, cashier).expect(200)).body)).not.toContain('"profit"');
    const forOwner = (await authGet(app, path, owner).expect(200)).body;
    expect(JSON.stringify(forOwner)).toContain('"profit"');
    await clear(cashier);
  });
});
