/**
 * A product can be created without a sub-category (the form sends categoryId ""), which used to
 * fail with a 500 (foreign key). Another shop's category is refused with a clear message.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Products: empty or foreign category (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerB: string;
  const run = Date.now().toString(36);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PC-01: no category ("") creates the product; "" on edit clears it', async () => {
    const res = await authPost(app, '/api/v1/products', ownerB, {
      name: `NoCat ${run}`, sku: `NOCAT-${run}`, type: 'ACCESSORY', price: 100, costPrice: 40,
      stock: 3, branchId: IDS.branchB1, categoryId: '',
    }).expect(201);
    const id = res.body.id ?? res.body.product?.id;
    expect((await prisma.product.findUnique({ where: { id } }))?.categoryId).toBeNull();

    const cat = (await authPost(app, '/api/v1/categories', ownerB, { name: `Cat ${run}` }).expect(201)).body.id;
    await authPatch(app, `/api/v1/products/${id}`, ownerB, { categoryId: cat }).expect(200);
    expect((await prisma.product.findUnique({ where: { id } }))?.categoryId).toBe(cat);
    await authPatch(app, `/api/v1/products/${id}`, ownerB, { categoryId: '' }).expect(200);
    expect((await prisma.product.findUnique({ where: { id } }))?.categoryId).toBeNull();
  });

  it('PC-02: another shop\'s category is refused with a message, not a server error', async () => {
    const other = await prisma.category.create({ data: { name: `Other ${run}`, slug: `other-${run}`, tenantId: IDS.tenantA } });
    const res = await authPost(app, '/api/v1/products', ownerB, {
      name: `Foreign ${run}`, sku: `FOR-${run}`, type: 'ACCESSORY', price: 100, costPrice: 40,
      branchId: IDS.branchB1, categoryId: other.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('หมวดหมู่');
  });
});
