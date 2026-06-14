import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface CreateNotifData {
  type: string;
  title: string;
  message: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  entityType?: string;
  entityId?: string;
  branchId?: string;
}

export const LARGE_REFUND_THRESHOLD      = 1_000;
export const SHIFT_MISMATCH_THRESHOLD    = 100;
export const HIGH_VALUE_CUSTOMER_THRESHOLD = 50_000;

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Check overdue alerts + expiring warranties 10s after startup, then every 30 minutes
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

  // Fire-and-forget: safe, never throws, deduplicates by (type + entityId) when unread
  async notify(data: CreateNotifData): Promise<void> {
    try {
      if (data.entityId) {
        const exists = await this.prisma.notification.findFirst({
          where: { type: data.type, entityId: data.entityId, isRead: false },
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
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to create notification: ${(err as Error).message}`);
    }
  }

  async notifyLowStock(
    productId: string,
    productName: string,
    stock: number,
    minStock: number,
  ): Promise<void> {
    if (stock < 0) {
      await this.notify({
        type:       'NEGATIVE_STOCK',
        title:      `สต็อกติดลบ: ${productName}`,
        message:    `สินค้า "${productName}" มีสต็อก ${stock} ชิ้น (ติดลบ) — กรุณาตรวจสอบทันที`,
        severity:   'CRITICAL',
        entityType: 'Product',
        entityId:   productId,
      });
    } else if (stock <= minStock) {
      await this.notify({
        type:       'LOW_STOCK',
        title:      `สต็อกต่ำ: ${productName}`,
        message:    `สินค้า "${productName}" เหลือ ${stock} ชิ้น (ขั้นต่ำ: ${minStock})`,
        severity:   stock === 0 ? 'ERROR' : 'WARNING',
        entityType: 'Product',
        entityId:   productId,
      });
    }
  }

  async checkOverdueAlerts(): Promise<void> {
    const now = new Date();

    // Overdue accounts payable (POs past due date, not fully paid, not cancelled)
    const overduePOs = await this.prisma.purchaseOrder.findMany({
      where: {
        dueDate:       { lt: now },
        paymentStatus: { not: 'PAID' as any },
        status:        { not: 'CANCELLED' as any },
      },
      select: { id: true, poNumber: true, total: true, paidTotal: true, dueDate: true },
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
      });
    }

    // Overdue repairs (past due date, not delivered or cancelled)
    const overdueRepairs = await this.prisma.repair.findMany({
      where: {
        dueDate: { lt: now },
        status:  { notIn: ['DELIVERED', 'CANCELLED'] as any[] },
      },
      select: { id: true, ticketNumber: true, dueDate: true, deviceBrand: true, deviceModel: true },
    });

    for (const repair of overdueRepairs) {
      await this.notify({
        type:       'OVERDUE_REPAIR',
        title:      `งานซ่อมเกินกำหนด: ${repair.ticketNumber}`,
        message:    `${repair.ticketNumber} (${repair.deviceBrand} ${repair.deviceModel}) เกินกำหนดส่งมอบแล้ว`,
        severity:   'WARNING',
        entityType: 'Repair',
        entityId:   repair.id,
      });
    }

    // High-value customers (fire once per customer ever — check all, not just unread)
    const highValueRows = await this.prisma.sale.groupBy({
      by:     ['customerId'],
      where:  { status: 'COMPLETED' as any, customerId: { not: null } },
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
        select: { id: true, name: true },
      });
      if (!customer) continue;

      await this.notify({
        type:       'HIGH_VALUE_CUSTOMER',
        title:      `ลูกค้า VIP: ${customer.name}`,
        message:    `${customer.name} มียอดซื้อสะสม ${Number(row._sum.total).toFixed(0)} บาท`,
        severity:   'INFO',
        entityType: 'Customer',
        entityId:   customer.id,
      });
    }

    // Customers with unpaid balance (DELIVERED repairs still pending payment)
    const unpaidRepairs = await this.prisma.repair.findMany({
      where: {
        status:        'DELIVERED',
        paymentStatus: 'PENDING',
        customerId:    { not: null },
      },
      include: {
        customer:           { select: { name: true } },
        additionalPayments: { select: { amount: true } },
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
      });
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  // CHB-02: build a branch-scoped WHERE clause for notification queries.
  // Non-elevated users see only their branch's notifications plus system-wide
  // (branchId IS NULL) ones. Elevated users (OWNER, SUPER_ADMIN) see everything.
  private notificationScope(branchId: string | null, role: string): Record<string, any> {
    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    if (isElevated) return {};
    return { OR: [{ branchId }, { branchId: null }] };
  }

  async findAll(
    query: { isRead?: string; severity?: string; type?: string; page?: string; limit?: string },
    branchId: string | null,
    role: string,
  ) {
    const page  = Math.max(1, parseInt(query.page  ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20')));
    const skip  = (page - 1) * limit;

    const where: Record<string, any> = { ...this.notificationScope(branchId, role) };
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

  async getUnreadCount(branchId: string | null, role: string) {
    const where = { isRead: false, ...this.notificationScope(branchId, role) };
    const count = await this.prisma.notification.count({ where });
    return { count };
  }

  async markRead(id: string, branchId: string | null, role: string) {
    try {
      // CHB-02: verify the notification belongs to the caller's scope before marking
      const notif = await this.prisma.notification.findUnique({ where: { id }, select: { branchId: true } });
      if (!notif) return null;
      const scope = this.notificationScope(branchId, role);
      if (Object.keys(scope).length > 0) {
        const isOwn = notif.branchId === branchId || notif.branchId === null;
        if (!isOwn) return null;
      }
      return await this.prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
    } catch {
      return null;
    }
  }

  async markAllRead(branchId: string | null, role: string) {
    const where = { isRead: false, ...this.notificationScope(branchId, role) };
    const { count } = await this.prisma.notification.updateMany({
      where,
      data:  { isRead: true, readAt: new Date() },
    });
    return { count };
  }

  async checkTechnicianAlerts(): Promise<void> {
    const now = new Date();

    // ── Inactive technician: no repair received in last 7 days ──
    const cutoff7 = new Date();
    cutoff7.setDate(cutoff7.getDate() - 7);

    const techs = await this.prisma.user.findMany({
      where: { role: 'TECHNICIAN' as any, isActive: true },
      select: {
        id: true,
        name: true,
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
        });
      }
    }

    // ── High claim rate: >20% warranty claim rate in last 30 days (min 3 completed) ──
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

      const claimCount = await (this.prisma as any).warranty.count({
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
        });
      }
    }
  }

  async checkExpiringWarranties(): Promise<void> {
    const now = new Date();
    const warnDate = new Date();
    warnDate.setDate(warnDate.getDate() + 7);

    // Expire past-due ACTIVE warranties
    await (this.prisma as any).warranty.updateMany({
      where: { status: 'ACTIVE', endDate: { lt: now } },
      data:  { status: 'EXPIRED' },
    }).catch((e: any) => this.logger.warn(`warranty expire update error: ${(e as Error).message}`));

    // Notify warranties expiring within 7 days
    const expiring = await (this.prisma as any).warranty.findMany({
      where: {
        status:  'ACTIVE',
        endDate: { gt: now, lte: warnDate },
      },
      include: { customer: { select: { name: true } } },
    }).catch(() => []);

    for (const w of expiring) {
      await this.notify({
        type:       'WARRANTY_EXPIRING',
        title:      `การรับประกันใกล้หมดอายุ: ${w.warrantyNumber}`,
        message:    `${w.warrantyNumber}${w.customer ? ` (${w.customer.name})` : ''} จะหมดอายุวันที่ ${new Date(w.endDate).toLocaleDateString('th-TH')}`,
        severity:   'WARNING',
        entityType: 'Warranty',
        entityId:   w.id,
      });
    }
  }
}
