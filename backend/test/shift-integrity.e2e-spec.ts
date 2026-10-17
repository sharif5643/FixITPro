/**
 * Why shifts did not balance (audit 2026-10), and what the shop now has instead:
 *  - goods given free / claimed / swapped go out of stock with a reason, not as a 0-baht sale
 *  - a sale keyed in late is filed at the time it happened, in the shift open then, and its cash
 *    (already counted when that shift closed) is not counted again in today's shift
 *  - a bill paid by transfer but keyed as cash can be put right while its shift is open: drawer
 *    ledger and books are reversed and rebooked
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { ensureInShift } from './helpers/shift.helper';

describe('Shift integrity: write-off, late entry, payment method (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let cashier: string;
  let productId: string;
  let pastShiftId: string;
  let lateSaleId: string;
  const run = Date.now().toString(36).toUpperCase();
  const saved = { core: process.env.ACCOUNTING_CORE_ENABLED, tenants: process.env.ACCOUNTING_ENABLED_TENANTS };

  const stockOf = async () =>
    (await prisma.branchStock.findUniqueOrThrow({ where: { branchId_productId: { branchId: IDS.branchA1, productId } } })).quantity;
  const expected = async (cookie: string) =>
    Number((await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body.expectedCashBalance);
  const ensureShift = (cookie: string) => ensureInShift(app, cookie);
  const sell = (cookie: string, body: object) => authPost(app, '/api/v1/sales', cookie, {
    branchId: IDS.branchA1, items: [{ productId, quantity: 1, price: 1000 }], ...body,
  });

  beforeAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = IDS.tenantA;
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    await authPost(app, '/api/v1/accounting/accounts/initialize', owner, {});
    const p = await prisma.product.create({ data: {
      name: `Case ${run}`, sku: `SI-${run}`, type: 'ACCESSORY', price: 1000, costPrice: 400, stock: 20, tenantId: IDS.tenantA,
    } as any });
    productId = p.id;
    await prisma.branchStock.create({ data: { productId, branchId: IDS.branchA1, quantity: 20 } });
    await ensureShift(manager);
    await ensureShift(cashier);
    // A shift of this branch that ran earlier today and is closed (last night's)
    const past = await prisma.shift.create({ data: {
      userId: IDS.userManagerA1, branchId: IDS.branchA1, openBalance: 0, closeBalance: 1500, isActive: false,
      openedAt: new Date(Date.now() - 10 * 3600_000), closedAt: new Date(Date.now() - 2 * 3600_000),
    } });
    pastShiftId = past.id;
  });

  afterAll(async () => {
    process.env.ACCOUNTING_CORE_ENABLED = saved.core;
    process.env.ACCOUNTING_ENABLED_TENANTS = saved.tenants;
    if (saved.core === undefined) delete process.env.ACCOUNTING_CORE_ENABLED;
    if (saved.tenants === undefined) delete process.env.ACCOUNTING_ENABLED_TENANTS;
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SI-01: goods given free leave stock with the reason — no sale, no money', async () => {
    const sales = await prisma.sale.count({ where: { items: { some: { productId } } } });
    await authPost(app, '/api/v1/stock/write-off', manager, {
      reason: 'FREEBIE', note: 'แถมกับ iPhone 13', items: [{ productId, quantity: 2 }],
    }).expect(201);
    expect(await stockOf()).toBe(18);
    const moves = await prisma.stockMovement.findMany({ where: { productId, type: 'OUT' } });
    expect(moves).toHaveLength(1);
    expect(moves[0].note).toBe('แถม: แถมกับ iPhone 13');
    expect(await prisma.sale.count({ where: { items: { some: { productId } } } })).toBe(sales);

    // Not enough stock: nothing leaves
    const tooMany = await authPost(app, '/api/v1/stock/write-off', manager, { reason: 'CLAIM', items: [{ productId, quantity: 99 }] });
    expect(tooMany.status).toBe(400);
    expect(await stockOf()).toBe(18);
    // A reason is required
    expect((await authPost(app, '/api/v1/stock/write-off', manager, { reason: 'X', items: [{ productId, quantity: 1 }] })).status).toBe(400);
  });

  it('SI-02: a sale keyed in late goes to the shift of that time; today\'s cash is not counted twice', async () => {
    const before = await expected(manager);
    const soldAt = new Date(Date.now() - 5 * 3600_000);
    const res = await sell(manager, { paymentMethod: 'CASH', amountPaid: 1000, soldAt: soldAt.toISOString(), note: 'ลืมคีย์' });
    expect(res.status).toBe(201);
    lateSaleId = res.body.id;
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: lateSaleId }, include: { payments: true } });
    expect(sale.shiftId).toBe(pastShiftId);
    expect(Math.abs(sale.createdAt.getTime() - soldAt.getTime())).toBeLessThan(1000);
    expect(sale.note).toBe('[บันทึกย้อนหลัง] ลืมคีย์');
    expect(Number(sale.total)).toBe(1000);
    expect(await stockOf()).toBe(17);
    // Today's drawer is untouched; the cash was counted when last night's shift closed
    expect(await expected(manager)).toBe(before);
    expect(await prisma.cashDrawerTransaction.count({ where: { referenceId: sale.payments[0].id } })).toBe(0);
    // Revenue is booked on the day it was earned
    const j = await prisma.journalEntry.findFirst({ where: { tenantId: IDS.tenantA, sourceType: 'SALE_PAYMENT', sourceId: sale.payments[0].id } });
    expect(j).toBeTruthy();
    expect(Math.abs(new Date(j!.entryDate).getTime() - soldAt.getTime())).toBeLessThan(24 * 3600_000);
  });

  it('SI-03: late entry is for owner / manager, into a time that had a shift, not the future', async () => {
    const at = new Date(Date.now() - 5 * 3600_000).toISOString();
    expect((await sell(cashier, { paymentMethod: 'CASH', amountPaid: 1000, soldAt: at })).status).toBe(403);
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect((await sell(manager, { paymentMethod: 'CASH', amountPaid: 1000, soldAt: future })).status).toBe(400);
    const noShift = new Date(Date.now() - 50 * 24 * 3600_000).toISOString();
    expect((await sell(manager, { paymentMethod: 'CASH', amountPaid: 1000, soldAt: noShift })).status).toBe(400);
    expect(await stockOf()).toBe(17);
  });

  it('SI-04: a transfer keyed as cash is put right in the open shift — drawer and books follow', async () => {
    const before = await expected(manager);
    const sale = (await sell(manager, { paymentMethod: 'CASH', amountPaid: 1200 }).expect(201)).body;
    expect(await expected(manager)).toBe(before + 1000);
    const oldLeg = (await prisma.salePayment.findFirstOrThrow({ where: { saleId: sale.id } })).id;
    const oldJournal = await prisma.journalEntry.findFirstOrThrow({ where: { tenantId: IDS.tenantA, sourceType: 'SALE_PAYMENT', sourceId: oldLeg } });

    // Someone else's bill: a cashier cannot change it
    expect((await authPost(app, `/api/v1/sales/${sale.id}/payment-method`, cashier, { paymentMethod: 'TRANSFER' })).status).toBe(403);

    await authPost(app, `/api/v1/sales/${sale.id}/payment-method`, manager, { paymentMethod: 'TRANSFER' }).expect(201);
    expect(await expected(manager)).toBe(before);
    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { payments: true } });
    expect(after.paymentMethod).toBe('TRANSFER');
    expect(Number(after.change)).toBe(0);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ paymentMethod: 'TRANSFER' });
    expect(Number(after.payments[0].amount)).toBe(1000);
    // Drawer ledger: the cash in is reversed
    expect(await prisma.cashDrawerTransaction.count({ where: { referenceId: oldLeg, direction: 'OUT' } })).toBe(1);
    // Books: the cash journal is reversed and the transfer booked
    expect(await prisma.journalEntry.count({ where: { tenantId: IDS.tenantA, sourceType: 'JOURNAL_REVERSAL', sourceId: oldJournal.id } })).toBe(1);
    const newJ = await prisma.journalEntry.findFirst({
      where: { tenantId: IDS.tenantA, sourceType: 'SALE_PAYMENT', sourceId: after.payments[0].id },
      include: { lines: { include: { account: true } } },
    });
    expect(newJ?.lines.find((l) => Number(l.debit) > 0)?.account.code).toBe('1120');

    // Same method again: nothing changes
    await authPost(app, `/api/v1/sales/${sale.id}/payment-method`, manager, { paymentMethod: 'TRANSFER' }).expect(201);
    expect(await prisma.salePayment.count({ where: { saleId: sale.id } })).toBe(1);
  });

  it('SI-05: bills of a closed shift and bills paid several ways stay as they are', async () => {
    expect((await authPost(app, `/api/v1/sales/${lateSaleId}/payment-method`, manager, { paymentMethod: 'TRANSFER' })).status).toBe(400);
    const split = (await sell(manager, { payments: [{ paymentMethod: 'CASH', amount: 400 }, { paymentMethod: 'TRANSFER', amount: 600 }] }).expect(201)).body;
    expect((await authPost(app, `/api/v1/sales/${split.id}/payment-method`, manager, { paymentMethod: 'CARD' })).status).toBe(400);
  });
});
