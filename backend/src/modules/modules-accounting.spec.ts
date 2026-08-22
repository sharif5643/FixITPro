/**
 * Phase 4B.6D/4B.6E — Module accounting tests (A-M + N1-N10)
 *
 * Tests cover:
 *  A-B:   SUPER_ADMIN enable/disable via ModulesService
 *  C-D:   Role guard — non-SUPER_ADMIN blocked (RolesGuard unit tests)
 *  E:     Unknown module → NotFoundException
 *  F:     Unknown tenant → NotFoundException
 *  G:     Idempotent enable (upsert called twice = no error)
 *  H:     Accounting OFF → isAccountingEnabled returns false
 *  I:     Accounting ON via DB TenantModule → returns true
 *  J/J2:  Legacy pilot tenant via env var → remains enabled
 *  K:     Audit log MODULE_ENABLED written
 *  L:     Audit log MODULE_DISABLED written
 *  M:     Fail-closed: ghost tenant → false
 *  N1:    RolesGuard blocks OWNER role
 *  N2:    RolesGuard blocks CASHIER role
 *  N3:    Idempotent disable (upsert called twice)
 *  N4:    ACCOUNTING_CORE_ENABLED=false (explicit) → disabled
 *  N5:    ACCOUNTING_CORE_ENABLED=true + absent list → fail-closed
 *  N6:    removeTenantModuleOverride → MODULE_OVERRIDE_REMOVED audit log
 *  N7:    removeTenantModuleOverride → cache invalidated
 *  N8:    Cross-tenant: tenant A enabled ≠ tenant B affected
 *  N9:    Audit afterData contains ONLY { moduleKey, enabled } — no sensitive fields
 *  N10:   Env var star (*) → any tenant enabled (no DB call)
 */
import { RolesGuard } from '../common/guards/roles.guard';
import { ModulesService } from './modules.service';

// ── Prisma mock factory ───────────────────────────────────────────────────────

function makeTenant(id = 'tenant-1') {
  return { id, plan: 'BUSINESS' };
}

function makeModule(key = 'accounting') {
  return { key, name: 'Accounting (บัญชี)' };
}

function makeOverride(tenantId: string, moduleKey: string, enabled: boolean) {
  return { tenantId, moduleKey, enabled, expiresAt: null };
}

type PrismaMock = {
  tenant:       { findUnique: jest.Mock };
  appModule:    { findUnique: jest.Mock };
  tenantModule: { upsert: jest.Mock; delete: jest.Mock; findUnique: jest.Mock };
  packageModule: { findMany: jest.Mock };
  auditLog:     { create: jest.Mock };
};

function makePrismaMock(): PrismaMock {
  return {
    tenant:       { findUnique: jest.fn() },
    appModule:    { findUnique: jest.fn() },
    tenantModule: {
      upsert:     jest.fn(),
      delete:     jest.fn(),
      findUnique: jest.fn(),
    },
    packageModule: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog:      { create: jest.fn().mockResolvedValue({}) },
  };
}

type RedisMock = { get: jest.Mock; set: jest.Mock; del: jest.Mock };

