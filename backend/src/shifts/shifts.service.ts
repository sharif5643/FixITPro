import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CashDrawerSessionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService, SHIFT_MISMATCH_THRESHOLD } from '../notifications/notifications.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { CarrierWalletService } from '../carrier-wallet/carrier-wallet.service';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);
  constructor(
    private prisma: PrismaService,
    private carrierWalletService: CarrierWalletService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  private async assertBranchActive(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { status: true },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    if ((branch as any).status !== 'ACTIVE') {
      throw new ForbiddenException('สาขานี้ยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน');
    }
  }

  async openShift(dto: OpenShiftDto, userId: string, branchId?: string, tenantId?: string | null) {
    this.logger.log(`openShift start userId=${userId} branchId=${branchId ?? 'null'}`);
    if (branchId) await this.assertBranchActive(branchId);

    const activeShift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
    });

    if (activeShift) {
      this.logger.warn(`openShift rejected: userId=${userId} already has active shift id=${activeShift.id}`);
      throw new BadRequestException('You already have an open shift');
    }

    const shift = await this.prisma.shift.create({
      data: {
        userId,
        branchId:           branchId ?? null,
        openBalance:       dto.openBalance,
        note:              dto.note,
        isActive:          true,
        aisOpeningBalance:  dto.aisOpeningBalance  ?? null,
        trueOpeningBalance: dto.trueOpeningBalance ?? null,
        dtacOpeningBalance: dto.dtacOpeningBalance ?? null,
        ntOpeningBalance:   dto.ntOpeningBalance   ?? null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    // Record carrier wallet opening balances when provided
    const carrierBalances: Partial<Record<'AIS' | 'TRUE' | 'DTAC' | 'NT', number>> = {};
    if (dto.aisOpeningBalance  != null) carrierBalances['AIS']  = dto.aisOpeningBalance;
    if (dto.trueOpeningBalance != null) carrierBalances['TRUE'] = dto.trueOpeningBalance;
    if (dto.dtacOpeningBalance != null) carrierBalances['DTAC'] = dto.dtacOpeningBalance;
    if (dto.ntOpeningBalance   != null) carrierBalances['NT']   = dto.ntOpeningBalance;

    if (Object.keys(carrierBalances).length > 0) {
      await this.carrierWalletService.recordOpeningBalances(shift.id, userId, carrierBalances);
    }

    // Auto-open CashDrawerSession so CASH payments work immediately after opening a shift.
    // If a session is already open for the branch, we leave it untouched.
    if (branchId) {
      try {
        let drawer = await this.prisma.cashDrawer.findFirst({
          where: { branchId, isActive: true },
          select: { id: true },
        });
        if (!drawer) {
          drawer = await this.prisma.cashDrawer.create({
            data: { name: 'ลิ้นชักหลัก', code: 'MAIN', branchId, tenantId: tenantId ?? undefined },
            select: { id: true },
          });
        }

        const existingSession = await this.prisma.cashDrawerSession.findFirst({
          where: { cashDrawerId: drawer.id, status: CashDrawerSessionStatus.OPEN },
          select: { id: true },
        });

        if (!existingSession) {
          await this.prisma.$transaction(async (tx) => {
            const session = await tx.cashDrawerSession.create({
              data: {
                tenantId:      tenantId ?? undefined,
                branchId,
                cashDrawerId:  drawer!.id,
                openedById:    userId,
                openingAmount: dto.openBalance,
              },
            });
            await tx.cashDrawerParticipant.create({
              data: { sessionId: session.id, userId },
            });
            await tx.cashDrawerTransaction.create({
              data: {
                sessionId:    session.id,
                cashDrawerId: drawer!.id,
                tenantId:     tenantId ?? undefined,
                branchId,
                actorUserId:  userId,
                type:         'OPENING',
                direction:    'IN',
                amount:       dto.openBalance,
                reason:       'เงินตั้งต้นเปิดกะ',
              },
            });
          });
          this.logger.log(`openShift: auto-opened CashDrawerSession for shift=${shift.id} branch=${branchId}`);
        } else {
          this.logger.log(`openShift: CashDrawerSession already open for branch=${branchId}, using existing`);
        }
      } catch (err: any) {
        this.logger.warn(`openShift: could not auto-open CashDrawerSession for branch=${branchId}: ${err?.message}`);
      }
    }

    await this.auditLog.log({
      actorId: userId,
      actorName: shift.user.name,
      action: 'SHIFT_OPENED',
      entityType: 'Shift',
      entityId: shift.id,
      afterData: { openBalance: Number(dto.openBalance) },
    });

    this.logger.log(`openShift success shiftId=${shift.id} userId=${userId} branchId=${branchId ?? 'null'}`);
    return shift;
  }

  async closeShift(shiftId: string, dto: CloseShiftDto, userId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, userId, isActive: true },
      include: { user: { select: { tenantId: true } } },
    });

    if (!shift) throw new NotFoundException('Active shift not found');

    const [sales, repairPayments, supplierPayments, packageSales, cashExpensesAgg, cashRefundsAgg] = await Promise.all([
      this.prisma.sale.findMany({
        where: { shiftId, status: { not: 'VOIDED' } },
        select: { total: true, paymentMethod: true },
      }),
      this.prisma.repair.findMany({
        where: { paymentShiftId: shiftId },
        select: { paidAmount: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          paidAt: { gte: shift.openedAt, lt: shift.closedAt ?? new Date() },
          ...(shift.user?.tenantId ? { purchaseOrder: { supplier: { tenantId: shift.user.tenantId } } } : {}),
        },
        select: { amount: true, paymentMethod: true },
      }),
      this.prisma.packageSale.findMany({
        where: { shiftId },
        select: { packageAmount: true, profit: true, paymentMethod: true },
      }),
      this.prisma.expense.aggregate({
        where: { shiftId, paymentMethod: 'CASH', voidedAt: null },
        _sum: { amount: true },
      }),
      // P0-3 FIX: sum CASH refunds for this shift so they are subtracted from expectedBalance
      (this.prisma as any).saleRefund.aggregate({
        where: { paymentMethod: 'CASH', sale: { shiftId } },
        _sum: { totalRefund: true },
      }),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const salesCount = sales.length;

    const paymentBreakdown = sales.reduce(
      (acc, s) => {
        acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + Number(s.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const repairBreakdown = repairPayments.reduce(
      (acc, r) => {
        const m = r.paymentMethod ?? 'CASH';
        acc[m] = (acc[m] || 0) + Number(r.paidAmount ?? 0);
        return acc;
      },
      {} as Record<string, number>,
    );
    const repairTotalAmount = repairPayments.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0);

    const supplierBreakdown = supplierPayments.reduce(
      (acc, p) => {
        acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + Number(p.amount);
        return acc;
      },
      {} as Record<string, number>,
    );
    const supplierTotalAmount = supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    const packageSaleTotalAmount = packageSales.reduce((sum, p) => sum + Number(p.packageAmount), 0);
    const packageSaleProfit = packageSales.reduce((sum, p) => sum + Number(p.profit), 0);
    const cashPackageSales = packageSales
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + Number(p.packageAmount), 0);

    // Expected cash = opening + CASH sales + CASH repairs + CASH package sales − CASH supplier payments − CASH expenses − CASH refunds
    const cashSales = paymentBreakdown['CASH'] ?? 0;
    const cashRepairs = repairBreakdown['CASH'] ?? 0;
    const cashSupplierPayments = supplierBreakdown['CASH'] ?? 0;
    const cashExpensesTotal = Number(cashExpensesAgg._sum.amount ?? 0);
    const cashRefundsTotal  = Number(cashRefundsAgg._sum.totalRefund ?? 0);
    const expectedBalance =
      Number(shift.openBalance) + cashSales + cashRepairs + cashPackageSales
      - cashSupplierPayments - cashExpensesTotal - cashRefundsTotal;

    this.logger.log(
      `ShiftClose id=${shiftId} sales=${salesCount} total=${totalSales} cashSales=${cashSales} cashRepairs=${cashRepairs} cashSupplier=${cashSupplierPayments} cashExpenses=${cashExpensesTotal} cashRefunds=${cashRefundsTotal} expected=${expectedBalance}`,
    );

    const updatedShift = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closeBalance: dto.closeBalance,
        isActive: false,
        note: dto.note,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    await this.auditLog.log({
      actorId: userId,
      actorName: updatedShift.user.name,
      action: 'SHIFT_CLOSED',
      entityType: 'Shift',
      entityId: shiftId,
      afterData: {
        closeBalance: dto.closeBalance,
        totalSales,
        salesCount,
        expectedBalance,
        difference: dto.closeBalance - expectedBalance,
      },
    });

    const difference = dto.closeBalance - expectedBalance;
    if (Math.abs(difference) > SHIFT_MISMATCH_THRESHOLD) {
      await this.notif.notify({
        type:       'SHIFT_MISMATCH',
        title:      `เงินในลิ้นชักไม่ตรง: ${difference > 0 ? '+' : ''}${difference.toFixed(0)} บาท`,
        message:    `กะของ ${updatedShift.user.name} — คาดว่า ${expectedBalance.toFixed(0)} บาท แต่นับได้ ${dto.closeBalance.toFixed(0)} บาท (ผิดพลาด ${Math.abs(difference).toFixed(0)} บาท)`,
        severity:   Math.abs(difference) > 500 ? 'ERROR' : 'WARNING',
        entityType: 'Shift',
        entityId:   shiftId,
      });
    }

    return {
      ...updatedShift,
      summary: {
        salesCount,
        totalSales,
        paymentBreakdown,
        repairPayments: {
          count: repairPayments.length,
          totalAmount: repairTotalAmount,
          paymentBreakdown: repairBreakdown,
        },
        supplierPayments: {
          count: supplierPayments.length,
          totalAmount: supplierTotalAmount,
          paymentBreakdown: supplierBreakdown,
        },
        packageSales: {
          count: packageSales.length,
          totalAmount: packageSaleTotalAmount,
          totalProfit: packageSaleProfit,
        },
        cashExpenses: cashExpensesTotal,
        cashRefunds: cashRefundsTotal,
        expectedBalance,
        actualBalance: dto.closeBalance,
        difference: dto.closeBalance - expectedBalance,
      },
    };
  }

  async getCurrentShift(userId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
      include: {
        user: { select: { id: true, name: true, tenantId: true } },
      },
    });

    if (!shift) return null;

    const [sales, repairPayments, supplierPayments, packageSales, cashExpensesAgg, cashRefundsAgg] = await Promise.all([
      this.prisma.sale.findMany({
        where: { shiftId: shift.id, status: { not: 'VOIDED' } },
        select: { total: true, paymentMethod: true },
      }),
      this.prisma.repair.findMany({
        where: { paymentShiftId: shift.id },
        select: { paidAmount: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          paidAt: { gte: shift.openedAt, lt: shift.closedAt ?? new Date() },
          ...(shift.user?.tenantId ? { purchaseOrder: { supplier: { tenantId: shift.user.tenantId } } } : {}),
        },
        select: { amount: true, paymentMethod: true },
      }),
      this.prisma.packageSale.findMany({
        where: { shiftId: shift.id },
        select: { packageAmount: true, profit: true, paymentMethod: true },
      }),
      this.prisma.expense.aggregate({
        where: { shiftId: shift.id, paymentMethod: 'CASH', voidedAt: null },
        _sum: { amount: true },
      }),
      // P0-3 FIX: sum CASH refunds for live shift expectedCashBalance
      (this.prisma as any).saleRefund.aggregate({
        where: { paymentMethod: 'CASH', sale: { shiftId: shift.id } },
        _sum: { totalRefund: true },
      }),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const repairRevenue = repairPayments.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0);
    const supplierExpenses = supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const packageSaleRevenue = packageSales.reduce((sum, p) => sum + Number(p.profit), 0);
    const packageSaleAmount = packageSales.reduce((sum, p) => sum + Number(p.packageAmount), 0);

    const cashSales = sales.filter(s => s.paymentMethod === 'CASH').reduce((sum, s) => sum + Number(s.total), 0);
    const cashRepairs = repairPayments.filter(r => r.paymentMethod === 'CASH').reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0);
    const cashSupplierPayments = supplierPayments.filter(p => p.paymentMethod === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0);
    const cashPackageSales = packageSales.filter(p => p.paymentMethod === 'CASH').reduce((sum, p) => sum + Number(p.packageAmount), 0);
    const cashExpenses = Number(cashExpensesAgg._sum.amount ?? 0);
    const cashRefunds  = Number(cashRefundsAgg._sum.totalRefund ?? 0);
    const expectedCashBalance =
      Number(shift.openBalance) + cashSales + cashRepairs + cashPackageSales
      - cashSupplierPayments - cashExpenses - cashRefunds;

    return {
      ...shift,
      salesCount: sales.length,
      totalSales,
      repairCount: repairPayments.length,
      repairRevenue,
      supplierPaymentCount: supplierPayments.length,
      supplierExpenses,
      packageSaleCount: packageSales.length,
      packageSaleRevenue,
      packageSaleAmount,
      cashExpenses,
      cashRefunds,
      expectedCashBalance,
    };
  }

  async findAll(query: { date?: string; userId?: string; branchId?: string; tenantId?: string }) {
    const where: any = {};

    if (query.userId)   where.userId   = query.userId;
    // Scope shifts to tenant via branch.tenantId
    if (query.branchId) {
      where.branchId = query.branchId;
    } else if (query.tenantId) {
      where.branch = { tenantId: query.tenantId };
    }

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00+07:00`);
      const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.openedAt = { gte: start, lt: end };
    }

    return this.prisma.shift.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }
}
