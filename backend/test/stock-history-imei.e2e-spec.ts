/**
 * Stock audit fixes (2026-10):
 *  - every way stock appears leaves a movement, so the stock card explains the balance:
 *    opening stock when a product is created, stock added when a branch starts carrying it,
 *    and a count set by hand on the branch page
 *  - a product sold by IMEI moves only with its IMEIs: in with new IMEIs, out by picking which
 *    ones, never "set to a count"; units with no IMEI recorded (older data) may still go out
 *  - the mismatch list shows products whose count and in-stock IMEIs disagree
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Stock history and IMEI-tied stock (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  const run = Date.now().toString(36).toUpperCase();
  const imei = (n: number) => `35${run}${String(n).padStart(4, '0')}`;

  const movements = (productId: string) =>
    prisma.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } });
  const branchQty = async (productId: string, branchId = IDS.branchA1) =>
    (await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId, productId } } }))?.quantity ?? 0;
  const inStock = (productId: string) => prisma.serialNumber.count({ where: { productId, status: 'IN_STOCK' } });
  const create = (sku: string, extra: object = {}) =>
    authPost(app, '/api/v1/products', owner, {
      name: `${sku} ${run}`, sku: `${sku}-${run}`, type: 'PHONE', price: 9000, costPrice: 7000,
      branchId: IDS.branchA1, ...extra,
    });

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SH-01: opening stock of a new product is recorded as a movement with its cost', async () => {
    const res = await create('CASE', { type: 'ACCESSORY', price: 199, costPrice: 60, stock: 7 });
    expect(res.status).toBe(201);
    const list = await movements(res.body.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'IN', quantity: 7, branchId: IDS.branchA1 });
    expect(Number(list[0].unitCost)).toBe(60);
  });

  it('SH-02: a branch starting to carry a product, and a count set by hand, both leave a movement', async () => {
    const id = (await create('CABLE', { type: 'ACCESSORY', price: 99, costPrice: 30, stock: 2 }).expect(201)).body.id;
    await authPost(app, `/api/v1/products/${id}/enroll-branch`, owner, { branchId: IDS.branchA2, quantity: 4 }).expect(201);
    expect(await branchQty(id, IDS.branchA2)).toBe(4);

    await authPost(app, `/api/v1/branches/${IDS.branchA2}/stock`, owner, { productId: id, quantity: 1 }).expect(201);
    expect(await branchQty(id, IDS.branchA2)).toBe(1);

    const list = (await movements(id)).filter((m) => m.branchId === IDS.branchA2);
    expect(list.map((m) => [m.type, m.quantity])).toEqual([['IN', 4], ['ADJUST', -3]]);
    // The movements add up to what is on the shelf
    expect(list.reduce((s, m) => s + m.quantity, 0)).toBe(1);
  });

  it('SH-03: a phone sold by IMEI is created with one IMEI per unit, never without', async () => {
    const missing = await create('PH-A', { hasSerial: true, stock: 2, initialSerials: [imei(1)] });
    expect(missing.status).toBe(400);
    expect(await prisma.product.count({ where: { sku: `PH-A-${run}` } })).toBe(0);

    const ok = await create('PH-B', { hasSerial: true, stock: 2, initialSerials: [imei(2), ` ${imei(3)} `] });
    expect(ok.status).toBe(201);
    expect(await branchQty(ok.body.id)).toBe(2);
    expect(await inStock(ok.body.id)).toBe(2);
    expect((await movements(ok.body.id))[0].note).toContain(imei(3));

    // An IMEI already in the system cannot come in again
    const dup = await create('PH-C', { hasSerial: true, stock: 1, initialSerials: [imei(2)] });
    expect(dup.status).toBe(400);
  });

  it('SH-04: IMEI stock comes in with IMEIs, goes out by picking them, and cannot be set to a count', async () => {
    const id = (await create('PH-D', { hasSerial: true, stock: 1, initialSerials: [imei(10)] }).expect(201)).body.id;
    const adjust = (body: object) => authPost(app, '/api/v1/stock/adjust', owner, { productId: id, branchId: IDS.branchA1, ...body });

    expect((await adjust({ type: 'IN', quantity: 2 })).status).toBe(400);
    expect((await adjust({ type: 'IN', quantity: 2, serials: [imei(11), imei(11)] })).status).toBe(400);
    await adjust({ type: 'IN', quantity: 2, serials: [imei(11), imei(12)] }).expect(201);
    expect(await branchQty(id)).toBe(3);
    expect(await inStock(id)).toBe(3);

    expect((await adjust({ type: 'ADJUST', quantity: -1 })).status).toBe(400);
    expect((await adjust({ type: 'OUT', quantity: 1 })).status).toBe(400);

    const s11 = await prisma.serialNumber.findUniqueOrThrow({ where: { serial: imei(11) } });
    await adjust({ type: 'OUT', quantity: 1, serialIds: [s11.id], note: 'จอแตก' }).expect(201);
    expect(await branchQty(id)).toBe(2);
    expect(await inStock(id)).toBe(2);
    expect((await prisma.serialNumber.findUniqueOrThrow({ where: { id: s11.id } })).status).toBe('DEFECTIVE');
    // Picking the same IMEI again (already out) is refused
    expect((await adjust({ type: 'OUT', quantity: 1, serialIds: [s11.id] })).status).toBe(400);

    const set = await authPost(app, `/api/v1/branches/${IDS.branchA1}/stock`, owner, { productId: id, quantity: 9 });
    expect(set.status).toBe(400);
    expect(await branchQty(id)).toBe(2);
  });

  it('SH-05: the mismatch list shows count vs IMEI drift; units with no IMEI can go out to fix it', async () => {
    // Older data: a phone counted in stock with no IMEI recorded
    const p = await prisma.product.create({ data: {
      name: `PH-OLD ${run}`, sku: `PH-OLD-${run}`, type: 'PHONE', price: 5000, costPrice: 4000,
      stock: 3, hasSerial: true, tenantId: IDS.tenantA,
    } as any });
    await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: 3 } });
    await prisma.serialNumber.create({ data: { serial: imei(20), productId: p.id, status: 'IN_STOCK' } });

    const rows = (await authGet(app, '/api/v1/stock/serial-mismatch', owner).expect(200)).body;
    const row = rows.find((r: { productId: string }) => r.productId === p.id);
    expect(row).toMatchObject({ units: 3, serialsInStock: 1 });

    // Two units have no IMEI: up to two may leave without one, not three
    const adjust = (body: object) => authPost(app, '/api/v1/stock/adjust', owner, { productId: p.id, branchId: IDS.branchA1, ...body });
    expect((await adjust({ type: 'OUT', quantity: 3 })).status).toBe(400);
    await adjust({ type: 'OUT', quantity: 2, note: 'ไม่มีของจริง' }).expect(201);
    expect(await branchQty(p.id)).toBe(1);
    expect(await inStock(p.id)).toBe(1);

    const after = (await authGet(app, '/api/v1/stock/serial-mismatch', owner).expect(200)).body;
    expect(after.map((r: { productId: string }) => r.productId)).not.toContain(p.id);

    // Another shop never sees this shop's products
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const other = (await authGet(app, '/api/v1/stock/serial-mismatch', ownerB).expect(200)).body;
    expect(JSON.stringify(other)).not.toContain(run);
  });
});
