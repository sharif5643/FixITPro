/**
 * Closing a job in a hurry: the customer pays and leaves before the parts are taken from stock,
 * but the shop knows what they cost. The cost is typed at closing, so the job's profit is right
 * at once, and the job waits in "รอเบิกอะไหล่". Taking the real parts later replaces the typed
 * cost (never both); a part bought outside keeps the typed cost as the job's cost.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Parts taken after the job is closed (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let otherShop: string;
  let screenId: string;
  const run = Date.now().toString(36).toUpperCase();
  const pw = 'E2eTest@2026!';
  const opened: string[] = [];

  const ensureShift = async (cookie: string) => {
    const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
    if (cur?.id) return;
    const res = await authPost(app, '/api/v1/shifts/open', cookie, { openBalance: 1000 });
    if (res.status !== 201) throw new Error(`open shift: ${res.status} ${JSON.stringify(res.body)}`);
    opened.push(cookie);
  };
  const stockOf = async (productId: string) =>
    (await prisma.branchStock.findUniqueOrThrow({ where: { branchId_productId: { branchId: IDS.branchA1, productId } } })).quantity;
  const profitOf = async (id: string) => (await authGet(app, `/api/v1/repairs/${id}/profit`, owner).expect(200)).body;
  let seq = 0;
  /** A finished job, paid through the normal payment (handed over) */
  const paidJob = async (price: number) => {
    seq++;
    const r = await prisma.repair.create({ data: {
      ticketNumber: `PL-${run}-${seq}`, deviceBrand: 'Apple', deviceModel: `iPhone 12 ${run}`, issue: 'เปลี่ยนจอ',
      status: 'COMPLETED', estimatedTotal: price, finalCost: price, branchId: IDS.branchA1,
    } as any });
    await authPost(app, `/api/v1/repairs/${r.id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: price }).expect(201);
    return r.id;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    otherShop = (await loginAs(app, CREDS.ownerB.email, pw)).cookies;
    const p = await prisma.product.create({ data: {
      name: `Screen ${run}`, sku: `PL-SCR-${run}`, type: 'PART', price: 2500, costPrice: 1150, stock: 5, tenantId: IDS.tenantA,
    } as any });
    await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: 5 } });
    screenId = p.id;
    await ensureShift(owner);
  });

  afterAll(async () => {
    for (const cookie of opened) {
      const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
      if (cur?.id) await authPost(app, `/api/v1/shifts/${cur.id}/close`, cookie, { closeBalance: Number(cur.expectedCashBalance ?? 0) });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PL-01: the typed cost counts at once and the job waits for its parts; a wrong figure is refused', async () => {
    const id = await paidJob(3000);
    await authPost(app, `/api/v1/repairs/${id}/parts-later`, owner, { estimate: 0 }).expect(400);
    await authPost(app, `/api/v1/repairs/${id}/parts-later`, otherShop, { estimate: 1200 }).expect(404);

    await authPost(app, `/api/v1/repairs/${id}/parts-later`, owner, { estimate: 1200, note: 'จอ iPhone 12' }).expect(201);
    // typed again: it corrects, it does not add up
    await authPost(app, `/api/v1/repairs/${id}/parts-later`, owner, { estimate: 1200, note: 'จอ iPhone 12' }).expect(201);
    expect(await prisma.repairExtraCost.count({ where: { repairId: id } })).toBe(1);

    const p = await profitOf(id);
    expect(p.costs.parts).toBe(1200);
    expect(p.costs.delivery).toBe(0);
    expect(p.costs.partsEstimated).toBe(true);
    expect(p.grossProfit).toBe(1800);

    const list = (await authGet(app, '/api/v1/repairs/parts-pending', owner).expect(200)).body;
    const row = list.find((x: { id: string }) => x.id === id);
    expect(row?.partsEstimate).toBe(1200);
    expect(row?.partsEstimateNote).toBe('จอ iPhone 12');
  });

  it('PL-02: taking the real part replaces the typed cost (never both)', async () => {
    const id = await paidJob(3000);
    await authPost(app, `/api/v1/repairs/${id}/parts-later`, owner, { estimate: 1200 }).expect(201);
    const before = await stockOf(screenId);
    await authPost(app, `/api/v1/repairs/${id}/parts`, owner, { productId: screenId, quantity: 1 }).expect(201);
    expect(await stockOf(screenId)).toBe(before - 1);

    await authPatch(app, `/api/v1/repairs/${id}/parts-done`, owner, {}).expect(200);
    const p = await profitOf(id);
    expect(p.costs.parts).toBe(1150);
    expect(p.costs.partsEstimated).toBe(false);
    expect(await prisma.repairExtraCost.count({ where: { repairId: id } })).toBe(0);
    const list = (await authGet(app, '/api/v1/repairs/parts-pending', owner).expect(200)).body;
    expect(list.map((x: { id: string }) => x.id)).not.toContain(id);
  });

  it('PL-03: a part bought outside keeps the typed cost as the job cost', async () => {
    const id = await paidJob(2000);
    await authPost(app, `/api/v1/repairs/${id}/parts-later`, owner, { estimate: 700, note: 'ซื้อร้านตรงข้าม' }).expect(201);
    await authPatch(app, `/api/v1/repairs/${id}/parts-done`, owner, { keepEstimate: true }).expect(200);
    const cost = await prisma.repairExtraCost.findFirstOrThrow({ where: { repairId: id } });
    expect(cost.kind).toBe('PART');
    const p = await profitOf(id);
    expect(p.costs.parts).toBe(700);
    expect(p.grossProfit).toBe(1300);
    // done once: a second tap finds nothing waiting
    const again = await request(app.getHttpServer()).patch(`/api/v1/repairs/${id}/parts-done`).set('Cookie', owner).send({});
    expect(again.status).toBe(404);
  });

  it('PL-04: the profit report counts the typed cost as parts, not as a delivery fee', async () => {
    const q = `branchId=${IDS.branchA1}`;
    const rep = (await authGet(app, `/api/v1/reports/profit?${q}`, owner).expect(200)).body;
    expect(rep.repair.outsidePartsCost).toBeGreaterThanOrEqual(1900);   // 1200 (PL-01) + 700 (PL-03)
    const items: Array<{ ticketNumber: string; partsCost: number; deliveryCost: number }> = rep.repair.items;
    const mine = items.filter((i) => i.ticketNumber.startsWith(`PL-${run}`));
    expect(mine.length).toBe(3);
    expect(mine.every((i) => i.deliveryCost === 0)).toBe(true);
    expect(mine.map((i) => i.partsCost).sort((a, b) => a - b)).toEqual([700, 1150, 1200]);
  });
});
