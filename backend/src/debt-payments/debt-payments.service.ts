import { randomBytes } from 'crypto';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';

@Injectable()
export class DebtPaymentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  private generateReceiptNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `DP-${dateStr}-${suffix}`;
  }

  async create(
    dto: CreateDebtPaymentDto,
    userId: string,
    userName?: string,
    branchId?: string | null,
    role?: string,
  ) {
    const repair = await this.prisma.repair.findUnique({
      where: { id: dto.repairId },
      include: {
        customer:           { select: { id: true, name: true, phone: true } },
        additionalPayments: { select: { amount: true } },
      },
    });

    if (!repair) throw new NotFoundException('ไม่พบงานซ่อม');

    const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN';
    if (!isElevated && branchId !== undefined && repair.branchId !== branchId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงงานซ่อมนี้');
    }

    if (repair.status !== 'DELIVERED') {
      throw new BadRequestException('สามารถรับชำระได้เฉพาะงานซ่อมที่ส่งมอบแล้ว');
    }

    if (!['PENDING', 'PARTIAL'].includes(repair.paymentStatus)) {
      throw new BadRequestException('งานซ่อมนี้ชำระเงินครบแล้ว');
    }

    const finalCost    = Number(repair.finalCost ?? 0);
    const deposit      = Number(repair.deposit ?? 0);
    const previousPaid = repair.additionalPayments.reduce(
      (sum, p) => sum + Number(p.amount), 0,
    );
    const remaining = finalCost - deposit - previousPaid;

    if (dto.amount > remaining + 0.005) {
      throw new BadRequestException(
        `ยอดชำระ ${dto.amount.toLocaleString('th-TH')} เกินกว่ายอดคงเหลือ ${remaining.toFixed(2)}`,
      );
    }

    const payment = await this.prisma.repairAdditionalPayment.create({
      data: {
        repairId:      dto.repairId,
        amount:        dto.amount,
        paymentMethod: dto.paymentMethod as any,
        note:          dto.note,
        createdById:   userId,
      },
    });

    const newRemaining     = remaining - dto.amount;
    const newPaymentStatus = newRemaining <= 0.005 ? 'PAID' : 'PARTIAL';

    await this.prisma.repair.update({
      where: { id: dto.repairId },
      data:  { paymentStatus: newPaymentStatus },
    });

    const receiptNumber  = this.generateReceiptNumber();
    const customerName   = repair.customer?.name ?? 'ลูกค้า';
    const remainingAfter = Math.max(0, newRemaining);

    await this.auditLog.log({
      actorId:   userId,
      actorName: userName,
      action:    'DEBT_PAYMENT_RECEIVED',
      entityType: 'Repair',
      entityId:   dto.repairId,
      afterData: {
        amount:         dto.amount,
        paymentMethod:  dto.paymentMethod,
        remainingAfter,
        paymentStatus:  newPaymentStatus,
        receiptNumber,
      },
    });

    if (newPaymentStatus === 'PAID') {
      await this.notif.notify({
        type:       'DEBT_PAID',
        title:      `รับชำระครบ: ${customerName}`,
        message:    `${repair.deviceBrand} ${repair.deviceModel} (${repair.ticketNumber}) ชำระครบ ฿${dto.amount.toLocaleString('th-TH')}`,
        severity:   'INFO',
        entityType: 'Repair',
        entityId:   dto.repairId,
      });
    } else {
      await this.notif.notify({
        type:       'DEBT_PARTIAL',
        title:      `รับชำระบางส่วน: ${customerName}`,
        message:    `${repair.ticketNumber} รับ ฿${dto.amount.toLocaleString('th-TH')} คงเหลือ ฿${remainingAfter.toLocaleString('th-TH')}`,
        severity:   'INFO',
        entityType: 'Repair',
        entityId:   dto.repairId,
      });
    }

    return {
      payment: {
        id:            payment.id,
        amount:        payment.amount,
        paymentMethod: payment.paymentMethod,
        note:          payment.note,
        createdAt:     payment.createdAt,
        receiptNumber,
      },
      repair: {
        id:            repair.id,
        ticketNumber:  repair.ticketNumber,
        deviceBrand:   repair.deviceBrand,
        deviceModel:   repair.deviceModel,
        finalCost,
        deposit,
        previousPaid,
        amountPaid:    dto.amount,
        remainingAfter,
        paymentStatus: newPaymentStatus,
        customer:      repair.customer,
      },
      receiptNumber,
    };
  }

  async getByRepair(repairId: string) {
    return this.prisma.repairAdditionalPayment.findMany({
      where:   { repairId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
