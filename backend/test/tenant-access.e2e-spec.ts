/**
 * When a shop may save, and how it renews. One rule everywhere: after the expiry date a shop
 * has 7 more days, then it can still read its data but not save; a suspended shop is read-only
 * straight away. A shop renews itself by sending a slip, which the Super Admin then approves.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

// A 1×1 PNG, enough for an upload
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DAY = 86_400_000;

describe('Expired and suspended shops; shops renewing themselves (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let admin: string;
  let adminId: string;
  const run = Date.now().toString(36);
  const saEmail = `sa-renew-${run}@e2e.test`;
  let original: { status: any; plan: any; expiryDate: Date | null };

  const setShop = (data: object) => prisma.tenant.update({ where: { id: IDS.tenantA }, data });
  const save = (cookie = manager) =>
    authPost(app, '/api/v1/customers', cookie, { name: `TA ${run}`, phone: `08${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` });
  const sendSlip = (cookie: string, fields: Record<string, string>, file: Buffer | null = PNG, name = 'slip.png') => {
    let r = request(app.getHttpServer()).post('/api/v1/subscription/payments').set('Cookie', cookie);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return file ? r.attach('slip', file, name) : r;
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    original = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantA }, select: { status: true, plan: true, expiryDate: true } });
    adminId = (await prisma.user.create({
      data: { email: saEmail, name: 'SA Renew', password: await bcrypt.hash('E2eTest@2026!', 10), role: 'SUPER_ADMIN', isActive: true },
    })).id;
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
    admin   = (await loginAs(app, saEmail, 'E2eTest@2026!')).cookies;
  });

  afterAll(async () => {
    await setShop(original).catch(() => {});
    await prisma.tenantRenewal.deleteMany({ where: { tenantId: { in: [IDS.tenantA, IDS.tenantB] }, action: 'PAYMENT_ACTIVATE', createdAt: { gte: new Date(Date.now() - DAY) } } });
    await prisma.tenantPayment.deleteMany({ where: { tenantId: { in: [IDS.tenantA, IDS.tenantB] }, submittedById: { not: null } } });
    await prisma.customer.deleteMany({ where: { tenantId: IDS.tenantA, name: `TA ${run}` } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
    await app?.close();
    await prisma?.$disconnect();
  });

  afterEach(() => setShop({ status: 'ACTIVE', expiryDate: original.expiryDate }));

  const modulesOf = async (cookie: string) => (await authGet(app, '/api/v1/auth/me', cookie).expect(200)).body.enabledModules as string[];

  it('TA-01: the 7 grace days after expiry still save; after them the shop is read-only', async () => {
    await setShop({ expiryDate: new Date(Date.now() - 4 * DAY) });
    await save().expect(201);                       // the banner says "still usable for 3 days" — and it is

    await setShop({ expiryDate: new Date(Date.now() - 8 * DAY) });
    const res = await save().expect(403);
    expect(res.body.code).toBe('TENANT_EXPIRED');
    await authGet(app, '/api/v1/customers', manager).expect(200);   // reading still works

    const sub = (await authGet(app, '/api/v1/subscription', owner).expect(200)).body;
    expect(sub.effectiveStatus).toBe('EXPIRED');
  });

  it('TA-02: a suspended shop can log in and read, but not save', async () => {
    await setShop({ status: 'SUSPENDED' });
    const login = await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password);
    expect((login.user as any).tenantStatus).toBe('SUSPENDED');

    const res = await save(login.cookies).expect(403);
    expect(res.body.code).toBe('TENANT_SUSPENDED');
    await authGet(app, '/api/v1/customers', login.cookies).expect(200);
    expect((await authGet(app, '/api/v1/subscription', owner).expect(200)).body.effectiveStatus).toBe('SUSPENDED');

    await setShop({ status: 'ACTIVE' });
    await save(login.cookies).expect(201);
  });

  it('TA-03: /auth/me refreshes the expiry cookie the web app routes by', async () => {
    const newExpiry = new Date(Date.now() + 40 * DAY);
    await setShop({ expiryDate: newExpiry });
    const res = await authGet(app, '/api/v1/auth/me', owner).expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tenant_expiry_ts='));
    expect(cookie).toContain(`tenant_expiry_ts=${newExpiry.getTime()}`);
    expect(res.body.tenantStatus).toBe('ACTIVE');
  });

  it('TA-04: an expired owner sends a slip; the Super Admin sees it, approves it, and the shop is renewed', async () => {
    await setShop({ expiryDate: new Date(Date.now() - 10 * DAY) });

    const opts = (await authGet(app, '/api/v1/subscription/renewal-options', owner).expect(200)).body;
    expect(opts.plans.map((p: any) => p.key)).toEqual(expect.arrayContaining(['LITE', 'PRO', 'BUSINESS']));
    expect(opts.plans.some((p: any) => p.key === 'TRIAL')).toBe(false);
    expect(opts.terms.map((t: any) => t.months)).toEqual([1, 3, 6, 12]);
    expect(opts.payTo).toHaveProperty('promptpayId');

    // Wrong inputs are refused before anything is stored
    await sendSlip(owner, { plan: 'PRO', months: '1', amount: '990' }, null).expect(400);
    await sendSlip(owner, { plan: 'PRO', months: '2', amount: '990' }).expect(400);
    await sendSlip(owner, { plan: 'TRIAL', months: '1', amount: '990' }).expect(400);
    await sendSlip(owner, { plan: 'PRO', months: '1', amount: '990' }, Buffer.from('%PDF-1.4'), 'slip.pdf').expect(400);
    await sendSlip(manager, { plan: 'PRO', months: '1', amount: '990' }).expect(403);   // owner only

    const sent = (await sendSlip(owner, { plan: 'BUSINESS', months: '3', amount: '5671', reference: `REF-${run}` }).expect(201)).body;
    expect(sent).toMatchObject({ plan: 'BUSINESS', duration: 90, status: 'PENDING', paymentAmount: 5671 });
    await sendSlip(owner, { plan: 'PRO', months: '1', amount: '990' }).expect(409);    // one waiting at a time
    expect((await authGet(app, '/api/v1/subscription/renewal-options', owner).expect(200)).body.hasPending).toBe(true);

    // Nothing about the shop changed yet
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantA } })).plan).toBe(original.plan);

    const list = (await authGet(app, '/api/v1/super-admin/payments?filter=pending', admin).expect(200)).body;
    const row = list.find((p: any) => p.id === sent.id);
    expect(row.slipUrl).toMatch(new RegExp(`^/api/v1/files/${IDS.tenantA}/slips/.+\\.png$`));
    expect(row.submittedById).toBeTruthy();
    // The Super Admin can open the slip; another shop cannot
    await authGet(app, row.slipUrl, admin).expect(200);
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    await authGet(app, row.slipUrl, ownerB).expect(403);

    const patch = (p: string, body = {}) => request(app.getHttpServer()).patch(p).set('Cookie', admin).send(body);
    await patch(`/api/v1/super-admin/payments/${sent.id}/verify`).expect(200);
    await patch(`/api/v1/super-admin/payments/${sent.id}/activate`).expect(200);

    const shop = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantA } });
    expect(shop.plan).toBe('BUSINESS');
    expect(shop.expiryDate!.getTime()).toBeGreaterThan(Date.now() + 89 * DAY);
    await save().expect(201);

    const mine = (await authGet(app, '/api/v1/subscription/payments', owner).expect(200)).body;
    expect(mine.find((p: any) => p.id === sent.id).activatedAt).toBeTruthy();
  });

  it('TA-06: renewing onto a smaller plan says which menus go, and is refused if the branches do not fit', async () => {
    await setShop({ plan: 'PRO' });
    const plans = (await authGet(app, '/api/v1/subscription/renewal-options', owner).expect(200)).body.plans;
    const of = (k: string) => plans.find((p: any) => p.key === k);
    expect(of('PRO').loses).toEqual([]);                                  // same plan: nothing changes
    expect(of('BUSINESS').loses).toEqual([]);                             // bigger plan: nothing lost
    expect(of('LITE').loses.map((m: any) => m.key)).toEqual(expect.arrayContaining(['finance', 'line_notify']));

    // Shop A has 2 branches; LITE allows 1 — refused even when the owner accepts losing menus
    const res = await sendSlip(owner, { plan: 'LITE', months: '1', amount: '500', confirmLoses: 'true' }).expect(400);
    expect(res.body.message).toContain('สาขา');
  });

  it('TA-07: a smaller plan needs the owner\'s confirmation; after approval the menus follow at once', async () => {
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantB }, select: { plan: true, expiryDate: true } });
    try {
      expect(before.plan).toBe('PRO');
      expect(await modulesOf(ownerB)).toContain('finance');              // also fills the module cache

      const refused = await sendSlip(ownerB, { plan: 'LITE', months: '1', amount: '500' }).expect(400);
      expect(refused.body.message).toContain('ยืนยัน');
      const sent = (await sendSlip(ownerB, { plan: 'LITE', months: '1', amount: '500', confirmLoses: 'true' }).expect(201)).body;
      const row = await prisma.tenantPayment.findUniqueOrThrow({ where: { id: sent.id } });
      expect(row.paymentNote).toContain('PRO → LITE');

      const patch = (p: string) => request(app.getHttpServer()).patch(p).set('Cookie', admin).send({});
      await patch(`/api/v1/super-admin/payments/${sent.id}/verify`).expect(200);
      await patch(`/api/v1/super-admin/payments/${sent.id}/activate`).expect(200);
      expect(await modulesOf(ownerB)).not.toContain('finance');          // not after a 5-minute cache
    } finally {
      // Back to PRO through the Super Admin route, which also clears the module cache
      await request(app.getHttpServer()).patch(`/api/v1/super-admin/tenants/${IDS.tenantB}/change-plan`)
        .set('Cookie', admin).send({ plan: before.plan }).expect(200);
      await prisma.tenant.update({ where: { id: IDS.tenantB }, data: { expiryDate: before.expiryDate, status: 'ACTIVE' } });
    }
    expect(await modulesOf(ownerB)).toContain('finance');
  });

  it('TA-05: an expired shop can still log out and log back in', async () => {
    await setShop({ expiryDate: new Date(Date.now() - 30 * DAY) });
    const s = await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password);
    await authPost(app, '/api/v1/auth/logout', s.cookies, {}).expect(201);
  });
});
