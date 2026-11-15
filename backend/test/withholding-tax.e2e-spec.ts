/**
 * Withholding tax on a repair bill (an agency withholds 1%, a company 3% on services):
 *  - the shop records the certificate on a delivered job; it settles that part of the bill
 *  - no cash: the shift's expected cash does not move
 *  - the job is paid in full once covered; it leaves the debt list; nothing more can be taken
 *  - never more than is still owed; only after delivery; only the owner or a manager
 *  - books: Dr tax credit (1150) / Cr repair revenue; the profit report counts it as income
 *  - the yearly report lists the certificates; a cancelled one is kept, marked, and not counted,
 *    and the job owes that amount again
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { closeOpenShiftsOfBranch } from './helpers/shift.helper';

describe('Withholding tax (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };
  const bkkDay = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const expectedCash = async () =>
    Number((await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body.expectedCashBalance);
  const newJob = async (price: number) => {
    const job = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'HP', deviceModel: `WHT ${run}`, issue: 'board', estimateCost: price, branchId: IDS.branchA1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await authPatch(app, `/api/v1/repairs/${job.id}`, owner, { status: s }).expect(200);
    return job;
  };
  const cert = (amount: number) => ({ amount, ratePercent: 3, baseAmount: 10000, payerName: `บริษัท ทดสอบ ${run} จำกัด`, payerTaxId: '0105500000001', certificateNo: `WHT-${run}`, certificateDate: bkkDay() });

  beforeAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantA;
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    await authPost(app, '/api/v1/accounting/accounts/initialize', owner, {});
    await closeOpenShiftsOfBranch(app, owner, IDS.branchA1);
    shiftId = (await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    if (shiftId) await authPost(app, `/api/v1/shifts/${shiftId}/close`, owner, { closeBalance: 0, note: 'e2e' });
    process.env.ACCOUNTING_CORE_ENABLED = saved.core;
    process.env.ACCOUNTING_ENABLED_TENANTS = saved.tenants;
    if (saved.core === undefined) delete process.env.ACCOUNTING_CORE_ENABLED;
    if (saved.tenants === undefined) delete process.env.ACCOUNTING_ENABLED_TENANTS;
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WHT-01: a certificate settles the rest of a delivered job, without cash, and reaches the books and reports', async () => {
    const job = await newJob(10000);
    // not delivered yet
    await authPost(app, `/api/v1/withholding-tax/repair/${job.id}`, owner, cert(300)).expect(400);
    // the company pays 9,700 and withholds 300
    await authPost(app, `/api/v1/repairs/${job.id}/payment`, owner, { paymentMethod: 'TRANSFER', amountPaid: 9700, allowPartial: true }).expect(201);
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: job.id } })).paymentStatus).toBe('PARTIAL');

    const cashBefore = await expectedCash();
    // more than is owed
    await authPost(app, `/api/v1/withholding-tax/repair/${job.id}`, owner, cert(300.01)).expect(400);
    const wht = (await authPost(app, `/api/v1/withholding-tax/repair/${job.id}`, owner, cert(300)).expect(201)).body;
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: job.id } })).paymentStatus).toBe('PAID');
    expect(await expectedCash()).toBeCloseTo(cashBefore, 2);

    // off the debt list; nothing more can be taken
    const outstanding = (await authGet(app, '/api/v1/repairs/outstanding', owner).expect(200)).body;
    expect((Array.isArray(outstanding) ? outstanding : outstanding.data ?? []).some((r: any) => r.id === job.id)).toBe(false);
    await authPost(app, '/api/v1/debt-payments', owner, { repairId: job.id, amount: 1, paymentMethod: 'CASH' }).expect(400);

    // books: Dr 1150 / Cr 4200, no cash account touched
    const j = await prisma.journalEntry.findFirstOrThrow({ where: { sourceType: 'REPAIR_WHT', sourceId: wht.id }, include: { lines: { include: { account: true } } } });
    const by = Object.fromEntries(j.lines.map((l) => [l.account.code, Number(l.debit) - Number(l.credit)]));
    expect(by).toEqual({ '1150': 300, '4200': -300 });

    // job profit and the profit report count it as income
    const jp = (await authGet(app, `/api/v1/repairs/${job.id}/profit`, owner).expect(200)).body;
    expect(jp.revenue.withholdingTax).toBe(300);
    const pr = (await authGet(app, `/api/v1/reports/profit?startDate=${bkkDay()}&endDate=${bkkDay()}`, owner).expect(200)).body;
    expect(pr.repair.withholdingTax).toBeGreaterThanOrEqual(300);

    // yearly report
    const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear() + 543;
    const rep = (await authGet(app, `/api/v1/withholding-tax/report?year=${year}`, owner).expect(200)).body;
    const line = rep.lines.find((l: any) => l.id === wht.id);
    expect(line).toMatchObject({ amount: 300, ratePercent: 3, baseAmount: 10000, ticketNumber: job.ticketNumber, cancelled: false });
  });

  it('WHT-02: cancelling keeps the record, reverses the books, and the job owes that amount again', async () => {
    const job = await newJob(1000);
    await authPost(app, `/api/v1/repairs/${job.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 990, allowPartial: true }).expect(201);
    const wht = (await authPost(app, `/api/v1/withholding-tax/repair/${job.id}`, owner, { ...cert(10), ratePercent: 1, baseAmount: 1000 }).expect(201)).body;
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: job.id } })).paymentStatus).toBe('PAID');

    await authPost(app, `/api/v1/withholding-tax/${wht.id}/cancel`, owner, { reason: '' }).expect(400);
    await authPost(app, `/api/v1/withholding-tax/${wht.id}/cancel`, owner, { reason: 'ใส่ผิดงาน' }).expect(201);
    await authPost(app, `/api/v1/withholding-tax/${wht.id}/cancel`, owner, { reason: 'ใส่ผิดงาน' }).expect(400);
    const kept = await prisma.withholdingTax.findUniqueOrThrow({ where: { id: wht.id } });
    expect(kept.cancelledAt).not.toBeNull();
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: job.id } })).paymentStatus).toBe('PARTIAL');
    const orig = await prisma.journalEntry.findFirstOrThrow({ where: { sourceType: 'REPAIR_WHT', sourceId: wht.id } });
    expect(await prisma.journalEntry.count({ where: { sourceType: 'JOURNAL_REVERSAL', sourceId: orig.id } })).toBe(1);

    const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear() + 543;
    const rep = (await authGet(app, `/api/v1/withholding-tax/report?year=${year}`, owner).expect(200)).body;
    expect(rep.lines.find((l: any) => l.id === wht.id).cancelled).toBe(true);

    // owed again: the customer can pay the 10 in cash
    await authPost(app, '/api/v1/debt-payments', owner, { repairId: job.id, amount: 10.01, paymentMethod: 'CASH' }).expect(400);
    await authPost(app, '/api/v1/debt-payments', owner, { repairId: job.id, amount: 10, paymentMethod: 'CASH' }).expect(201);
    expect((await prisma.repair.findUniqueOrThrow({ where: { id: job.id } })).paymentStatus).toBe('PAID');
  });

  it('WHT-03: only the owner or a manager; never on another shop\'s job', async () => {
    const job = await newJob(500);
    await authPost(app, `/api/v1/repairs/${job.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 495, allowPartial: true }).expect(201);
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    await authPost(app, `/api/v1/withholding-tax/repair/${job.id}`, ownerB, cert(5)).expect(404);
    const cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    await authPost(app, `/api/v1/withholding-tax/repair/${job.id}`, cashier, cert(5)).expect(403);
    expect(await prisma.withholdingTax.count({ where: { repairId: job.id } })).toBe(0);
  });

  it('WHT-04: a shop that holds certificates cannot reset its data (they are tax documents)', async () => {
    const before = await prisma.repair.count({ where: { branch: { tenantId: IDS.tenantA } } });
    await authPost(app, '/api/v1/settings/reset-data', owner, { password: CREDS.ownerA.password })
      .expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    expect(await prisma.repair.count({ where: { branch: { tenantId: IDS.tenantA } } })).toBe(before);
  });
});
