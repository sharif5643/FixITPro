import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const STATUS_LABEL: Record<string, string> = {
  RECEIVED:         'รับงานแล้ว',
  DIAGNOSING:       'กำลังวินิจฉัยอาการ',
  WAITING_APPROVAL: 'รออนุมัติราคาซ่อม',
  APPROVED:         'อนุมัติแล้ว — กำลังซ่อม',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  QC_PENDING:       'กำลังตรวจสอบคุณภาพ (QC)',
  COMPLETED:        'ซ่อมเสร็จแล้ว',
  READY_PICKUP:     'พร้อมรับเครื่อง',
  DELIVERED:        'ส่งมอบแล้ว',
  CANCELLED:        'ยกเลิก',
};

@Injectable()
export class PublicTrackingService {
  constructor(private prisma: PrismaService) {}

  // ── Search by ticket number (phone optional for full verification) ─────────
  async trackRepair(ticketNumber: string, phone?: string) {
    if (!ticketNumber?.trim()) throw new BadRequestException('กรุณาระบุหมายเลขงานซ่อม');

    const repair = await this.prisma.repair.findUnique({
      where: { ticketNumber: ticketNumber.trim().toUpperCase() },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        deviceBrand: true,
        deviceModel: true,
        deviceColor: true,
        receivedAt: true,
        dueDate: true,
        completedAt: true,
        deliveredAt: true,
        warrantyExpiresAt: true,
        warrantyNote: true,
        paymentStatus: true,
        finalCost: true,
        estimatedTotal: true,
        estimateCost: true,
        deposit: true,
        paidAmount: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
        images: {
          orderBy: { createdAt: 'asc' as const },
          select: { id: true, url: true, createdAt: true },
        },
        qc: {
          select: { allPassed: true, note: true, updatedAt: true },
        },
        warranties: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            warrantyNumber: true,
            status: true,
            startDate: true,
            endDate: true,
            description: true,
          },
        },
      },
    });

    if (!repair) throw new NotFoundException('ไม่พบงานซ่อม กรุณาตรวจสอบหมายเลขงานซ่อม');

    // Phone verification — only when phone is provided
    if (phone?.trim()) {
      const customerPhone = repair.customer?.phone?.replace(/\D/g, '') ?? '';
      const inputPhone    = phone.replace(/\D/g, '');
      const digits        = Math.min(customerPhone.length, inputPhone.length, 9);
      const phoneOk       =
        digits > 0 &&
        customerPhone.slice(-digits) === inputPhone.slice(-digits);

      if (!phoneOk) {
        throw new BadRequestException('หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลในระบบ');
      }
    }

    const total       = Number(repair.finalCost ?? repair.estimatedTotal ?? repair.estimateCost ?? 0);
    const deposit     = Number(repair.deposit ?? 0);
    const paid        = Number(repair.paidAmount ?? 0);
    const outstanding = Math.max(0, total - deposit - paid);

    const statusHistory = await this.buildStatusHistory(repair.id, repair.receivedAt);

    return {
      ticketNumber:      repair.ticketNumber,
      status:            repair.status,
      statusLabel:       STATUS_LABEL[repair.status] ?? repair.status,
      deviceBrand:       repair.deviceBrand,
      deviceModel:       repair.deviceModel,
      deviceColor:       repair.deviceColor,
      receivedAt:        repair.receivedAt,
      dueDate:           repair.dueDate,
      completedAt:       repair.completedAt,
      deliveredAt:       repair.deliveredAt,
      customerName:      repair.customer?.name,
      images:            repair.images,
      qcPassed:          repair.qc?.allPassed ?? null,
      qcNote:            repair.qc?.note ?? null,
      qcAt:              repair.qc?.updatedAt ?? null,
      outstanding,
      paymentStatus:     repair.paymentStatus,
      warranties:        repair.warranties,
      warrantyExpiresAt: repair.warrantyExpiresAt,
      warrantyNote:      repair.warrantyNote,
      statusHistory,
    };
  }

  // ── Search by phone — returns list of repairs for that number ─────────────
  async searchByPhone(phone: string) {
    if (!phone?.trim()) throw new BadRequestException('กรุณาระบุหมายเลขโทรศัพท์');

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) throw new BadRequestException('หมายเลขโทรศัพท์ไม่ถูกต้อง');

    // Find customers whose phone ends with the last 9 digits
    const suffix = cleanPhone.slice(-9);
    const customers = await this.prisma.customer.findMany({
      where: { phone: { endsWith: suffix } },
      select: { id: true },
    });

    if (customers.length === 0) return [];

    const customerIds = customers.map((c) => c.id);

    const repairs = await this.prisma.repair.findMany({
      where: {
        customerId: { in: customerIds },
        status: { not: 'CANCELLED' },
      },
      select: {
        ticketNumber: true,
        status: true,
        deviceBrand: true,
        deviceModel: true,
        deviceColor: true,
        receivedAt: true,
        dueDate: true,
        completedAt: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    });

    return repairs.map((r) => ({
      ticketNumber: r.ticketNumber,
      status:       r.status,
      statusLabel:  STATUS_LABEL[r.status] ?? r.status,
      deviceBrand:  r.deviceBrand,
      deviceModel:  r.deviceModel,
      deviceColor:  r.deviceColor,
      receivedAt:   r.receivedAt,
      dueDate:      r.dueDate,
      completedAt:  r.completedAt,
    }));
  }

  private async buildStatusHistory(
    repairId: string,
    receivedAt: Date,
  ): Promise<{ status: string; label: string; changedAt: Date }[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'Repair',
        entityId: repairId,
        action: { in: ['REPAIR_CREATED', 'REPAIR_UPDATED', 'REPAIR_QC_SUBMITTED', 'REPAIR_PAYMENT'] },
      },
      select: { action: true, afterData: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const history: { status: string; label: string; changedAt: Date }[] = [];

    for (const log of logs) {
      const data = log.afterData as Record<string, unknown> | null;
      let status: string | null = null;

      if (log.action === 'REPAIR_CREATED') {
        status = 'RECEIVED';
      } else if (log.action === 'REPAIR_UPDATED' && data?.status) {
        status = String(data.status);
      } else if (log.action === 'REPAIR_QC_SUBMITTED') {
        status = data?.allPassed ? 'COMPLETED' : 'IN_PROGRESS';
      } else if (log.action === 'REPAIR_PAYMENT') {
        status = 'DELIVERED';
      }

      if (status) {
        const last = history[history.length - 1];
        if (!last || last.status !== status) {
          history.push({
            status,
            label: STATUS_LABEL[status] ?? status,
            changedAt: log.createdAt,
          });
        }
      }
    }

    if (history.length === 0) {
      history.push({ status: 'RECEIVED', label: 'รับงานแล้ว', changedAt: receivedAt });
    }

    return history;
  }
}
