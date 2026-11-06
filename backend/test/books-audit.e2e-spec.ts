/**
 * Every kind of money at the counter must reach every place that reports money:
 * the shift drawer, the cash ledger (finance pages), the double-entry books (accounting pages),
 * the daily close and the profit report. One scenario, then all of them are compared.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { closeOpenShiftsOfBranch } from './helpers/shift.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Books audit: drawer, cash ledger, books and reports agree (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let shiftId: string;
  let t0: Date;
  const run = Date.now().toString(36);
  const q = `branchId=${IDS.branchA1}`;
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const books = async () => {
    const lines = await prisma.journalLine.findMany({
      where: { entry: { tenantId: IDS.tenantA, createdAt: { gte: t0 }, isVoided: false } },
      include: { account: true },
    });
    const by: Record<string, number> = {};
    for (const l of lines) by[l.account.code] = r2((by[l.account.code] ?? 0) + Number(l.debit) - Number(l.credit));
    const rev = lines.filter((l) => l.account.type === 'REVENUE').reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    const exp = lines.filter((l) => l.account.type === 'EXPENSE').reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    return { by, profit: r2(rev - exp), cash: by['1100'] ?? 0 };
  };
  const ledgerCash = async () => {
    const tx = await prisma.cashDrawerTransaction.findMany({
      where: { tenantId: IDS.tenantA, createdAt: { gte: t0 }, OR: [{ paymentMethod: 'CASH' }, { paymentMethod: null }] },
    });
    return r2(tx.reduce((s, t) => s + (t.direction === 'IN' ? 1 : -1) * Number(t.amount), 0));
  };
  const screens = async () => {
    const profit = (await authGet(app, `/api/v1/reports/profit?${q}`, owner).expect(200)).body;
    const day = (await authGet(app, `/api/v1/reports/daily-closing?${q}`, owner).expect(200)).body;
    const close = day.revenue;
    const drawer = Number(close.cash) + Number(close.packages?.byMethod?.CASH ?? 0) + Number(day.drawer.in) - Number(day.drawer.outTotal);
    const shift = Number((await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body.expectedCashBalance);
    return { profit: Number(profit.summary.netProfit), close: drawer, shift };
  };

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

  it('AUDIT-01: every money event reaches every money screen', async () => {
    const before = await screens();
    t0 = new Date();
    const mk = async (name: string, price: number, costPrice: number, extra: object = {}) => {
      const b = (await authPost(app, '/api/v1/products', owner, {
        name: `${name} ${run}`, sku: `AUD-${name}-${run}`, type: 'ACCESSORY', price, costPrice, stock: 20, branchId: IDS.branchA1, ...extra,
      }).expect(201)).body;
      return (b.id ?? b.product?.id) as string;
    };
    const phone = await mk('Phone', 1000, 600);
    const gift = await mk('Gift', 0, 50, { giveawayOnly: true });
    const part = await mk('Part', 400, 200, { type: 'PART' });

    // 1. sale 1000 cash with a give-away (cost 600 + 50)
    await authPost(app, '/api/v1/sales', owner, {
      branchId: IDS.branchA1, paymentMethod: 'CASH', amountPaid: 1000,
      items: [{ productId: phone, quantity: 1, price: 1000 }, { productId: gift, quantity: 1, price: 0, isFreebie: true }],
    }).expect(201);
    // 2. repair: 1500 cash at pickup, one part (cost 200), delivery fee 80 from the drawer
    const r = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'X', deviceModel: `Audit ${run}`, issue: 'x', estimateCost: 1500, branchId: IDS.branchA1,
    }).expect(201)).body;
    const patch = (b: object) => request(app.getHttpServer()).patch(`/api/v1/repairs/${r.id}`).set('Cookie', owner).send(b);
    for (const s of ['DIAGNOSING', 'IN_PROGRESS']) await patch({ status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/parts`, owner, { productId: part, quantity: 1 }).expect(201);
    await authPost(app, '/api/v1/shifts/delivery-fee', owner, { amount: 80, repairId: r.id }).expect(201);
    await patch({ status: 'COMPLETED' }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 1500 }).expect(201);
    // 3. delivery fee for the shop, paid by the owner (not from the drawer)
    await authPost(app, '/api/v1/shifts/delivery-fee', owner, { amount: 70, fromDrawer: false }).expect(201);
    // 4. shop expense from the drawer
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'OUT', amount: 100, reason: 'ค่าน้ำแข็ง', category: 'SHOP_EXPENSE' }).expect(201);
    // 5. money in with no bill (counts as income)
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'IN', amount: 200, reason: 'ซ่อมเล็กไม่เปิดบิล', category: 'INCOME_SERVICE' }).expect(201);
    // 6. owner takes cash out (not income, not expense)
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'OUT', amount: 300, reason: 'เจ้าของเอาไป', category: 'OWNER_DRAW' }).expect(201);

    const after = await screens();
    const b = await books();
    const ledger = await ledgerCash();
    const report = {
      shiftCash: r2(after.shift - before.shift),
      dailyCloseCash: r2(after.close - before.close),
      ledgerCash: ledger,
      booksCash: b.cash,
      reportProfit: r2(after.profit - before.profit),
      booksProfit: b.profit,
      books: b.by,
    };
    // eslint-disable-next-line no-console
    console.log('AUDIT', JSON.stringify(report, null, 2));

    // Cash: +1000 +1500 −80 −100 +200 −300 = 2220 in the drawer
    expect(report.shiftCash).toBe(2220);
    // profit: sale 1000−650 + repair 1500−200−80 + income 200 − expenses (70 + 100) = 1600
    expect(report.reportProfit).toBe(1600);
    expect(report.dailyCloseCash).toBe(2220);
    expect(report.ledgerCash).toBe(2220);
    expect(report.booksCash).toBe(2220);
    expect(report.booksProfit).toBe(1600);

    // The screens built on them: the books list shows each entry's amount, the balance sheet
    // "as of today" includes today, and the money page names each kind of cash out / in
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const list = (await authGet(app, '/api/v1/accounting/journals?limit=100', owner).expect(200)).body;
    const fee = list.items.find((e: any) => e.sourceType === 'REPAIR_EXTRA_COST');
    expect(fee.totalDebit).toBe(80);
    const bs = (await authGet(app, `/api/v1/accounting/reports/balance-sheet?asOfDate=${today}`, owner).expect(200)).body;
    expect(bs.totalAssets).not.toBe(0);
    expect(Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity)).toBeLessThan(0.01);   // it balances
    // Stock added on the product form is in the books: 20 phones (600) − 1 sold, 20 gifts (50) − 1
    // (counted from this test's own entries: other test files put stock into the same shop)
    expect(b.by['1300']).toBe(19 * 600 + 19 * 50);
    expect(b.by['1310']).toBe(19 * 200);
    const money = (await authGet(app, `/api/v1/finance/summary?startDate=${today}&endDate=${today}`, owner).expect(200)).body;
    expect(money.bySource.OWNER_DRAW.out).toBe(300);
    expect(money.bySource.DELIVERY_FEE.out).toBe(80);
    expect(money.bySource.OTHER_INCOME.in).toBe(200);
    expect(money.bySource.EXPENSE_PAYMENT.out).toBe(100);   // the owner-paid 70 never was in the drawer
  });

  it('AUDIT-02: money and stock moved while the books were off are booked by the catch-up', async () => {
    process.env.ACCOUNTING_ENABLED_TENANTS = 'none';
    const b = (await authPost(app, '/api/v1/products', owner, {
      name: `Late ${run}`, sku: `AUD-LATE-${run}`, type: 'ACCESSORY', price: 100, costPrice: 40, stock: 5, branchId: IDS.branchA1,
    }).expect(201)).body;
    const productId = b.id ?? b.product?.id;
    const out = (await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'OUT', amount: 50, reason: 'late', category: 'OWNER_DRAW' }).expect(201)).body;
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantA;

    const preview = (await authGet(app, '/api/v1/admin/accounting/catch-up', owner).expect(200)).body;
    expect(preview.cashMovements).toBeGreaterThanOrEqual(1);
    expect(preview.stockMoves).toBeGreaterThanOrEqual(1);
    await authPost(app, '/api/v1/admin/accounting/catch-up', owner, {}).expect(201);

    const move = await prisma.journalEntry.findFirst({ where: { tenantId: IDS.tenantA, sourceId: out.id } });
    expect(move?.sourceType).toBe('SHIFT_CASH_OUT');
    const stockMove = await prisma.stockMovement.findFirstOrThrow({ where: { productId } });
    const stockEntry = await prisma.journalEntry.findFirst({ where: { tenantId: IDS.tenantA, sourceType: 'STOCK_ADJUST', sourceId: stockMove.id }, include: { lines: true } });
    expect(stockEntry?.lines.reduce((t, l) => t + Number(l.debit), 0)).toBe(200);   // 5 × 40
    const again = (await authGet(app, '/api/v1/admin/accounting/catch-up', owner).expect(200)).body;
    expect(again.cashMovements).toBe(0);
    expect(again.stockMoves).toBe(0);
  });

  it('AUDIT-03: every number can be traced: its rows add up to it and name their document', async () => {
    const sum = (xs: { amount: number }[], sign = 1) => Math.round(xs.reduce((t, x) => t + sign * x.amount, 0) * 100) / 100;
    const p = (await authGet(app, `/api/v1/reports/profit?${q}`, owner).expect(200)).body;
    const t = p.trail;
    // income = bills − refunds + repair money + SIM commission + money with no bill
    const income = sum(t.sales) - sum(t.refunds) + sum(t.deposits) + sum(t.pickups) + sum(t.debts)
      + t.packages.reduce((s: number, x: any) => s + x.profit, 0) + sum(t.otherIncome);
    expect(Math.round(income * 100) / 100).toBe(p.summary.totalRevenue);
    expect(sum(t.deposits) + sum(t.pickups) + sum(t.debts)).toBe(p.repair.revenue);
    expect(sum(p.expenses.items)).toBe(p.expenses.total);
    const parts = p.repair.items.reduce((s: number, j: any) => s + j.partsCost - (j.freebieCost ?? 0), 0);
    expect(parts).toBe(p.repair.partsCost);
    // every row names its document
    for (const r of [...t.sales, ...t.pickups, ...t.otherIncome]) expect(r.ref?.id).toBeTruthy();
    expect(p.repair.items.every((j: any) => j.repairId)).toBe(true);
    expect(p.expenses.items.every((e: any) => e.id)).toBe(true);

    const day = (await authGet(app, `/api/v1/reports/daily-closing?${q}`, owner).expect(200)).body;
    const cashRows = [...day.trail.sales, ...day.trail.deposits, ...day.trail.pickups, ...day.trail.debts, ...day.trail.otherIncome]
      .filter((r: any) => r.method === 'CASH');
    const cashIn = sum(cashRows) - sum(day.trail.refunds.filter((r: any) => r.method === 'CASH'))
      + day.trail.packages.filter((r: any) => r.method === 'CASH').reduce((s: number, x: any) => s + x.paid, 0);
    expect(Math.round(cashIn * 100) / 100).toBe(day.revenue.cash + (day.revenue.packages.byMethod?.CASH ?? 0));
    const it = day.drawer.items;
    expect(sum(it.expenses)).toBe(day.drawer.out.expenses);
    expect(sum(it.moves.filter((m: any) => m.direction === 'OUT' && m.category === 'DELIVERY'))).toBe(day.drawer.out.delivery);
    expect(sum(it.moves.filter((m: any) => m.direction === 'OUT' && m.category === 'OWNER_DRAW'))).toBe(day.drawer.out.ownerDraw);
    expect(it.moves.find((m: any) => m.category === 'DELIVERY')?.ticketNumber).toBeTruthy();   // a fee names its job

    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const led = (await authGet(app, `/api/v1/finance/transactions?startDate=${today}&endDate=${today}&limit=100`, owner).expect(200)).body.data;
    const kinds = new Set(led.map((r: any) => r.doc?.kind).filter(Boolean));
    for (const k of ['SALE', 'REPAIR', 'EXPENSE', 'SHIFT']) expect(kinds.has(k)).toBe(true);
    const fee = led.find((r: any) => r.sourceType === 'DELIVERY_FEE');
    expect(fee.doc.kind).toBe('REPAIR');

    const job = (await authGet(app, `/api/v1/repairs/${p.repair.items[0].repairId}/profit`, owner).expect(200)).body;
    expect(job.costs.total).toBe(job.costs.parts + job.costs.delivery + job.costs.labor);
    expect(job.grossProfit).toBe(job.revenue.total - job.costs.total);
  });
});
