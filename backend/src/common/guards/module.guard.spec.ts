/**
 * Modules and the owner: everyone in a shop, the owner too, gets only the shop's modules (package,
 * plus switched on, minus switched off); the super admin is never checked; several modules on one
 * route mean any one of them.
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleGuard } from './module.guard';
import { ModulesService } from '../../modules/modules.service';

function service(plan: string[], overrides: { moduleKey: string; enabled: boolean }[] = []) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ plan: 'PRO', moduleOverrides: overrides.map((o) => ({ ...o, expiresAt: null })) }) },
    packageModule: { findMany: jest.fn().mockResolvedValue(plan.map((moduleKey) => ({ moduleKey }))) },
  };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
  return new ModulesService(prisma as any, redis as any);
}
function guard(svc: ModulesService, keys: string[] | undefined, user: any) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(keys) } as unknown as Reflector;
  const ctx: any = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user }) }) };
  return new ModuleGuard(reflector, svc).canActivate(ctx);
}
const OWNER = { role: 'OWNER', tenantId: 't1' };
const CASHIER = { role: 'CASHIER', tenantId: 't1' };
const PRO = ['pos', 'repair', 'stock', 'finance', 'crm', 'line_notify', 'report', 'package_sales'];

describe('ModuleGuard', () => {
  it('MG-01: owner — a module switched off by the super admin is refused', async () => {
    const svc = service(PRO, [{ moduleKey: 'finance', enabled: false }]);
    await expect(guard(svc, ['finance'], OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard(svc, ['pos'], OWNER)).resolves.toBe(true);
  });

  it('MG-02: owner — a module not in the package is refused, unless the super admin switched it on', async () => {
    await expect(guard(service(PRO), ['user_management'], OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard(service(PRO, [{ moduleKey: 'user_management', enabled: true }]), ['user_management'], OWNER)).resolves.toBe(true);
  });

  it('MG-03: owner — accounting and owner hub need to be on', async () => {
    await expect(guard(service(PRO), ['accounting'], OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard(service(PRO, [{ moduleKey: 'owner_hub', enabled: true }]), ['owner_hub'], OWNER)).resolves.toBe(true);
  });

  it('MG-04: staff need the shop to have the module', async () => {
    await expect(guard(service(PRO), ['user_management'], CASHIER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard(service(PRO), ['pos'], CASHIER)).resolves.toBe(true);
  });

  it('MG-05: several modules on a route — any one is enough', async () => {
    const svc = service(['pos'], [{ moduleKey: 'stock', enabled: false }]);
    await expect(guard(svc, ['stock', 'pos', 'repair'], OWNER)).resolves.toBe(true);
    await expect(guard(svc, ['stock', 'pos', 'repair'], CASHIER)).resolves.toBe(true);
    await expect(guard(svc, ['stock'], OWNER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MG-06: super admin and routes without a module are not checked', async () => {
    const svc = service([], [{ moduleKey: 'pos', enabled: false }]);
    await expect(guard(svc, ['pos'], { role: 'SUPER_ADMIN', tenantId: null })).resolves.toBe(true);
    await expect(guard(svc, undefined, OWNER)).resolves.toBe(true);
  });
});
