/**
 * The "ระบบ" menu: the activity log export stays inside the shop, the owner backs up their own
 * shop, wiping a shop needs the owner's password and backs it up first, and the system admin
 * can remove (and restore) a trial shop nobody used.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('System tools (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let manager: string;
  let admin: string;
  const run = Date.now().toString(36);
  const pw = 'E2eTest@2026!';
  const saEmail = `sa-sys-${run}@e2e.test`;
  const trialEmail = `trial-${run}@e2e.test`;
  let trialId: string;
  let trialOwner: string;

  const waitBackup = async (cookie: string) => {
    for (let i = 0; i < 40; i++) {
      const [b] = (await authGet(app, '/api/v1/shop-backups', cookie).expect(200)).body;
      if (b && b.status !== 'RUNNING') return b;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('backup did not finish');
  };

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    const hash = await bcrypt.hash(pw, 10);
    await prisma.user.create({ data: { email: saEmail, name: 'SA Sys', password: hash, role: 'SUPER_ADMIN', isActive: true } });
    // A trial shop that signed up and never sold anything
    const t = await prisma.tenant.create({ data: { shopName: `Trial ${run}`, ownerName: 'Trial', email: trialEmail, status: 'ACTIVE', plan: 'TRIAL' } });
    trialId = t.id;
    const b = await prisma.branch.create({ data: { name: 'Trial main', tenantId: t.id, isDefault: true } as any });
    await prisma.user.create({ data: { email: trialEmail, name: 'Trial Owner', password: hash, role: 'OWNER', isActive: true, tenantId: t.id, branchId: b.id } });
    await prisma.customer.create({ data: { name: 'Trial customer', tenantId: t.id, tags: [] } });
    app = await createTestApp();
    owner      = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    manager    = (await loginAs(app, CREDS.managerA1.email, pw)).cookies;
    admin      = (await loginAs(app, saEmail, pw)).cookies;
    trialOwner = (await loginAs(app, trialEmail, pw)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SYS-01: the activity log export holds only this shop\'s people; a manager without that permission cannot export it', async () => {
    const csv = (await authGet(app, '/api/v1/data/export/audit-logs', owner).expect(200)).text;
    expect(csv).not.toContain('Owner B');
    await authGet(app, '/api/v1/data/export/audit-logs', manager).expect(403);
  });

  it('SYS-02: the owner backs up their own shop and downloads it; a manager cannot', async () => {
    await authPost(app, '/api/v1/shop-backups', trialOwner, {}).expect(201);
    const b = await waitBackup(trialOwner);
    expect(b.status).toBe('SUCCESS');
    expect(b.counts.customers).toBe(1);
    await authGet(app, `/api/v1/shop-backups/${b.id}/download`, trialOwner).expect(200);
    await authGet(app, `/api/v1/shop-backups/${b.id}/download`, owner).expect(404); // another shop's file
    await authGet(app, '/api/v1/shop-backups', manager).expect(403);
  });

  it('SYS-03: wiping the shop needs the owner\'s password and backs the shop up first', async () => {
    await authPost(app, '/api/v1/settings/reset-data', trialOwner, {}).expect(401);
    await authPost(app, '/api/v1/settings/reset-data', trialOwner, { password: 'wrong' }).expect(401);
    expect(await prisma.customer.count({ where: { tenantId: trialId } })).toBe(1);
    const res = (await authPost(app, '/api/v1/settings/reset-data', trialOwner, { password: pw }).expect(201)).body;
    expect(res.backupId).toBeTruthy();
    expect(await prisma.customer.count({ where: { tenantId: trialId } })).toBe(0);
    const backups = (await authGet(app, '/api/v1/shop-backups', trialOwner).expect(200)).body;
    expect(backups.find((x: any) => x.id === res.backupId)?.counts?.customers).toBe(1);
  });

  it('SYS-04: a shop with sales cannot be removed', async () => {
    // A second throwaway shop with one bill
    const t = await prisma.tenant.create({ data: { shopName: `Sold ${run}`, ownerName: 'S', email: `sold-${run}@e2e.test`, status: 'ACTIVE' } });
    const b = await prisma.branch.create({ data: { name: 'Sold main', tenantId: t.id } as any });
    const u = await prisma.user.create({ data: { email: `sold-${run}@e2e.test`, name: 'S', password: 'x', role: 'OWNER', tenantId: t.id, branchId: b.id } });
    await prisma.sale.create({ data: { receiptNumber: `SOLD-${run}`, subtotal: 10, total: 10, amountPaid: 10, change: 0, userId: u.id, branchId: b.id } as any });
    const check = (await authGet(app, `/api/v1/super-admin/tenants/${t.id}/delete-check`, admin).expect(200)).body;
    expect(check.canDelete).toBe(false);
    expect(check.reasons.join()).toContain('บิลขาย 1');
    // A paid shop with nothing sold is protected too
    const paid = await prisma.tenant.create({ data: { shopName: `Paid ${run}`, ownerName: 'P', email: `paid-${run}@e2e.test`, status: 'ACTIVE', plan: 'PRO' } });
    expect((await authGet(app, `/api/v1/super-admin/tenants/${paid.id}/delete-check`, admin).expect(200)).body.canDelete).toBe(false);
    await authPost(app, `/api/v1/super-admin/tenants/${t.id}/delete`, admin, { confirmName: check.shopName }).expect(400);
  });

  it('SYS-05: a trial shop is removed (name typed), hidden, its email freed; then restored', async () => {
    await authPost(app, `/api/v1/super-admin/tenants/${trialId}/delete`, admin, { confirmName: 'wrong' }).expect(400);
    await authPost(app, `/api/v1/super-admin/tenants/${trialId}/delete`, admin, { confirmName: `Trial ${run}` }).expect(200);

    const list = (await authGet(app, '/api/v1/super-admin/tenants', admin).expect(200)).body.data;
    expect(list.some((t: any) => t.id === trialId)).toBe(false);
    const removed = (await authGet(app, '/api/v1/super-admin/tenants?filter=deleted', admin).expect(200)).body.data;
    expect(removed.some((t: any) => t.id === trialId)).toBe(true);
    expect(await prisma.user.count({ where: { email: trialEmail } })).toBe(0); // free to sign up again
    await authPost(app, '/api/v1/auth/login', '', { email: trialEmail, password: pw }).expect(401);

    await authPost(app, `/api/v1/super-admin/tenants/${trialId}/restore-deleted`, admin, {}).expect(200);
    const back = await prisma.tenant.findUniqueOrThrow({ where: { id: trialId } });
    expect(back.status).toBe('SUSPENDED');
    expect(back.email).toBe(trialEmail);
    expect((await prisma.user.findFirstOrThrow({ where: { tenantId: trialId } })).email).toBe(trialEmail);
  });
});
