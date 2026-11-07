import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ALL_MODULE_KEYS, MODULE_KEYS } from './modules.const';

const CACHE_TTL_SEC = 5 * 60; // 5 minutes
// v2: { on, off } — the shop's modules, and those the super admin switched off for it
const cacheKey = (tenantId: string) => `module_cache:v2:${tenantId}`;


@Injectable()
export class ModulesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getEnabledModules(tenantId: string | null): Promise<string[]> {
    // No tenant (SUPER_ADMIN or standalone) → all modules
    if (!tenantId) return ALL_MODULE_KEYS;
    return (await this.moduleState(tenantId)).on;
  }

  /**
   * The modules a person may use: the shop's modules (its package, plus what the super admin
   * switched on, minus what the super admin switched off) — for everyone in the shop, the owner
   * included. Only the super admin, who belongs to no shop, gets every module.
   */
  async getModulesFor(role: string | null | undefined, tenantId: string | null): Promise<string[]> {
    if (!tenantId || role === 'SUPER_ADMIN') return ALL_MODULE_KEYS;
    return (await this.moduleState(tenantId)).on;
  }

  private async moduleState(tenantId: string): Promise<{ on: string[]; off: string[] }> {
    const raw = await this.redis.get(cacheKey(tenantId));
    if (raw) {
      const v = JSON.parse(raw);
      if (v && Array.isArray(v.on) && Array.isArray(v.off)) return v;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plan: true,
        moduleOverrides: { select: { moduleKey: true, enabled: true, expiresAt: true } },
      },
    });

    if (!tenant) return { on: [], off: [] };

    const on = await this.applyOverrides(tenant.plan, tenant.moduleOverrides);
    const now = new Date();
    const off = tenant.moduleOverrides
      .filter((o) => !o.enabled && !(o.expiresAt && o.expiresAt < now))
      .map((o) => o.moduleKey);
    const state = { on, off };
    await this.redis.set(cacheKey(tenantId), JSON.stringify(state), CACHE_TTL_SEC);
    return state;
  }

  /**
   * The modules a shop would have on a given plan, with its own overrides kept. Used to show
   * what a shop would gain or lose by renewing onto another plan.
   */
  async modulesForPlan(tenantId: string, plan: string): Promise<string[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { moduleOverrides: { select: { moduleKey: true, enabled: true, expiresAt: true } } },
    });
    return this.applyOverrides(plan, tenant?.moduleOverrides ?? []);
  }

  /** The package's modules, then the shop's overrides (expired overrides are ignored). */
  private async applyOverrides(
    plan: string,
    overrides: { moduleKey: string; enabled: boolean; expiresAt: Date | null }[],
  ): Promise<string[]> {
    const packageModules = await this.prisma.packageModule.findMany({
      where: { packageKey: plan },
      select: { moduleKey: true },
    });
    const enabled = new Set(packageModules.map((pm) => pm.moduleKey));
    const now = new Date();
    for (const override of overrides) {
      if (override.expiresAt && override.expiresAt < now) continue;
      if (override.enabled) enabled.add(override.moduleKey);
      else enabled.delete(override.moduleKey);
    }
    return Array.from(enabled);
  }

  async invalidateCache(tenantId: string) {
    await this.redis.del(cacheKey(tenantId));
  }

  // ── Accounting module check (used by accounting adapters) ───────────────────

  async isAccountingEnabled(tenantId: string): Promise<boolean> {
    if (this.legacyEnvEnabled(tenantId)) return true;
    try {
      const modules = await this.getEnabledModules(tenantId);
      return modules.includes(MODULE_KEYS.ACCOUNTING);
    } catch {
      return false; // fail-closed
    }
  }

  private legacyEnvEnabled(tenantId: string): boolean {
    if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false;
    const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
    if (!raw) return false;
    if (raw === '*') return true;
    return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(tenantId);
  }

  // ── Super Admin: Module Registry ────────────────────────────────────────────

  async getAllModules() {
    return this.prisma.appModule.findMany({ orderBy: { key: 'asc' } });
  }

  // ── Super Admin: Package CRUD ───────────────────────────────────────────────

  async getAllPackages() {
    return this.prisma.package.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { modules: { select: { moduleKey: true } } },
    });
  }

  async getPackage(key: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { key },
      include: { modules: { select: { moduleKey: true } } },
    });
    if (!pkg) throw new NotFoundException(`Package '${key}' not found`);
    return pkg;
  }

  async setPackageModules(packageKey: string, moduleKeys: string[]) {
    const pkg = await this.prisma.package.findUnique({ where: { key: packageKey } });
    if (!pkg) throw new NotFoundException(`Package '${packageKey}' not found`);

    await this.prisma.$transaction([
      this.prisma.packageModule.deleteMany({ where: { packageKey } }),
      ...moduleKeys.map((moduleKey) =>
        this.prisma.packageModule.create({ data: { packageKey, moduleKey } }),
      ),
    ]);

    // Invalidate cache for all tenants on this plan
    const affected = await this.prisma.tenant.findMany({
      where: { plan: packageKey as any },
      select: { id: true },
    });
    await Promise.all(affected.map((t) => this.redis.del(cacheKey(t.id))));

    return this.getPackage(packageKey);
  }

  // ── Super Admin: Per-Tenant Module Overrides ────────────────────────────────

  async getTenantModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [packageModules, overrides, allModules] = await Promise.all([
      this.prisma.packageModule.findMany({
        where: { packageKey: tenant.plan },
        select: { moduleKey: true },
      }),
      this.prisma.tenantModule.findMany({
        where: { tenantId },
        select: { moduleKey: true, enabled: true, expiresAt: true, createdAt: true },
      }),
      this.prisma.appModule.findMany({ orderBy: { key: 'asc' } }),
    ]);

    const baseSet = new Set(packageModules.map((pm) => pm.moduleKey));
    const overrideMap = new Map(overrides.map((o) => [o.moduleKey, o]));

    return allModules.map((mod) => {
      const override = overrideMap.get(mod.key);
      const fromPackage = baseSet.has(mod.key);
      const effectiveEnabled = override ? override.enabled : fromPackage;
      return {
        key: mod.key,
        name: mod.name,
        fromPackage,
        override: override ?? null,
        effectiveEnabled,
      };
    });
  }

  async setTenantModuleOverride(
    tenantId: string,
    moduleKey: string,
    enabled: boolean,
    expiresAt?: string,
    actorId?: string,
    actorName?: string,
  ) {
    const [tenant, module_] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
      this.prisma.appModule.findUnique({ where: { key: moduleKey } }),
    ]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!module_) throw new NotFoundException(`Module '${moduleKey}' not found`);

    const result = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      create: { tenantId, moduleKey, enabled, expiresAt: expiresAt ? new Date(expiresAt) : null },
      update: { enabled, expiresAt: expiresAt ? new Date(expiresAt) : null, updatedAt: new Date() },
    });
    await this.invalidateCache(tenantId);

    this.prisma.auditLog.create({
      data: {
        actorId:    actorId  ?? null,
        actorName:  actorName ?? null,
        action:     enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
        entityType: 'TenantModule',
        entityId:   tenantId,
        afterData:  { moduleKey, enabled },
      },
    }).catch(() => undefined);

    return result;
  }

  async removeTenantModuleOverride(
    tenantId: string,
    moduleKey: string,
    actorId?: string,
    actorName?: string,
  ) {
    const existing = await this.prisma.tenantModule.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
    });
    if (!existing) throw new NotFoundException('Override not found');
    await this.prisma.tenantModule.delete({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
    });
    await this.invalidateCache(tenantId);

    this.prisma.auditLog.create({
      data: {
        actorId:    actorId  ?? null,
        actorName:  actorName ?? null,
        action:     'MODULE_OVERRIDE_REMOVED',
        entityType: 'TenantModule',
        entityId:   tenantId,
        afterData:  { moduleKey },
      },
    }).catch(() => undefined);

    return { deleted: true };
  }

  // ── Super Admin: AppModule CRUD ─────────────────────────────────────────────

  async createModule(key: string, name: string, description?: string) {
    const existing = await this.prisma.appModule.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`Module '${key}' already exists`);
    return this.prisma.appModule.create({ data: { key, name, description } });
  }

  async updateModule(
    key: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ) {
    const existing = await this.prisma.appModule.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Module '${key}' not found`);
    const updated = await this.prisma.appModule.update({ where: { key }, data });
    if (data.isActive === false) await this.redis.delByPattern('module_cache:*');
    return updated;
  }

  async deleteModule(key: string) {
    const existing = await this.prisma.appModule.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Module '${key}' not found`);
    await this.prisma.appModule.delete({ where: { key } });
    await this.redis.delByPattern('module_cache:*');
    return { deleted: true };
  }

  // ── Super Admin: Package metadata update ────────────────────────────────────

  async updatePackageMeta(
    key: string,
    data: {
      name?: string;
      description?: string;
      price?: number | null;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.package.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Package '${key}' not found`);
    return this.prisma.package.update({ where: { key }, data });
  }
}
