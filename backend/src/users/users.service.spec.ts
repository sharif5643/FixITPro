import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { mockPrisma } from '../test/prisma-mock';

const T = 'tenant-a';
const users: Record<string, { id: string; role: string; tenantId: string; branchId: string | null }> = {
  owner:    { id: 'owner',    role: 'OWNER',   tenantId: T, branchId: null },
  mgr1:     { id: 'mgr1',     role: 'MANAGER', tenantId: T, branchId: 'b1' },
  mgr2:     { id: 'mgr2',     role: 'MANAGER', tenantId: T, branchId: 'b1' },
  cashier:  { id: 'cashier',  role: 'CASHIER', tenantId: T, branchId: 'b1' },
};

describe('UsersService — role limits for managers', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(() => {
    prisma = mockPrisma();
    prisma.user = {};
    prisma.user.findUnique = jest.fn(({ where }) => Promise.resolve(where.id ? users[where.id] ?? null : null));
    prisma.user.findFirst = jest.fn(({ where }) => Promise.resolve(users[where.id] ?? null));
    prisma.user.update = jest.fn(({ where, data }) => Promise.resolve({ ...users[where.id], ...data }));
    prisma.user.create = jest.fn(({ data }) => Promise.resolve({ id: 'new', ...data }));
    service = new UsersService(prisma, { log: jest.fn() } as any, { notify: jest.fn() } as any);
  });

  it('a manager cannot make themselves OWNER', async () => {
    await expect(service.update('mgr1', { role: 'OWNER' }, 'mgr1', T, 'm', 'MANAGER')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('a manager cannot create OWNER or MANAGER accounts', async () => {
    for (const role of ['OWNER', 'MANAGER']) {
      await expect(service.create(
        { email: `${role}@x.test`, name: 'x', password: 'p', role, branchId: 'b1' },
        { id: 'mgr1', tenantId: T, role: 'MANAGER' },
      )).rejects.toThrow(ForbiddenException);
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('a manager cannot reset, deactivate or edit another manager', async () => {
    await expect(service.resetPassword('mgr2', 'mgr1', T, 'MANAGER')).rejects.toThrow(ForbiddenException);
    await expect(service.toggleActive('mgr2', 'mgr1', T, 'MANAGER')).rejects.toThrow(ForbiddenException);
    await expect(service.update('mgr2', { name: 'x' }, 'mgr1', T, 'm', 'MANAGER')).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('a manager can still manage cashiers and edit their own name', async () => {
    const res = await service.resetPassword('cashier', 'mgr1', T, 'MANAGER');
    expect(res.tempPassword).toMatch(/^Tmp/);
    await service.update('cashier', { role: 'TECHNICIAN' }, 'mgr1', T, 'm', 'MANAGER');
    await service.update('mgr1', { name: 'New name' }, 'mgr1', T, 'm', 'MANAGER');
    await service.create(
      { email: 'c@x.test', name: 'x', password: 'p', role: 'CASHIER', branchId: 'b1' },
      { id: 'mgr1', tenantId: T, role: 'MANAGER' },
    );
  });

  it('an owner can promote staff but cannot demote themselves', async () => {
    await service.update('cashier', { role: 'MANAGER' }, 'owner', T, 'o', 'OWNER');
    await expect(service.update('owner', { role: 'MANAGER' }, 'owner', T, 'o', 'OWNER')).rejects.toThrow(ForbiddenException);
  });
});
