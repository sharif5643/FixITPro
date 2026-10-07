import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';

function ctx(user: unknown) {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}
function guard(required: string | string[]) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new PermissionGuard(reflector);
}

describe('PermissionGuard with several permissions', () => {
  it('any one of them is enough', () => {
    const g = guard(['sales.create', 'reports.view']);
    expect(g.canActivate(ctx({ role: 'CASHIER', permissions: ['sales.create'] }))).toBe(true);
    expect(g.canActivate(ctx({ role: 'MANAGER', permissions: ['reports.view'] }))).toBe(true);
    expect(() => g.canActivate(ctx({ role: 'TECHNICIAN', permissions: ['repair.edit'] }))).toThrow(ForbiddenException);
  });

  it('a single permission works as before, and the owner passes', () => {
    const g = guard('reports.view');
    expect(() => g.canActivate(ctx({ role: 'CASHIER', permissions: [] }))).toThrow(ForbiddenException);
    expect(g.canActivate(ctx({ role: 'OWNER', permissions: [] }))).toBe(true);
  });
});
