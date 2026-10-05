/**
 * SIM / package sales on credit ("ค้างจ่าย"): anyone who sells can sell on credit, a customer
 * (by phone) may owe for one sale at a time, the drawer and the shift count only money really
 * received, and repayments later reach the drawer and the books.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('SIM / package sales on credit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cashier: string;
  let shiftId: string;
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };
  // A phone number unique to this run, written two ways: they are the same customer
  const tail = String(Date.now()).slice(-7);
  const phone = `08${tail}0`.slice(0, 10);
  const phoneDashed = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;

  const sell = (body: object, cookie = cashier) =>
    authPost(app, '/api/v1/carrier-wallet/package-sale', cookie, {
      carrier: 'AIS', packageAmount: 250, dealerCost: 240, paymentMethod: 'CASH', amountPaid: 250,
      shiftId, cashierName: 'Cashier A1', ...body,
    });
  const expectedCash = async () =>
    Number((await authGet(app, '/api/v1/shifts/current', cashier).expect(200)).body.expectedCashBalance);
  const journal = (sourceType: string, sourceId: string) =>
    prisma.journalEntry.findFirst({
      where: { tenantId: IDS.tenantA, sourceType, sourceId },
      include: { lines: { include: { account: true } } },
    });
  const legs = (j: any) =>
    Object.fromEntries(j.lines.map((l: any) => [l.account.code, Number(l.debit) - Number(l.credit)]));

  beforeAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantA;
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    const owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    await authPost(app, '/api/v1/accounting/accounts/initialize', owner, {});
    const current = await authGet(app, '/api/v1/shifts/current', cashier);
    shiftId = current.body?.id ?? (await authPost(app, '/api/v1/shifts/open', cashier, { openBalance: 0 }).expect(201)).body.id;
    await authPost(app, '/api/v1/carrier-wallet/topup', cashier, { carrier: 'AIS', amount: 5000, shiftId }).expect(201);
  });

  afterAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = saved.core;
    process.env.ACCOUNTING_ENABLED_TENANTS = saved.tenants;
    if (saved.core === undefined) delete process.env.ACCOUNTING_CORE_ENABLED;
    if (saved.tenants === undefined) delete process.env.ACCOUNTING_ENABLED_TENANTS;
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PC-01: short cash without "pay later" is refused (it used to be accepted)', async () => {
    const res = await sell({ amountPaid: 100 }).expect(400);
    expect(res.body.message).toContain('ค้างจ่าย');
    await sell({ payLater: true, amountPaid: 0 }).expect(400);     // credit needs the customer's phone
  });

  it('PC-02: a cashier sells on credit; only the cash paid now is expected in the drawer', async () => {
    const before = await expectedCash();
    const sale = (await sell({ payLater: true, amountPaid: 50, debtorName: 'คุณสมชาย', debtorPhone: phoneDashed }).expect(201)).body;
    expect(sale).toMatchObject({ creditAmount: 200, amountDue: 200 });
    expect(await expectedCash()).toBeCloseTo(before + 50, 2);

    const drawer = await prisma.cashDrawerTransaction.findFirst({ where: { sourceType: 'PACKAGE_SALE', idempotencyKey: { contains: sale.id } } });
    expect(Number(drawer?.amount)).toBe(50);
    // Books: 50 cash + 200 owed by the customer; wallet down 240; revenue 10
    expect(legs(await journal('PACKAGE_SALE', sale.id))).toEqual({ '1100': 50, '1210': 200, '1130': -240, '4300': -10 });

    const open = (await authGet(app, `/api/v1/carrier-wallet/debts/check?phone=${phone}`, cashier).expect(200)).body;
    expect(open).toMatchObject({ id: sale.id, amountDue: 200, phone });
  });

  it('PC-03: the same customer cannot owe twice; paying in full is still allowed', async () => {
    const res = await sell({ payLater: true, amountPaid: 0, debtorPhone: phone }).expect(400);
    expect(res.body.message).toContain('ยังค้างจ่าย');
    // The topped-up number is used when no debtor phone is given
    await sell({ payLater: true, amountPaid: 0, phoneNumber: phoneDashed }).expect(400);
    await sell({ phoneNumber: phone }).expect(201);
  });

  it('PC-04: repayments reach the drawer and the books; after the last one the customer may owe again', async () => {
    const [debt] = (await authGet(app, `/api/v1/carrier-wallet/debts?q=${phone}`, cashier).expect(200)).body;
    expect(debt.amountDue).toBe(200);
    const pay = (body: object) => authPost(app, `/api/v1/carrier-wallet/debts/${debt.id}/pay`, cashier, { shiftId, cashierName: 'Cashier A1', ...body });

    const before = await expectedCash();
    const first = (await pay({ amount: 120, paymentMethod: 'CASH' }).expect(201)).body;
    expect(first).toMatchObject({ amountDue: 80, settled: false });
    expect(await expectedCash()).toBeCloseTo(before + 120, 2);
    expect(legs(await journal('PACKAGE_DEBT_PAYMENT', first.id))).toEqual({ '1100': 120, '1210': -120 });

    await pay({ amount: 100, paymentMethod: 'CASH' }).expect(400);           // more than is owed
    const last = (await pay({ amount: 80, paymentMethod: 'TRANSFER' }).expect(201)).body;
    expect(last).toMatchObject({ amountDue: 0, settled: true });
    expect(await expectedCash()).toBeCloseTo(before + 120, 2);              // a transfer is not drawer cash
    await pay({ amount: 1, paymentMethod: 'CASH' }).expect(400);              // nothing left

    const settled = (await authGet(app, `/api/v1/carrier-wallet/debts?status=settled&q=${phone}`, cashier).expect(200)).body;
    expect(settled[0].payments.map((p: any) => p.amount)).toEqual([120, 80]);
    expect((await authGet(app, `/api/v1/carrier-wallet/debts/check?phone=${phone}`, cashier).expect(200)).body).toEqual({});

    await sell({ payLater: true, amountPaid: 0, debtorPhone: phone }).expect(201);
  });

  it('PC-05: two credit sales for one new customer at the same moment: exactly one goes through', async () => {
    const racePhone = `09${tail}1`.slice(0, 10);
    const results = await Promise.all([1, 2].map(() => sell({ payLater: true, amountPaid: 0, debtorPhone: racePhone })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.packageSale.count({ where: { tenantId: IDS.tenantA, debtorPhone: racePhone, amountDue: { gt: 0 } } })).toBe(1);
  });

  it('PC-06: another shop cannot see or collect this shop\'s debts', async () => {
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const [debt] = (await authGet(app, `/api/v1/carrier-wallet/debts?q=${phone}`, cashier).expect(200)).body;
    expect((await authGet(app, `/api/v1/carrier-wallet/debts?q=${phone}`, ownerB).expect(200)).body).toEqual([]);
    await authPost(app, `/api/v1/carrier-wallet/debts/${debt.id}/pay`, ownerB, { amount: 10, paymentMethod: 'CASH', cashierName: 'B' }).expect(404);
  });
});
