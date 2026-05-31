import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { TenantPlan } from '@prisma/client';

const DAY_MS = 86_400_000;

const PAYMENT_INCLUDE = {
  tenant: { select: { id: true, shopName: true, ownerName: true, email: true, status: true, plan: true, expiryDate: true } },
  verifiedBy: { select: { id: true, name: true, email: true } },
  activatedBy: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private prisma: PrismaService) {}

  async stats() {
    const [total, pending, verified, rejected, activated] = await Promise.all([
      this.prisma.tenantPayment.count(),
      this.prisma.tenantPayment.count({ where: { status: 'PENDING' } }),
      this.prisma.tenantPayment.count({ where: { status: 'VERIFIED', activatedAt: null } }),
      this.prisma.tenantPayment.count({ where: { status: 'REJECTED' } }),
      this.prisma.tenantPayment.count({ where: { status: 'VERIFIED', activatedAt: { not: null } } }),
    ]);
    return { total, pending, verified, rejected, activated };
  }

  async findAll(filter?: string, tenantId?: string) {
    const where: Record<string, any> = {};

    if (tenantId) where.tenantId = tenantId;

    switch (filter) {
      case 'pending':   where.status = 'PENDING'; break;
      case 'verified':  where.status = 'VERIFIED'; where.activatedAt = null; break;
      case 'rejected':  where.status = 'REJECTED'; break;
      case 'activated': where.status = 'VERIFIED'; where.activatedAt = { not: null }; break;
    }

    return this.prisma.tenantPayment.findMany({
      where,
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const payment = await this.prisma.tenantPayment.findUnique({
      where: { id },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงิน');
    return payment;
  }

  async create(dto: CreatePaymentDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');

    const payment = await this.prisma.tenantPayment.create({
      data: {
        tenantId: dto.tenantId,
        plan: dto.plan,
        duration: dto.duration ?? 30,
        customExpiryDate: dto.customExpiryDate ? new Date(dto.customExpiryDate) : undefined,
        paymentReference: dto.paymentReference,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        paymentAmount: dto.paymentAmount,
        paymentNote: dto.paymentNote,
      },
      include: PAYMENT_INCLUDE,
    });

    this.logger.log(`Payment created: ${payment.id} for tenant ${tenant.shopName}`);
    return payment;
  }

  async verify(id: string, dto: VerifyPaymentDto, adminId: string) {
    const payment = await this.prisma.tenantPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงิน');
    if (payment.status === 'VERIFIED') throw new ConflictException('ตรวจสอบแล้ว ไม่สามารถตรวจสอบซ้ำได้');
    if (payment.status === 'REJECTED') throw new BadRequestException('รายการถูกปฏิเสธแล้ว ไม่สามารถตรวจสอบได้');

    const updated = await this.prisma.tenantPayment.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        paymentReference: dto.paymentReference ?? payment.paymentReference,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : payment.paymentDate,
        paymentAmount: dto.paymentAmount ?? payment.paymentAmount,
        paymentNote: dto.paymentNote ?? payment.paymentNote,
        adminNote: dto.adminNote,
        verifiedById: adminId,
        verifiedAt: new Date(),
      },
      include: PAYMENT_INCLUDE,
    });

    this.logger.log(`Payment verified: ${id} by admin ${adminId}`);
    return updated;
  }

  async reject(id: string, dto: RejectPaymentDto, adminId: string) {
    const payment = await this.prisma.tenantPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงิน');
    if (payment.activatedAt) throw new ConflictException('ไม่สามารถปฏิเสธรายการที่เปิดใช้งานแล้ว');
    if (payment.status === 'REJECTED') throw new ConflictException('ปฏิเสธแล้ว');

    const updated = await this.prisma.tenantPayment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNote: dto.adminNote,
        verifiedById: adminId,
        verifiedAt: new Date(),
      },
      include: PAYMENT_INCLUDE,
    });

    this.logger.log(`Payment rejected: ${id} by admin ${adminId}`);
    return updated;
  }

  async activate(id: string, adminId: string) {
    const payment = await this.prisma.tenantPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงิน');
    if (payment.status !== 'VERIFIED') {
      throw new BadRequestException('ต้องตรวจสอบการชำระเงินก่อนเปิดใช้งาน');
    }
    if (payment.activatedAt) throw new ConflictException('เปิดใช้งานแล้ว ไม่สามารถทำซ้ำได้');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: payment.tenantId } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');

    const now = new Date();
    let newExpiryDate: Date;
    if (payment.customExpiryDate) {
      newExpiryDate = payment.customExpiryDate;
    } else {
      const base = tenant.expiryDate && tenant.expiryDate > now ? tenant.expiryDate : now;
      newExpiryDate = new Date(base.getTime() + payment.duration * DAY_MS);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.tenantRenewal.create({
        data: {
          tenantId: payment.tenantId,
          action: 'PAYMENT_ACTIVATE',
          plan: payment.plan,
          duration: payment.duration,
          expiryDate: newExpiryDate,
          note: [
            `ตรวจสอบโดย admin`,
            payment.paymentReference ? `Ref: ${payment.paymentReference}` : null,
            payment.paymentAmount ? `฿${payment.paymentAmount}` : null,
          ].filter(Boolean).join(' | '),
        },
      });

      await tx.tenant.update({
        where: { id: payment.tenantId },
        data: {
          status: 'ACTIVE',
          plan: payment.plan as TenantPlan,
          expiryDate: newExpiryDate,
          startDate: tenant.startDate ?? now,
        },
      });

      const updated = await tx.tenantPayment.update({
        where: { id },
        data: { activatedAt: now, activatedById: adminId },
        include: PAYMENT_INCLUDE,
      });

      this.logger.log(
        `Payment activated: ${id} for tenant ${tenant.shopName} → expiry ${newExpiryDate.toISOString()}`,
      );
      return updated;
    });
  }
}
