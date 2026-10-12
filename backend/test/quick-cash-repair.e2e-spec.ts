/**
 * Quick money at the counter (optional module "รับ-จ่ายเงินด่วน"):
 *  - a repair with no intake ticket is recorded in one step when the customer pays: created,
 *    handed over and paid in the current shift, flagged "parts pending"
 *  - its parts are taken from stock later (used or free, never charged), then marked done
 *  - money in for goods / a service counts as revenue; a shop expense paid from the drawer is an
 *    expense; the rest only moves cash in or out of the drawer
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Quick money and one-step paid repairs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let screenId: string;
  let filmId: string;
  let quickId: string;
  const run = Date.now().toString(36).toUpperCase();
  const phone = `09${String(Date.now()).slice(-8)}`;
  const pw = 'E2eTest@2026!';
  const opened: string[] = [];
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  const ensureShift = async (cookie: string) => {
    const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
    if (cur?.id) return;
    const joinable = (await authGet(app, '/api/v1/shifts/joinable', cookie).expect(200)).body;
    const open = Array.isArray(joinable) ? joinable[0] : null;
    if (open?.id) {
      await authPost(app, `/api/v1/shifts/${open.id}/join`, cookie, {}).expect(201);
      return;
    }
    const res = await authPost(app, '/api/v1/shifts/open', cookie, { openBalance: 1000 });
    if (res.status !== 201) throw new Error(`open shift: ${res.status} ${JSON.stringify(res.body)}`);
    opened.push(cookie);
  };
  const expected = async (cookie: string) =>
    Number((await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body.expectedCashBalance);
  const stockOf = async (productId: string) =>
    (await prisma.branchStock.findUniqueOrThrow({ where: { branchId_productId: { branchId: IDS.branchA1, productId } } })).quantity;
  const product = async (sku: string, price: number, cost: number) => {
    const p = await prisma.product.create({ data: {
      name: `${sku} ${run}`, sku: `${sku}-${run}`, type: 'ACCESSORY', price, costPrice: cost, stock: 10, tenantId: IDS.tenantA,
    } as any });
    await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: 10 } });
    return p.id;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, pw)).cookies;
    screenId = await product('SCREEN', 1400, 600);
    filmId = await product('FILM', 100, 15);
    await ensureShift(owner);
    await ensureShift(manager);
  });

  afterAll(async () => {
    await authPatch(app, '/api/v1/settings', owner, { quickCashEnabled: false });
    for (const cookie of opened) {
      const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
      if (cur?.id) await authPost(app, `/api/v1/shifts/${cur.id}/close`, cookie, { closeBalance: Number(cur.expectedCashBalance ?? 0) });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('QC-01: with the module off, a one-step paid repair is refused', async () => {
    await authPatch(app, '/api/v1/settings', owner, { quickCashEnabled: false }).expect(200);
    const res = await authPost(app, '/api/v1/repairs/quick-paid', manager, {
      customerPhone: phone, deviceModel: `A10 ${run}`, issue: 'เปลี่ยนจอ', price: 1200, paymentMethod: 'CASH',
    });
    expect(res.status).toBe(403);
  });

  it('QC-02: one step at pickup: the job is handed over, paid in the shift and waits for its parts', async () => {
    await authPatch(app, '/api/v1/settings', owner, { quickCashEnabled: true }).expect(200);
    const before = await expected(manager);
    const res = await authPost(app, '/api/v1/repairs/quick-paid', manager, {
      customerPhone: phone, deviceBrand: 'Samsung', deviceModel: `A10 ${run}`, issue: 'เปลี่ยนจอ', price: 1200, paymentMethod: 'CASH', warrantyDays: 30,
    });
    expect(res.status).toBe(201);
    quickId = res.body.id;
    const r = await prisma.repair.findUniqueOrThrow({ where: { id: quickId }, include: { customer: true } });
    expect(r).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID', quickEntry: true, partsPending: true });
    expect(Number(r.paidAmount)).toBe(1200);
    expect(Number(r.finalCost)).toBe(1200);
    expect(r.customer?.phone).toBe(phone);
    expect(r.branchId).toBe(IDS.branchA1);
    expect(await expected(manager)).toBe(before + 1200);

    // The same number next time links to the same customer
    const again = (await authPost(app, '/api/v1/repairs/quick-paid', manager, {
      customerPhone: phone, deviceModel: `A10 ${run}`, issue: 'เปลี่ยนแบต', price: 500, paymentMethod: 'TRANSFER',
    }).expect(201)).body;
    const r2 = await prisma.repair.findUniqueOrThrow({ where: { id: again.id } });
    expect(r2.customerId).toBe(r.customerId);
  });

  it('QC-03: parts are taken later (used or free, not charged), a mistake can be undone, then it is done', async () => {
    const list = (await authGet(app, '/api/v1/repairs/parts-pending', manager).expect(200)).body;
    expect(list.map((x: { id: string }) => x.id)).toContain(quickId);

    await authPost(app, `/api/v1/repairs/${quickId}/parts`, manager, { productId: screenId, quantity: 1 }).expect(201);
    expect(await stockOf(screenId)).toBe(9);
    const charge = await authPost(app, `/api/v1/repairs/${quickId}/parts`, manager, { productId: filmId, quantity: 1, chargeToCustomer: true, price: 100 });
    expect(charge.status).toBe(400);
    const film = (await authPost(app, `/api/v1/repairs/${quickId}/parts`, manager, { productId: filmId, quantity: 1, freebie: true }).expect(201)).body;
    expect(await stockOf(filmId)).toBe(9);
    const filmPart = film.parts.find((p: { productId: string }) => p.productId === filmId);
    const del = await request(app.getHttpServer())
      .delete(`/api/v1/repairs/${quickId}/parts/${filmPart.id}`).set('Cookie', manager);
    expect(del.status).toBe(200);
    expect(await stockOf(filmId)).toBe(10);

    // Profit of the job counts the screen it used
    const profit = (await authGet(app, `/api/v1/repairs/${quickId}/profit`, owner).expect(200)).body;
    expect(JSON.stringify(profit)).toContain('600');

    await authPatch(app, `/api/v1/repairs/${quickId}/parts-done`, manager, {}).expect(200);
    const after = (await authGet(app, '/api/v1/repairs/parts-pending', manager).expect(200)).body;
    expect(after.map((x: { id: string }) => x.id)).not.toContain(quickId);
    const late = await authPost(app, `/api/v1/repairs/${quickId}/parts`, manager, { productId: filmId, quantity: 1 });
    expect(late.status).toBe(400);
  });

  it('QC-04: money in for a service counts as revenue and in the drawer', async () => {
    const closing = async () => (await authGet(app, `/api/v1/reports/daily-closing?date=${today}`, owner).expect(200)).body;
    const before = await closing();
    const cash = await expected(manager);
    await authPost(app, '/api/v1/shifts/cash-movements', manager, { direction: 'IN', amount: 300, reason: 'ลงโปรแกรม', category: 'INCOME_SERVICE' }).expect(201);
    // Change float is cash in the drawer, not income
    await authPost(app, '/api/v1/shifts/cash-movements', manager, { direction: 'IN', amount: 200, reason: 'เติมเงินทอน', category: 'FLOAT_IN' }).expect(201);
    const after = await closing();
    expect(after.revenue.otherIncome.total - (before.revenue.otherIncome?.total ?? 0)).toBe(300);
    expect(after.revenue.grandTotal - before.revenue.grandTotal).toBe(300);
    expect(await expected(manager)).toBe(cash + 500);
  });

  it('QC-05: a shop expense from the drawer is an expense; owner taking money only leaves the drawer', async () => {
    const cash = await expected(manager);
    const exp = (await authPost(app, '/api/v1/shifts/cash-movements', manager, { direction: 'OUT', amount: 100, reason: `ข้าวกลางวัน ${run}`, category: 'SHOP_EXPENSE' }).expect(201)).body;
    const e = await prisma.expense.findUniqueOrThrow({ where: { id: exp.expenseId }, include: { category: true } });
    expect(Number(e.amount)).toBe(100);
    expect(e.paymentMethod).toBe('CASH');
    expect(e.shiftId).toBeTruthy();
    expect(await prisma.shiftCashMovement.count({ where: { reason: `ข้าวกลางวัน ${run}` } })).toBe(0);
    expect(await expected(manager)).toBe(cash - 100);

    await authPost(app, '/api/v1/shifts/cash-movements', manager, { direction: 'OUT', amount: 500, reason: 'เจ้าของเบิก', category: 'OWNER_DRAW' }).expect(201);
    expect(await expected(manager)).toBe(cash - 600);

    const wrong = await authPost(app, '/api/v1/shifts/cash-movements', manager, { direction: 'IN', amount: 50, reason: 'ผิดหมวด', category: 'OWNER_DRAW' });
    expect(wrong.status).toBe(400);
  });
});
