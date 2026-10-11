/**
 * What the shop pays follows into the cost, and staff discounts at the POS have a ceiling:
 *  - receiving a PO at a new price averages it into the product's cost (after the line discount)
 *  - stock in with a price does the same; stock in without one, or stock out, leaves it alone
 *  - with a staff limit set, a non-owner cannot take more than that % off a POS bill, whether by
 *    a bill discount or a line discount; the owner can
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Stock cost and POS staff discount limit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  const run = Date.now().toString(36).toUpperCase();
  const pw = 'E2eTest@2026!';
  const opened: string[] = [];

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
  const product = async (sku: string, price: number, cost: number, qty: number) => {
    const p = await prisma.product.create({ data: {
      name: `${sku} ${run}`, sku: `${sku}-${run}`, type: 'ACCESSORY', price, costPrice: cost, stock: qty, tenantId: IDS.tenantA,
    } as any });
    if (qty > 0) await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: qty } });
    return p.id;
  };
  const costOf = async (id: string) => Number((await prisma.product.findUniqueOrThrow({ where: { id } })).costPrice);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, pw)).cookies;
    await ensureShift(owner);
    await ensureShift(manager);
  });

  afterAll(async () => {
    await prisma.shopSettings.updateMany({ where: { tenantId: IDS.tenantA }, data: { staffDiscountLimitPercent: null } });
    for (const cookie of opened) {
      const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
      if (cur?.id) await authPost(app, `/api/v1/shifts/${cur.id}/close`, cookie, { closeBalance: Number(cur.expectedCashBalance ?? 0) });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SC-01: receiving a PO at a new price averages it into the cost, after the line discount', async () => {
    const id = await product('SCREEN', 1400, 600, 10);
    const supplierId = (await authPost(app, '/api/v1/suppliers', owner, { name: `Sup ${run}` }).expect(201)).body.id;
    const po = (await authPost(app, '/api/v1/purchase-orders', owner, {
      supplierId, branchId: IDS.branchA1, items: [{ productId: id, quantity: 10, unitCost: 700 }],
    }).expect(201)).body;
    await authPatch(app, `/api/v1/purchase-orders/${po.id}`, owner, { status: 'ORDERED' }).expect(200);
    await authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, {
      items: [{ purchaseOrderItemId: po.items[0].id, quantity: 10 }],
    }).expect(201);
    expect(await costOf(id)).toBe(650); // (10×600 + 10×700) / 20
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { referenceType: 'PURCHASE_ORDER', referenceId: po.id } });
    expect(Number(mv.unitCost)).toBe(700);

    // 2 at 700 with 200 off the line = 600 each
    const po2 = (await authPost(app, '/api/v1/purchase-orders', owner, {
      supplierId, branchId: IDS.branchA1, items: [{ productId: id, quantity: 2, unitCost: 700, discount: 200 }],
    }).expect(201)).body;
    await authPatch(app, `/api/v1/purchase-orders/${po2.id}`, owner, { status: 'ORDERED' }).expect(200);
    await authPost(app, `/api/v1/purchase-orders/${po2.id}/receive`, owner, {
      items: [{ purchaseOrderItemId: po2.items[0].id, quantity: 2 }],
    }).expect(201);
    expect(await costOf(id)).toBe(Math.round(((20 * 650 + 2 * 600) / 22) * 100) / 100);
  });

  it('SC-02: stock in with a price averages it; without one, or stock out, the cost stays', async () => {
    const id = await product('FILM', 100, 20, 5);
    await authPost(app, '/api/v1/stock/adjust', owner, { productId: id, type: 'IN', quantity: 5, branchId: IDS.branchA1, unitCost: 30 }).expect(201);
    expect(await costOf(id)).toBe(25);
    await authPost(app, '/api/v1/stock/adjust', owner, { productId: id, type: 'IN', quantity: 5, branchId: IDS.branchA1 }).expect(201);
    expect(await costOf(id)).toBe(25);
    await authPost(app, '/api/v1/stock/adjust', owner, { productId: id, type: 'OUT', quantity: 1, branchId: IDS.branchA1, unitCost: 999 }).expect(201);
    expect(await costOf(id)).toBe(25);

    // Out of stock: the new price is the cost
    const empty = await product('CASE', 200, 50, 0);
    await authPost(app, '/api/v1/stock/adjust', owner, { productId: empty, type: 'IN', quantity: 3, branchId: IDS.branchA1, unitCost: 80 }).expect(201);
    expect(await costOf(empty)).toBe(80);
  });

  it('SC-03: a staff POS discount above the limit is refused, by bill or by line; the owner is not limited', async () => {
    const id = await product('CHARGER', 1000, 300, 20);
    const sell = (cookie: string, body: Record<string, unknown>) =>
      authPost(app, '/api/v1/sales', cookie, { paymentMethod: 'CASH', amountPaid: 1000, branchId: IDS.branchA1, ...body });

    // No limit set: as before
    await sell(manager, { items: [{ productId: id, quantity: 1, price: 1000 }], discount: 300 }).expect(201);

    await authPatch(app, '/api/v1/settings', owner, { staffDiscountLimitPercent: 10 }).expect(200);
    const over = await sell(manager, { items: [{ productId: id, quantity: 1, price: 1000 }], discount: 150 });
    expect(over.status).toBe(400);
    expect(String(over.body.message)).toContain('10%');
    const overByLine = await sell(manager, { items: [{ productId: id, quantity: 1, price: 1000, discount: 200 }] });
    expect(overByLine.status).toBe(400);
    const lowered = await sell(manager, { items: [{ productId: id, quantity: 1, price: 800 }] });
    expect(lowered.status).toBe(400);

    await sell(manager, { items: [{ productId: id, quantity: 1, price: 1000 }], discount: 100 }).expect(201);
    await sell(owner, { items: [{ productId: id, quantity: 1, price: 1000 }], discount: 300 }).expect(201);
  });
});
