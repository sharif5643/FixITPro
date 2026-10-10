import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { centralLine, END_STATUSES, followLink } from '../line-messaging/line-central';

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

/** REP-20261002-A1B2C3 → REP-20261002-••••C3 (phone search must not hand out full ticket numbers). */
export function maskTicket(ticket: string): string {
  const dash = ticket.lastIndexOf('-');
  const head = dash >= 0 ? ticket.slice(0, dash + 1) : '';
  const tail = dash >= 0 ? ticket.slice(dash + 1) : ticket;
  if (tail.length <= 2) return head + '••';
  return head + '•'.repeat(tail.length - 2) + tail.slice(-2);
}

/** "สมชาย ใจดี" → "สม*** ใ***" */
export function maskName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  return name
    .trim()
    .split(/\s+/)
    .map((word, i) => Array.from(word).slice(0, i === 0 ? 2 : 1).join('') + '***')
    .join(' ');
}

const MIN_PHONE_DIGITS = 9;

function lineFollowUrlFor(ticketNumber: string, status: string): string | null {
  const line = centralLine();
  return line.ready && !END_STATUSES.has(status) ? followLink(line.oaId, ticketNumber) : null;
}

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

    // P1-5 FIX: phone verification gates access to PII fields.
    // Without phone: public fields only (status, device info, dates, statusHistory).
    // With ticket + correct phone: customer name (masked), outstanding, images, warranties.
    let phoneVerified = false;
    if (phone?.trim()) {
      const customerPhone = repair.customer?.phone?.replace(/\D/g, '') ?? '';
      const inputPhone    = phone.replace(/\D/g, '');
      // Compare the last 9 digits (drops 0 / +66 prefix). A short input such as "8"
      // must not match by its last digit alone.
      const digits        = Math.min(customerPhone.length, MIN_PHONE_DIGITS);
      const phoneOk       =
        digits > 0 &&
        inputPhone.length >= digits &&
        customerPhone.slice(-digits) === inputPhone.slice(-digits);

      if (!phoneOk) {
        throw new BadRequestException('หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลในระบบ');
      }
      phoneVerified = true;
    }

    const total       = Number(repair.finalCost ?? repair.estimatedTotal ?? repair.estimateCost ?? 0);
    const deposit     = Number(repair.deposit ?? 0);
    const paid        = Number(repair.paidAmount ?? 0);
    let outstanding   = 0;
    if (phoneVerified) {
      // Debt payments after handover are RepairAdditionalPayment rows (see debt-payments).
      const extra = await this.prisma.repairAdditionalPayment.aggregate({
        where: { repairId: repair.id },
        _sum: { amount: true },
      });
      outstanding = Math.max(0, total - deposit - paid - Number(extra._sum.amount ?? 0));
    }

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
      statusHistory,
      phoneVerified,
      // PII — only returned after phone verification
      customerName:      phoneVerified ? maskName(repair.customer?.name) : null,
      images:            phoneVerified ? repair.images : [],
      qcPassed:          phoneVerified ? (repair.qc?.allPassed ?? null) : null,
      qcNote:            phoneVerified ? (repair.qc?.note ?? null) : null,
      qcAt:              phoneVerified ? (repair.qc?.updatedAt ?? null) : null,
      outstanding:       phoneVerified ? outstanding : null,
      paymentStatus:     phoneVerified ? repair.paymentStatus : null,
      warranties:        phoneVerified ? repair.warranties : [],
      warrantyExpiresAt: phoneVerified ? repair.warrantyExpiresAt : null,
      warrantyNote:      phoneVerified ? repair.warrantyNote : null,
      // One tap: LINE opens FixITPro's chat with "ติดตามงาน <ticket>" typed in (hidden when not set up)
      lineFollowUrl:     lineFollowUrlFor(repair.ticketNumber, repair.status),
    };
  }

  // ── Search by phone — returns list of repairs for that number ─────────────
  // Anyone can type a phone number, so this returns status + device only and a masked
  // ticket number. Details need the full ticket number from the receipt / QR.
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
      maskedTicket: maskTicket(r.ticketNumber),
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
