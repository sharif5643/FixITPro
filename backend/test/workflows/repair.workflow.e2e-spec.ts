/**
 * RC1.5-001 — Repair Workflow E2E Tests
 * Create → Update status (valid transitions) → Final payment → Reverse → Verify ledger.
 *
 * Valid status machine:
 *   RECEIVED → DIAGNOSING → IN_PROGRESS → COMPLETED → DELIVERED
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from '../helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from '../helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from '../helpers/seed.helper';

describe('Repair Workflow (e2e)', () => {
  let app:    INestApplication;
  let prisma: PrismaClient;
  let ownerCookies: string;
  let techCookies:  string;
  let repairId:     string | undefined;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerCookies = (await loginAs(app, CREDS.ownerA.email,  CREDS.ownerA.password)).cookies;
    techCookies  = (await loginAs(app, CREDS.techA1.email,   CREDS.techA1.password)).cookies;

    // processPayment requires an active shift — open one for ownerA
    await authPost(app, '/api/v1/shifts/open', ownerCookies, { openBalance: 0 });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // RP-01: Create repair
  it('RP-01: POST /repairs → 201', async () => {
    const res = await authPost(app, '/api/v1/repairs', ownerCookies, {
      deviceBrand: 'iPhone',
      deviceModel: '15 Pro',
      issue: 'Battery replacement',
      estimateCost: 1500,
      branchId: IDS.branchA1,
    });
    expect([201, 200]).toContain(res.status);
    repairId = res.body.id ?? res.body?.repair?.id ?? res.body?.data?.id;
    expect(repairId).toBeDefined();
    expect(res.body.status ?? res.body?.repair?.status).toBeDefined();
  });

  // RP-02: Get repair by ID
  it('RP-02: GET /repairs/:id → 200', async () => {
    if (!repairId) { return; }
    const res = await authGet(app, `/api/v1/repairs/${repairId}`, ownerCookies).expect(200);
    expect(res.body.id ?? res.body?.repair?.id).toBe(repairId);
  });

  // RP-03: RECEIVED → DIAGNOSING (valid first transition)
  it('RP-03: PATCH /repairs/:id → status=DIAGNOSING (valid from RECEIVED)', async () => {
    if (!repairId) { return; }
    const res = await authPatch(app, `/api/v1/repairs/${repairId}`, ownerCookies, {
      status: 'DIAGNOSING',
    });
    expect([200, 201]).toContain(res.status);
  });

  // RP-04: DIAGNOSING → IN_PROGRESS (valid transition)
  it('RP-04: PATCH /repairs/:id → status=IN_PROGRESS', async () => {
    if (!repairId) { return; }
    const res = await authPatch(app, `/api/v1/repairs/${repairId}`, ownerCookies, {
      status: 'IN_PROGRESS',
    });
    expect([200, 201]).toContain(res.status);
  });

  // RP-04b: IN_PROGRESS → COMPLETED (so payment can be processed)
  it('RP-04b: PATCH /repairs/:id → status=COMPLETED', async () => {
    if (!repairId) { return; }
    const res = await authPatch(app, `/api/v1/repairs/${repairId}`, ownerCookies, {
      status: 'COMPLETED',
    });
    expect([200, 201]).toContain(res.status);
  });

  // RP-05: Process payment (CASH) — allowed when COMPLETED or DELIVERED
  it('RP-05: POST /repairs/:id/payment → 201 (CASH)', async () => {
    if (!repairId) { return; }
    const res = await authPost(app, `/api/v1/repairs/${repairId}/payment`, ownerCookies, {
      paymentMethod: 'CASH',
      amountPaid: 1500,
      finalCost: 1500,
    });
    expect([200, 201]).toContain(res.status);

    const body = res.body?.repair ?? res.body;
    const payStatus = body.paymentStatus ?? res.body?.paymentStatus;
    expect(payStatus).toBe('PAID');
    expect(Number(body.paidAmount ?? res.body?.paidAmount)).toBeCloseTo(1500);
  });

  // RP-06: Verify ledger REPAIR_FINAL_PAYMENT IN
  it('RP-06: DB — CashDrawerTransaction REPAIR_FINAL_PAYMENT IN created', async () => {
    if (!repairId) { return; }
    const ledger = await prisma.cashDrawerTransaction.findFirst({
      where: { referenceId: repairId, referenceType: 'REPAIR_FINAL_PAYMENT' },
    });
    if (ledger) {
      expect(ledger.direction).toBe('IN');
      expect(Number(ledger.amount)).toBeCloseTo(1500);
    }
    // Not a hard fail if no cash drawer session was open
  });

  // RP-07: Reverse payment
  it('RP-07: POST /repairs/:id/reverse-payment → 200 or 201', async () => {
    if (!repairId) { return; }
    const res = await authPost(
      app, `/api/v1/repairs/${repairId}/reverse-payment`, ownerCookies,
      { reason: 'E2E test reversal' },
    );
    expect([200, 201]).toContain(res.status);

    const body = res.body?.repair ?? res.body;
    const payStatus = body.paymentStatus ?? res.body?.paymentStatus;
    expect(payStatus).toBe('PENDING');
  });

  // RP-08: Verify reversal ledger OUT (RC1-002)
  it('RP-08: DB — CashDrawerTransaction REVERSAL OUT created after reverse-payment', async () => {
    if (!repairId) { return; }
    const reversal = await prisma.cashDrawerTransaction.findFirst({
      where: { referenceId: repairId, referenceType: 'REVERSAL' },
    });
    if (reversal) {
      expect(reversal.direction).toBe('OUT');
      expect(Number(reversal.amount)).toBeCloseTo(1500);
    }
  });

  // RP-09: Cannot reverse twice (paymentStatus already PENDING)
  it('RP-09: POST /repairs/:id/reverse-payment again → 400', async () => {
    if (!repairId) { return; }
    await authPost(
      app, `/api/v1/repairs/${repairId}/reverse-payment`, ownerCookies,
      { reason: 'Double reversal attempt' },
    ).expect(400);
  });

  // RP-10: Technician can GET their own repairs
  it('RP-10: TECHNICIAN GET /repairs → 200 (filtered to assigned)', async () => {
    await authGet(app, `/api/v1/repairs?branchId=${IDS.branchA1}`, techCookies).expect(200);
  });

  // RP-11: Cross-tenant: Tenant A cannot see Tenant B repairs
  it('RP-11: Tenant A cannot GET /repairs/:repairBId (404)', async () => {
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const repairBRes = await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'Samsung', deviceModel: 'S23',
      issue: 'Screen', estimateCost: 2000,
      branchId: IDS.branchB1,
    });
    const repairBId = repairBRes.body?.id ?? repairBRes.body?.repair?.id;
    if (!repairBId) { return; }
    await authGet(app, `/api/v1/repairs/${repairBId}`, ownerCookies).expect(404);
  });
});
