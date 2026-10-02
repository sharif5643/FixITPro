/**
 * Security / money fixes (2026-10):
 *  - refunds capped at what the customer paid
 *  - role permissions per tenant; per-user grants limited to own tenant
 *  - category types per tenant; shared types read-only for shops
 *  - owner-only carrier wallet balance adjustment
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import * as request from 'supertest';

const authPut = (app: INestApplication, path: string, cookies: string, body: object) =>
  request(app.getHttpServer()).put(path).set('Cookie', cookies).send(body);
const authDelete = (app: INestApplication, path: string, cookies: string) =>
  request(app.getHttpServer()).delete(path).set('Cookie', cookies);

describe('Security & money fixes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;
  let cashierA: string;
  const run = Date.now().toString(36);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    ownerB   = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    cashierA = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Refund caps ──────────────────────────────────────────────────────────────

  describe('refunds', () => {
    let shiftId: string;
    let saleId: string;
    let itemId: string;

    beforeAll(async () => {
      const current = await authGet(app, '/api/v1/shifts/current', ownerB);
      if (current.body?.id) {
        await authPost(app, `/api/v1/shifts/${current.body.id}/close`, ownerB, { closeBalance: 0, note: 'e2e cleanup' });
      }
      shiftId = (await authPost(app, '/api/v1/shifts/open', ownerB, { openBalance: 0 }).expect(201)).body.id;

      const cat = await authPost(app, '/api/v1/categories', ownerB, { name: `Refund cat ${run}` });
      const prod = await authPost(app, '/api/v1/products', ownerB, {
        name: `Refund product ${run}`, sku: `RF-${run}`, type: 'ACCESSORY', price: 100, costPrice: 50, stock: 10,
        branchId: IDS.branchB1, categoryId: cat.body.id,
      });
      const productId = prod.body?.id ?? prod.body?.product?.id;
      expect(productId).toBeDefined();

      // 2 × 100 with a 20-baht bill discount → customer paid 180 (90 per unit)
      const sale = await authPost(app, '/api/v1/sales', ownerB, {
        paymentMethod: 'CASH', amountPaid: 180, branchId: IDS.branchB1, discount: 20,
        items: [{ productId, quantity: 2, price: 100 }],
      });
      expect(sale.status).toBe(201);
      saleId = sale.body.id ?? sale.body.sale?.id;
      const detail = await authGet(app, `/api/v1/sales/${saleId}`, ownerB).expect(200);
      itemId = (detail.body.items ?? detail.body.sale?.items)[0].id;
    });

    afterAll(async () => {
      await authPost(app, `/api/v1/shifts/${shiftId}/close`, ownerB, { closeBalance: 0, note: 'e2e' });
    });

    const refund = (items: object[]) =>
      authPost(app, `/api/v1/sales/${saleId}/refund`, ownerB, { reason: 'e2e refund', paymentMethod: 'CASH', items });

    it('REF-01: refund price above the line price per unit → 400', async () => {
      const res = await refund([{ saleItemId: itemId, quantity: 1, refundPrice: 5000 }]);
      expect(res.status).toBe(400);
    });

    it('REF-02: same item listed twice cannot exceed the sold quantity → 400', async () => {
      const res = await refund([
        { saleItemId: itemId, quantity: 2, refundPrice: 1 },
        { saleItemId: itemId, quantity: 1, refundPrice: 1 },
      ]);
      expect(res.status).toBe(400);
    });

    it('REF-03: total refunds cannot exceed what the customer paid', async () => {
      await refund([{ saleItemId: itemId, quantity: 1, refundPrice: 100 }]).expect(201);
      // 100 already refunded of 180 paid → another 100 exceeds the bill
      const res = await refund([{ saleItemId: itemId, quantity: 1, refundPrice: 100 }]);
      expect(res.status).toBe(400);
      // the remaining 80 is allowed
      await refund([{ saleItemId: itemId, quantity: 1, refundPrice: 80 }]).expect(201);
    });
  });

  // ── Role permissions per tenant ──────────────────────────────────────────────

  describe('role permissions', () => {
    const cashierPerms = async (cookies: string) => {
      const res = await authGet(app, '/api/v1/permissions/roles', cookies).expect(200);
      return res.body.find((r: any) => r.role === 'CASHIER').permissions as string[];
    };

    it('PERM-01: owner A changing CASHIER permissions does not affect tenant B', async () => {
      const beforeB = await cashierPerms(ownerB);
      const enable  = !beforeB.includes('reports.view');

      await authPut(app, '/api/v1/permissions/roles/CASHIER/toggle', ownerA, { permission: 'reports.view', enabled: enable }).expect(200);

      expect((await cashierPerms(ownerA)).includes('reports.view')).toBe(enable);
      expect((await cashierPerms(ownerB)).sort()).toEqual([...beforeB].sort());
    });

    it('PERM-02: tenant A role change applies to tenant A users at login', async () => {
      await authPut(app, '/api/v1/permissions/roles/CASHIER', ownerA, { permissions: ['products.view', 'reports.view'] }).expect(200);
      const login = await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password);
      const me = await authGet(app, '/api/v1/auth/me', login.cookies).expect(200);
      const perms: string[] = me.body.permissions ?? me.body.user?.permissions ?? [];
      expect(perms).toEqual(expect.arrayContaining(['products.view', 'reports.view']));
      expect(perms).not.toContain('sales.create');
      // restore defaults for other suites
      await authPost(app, '/api/v1/permissions/roles/CASHIER/apply-preset', ownerA, {});
    });

    it('PERM-03: owner B cannot grant or revoke permissions of a tenant A user', async () => {
      await authPost(app, `/api/v1/permissions/users/${IDS.userCashierA1}`, ownerB, { permission: 'reports.view' }).expect(403);
      await authDelete(app, `/api/v1/permissions/users/${IDS.userCashierA1}/reports.view`, ownerB).expect(403);
    });
  });

  // ── Category types per tenant ────────────────────────────────────────────────

  describe('category types', () => {
    let typeA: string;
    let sharedTypeId: string;

    beforeAll(async () => {
      const shared = await prisma.categoryType.create({ data: { name: `Shared ${run}`, slug: `shared-${run}` } });
      sharedTypeId = shared.id;
      typeA = (await authPost(app, '/api/v1/categories/types', ownerA, { name: `Type A ${run}` }).expect(201)).body.id;
    });

    afterAll(async () => {
      await prisma.categoryType.deleteMany({ where: { id: { in: [sharedTypeId, typeA].filter(Boolean) } } });
    });

    it('CAT-01: a type created by tenant A is not visible to tenant B', async () => {
      const listB = await authGet(app, '/api/v1/categories/types', ownerB).expect(200);
      const ids = listB.body.map((t: any) => t.id);
      expect(ids).not.toContain(typeA);
      expect(ids).toContain(sharedTypeId);
    });

    it('CAT-02: tenant B cannot rename or delete tenant A type', async () => {
      await authPut(app, `/api/v1/categories/types/${typeA}`, ownerB, { name: 'hacked' }).expect(404);
      await authDelete(app, `/api/v1/categories/types/${typeA}`, ownerB).expect(404);
    });

    it('CAT-03: shops cannot rename shared types; a cashier cannot either', async () => {
      await authPut(app, `/api/v1/categories/types/${sharedTypeId}`, ownerA, { name: 'renamed' }).expect(403);
      await authPut(app, `/api/v1/categories/types/${sharedTypeId}`, cashierA, { name: 'renamed' }).expect(403);
    });

    it('CAT-04: tenant A can rename its own type', async () => {
      await authPut(app, `/api/v1/categories/types/${typeA}`, ownerA, { name: `Type A2 ${run}` }).expect(200);
    });
  });

  // ── Owner wallet adjustment ──────────────────────────────────────────────────

  describe('wallet adjustment', () => {
    const balance = async (cookies: string, carrier: string) =>
      (await authGet(app, '/api/v1/carrier-wallet/balances', cookies).expect(200)).body.find((w: any) => w.carrier === carrier).balance;

    it('ADJ-01: owner can clear a wallet to 0; it is kept in history', async () => {
      await authPost(app, '/api/v1/carrier-wallet/topup', ownerA, { carrier: 'TRUE', amount: 999 }).expect(201);
      const res = await authPost(app, '/api/v1/carrier-wallet/adjust', ownerA, {
        carrier: 'TRUE', newBalance: 0, reason: 'ล้างยอดทดลอง',
      }).expect(201);
      expect(res.body.balance).toBe(0);
      expect(await balance(ownerA, 'TRUE')).toBe(0);

      const moves = (await authGet(app, '/api/v1/carrier-wallet/movements?carrier=TRUE', ownerA).expect(200)).body;
      expect(moves[0]).toMatchObject({ type: 'ADJUSTMENT', balanceAfter: 0 });
      expect(moves[0].note).toContain('ล้างยอดทดลอง');
    });

    it('ADJ-02: non-owners cannot adjust; reason is required', async () => {
      await authPost(app, '/api/v1/carrier-wallet/adjust', cashierA, { carrier: 'TRUE', newBalance: 100, reason: 'x' }).expect(403);
      await authPost(app, '/api/v1/carrier-wallet/adjust', ownerA, { carrier: 'TRUE', newBalance: 100, reason: '  ' }).expect(400);
    });

    it('ADJ-03: adjusting tenant A wallet does not touch tenant B', async () => {
      const beforeB = await balance(ownerB, 'NT');
      await authPost(app, '/api/v1/carrier-wallet/adjust', ownerA, { carrier: 'NT', newBalance: 1234, reason: 'e2e' }).expect(201);
      expect(await balance(ownerB, 'NT')).toBe(beforeB);
    });
  });
});
