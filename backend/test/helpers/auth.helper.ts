import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { extractCookies } from './app.helper';

export interface LoginResult {
  cookies: string;
  user: { id: string; email: string; role: string; tenantId: string | null };
}

/** Login via HTTP and return cookies + user info. */
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);

  return {
    cookies: extractCookies(res),
    user: res.body.user,
  };
}

/** Shorthand: authenticated GET. */
export function authGet(app: INestApplication, path: string, cookies: string) {
  return request(app.getHttpServer())
    .get(path)
    .set('Cookie', cookies);
}

/** Shorthand: authenticated POST. */
export function authPost(
  app: INestApplication,
  path: string,
  cookies: string,
  body: object = {},
) {
  return request(app.getHttpServer())
    .post(path)
    .set('Cookie', cookies)
    .send(body);
}

/** Shorthand: authenticated PATCH. */
export function authPatch(
  app: INestApplication,
  path: string,
  cookies: string,
  body: object = {},
) {
  return request(app.getHttpServer())
    .patch(path)
    .set('Cookie', cookies)
    .send(body);
}
