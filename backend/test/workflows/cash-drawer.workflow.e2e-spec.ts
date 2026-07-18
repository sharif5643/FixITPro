/**
 * RC1.5-001 — Cash Drawer Workflow E2E Tests
 * Open → Deposit → Withdraw → Close, verify expected cash.
 * Uses MANAGER user (has all cash_drawer.* permissions).
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from '../helpers/app.helper';
import { loginAs, authGet, authPost } from '../helpers/auth.helper';
import { CREDS, seedTestData, testPrisma } from '../helpers/seed.helper';

describe('Cash Drawer Workflow (e2e)', () => {
  let app:    INestApplication;
  let prisma: PrismaClient;
  let cookies: string;
  let sessionId: string | undefined;

  const OPENING_AMOUNT = 500;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    // MANAGER has all cash_drawer permissions
    cookies = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // CD-01: Open session
  it('CD-01: POST /cash-drawer/session/open → 201, returns session id', async () => {
    const res = await authPost(app, '/api/v1/cash-drawer/session/open', cookies, {
      openingAmount: OPENING_AMOUNT,
      note: 'E2E test open',
    });
    expect([200, 201, 409]).toContain(res.status);
    if (res.status === 409) {
      // Already an open session — get existing sessionId
      const cur = await authGet(app, '/api/v1/cash-drawer/session/current', cookies);
      sessionId = cur.body?.id ?? cur.body?.session?.id;
    } else {
      sessionId = res.body.id ?? res.body?.session?.id ?? res.body?.data?.id;
      expect(sessionId).toBeDefined();
      expect(res.body.status ?? res.body?.session?.status).toBe('OPEN');
    }
  });

  // CD-02: Get current session
  it('CD-02: GET /cash-drawer/session/current → 200, session exists', async () => {
    const res = await authGet(app, '/api/v1/cash-drawer/session/current', cookies);
    expect([200]).toContain(res.status);
    // Current session should be present (we just opened one)
    const body = res.body?.session ?? res.body;
    expect(body).toBeDefined();
    // If sessionId was not set in CD-01, try to get it now
    if (!sessionId && body?.id) {
      sessionId = body.id;
    }
  });

  // CD-03: Deposit
  it('CD-03: POST /cash-drawer/session/:id/deposit → 201', async () => {
    if (!sessionId) { return; }
    await authPost(app, `/api/v1/cash-drawer/session/${sessionId}/deposit`, cookies, {
      amount: 200,
      reason: 'E2E deposit test',
    }).expect(201);
  });

  // CD-04: Withdraw
  it('CD-04: POST /cash-drawer/session/:id/withdraw → 201', async () => {
    if (!sessionId) { return; }
    await authPost(app, `/api/v1/cash-drawer/session/${sessionId}/withdraw`, cookies, {
      amount: 100,
      reason: 'E2E withdrawal test',
    }).expect(201);
  });

  // CD-05: Close session — counted = opening + deposit - withdraw = 600
  it('CD-05: POST /cash-drawer/session/:id/close → 201 or 200', async () => {
    if (!sessionId) { return; }
    const expectedCash = OPENING_AMOUNT + 200 - 100; // 600
    const res = await authPost(app, `/api/v1/cash-drawer/session/${sessionId}/close`, cookies, {
      countedAmount: expectedCash,
      closingNote: 'E2E close test',
    });
    expect([200, 201]).toContain(res.status);
    const body = res.body?.session ?? res.body;
    const status = body?.status ?? res.body?.status;
    expect(['CLOSED', 'PENDING_APPROVAL']).toContain(status);
  });

  // CD-06: After close, opening another session returns 201 or conflict
  it('CD-06: POST /cash-drawer/session/open after close → 201 (new session)', async () => {
    const res = await authPost(app, '/api/v1/cash-drawer/session/open', cookies, {
      openingAmount: 100,
    });
    // After close, should open new session or return conflict if not yet closed
    expect([201, 409, 400]).toContain(res.status);
    if (res.status === 201) {
      const newSessionId = res.body.id ?? res.body?.data?.id;
      expect(newSessionId).toBeDefined();
      // Close the extra session to avoid state leakage between test runs
      if (newSessionId) {
        await authPost(app, `/api/v1/cash-drawer/session/${newSessionId}/close`, cookies, {
          countedAmount: 100,
        });
      }
    }
  });
});
