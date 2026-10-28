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

  /**
   * Why a shop cannot move to a plan, or null: it has more open branches than the plan
   * allows. The same rule the Super Admin renew dialog has always applied.
   */
  async planChangeBlock(tenantId: string, newPlan: TenantPlan): Promise<string | null> {
    // A limit the Super Admin set for this shop goes with the shop, whatever its plan
    const shop = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxBranches: true } });
    if (shop?.maxBranches != null) return null;
    const limit = PLAN_LIMITS[newPlan]?.branches;
    if (limit === undefined || !isFinite(limit)) return null;
    const branches = await this.prisma.branch.count({
      where: { tenantId, status: { notIn: ['SUSPENDED', 'REJECTED'] } },
    });
    return branches > limit
      ? `แพ็กเกจ ${newPlan} รองรับสูงสุด ${limit} สาขา แต่ร้านมี ${branches} สาขา — เลือกแพ็กเกจที่รองรับจำนวนสาขา หรือติดต่อผู้ดูแลระบบ`
      : null;
  }

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
    const shop = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxBranches: true } });

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
      // Set by the Super Admin for this shop: that number, in place of the plan's (and add-ons)
      branches:    shop?.maxBranches != null ? shop.maxBranches
        : isFinite(base.branches) ? base.branches + extraBranches : Infinity,
      storageBytes: isFinite(base.storageBytes) ? base.storageBytes + extraStorage : Infinity,
    };
  }

  /** Branches open now and how many the shop may have (null = no limit), for the branches page */
  async branchUsage(tenantId: string): Promise<{ used: number; limit: number | null; setForShop: boolean }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, maxBranches: true } });
    if (!tenant) return { used: 0, limit: null, setForShop: false };
    const [{ branches }, used] = await Promise.all([
      this.getEffectiveLimits(tenantId, tenant.plan),
      this.prisma.branch.count({ where: { tenantId, status: { notIn: ['SUSPENDED', 'REJECTED'] } } }),
    ]);
    return { used, limit: isFinite(branches) ? branches : null, setForShop: tenant.maxBranches != null };
  }

  // Branch limit enforcement — call before creating a new branch.
  async assertBranchLimit(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, maxBranches: true },
    });
    if (!tenant) return;

    const { branches: limit } = await this.getEffectiveLimits(tenantId, tenant.plan);
    if (!isFinite(limit)) return; // unlimited

    const current = await this.prisma.branch.count({
      where: { tenantId, status: { notIn: ['SUSPENDED', 'REJECTED'] } },
    });

    if (current >= limit) {
      throw new BadRequestException(
        tenant.maxBranches != null
          ? `ร้านนี้เปิดได้สูงสุด ${limit} สาขา (ใช้ไปแล้ว ${current}) — ติดต่อผู้ดูแลระบบเพื่อเปิดสาขาเพิ่ม`
          : `แผน ${tenant.plan} เปิดได้สูงสุด ${limit} สาขา (ใช้ไปแล้ว ${current}) — อัพเกรดแผนหรือติดต่อผู้ดูแลระบบเพื่อเปิดสาขาเพิ่ม`,
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
