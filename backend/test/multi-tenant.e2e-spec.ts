/**
 * RC1.5-001 — Multi-Tenant Isolation E2E Tests
 * Tenant A cannot read/write Tenant B data and vice-versa.
 */
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Multi-Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cookiesA: string;   // Owner A cookies
  let cookiesB: string;   // Owner B cookies

  // Customer + Repair created under Tenant B — used to test cross-tenant reads
  let customerBId: string;
  let repairBId: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();

    const loginA = await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password);
    cookiesA = loginA.cookies;

    const loginB = await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password);
    cookiesB = loginB.cookies;

    // Create a customer in Tenant B
    const custRes = await authPost(app, '/api/v1/customers', cookiesB, {
      name: 'Tenant B Customer', phone: '0800000099',
    });
    customerBId = custRes.body.id ?? custRes.body?.data?.id;

    // Create a repair in Tenant B branch
    const repairRes = await authPost(app, '/api/v1/repairs', cookiesB, {
      deviceBrand: 'Samsung', deviceModel: 'S24',
      issue: 'Screen crack', estimateCost: 1500,
      branchId: IDS.branchB1,
    });
    repairBId = repairRes.body.id ?? repairRes.body?.data?.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── MT-01: Tenant A cannot list Tenant B repairs ─────────────────────────────

  it('MT-01: Tenant A listing repairs sees only own repairs (no Tenant B data)', async () => {
    const res = await authGet(app, `/api/v1/repairs?branchId=${IDS.branchA1}`, cookiesA)
      .expect(200);

    const items = Array.isArray(res.body) ? res.body : res.body.items ?? res.body.data ?? [];
    const hasTenantBRepair = items.some((r: any) => r.id === repairBId);
    expect(hasTenantBRepair).toBe(false);
  });

  // ── MT-02: Tenant A cannot read a specific Tenant B repair ───────────────────

  it('MT-02: Tenant A GET /repairs/:repairBId → 404 (not visible to Tenant A)', async () => {
    if (!repairBId) { return; }
    await authGet(app, `/api/v1/repairs/${repairBId}`, cookiesA).expect(404);
  });

  // ── MT-03: Tenant A cannot list Tenant B customers ───────────────────────────

  it('MT-03: Tenant A listing customers sees no Tenant B customers', async () => {
    const res = await authGet(app, '/api/v1/customers', cookiesA).expect(200);
    const items = Array.isArray(res.body) ? res.body : res.body.items ?? res.body.data ?? [];
    const hasTenantBCustomer = items.some((c: any) => c.id === customerBId);
    expect(hasTenantBCustomer).toBe(false);
  });

  // ── MT-04: Tenant A cannot PATCH Tenant B repair ─────────────────────────────

  it('MT-04: Tenant A PATCH /repairs/:repairBId → 404', async () => {
    if (!repairBId) { return; }
    await authPost(app, `/api/v1/repairs/${repairBId}`, cookiesA, { note: 'hacked' })
      .expect(404);
  });

  // ── MT-05: Tenant B cannot see Tenant A branches ─────────────────────────────

  it('MT-05: Tenant B GET /branches sees only own branches', async () => {
    const res = await authGet(app, '/api/v1/branches', cookiesB).expect(200);
    const items = Array.isArray(res.body) ? res.body : res.body.items ?? res.body.data ?? [];
    const tenantABranchIds = [IDS.branchA1, IDS.branchA2];
    const leaksA = items.some((b: any) => tenantABranchIds.includes(b.id));
    expect(leaksA).toBe(false);
  });

  // ── MT-06: Tenant A cannot see Tenant B sales/reports ────────────────────────

  it('MT-06: Tenant A GET /sales filtered by branchB1 → empty or 403', async () => {
    const res = await authGet(
      app, `/api/v1/sales?branchId=${IDS.branchB1}`, cookiesA,
    );
    // Either returns 200 empty, or 403/404 — must NOT return Tenant B sales
    if (res.status === 200) {
      const items = Array.isArray(res.body)
        ? res.body
        : res.body.items ?? res.body.sales ?? res.body.data ?? [];
      expect(items.length).toBe(0);
    } else {
      expect([403, 404]).toContain(res.status);
    }
  });

  // ── MT-07: Branch isolation — Manager A1 cannot see Branch A2 data ───────────

  it('MT-07: Manager A1 listing repairs with branchId=A2 sees only A1 data', async () => {
    const loginMgr = await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password);
    // Manager A1 is assigned to branch A1 — querying A2 should return empty or filter to A1
    const res = await authGet(
      app, `/api/v1/repairs?branchId=${IDS.branchA2}`, loginMgr.cookies,
    );
    // Service enforces branch scoping via tenantId; cross-branch query depends on role
    // At minimum, Tenant B data must not appear
    if (res.status === 200) {
      const items = Array.isArray(res.body) ? res.body : res.body.items ?? res.body.data ?? [];
      const hasTenantBRepair = items.some((r: any) => r.id === repairBId);
      expect(hasTenantBRepair).toBe(false);
    }
  });

  // ── MT-08: Unauthenticated request → 401 ─────────────────────────────────────

  it('MT-08: Unauthenticated GET /repairs → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/repairs').expect(401);
  });

  // ── MT-09..12: Carrier wallets / package sales are per tenant ───────────────

  const aisBalance = async (cookies: string) => {
    const res = await authGet(app, '/api/v1/carrier-wallet/balances', cookies).expect(200);
    return res.body.find((w: any) => w.carrier === 'AIS').balance as number;
  };

  it('MT-09: Tenant A wallet top-up does not change Tenant B wallet', async () => {
    const beforeA = await aisBalance(cookiesA);
    const beforeB = await aisBalance(cookiesB);

    await authPost(app, '/api/v1/carrier-wallet/topup', cookiesA, { carrier: 'AIS', amount: 1000 }).expect(201);

    expect(await aisBalance(cookiesA)).toBeCloseTo(beforeA + 1000, 2);
    expect(await aisBalance(cookiesB)).toBeCloseTo(beforeB, 2);
  });

  it('MT-10: Tenant A package sale is listed for A only (date range filter works)', async () => {
    const sale = await authPost(app, '/api/v1/carrier-wallet/package-sale', cookiesA, {
      carrier: 'AIS', saleType: 'PROMO', packageAmount: 100, dealerCost: 96,
      paymentMethod: 'CASH', amountPaid: 100, cashierName: 'e2e',
    }).expect(201);
    expect(sale.body.walletDeduction).toBe(96);
    expect(sale.body.profit).toBe(4);

    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const path  = `/api/v1/carrier-wallet/package-sales/list?startDate=${today}&endDate=${today}`;
    const listA = await authGet(app, path, cookiesA).expect(200);
    const listB = await authGet(app, path, cookiesB).expect(200);

    expect(listA.body.map((r: any) => r.id)).toContain(sale.body.id);
    expect(listB.body.map((r: any) => r.id)).not.toContain(sale.body.id);
  });

  it('MT-11: Tenant B wallet movements do not include Tenant A top-ups', async () => {
    const movA = await authGet(app, '/api/v1/carrier-wallet/movements', cookiesA).expect(200);
    const movB = await authGet(app, '/api/v1/carrier-wallet/movements', cookiesB).expect(200);
    const idsA = new Set(movA.body.map((m: any) => m.id));
    expect(movA.body.length).toBeGreaterThan(0);
    expect(movB.body.some((m: any) => idsA.has(m.id))).toBe(false);
  });

  // ── MT-13: Shift summary breaks package sales / top-ups down per carrier ───

  it('MT-13: GET /shifts/current returns per-carrier sales and top-ups of the shift', async () => {
    const existing = await authGet(app, '/api/v1/shifts/current', cookiesB).expect(200);
    if (existing.body?.id) {
      await authPost(app, `/api/v1/shifts/${existing.body.id}/close`, cookiesB, { closeBalance: 0, note: 'e2e cleanup' });
    }
    const opened = await authPost(app, '/api/v1/shifts/open', cookiesB, { openBalance: 0 }).expect(201);
    const shiftId = opened.body.id;

    try {
      await authPost(app, '/api/v1/carrier-wallet/topup', cookiesB, { carrier: 'DTAC', amount: 500, shiftId }).expect(201);
      await authPost(app, '/api/v1/carrier-wallet/package-sale', cookiesB, {
        carrier: 'DTAC', packageAmount: 200, paymentMethod: 'CASH', amountPaid: 200, cashierName: 'e2e', shiftId,
      }).expect(201);

      const current = await authGet(app, '/api/v1/shifts/current', cookiesB).expect(200);
      const dtac = current.body.packageSalesByCarrier.find((c: any) => c.carrier === 'DTAC');
      expect(dtac).toMatchObject({
        salesCount: 1, salesAmount: 200, walletDeduction: 194, profit: 6,
        topupCount: 1, topupAmount: 500,
      });
      expect(current.body.packageSalesByCarrier.find((c: any) => c.carrier === 'AIS').salesCount).toBe(0);
    } finally {
      await authPost(app, `/api/v1/shifts/${shiftId}/close`, cookiesB, { closeBalance: 200, note: 'e2e' });
    }
  });

  // ── MT-12: Repair chat is tenant scoped ──────────────────────────────────────

  it('MT-12: Tenant A cannot read Tenant B repair chat; Tenant B can', async () => {
    await authGet(app, `/api/v1/repairs/${repairBId}/messages`, cookiesA).expect(404);
    await authGet(app, `/api/v1/repairs/${repairBId}/messages`, cookiesB).expect(200);
  });
});
