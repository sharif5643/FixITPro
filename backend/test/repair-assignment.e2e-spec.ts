/**
 * Front desk receives a repair and hands it to a technician.
 * The technician gets a notification nobody else sees, and a repair can only be given to an
 * active technician / manager / owner of the same shop.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Repair assignment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: string;
  let tech: string;
  let cashier: string;
  let manager: string;
  const patch = (cookie: string, p: string, b: object) =>
    request(app.getHttpServer()).patch(p).set('Cookie', cookie).send(b);
  const assignedTo = async (cookie: string, repairId: string) =>
    ((await authGet(app, '/api/v1/notifications?limit=100', cookie).expect(200)).body.items as any[])
      .filter((n) => n.type === 'REPAIR_ASSIGNED' && n.entityId === repairId);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    owner   = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
    tech    = (await loginAs(app, CREDS.techA1.email, CREDS.techA1.password)).cookies;
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    manager = (await loginAs(app, CREDS.managerA1.email, CREDS.managerA1.password)).cookies;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ASSIGN-01: the assigned technician is notified; nobody else sees it', async () => {
    const repair = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Samsung', deviceModel: 'Assign', issue: 'จอแตก', branchId: IDS.branchA1,
      technicianId: IDS.userTechA1,
    }).expect(201)).body;

    const forTech = await assignedTo(tech, repair.id);
    expect(forTech).toHaveLength(1);
    expect(forTech[0].message).toContain(repair.ticketNumber);

    expect(await assignedTo(cashier, repair.id)).toHaveLength(0);
    expect(await assignedTo(manager, repair.id)).toHaveLength(0);
    expect(await assignedTo(owner, repair.id)).toHaveLength(0);
  });

  it('ASSIGN-02: reassigning from the board notifies the new technician', async () => {
    const repair = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Apple', deviceModel: 'Later', issue: 'แบต', branchId: IDS.branchA1,
    }).expect(201)).body;
    expect(await assignedTo(tech, repair.id)).toHaveLength(0);

    await patch(owner, `/api/v1/repairs/${repair.id}`, { technicianId: IDS.userTechA1 }).expect(200);
    expect(await assignedTo(tech, repair.id)).toHaveLength(1);

    // Un-assigning is allowed and sends nothing new
    await patch(owner, `/api/v1/repairs/${repair.id}`, { technicianId: null }).expect(200);
    expect(await assignedTo(tech, repair.id)).toHaveLength(1);
  });

  it('ASSIGN-03: only a technician / manager / owner of the same shop can be assigned', async () => {
    // Another shop's owner
    await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'X', deviceModel: 'Other shop', issue: 'x', branchId: IDS.branchA1,
      technicianId: IDS.userOwnerB,
    }).expect(400);

    const repair = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'X', deviceModel: 'Roles', issue: 'x', branchId: IDS.branchA1,
    }).expect(201)).body;
    // A cashier is not a technician
    await patch(owner, `/api/v1/repairs/${repair.id}`, { technicianId: IDS.userCashierA1 }).expect(400);
    // A disabled account cannot take work
    await patch(owner, `/api/v1/repairs/${repair.id}`, { technicianId: IDS.userDisabled }).expect(400);
    // A manager can
    await patch(owner, `/api/v1/repairs/${repair.id}`, { technicianId: IDS.userManagerA1 }).expect(200);
  });

  it('ASSIGN-04: a technician taking an open job does not notify themselves', async () => {
    const repair = (await authPost(app, '/api/v1/repairs', owner, {
      deviceBrand: 'Oppo', deviceModel: 'Self', issue: 'x', branchId: IDS.branchA1,
    }).expect(201)).body;
    await patch(tech, `/api/v1/repairs/${repair.id}`, { technicianId: IDS.userTechA1 }).expect(200);
    expect(await assignedTo(tech, repair.id)).toHaveLength(0);
  });

  it('ASSIGN-05: staff-management alerts are hidden from technicians and cashiers', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/forgot-password')
      .send({ email: CREDS.cashierA1.email }).expect((r) => expect([200, 201]).toContain(r.status));
    const types = async (cookie: string) =>
      ((await authGet(app, '/api/v1/notifications?limit=100', cookie).expect(200)).body.items as any[]).map((n) => n.type);
    expect(await types(owner)).toContain('PASSWORD_RESET_REQUEST');
    expect(await types(manager)).toContain('PASSWORD_RESET_REQUEST');
    expect(await types(tech)).not.toContain('PASSWORD_RESET_REQUEST');
    expect(await types(cashier)).not.toContain('PASSWORD_RESET_REQUEST');
  });
});
