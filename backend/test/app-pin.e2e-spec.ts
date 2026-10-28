/**
 * Staff app lock: a 6-digit PIN kept (hashed) on the server. Changing it needs the old PIN or the
 * password; five wrong PINs in a row end every session of that person and remove the PIN.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Staff app lock PIN (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cashier: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    await prisma.user.update({ where: { id: IDS.userCashierA1 }, data: { appPinHash: null, appPinFailures: 0 } });
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
  });

  afterAll(async () => {
    await prisma.user.update({ where: { id: IDS.userCashierA1 }, data: { appPinHash: null, appPinFailures: 0 } });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('AP-01: no PIN at first; a weak or short PIN is refused; a good one is stored hashed', async () => {
    expect((await authGet(app, '/api/v1/auth/app-pin', cashier).expect(200)).body).toMatchObject({ hasPin: false, maxTries: 5 });
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '1234' }).expect(400);
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '111111' }).expect(400);
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '123456' }).expect(400);
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '480153' }).expect(201);
    const u = await prisma.user.findUnique({ where: { id: IDS.userCashierA1 }, select: { appPinHash: true } });
    expect(u!.appPinHash).toBeTruthy();
    expect(u!.appPinHash).not.toContain('480153');
    expect((await authGet(app, '/api/v1/auth/app-pin', cashier).expect(200)).body.hasPin).toBe(true);
  });

  it('AP-02: the right PIN opens; changing it needs the old PIN or the password', async () => {
    expect((await authPost(app, '/api/v1/auth/app-pin/verify', cashier, { pin: '480153' }).expect(201)).body).toEqual({ ok: true });
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '592714' }).expect(400);
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '592714', currentPin: '000001' }).expect(400);
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '592714', currentPin: '480153' }).expect(201);
    await authPost(app, '/api/v1/auth/app-pin', cashier, { pin: '480153', password: CREDS.cashierA1.password }).expect(201);
  });

  it('AP-03: a right PIN resets the count; five wrong in a row sign the person out everywhere', async () => {
    const wrong = async () => (await authPost(app, '/api/v1/auth/app-pin/verify', cashier, { pin: '000009' }).expect(201)).body;
    expect(await wrong()).toEqual({ ok: false, triesLeft: 4, signedOut: false });
    await authPost(app, '/api/v1/auth/app-pin/verify', cashier, { pin: '480153' }).expect(201);
    for (const left of [4, 3, 2, 1]) expect((await wrong()).triesLeft).toBe(left);
    const last = await authPost(app, '/api/v1/auth/app-pin/verify', cashier, { pin: '000009' }).expect(201);
    expect(last.body).toEqual({ ok: false, triesLeft: 0, signedOut: true });
    expect(String(last.headers['set-cookie'] ?? '')).toMatch(/refresh_token=;/);
    expect(await prisma.refreshToken.count({ where: { userId: IDS.userCashierA1, revokedAt: null } })).toBe(0);
    const u = await prisma.user.findUnique({ where: { id: IDS.userCashierA1 }, select: { appPinHash: true, appPinFailures: true } });
    expect(u).toEqual({ appPinHash: null, appPinFailures: 0 });
    // Signed in again with the password: a new PIN is set without the old one
    const again = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    expect((await authGet(app, '/api/v1/auth/app-pin', again).expect(200)).body.hasPin).toBe(false);
    await authPost(app, '/api/v1/auth/app-pin', again, { pin: '736158' }).expect(201);
  });
});
