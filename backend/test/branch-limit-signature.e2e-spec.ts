/**
 * - Super Admin sets how many branches a shop may open (over the plan's own limit), and the shop sees it
 * - A staff member saves their own signature once; it prints as the shop's signature on the jobs they take in
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost, authPatch } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

// A tiny real PNG (1×1 white pixel)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Branch limit per shop + staff signature (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: string;
  let ownerB: string;
  let ownerA: string;
  const run = Date.now().toString(36);
  const email = `sa-branch-${run}@e2e.test`;
  const password = 'E2eTest@2026!';
  let adminId: string;
  const createdBranches: string[] = [];

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    adminId = (await prisma.user.create({
      data: { email, name: 'SA Branch', password: await bcrypt.hash(password, 10), role: 'SUPER_ADMIN', isActive: true },
    })).id;
    app = await createTestApp();
    admin = (await loginAs(app, email, password)).cookies;
    ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    ownerA = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });

  afterAll(async () => {
    await prisma.tenant.update({ where: { id: IDS.tenantB }, data: { maxBranches: null } }).catch(() => {});
    for (const id of createdBranches) {
      await prisma.branch.delete({ where: { id } })
        .catch(() => prisma.branch.update({ where: { id }, data: { status: 'SUSPENDED', isActive: false } }).catch(() => {}));
    }
    await prisma.user.update({ where: { id: IDS.userOwnerA }, data: { signatureImage: null } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } }).catch(() => {});
    await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
    await app?.close();
    await prisma?.$disconnect();
  });

  it('BL-01: Super Admin raises a shop over its plan; the shop sees the limit and is stopped at it', async () => {
    const limitUrl = `/api/v1/super-admin/tenants/${IDS.tenantB}/branch-limit`;
    const before = (await authGet(app, limitUrl, admin).expect(200)).body;
    expect(before).toMatchObject({ limit: 1, setForShop: false }); // PRO: 1 branch
    const used = before.used as number;

    // Shops cannot set it themselves
    await authPatch(app, limitUrl, ownerB, { maxBranches: 50 }).expect(403);
    // Out of range, or fewer than the branches already open, is refused
    await authPatch(app, limitUrl, admin, { maxBranches: 0 }).expect(400);
    await authPatch(app, limitUrl, admin, { maxBranches: 1.5 }).expect(400);

    const set = (await authPatch(app, limitUrl, admin, { maxBranches: used + 1 }).expect(200)).body;
    expect(set).toEqual({ used, limit: used + 1, setForShop: true });
    expect((await authGet(app, '/api/v1/branches/usage', ownerB).expect(200)).body).toEqual(set);

    const b = (await authPost(app, '/api/v1/branches', ownerB, { name: `สาขาเพิ่ม ${run}` }).expect(201)).body;
    createdBranches.push(b.id);
    const over = await authPost(app, '/api/v1/branches', ownerB, { name: `สาขาเกิน ${run}` });
    expect(over.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(over.body)).toContain(`สูงสุด ${used + 1} สาขา`);

    // Lower than what is open now: refused, nothing changes
    await authPatch(app, limitUrl, admin, { maxBranches: used }).expect(400);
    expect((await prisma.tenant.findUnique({ where: { id: IDS.tenantB }, select: { maxBranches: true } }))?.maxBranches).toBe(used + 1);

    // Empty: back to the plan's own limit
    const cleared = (await authPatch(app, limitUrl, admin, { maxBranches: null }).expect(200)).body;
    expect(cleared).toMatchObject({ limit: 1, setForShop: false });

    // Other shops are untouched
    expect((await authGet(app, '/api/v1/branches/usage', ownerA).expect(200)).body.setForShop).toBe(false);
  });

  it('SIG-01: my signature is saved, replaced and removed; bad images are refused', async () => {
    expect((await authGet(app, '/api/v1/auth/my-signature', ownerA).expect(200)).body).toEqual({ image: null });
    const put = (body: object) => request(app.getHttpServer()).put('/api/v1/auth/my-signature').set('Cookie', ownerA).send(body);
    await put({ image: 'data:text/html;base64,PHNjcmlwdD4=' }).expect(400);
    await put({}).expect(400);
    await put({ image: PNG }).expect(200);
    expect((await authGet(app, '/api/v1/auth/my-signature', ownerA).expect(200)).body).toEqual({ image: PNG });
    // Another person does not see it
    expect((await authGet(app, '/api/v1/auth/my-signature', ownerB).expect(200)).body).toEqual({ image: null });
  });

  it('SIG-02: the slip keeps the signature of whoever took the job in, as it was then', async () => {
    const repair = (await authPost(app, '/api/v1/repairs', ownerA, {
      deviceBrand: 'Oppo', deviceModel: `Reno ${run}`, issue: 'แบตเสื่อม', branchId: IDS.branchA1,
    }).expect(201)).body;
    let job = (await authGet(app, `/api/v1/repairs/${repair.id}`, ownerA).expect(200)).body;
    expect(job.staffSignature).toEqual({ name: expect.any(String), image: PNG });
    expect(job.signatures).toEqual([]); // the shop's signature is not a customer signature

    // Signing again later, or removing it, does not change the job already taken in
    const put = (body: object) => request(app.getHttpServer()).put('/api/v1/auth/my-signature').set('Cookie', ownerA).send(body);
    await put({ image: PNG2 }).expect(200);
    job = (await authGet(app, `/api/v1/repairs/${repair.id}`, ownerA).expect(200)).body;
    expect(job.staffSignature.image).toBe(PNG);
    await request(app.getHttpServer()).delete('/api/v1/auth/my-signature').set('Cookie', ownerA).expect(200);
    job = (await authGet(app, `/api/v1/repairs/${repair.id}`, ownerA).expect(200)).body;
    expect(job.staffSignature.image).toBe(PNG);

    // Only the customer's signature can be sent; the shop's cannot be faked through the API
    await authPost(app, `/api/v1/repairs/${repair.id}/signatures`, ownerA, { kind: 'STAFF', image: PNG2 }).expect(400);

    // Taken in with no signature saved: a blank line to sign on paper
    const bare = (await authPost(app, '/api/v1/repairs', ownerA, {
      deviceBrand: 'Vivo', deviceModel: `Y ${run}`, issue: 'จอเสีย', branchId: IDS.branchA1,
    }).expect(201)).body;
    expect((await authGet(app, `/api/v1/repairs/${bare.id}`, ownerA).expect(200)).body.staffSignature).toBeNull();
  });
});
