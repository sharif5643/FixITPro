/**
 * Ideas from trying another repair-shop system:
 *  - a repair price list per brand / model / job: read by anyone who takes jobs in, set by the owner
 *  - connecting with a partner shop by its 6-character code
 *  - phones that have not sold for 60 days
 *  - customers following their repair on FixITPro's LINE account from the tracking page
 *  - wiping or restoring a shop that has cash put in / taken out of a shift
 */
import * as crypto from 'crypto';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { LineMessagingService } from '../src/line-messaging/line-messaging.service';

const LINE_SECRET = 'e2e-line-secret';

describe('Price list, partner code, aging phones, LINE follow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerA: string;
  let ownerB: string;
  let managerA: string;
  let cashierA: string;
  const run = Date.now().toString(36).toUpperCase();
  const pw = 'E2eTest@2026!';
  const lineCalls: { path: string; payload: any }[] = [];
  const saved = { oa: process.env.LINE_OA_ID, secret: process.env.LINE_CHANNEL_SECRET, token: process.env.LINE_CHANNEL_ACCESS_TOKEN };

  const del = (path: string, cookie: string) => request(app.getHttpServer()).delete(path).set('Cookie', cookie);
  const lineWebhook = (events: object[]) => {
    const body = JSON.stringify({ events });
    const sig = crypto.createHmac('sha256', LINE_SECRET).update(body).digest('base64');
    return request(app.getHttpServer())
      .post('/api/v1/public/line/webhook')
      .set('Content-Type', 'application/json')
      .set('x-line-signature', sig)
      .send(body);
  };

  beforeAll(async () => {
    process.env.LINE_OA_ID = '@fixitpro-e2e';
    process.env.LINE_CHANNEL_SECRET = LINE_SECRET;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'e2e-token';
    // Never call LINE from tests: record what would be sent
    jest.spyOn(LineMessagingService.prototype as any, 'callLine').mockImplementation(async (...args: unknown[]) => {
      lineCalls.push({ path: args[1] as string, payload: args[2] });
      return true;
    });
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    ownerA   = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    ownerB   = (await loginAs(app, CREDS.ownerB.email, pw)).cookies;
    managerA = (await loginAs(app, CREDS.managerA1.email, pw)).cookies;
    cashierA = (await loginAs(app, CREDS.cashierA1.email, pw)).cookies;
  });

  afterAll(async () => {
    await prisma.partnerRelationship.deleteMany({
      where: { OR: [{ initiatorTenantId: IDS.tenantA, partnerTenantId: IDS.tenantB }, { initiatorTenantId: IDS.tenantB, partnerTenantId: IDS.tenantA }] },
    });
    process.env.LINE_OA_ID = saved.oa;
    process.env.LINE_CHANNEL_SECRET = saved.secret;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = saved.token;
    jest.restoreAllMocks();
    await app?.close();
    await prisma?.$disconnect();
  });

  // ── Price list ──────────────────────────────────────────────────────────────

  it('RP-01: the owner sets prices many at a time; the same brand+model+job (any case) updates the price', async () => {
    const brand = `Brand${run}`;
    const res = (await authPost(app, '/api/v1/repair-prices', ownerA, { rows: [
      { brand, model: 'X 13', service: 'เปลี่ยนจอ', price: 3500, costPrice: 2000, warrantyDays: 90 },
      { brand, model: '', service: 'เปลี่ยนจอ', price: 2500 },
      { brand, model: '', service: 'เปลี่ยนแบต', price: 900 },
      { brand: '', model: '', service: `ค่าตรวจ ${run}`, price: 100 },
    ] }).expect(201)).body;
    expect(res).toEqual({ created: 4, updated: 0 });

    const again = (await authPost(app, '/api/v1/repair-prices', ownerA, { rows: [
      { brand: brand.toLowerCase(), model: 'x  13', service: 'เปลี่ยนจอ', price: 3700 },
    ] }).expect(201)).body;
    expect(again).toEqual({ created: 0, updated: 1 });

    const quote = (await authGet(app, `/api/v1/repair-prices/lookup?brand=${brand}&model=X%2013`, cashierA).expect(200)).body;
    expect(quote.map((q: any) => [q.service, q.price])).toEqual([
      ['เปลี่ยนจอ', 3700], ['เปลี่ยนแบต', 900], [`ค่าตรวจ ${run}`, 100],
    ]);
    // Cost prices only for those allowed to see them
    expect(quote[0]).not.toHaveProperty('costPrice');
    const ownerQuote = (await authGet(app, `/api/v1/repair-prices/lookup?brand=${brand}&model=X%2013`, ownerA).expect(200)).body;
    expect(ownerQuote[0].costPrice).toBe(2000);
  });

  it('RP-02: staff read the list but cannot change it; another shop never sees it', async () => {
    await authPost(app, '/api/v1/repair-prices', cashierA, { rows: [{ brand: 'A', model: '', service: 'x', price: 1 }] }).expect(403);
    await authPost(app, '/api/v1/repair-prices', managerA, { rows: [{ brand: 'A', model: '', service: 'x', price: 1 }] }).expect(403);
    const mine = (await authGet(app, '/api/v1/repair-prices', ownerA).expect(200)).body;
    expect(mine.length).toBeGreaterThanOrEqual(4);
    const theirs = (await authGet(app, `/api/v1/repair-prices?search=${run}`, ownerB).expect(200)).body;
    expect(theirs).toEqual([]);
    const id = mine.find((r: any) => r.service === 'เปลี่ยนแบต' && r.brand === `Brand${run}`).id;
    await del(`/api/v1/repair-prices/${id}`, ownerB).expect(404);
    await del(`/api/v1/repair-prices/${id}`, ownerA).expect(200);
  });

  it('RP-03: bad rows are refused with a reason', async () => {
    const dup = await authPost(app, '/api/v1/repair-prices', ownerA, { rows: [
      { brand: 'A', model: '', service: 'จอ', price: 1 }, { brand: 'a', model: '', service: 'จอ', price: 2 },
    ] }).expect(400);
    expect(dup.body.message).toContain('รายการซ้ำ');
    await authPost(app, '/api/v1/repair-prices', ownerA, { rows: [{ brand: '', model: 'X', service: 'จอ', price: 1 }] }).expect(400);
    await authPost(app, '/api/v1/repair-prices', ownerA, { rows: [{ brand: 'A', model: '', service: 'จอ', price: -1 }] }).expect(400);
  });

  // ── Partner code ────────────────────────────────────────────────────────────

  it('PC-01: shop B types shop A\'s code and the two are partners at once; a second time says so', async () => {
    await authGet(app, '/api/v1/partner-relationships/my-code', managerA).expect(403);
    const { code } = (await authGet(app, '/api/v1/partner-relationships/my-code', ownerA).expect(200)).body;
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect((await authGet(app, '/api/v1/partner-relationships/my-code', ownerA).expect(200)).body.code).toBe(code);

    await authPost(app, '/api/v1/partner-relationships/by-code', ownerB, { code: 'ZZZZZZ' }).expect(404);
    await authPost(app, '/api/v1/partner-relationships/by-code', ownerA, { code }).expect(404); // itself

    const rel = (await authPost(app, '/api/v1/partner-relationships/by-code', ownerB, { code: code.toLowerCase() }).expect(201)).body;
    expect(rel.status).toBe('ACCEPTED');
    expect((await authGet(app, '/api/v1/partner-relationships/has-partner', ownerA).expect(200)).body.hasAcceptedPartner).toBe(true);
    await authPost(app, '/api/v1/partner-relationships/by-code', ownerB, { code }).expect(409);
    const told = await prisma.notification.findFirst({ where: { tenantId: IDS.tenantA, entityId: rel.id } });
    expect(told).toBeTruthy();
  });

  it('PC-02: a new code stops the old one working', async () => {
    const before = (await authGet(app, '/api/v1/partner-relationships/my-code', ownerA).expect(200)).body.code;
    const after = (await authPost(app, '/api/v1/partner-relationships/my-code/reset', ownerA, {}).expect(201)).body.code;
    expect(after).not.toBe(before);
    await prisma.partnerRelationship.deleteMany({ where: { initiatorTenantId: IDS.tenantB, partnerTenantId: IDS.tenantA } });
    await authPost(app, '/api/v1/partner-relationships/by-code', ownerB, { code: before }).expect(404);
  });

  // ── Phones that have not sold ───────────────────────────────────────────────

  it('AP-01: a phone in stock with no sale for 70 days shows with its days; money tied up only for cost viewers', async () => {
    const old = new Date(Date.now() - 70 * 86_400_000);
    const p = await prisma.product.create({ data: {
      name: `Old phone ${run}`, sku: `OLD-${run}`, type: 'PHONE', price: 5000, costPrice: 4000, tenantId: IDS.tenantA, createdAt: old,
    } as any });
    await prisma.branchStock.create({ data: { productId: p.id, branchId: IDS.branchA1, quantity: 2 } });
    await prisma.stockMovement.create({ data: { productId: p.id, branchId: IDS.branchA1, type: 'IN', quantity: 2, createdAt: old } });
    const fresh = await prisma.product.create({ data: {
      name: `New phone ${run}`, sku: `NEW-${run}`, type: 'PHONE', price: 5000, costPrice: 4000, tenantId: IDS.tenantA,
    } as any });
    await prisma.branchStock.create({ data: { productId: fresh.id, branchId: IDS.branchA1, quantity: 1 } });

    const res = (await authGet(app, '/api/v1/stock/aging-phones', ownerA).expect(200)).body;
    const row = res.items.find((i: any) => i.productId === p.id);
    expect(row.daysIdle).toBeGreaterThanOrEqual(69);
    expect(row.tiedUp).toBe(8000);
    expect(res.items.some((i: any) => i.productId === fresh.id)).toBe(false);

    const asCashier = (await authGet(app, '/api/v1/stock/aging-phones', cashierA).expect(200)).body;
    expect(asCashier.tiedUp).toBeNull();
    expect((await authGet(app, '/api/v1/stock/aging-phones', ownerB).expect(200)).body.items.some((i: any) => i.productId === p.id)).toBe(false);
  });

  // ── LINE follow ─────────────────────────────────────────────────────────────

  it('LN-01: tracking gives the LINE button; sending the ticket follows the job; status changes go to LINE; handover ends it', async () => {
    const r = (await authPost(app, '/api/v1/repairs', ownerA, {
      deviceBrand: 'X', deviceModel: `Line ${run}`, issue: 'x', customerName: 'Line Customer', customerPhone: '0899990001', branchId: IDS.branchA1,
    }).expect(201)).body;
    const track = (await request(app.getHttpServer()).get(`/api/v1/public/tracking/repair?ticketNumber=${r.ticketNumber}`).expect(200)).body;
    expect(decodeURIComponent(track.lineFollowUrl)).toContain(`ติดตามงาน ${r.ticketNumber}`);

    // Unsigned events are refused
    await request(app.getHttpServer()).post('/api/v1/public/line/webhook').send({ events: [] }).expect(401);

    lineCalls.length = 0;
    await lineWebhook([{ type: 'message', replyToken: 'rt-1', source: { userId: 'U-e2e-1' }, message: { type: 'text', text: `ติดตามงาน ${r.ticketNumber}` } }]).expect(200);
    expect(await prisma.repairLineFollow.count({ where: { repairId: r.id } })).toBe(1);
    expect(lineCalls[0].path).toBe('/v2/bot/message/reply');
    expect(lineCalls[0].payload.messages[0].text).toContain(r.ticketNumber);

    // A status nobody needs a message for: nothing sent; ready for pickup: pushed
    lineCalls.length = 0;
    await request(app.getHttpServer()).patch(`/api/v1/repairs/${r.id}`).set('Cookie', ownerA).send({ status: 'DIAGNOSING' }).expect(200);
    await new Promise((res) => setTimeout(res, 300));
    expect(lineCalls.filter((c) => c.path === '/v2/bot/message/push')).toHaveLength(0);
    for (const s of ['IN_PROGRESS', 'COMPLETED']) {
      await request(app.getHttpServer()).patch(`/api/v1/repairs/${r.id}`).set('Cookie', ownerA).send({ status: s }).expect(200);
    }
    await new Promise((res) => setTimeout(res, 300));
    const pushes = lineCalls.filter((c) => c.path === '/v2/bot/message/push');
    expect(pushes.length).toBeGreaterThanOrEqual(1);
    expect(pushes[0].payload.to).toBe('U-e2e-1');

    // Leaving the LINE account stops everything
    await lineWebhook([{ type: 'unfollow', source: { userId: 'U-e2e-1' } }]).expect(200);
    expect(await prisma.repairLineFollow.count({ where: { repairId: r.id } })).toBe(0);
  });

  it('LN-02: an unknown ticket gets a polite answer and follows nothing', async () => {
    lineCalls.length = 0;
    await lineWebhook([{ type: 'message', replyToken: 'rt-2', source: { userId: 'U-e2e-2' }, message: { type: 'text', text: 'ติดตามงาน REP-20200101-NOPE00' } }]).expect(200);
    expect(await prisma.repairLineFollow.count({ where: { lineUserId: 'U-e2e-2' } })).toBe(0);
    expect(lineCalls[0].payload.messages[0].text).toContain('ไม่พบงานซ่อม');
  });
});

