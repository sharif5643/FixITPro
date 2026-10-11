/**
 * Parts taken for a repair, and a deal made at pickup:
 *  - a freebie (e.g. a screen protector) comes out of stock and costs the job, is never charged,
 *    and keeps its normal price to show on the receipt
 *  - a discount at pickup comes off the price; the money taken, the shift and the receipt agree
 *  - the owner can cap what staff may take off; reversing the payment puts the price back
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Repair freebies and pickup discount (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let cashier: string; // a non-owner who takes payments (the seeded manager)
  let filmId: string;
  const run = Date.now().toString(36).toUpperCase();
  const pw = 'E2eTest@2026!';
  const opened: string[] = [];

  // The owner opens (or reuses) the branch's shift; the cashier joins it, as at the counter
  const ensureShift = async (cookie: string) => {
    const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
    if (cur?.id) return;
    const joinable = (await authGet(app, '/api/v1/shifts/joinable', cookie).expect(200)).body;
    const open = Array.isArray(joinable) ? joinable[0] : null;
    if (open?.id) {
      await authPost(app, `/api/v1/shifts/${open.id}/join`, cookie, {}).expect(201);
      return;
    }
    const res = await authPost(app, '/api/v1/shifts/open', cookie, { openBalance: 1000 });
    if (res.status !== 201) throw new Error(`open shift: ${res.status} ${JSON.stringify(res.body)}`);
    opened.push(cookie);
  };
  const completedRepair = async (estimate: number) => {
    const r = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Apple', deviceModel: `iPhone 11 ${run}`, issue: 'จอแตก', estimateCost: estimate, branchId: IDS.branchA1,
    }).expect(201)).body;
    for (const s of ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED']) await authPatch(app, `/api/v1/repairs/${r.id}`, owner, { status: s }).expect(200);
    return r.id as string;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    cashier = (await loginAs(app, CREDS.managerA1.email, pw)).cookies;
    const film = await prisma.product.create({ data: {
      name: `ฟิล์มกระจก iPhone 11 ${run}`, sku: `FILM-${run}`, type: 'ACCESSORY', price: 100, costPrice: 15, tenantId: IDS.tenantA,
    } as any });
    await prisma.branchStock.create({ data: { productId: film.id, branchId: IDS.branchA1, quantity: 10 } });
    filmId = film.id;
    await ensureShift(owner);
    await ensureShift(cashier);
  });

  afterAll(async () => {
    await prisma.shopSettings.updateMany({ where: { tenantId: IDS.tenantA }, data: { staffDiscountLimitPercent: null } });
    for (const cookie of opened) {
      const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
      if (cur?.id) await authPost(app, `/api/v1/shifts/${cur.id}/close`, cookie, { closeBalance: Number(cur.expectedCashBalance ?? 0) });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FD-01: a freebie comes out of stock, costs the job, is never charged and keeps its normal price', async () => {
    const id = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Apple', deviceModel: `iPhone 11 ${run}`, issue: 'จอแตก', estimateCost: 1400, branchId: IDS.branchA1,
    }).expect(201)).body.id;
    // Even if "charge" is sent too, a freebie is not charged
    await authPost(app, `/api/v1/repairs/${id}/parts`, owner, { productId: filmId, quantity: 1, freebie: true, chargeToCustomer: true, price: 100 }).expect(201);
    const part = await prisma.repairPart.findFirst({ where: { repairId: id, productId: filmId } });
    expect(part).toMatchObject({ isFreebie: true, chargeToCustomer: false });
    expect(Number(part!.freebieValue)).toBe(100);
    expect(Number(part!.sellPrice)).toBe(0);
    expect(Number(part!.costPrice)).toBe(15);
    const bs = await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId: IDS.branchA1, productId: filmId } } });
    expect(bs!.quantity).toBe(9);
  });

  it('FD-02: a discount at pickup comes off the price: what is owed, taken and counted in the shift agree', async () => {
    const id = await completedRepair(1200);
    const before = Number((await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body.expectedCashBalance);
    await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 1100, discount: 100 }).expect(201);
    const r = await prisma.repair.findUnique({ where: { id } });
    expect(Number(r!.finalCost)).toBe(1100);
    expect(Number(r!.paidDiscount)).toBe(100);
    expect(r!.paidDiscountById).toBe(IDS.userOwnerA);
    expect(Number(r!.paidAmount)).toBe(1100);
    expect(r!.paymentStatus).toBe('PAID');
    const after = Number((await authGet(app, '/api/v1/shifts/current', owner).expect(200)).body.expectedCashBalance);
    expect(after - before).toBe(1100);
  });

  it('FD-03: a discount larger than the price is refused', async () => {
    const id = await completedRepair(500);
    const res = await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 0, discount: 600 });
    expect(res.status).toBe(400);
  });

  it('FD-04: the owner caps what staff may take off; the owner is not capped', async () => {
    await authPatch(app, '/api/v1/settings', owner, { staffDiscountLimitPercent: 10 }).expect(200);
    const id = await completedRepair(1200);
    const tooMuch = await authPost(app, `/api/v1/repairs/${id}/payment`, cashier, { paymentMethod: 'CASH', amountPaid: 1000, discount: 200 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toContain('10%');
    await authPost(app, `/api/v1/repairs/${id}/payment`, cashier, { paymentMethod: 'CASH', amountPaid: 1080, discount: 120 }).expect(201);
    expect((await prisma.repair.findUnique({ where: { id } }))!.paidDiscountById).toBe(IDS.userManagerA1);

    const id2 = await completedRepair(1200);
    await authPost(app, `/api/v1/repairs/${id2}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 900, discount: 300 }).expect(201);
  });

  it('FD-05: reversing the payment puts the price back as it was before the discount', async () => {
    const id = await completedRepair(1200);
    await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 1100, discount: 100 }).expect(201);
    await authPost(app, `/api/v1/repairs/${id}/reverse-payment`, owner, { reason: 'e2e' }).expect(201);
    const r = await prisma.repair.findUnique({ where: { id } });
    expect(Number(r!.finalCost)).toBe(1200);
    expect(r!.paidDiscount).toBeNull();
    expect(r!.paymentStatus).toBe('PENDING');
  });

  it('FD-06: paying without a discount works as before', async () => {
    const id = await completedRepair(800);
    await authPost(app, `/api/v1/repairs/${id}/payment`, owner, { paymentMethod: 'CASH', amountPaid: 800 }).expect(201);
    const r = await prisma.repair.findUnique({ where: { id } });
    expect(Number(r!.finalCost)).toBe(800);
    expect(r!.paidDiscount).toBeNull();
  });
});
