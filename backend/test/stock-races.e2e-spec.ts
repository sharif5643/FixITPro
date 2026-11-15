/**
 * Two clicks (or two devices) at the same moment must move stock once:
 *  - receiving a purchase order twice
 *  - sending / receiving a branch transfer twice, or receiving and cancelling it at once
 *  - "set to counted" works from the stock the server holds, not the figure on screen
 *  - a phone sold by IMEI cannot come in from a PO without its IMEI, and one IMEI cannot be sold twice
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, testPrisma } from './helpers/seed.helper';
import { closeOpenShiftsOfBranch } from './helpers/shift.helper';

describe('Stock moves once (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let shiftId: string;
  const run = Date.now().toString(36);
  let n = 0;
  const product = async (qty: number, hasSerial = false) => {
    const p = await prisma.product.create({ data: {
      name: `Race ${run} ${++n}`, sku: `RACE-${run}-${n}`, type: hasSerial ? 'PHONE' : 'ACCESSORY', price: 100, costPrice: 50,
      stock: qty, tenantId: IDS.tenantA, hasSerial,
    } as any });
    if (qty > 0) await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: qty } });
    return p.id;
  };
  const qtyAt = async (productId: string, branchId: string) =>
    (await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId, productId } } }))?.quantity ?? 0;
  const ok = (s: number) => s >= 200 && s < 300;

  beforeAll(async () => {
    prisma = testPrisma();
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    await closeOpenShiftsOfBranch(app, owner, IDS.branchA1);
    shiftId = (await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201)).body.id;
  });
  afterAll(async () => {
    if (shiftId) await authPost(app, `/api/v1/shifts/${shiftId}/close`, owner, { closeBalance: 0, note: 'e2e' });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SR-01: a purchase order received twice at once brings the goods in once', async () => {
    const id = await product(0);
    const supplierId = (await authPost(app, '/api/v1/suppliers', owner, { name: `Race ${run}` }).expect(201)).body.id;
    const po = (await authPost(app, '/api/v1/purchase-orders', owner, {
      supplierId, branchId: IDS.branchA1, items: [{ productId: id, quantity: 5, unitCost: 50 }],
    }).expect(201)).body;
    await authPatch(app, `/api/v1/purchase-orders/${po.id}`, owner, { status: 'ORDERED' }).expect(200);
    const recv = () => authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, { items: [{ purchaseOrderItemId: po.items[0].id, quantity: 5 }] });
    const [a, b] = await Promise.all([recv(), recv()]);
    expect([a.status, b.status].filter(ok)).toHaveLength(1);
    expect(await qtyAt(id, IDS.branchA1)).toBe(5);
    expect(await prisma.stockMovement.count({ where: { referenceType: 'PURCHASE_ORDER', referenceId: po.id } })).toBe(1);
  });

  it('SR-02: a phone from a PO needs one IMEI per unit; the IMEIs come into stock', async () => {
    const id = await product(0, true);
    const supplierId = (await authPost(app, '/api/v1/suppliers', owner, { name: `Race P ${run}` }).expect(201)).body.id;
    const po = (await authPost(app, '/api/v1/purchase-orders', owner, {
      supplierId, branchId: IDS.branchA1, items: [{ productId: id, quantity: 2, unitCost: 5000 }],
    }).expect(201)).body;
    await authPatch(app, `/api/v1/purchase-orders/${po.id}`, owner, { status: 'ORDERED' }).expect(200);
    const item = po.items[0].id;
    await authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, { items: [{ purchaseOrderItemId: item, quantity: 2 }] }).expect(400);
    await authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, { items: [{ purchaseOrderItemId: item, quantity: 2, serials: [`IM${run}A`] }] }).expect(400);
    expect(await qtyAt(id, IDS.branchA1)).toBe(0);
    await authPost(app, `/api/v1/purchase-orders/${po.id}/receive`, owner, { items: [{ purchaseOrderItemId: item, quantity: 2, serials: [`IM${run}A`, `IM${run}B`] }] }).expect(201);
    expect(await qtyAt(id, IDS.branchA1)).toBe(2);
    expect(await prisma.serialNumber.count({ where: { productId: id, status: 'IN_STOCK' } })).toBe(2);

    // the same IMEI sold from two counters at once: one sale only
    const serial = await prisma.serialNumber.findFirstOrThrow({ where: { productId: id, serial: `IM${run}A` } });
    const sell = () => authPost(app, '/api/v1/sales', owner, {
      branchId: IDS.branchA1, payments: [{ paymentMethod: 'CASH', amount: 100 }],
      items: [{ productId: id, quantity: 1, price: 100, serialIds: [serial.id] }],
    });
    const [x, y] = await Promise.all([sell(), sell()]);
    expect([x.status, y.status].filter(ok)).toHaveLength(1);
    expect(await qtyAt(id, IDS.branchA1)).toBe(1);
  });

  it('SR-03: a transfer sent twice, received twice, or received and cancelled at once moves stock once', async () => {
    const id = await product(10);
    const mk = async () => (await authPost(app, '/api/v1/branches/transfers', owner, {
      fromBranchId: IDS.branchA1, toBranchId: IDS.branchA2, productId: id, quantity: 3,
    }).expect(201)).body.id as string;
    const step = (tid: string, action: string, body: object = {}) =>
      request(app.getHttpServer()).patch(`/api/v1/branches/transfers/${tid}/${action}`).set('Cookie', owner).send(body);

    const t1 = await mk();
    await step(t1, 'approve').expect((r) => expect(ok(r.status)).toBe(true));
    const [d1, d2] = await Promise.all([step(t1, 'dispatch'), step(t1, 'dispatch')]);
    expect([d1.status, d2.status].filter(ok)).toHaveLength(1);
    expect(await qtyAt(id, IDS.branchA1)).toBe(7);
    const [r1, r2] = await Promise.all([step(t1, 'receive'), step(t1, 'receive')]);
    expect([r1.status, r2.status].filter(ok)).toHaveLength(1);
    expect(await qtyAt(id, IDS.branchA2)).toBe(3);

    // receive and cancel at once: either the goods arrive or they go back, never both
    const t2 = await mk();
    await step(t2, 'approve').expect((r) => expect(ok(r.status)).toBe(true));
    await step(t2, 'dispatch').expect((r) => expect(ok(r.status)).toBe(true));
    await Promise.all([step(t2, 'receive'), step(t2, 'cancel', { reason: 'ส่งผิด' })]);
    const a1 = await qtyAt(id, IDS.branchA1), a2 = await qtyAt(id, IDS.branchA2);
    expect(a1 + a2).toBe(10);
    expect([[4, 6], [7, 3]]).toContainEqual([a1, a2]);
  });

  it('SR-04: "set to counted" works from the stock the server holds, whatever the screen thought', async () => {
    const id = await product(8);
    // the screen still thought 0 (loading): before, it sent +5 and stock became 13
    await authPost(app, '/api/v1/stock/adjust', owner, {
      productId: id, type: 'ADJUST', quantity: 5, countedQuantity: 5, branchId: IDS.branchA1,
    }).expect(201);
    expect(await qtyAt(id, IDS.branchA1)).toBe(5);
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { productId: id, type: 'ADJUST' }, orderBy: { createdAt: 'desc' } });
    expect(mv.quantity).toBe(-3);
    // counted the same as held: nothing moves
    await authPost(app, '/api/v1/stock/adjust', owner, { productId: id, type: 'ADJUST', quantity: 1, countedQuantity: 5, branchId: IDS.branchA1 }).expect(201);
    expect(await qtyAt(id, IDS.branchA1)).toBe(5);
    expect(await prisma.stockMovement.count({ where: { productId: id, type: 'ADJUST' } })).toBe(1);
  });
});
