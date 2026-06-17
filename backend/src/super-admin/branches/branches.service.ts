import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async findAll(tenantId?: string, search?: string, orphanOnly?: boolean) {
    const where: Record<string, any> = {};

    if (orphanOnly) {
      where.tenantId = null;
    } else if (tenantId) {
      where.tenantId = tenantId;
    }

    if (search) {
      where.AND = [{
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
        ],
      }];
    }

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        include: {
          _count: { select: { users: true, repairs: true, sales: true } },
          tenant: { select: { id: true, shopName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { data: branches, total };
  }

  async stats() {
    const [total, active, suspended, orphan] = await Promise.all([
      this.prisma.branch.count(),
      this.prisma.branch.count({ where: { isActive: true, status: 'ACTIVE' } }),
      this.prisma.branch.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.branch.count({ where: { tenantId: null } }),
    ]);

    return { total, active, suspended, orphan };
  }

  async reassignPreview(branchId: string, newTenantId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { tenant: { select: { id: true, shopName: true } } },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const newTenant = await this.prisma.tenant.findUnique({
      where: { id: newTenantId },
      select: { id: true, shopName: true, status: true },
    });
    if (!newTenant) throw new NotFoundException('Target tenant not found');

    const [userCount, repairCount, saleCount, expenseCount, notificationCount] =
      await Promise.all([
        this.prisma.user.count({ where: { branchId } }),
        this.prisma.repair.count({ where: { branchId } }),
        this.prisma.sale.count({ where: { branchId } }),
        this.prisma.expense.count({ where: { branchId } }),
        this.prisma.notification.count({ where: { branchId } }),
      ]);

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        currentTenantId: branch.tenantId,
        currentTenant: branch.tenant,
      },
      targetTenant: newTenant,
      impact: {
        users: userCount,
        repairs: repairCount,
        sales: saleCount,
        expenses: expenseCount,
        notifications: notificationCount,
      },
    };
  }

  async reassignTenant(
    branchId: string,
    dto: { tenantId: string; updateRelatedData?: boolean },
    actorId: string,
    actorName?: string,
  ) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true, shopName: true },
    });
    if (!tenant) throw new NotFoundException('Target tenant not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id: branchId },
        data: { tenantId: dto.tenantId },
      });

      if (dto.updateRelatedData) {
        await tx.user.updateMany({
          where: { branchId },
          data: { tenantId: dto.tenantId },
        });
      }
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action: 'BRANCH_TENANT_REASSIGNED',
      entityType: 'Branch',
      entityId: branchId,
      beforeData: { tenantId: branch.tenantId },
      afterData: {
        tenantId: dto.tenantId,
        shopName: tenant.shopName,
        updateRelatedData: dto.updateRelatedData ?? false,
      },
    });

    return this.prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        tenant: { select: { id: true, shopName: true } },
        _count: { select: { users: true, repairs: true, sales: true } },
      },
    });
  }
}
