import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Central tenant-scoping helpers used by every service that touches per-tenant data.
 *
 * Design rules:
 *  - Pass tenantId as-received from JWT (user.tenantId).
 *  - SUPER_ADMIN users have tenantId = null → they bypass all tenant filters (see scope()).
 *  - Never call these methods with a hardcoded string — always derive from the JWT user.
 */
@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns a Prisma `where` fragment that scopes a query to a tenant.
   * Pass directly into findMany/findFirst/count/etc.:
   *
   *   where: { ...this.tenantSvc.scope(tenantId), isActive: true }
   *
   * When tenantId is null (SUPER_ADMIN), returns {} so every record is visible.
   */
  scope(tenantId: string | null | undefined): { tenantId?: string } {
    return tenantId ? { tenantId } : {};
  }

  /**
   * Scopes a query through the branch relationship when the model has no direct
   * tenantId field (e.g. Sale, Repair, Expense, Shift).
   * Returns a fragment usable inside a Prisma `where` clause.
   *
   * Example:
   *   where: { ...this.tenantSvc.branchScope(tenantId), status: 'ACTIVE' }
   */
  branchScope(tenantId: string | null | undefined): { branch?: { tenantId: string } } {
    return tenantId ? { branch: { tenantId } } : {};
  }

  /**
   * Resolves all branch IDs that belong to a tenant.
   * Useful when you need `branchId: { in: [...] }` instead of a nested filter.
   */
  async getBranchIds(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.branch.findMany({
      where: { tenantId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Throws ForbiddenException if the given branch does NOT belong to tenantId.
   * Skip the check when tenantId is null (SUPER_ADMIN).
   */
  async assertBranchOwnership(tenantId: string | null | undefined, branchId: string): Promise<void> {
    if (!tenantId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { id: true },
    });
    if (!branch) throw new ForbiddenException('สาขานี้ไม่ได้อยู่ในบัญชีของคุณ');
  }

  /**
   * Throws ForbiddenException if the given record (by ID) does not belong to tenantId.
   * model must be a Prisma model name (lowercase) with a tenantId column.
   */
  async assertOwnership(
    tenantId: string | null | undefined,
    model: 'product' | 'customer' | 'category' | 'supplier',
    id: string,
  ): Promise<void> {
    if (!tenantId) return;
    const record = await (this.prisma as any)[model].findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!record) throw new ForbiddenException(`ไม่มีสิทธิ์เข้าถึงข้อมูลนี้`);
  }
}
