import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { PushService } from '../push/push.service';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

export interface CreateNotifData {
  type: string;
  title: string;
  message: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  entityType?: string;
  entityId?: string;
  branchId?: string;
  tenantId?: string | null;
  /** Only this user sees it */
  userId?: string;
}

/** Staff-management alerts (password reset requests, permission and branch changes) are for owners and managers only. */
/** Alerts for one person that also go to their phone's lock screen (when Firebase is set up). */
export const PUSH_TYPES = new Set(['REPAIR_ASSIGNED', 'REPAIR_NEW']);

export const MANAGEMENT_ONLY_TYPES = ['PASSWORD_RESET_REQUEST', 'ROLE_PERMISSION_CHANGED', 'USER_ASSIGNED_TO_BRANCH'];

/** The unread badge counts only recent alerts; older unread ones stay in the list. */
export const UNREAD_WINDOW_DAYS = 30;
export const unreadSince = () => new Date(Date.now() - UNREAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);

export const LARGE_REFUND_THRESHOLD        = 1_000;
export const SHIFT_MISMATCH_THRESHOLD      = 100;
export const HIGH_VALUE_CUSTOMER_THRESHOLD = 50_000;

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma:     PrismaService,
    private tenantSvc:  TenantService,
    @Optional() private push?: PushService,
  ) {}

  onModuleInit() {
    setTimeout(() => {
      this.checkOverdueAlerts().catch((e) => this.logger.warn(`overdue check error: ${(e as Error).message}`));
      this.checkExpiringWarranties().catch((e) => this.logger.warn(`warranty check error: ${(e as Error).message}`));
      this.checkTechnicianAlerts().catch((e) => this.logger.warn(`technician check error: ${(e as Error).message}`));
    }, 10_000);
    setInterval(() => {
      this.checkOverdueAlerts().catch((e) => this.logger.warn(`overdue check error: ${(e as Error).message}`));
      this.checkExpiringWarranties().catch((e) => this.logger.warn(`warranty check error: ${(e as Error).message}`));
      this.checkTechnicianAlerts().catch((e) => this.logger.warn(`technician check error: ${(e as Error).message}`));
    }, 30 * 60 * 1000);
  }

  // Fire-and-forget: safe, never throws, deduplicates by (type + entityId + tenantId) when unread
  async notify(data: CreateNotifData): Promise<void> {
    try {
      if (data.entityId) {
        const exists = await this.prisma.notification.findFirst({
          where: {
            type:     data.type,
            entityId: data.entityId,
            isRead:   false,
            tenantId: data.tenantId ?? null,
            userId:   data.userId   ?? null,
          },
          select: { id: true },
        });
        if (exists) return;
      }
      await this.prisma.notification.create({
        data: {
          type:       data.type,
          title:      data.title,
          message:    data.message,
          severity:   (data.severity ?? 'INFO') as any,
          entityType: data.entityType ?? null,
          entityId:   data.entityId   ?? null,
          branchId:   data.branchId   ?? null,
          tenantId:   data.tenantId   ?? null,
          userId:     data.userId     ?? null,
        },
      });
      if (data.userId && PUSH_TYPES.has(data.type) && this.push) {
        // To the phone too; not awaited, a slow push service must not slow down the save
        this.push.sendToUser(data.userId, {
          title: data.title, body: data.message,
          data: { type: data.type, entityType: data.entityType ?? '', entityId: data.entityId ?? '' },
        }).catch(() => {});
      }
    } catch (err) {
      this.logger.warn(`Failed to create notification: ${(err as Error).message}`);
    }
  }

  async notifyLowStock(
    productId:   string,
    productName: string,
    stock:       number,
    minStock:    number,
    tenantId?:   string | null,
  ): Promise<void> {
    if (stock < 0) {
      await this.notify({
        type:       'NEGATIVE_STOCK',
        title:      `สต็อกติดลบ: ${productName}`,
        message:    `สินค้า "${productName}" มีสต็อก ${stock} ชิ้น (ติดลบ) — กรุณาตรวจสอบทันที`,
        severity:   'CRITICAL',
        entityType: 'Product',
        entityId:   productId,
        tenantId,
      });
    } else if (stock <= minStock) {
      await this.notify({
        type:       'LOW_STOCK',
        title:      `สต็อกต่ำ: ${productName}`,
        message:    `สินค้า "${productName}" เหลือ ${stock} ชิ้น (ขั้นต่ำ: ${minStock})`,
        severity:   stock === 0 ? 'ERROR' : 'WARNING',
        entityType: 'Product',
        entityId:   productId,
        tenantId,
      });
    }
  }

  async checkOverdueAlerts(): Promise<void> {
    const now = new Date();

    // Overdue POs — get tenantId via supplier
    const overduePOs = await this.prisma.purchaseOrder.findMany({
      where: {
        dueDate:       { lt: now },
        paymentStatus: { not: 'PAID' as any },
        status:        { not: 'CANCELLED' as any },
      },
      select: {
        id: true, poNumber: true, total: true, paidTotal: true, dueDate: true,
        supplier: { select: { tenantId: true } },
      },
    });

    for (const po of overduePOs) {
      const remaining = Number(po.total) - Number(po.paidTotal);
      await this.notify({
        type:       'OVERDUE_AP',
        title:      `PO เกินกำหนดชำระ: ${po.poNumber}`,
        message:    `ใบสั่งซื้อ ${po.poNumber} เกินกำหนดชำระแล้ว ยอดค้าง ${remaining.toFixed(0)} บาท`,
        severity:   'WARNING',
        entityType: 'PurchaseOrder',
        entityId:   po.id,
        tenantId:   (po as any).supplier?.tenantId ?? null,
      });
    }

    // Overdue repairs — get tenantId via branch
    const overdueRepairs = await this.prisma.repair.findMany({
      where: {
        dueDate: { lt: now },
        status:  { notIn: ['DELIVERED', 'CANCELLED'] as any[] },
      },
      select: {
        id: true, ticketNumber: true, dueDate: true, deviceBrand: true, deviceModel: true,
        branch: { select: { tenantId: true } },
      },
    });

    for (const repair of overdueRepairs) {
      await this.notify({
        type:       'OVERDUE_REPAIR',
        title:      `งานซ่อมเกินกำหนด: ${repair.ticketNumber}`,
        message:    `${repair.ticketNumber} (${repair.deviceBrand} ${repair.deviceModel}) เกินกำหนดส่งมอบแล้ว`,
        severity:   'WARNING',
        entityType: 'Repair',
        entityId:   repair.id,
        tenantId:   (repair as any).branch?.tenantId ?? null,
      });
    }

    // High-value customers — group per-tenant to avoid cross-tenant aggregation
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      const highValueRows = await this.prisma.sale.groupBy({
        by:     ['customerId'],
        where:  {
          status:     'COMPLETED' as any,
          customerId: { not: null },
          customer:   { tenantId: tenant.id },
        },
        _sum:   { total: true },
        having: { total: { _sum: { gte: HIGH_VALUE_CUSTOMER_THRESHOLD } } },
      });

      for (const row of highValueRows) {
        if (!row.customerId) continue;
        const alreadyNotified = await this.prisma.notification.findFirst({
          where:  { type: 'HIGH_VALUE_CUSTOMER', entityId: row.customerId },
          select: { id: true },
        });
        if (alreadyNotified) continue;

        const customer = await this.prisma.customer.findUnique({
          where:  { id: row.customerId },
          select: { id: true, name: true, tenantId: true },
        });
        if (!customer) continue;

        await this.notify({
          type:       'HIGH_VALUE_CUSTOMER',
          title:      `ลูกค้า VIP: ${customer.name}`,
          message:    `${customer.name} มียอดซื้อสะสม ${Number(row._sum.total).toFixed(0)} บาท`,
          severity:   'INFO',
          entityType: 'Customer',
          entityId:   customer.id,
          tenantId:   customer.tenantId,
        });
      }
    }

    // Unpaid delivered repairs — get tenantId via branch
    const unpaidRepairs = await this.prisma.repair.findMany({
      where: {
        status:        'DELIVERED',
        paymentStatus: 'PENDING',
        customerId:    { not: null },
      },
      include: {
        customer:           { select: { name: true } },
        additionalPayments: { select: { amount: true } },
        branch:             { select: { tenantId: true } },
      },
    });

    for (const repair of unpaidRepairs as any[]) {
      if (!repair.customerId || !repair.customer) continue;
      const paid = (repair.additionalPayments ?? []).reduce(
        (s: number, p: any) => s + Number(p.amount), 0,
      );
      const debt = Math.max(
        0, Number(repair.finalCost ?? 0) - Number((repair as any).deposit ?? 0) - paid,
      );
      if (debt <= 0) continue;

      await this.notify({
        type:       'UNPAID_CUSTOMER',
        title:      `ลูกค้าค้างชำระ: ${repair.customer.name}`,
        message:    `${repair.customer.name} ค้างชำระ ${debt.toFixed(0)} บาท (${repair.ticketNumber})`,
        severity:   'WARNING',
        entityType: 'Repair',
        entityId:   repair.id,
        tenantId:   repair.branch?.tenantId ?? null,
      });
    }
  }

  // ── Scope helper ──────────────────────────────────────────────────────────────

  // Builds WHERE clause combining tenant isolation + branch visibility rules:
  // - SUPER_ADMIN (tenantId=null): sees all notifications across all tenants
  // - OWNER (tenantId set, isElevated): sees all notifications for their tenant
  // - Staff (branchId set): sees their branch + system (branchId=null) for their tenant
  private notificationScope(
    tenantId: string | null,
    branchId: string | null,
    role:     string,
    userId:   string | null,
  ): Record<string, any> {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    // Notifications addressed to one user are hidden from everyone else
    const forMe = { OR: [{ userId: null }, ...(userId ? [{ userId }] : [])] };

    // SUPER_ADMIN bypass: no tenant filter, no branch filter
    if (!tenantId) return { AND: [forMe] };

    if (isElevated) return { tenantId, AND: [forMe] };

    const roleTypes = role === 'MANAGER' ? [] : [{ type: { notIn: MANAGEMENT_ONLY_TYPES } }];
    return {
      tenantId,
      AND: [{ OR: [{ branchId }, { branchId: null }] }, forMe, ...roleTypes],
    };
  }

  // ── Queries ───────────────────────────────────────────────────────────────────

  async findAll(
    query:    { isRead?: string; severity?: string; type?: string; page?: string; limit?: string },
    tenantId: string | null,
    branchId: string | null,
    role:     string,
    userId:   string | null = null,
  ) {
    const page  = Math.max(1, parseInt(query.page  ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20')));
    const skip  = (page - 1) * limit;

    const where: Record<string, any> = { ...this.notificationScope(tenantId, branchId, role, userId) };
    if (query.isRead === 'true')  where.isRead = true;
    if (query.isRead === 'false') where.isRead = false;
    if (query.severity) where.severity = query.severity;
    if (query.type)     where.type     = query.type;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getUnreadCount(tenantId: string | null, branchId: string | null, role: string, userId: string | null = null) {
    const where = { isRead: false, createdAt: { gte: unreadSince() }, ...this.notificationScope(tenantId, branchId, role, userId) };
    const count = await this.prisma.notification.count({ where });
    return { count };
  }

  async markRead(id: string, tenantId: string | null, branchId: string | null, role: string, userId: string | null = null) {
    try {
      const notif = await this.prisma.notification.findUnique({
        where:  { id },
        select: { branchId: true, tenantId: true, userId: true },
      });
      if (!notif) return null;
      if (notif.userId && notif.userId !== userId) return null;

      // Verify the notification belongs to this caller's tenant
      if (tenantId && notif.tenantId !== tenantId) return null;

      const scope = this.notificationScope(tenantId, branchId, role, userId);
      if (Object.keys(scope).length > 0) {
        const isOwn = notif.branchId === branchId || notif.branchId === null;
        if (!isOwn && !(role === 'OWNER' || role === 'SUPER_ADMIN')) return null;
      }
      return await this.prisma.notification.update({
        where: { id },
        data:  { isRead: true, readAt: new Date() },
      });
    } catch {
      return null;
    }
  }

  async markAllRead(tenantId: string | null, branchId: string | null, role: string, userId: string | null = null) {
    const where = { isRead: false, ...this.notificationScope(tenantId, branchId, role, userId) };
    const { count } = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });
    return { count };
  }

  async checkTechnicianAlerts(): Promise<void> {
    const now     = new Date();
    const cutoff7 = new Date();
    cutoff7.setDate(cutoff7.getDate() - 7);

    const techs = await this.prisma.user.findMany({
      where: { role: 'TECHNICIAN' as any, isActive: true },
      select: {
        id: true, name: true, tenantId: true,
        repairs: {
          select: { receivedAt: true },
          orderBy: { receivedAt: 'desc' },
          take: 1,
        },
      },
    }).catch(() => []);

    for (const tech of techs) {
      const last = tech.repairs[0];
      const isInactive = !last || new Date(last.receivedAt) < cutoff7;
      if (isInactive) {
        await this.notify({
          type:       'INACTIVE_TECHNICIAN',
          title:      `ช่างซ่อมไม่มีงาน: ${tech.name}`,
          message:    `${tech.name} ไม่มีงานซ่อมที่รับมานานกว่า 7 วัน`,
          severity:   'INFO',
          entityType: 'User',
          entityId:   tech.id,
          tenantId:   tech.tenantId,
        });
      }
    }

    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);

    for (const tech of techs) {
      const delivered = await this.prisma.repair.findMany({
        where: {
          technicianId: tech.id,
          status:       'DELIVERED' as any,
          receivedAt:   { gte: cutoff30, lt: now },
        },
        select: { id: true },
      }).catch(() => []);

      if (delivered.length < 3) continue;

      const claimCount = await this.prisma.warranty.count({
        where: { repairId: { in: delivered.map((r: any) => r.id) }, status: 'CLAIMED' },
      }).catch(() => 0);

      const claimRate = (claimCount / delivered.length) * 100;
      if (claimRate >= 20) {
        await this.notify({
          type:       'HIGH_CLAIM_RATE',
          title:      `อัตราเคลมสูง: ${tech.name}`,
          message:    `${tech.name} มีอัตราการเคลมสินค้า ${claimRate.toFixed(1)}% ใน 30 วันที่ผ่านมา (${claimCount}/${delivered.length} งาน)`,
          severity:   'WARNING',
          entityType: 'User',
          entityId:   tech.id,
          tenantId:   tech.tenantId,
        });
      }
    }
  }

  async checkExpiringWarranties(): Promise<void> {
    const now = new Date();
    const warnDate = new Date();
    warnDate.setDate(warnDate.getDate() + 7);

    await this.prisma.warranty.updateMany({
      where: { status: 'ACTIVE', endDate: { lt: now } },
      data:  { status: 'EXPIRED' },
    }).catch((e: any) => this.logger.warn(`warranty expire update error: ${(e as Error).message}`));

    const expiring = await this.prisma.warranty.findMany({
      where: {
        status:  'ACTIVE',
        endDate: { gt: now, lte: warnDate },
      },
      include: {
        customer: { select: { name: true, tenantId: true } },
      },
    }).catch(() => []);

    for (const w of expiring) {
      await this.notify({
        type:       'WARRANTY_EXPIRING',
        title:      `การรับประกันใกล้หมดอายุ: ${w.warrantyNumber}`,
        message:    `${w.warrantyNumber}${w.customer ? ` (${w.customer.name})` : ''} จะหมดอายุวันที่ ${new Date(w.endDate).toLocaleDateString('th-TH')}`,
        severity:   'WARNING',
        entityType: 'Warranty',
        entityId:   w.id,
        tenantId:   w.customer?.tenantId ?? null,
      });
    }
  }
}
