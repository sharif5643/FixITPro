/**
 * Phones sold by IMEI: when part of a line comes back, the IMEIs of the phones that came back go
 * back in stock with them, so the shop never ends up with a phone it cannot sell (stock with no
 * IMEI). And a product with stock that has no IMEIs cannot be switched to "sold by IMEI".
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authPost } from './helpers/auth.helper';
import { ensureInShift } from './helpers/shift.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('IMEI stock stays in step on refunds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  const run = Date.now().toString(36);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    await ensureInShift(app, owner);
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  const inStock = (productId: string) => prisma.serialNumber.count({ where: { productId, status: 'IN_STOCK' } });
  const stock = async (productId: string) =>
    (await prisma.branchStock.findFirstOrThrow({ where: { productId, branchId: IDS.branchB1 } })).quantity;

  it('IMEI-01: returning one of two phones brings its IMEI back, and only that one', async () => {
    const [a, b] = [`IA${run}`, `IB${run}`];
    const p = (await authPost(app, '/api/v1/products', owner, {
      name: `Phone IMEI ${run}`, sku: `IM-${run}`, type: 'PHONE', price: 5000, costPrice: 4000,
      stock: 2, hasSerial: true, initialSerials: [a, b], branchId: IDS.branchB1,
    }).expect(201)).body;
    const productId = p.id ?? p.product?.id;
    const serials = await prisma.serialNumber.findMany({ where: { productId }, orderBy: { serial: 'asc' } });
    const sale = (await authPost(app, '/api/v1/sales', owner, {
      branchId: IDS.branchB1, paymentMethod: 'CASH', amountPaid: 10000,
      items: [{ productId, quantity: 2, price: 5000, serialIds: serials.map((s) => s.id) }],
    }).expect(201)).body;
    const saleId = sale.id ?? sale.sale?.id;
    const line = await prisma.saleItem.findFirstOrThrow({ where: { saleId } });
    expect(await inStock(productId)).toBe(0);

    // part of the line without saying which phone: refused, nothing changes
    await authPost(app, `/api/v1/sales/${saleId}/refund`, owner, {
      reason: 'ลูกค้าคืน 1 เครื่อง', paymentMethod: 'CASH', items: [{ saleItemId: line.id, quantity: 1, refundPrice: 5000 }],
    }).expect(400);
    expect(await stock(productId)).toBe(0);

    await authPost(app, `/api/v1/sales/${saleId}/refund`, owner, {
      reason: 'ลูกค้าคืน 1 เครื่อง', paymentMethod: 'CASH',
      items: [{ saleItemId: line.id, quantity: 1, refundPrice: 5000, serials: [b] }],
    }).expect(201);
    expect(await stock(productId)).toBe(1);
    expect(await inStock(productId)).toBe(1);
    expect((await prisma.serialNumber.findUniqueOrThrow({ where: { serial: b } })).status).toBe('IN_STOCK');
    expect((await prisma.serialNumber.findUniqueOrThrow({ where: { serial: a } })).status).not.toBe('IN_STOCK');

    // the last phone of the line: no need to say which
    await authPost(app, `/api/v1/sales/${saleId}/refund`, owner, {
      reason: 'คืนอีกเครื่อง', paymentMethod: 'CASH', items: [{ saleItemId: line.id, quantity: 1, refundPrice: 5000 }],
    }).expect(201);
    expect(await stock(productId)).toBe(2);
    expect(await inStock(productId)).toBe(2);
  });

  it('IMEI-02: stock without IMEIs cannot be switched to "sold by IMEI"', async () => {
    const p = (await authPost(app, '/api/v1/products', owner, {
      name: `Case ${run}`, sku: `CS-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 3, branchId: IDS.branchB1,
    }).expect(201)).body;
    const id = p.id ?? p.product?.id;
    const res = await request(app.getHttpServer()).put(`/api/v1/products/${id}`).set('Cookie', owner).send({ hasSerial: true });
    expect([400, 404]).toContain(res.status);
    if (res.status === 404) {
      await request(app.getHttpServer()).patch(`/api/v1/products/${id}`).set('Cookie', owner).send({ hasSerial: true }).expect(400);
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).hasSerial).toBe(false);
  });
});
