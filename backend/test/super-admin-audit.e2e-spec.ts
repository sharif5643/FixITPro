/**
 * Every Super Admin write is in the audit log (who, what, which shop), with secrets redacted.
 * Before, suspending a shop, confirming a payment or resetting an owner's password left no trace.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs } from './helpers/auth.helper';
import { IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Super Admin audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: string;
  const run = Date.now().toString(36);
  const email = `sa-audit-${run}@e2e.test`;
  const password = 'E2eTest@2026!';
  let adminId: string;

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    adminId = (await prisma.user.create({
      data: { email, name: 'SA Audit', password: await bcrypt.hash(password, 10), role: 'SUPER_ADMIN', isActive: true },
    })).id;
    app = await createTestApp();
    admin = (await loginAs(app, email, password)).cookies;
  });

  afterAll(async () => {
    await prisma.tenant.update({ where: { id: IDS.tenantB }, data: { status: 'ACTIVE' } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SA-AUDIT-01: suspending and reactivating a shop are both recorded', async () => {
    const patch = (p: string) => request(app.getHttpServer()).patch(p).set('Cookie', admin).send({});
    await patch(`/api/v1/super-admin/tenants/${IDS.tenantB}/suspend`).expect(200);
    await patch(`/api/v1/super-admin/tenants/${IDS.tenantB}/reactivate`).expect(200);

    const rows = await prisma.auditLog.findMany({
      where: { actorId: adminId, entityId: IDS.tenantB }, orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.action)).toEqual(['SUPER_ADMIN_TENANTS_SUSPEND', 'SUPER_ADMIN_TENANTS_REACTIVATE']);
    expect(rows[0].entityType).toBe('Tenants');
  });

  it('SA-AUDIT-02: reads are not logged and secrets in bodies are redacted', async () => {
    await request(app.getHttpServer()).get('/api/v1/super-admin/tenants').set('Cookie', admin).expect(200);
    expect(await prisma.auditLog.count({ where: { actorId: adminId, action: { contains: 'FIND_ALL' } } })).toBe(0);

    const { SuperAdminAuditInterceptor } = await import('../src/super-admin/super-admin-audit.interceptor');
    const logged: any[] = [];
    const interceptor = new SuperAdminAuditInterceptor({ log: async (e: any) => { logged.push(e); } } as any);
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({
        method: 'PATCH', params: { id: 't1' }, user: { id: 'u1', name: 'Admin' },
        body: { plan: 'PRO', newPassword: 'x', nested: { apiKey: 'k' } }, headers: {}, url: '/x',
      }) }),
      getClass: () => ({ name: 'SettingsController' }),
      getHandler: () => ({ name: 'update' }),
    };
    const { of, lastValueFrom } = await import('rxjs');
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of(null) }));
    expect(logged[0].afterData).toEqual({ plan: 'PRO', newPassword: '[redacted]', nested: { apiKey: '[redacted]' } });
    expect(logged[0].action).toBe('SUPER_ADMIN_SETTINGS_UPDATE');
  });
});
