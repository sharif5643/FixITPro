import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantPlan } from '@prisma/client';

export interface PlanLimits {
  branches: number;       // max active branches; Infinity = unlimited
  storageBytes: number;   // max upload storage in bytes
}

// Canonical plan limits. Storage in bytes (GB * 1024^3).
export const PLAN_LIMITS: Record<TenantPlan, PlanLimits> = {
  TRIAL:    { branches: 1,        storageBytes: 5   * 1024 ** 3 },
  LITE:     { branches: 1,        storageBytes: 5   * 1024 ** 3 },
  PRO:      { branches: 1,        storageBytes: 30  * 1024 ** 3 },
  BUSINESS: { branches: 3,        storageBytes: 100 * 1024 ** 3 },
  PRIVATE:  { branches: Infinity, storageBytes: Infinity },         // custom contract
};

@Injectable()
export class PlanLimitsService {
  constructor(private prisma: PrismaService) {}

  async getLimitsForTenant(tenantId: string): Promise<PlanLimits & { plan: TenantPlan }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const plan = tenant?.plan ?? 'TRIAL';
    const limits = await this.getEffectiveLimits(tenantId, plan);
    return { plan, ...limits };
  }

  // Effective limits = plan base + add-ons
  private async getEffectiveLimits(tenantId: string, plan: TenantPlan): Promise<PlanLimits> {
    const base = PLAN_LIMITS[plan];

    const addons = await this.prisma.tenantAddon.findMany({
      where: { tenantId },
      select: { type: true, quantity: true },
    });

    let extraStorage = 0;
    let extraBranches = 0;
    for (const a of addons) {
      if (a.type === 'STORAGE_GB') extraStorage += a.quantity * 1024 ** 3;
      if (a.type === 'BRANCH')     extraBranches += a.quantity;
    }

    return {
      branches:    isFinite(base.branches) ? base.branches + extraBranches : Infinity,
      storageBytes: isFinite(base.storageBytes) ? base.storageBytes + extraStorage : Infinity,
    };
  }

  // Branch limit enforcement — call before creating a new branch.
  async assertBranchLimit(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (!tenant) return;

    const { branches: limit } = await this.getEffectiveLimits(tenantId, tenant.plan);
    if (!isFinite(limit)) return; // unlimited

    const current = await this.prisma.branch.count({
      where: { tenantId, status: { notIn: ['SUSPENDED', 'REJECTED'] } },
    });

    if (current >= limit) {
      throw new BadRequestException(
        `แผน ${tenant.plan} รองรับสูงสุด ${limit} สาขา — กรุณาอัพเกรดแผนเพื่อสร้างสาขาเพิ่มเติม`,
      );
    }
  }

  // Storage quota enforcement — call before accepting an upload.
  async assertStorageLimit(tenantId: string, fileSizeBytes: number): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (!tenant) return;

    const { storageBytes: maxBytes } = await this.getEffectiveLimits(tenantId, tenant.plan);
    if (!isFinite(maxBytes)) return;

    // Sum current usage from RepairImage.fileSize (requires Phase 10 migration)
    const usageAgg = await (this.prisma as any).repairImage?.aggregate?.({
      where: { repair: { branch: { tenantId } } },
      _sum: { fileSize: true },
    });
    const usedBytes = Number(usageAgg?._sum?.fileSize ?? 0);

    if (usedBytes + fileSizeBytes > maxBytes) {
      const maxGB = (maxBytes / 1024 ** 3).toFixed(0);
      const usedMB = (usedBytes / 1024 ** 2).toFixed(1);
      throw new BadRequestException(
        `พื้นที่จัดเก็บไฟล์ครบ ${maxGB} GB แล้ว (ใช้ไป ${usedMB} MB) — กรุณาอัพเกรดแผนหรือซื้อ Storage เพิ่ม`,
      );
    }
  }

  // Usage summary for dashboard/subscription page.
  async getUsageSummary(tenantId: string) {
    const { plan, branches: branchLimit, storageBytes: storageLimit } = await this.getLimitsForTenant(tenantId);

    const [branchCount] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId, status: { notIn: ['SUSPENDED', 'REJECTED'] } } }),
    ]);

    // Storage usage (will return 0 until Phase 10 fileSize migration)
    let storageUsedBytes = 0;
    try {
      const agg = await (this.prisma as any).repairImage?.aggregate?.({
        where: { repair: { branch: { tenantId } } },
        _sum: { fileSize: true },
      });
      storageUsedBytes = Number(agg?._sum?.fileSize ?? 0);
    } catch { /* fileSize field not yet migrated */ }

    return {
      plan,
      branches: {
        used:    branchCount,
        limit:   isFinite(branchLimit) ? branchLimit : null,
        isUnlimited: !isFinite(branchLimit),
      },
      storage: {
        usedBytes:   storageUsedBytes,
        limitBytes:  isFinite(storageLimit) ? storageLimit : null,
        isUnlimited: !isFinite(storageLimit),
        usedMB:      Math.round(storageUsedBytes / 1024 ** 2),
        limitGB:     isFinite(storageLimit) ? Math.round(storageLimit / 1024 ** 3) : null,
        percentUsed: isFinite(storageLimit) && storageLimit > 0
          ? Math.round((storageUsedBytes / storageLimit) * 100)
          : 0,
      },
    };
  }
}
