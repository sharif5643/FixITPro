/**
 * - "Forgot password" (staff app) must not change the password. It used to overwrite it
 *   with a temp password nobody ever saw, so anyone who knew an email could lock that
 *   account out. Now it only notifies the shop owner.
 * - Stock transfers: another shop's owner must not dispatch / receive / cancel a transfer.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Account & transfer safety (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;
  const run = Date.now().toString(36);

  const patch = (path: string, cookie: string, body: object = {}) =>
    request(app.getHttpServer()).patch(path).set('Cookie', cookie).send(body);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('ACC-01: forgot-password keeps the password and notifies the owner', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: IDS.userCashierA1 } });
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: CREDS.cashierA1.email })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: IDS.userCashierA1 } });
    expect(after.password).toBe(before.password);
    expect(after.forcePasswordChange).toBe(before.forcePasswordChange);

    const notif = await prisma.notification.findFirst({
      where: { type: 'PASSWORD_RESET_REQUEST', entityId: IDS.userCashierA1, tenantId: IDS.tenantA },
    });
    expect(notif).not.toBeNull();
  });

  it('TRF-01: another shop cannot dispatch, receive or cancel a transfer', async () => {
    const cat = (await authPost(app, '/api/v1/categories', ownerA, { name: `Trf cat ${run}` })).body.id;
    const product = (await authPost(app, '/api/v1/products', ownerA, {
      name: `Trf item ${run}`, sku: `TRF-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 5,
      branchId: IDS.branchA1, categoryId: cat,
    }).expect(201)).body;
    const productId = product.id ?? product.product?.id;

    const transfer = (await authPost(app, '/api/v1/branches/transfers', ownerA, {
      fromBranchId: IDS.branchA1, toBranchId: IDS.branchA2, productId, quantity: 1,
    }).expect(201)).body;
    await patch(`/api/v1/branches/transfers/${transfer.id}/approve`, ownerA).expect(200);

    await patch(`/api/v1/branches/transfers/${transfer.id}/dispatch`, ownerB).expect(403);
    await patch(`/api/v1/branches/transfers/${transfer.id}/cancel`, ownerB, { reason: 'x' }).expect(403);
    expect((await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status).toBe('APPROVED');

    await patch(`/api/v1/branches/transfers/${transfer.id}/dispatch`, ownerA).expect(200);
    await patch(`/api/v1/branches/transfers/${transfer.id}/receive`, ownerB).expect(403);
    await patch(`/api/v1/branches/transfers/${transfer.id}/receive`, ownerA).expect(200);
  });

  it('TRF-02: next stock code of another shop branch is not found', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${IDS.branchA1}/stock/next-code`).set('Cookie', ownerB)
      .expect((r) => expect([403, 404]).toContain(r.status));
  });
});
