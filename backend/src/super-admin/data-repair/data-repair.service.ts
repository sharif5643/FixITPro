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
    const [orphanBranches, orphanShopSettings, orphanNotifications, orphanRepairs, tenants] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId: null } }),
      this.prisma.shopSettings.count({ where: { tenantId: null } }),
      this.prisma.notification.count({ where: { tenantId: null } }),
      this.prisma.repair.count({ where: { branchId: null } }),
      this.prisma.tenant.count(),
    ]);
    return { orphanBranches, orphanShopSettings, orphanNotifications, orphanRepairs, tenants };
  }

  // ── Orphan Repairs (branchId = null) ─────────────────────────────────────────

  async getOrphanRepairs() {
    const repairs = await this.prisma.repair.findMany({
      where:   { branchId: null },
      include: {
        customer: { select: { id: true, name: true, tenantId: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take:    200,
    });
    return { total: repairs.length, items: repairs };
  }

  async fixOrphanRepairs(actorId: string, actorName: string) {
    const orphans = await this.prisma.repair.findMany({
      where:   { branchId: null },
      include: { customer: { select: { tenantId: true } } },
    });

    if (orphans.length === 0) return { fixed: 0, failed: 0, details: [] };

    let fixed  = 0;
    let failed = 0;
    const details: Array<{ repairId: string; ticketNumber: string; status: string; reason?: string }> = [];

    for (const repair of orphans) {
      const tenantId = repair.customer?.tenantId ?? null;

      if (!tenantId) {
        failed++;
        details.push({ repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'failed', reason: 'ไม่พบ tenantId จากลูกค้า' });
        continue;
      }

      const branch = await this.prisma.branch.findFirst({
        where:   { tenantId, status: 'ACTIVE' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select:  { id: true, name: true },
      });

      if (!branch) {
        failed++;
        details.push({ repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'failed', reason: `ไม่พบสาขาที่ใช้งานได้สำหรับ tenant ${tenantId}` });
        continue;
      }

      await this.prisma.repair.update({
        where: { id: repair.id },
        data:  { branchId: branch.id },
      });
      fixed++;
      details.push({ repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'fixed', reason: `→ ${branch.name}` });
    }

    await this.auditLog.log({
      actorId,
      actorName,
      action:     'ORPHAN_REPAIRS_FIXED',
      entityType: 'Repair',
      entityId:   null,
      afterData:  { fixed, failed, total: orphans.length },
    });

    return { fixed, failed, total: orphans.length, details };
  }

  // ── Sync Product.stock from SUM(BranchStock) ─────────────────────────────────

  async syncProductStock() {
    // Aggregate SUM(quantity) per productId from BranchStock
    const rows = await this.prisma.branchStock.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
    });

    const sumMap = new Map<string, number>();
    for (const r of rows) sumMap.set(r.productId, (r._sum.quantity as number | null) ?? 0);

    // All active products
    const products = await this.prisma.product.findMany({ select: { id: true, stock: true } });

    let updated = 0;
    let skipped = 0;

    for (const p of products) {
      const correctStock = sumMap.get(p.id) ?? 0;
      if (Number(p.stock) !== correctStock) {
        await this.prisma.product.update({ where: { id: p.id }, data: { stock: correctStock } });
        updated++;
      } else {
        skipped++;
      }
    }

    await this.auditLog.log({
      actorId:    null,
      actorName:  'SYSTEM',
      action:     'PRODUCT_STOCK_SYNCED',
      entityType: 'Product',
      entityId:   null,
      afterData:  { updated, skipped, total: products.length },
    });

    return { updated, skipped, total: products.length };
  }

  // ── Backfill BranchStock=0 for products missing a BranchStock row ────────────

  async backfillBranchStock() {
    // For each tenant, find all active branches + all active products.
    // For any (product, branch) pair that has no BranchStock row, insert one with qty=0
    // so the product becomes visible in that branch's POS.
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });

    let created = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      const branches = await this.prisma.branch.findMany({
        where: { tenantId: tenant.id, isActive: true, status: 'ACTIVE' as any },
        select: { id: true },
      });
      const products = await this.prisma.product.findMany({
        where: { tenantId: tenant.id, isActive: true },
        select: { id: true },
      });

      for (const product of products) {
        const existingRows = await this.prisma.branchStock.findMany({
          where: { productId: product.id },
          select: { branchId: true },
        });
        const existingBranchIds = new Set(existingRows.map((r: any) => r.branchId));

        for (const branch of branches) {
          if (existingBranchIds.has(branch.id)) {
            skipped++;
          } else {
            await this.prisma.branchStock.create({
              data: {
                branchId:  branch.id,
                productId: product.id,
                quantity:  0,
                minStock:  0,
              },
            });
            created++;
          }
        }
      }
    }

    await this.auditLog.log({
      actorId:    null,
      actorName:  'SYSTEM',
      action:     'BRANCH_STOCK_BACKFILLED',
      entityType: 'BranchStock',
      entityId:   null,
      afterData:  { created, skipped },
    });

    return { created, skipped };
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
