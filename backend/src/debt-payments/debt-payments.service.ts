import { randomBytes } from 'crypto';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { activeShiftWhere } from '../shifts/active-shift';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';
import { RepairAccountingAdapter } from '../repairs/repair-accounting.adapter';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { bangkokYmd } from '../common/bangkok-date';

@Injectable()
export class DebtPaymentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    private accounting: AccountingService,
    private repairAccounting: RepairAccountingAdapter,
  ) {}

  private generateReceiptNumber(): string {
    const dateStr = bangkokYmd();
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `DP-${dateStr}-${suffix}`;
  }

  async create(
    dto: CreateDebtPaymentDto,
    userId: string,
    userName?: string,
    branchId?: string | null,
    role?: string,
    tenantId?: string | null,
  ) {
    const repair = await this.prisma.repair.findUnique({
      where: { id: dto.repairId },
      include: {
        customer:           { select: { id: true, name: true, phone: true } },
        additionalPayments: { select: { amount: true } },
        branch:             { select: { tenantId: true } },
      },
    });

    if (!repair) throw new NotFoundException('ไม่พบงานซ่อม');
    // Elevated roles skip the branch check below, but never cross tenants
    if (role !== 'SUPER_ADMIN' && tenantId && repair.branch?.tenantId !== tenantId) {
      throw new NotFoundException('ไม่พบงานซ่อม');
    }

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

    const receiptNumber = this.generateReceiptNumber();
    const customerName  = repair.customer?.name ?? 'ลูกค้า';

    // The receiving user's open shift — cash collected here counts toward its expected cash
    const activeShift = await this.prisma.shift.findFirst({
      where:  activeShiftWhere(userId),
      select: { id: true },
    });

    // Atomic: create payment record + update repair status + write audit log + record in ledger.
    // All four must commit together — if any step fails, the entire transaction rolls back.
    const { payment, finalCost, deposit, previousPaid, remainingAfter, newPaymentStatus } =
      await this.prisma.$transaction(async (tx) => {
      // Lock the repair so two concurrent payments cannot both pass the balance check
      await tx.$queryRaw`SELECT id FROM "Repair" WHERE id = ${dto.repairId} FOR UPDATE`;
      const fresh = await tx.repair.findUniqueOrThrow({
        where:  { id: dto.repairId },
        select: {
          paymentStatus: true, finalCost: true, deposit: true, paidAmount: true,
          additionalPayments: { select: { amount: true } },
        },
      });
      if (!['PENDING', 'PARTIAL'].includes(fresh.paymentStatus)) {
        throw new BadRequestException('งานซ่อมนี้ชำระเงินครบแล้ว');
      }

      const finalCost    = Number(fresh.finalCost ?? 0);
      const deposit      = Number(fresh.deposit ?? 0);
      // Paid so far = amount paid at handover (paidAmount) + earlier debt payments
      const previousPaid = Number(fresh.paidAmount ?? 0)
        + fresh.additionalPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remaining    = Math.round((finalCost - deposit - previousPaid) * 100) / 100;

      if (dto.amount > remaining + 0.005) {
        throw new BadRequestException(
          `ยอดชำระ ${dto.amount.toLocaleString('th-TH')} เกินกว่ายอดคงเหลือ ${Math.max(0, remaining).toFixed(2)}`,
        );
      }

      const newRemaining     = remaining - dto.amount;
      const newPaymentStatus = newRemaining <= 0.005 ? 'PAID' : 'PARTIAL';
      const remainingAfter   = Math.max(0, Math.round(newRemaining * 100) / 100);

      const pmt = await tx.repairAdditionalPayment.create({
        data: {
          repairId:      dto.repairId,
          amount:        dto.amount,
          paymentMethod: dto.paymentMethod as any,
          note:          dto.note,
          shiftId:       activeShift?.id ?? null,
          createdById:   userId,
        },
      });

      await tx.repair.update({
        where: { id: dto.repairId },
        data:  { paymentStatus: newPaymentStatus },
      });

      await tx.auditLog.create({
        data: {
          actorId:    userId,
          actorName:  userName ?? null,
          action:     'DEBT_PAYMENT_RECEIVED',
          entityType: 'Repair',
          entityId:   dto.repairId,
          afterData: {
            amount:         dto.amount,
            paymentMethod:  dto.paymentMethod,
            remainingAfter,
            paymentStatus:  newPaymentStatus,
            receiptNumber,
          } as any,
        },
      });

      await this.accounting.record(
        {
          sourceType:    ACCOUNTING_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
          sourceId:      pmt.id,
          paymentMethod: dto.paymentMethod as any,
          amount:        dto.amount,
          direction:     'IN',
          branchId:      repair.branchId,
          tenantId:      repair.branch?.tenantId ?? null,
          actorUserId:   userId,
          note:          dto.note,
        },
        tx,
      );

      return { payment: pmt, finalCost, deposit, previousPaid, remainingAfter, newPaymentStatus };
    });

    // Post-commit: record additional payment journal (AFTER $transaction — failure swallowed)
    const dpTenantId = repair.branch?.tenantId ?? null;
    if (dpTenantId && repair.branchId) {
      await this.repairAccounting.recordAdditionalPaymentJournal(
        { id: payment.id, amount: payment.amount, paymentMethod: payment.paymentMethod as string },
        { id: repair.id, ticketNumber: repair.ticketNumber, branchId: repair.branchId },
        dpTenantId,
        userId,
      );
    }

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

  async getByRepair(repairId: string, tenantId?: string | null) {
    return this.prisma.repairAdditionalPayment.findMany({
      where:   { repairId, ...(tenantId ? { repair: { branch: { tenantId } } } : {}) },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
