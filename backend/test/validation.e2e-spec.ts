/**
 * RC1.5-001 — DTO Validation E2E Tests
 * Ensures the ValidationPipe returns 400 for bad input across all major endpoints.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authPost } from './helpers/auth.helper';
import { CREDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('DTO Validation (e2e)', () => {
  let app:    INestApplication;
  let prisma: PrismaClient;
  let ownerCookies: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerCookies = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────────

  it('VAL-01: POST /auth/login — missing email → 400', async () => {
    await authPost(app, '/api/v1/auth/login', '', { password: 'anything' }).expect(400);
  });

  it('VAL-02: POST /auth/login — missing password → 400', async () => {
    await authPost(app, '/api/v1/auth/login', '', { email: 'test@test.com' }).expect(400);
  });

  it('VAL-03: POST /auth/login — empty body → 400', async () => {
    await authPost(app, '/api/v1/auth/login', '', {}).expect(400);
  });

  // ── Repairs ───────────────────────────────────────────────────────────────────

  it('VAL-04: POST /repairs — missing deviceBrand → 400', async () => {
    await authPost(app, '/api/v1/repairs', ownerCookies, {
      deviceModel: 'X', issue: 'broken',
    }).expect(400);
  });

  it('VAL-05: POST /repairs — missing issue → 400', async () => {
    await authPost(app, '/api/v1/repairs', ownerCookies, {
      deviceBrand: 'Apple', deviceModel: 'iPhone',
    }).expect(400);
  });

  it('VAL-06: POST /repairs — negative estimateCost → 400', async () => {
    await authPost(app, '/api/v1/repairs', ownerCookies, {
      deviceBrand: 'Apple', deviceModel: 'iPhone',
      issue: 'screen', estimateCost: -100,
    }).expect(400);
  });

  // ── Expenses ──────────────────────────────────────────────────────────────────

  it('VAL-07: POST /expenses — missing amount → 400', async () => {
    await authPost(app, '/api/v1/expenses', ownerCookies, {
      categoryId: 'some-id',
      description: 'Test',
      paymentMethod: 'CASH',
      expenseDate: '2026-07-18',
    }).expect(400);
  });

  it('VAL-08: POST /expenses — invalid paymentMethod enum → 400', async () => {
    await authPost(app, '/api/v1/expenses', ownerCookies, {
      categoryId: 'some-id',
      amount: 100,
      description: 'Test',
      paymentMethod: 'BITCOIN',
      expenseDate: '2026-07-18',
    }).expect(400);
  });

  it('VAL-09: POST /expenses — amount = 0 (below Min(0.01)) → 400', async () => {
    await authPost(app, '/api/v1/expenses', ownerCookies, {
      categoryId: 'some-id',
      amount: 0,
      description: 'Zero amount',
      paymentMethod: 'CASH',
      expenseDate: '2026-07-18',
    }).expect(400);
  });

  it('VAL-10: POST /expenses — missing expenseDate → 400', async () => {
    await authPost(app, '/api/v1/expenses', ownerCookies, {
      categoryId: 'some-id',
      amount: 100,
      description: 'No date',
      paymentMethod: 'CASH',
    }).expect(400);
  });

  it('VAL-11: POST /expenses — description exceeds MaxLength(255) → 400', async () => {
    await authPost(app, '/api/v1/expenses', ownerCookies, {
      categoryId: 'some-id',
      amount: 100,
      description: 'x'.repeat(300),
      paymentMethod: 'CASH',
      expenseDate: '2026-07-18',
    }).expect(400);
  });

  // ── Sales ─────────────────────────────────────────────────────────────────────

  it('VAL-12: POST /sales — missing paymentMethod → 400', async () => {
    await authPost(app, '/api/v1/sales', ownerCookies, {
      items: [{ productId: 'any', quantity: 1, price: 100 }],
      amountPaid: 100,
    }).expect(400);
  });

  it('VAL-13: POST /sales — item with negative price → 400', async () => {
    await authPost(app, '/api/v1/sales', ownerCookies, {
      paymentMethod: 'CASH',
      amountPaid: 0,
      items: [{ productId: 'any', quantity: 1, price: -1 }],
    }).expect(400);
  });

  it('VAL-14: POST /sales — item with zero quantity → 400', async () => {
    await authPost(app, '/api/v1/sales', ownerCookies, {
      paymentMethod: 'CASH',
      amountPaid: 0,
      items: [{ productId: 'any', quantity: 0, price: 100 }],
    }).expect(400);
  });

  // ── Cash Drawer ───────────────────────────────────────────────────────────────

  it('VAL-15: POST /cash-drawer/session/open — missing openingAmount → 400', async () => {
    await authPost(app, '/api/v1/cash-drawer/session/open', ownerCookies, {}).expect(400);
  });

  it('VAL-16: POST /cash-drawer/session/open — negative openingAmount → 400', async () => {
    await authPost(app, '/api/v1/cash-drawer/session/open', ownerCookies, {
      openingAmount: -100,
    }).expect(400);
  });

  // ── Expense Categories ────────────────────────────────────────────────────────

  it('VAL-17: POST /expenses/categories — invalid code format (uppercase) → 400', async () => {
    await authPost(app, '/api/v1/expenses/categories', ownerCookies, {
      name: 'Test',
      code: 'INVALID_CODE',
    }).expect(400);
  });

  it('VAL-18: POST /expenses/categories — missing name → 400', async () => {
    await authPost(app, '/api/v1/expenses/categories', ownerCookies, {
      code: 'valid_code',
    }).expect(400);
  });

  // ── Repair Payment ────────────────────────────────────────────────────────────

  it('VAL-19: POST /repairs/:id/payment — invalid paymentMethod → 400', async () => {
    await authPost(app, '/api/v1/repairs/nonexistent-id/payment', ownerCookies, {
      paymentMethod: 'CRYPTO',
      amountPaid: 1000,
    }).expect(400);
  });

  it('VAL-20: POST /repairs/:id/reverse-payment — missing reason → 400', async () => {
    await authPost(app, '/api/v1/repairs/nonexistent-id/reverse-payment', ownerCookies, {
      // reason field missing
    }).expect(400);
  });
});
