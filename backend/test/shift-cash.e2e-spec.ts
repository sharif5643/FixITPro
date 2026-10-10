/**
 * Money that leaves or enters the drawer outside a sale, in the shift where it really happens:
 *  - a refund of a sale from an earlier (closed) shift comes out of the shift open now
 *  - a repair payment given back later stays in the shift that took it, and leaves from the
 *    shift open now (reverse payment, and refund-and-cancel with deposit and payment)
 *  - cash put in / taken out by hand, with a reason; the owner is told when cash goes out
 *  - cash cannot go back to a customer without an open shift
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Shift cash: refunds across shifts, repair money back, cash in / out (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let productId: string;
  const run = Date.now().toString(36);
  // Opening cash, so a shift that only pays money back still closes with a positive count
  const FLOAT = 5000;

  const current = async () => (await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body;
  const expected = async () => Number((await current()).expectedCashBalance);
  const closeNow = async () => {
    const cur = await current();
    if (!cur?.id) return null;
    await authPost(app, `/api/v1/shifts/${cur.id}/close`, owner, { closeBalance: Number(cur.expectedCashBalance ?? 0) }).expect(201);
    return cur.id as string;
  };
  const summaryOf = async (id: string) => (await authGet(app, `/api/v1/shifts/${id}/summary`, owner).expect(200)).body.summary;
  const sell = async (amount: number) => {
    const sale = (await authPost(app, '/api/v1/sales', owner, {
      paymentMethod: 'CASH', amountPaid: amount, branchId: IDS.branchB1,
      items: [{ productId, quantity: 1, price: amount }],
    }).expect(201)).body;
    const saleId = sale.id ?? sale.sale?.id;
    const itemId = (await authGet(app, `/api/v1/sales/${saleId}`, owner)).body.items[0].id;
    return { saleId, itemId };
  };
  const paidRepair = async (deposit: number, pay: number) => {
    const r = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'X', deviceModel: `Cash ${run}`, issue: 'x', estimateCost: deposit + pay, deposit,
      ...(deposit ? { depositPaymentMethod: 'CASH' } : {}), branchId: IDS.branchB1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await authPatch(app, `/api/v1/repairs/${r.id}`, owner, { status: s }).expect(200);
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: pay }).expect(201);
    return r.id as string;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    await closeNow();
    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
    const cat = (await authPost(app, '/api/v1/categories', owner, { name: `Cash ${run}` })).body.id;
    const prod = (await authPost(app, '/api/v1/products', owner, {
      name: `Cash ${run}`, sku: `CASH-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 20,
      branchId: IDS.branchB1, categoryId: cat,
    }).expect(201)).body;
    productId = prod.id ?? prod.product?.id;
  });

  afterAll(async () => {
    await closeNow();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SC-01: a cash refund of a sale from a closed shift comes out of the shift open now', async () => {
    const { saleId, itemId } = await sell(100);
    const first = await closeNow();
    const before = (await summaryOf(first!)).expectedBalance;

    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
    await authPost(app, `/api/v1/sales/${saleId}/refund`, owner, {
      reason: 'e2e', paymentMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 100 }],
    }).expect(201);

    expect(await expected()).toBe(FLOAT - 100);
    expect((await current()).cashRefunds).toBe(100);
    // The closed shift reprints with the same figures
    expect((await summaryOf(first!)).expectedBalance).toBe(before);
  });

  it('SC-02: no cash back to a customer without an open shift', async () => {
    const { saleId, itemId } = await sell(100);
    await closeNow();
    const res = await authPost(app, `/api/v1/sales/${saleId}/refund`, owner, {
      reason: 'e2e', paymentMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 100 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('เปิดกะ');
    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
  });

  it('SC-03: a repair payment given back later stays in the shift that took it', async () => {
    const repairId = await paidRepair(0, 500);
    const first = await closeNow();
    const before = await summaryOf(first!);
    expect(before.repairPayments.totalAmount).toBe(500);

    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
    await authPost(app, `/api/v1/repairs/${repairId}/reverse-payment`, owner, { reason: 'e2e' }).expect(201);

    const after = await summaryOf(first!);
    expect(after.repairPayments.totalAmount).toBe(500);
    expect(after.expectedBalance).toBe(before.expectedBalance);
    expect(await expected()).toBe(FLOAT - 500);
    expect((await current()).cashRepairRefunds).toBe(500);
  });

  it('SC-04: refund-and-cancel gives back deposit and payment from the shift open now; the earlier shift keeps both', async () => {
    const repairId = await paidRepair(200, 300);
    const first = await closeNow();
    const before = await summaryOf(first!);

    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
    await authPost(app, `/api/v1/repairs/${repairId}/refund-and-cancel`, owner, { reason: 'e2e' }).expect(201);

    const after = await summaryOf(first!);
    expect(after.expectedBalance).toBe(before.expectedBalance);
    expect(after.cashDeposits).toBe(before.cashDeposits);
    expect(await expected()).toBe(FLOAT - 500);
  });

  it('SC-05: the same shift: taking and giving back cancel out', async () => {
    const start = await expected();
    const repairId = await paidRepair(0, 400);
    expect(await expected()).toBe(start + 400);
    await authPost(app, `/api/v1/repairs/${repairId}/reverse-payment`, owner, { reason: 'e2e' }).expect(201);
    expect(await expected()).toBe(start);
  });

  it('SC-06: cash in / out by hand with a reason; listed with the person; owner told when cash goes out', async () => {
    const start = await expected();
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'OUT', amount: 1000, reason: '' }).expect(400);
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'OUT', amount: -5, reason: 'x x' }).expect(400);
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'OUT', amount: 1000, reason: 'เจ้าของเบิกไปฝากธนาคาร' }).expect(201);
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'IN', amount: 250.5, reason: 'เติมเงินทอน' }).expect(201);

    const cur = await current();
    expect(Number(cur.expectedCashBalance)).toBe(start - 1000 + 250.5);
    expect(cur.cashManualOut).toBe(1000);
    expect(cur.cashManualIn).toBe(250.5);

    const list = (await authGet(app, `/api/v1/shifts/${cur.id}/cash-movements`, owner).expect(200)).body;
    expect(list.map((m: any) => [m.direction, m.amount, m.reason])).toEqual([
      ['IN', 250.5, 'เติมเงินทอน'],
      ['OUT', 1000, 'เจ้าของเบิกไปฝากธนาคาร'],
    ]);
    expect(list[0].createdBy.name).toBeTruthy();

    const told = await prisma.notification.findFirst({ where: { type: 'SHIFT_CASH_OUT', entityId: cur.id } });
    expect(told?.tenantId).toBe(IDS.tenantB);

    // Closing with the right count shows no difference
    const id = await closeNow();
    const s = await summaryOf(id!);
    expect(s.cashManualOut).toBe(1000);
    expect(s.difference).toBe(0);
    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
  });

  it('SC-07: another shop cannot see this shift\'s cash movements; no shift → no cash movement', async () => {
    const cur = await current();
    const otherOwner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    await authGet(app, `/api/v1/shifts/${cur.id}/cash-movements`, otherOwner).expect(404);
    await closeNow();
    await authPost(app, '/api/v1/shifts/cash-movements', owner, { direction: 'IN', amount: 10, reason: 'ทดสอบ' }).expect(400);
    await authPost(app, '/api/v1/shifts/open', owner, { openBalance: FLOAT }).expect(201);
  });
});
