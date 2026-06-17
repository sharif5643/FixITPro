import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';

@Injectable()
export class DataRepairService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly auditLog:  AuditLogService,
  ) {}

  // ── Summary ───────────────────────────────────────────────────────────────────

  async getSummary() {
    const [orphanBranches, orphanShopSettings, orphanNotifications, tenants] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId: null } }),
      this.prisma.shopSettings.count({ where: { tenantId: null } }),
      this.prisma.notification.count({ where: { tenantId: null } }),
      this.prisma.tenant.count(),
    ]);
    return { orphanBranches, orphanShopSettings, orphanNotifications, tenants };
  }

  // ── Orphan Branches ───────────────────────────────────────────────────────────

  async getOrphanBranches(page = 1, search?: string) {
    const limit = 50;
    const skip  = (page - 1) * limit;
    const where: any = {
      tenantId: null,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        select: { id: true, name: true, isActive: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async assignBranchToTenant(
    branchId:  string,
    tenantId:  string,
    actorId:   string,
    actorName: string,
  ) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('ไม่พบ Tenant');

    const prevTenantId = branch.tenantId;
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data:  { tenantId },
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'BRANCH_TENANT_ASSIGNED',
      entityType: 'Branch',
      entityId:   branchId,
      beforeData: { tenantId: prevTenantId, branchName: branch.name },
      afterData:  { tenantId, tenantName: tenant.shopName, branchName: branch.name },
      metadata:   { fromTenantId: prevTenantId, toTenantId: tenantId },
    });

    return updated;
  }

  async moveBranchToTenant(
    branchId:      string,
    toTenantId:    string,
    actorId:       string,
    actorName:     string,
  ) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    if (!branch.tenantId) throw new BadRequestException('สาขานี้ยังไม่มี Tenant (ใช้ assign แทน)');

    const toTenant = await this.prisma.tenant.findUnique({ where: { id: toTenantId } });
    if (!toTenant) throw new NotFoundException('ไม่พบ Tenant ปลายทาง');

    const fromTenantId = branch.tenantId;
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data:  { tenantId: toTenantId },
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'BRANCH_TENANT_MOVED',
      entityType: 'Branch',
      entityId:   branchId,
      beforeData: { tenantId: fromTenantId, branchName: branch.name },
      afterData:  { tenantId: toTenantId, tenantName: toTenant.shopName, branchName: branch.name },
      metadata:   { fromTenantId, toTenantId },
    });

    return updated;
  }

  // ── Orphan ShopSettings ───────────────────────────────────────────────────────

  async getOrphanShopSettings() {
    return this.prisma.shopSettings.findMany({
      where:   { tenantId: null },
      select:  { id: true, shopName: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async assignShopSettingsToTenant(
    settingsId: number,
    tenantId:   string,
    actorId:    string,
    actorName:  string,
  ) {
    const existing = await this.prisma.shopSettings.findUnique({ where: { id: settingsId } });
    if (!existing) throw new NotFoundException('ไม่พบ ShopSettings');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('ไม่พบ Tenant');

    // Check if tenant already has settings
    const tenantSettings = await this.prisma.shopSettings.findUnique({ where: { tenantId } });
    if (tenantSettings && tenantSettings.id !== settingsId) {
      throw new BadRequestException('Tenant นี้มี ShopSettings อยู่แล้ว');
    }

    const updated = await this.prisma.shopSettings.update({
      where: { id: settingsId },
      data:  { tenantId },
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'SHOP_SETTINGS_TENANT_ASSIGNED',
      entityType: 'ShopSettings',
      entityId:   String(settingsId),
      beforeData: { tenantId: null, shopName: existing.shopName },
      afterData:  { tenantId, tenantName: tenant.shopName },
    });

    return updated;
  }

  // ── Orphan Notifications ──────────────────────────────────────────────────────

  async assignOrphanNotificationsToTenant(
    tenantId:  string,
    actorId:   string,
    actorName: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('ไม่พบ Tenant');

    const { count } = await this.prisma.notification.updateMany({
      where: { tenantId: null },
      data:  { tenantId },
    });

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'NOTIFICATIONS_TENANT_ASSIGNED',
      entityType: 'Notification',
      entityId:   null,
      afterData:  { tenantId, tenantName: tenant.shopName, count },
      metadata:   { affectedCount: count },
    });

    return { count };
  }

  // ── Tenant list (for dropdowns) ───────────────────────────────────────────────

  async getTenantOptions() {
    return this.prisma.tenant.findMany({
      select:  { id: true, shopName: true, email: true, status: true },
      orderBy: { shopName: 'asc' },
    });
  }

  // ── All branches with tenant info (for move UI) ───────────────────────────────

  async getAllBranches(page = 1, search?: string, tenantId?: string) {
    const limit = 50;
    const skip  = (page - 1) * limit;
    const where: any = {
      ...(search   ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(tenantId ? { tenantId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        select: {
          id: true, name: true, isActive: true, status: true, createdAt: true,
          tenantId: true,
          tenant: { select: { shopName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
