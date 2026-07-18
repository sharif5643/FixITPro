/**
 * RC1.5-001 — Authentication E2E Tests
 * Exercises: POST /auth/login, GET /auth/me, cookie-based JWT auth.
 */
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp, extractCookies } from './helpers/app.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── 1. Login success ─────────────────────────────────────────────────────────

  it('AUTH-01: POST /auth/login → 201 + user object returned', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDS.ownerA)
      .expect(201);

    expect(res.body.user.email).toBe(CREDS.ownerA.email);
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.user.tenantId).toBe(IDS.tenantA);
    expect(res.body.permissions).toBeInstanceOf(Array);
    expect(res.body.permissions.length).toBeGreaterThan(0);
    // Tokens must NOT leak into response body
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    // Cookies must be set
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c: string) => c.startsWith('access_token='))).toBe(true);
  });

  // ── 2. Invalid credentials ───────────────────────────────────────────────────

  it('AUTH-02: wrong password → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: CREDS.ownerA.email, password: 'wrong_password' })
      .expect(401);
  });

  it('AUTH-03: unknown email → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@nowhere.test', password: 'whatever' })
      .expect(401);
  });

  // ── 3. Disabled user ─────────────────────────────────────────────────────────

  it('AUTH-04: disabled user → 401 (isActive=false)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDS.disabled)
      .expect(401);
  });

  // ── 4. /auth/me with valid cookie ────────────────────────────────────────────

  it('AUTH-05: GET /auth/me with valid cookie → 200 + profile', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDS.ownerA)
      .expect(201);

    const cookies = extractCookies(loginRes);
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies)
      .expect(200);

    expect(meRes.body.email).toBe(CREDS.ownerA.email);
    expect(meRes.body.role).toBe('OWNER');
  });

  // ── 5. /auth/me without token ────────────────────────────────────────────────

  it('AUTH-06: GET /auth/me without cookie → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
  });

  // ── 6. Invalid JWT ───────────────────────────────────────────────────────────

  it('AUTH-07: GET /auth/me with tampered token → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', 'access_token=this.is.not.a.valid.jwt')
      .expect(401);
  });

  // ── 7. Bearer fallback (APK compatibility) ───────────────────────────────────

  it('AUTH-08: GET /auth/me with Bearer header (APK fallback) → 200', async () => {
    // Sign a JWT directly using the JwtService from the app
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = app.get<InstanceType<typeof JwtService>>(JwtService);
    const token = jwtService.sign({
      sub:      IDS.userOwnerA,
      email:    CREDS.ownerA.email,
      role:     'OWNER',
      branchId: IDS.branchA1,
      tenantId: IDS.tenantA,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe(CREDS.ownerA.email);
  });

  // ── 8. Logout clears cookies ─────────────────────────────────────────────────

  it('AUTH-09: POST /auth/logout → 201 + clears access_token cookie', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDS.ownerA)
      .expect(201);

    const cookies = extractCookies(loginRes);
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .expect(201);

    // After logout, access_token cookie should be cleared (Max-Age=0 or empty)
    const setCookies: string[] = ([] as string[]).concat(logoutRes.headers['set-cookie'] ?? []);
    const accessCookie = setCookies.find((c: string) => c.startsWith('access_token='));
    // The cookie is cleared (either empty value or Max-Age=0)
    expect(accessCookie).toBeDefined();
    expect(accessCookie).toMatch(/access_token=;|Max-Age=0/i);
  });

  // ── 9. Different tenant users get correct tenantId ───────────────────────────

  it('AUTH-10: Tenant B owner login returns tenantId=tenantB', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDS.ownerB)
      .expect(201);

    expect(res.body.user.tenantId).toBe(IDS.tenantB);
  });

  // ── 10. DTO validation on login ──────────────────────────────────────────────

  it('AUTH-11: POST /auth/login missing email → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ password: 'something' })
      .expect(400);
  });

  it('AUTH-12: POST /auth/login missing password → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com' })
      .expect(400);
  });
});
