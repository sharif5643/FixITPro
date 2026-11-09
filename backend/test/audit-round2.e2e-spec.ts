/**
 * Fixes from the full code audit, round 2:
 *  - a part "คิดเงินเพิ่ม" (charged to the customer) goes onto the job's bill, and off it when removed
 *  - another shop's ids are refused: purchase-order products/branch, shift list branch, sale
 *    customer, and file paths that walk out of the caller's own folder
 *  - a customer edit takes only customer fields (not tenantId, not points)
 *  - a bill that was partly refunded cannot be voided (the void took back every payment again)
 *  - a claim on a sold serial is created (it used to fail every time with "ไม่พบเคลม")
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Audit fixes round 2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;
  let shiftB: string;
  const run = Date.now().toString(36);
  const http = () => request(app.getHttpServer());

  const productOf = async (cookie: string, branchId: string, name: string, price: number, cost: number, extra: object = {}) => {
    const cat = (await authPost(app, '/api/v1/categories', cookie, { name: `R2 ${name} ${run}` })).body.id;
    const p = (await authPost(app, '/api/v1/products', cookie, {
      name: `R2 ${name} ${run}`, sku: `R2-${name}-${run}`, type: 'ACCESSORY', price, costPrice: cost, stock: 10, branchId, categoryId: cat, ...extra,
    }).expect(201)).body;
    return (p.id ?? p.product?.id) as string;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const cur = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (cur.body?.id) await authPost(app, `/api/v1/shifts/${cur.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    shiftB = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    if (shiftB) await authPost(app, `/api/v1/shifts/${shiftB}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('R2-01: a charged part is added to the bill and comes off when removed; a part used for the repair is not', async () => {
    const part = await productOf(ownerB, IDS.branchB1, 'Film', 300, 80, { type: 'PART' });
    const job = (await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'X', deviceModel: `R2 ${run}`, issue: 'screen', estimateCost: 1500, branchId: IDS.branchB1,
    }).expect(201)).body;
    const patch = (b: object) => http().patch(`/api/v1/repairs/${job.id}`).set('Cookie', ownerB).send(b);
    for (const s of ['DIAGNOSING', 'IN_PROGRESS']) await patch({ status: s }).expect(200);
    const bill = async () => Number((await prisma.repair.findUniqueOrThrow({ where: { id: job.id } })).estimatedTotal ?? 0);

    await authPost(app, `/api/v1/repairs/${job.id}/parts`, ownerB, { productId: part, quantity: 1, chargeToCustomer: true }).expect(201);
    expect(await bill()).toBe(1800);

    const used = await productOf(ownerB, IDS.branchB1, 'Glue', 50, 10, { type: 'PART' });
    await authPost(app, `/api/v1/repairs/${job.id}/parts`, ownerB, { productId: used, quantity: 1 }).expect(201);
    expect(await bill()).toBe(1800);

    const partId = (await prisma.repairPart.findFirstOrThrow({ where: { repairId: job.id, productId: part } })).id;
    await http().delete(`/api/v1/repairs/${job.id}/parts/${partId}`).set('Cookie', ownerB).expect((r) => expect([200, 204]).toContain(r.status));
    expect(await bill()).toBe(1500);
  });

  it('R2-02: a purchase order with another shop\'s product or branch is refused', async () => {
    const supplier = (await authPost(app, '/api/v1/suppliers', ownerB, { name: `R2 Sup ${run}` }).expect(201)).body;
    const productA = await productOf(ownerA, IDS.branchA1, 'Case', 200, 100);
    const productB = await productOf(ownerB, IDS.branchB1, 'Case', 200, 100);
    const line = (productId: string) => ({ productId, quantity: 5, unitCost: 100 });
    await authPost(app, '/api/v1/purchase-orders', ownerB, { supplierId: supplier.id, items: [line(productA)] }).expect(404);
    await authPost(app, '/api/v1/purchase-orders', ownerB, { supplierId: supplier.id, branchId: IDS.branchA1, items: [line(productB)] })
      .expect((r) => expect([403, 404]).toContain(r.status));
    await authPost(app, '/api/v1/purchase-orders', ownerB, { supplierId: supplier.id, branchId: IDS.branchB1, items: [line(productB)] }).expect(201);
  });

  it('R2-03: the shift list with another shop\'s branch returns nothing of that shop', async () => {
    const res = await authGet(app, `/api/v1/shifts?branchId=${IDS.branchA1}`, ownerB);
    if (res.status === 200) {
      const rows = Array.isArray(res.body) ? res.body : res.body.data ?? res.body.items ?? [];
      expect(rows.filter((s: any) => s.branchId === IDS.branchA1)).toHaveLength(0);
    } else {
      expect([400, 403]).toContain(res.status);
    }
  });

  it('R2-04: a customer edit takes customer fields only', async () => {
    const c = (await authPost(app, '/api/v1/customers', ownerB, { name: `R2 Cust ${run}` }).expect(201)).body;
    await http().put(`/api/v1/customers/${c.id}`).set('Cookie', ownerB).send({ tenantId: IDS.tenantA }).expect(400);
    await http().put(`/api/v1/customers/${c.id}`).set('Cookie', ownerB).send({ points: 99999 }).expect(400);
    await http().put(`/api/v1/customers/${c.id}`).set('Cookie', ownerB).send({ name: `R2 Renamed ${run}` }).expect(200);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.tenantId).toBe(IDS.tenantB);
    expect(after.name).toBe(`R2 Renamed ${run}`);
  });

  it('R2-05: a file path that walks into another shop\'s folder is refused', async () => {
    const res = await http().get(`/api/v1/files/${IDS.tenantB}/%2e%2e/${IDS.tenantA}/slips/x.jpg`).set('Cookie', ownerB);
    expect(res.status).toBe(403);
  });

  it('R2-06: a sale with another shop\'s customer is refused', async () => {
    const custA = (await authPost(app, '/api/v1/customers', ownerA, { name: `R2 A ${run}` }).expect(201)).body;
    const p = await productOf(ownerB, IDS.branchB1, 'Cable', 100, 40);
    await authPost(app, '/api/v1/sales', ownerB, {
      branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 100, customerId: custA.id, items: [{ productId: p, quantity: 1, price: 100 }],
    }).expect(404);
  });

  it('R2-07: a bill already partly refunded cannot be voided', async () => {
    const p = await productOf(ownerB, IDS.branchB1, 'Charger', 500, 200);
    const sale = (await authPost(app, '/api/v1/sales', ownerB, {
      branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 1000, items: [{ productId: p, quantity: 2, price: 500 }],
    }).expect(201)).body;
    const itemId = sale.items?.[0]?.id ?? (await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } })).id;
    await authPost(app, `/api/v1/sales/${sale.id}/refund`, ownerB, {
      reason: 'e2e', paymentMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 500 }],
    }).expect(201);
    const res = await authPost(app, `/api/v1/sales/${sale.id}/void`, ownerB, { reason: 'e2e' }).expect(400);
    expect(JSON.stringify(res.body)).toContain('คืนเงินไปแล้ว');
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).not.toBe('VOIDED');
  });

  it('R2-08: a claim on a sold serial is created', async () => {
    const p = await productOf(ownerB, IDS.branchB1, 'Phone', 5000, 3000);
    const serial = await prisma.serialNumber.create({ data: { serial: `R2-IMEI-${run}`, productId: p, status: 'SOLD' } as any });
    const res = await authPost(app, '/api/v1/claims', ownerB, { serialNumberId: serial.id, claimType: 'SHOP', symptom: 'จอไม่ติด' }).expect(201);
    expect(res.body.id).toBeTruthy();
    expect((await prisma.serialNumber.findUniqueOrThrow({ where: { id: serial.id } })).status).toBe('CLAIMED');
  });
});
