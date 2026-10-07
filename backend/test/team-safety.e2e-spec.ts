/**
 * The "ทีมงาน" menu: no one is made a second owner from the staff page (the shop's first owner can
 * undo one made before), staff and branches with history are closed instead of deleted (their
 * bills, shifts and repairs keep them), a taken email is a clear message, and a technician sees
 * their own figures only, without cost or profit.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import * as request from 'supertest';

describe('Team safety (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let tech: string;
  const run = Date.now().toString(36);
  const pw = 'E2eTest@2026!';
  const put = (path: string, body: object, cookie = owner) => request(app.getHttpServer()).put(path).set('Cookie', cookie).send(body);
  const patch = (path: string, cookie = owner) => request(app.getHttpServer()).patch(path).set('Cookie', cookie);
  const del = (path: string, cookie = owner) => request(app.getHttpServer()).delete(path).set('Cookie', cookie);
  const newStaff = async (name: string) =>
    (await authPost(app, '/api/v1/users', owner, { email: `${name}-${run}@e2e.test`, name: `${name} ${run}`, password: pw, role: 'CASHIER', branchId: IDS.branchA1 }).expect(201)).body.id as string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, pw)).cookies;
    tech  = (await loginAs(app, CREDS.techA1.email, pw)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('TEAM-01: nobody is made owner from the staff page', async () => {
    await authPost(app, '/api/v1/users', owner, { email: `own-${run}@e2e.test`, name: 'X', password: pw, role: 'OWNER' }).expect(403);
    const id = await newStaff('promo');
    await put(`/api/v1/users/${id}`, { role: 'OWNER' }).expect(403);
  });

  it('TEAM-02: the first owner can undo an extra owner made before', async () => {
    const extra = await prisma.user.create({
      data: { email: `extra-${run}@e2e.test`, name: 'Extra owner', password: await bcrypt.hash(pw, 10), role: 'OWNER', isActive: true, tenantId: IDS.tenantA },
    });
    await put(`/api/v1/users/${extra.id}`, { role: 'CASHIER', branchId: IDS.branchA1 }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: extra.id } })).role).toBe('CASHIER');
  });

  it('TEAM-03: staff with history are disabled, not deleted; a new unused account can be deleted', async () => {
    const worked = await newStaff('worked');
    const cookie = (await loginAs(app, `worked-${run}@e2e.test`, pw)).cookies;
    const shift = (await authPost(app, '/api/v1/shifts/open', cookie, { openBalance: 0 }).expect(201)).body;
    await authPost(app, `/api/v1/shifts/${shift.id}/close`, cookie, { closeBalance: 0 }).expect(201);
    const res = await del(`/api/v1/users/${worked}`).expect(400);
    expect(res.body.message).toContain('ปิดใช้งาน');
    await patch(`/api/v1/users/${worked}/toggle`).expect(200);

    const unused = await newStaff('unused');
    await del(`/api/v1/users/${unused}`).expect(200);
  });

  it('TEAM-04: a taken email is a clear message, not a server error', async () => {
    const id = await newStaff('mail');
    const res = await put(`/api/v1/users/${id}`, { email: CREDS.ownerB.email }).expect(409);
    expect(res.body.message).toContain('ถูกใช้งานแล้ว');
  });

  it('TEAM-05: a branch with history is closed, not deleted; an empty one can be deleted', async () => {
    const used = await prisma.branch.create({ data: { name: `Used ${run}`, tenantId: IDS.tenantA } as any });
    const u = await prisma.user.findFirstOrThrow({ where: { email: CREDS.ownerA.email } });
    await prisma.sale.create({ data: { receiptNumber: `BR-${run}`, subtotal: 1, total: 1, amountPaid: 1, change: 0, userId: u.id, branchId: used.id } as any });
    const res = await del(`/api/v1/branches/${used.id}`).expect(400);
    expect(res.body.message).toContain('ปิดใช้งานสาขา');
    expect(await prisma.sale.count({ where: { branchId: used.id } })).toBe(1);

    const empty = await prisma.branch.create({ data: { name: `Empty ${run}`, tenantId: IDS.tenantA } as any });
    await del(`/api/v1/branches/${empty.id}`).expect(200);
  });

  it('TEAM-06: a technician sees only their own figures, without cost or profit', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { email: CREDS.techA1.email } });
    const list = (await authGet(app, '/api/v1/technicians', tech).expect(200)).body;
    expect(list.every((t: any) => t.id === me.id)).toBe(true);
    for (const t of list) expect(t.kpi).not.toHaveProperty('partsCost');
    const other = await prisma.user.findFirstOrThrow({ where: { email: CREDS.managerA1.email } });
    await authGet(app, `/api/v1/technicians/${other.id}`, tech).expect(403);
    const all = (await authGet(app, '/api/v1/technicians', owner).expect(200)).body;
    expect(all.length).toBeGreaterThanOrEqual(list.length);
  });
});
