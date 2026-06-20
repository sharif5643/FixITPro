import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

export const WARRANTY_EXPIRY_WARN_DAYS = 7;

@Injectable()
export class WarrantiesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  private generateWarrantyNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `WR-${dateStr}-${rand}`;
  }

  async createForRepair(
    repairId: string,
    warrantyDays: number,
    description?: string,
    actorId?: string,
    actorName?: string,
    tenantId?: string | null,
  ) {
    if (!warrantyDays || warrantyDays < 1) {
      throw new BadRequestException('Warranty duration must be at least 1 day');
    }

    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      select: { id: true, ticketNumber: true, customerId: true, branch: { select: { tenantId: true } } },
    });
    if (!repair) throw new NotFoundException('Repair not found');
    if (tenantId && repair.branch?.tenantId !== tenantId) {
      throw new NotFoundException('Repair not found');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + warrantyDays);

    const warranty = await this.prisma.warranty.create({
      data: {
        warrantyNumber: this.generateWarrantyNumber(),
        sourceType: 'REPAIR',
        status: 'ACTIVE',
        startDate,
        endDate,
        description: description ?? `การรับประกันงานซ่อม ${warrantyDays} วัน`,
        customerId: repair.customerId,
        repairId,
        createdById: actorId,
        createdByName: actorName,
      },
      include: { customer: { select: { name: true } }, repair: { select: { ticketNumber: true } } },
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'WARRANTY_CREATED',
      entityType: 'Warranty',
      entityId: warranty.id,
      afterData: { warrantyNumber: warranty.warrantyNumber, repairId, endDate, warrantyDays },
    });

    return warranty;
  }

  async createForSaleItem(
    saleItemId: string,
    warrantyDays: number,
    serialNumberId?: string,
    description?: string,
    actorId?: string,
    actorName?: string,
    tenantId?: string | null,
  ) {
    if (!warrantyDays || warrantyDays < 1) {
      throw new BadRequestException('Warranty duration must be at least 1 day');
    }

    const saleItem = await this.prisma.saleItem.findUnique({
      where: { id: saleItemId },
      include: {
        sale: { select: { customerId: true, receiptNumber: true, branch: { select: { tenantId: true } } } },
        product: { select: { name: true } },
      },
    });
    if (!saleItem) throw new NotFoundException('SaleItem not found');
    if (tenantId && saleItem.sale?.branch?.tenantId !== tenantId) {
      throw new NotFoundException('SaleItem not found');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + warrantyDays);

    const warranty = await this.prisma.warranty.create({
      data: {
        warrantyNumber: this.generateWarrantyNumber(),
        sourceType: 'PRODUCT',
        status: 'ACTIVE',
        startDate,
        endDate,
        description: description ?? `การรับประกันสินค้า ${saleItem.product.name} ${warrantyDays} วัน`,
        customerId: saleItem.sale.customerId,
        saleItemId,
        serialNumberId: serialNumberId ?? null,
        createdById: actorId,
        createdByName: actorName,
      },
      include: { customer: { select: { name: true } }, saleItem: { include: { product: { select: { name: true } } } } },
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'WARRANTY_CREATED',
      entityType: 'Warranty',
      entityId: warranty.id,
      afterData: { warrantyNumber: warranty.warrantyNumber, saleItemId, endDate, warrantyDays },
    });

    return warranty;
  }

  private tenantScope(tenantId?: string | null) {
    if (!tenantId) return {};
    return {
      OR: [
        { repair:   { branch: { tenantId } } },
        { saleItem: { sale:  { branch: { tenantId } } } },
      ],
    };
  }

  async findAll(query: {
    search?: string;
    status?: string;
    sourceType?: string;
    customerId?: string;
    page?: string;
    limit?: string;
  }, tenantId?: string | null) {
    const page  = Math.max(1, parseInt(query.page ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20')));
    const skip  = (page - 1) * limit;

    const where: any = { ...this.tenantScope(tenantId) };
    if (query.status)     where.status     = query.status;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.customerId) where.customerId = query.customerId;

    if (query.search) {
      const s = query.search.trim();
      where.AND = [
        { OR: [
          { warrantyNumber: { contains: s, mode: 'insensitive' } },
          { customer: { phone: { contains: s, mode: 'insensitive' } } },
          { customer: { name:  { contains: s, mode: 'insensitive' } } },
          { repair:   { ticketNumber: { contains: s, mode: 'insensitive' } } },
          { saleItem: { sale: { receiptNumber: { contains: s, mode: 'insensitive' } } } },
          { serialNumber: { serial: { contains: s, mode: 'insensitive' } } },
        ]},
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.warranty.findMany({
        where,
        include: {
          customer:     { select: { id: true, name: true, phone: true } },
          repair:       { select: { id: true, ticketNumber: true, deviceBrand: true, deviceModel: true } },
          saleItem:     { include: { product: { select: { id: true, name: true } }, sale: { select: { receiptNumber: true } } } },
          serialNumber: { select: { id: true, serial: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.warranty.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, tenantId?: string | null) {
    const where: any = { id, ...this.tenantScope(tenantId) };
    const w = await this.prisma.warranty.findFirst({
      where,
      include: {
        customer:     { select: { id: true, name: true, phone: true } },
        repair:       { select: { id: true, ticketNumber: true, deviceBrand: true, deviceModel: true, warrantyNote: true } },
        saleItem:     { include: { product: { select: { id: true, name: true, sku: true } }, sale: { select: { receiptNumber: true, createdAt: true } } } },
        serialNumber: { select: { id: true, serial: true } },
      },
    });
    if (!w) throw new NotFoundException('Warranty not found');
    return w;
  }

  async update(
    id: string,
    dto: { notes?: string; endDate?: string; description?: string },
    actorId?: string,
    actorName?: string,
    tenantId?: string | null,
  ) {
    const existing = await this.findOne(id, tenantId);
    if (existing.status === 'VOIDED') throw new BadRequestException('ไม่สามารถแก้ไขการรับประกันที่ยกเลิกแล้ว');

    const data: any = {};
    if (dto.notes !== undefined)       data.notes       = dto.notes;
    if (dto.endDate !== undefined) {
      const newEnd = new Date(dto.endDate);
      // N-4 FIX: new endDate must be strictly after the warranty's startDate
      if (newEnd <= existing.startDate) {
        throw new BadRequestException('Warranty end date must be after its start date');
      }
      data.endDate = newEnd;
    }
    if (dto.description !== undefined) data.description = dto.description;

    const updated = await this.prisma.warranty.update({ where: { id }, data });

    await this.auditLog.log({
      actorId, actorName,
      action: 'WARRANTY_UPDATED',
      entityType: 'Warranty',
      entityId: id,
      afterData: data,
    });

    return updated;
  }

  async void(
    id: string,
    reason: string,
    actorId?: string,
    actorName?: string,
    tenantId?: string | null,
  ) {
    const existing = await this.findOne(id, tenantId);
    if (existing.status === 'VOIDED') throw new BadRequestException('การรับประกันนี้ถูกยกเลิกแล้ว');

    const updated = await this.prisma.warranty.update({
      where: { id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidedReason: reason },
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'WARRANTY_VOIDED',
      entityType: 'Warranty',
      entityId: id,
      afterData: { voidedReason: reason },
    });

    return updated;
  }

  async markClaimed(id: string, actorId?: string, actorName?: string, tenantId?: string | null) {
    const existing = await this.findOne(id, tenantId);
    if (existing.status !== 'ACTIVE') throw new BadRequestException('สามารถใช้สิทธิ์การรับประกันได้เฉพาะที่ยังใช้ได้เท่านั้น');

    const updated = await this.prisma.warranty.update({
      where: { id },
      data: { status: 'CLAIMED' },
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'WARRANTY_CLAIM_CREATED',
      entityType: 'Warranty',
      entityId: id,
      afterData: { warrantyNumber: existing.warrantyNumber },
    });

    // Check for repeated claim customer
    if (existing.customerId) {
      const claimCount = await this.prisma.warranty.count({
        where: { customerId: existing.customerId, status: 'CLAIMED' },
      });
      if (claimCount >= 2) {
        await this.notif.notify({
          type:       'REPEATED_CLAIM_CUSTOMER',
          title:      `ลูกค้าเคลมซ้ำ: ${existing.customer?.name ?? 'ไม่ระบุ'}`,
          message:    `${existing.customer?.name ?? 'ไม่ระบุ'} มีการใช้สิทธิ์การรับประกัน ${claimCount} ครั้ง`,
          severity:   'WARNING',
          entityType: 'Customer',
          entityId:   existing.customerId,
        });
      }
    }

    return updated;
  }

  async checkExpiringWarranties(): Promise<void> {
    const now = new Date();
    const warnDate = new Date();
    warnDate.setDate(warnDate.getDate() + WARRANTY_EXPIRY_WARN_DAYS);

    const expiring = await this.prisma.warranty.findMany({
      where: {
        status:  'ACTIVE',
        endDate: { gt: now, lte: warnDate },
      },
      include: { customer: { select: { name: true } } },
    });

    for (const w of expiring) {
      await this.notif.notify({
        type:       'WARRANTY_EXPIRING',
        title:      `การรับประกันใกล้หมดอายุ: ${w.warrantyNumber}`,
        message:    `${w.warrantyNumber}${w.customer ? ` (${w.customer.name})` : ''} จะหมดอายุในวันที่ ${w.endDate.toLocaleDateString('th-TH')}`,
        severity:   'WARNING',
        entityType: 'Warranty',
        entityId:   w.id,
      });
    }

    // Also expire past-due ACTIVE warranties
    await this.prisma.warranty.updateMany({
      where: { status: 'ACTIVE', endDate: { lt: now } },
      data:  { status: 'EXPIRED' },
    });
  }

  async getStats(tenantId?: string | null) {
    const scope = this.tenantScope(tenantId);
    const [active, expiredCount, voided, claimed] = await Promise.all([
      this.prisma.warranty.count({ where: { ...scope, status: 'ACTIVE' } }),
      this.prisma.warranty.count({ where: { ...scope, status: 'EXPIRED' } }),
      this.prisma.warranty.count({ where: { ...scope, status: 'VOIDED' } }),
      this.prisma.warranty.count({ where: { ...scope, status: 'CLAIMED' } }),
    ]);
    return { active, expired: expiredCount, voided, claimed };
  }
}
