/**
 * The owner resets a staff member's password (account taken over, or the person left): every
 * sign-in from before the reset ends at once — the current access token is refused and the
 * refresh token can no longer renew it. Signing in with the new temporary password works.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS } from './helpers/seed.helper';

describe('Password reset ends old sign-ins (e2e)', () => {
  let app: INestApplication;
  let owner: string;
  const run = Date.now().toString(36);
  const pw = 'Staff@2026!x';

  beforeAll(async () => {
    app = await createTestApp();
    owner = (await loginAs(app, CREDS.ownerA.email, CREDS.ownerA.password)).cookies;
  });
  afterAll(async () => { await app?.close(); });

  it('SESS-01: after a reset the old access and refresh tokens are refused; the new password works', async () => {
    const email = `sess-${run}@e2e.test`;
    const id = (await authPost(app, '/api/v1/users', owner, { email, name: `Sess ${run}`, password: pw, role: 'CASHIER', branchId: IDS.branchA1 }).expect(201)).body.id;
    const old = (await loginAs(app, email, pw)).cookies;
    await authGet(app, '/api/v1/auth/me', old).expect(200);

    // tokens carry their issue time in whole seconds: the reset must come after
    await new Promise((r) => setTimeout(r, 1100));
    const temp = (await request(app.getHttpServer()).patch(`/api/v1/users/${id}/reset-password`).set('Cookie', owner).expect(200)).body.tempPassword;
    expect(temp).toBeTruthy();

    await authGet(app, '/api/v1/auth/me', old).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', old).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));

    const fresh = (await loginAs(app, email, temp)).cookies;
    await authGet(app, '/api/v1/auth/me', fresh).expect(200);
  });
});
