/**
 * Features the website promises, working end to end:
 *  - products carry a brand and a model, searchable and filterable
 *  - the customer signs a repair on the screen; the signature comes back with the job
 *  - a sale's receipt opens online from its QR link (signed), and only with the right link
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

// A tiny real PNG (1×1 white pixel)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

describe('Promised features (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  const run = Date.now().toString(36).toUpperCase();
  let shiftOpened = false;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    const cur = (await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body;
    if (!cur?.id) {
      await authPost(app, '/api/v1/shifts/open', owner, { openBalance: 0 }).expect(201);
      shiftOpened = true;
    }
  });

  afterAll(async () => {
    if (shiftOpened) {
      const cur = (await authGet(app, '/api/v1/shifts/current', owner)).body;
      if (cur?.id) await authPost(app, `/api/v1/shifts/${cur.id}/close`, owner, { closeBalance: 0, note: 'e2e' });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PF-01: a product keeps its brand and model; search and the brand filter find it', async () => {
    const p = (await authPost(app, '/api/v1/products', owner, {
      name: `เคสใส ${run}`, sku: `CASE-${run}`, type: 'ACCESSORY', price: 199, costPrice: 50,
      brand: '  Apple ', model: 'iPhone 15', branchId: IDS.branchA1,
    }).expect(201)).body;
    expect(p).toMatchObject({ brand: 'Apple', model: 'iPhone 15' });

    const bySearch = (await authGet(app, `/api/v1/products?search=iphone 15`, owner).expect(200)).body;
    expect((Array.isArray(bySearch) ? bySearch : bySearch.items).some((x: any) => x.id === p.id)).toBe(true);
    const byBrand = (await authGet(app, `/api/v1/products?brand=apple`, owner).expect(200)).body;
    const list = Array.isArray(byBrand) ? byBrand : byBrand.items;
    expect(list.some((x: any) => x.id === p.id)).toBe(true);
    expect(list.every((x: any) => (x.brand ?? '').toLowerCase() === 'apple')).toBe(true);
    expect((await authGet(app, '/api/v1/products/brands', owner).expect(200)).body).toContain('Apple');

    // Empty clears it; left out keeps it
    await authPatch(app, `/api/v1/products/${p.id}`, owner, { model: '' }).expect(200);
    const after = await prisma.product.findUnique({ where: { id: p.id }, select: { brand: true, model: true } });
    expect(after).toEqual({ brand: 'Apple', model: null });
  });

  it('PF-02: the customer signs on the screen; signing again replaces it; bad images are refused', async () => {
    const repair = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Samsung', deviceModel: `A55 ${run}`, issue: 'จอแตก', estimateCost: 1500, branchId: IDS.branchA1,
    }).expect(201)).body;

    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, owner, { kind: 'INTAKE', image: 'data:text/html;base64,PHNjcmlwdD4=' }).expect(400);
    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, owner, { kind: 'OTHER', image: PNG }).expect(400);
    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, owner, { kind: 'INTAKE', image: PNG, signerName: 'สมชาย' }).expect(201);
    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, owner, { kind: 'INTAKE', image: PNG, signerName: 'สมชาย ใจดี' }).expect(201);
    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, owner, { kind: 'APPROVAL', image: PNG }).expect(201);

    const job = (await authGet(app, `/api/v1/repairs/${repair.id}`, owner).expect(200)).body;
    expect(job.signatures).toHaveLength(2);
    expect(job.signatures.find((s: any) => s.kind === 'INTAKE')).toMatchObject({ image: PNG, signerName: 'สมชาย ใจดี' });

    // Lists stay light: no signature pictures there
    const list = (await authGet(app, '/api/v1/repairs?limit=5', owner).expect(200)).body;
    const rows = Array.isArray(list) ? list : list.items ?? list.data ?? [];
    expect(rows.every((r: any) => r.signatures === undefined)).toBe(true);

    // Another shop cannot sign it
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, ownerB, { kind: 'INTAKE', image: PNG }).expect(404);
  });

  it('PF-03: the receipt opens online with its link only; no costs or customer phone in it', async () => {
    const product = await prisma.product.create({ data: {
      name: `สายชาร์จ ${run}`, sku: `CBL-${run}`, type: 'ACCESSORY', price: 150, costPrice: 40, tenantId: IDS.tenantA,
    } as any });
    await prisma.branchStock.create({ data: { productId: product.id, branchId: IDS.branchA1, quantity: 5 } });
    const sale = (await authPost(app, '/api/v1/sales', owner, {
      paymentMethod: 'CASH', amountPaid: 200, branchId: IDS.branchA1,
      customerName: `ลูกค้า ${run}`, customerPhone: '0812345678',
      items: [{ productId: product.id, quantity: 1, price: 150 }],
    }).expect(201)).body;
    expect(sale.receiptPath).toMatch(new RegExp(`^/r/${sale.id}/[A-Za-z0-9_-]{22}$`));

    const [, , id, token] = sale.receiptPath.split('/');
    const res = await request(app.getHttpServer()).get(`/api/v1/public/receipts/${id}/${token}`).expect(200);
    expect(res.body).toMatchObject({ receiptNumber: sale.receiptNumber });
    expect(Number(res.body.total)).toBe(150);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('costPrice');
    expect(text).not.toContain('0812345678');

    await request(app.getHttpServer()).get(`/api/v1/public/receipts/${id}/${token.slice(0, -1)}x`).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/public/receipts/${id}/short`).expect(404);

    // Same link from the sale itself (reprints)
    expect((await authGet(app, `/api/v1/sales/${sale.id}`, owner).expect(200)).body.receiptPath).toBe(sale.receiptPath);

    // A customer who did not link LINE: a clear message instead of a silent no-op
    const line = await authPost(app, `/api/v1/sales/${sale.id}/send-line`, owner, {}).expect(400);
    expect(line.body.message).toContain('LINE');
  });
});
