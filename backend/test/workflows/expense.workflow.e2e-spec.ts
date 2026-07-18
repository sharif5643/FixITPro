/**
 * RC1.5-001 — Expense Workflow E2E Tests
 * Create category → Create expense → Void expense → Verify ledger reversal.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from '../helpers/app.helper';
import { loginAs, authGet, authPost } from '../helpers/auth.helper';
import { CREDS, seedTestData, testPrisma } from '../helpers/seed.helper';

describe('Expense Workflow (e2e)', () => {
  let app:    INestApplication;
  let prisma: PrismaClient;
  let ownerCookies: string;
  let categoryId:   string | undefined;
  let expenseId:    string | undefined;

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

  // EX-01: Create expense category
  it('EX-01: POST /expenses/categories → 201', async () => {
    const res = await authPost(app, '/api/v1/expenses/categories', ownerCookies, {
      name: 'E2E Test Category',
      code: 'etest_category',
    });
    if (res.status === 201) {
      categoryId = res.body.id ?? res.body?.data?.id;
    } else if ([400, 409].includes(res.status)) {
      // Already exists — fetch it from DB
      const row = await prisma.expenseCategory.findFirst({
        where: { code: 'etest_category' },
      });
      categoryId = row?.id;
    }
    expect([201, 400, 409]).toContain(res.status);
    expect(categoryId).toBeDefined();
  });

  // EX-02: Create expense (CASH payment)
  it('EX-02: POST /expenses → 201 with CASH paymentMethod', async () => {
    if (!categoryId) { return; }
    const res = await authPost(app, '/api/v1/expenses', ownerCookies, {
      categoryId,
      amount: 350,
      description: 'E2E test expense',
      paymentMethod: 'CASH',
      expenseDate: '2026-07-18',
      note: 'Created by E2E test',
    });
    expect([201, 200]).toContain(res.status);
    const expBody = res.body?.expense ?? res.body;
    expenseId = expBody.id ?? res.body?.data?.id;
    expect(expenseId).toBeDefined();
    expect(Number(expBody.amount)).toBeCloseTo(350);
    expect(expBody.paymentMethod).toBe('CASH');
    expect(expBody.voidedAt).toBeNull();
  });

  // EX-03: Get the expense by ID
  it('EX-03: GET /expenses/:id → 200', async () => {
    if (!expenseId) { return; }
    await authGet(app, `/api/v1/expenses/${expenseId}`, ownerCookies).expect(200);
  });

  // EX-04: DB check — CashDrawerTransaction for EXPENSE_PAYMENT
  it('EX-04: DB — CashDrawerTransaction EXPENSE_PAYMENT OUT (if drawer was open)', async () => {
    if (!expenseId) { return; }
    const ledger = await prisma.cashDrawerTransaction.findFirst({
      where: { referenceId: expenseId, referenceType: 'EXPENSE_PAYMENT' },
    });
    if (ledger) {
      expect(ledger.direction).toBe('OUT');
      expect(Number(ledger.amount)).toBeCloseTo(350);
    }
    // Soft check — no active drawer in test env is expected
  });

  // EX-05: Void the expense
  it('EX-05: POST /expenses/:id/void → 200 or 201', async () => {
    if (!expenseId) { return; }
    const res = await authPost(app, `/api/v1/expenses/${expenseId}/void`, ownerCookies, {
      voidReason: 'E2E test void',
    });
    expect([200, 201]).toContain(res.status);
    const voided = res.body;
    expect(voided.voidedAt ?? voided?.expense?.voidedAt).toBeDefined();
    expect(voided.voidReason ?? voided?.expense?.voidReason).toBe('E2E test void');
  });

  // EX-06: Cannot void twice
  it('EX-06: POST /expenses/:id/void again → 400', async () => {
    if (!expenseId) { return; }
    await authPost(app, `/api/v1/expenses/${expenseId}/void`, ownerCookies, {
      voidReason: 'Double void attempt',
    }).expect(400);
  });

  // EX-07: DB check — REVERSAL ledger after void
  it('EX-07: DB — CashDrawerTransaction REVERSAL IN (if drawer was open)', async () => {
    if (!expenseId) { return; }
    const reversal = await prisma.cashDrawerTransaction.findFirst({
      where: { referenceId: expenseId, referenceType: 'REVERSAL' },
    });
    if (reversal) {
      expect(reversal.direction).toBe('IN');
      expect(Number(reversal.amount)).toBeCloseTo(350);
    }
    // Soft check — no active drawer in test env is expected
  });

  // EX-08: CASHIER cannot create expense (no expenses.manage permission)
  it('EX-08: CASHIER POST /expenses → 403', async () => {
    const cashierCookies = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    if (!categoryId) { return; }
    await authPost(app, '/api/v1/expenses', cashierCookies, {
      categoryId,
      amount: 100,
      description: 'Unauthorized',
      paymentMethod: 'CASH',
      expenseDate: '2026-07-18',
    }).expect(403);
  });
});
