/**
 * Stock consistency (customer report 2026-09: "phone count sometimes right, sometimes
 * more; phone in the cabinet but the system says none").
 *  - editing a product must not overwrite its stock total
 *  - CSV-imported stock must land in a branch so the POS can sell it
 *  - a refunded serialized phone must become sellable (IN_STOCK) again
 *  - "set to counted quantity" via ADJUST keeps branch and total in sync
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Stock consistency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  let shiftId: string;
  let categoryId: string;
  const run = Date.now().toString(36);

  const branchQty = async (productId: string) =>
    (await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId: IDS.branchB1, productId } } }))?.quantity ?? 0;
  const total = async (productId: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  const createProduct = async (sku: string, extra: object = {}) => {
    const res = await authPost(app, '/api/v1/products', ownerB, {
      name: `Phone ${sku}`, sku, type: 'PHONE', price: 1000, costPrice: 800, stock: 3,
      branchId: IDS.branchB1, categoryId, ...extra,
    });
    expect(res.status).toBe(201);
    return res.body.id ?? res.body.product?.id;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;

    const current = await authGet(app, '/api/v1/shifts/current', ownerB);
    if (current.body?.id) {
      await authPost(app, `/api/v1/shifts/${current.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
    }
    shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;
    categoryId = (await authPost(app, '/api/v1/categories', ownerB, { name: `Stock cat ${run}` })).body.id;
  });

  afterAll(async () => {
    await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    await app.close();
    await prisma.$disconnect();
  });

  it('STK-01: editing a product (with a stock field) does not change its stock', async () => {
    const id = await createProduct(`STK1-${run}`);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`).set('Cookie', ownerB)
      .send({ name: 'Renamed', price: 1100, stock: 99 });
    expect(res.status).toBe(200);
    expect(await total(id)).toBe(3);
    expect(await branchQty(id)).toBe(3);
  });

  it('STK-02: CSV-imported stock is placed in a branch and can be sold', async () => {
    const sku = `STK2-${run}`;
    const csv = `name,sku,barcode,type,price,cost,stock,minStock\nImported ${sku},${sku},,ACCESSORY,50,20,4,0\n`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/data/import/products').set('Cookie', ownerB)
      .attach('file', Buffer.from(csv), { filename: 'products.csv', contentType: 'text/csv' });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);

    const product = await prisma.product.findFirstOrThrow({ where: { sku, tenantId: IDS.tenantB } });
    expect(product.stock).toBe(4);
    expect(await branchQty(product.id)).toBe(4);

    const sale = await authPost(app, '/api/v1/sales', ownerB, {
      paymentMethod: 'CASH', amountPaid: 50, branchId: IDS.branchB1,
      items: [{ productId: product.id, quantity: 1, price: 50 }],
    });
    expect(sale.status).toBe(201);
    expect(await branchQty(product.id)).toBe(3);
    expect(await total(product.id)).toBe(3);
  });

  it('STK-03: a refunded phone (IMEI) is back IN_STOCK and sellable again', async () => {
    const id = await createProduct(`STK3-${run}`, { hasSerial: true, stock: 1 });
    const serial = await authPost(app, '/api/v1/serials', ownerB, { serial: `IMEI${run}`, productId: id });
    expect(serial.status).toBe(201);

    const sale = await authPost(app, '/api/v1/sales', ownerB, {
      paymentMethod: 'CASH', amountPaid: 1000, branchId: IDS.branchB1,
      items: [{ productId: id, quantity: 1, price: 1000, serialIds: [serial.body.id] }],
    });
    expect(sale.status).toBe(201);
    const saleId = sale.body.id ?? sale.body.sale?.id;
    const detail = await authGet(app, `/api/v1/sales/${saleId}`, ownerB).expect(200);
    const itemId = (detail.body.items ?? detail.body.sale?.items)[0].id;
    expect((await prisma.serialNumber.findUniqueOrThrow({ where: { id: serial.body.id } })).status).toBe('SOLD');

    await authPost(app, `/api/v1/sales/${saleId}/refund`, ownerB, {
      reason: 'e2e refund', paymentMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1, refundPrice: 1000 }],
    }).expect(201);

    const after = await prisma.serialNumber.findUniqueOrThrow({ where: { id: serial.body.id } });
    expect(after.status).toBe('IN_STOCK');
    expect(after.saleItemId).toBeNull();
    expect(await branchQty(id)).toBe(1);

    // and it can be sold again with the same IMEI
    await authPost(app, '/api/v1/sales', ownerB, {
      paymentMethod: 'CASH', amountPaid: 1000, branchId: IDS.branchB1,
      items: [{ productId: id, quantity: 1, price: 1000, serialIds: [serial.body.id] }],
    }).expect(201);
  });

  it('STK-04: ADJUST to a counted quantity updates branch and total together', async () => {
    const id = await createProduct(`STK4-${run}`, { stock: 5 });
    // counted 2 → delta −3
    await authPost(app, '/api/v1/stock/adjust', ownerB, {
      productId: id, type: 'ADJUST', quantity: -3, branchId: IDS.branchB1, note: 'นับจริง',
    }).expect(201);
    expect(await branchQty(id)).toBe(2);
    expect(await total(id)).toBe(2);
  });
});
