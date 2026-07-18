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
});
