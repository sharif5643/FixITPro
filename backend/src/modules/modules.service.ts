import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ALL_MODULE_KEYS } from './modules.const';

// Per-tenant cache: { enabledModules, expiresAt }
const cache = new Map<string, { keys: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  async getEnabledModules(tenantId: string | null): Promise<string[]> {
    // No tenant (SUPER_ADMIN or standalone) → all modules
    if (!tenantId) return ALL_MODULE_KEYS;

    const cached = cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.keys;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plan: true,
        moduleOverrides: { select: { moduleKey: true, enabled: true, expiresAt: true } },
      },
    });

    if (!tenant) return [];

    // Base set from package
    const packageModules = await this.prisma.packageModule.findMany({
      where: { packageKey: tenant.plan },
      select: { moduleKey: true },
    });
    const enabled = new Set(packageModules.map((pm) => pm.moduleKey));

    // Apply per-tenant overrides (expired overrides are ignored)
    const now = new Date();
    for (const override of tenant.moduleOverrides) {
      if (override.expiresAt && override.expiresAt < now) continue;
      if (override.enabled) {
        enabled.add(override.moduleKey);
      } else {
        enabled.delete(override.moduleKey);
      }
    }

    const keys = Array.from(enabled);
    cache.set(tenantId, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
    return keys;
  }

  invalidateCache(tenantId: string) {
    cache.delete(tenantId);
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
    for (const t of affected) cache.delete(t.id);

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
    this.invalidateCache(tenantId);
    return result;
  }

  async removeTenantModuleOverride(tenantId: string, moduleKey: string) {
    const existing = await this.prisma.tenantModule.findUnique({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
    });
    if (!existing) throw new NotFoundException('Override not found');
    await this.prisma.tenantModule.delete({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
    });
    this.invalidateCache(tenantId);
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
    if (data.isActive === false) cache.clear();
    return updated;
  }

  async deleteModule(key: string) {
    const existing = await this.prisma.appModule.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Module '${key}' not found`);
    await this.prisma.appModule.delete({ where: { key } });
    cache.clear();
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