function makeRedisMock(): RedisMock {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prismaMock: PrismaMock, redisMock: RedisMock): ModulesService {
  return new ModulesService(prismaMock as any, redisMock as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ModulesService — accounting integration (Phase 4B.6D)', () => {
  let prisma:  PrismaMock;
  let redis:   RedisMock;
  let service: ModulesService;

  beforeEach(() => {
    prisma  = makePrismaMock();
    redis   = makeRedisMock();
    service = makeService(prisma, redis);
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  afterEach(() => {
    delete process.env.ACCOUNTING_CORE_ENABLED;
    delete process.env.ACCOUNTING_ENABLED_TENANTS;
  });

  // ── A: SUPER_ADMIN can enable accounting ──────────────────────────────────

  it('A: setTenantModuleOverride enables accounting → upserts record + invalidates cache', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', true));

    const result = await service.setTenantModuleOverride('tenant-1', 'accounting', true);

    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ enabled: true, moduleKey: 'accounting' }) }),
    );
    expect(redis.del).toHaveBeenCalledWith('module_cache:tenant-1');
    expect(result).toMatchObject({ enabled: true, moduleKey: 'accounting' });
  });

  // ── B: SUPER_ADMIN can disable accounting ─────────────────────────────────

  it('B: setTenantModuleOverride disables accounting → upserts with enabled=false', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', false));

    const result = await service.setTenantModuleOverride('tenant-1', 'accounting', false);

    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ enabled: false }) }),
    );
    expect(result).toMatchObject({ enabled: false });
  });

  // ── E: Unknown module → NotFoundException ────────────────────────────────

  it('E: unknown moduleKey → throws NotFoundException', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(null); // module not found

    await expect(
      service.setTenantModuleOverride('tenant-1', 'nonexistent_module', true),
    ).rejects.toThrow("Module 'nonexistent_module' not found");
  });

  // ── F: Unknown tenant → NotFoundException ────────────────────────────────

  it('F: unknown tenantId → throws NotFoundException', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null); // tenant not found
    prisma.appModule.findUnique.mockResolvedValue(makeModule());

    await expect(
      service.setTenantModuleOverride('no-such-tenant', 'accounting', true),
    ).rejects.toThrow('Tenant not found');
  });

  // ── G: Idempotent enable (upsert) ────────────────────────────────────────

  it('G: calling setTenantModuleOverride twice → upsert is called twice (idempotent)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', true));

    await service.setTenantModuleOverride('tenant-1', 'accounting', true);
    await service.setTenantModuleOverride('tenant-1', 'accounting', true);

    expect(prisma.tenantModule.upsert).toHaveBeenCalledTimes(2);
  });

  // ── H: Accounting OFF → isAccountingEnabled returns false ─────────────────

  it('H: no env var, no DB record → isAccountingEnabled returns false (fail-closed)', async () => {
    // getEnabledModules: tenant found but accounting not in enabled list
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', plan: 'BUSINESS', moduleOverrides: [] });
    prisma.packageModule.findMany.mockResolvedValue([]); // no package modules

    const result = await service.isAccountingEnabled('tenant-1');

    expect(result).toBe(false);
  });

  // ── I: Accounting ON via DB module ────────────────────────────────────────

  it('I: DB TenantModule override enabled=true → isAccountingEnabled returns true', async () => {
    // getEnabledModules returns ['accounting'] via override
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      plan: 'BUSINESS',
      moduleOverrides: [{ moduleKey: 'accounting', enabled: true, expiresAt: null }],
    });
    prisma.packageModule.findMany.mockResolvedValue([]);

    const result = await service.isAccountingEnabled('tenant-1');

    expect(result).toBe(true);
  });

  // ── J: Pilot tenant via env var (backward compat) ─────────────────────────

  it('J: ACCOUNTING_CORE_ENABLED=true + tenant in list → isAccountingEnabled true (env var path)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'pilot-abc,tenant-xyz';

    const result = await service.isAccountingEnabled('pilot-abc');

    expect(result).toBe(true);
    // DB path should NOT be called (env var short-circuits)
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  // ── K: Audit log written on MODULE_ENABLED ────────────────────────────────

  it('K: setTenantModuleOverride with enabled=true → auditLog.create called with MODULE_ENABLED', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', true));

    await service.setTenantModuleOverride(
      'tenant-1', 'accounting', true, undefined, 'actor-id-1', 'Admin User',
    );

    // Give the fire-and-forget a tick to execute
    await new Promise((r) => setImmediate(r));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:     'MODULE_ENABLED',
          entityType: 'TenantModule',
          entityId:   'tenant-1',
          actorId:    'actor-id-1',
          actorName:  'Admin User',
          afterData:  { moduleKey: 'accounting', enabled: true },
        }),
      }),
    );
  });

  // ── L: Audit log written on MODULE_DISABLED ───────────────────────────────

  it('L: setTenantModuleOverride with enabled=false → auditLog.create called with MODULE_DISABLED', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', false));

    await service.setTenantModuleOverride(
      'tenant-1', 'accounting', false, undefined, 'actor-id-1', 'Admin User',
    );

    await new Promise((r) => setImmediate(r));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:    'MODULE_DISABLED',
          afterData: { moduleKey: 'accounting', enabled: false },
        }),
      }),
    );
  });

  // ── M: Fail-closed: tenant not in DB → false ─────────────────────────────

  it('M: tenant not found in DB → isAccountingEnabled returns false (fail-closed)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null); // getEnabledModules returns []

    const result = await service.isAccountingEnabled('ghost-tenant-id');

    expect(result).toBe(false);
  });

  // ── Pilot tenant not disabled by adding DB check ─────────────────────────

  it('J2: pilot tenant in env var still enabled even if no DB TenantModule record', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'cmsc05do8001u7i29q3p5x6zp';

    const result = await service.isAccountingEnabled('cmsc05do8001u7i29q3p5x6zp');

    expect(result).toBe(true);
    // env var short-circuits — no DB call
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  // ── N3: Idempotent disable ────────────────────────────────────────────────

  it('N3: setTenantModuleOverride with enabled=false called twice → upsert called twice, no error', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', false));

    await service.setTenantModuleOverride('tenant-1', 'accounting', false);
    await service.setTenantModuleOverride('tenant-1', 'accounting', false);

    expect(prisma.tenantModule.upsert).toHaveBeenCalledTimes(2);
    // Both upserts target the same record — upsert is idempotent at DB level
    const calls = prisma.tenantModule.upsert.mock.calls;
    expect(calls[0][0].create).toMatchObject({ enabled: false, moduleKey: 'accounting' });
    expect(calls[1][0].create).toMatchObject({ enabled: false, moduleKey: 'accounting' });
  });

  // ── N4: ACCOUNTING_CORE_ENABLED=false (explicit) → disabled ──────────────

  it('N4: ACCOUNTING_CORE_ENABLED=false (explicit value) → legacyEnvEnabled returns false', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'false';
    process.env.ACCOUNTING_ENABLED_TENANTS = 'tenant-1';

    // No DB record for this tenant
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', plan: 'BASIC', moduleOverrides: [] });
    prisma.packageModule.findMany.mockResolvedValue([]);

    const result = await service.isAccountingEnabled('tenant-1');

    expect(result).toBe(false);
  });

  // ── N5: CORE=true + absent list → fail-closed ─────────────────────────────

  it('N5: ACCOUNTING_CORE_ENABLED=true + no ACCOUNTING_ENABLED_TENANTS → fail-closed', async () => {
    process.env.ACCOUNTING_CORE_ENABLED = 'true';
    // ACCOUNTING_ENABLED_TENANTS not set
    delete process.env.ACCOUNTING_ENABLED_TENANTS;

    // No DB override either
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-x', plan: 'BASIC', moduleOverrides: [] });
    prisma.packageModule.findMany.mockResolvedValue([]);

    const result = await service.isAccountingEnabled('tenant-x');

    expect(result).toBe(false);
  });

  // ── N6: removeTenantModuleOverride → MODULE_OVERRIDE_REMOVED audit log ────

  it('N6: removeTenantModuleOverride → audit log MODULE_OVERRIDE_REMOVED with actorId', async () => {
    prisma.tenantModule.findUnique.mockResolvedValue(
      makeOverride('tenant-1', 'accounting', true),
    );
    prisma.tenantModule.delete.mockResolvedValue({});

    await service.removeTenantModuleOverride('tenant-1', 'accounting', 'actor-sa-1', 'SuperAdmin');

    await new Promise((r) => setImmediate(r));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action:     'MODULE_OVERRIDE_REMOVED',
          entityType: 'TenantModule',
          entityId:   'tenant-1',
          actorId:    'actor-sa-1',
          actorName:  'SuperAdmin',
          afterData:  { moduleKey: 'accounting' },
        }),
      }),
    );
    expect(prisma.auditLog.create.mock.calls[0][0].data).not.toHaveProperty('password');
    expect(prisma.auditLog.create.mock.calls[0][0].data).not.toHaveProperty('token');
  });

  // ── N7: removeTenantModuleOverride → cache invalidated ────────────────────

  it('N7: removeTenantModuleOverride → Redis cache for tenant is deleted', async () => {
    prisma.tenantModule.findUnique.mockResolvedValue(
      makeOverride('tenant-cache-test', 'accounting', true),
    );
    prisma.tenantModule.delete.mockResolvedValue({});

    await service.removeTenantModuleOverride('tenant-cache-test', 'accounting');

    expect(redis.del).toHaveBeenCalledWith('module_cache:tenant-cache-test');
  });

  // ── N8: Cross-tenant isolation ────────────────────────────────────────────

  it('N8: enabling tenant A does not enable tenant B', async () => {
    // Tenant A: accounting enabled via override
    prisma.tenant.findUnique.mockImplementation((args: any) => {
      if (args.where?.id === 'tenant-a') {
        return Promise.resolve({
          id: 'tenant-a', plan: 'BUSINESS',
          moduleOverrides: [{ moduleKey: 'accounting', enabled: true, expiresAt: null }],
        });
      }
      if (args.where?.id === 'tenant-b') {
        return Promise.resolve({
          id: 'tenant-b', plan: 'BUSINESS',
          moduleOverrides: [], // no accounting override
        });
      }
      return Promise.resolve(null);
    });
    prisma.packageModule.findMany.mockResolvedValue([]);

    const tenantAEnabled = await service.isAccountingEnabled('tenant-a');
    const tenantBEnabled = await service.isAccountingEnabled('tenant-b');

    expect(tenantAEnabled).toBe(true);
    expect(tenantBEnabled).toBe(false);
  });

  // ── N9: Audit log afterData contains no sensitive fields ─────────────────

  it('N9: audit log afterData only contains { moduleKey, enabled } — no sensitive data', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.appModule.findUnique.mockResolvedValue(makeModule());
    prisma.tenantModule.upsert.mockResolvedValue(makeOverride('tenant-1', 'accounting', true));

    await service.setTenantModuleOverride(
      'tenant-1', 'accounting', true, undefined, 'actor-1', 'Admin',
    );
    await new Promise((r) => setImmediate(r));

    const loggedData = prisma.auditLog.create.mock.calls[0][0].data;
    expect(Object.keys(loggedData.afterData)).toEqual(['moduleKey', 'enabled']);
    expect(loggedData).not.toHaveProperty('password');
    expect(loggedData).not.toHaveProperty('token');
    expect(loggedData).not.toHaveProperty('secret');
    expect(loggedData).not.toHaveProperty('hash');
  });

  // ── N10: Env var star (*) → any tenant enabled without DB call ───────────

  it('N10: ACCOUNTING_ENABLED_TENANTS=* → any tenant enabled (env var short-circuits, no DB call)', async () => {
    process.env.ACCOUNTING_CORE_ENABLED    = 'true';
    process.env.ACCOUNTING_ENABLED_TENANTS = '*';

    const resultA = await service.isAccountingEnabled('any-tenant-a');
    const resultB = await service.isAccountingEnabled('any-tenant-b');
    const resultGhost = await service.isAccountingEnabled('ghost-that-does-not-exist');

    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
    expect(resultGhost).toBe(true);
    // env var short-circuits — no DB calls at all
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});

