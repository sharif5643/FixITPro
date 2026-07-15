import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantActiveGuard } from './tenant-active.guard';

// GRACE_DAYS = 2 (production code in tenant-active.guard.ts)
// Grace window: [expiryDate, expiryDate + 2 days)
// expired 0–1 days ago → allowed (within grace)
// expired 2+ days ago  → blocked (grace ended)

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

// Creates a date that is `days` calendar days ago PLUS `extraMinutes` minutes
// in the past — useful for boundary tests where setDate alone produces a date
// too close to "now" for a reliable > comparison.
function daysAndMinutesAgo(days: number, extraMinutes: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setMinutes(d.getMinutes() - extraMinutes);
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
      expiryDate: daysFromNow(-30),
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

  it('should allow writes when tenant expired 1 day ago (within 2-day grace)', async () => {
    // gracePeriodEnd = expiryDate + 2 days = tomorrow → now < tomorrow → allowed
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysFromNow(-1),
    });
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should block writes when tenant expired 2 days ago (grace boundary — blocked)', async () => {
    // gracePeriodEnd = expiryDate + 2 days = now - 1 min → now > gracePeriodEnd → blocked
    // Using daysAndMinutesAgo(2, 1) avoids same-millisecond flakiness from setDate alone.
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysAndMinutesAgo(2, 1),
    });
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('แพ็กเกจหมดอายุแล้ว');
  });

  it('should block writes when tenant expired 3 days ago (past 2-day grace)', async () => {
    // gracePeriodEnd = expiryDate + 2 days = yesterday → now > yesterday → blocked
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysFromNow(-3),
    });
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('แพ็กเกจหมดอายุแล้ว');
  });

  it('should block writes when tenant is well past the grace period', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      expiryDate: daysFromNow(-10),
    });
    const ctx = makeContext({ role: 'OWNER', tenantId: 't1' }, 'POST');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('แพ็กเกจหมดอายุแล้ว');
  });
});