describe('Wiping and backing up a shop with shift cash movements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const run = Date.now().toString(36);
  const pw = 'E2eTest@2026!';

  beforeAll(async () => {
    prisma = testPrisma();
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('BK-01: the backup carries the cash movements and price list; wiping no longer fails on them', async () => {
    const email = `cashmv-${run}@e2e.test`;
    const hash = await bcrypt.hash(pw, 10);
    const t = await prisma.tenant.create({ data: { shopName: `CashMv ${run}`, ownerName: 'C', email, status: 'ACTIVE', plan: 'TRIAL' } });
    const b = await prisma.branch.create({ data: { name: 'Main', tenantId: t.id, isDefault: true } as any });
    const u = await prisma.user.create({ data: { email, name: 'C Owner', password: hash, role: 'OWNER', isActive: true, tenantId: t.id, branchId: b.id } });
    const shift = await prisma.shift.create({ data: { userId: u.id, branchId: b.id, openBalance: 1000 } });
    await prisma.shiftCashMovement.create({ data: {
      shiftId: shift.id, kind: 'MANUAL_OUT', direction: 'OUT', amount: 200, reason: 'ฝากธนาคาร', createdById: u.id, tenantId: t.id, branchId: b.id,
    } });
    await prisma.repairPrice.create({ data: { tenantId: t.id, brand: 'A', model: '', service: 'จอ', price: 1000 } });

    const owner = (await loginAs(app, email, pw)).cookies;
    const res = (await authPost(app, '/api/v1/settings/reset-data', owner, { password: pw }).expect(201)).body;
    expect(await prisma.shift.count({ where: { branchId: b.id } })).toBe(0);
    expect(await prisma.shiftCashMovement.count({ where: { tenantId: t.id } })).toBe(0);
    // The price list is the shop's setting: kept
    expect(await prisma.repairPrice.count({ where: { tenantId: t.id } })).toBe(1);

    const backups = (await authGet(app, '/api/v1/shop-backups', owner).expect(200)).body;
    const backup = backups.find((x: any) => x.id === res.backupId);
    expect(backup.counts.shiftCashMovements).toBe(1);
    expect(backup.counts.repairPrices).toBe(1);
  });
});
