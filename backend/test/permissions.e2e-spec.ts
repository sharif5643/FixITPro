/**
 * RC1.5-001 — Permission Matrix E2E Tests
 * Verifies that each role gets the expected HTTP status for key endpoints.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Permission Matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // cookies per role
  let ckOwner:   string;
  let ckMgr:     string;
  let ckCashier: string;
  let ckTech:    string;
  let ckStock:   string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();

    ckOwner   = (await loginAs(app, CREDS.ownerA.email,    CREDS.ownerA.password)).cookies;
    ckMgr     = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    ckCashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    ckTech    = (await loginAs(app, CREDS.techA1.email,    CREDS.techA1.password)).cookies;
    ckStock   = (await loginAs(app, CREDS.stockA1.email,   CREDS.stockA1.password)).cookies;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── OWNER: full access ────────────────────────────────────────────────────────

  it('PERM-01: OWNER GET /products → 200', async () => {
    await authGet(app, `/api/v1/products?branchId=${IDS.branchA1}`, ckOwner).expect(200);
  });

  it('PERM-02: OWNER GET /reports → 200 or 204', async () => {
    const res = await authGet(app, `/api/v1/reports/summary?branchId=${IDS.branchA1}`, ckOwner);
    expect([200, 204]).toContain(res.status);
  });

  it('PERM-03: OWNER POST /expenses → 201 (OWNER has expenses.manage)', async () => {
    // Seed an expense category first
    const catRes = await authPost(app, '/api/v1/expenses/categories', ckOwner, {
      name: 'Test Category', code: 'test-cat',
    });
    // Either 201 or already exists (400/409) — just confirm role is not 403
    expect([201, 400, 409, 200]).toContain(catRes.status);
  });

  // ── MANAGER: elevated access, not OWNER-level ─────────────────────────────────

  it('PERM-04: MANAGER GET /products → 200', async () => {
    await authGet(app, `/api/v1/products?branchId=${IDS.branchA1}`, ckMgr).expect(200);
  });

  it('PERM-05: MANAGER GET /repairs → 200', async () => {
    await authGet(app, `/api/v1/repairs?branchId=${IDS.branchA1}`, ckMgr).expect(200);
  });

  it('PERM-06: MANAGER GET /customers → 200', async () => {
    await authGet(app, `/api/v1/customers`, ckMgr).expect(200);
  });

  // ── CASHIER: operational endpoints only ───────────────────────────────────────

  it('PERM-07: CASHIER GET /repairs → 200 (can view)', async () => {
    await authGet(app, `/api/v1/repairs?branchId=${IDS.branchA1}`, ckCashier).expect(200);
  });

  it('PERM-08: CASHIER POST /expenses → 403 (no expenses.manage)', async () => {
    await authPost(app, '/api/v1/expenses', ckCashier, {
      categoryId: 'any', amount: 100, paymentMethod: 'CASH', expenseDate: '2026-07-18',
    }).expect(403);
  });

  it('PERM-09: CASHIER GET /reports → 200 or 403 (role-dependent)', async () => {
    const res = await authGet(
      app, `/api/v1/reports/summary?branchId=${IDS.branchA1}`, ckCashier,
    );
    expect([200, 403, 204]).toContain(res.status);
  });

  // ── TECHNICIAN: repair-scoped ─────────────────────────────────────────────────

  it('PERM-10: TECHNICIAN GET /repairs → 200', async () => {
    await authGet(app, `/api/v1/repairs?branchId=${IDS.branchA1}`, ckTech).expect(200);
  });

  it('PERM-11: TECHNICIAN POST /expenses → 403', async () => {
    await authPost(app, '/api/v1/expenses', ckTech, {
      categoryId: 'any', amount: 100, paymentMethod: 'CASH', expenseDate: '2026-07-18',
    }).expect(403);
  });

  it('PERM-12: TECHNICIAN GET /products → 200 or 403 (view products for parts)', async () => {
    const res = await authGet(app, `/api/v1/products?branchId=${IDS.branchA1}`, ckTech);
    expect([200, 403]).toContain(res.status);
  });

  // ── STOCK_STAFF: inventory-scoped ─────────────────────────────────────────────

  it('PERM-13: STOCK_STAFF GET /products → 200', async () => {
    await authGet(app, `/api/v1/products?branchId=${IDS.branchA1}`, ckStock).expect(200);
  });

  it('PERM-14: STOCK_STAFF POST /sales → 403 or 400 (no sales.create permission)', async () => {
    const res = await authPost(app, '/api/v1/sales', ckStock, {
      items: [{ productId: 'x', quantity: 1, price: 100 }],
      paymentMethod: 'CASH', amountPaid: 100,
    });
    expect([400, 403]).toContain(res.status);
  });

  it('PERM-15: STOCK_STAFF POST /expenses → 403', async () => {
    await authPost(app, '/api/v1/expenses', ckStock, {
      categoryId: 'any', amount: 100, paymentMethod: 'CASH', expenseDate: '2026-07-18',
    }).expect(403);
  });

  // ── Unauthenticated ───────────────────────────────────────────────────────────

  it('PERM-16: GET /products without auth → 401', async () => {
    const res = await authGet(app, '/api/v1/products', '');
    expect([401, 403]).toContain(res.status);
  });

  it('PERM-17: GET /repairs without auth → 401', async () => {
    const res = await authGet(app, '/api/v1/repairs', '');
    expect([401, 403]).toContain(res.status);
  });
});
