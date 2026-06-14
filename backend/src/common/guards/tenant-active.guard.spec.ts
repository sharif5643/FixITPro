import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantActiveGuard } from './tenant-active.guard';

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
};

function makeContext(user: any, method = 'POST'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, method }),
    }),
  } as unknown as ExecutionContext;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

describe('TenantActiveGuard', () => {
  let guard: TenantActiveGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantActiveGuard,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<TenantActiveGuard>(TenantActiveGuard);
    jest.clearAllMocks();
  });

  it('should allow SUPER_ADMIN to write regardless of tenant expiry', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysFromNow(-30), // well past expiry + grace
    });
    const ctx = makeContext({ role: 'SUPER_ADMIN', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('should allow GET requests without any DB lookup', async () => {
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'GET');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('should allow writes when tenant is in grace period (3 days after expiry)', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysFromNow(-3), // expired 3 days ago — still in 7-day grace
    });
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should block writes when tenant is past the 7-day grace period', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysFromNow(-10), // expired 10 days ago — past 7-day grace
    });
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('แพ็กเกจหมดอายุแล้ว');
  });
});