// ── N1-N2: RolesGuard unit tests — non-SUPER_ADMIN blocked ──────────────────

describe('RolesGuard — accounting module access control', () => {
  let guard: RolesGuard;

  function makeReflector(roles: string[] | undefined) {
    return {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as any;
  }

  function makeContext(userRole: string | undefined) {
    return {
      getHandler:  () => ({}),
      getClass:    () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: userRole !== undefined ? { role: userRole } : undefined }),
      }),
    } as any;
  }

  it('N1: OWNER role cannot access SUPER_ADMIN module endpoint → canActivate returns false', () => {
    guard = new RolesGuard(makeReflector(['SUPER_ADMIN']));
    expect(guard.canActivate(makeContext('OWNER'))).toBe(false);
  });

  it('N2: CASHIER role cannot access SUPER_ADMIN module endpoint → canActivate returns false', () => {
    guard = new RolesGuard(makeReflector(['SUPER_ADMIN']));
    expect(guard.canActivate(makeContext('CASHIER'))).toBe(false);
  });

  it('N2b: MANAGER role is blocked', () => {
    guard = new RolesGuard(makeReflector(['SUPER_ADMIN']));
    expect(guard.canActivate(makeContext('MANAGER'))).toBe(false);
  });

  it('N2c: SUPER_ADMIN role passes', () => {
    guard = new RolesGuard(makeReflector(['SUPER_ADMIN']));
    expect(guard.canActivate(makeContext('SUPER_ADMIN'))).toBe(true);
  });

  it('N2d: unauthenticated request (no user) → blocked', () => {
    guard = new RolesGuard(makeReflector(['SUPER_ADMIN']));
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});
