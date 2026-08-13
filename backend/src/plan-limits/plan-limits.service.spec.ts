import { BadRequestException } from '@nestjs/common';
import { PlanLimitsService, PLAN_LIMITS } from './plan-limits.service';

// ── Minimal prisma mock scoped to plan-limits needs ───────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    tenant:      { findUnique: jest.fn() },
    branch:      { count: jest.fn() },
    tenantAddon: { findMany: jest.fn().mockResolvedValue([]) },
    repairImage: { aggregate: jest.fn() },
    ...overrides,
  } as any;
}

function makeService(prisma: any) {
  return new PlanLimitsService(prisma);
}

// ── PLAN_LIMITS constant ───────────────────────────────────────────────────────

describe('PLAN_LIMITS constant', () => {
  it('TRIAL and LITE share the same limits', () => {
    expect(PLAN_LIMITS.TRIAL).toEqual(PLAN_LIMITS.LITE);
  });

  it('PRO has more storage than LITE', () => {
    expect(PLAN_LIMITS.PRO.storageBytes).toBeGreaterThan(PLAN_LIMITS.LITE.storageBytes);
  });

  it('BUSINESS has more branches than PRO', () => {
    expect(PLAN_LIMITS.BUSINESS.branches).toBeGreaterThan(PLAN_LIMITS.PRO.branches);
  });

  it('PRIVATE has infinite branches and storage', () => {
    expect(PLAN_LIMITS.PRIVATE.branches).toBe(Infinity);
    expect(PLAN_LIMITS.PRIVATE.storageBytes).toBe(Infinity);
  });
});

// ── assertBranchLimit ─────────────────────────────────────────────────────────

describe('PlanLimitsService.assertBranchLimit', () => {
  it('allows creation when below branch limit', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' });
    prisma.branch.count.mockResolvedValue(0); // 0 branches, limit=1
    const svc = makeService(prisma);

    await expect(svc.assertBranchLimit('t1')).resolves.toBeUndefined();
  });

  it('throws when at branch limit', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' });
    prisma.branch.count.mockResolvedValue(1); // 1 branch, limit=1 → at limit
    const svc = makeService(prisma);

    await expect(svc.assertBranchLimit('t1')).rejects.toThrow(BadRequestException);
    await expect(svc.assertBranchLimit('t1')).rejects.toThrow('LITE');
  });

  it('allows creation when BUSINESS tenant has 2 branches (limit=3)', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'BUSINESS' });
    prisma.branch.count.mockResolvedValue(2);
    const svc = makeService(prisma);

    await expect(svc.assertBranchLimit('t1')).resolves.toBeUndefined();
  });

  it('PRIVATE plan skips limit check entirely', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'PRIVATE' });
    // branch.count should not even be called
    const svc = makeService(prisma);

    await expect(svc.assertBranchLimit('t1')).resolves.toBeUndefined();
    expect(prisma.branch.count).not.toHaveBeenCalled();
  });

  it('skips check when tenant not found (no-op)', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    await expect(svc.assertBranchLimit('nonexistent')).resolves.toBeUndefined();
  });

  it('add-on BRANCH stacks on top of base limit', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' }); // base limit=1
    prisma.tenantAddon.findMany.mockResolvedValue([
      { type: 'BRANCH', quantity: 2 }, // +2 → effective limit=3
    ]);
    prisma.branch.count.mockResolvedValue(2); // 2 branches, limit now 3 → allowed
    const svc = makeService(prisma);

    await expect(svc.assertBranchLimit('t1')).resolves.toBeUndefined();
  });
});

// ── assertStorageLimit ────────────────────────────────────────────────────────

describe('PlanLimitsService.assertStorageLimit', () => {
  const GB = 1024 ** 3;

  it('allows upload within quota', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' }); // limit=5 GB
    prisma.repairImage.aggregate.mockResolvedValue({ _sum: { fileSize: 1 * GB } }); // 1 GB used
    const svc = makeService(prisma);

    // Upload 100 MB — still within 5 GB
    await expect(svc.assertStorageLimit('t1', 100 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('throws when upload would exceed quota', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' }); // limit=5 GB
    prisma.repairImage.aggregate.mockResolvedValue({ _sum: { fileSize: 4.9 * GB } }); // 4.9 GB used
    const svc = makeService(prisma);

    // Upload 200 MB → total 5.1 GB > limit
    await expect(svc.assertStorageLimit('t1', 200 * 1024 * 1024)).rejects.toThrow(BadRequestException);
    await expect(svc.assertStorageLimit('t1', 200 * 1024 * 1024)).rejects.toThrow('5 GB');
  });

  it('PRIVATE plan skips storage check', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'PRIVATE' });
    const svc = makeService(prisma);

    await expect(svc.assertStorageLimit('t1', 999 * GB)).resolves.toBeUndefined();
    expect(prisma.repairImage.aggregate).not.toHaveBeenCalled();
  });

  it('treats NULL fileSize rows as 0 bytes used', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' });
    prisma.repairImage.aggregate.mockResolvedValue({ _sum: { fileSize: null } }); // no fileSize rows
    const svc = makeService(prisma);

    await expect(svc.assertStorageLimit('t1', 1 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('STORAGE_GB add-on increases effective quota', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'LITE' }); // base=5 GB
    prisma.tenantAddon.findMany.mockResolvedValue([
      { type: 'STORAGE_GB', quantity: 10 }, // +10 GB → effective 15 GB
    ]);
    prisma.repairImage.aggregate.mockResolvedValue({ _sum: { fileSize: 5 * GB } }); // 5 GB used
    const svc = makeService(prisma);

    // Upload 9 GB — within 15 GB effective quota
    await expect(svc.assertStorageLimit('t1', 9 * GB)).resolves.toBeUndefined();
  });
});

// ── getUsageSummary ───────────────────────────────────────────────────────────

describe('PlanLimitsService.getUsageSummary', () => {
  it('returns correct branch usage and null limit for PRIVATE plan', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'PRIVATE' });
    prisma.branch.count.mockResolvedValue(7);
    prisma.repairImage.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
    const svc = makeService(prisma);

    const result = await svc.getUsageSummary('t1');

    expect(result.plan).toBe('PRIVATE');
    expect(result.branches.used).toBe(7);
    expect(result.branches.limit).toBeNull();
    expect(result.branches.isUnlimited).toBe(true);
    expect(result.storage.isUnlimited).toBe(true);
    expect(result.storage.limitGB).toBeNull();
  });

  it('returns percentUsed correctly for finite storage', async () => {
    const GB = 1024 ** 3;
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ plan: 'PRO' }); // 30 GB
    prisma.branch.count.mockResolvedValue(1);
    prisma.repairImage.aggregate.mockResolvedValue({ _sum: { fileSize: 15 * GB } }); // 50%
    const svc = makeService(prisma);

    const result = await svc.getUsageSummary('t1');

    expect(result.storage.percentUsed).toBe(50);
    expect(result.storage.limitGB).toBe(30);
  });
});
