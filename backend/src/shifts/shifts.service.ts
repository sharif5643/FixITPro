import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { CashDrawerSessionStatus } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService, SHIFT_MISMATCH_THRESHOLD } from '../notifications/notifications.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { CarrierWalletService } from '../carrier-wallet/carrier-wallet.service';
import { activeShiftWhere } from './active-shift';
import { SHIFT_CASH_KIND, CASH_CATEGORY_IN, CASH_CATEGORY_OUT, movementTotals, refundsOfShiftWhere, supplierPaymentsOfShiftWhere } from './shift-cash';
import { ExpensesService } from '../expenses/expenses.service';
import { CashMovementDto } from './dto/cash-movement.dto';
import { buildShiftLedger, staffMoneyOf } from './shift-ledger';

/** A hand-over waits a day for the person taking over */
const HANDOVER_VALID_MS = 24 * 60 * 60 * 1000;
/** A shift open this long is most likely forgotten: the owner is told (again a day later) */
export const LONG_OPEN_SHIFT_MS = 24 * 60 * 60 * 1000;
/** How long someone whose shift was closed by another person is shown who closed it */
const CLOSED_BY_OTHER_SHOWN_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);
  constructor(
    private prisma: PrismaService,
    private carrierWalletService: CarrierWalletService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    @Optional() private expenses?: ExpensesService,
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
      where: activeShiftWhere(userId),
    });

    if (activeShift) {
      this.logger.warn(`openShift rejected: userId=${userId} already has active shift id=${activeShift.id}`);
      if (activeShift.userId !== userId) {
        throw new BadRequestException('คุณเข้าร่วมกะของคนอื่นอยู่ — ออกจากกะก่อนจึงจะเปิดกะเองได้');
      }
      throw new BadRequestException('You already have an open shift');
    }

    // One branch, one cash drawer, one open shift: whoever comes next joins it. The lock makes two
    // people pressing "open" at the same moment get one shift, not two.
    const shift = await this.prisma.$transaction(async (tx) => {
      if (branchId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-open:' + branchId}))`;
        const other = await tx.shift.findFirst({
          where: { branchId, isActive: true },
          select: { id: true, openedAt: true, user: { select: { name: true } } },
        });
        if (other) {
          throw new ConflictException({
            code: 'BRANCH_SHIFT_OPEN',
            message: `สาขานี้มีกะของ ${other.user.name} เปิดอยู่แล้ว — กด "เข้าร่วมกะ" เพื่อใช้ลิ้นชักเดียวกัน`,
            data: { shiftId: other.id, openedAt: other.openedAt, openedBy: other.user.name },
          });
        }
      }
      return tx.shift.create({
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
    });

    // Record carrier wallet opening balances when provided
    const carrierBalances: Partial<Record<'AIS' | 'TRUE' | 'DTAC' | 'NT', number>> = {};
    if (dto.aisOpeningBalance  != null) carrierBalances['AIS']  = dto.aisOpeningBalance;
    if (dto.trueOpeningBalance != null) carrierBalances['TRUE'] = dto.trueOpeningBalance;
    if (dto.dtacOpeningBalance != null) carrierBalances['DTAC'] = dto.dtacOpeningBalance;
    if (dto.ntOpeningBalance   != null) carrierBalances['NT']   = dto.ntOpeningBalance;

    let walletCheck: { carrier: string; systemBalance: number; actualBalance: number; difference: number }[] = [];
    if (Object.keys(carrierBalances).length > 0) {
      walletCheck = (await this.carrierWalletService.recordOpeningBalances(shift.id, userId, carrierBalances, tenantId)) ?? [];
      const off = walletCheck.filter((w) => Math.abs(w.difference) >= 1);
      if (off.length > 0) {
        await this.notif.notify({
          type:       'SHIFT_MISMATCH',
          title:      'ยอดกระเป๋าค่ายไม่ตรงตอนเปิดกะ',
          message:    `กะของ ${shift.user.name}: ` + off.map((w) => `${w.carrier} ระบบ ${w.systemBalance.toFixed(0)} นับได้ ${w.actualBalance.toFixed(0)} (${w.difference > 0 ? '+' : ''}${w.difference.toFixed(0)})`).join(', '),
          severity:   'WARNING',
          entityType: 'Shift',
          entityId:   shift.id,
          tenantId:   tenantId ?? null,
          ...(branchId ? { branchId } : {}),
        }).catch(() => undefined);
      }
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
                sessionId:      session.id,
                cashDrawerId:   drawer!.id,
                tenantId:       tenantId ?? undefined,
                branchId,
                actorUserId:    userId,
                type:           'OPENING',
                direction:      'IN',
                amount:         dto.openBalance,
                reason:         'เงินตั้งต้นเปิดกะ',
                sourceType:     'OPENING',
                referenceType:  'OPENING',
                referenceId:    session.id,
                paymentMethod:  'CASH',
                idempotencyKey: `${tenantId ?? 'global'}:OPENING:${session.id}:IN`,
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

    if (dto.handoverFromShiftId) await this.acceptHandover(dto, shift, tenantId ?? null, branchId ?? null);

    await this.auditLog.log({
      actorId: userId,
      actorName: shift.user.name,
      action: 'SHIFT_OPENED',
      entityType: 'Shift',
      entityId: shift.id,
      afterData: { openBalance: Number(dto.openBalance) },
    });

    this.logger.log(`openShift success shiftId=${shift.id} userId=${userId} branchId=${branchId ?? 'null'}`);
    return { ...shift, walletCheck };
  }

  /**
   * Close a shift and count the drawer. With a shared drawer anyone working in the shift may
   * close it (the one who opened it or anyone who joined), and so may the owner, or a manager of
   * that branch. Everyone who joined leaves it with the close.
   */
  async closeShift(
    shiftId: string,
    dto: CloseShiftDto,
    userId: string,
    actor?: { role?: string; branchId?: string | null; tenantId?: string | null },
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, isActive: true },
      include: {
        user: { select: { tenantId: true } },
        members: { where: { leftAt: null }, select: { userId: true } },
      },
    });

    if (!shift) throw new NotFoundException('Active shift not found');
    const works = shift.userId === userId || (shift.members ?? []).some((m) => m.userId === userId);
    const sameShop = !!actor?.tenantId && shift.user?.tenantId === actor.tenantId;
    const boss = actor?.role === 'SUPER_ADMIN'
      || (actor?.role === 'OWNER' && sameShop)
      || (actor?.role === 'MANAGER' && sameShop && (!actor.branchId || actor.branchId === shift.branchId));
    if (!works && !boss) throw new NotFoundException('Active shift not found');

    // Leaving early: hand the drawer to someone still working in this shift
    let handoverTo: { id: string; name: string } | null = null;
    if (dto.handoverToUserId) {
      const inShift = dto.handoverToUserId === shift.userId
        || (shift.members ?? []).some((m) => m.userId === dto.handoverToUserId);
      if (!inShift || dto.handoverToUserId === userId) {
        throw new BadRequestException('ส่งต่อกะได้เฉพาะคนที่อยู่ในกะนี้');
      }
      handoverTo = await this.prisma.user.findUnique({ where: { id: dto.handoverToUserId }, select: { id: true, name: true } });
      if (!handoverTo) throw new BadRequestException('ส่งต่อกะได้เฉพาะคนที่อยู่ในกะนี้');
    }

    if (dto.floatLeft != null && dto.floatLeft > dto.closeBalance) {
      throw new BadRequestException('เงินทอนที่เหลือไว้ต้องไม่มากกว่าเงินที่นับได้');
    }

    const t = await this.computeShiftTotals(shift);
    const { salesCount, totalSales, cashSales, cashRepairs, cashSupplierPayments, cashExpensesTotal, cashRefundsTotal, expectedBalance } = t;

    this.logger.log(
      `ShiftClose id=${shiftId} sales=${salesCount} total=${totalSales} cashSales=${cashSales} cashRepairs=${cashRepairs} cashSupplier=${cashSupplierPayments} cashExpenses=${cashExpensesTotal} cashRefunds=${cashRefundsTotal} expected=${expectedBalance}`,
    );

    // Only one close wins: two people closing the same shift at once (the owner from the shifts
    // list, the cashier at the till) used to both succeed, the second count overwriting the first
    const closed = await this.prisma.shift.updateMany({
      where: { id: shiftId, isActive: true },
      data: {
        closedAt: new Date(),
        closeBalance: dto.closeBalance,
        floatLeft: dto.floatLeft ?? null,
        isActive: false,
        note: dto.note,
      },
    });
    if (closed.count === 0) throw new ConflictException('กะนี้ถูกปิดไปแล้ว');
    const updatedShift = await this.prisma.shift.findUniqueOrThrow({
      where: { id: shiftId },
      include: { user: { select: { id: true, name: true } } },
    });
    // Everyone who joined the shift leaves it with the close
    await this.prisma.shiftMember.updateMany({ where: { shiftId, leftAt: null }, data: { leftAt: new Date() } });
    const closer = userId === shift.userId
      ? updatedShift.user
      : await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });

    await this.auditLog.log({
      actorId: userId,
      actorName: closer?.name ?? '',
      action: 'SHIFT_CLOSED',
      entityType: 'Shift',
      entityId: shiftId,
      afterData: {
        closeBalance: dto.closeBalance,
        ...(dto.floatLeft != null ? { floatLeft: dto.floatLeft } : {}),
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
        tenantId:   shift.user?.tenantId ?? null,
        ...(shift.branchId ? { branchId: shift.branchId } : {}),
      });
    }

    if (handoverTo) {
      await this.recordHandover(shift, handoverTo, dto.closeBalance, userId);
    }

    // The others working in it learn on their own phone that the drawer was counted and closed
    const others = [shift.userId, ...(shift.members ?? []).map((m) => m.userId)]
      .filter((id, i, all) => id !== userId && id !== handoverTo?.id && all.indexOf(id) === i);
    for (const otherId of others) {
      await this.notif.notify({
        type:       'SHIFT_CLOSED_BY_OTHER',
        title:      `กะถูกปิดแล้วโดย ${closer?.name ?? ''}`,
        message:    `กะของ ${updatedShift.user.name} ปิดแล้ว — ถ้าจะขายต่อให้เปิดกะใหม่หรือเข้าร่วมกะที่เปิดอยู่`,
        severity:   'INFO',
        entityType: 'Shift',
        entityId:   shiftId,
        tenantId:   shift.user?.tenantId ?? null,
        userId:     otherId,
      });
    }

    return {
      ...updatedShift,
      summary: { ...this.summaryOf(t, dto.closeBalance), staff: await this.staffMoney({ ...shift, closedAt: updatedShift.closedAt }) },
    };
  }

  // ── Hand-over: the person who opened the shift leaves early ──────────────────
  // Their shift closes with the counted cash and carrier wallets; the person taking over sees
  // those amounts, checks them, and opens their own shift with them (or with what they count).

  private async recordHandover(
    shift: { id: string; branchId: string | null; user?: { tenantId: string | null } | null },
    to: { id: string; name: string },
    cash: number,
    closerId: string,
  ) {
    const tenantId = shift.user?.tenantId ?? null;
    const closer = await this.prisma.user.findUnique({ where: { id: closerId }, select: { name: true } });
    const wallets = await this.carrierWalletService.getBalances(tenantId);
    await this.auditLog.log({
      actorId: closerId,
      actorName: closer?.name ?? '',
      action: 'SHIFT_HANDOVER',
      entityType: 'Shift',
      entityId: shift.id,
      afterData: { toUserId: to.id, toName: to.name, cash, wallets },
    });
    await this.notif.notify({
      type:       'SHIFT_HANDOVER',
      title:      `รับกะต่อจาก ${closer?.name ?? ''}`,
      message:    `เงินสดในลิ้นชัก ${cash.toLocaleString('th-TH')} บาท — ตรวจยอดแล้วกดยืนยันรับกะที่หน้ากะ`,
      severity:   'INFO',
      entityType: 'Shift',
      entityId:   shift.id,
      tenantId,
      userId:     to.id,
    }).catch(() => undefined);
  }

  /** A shift handed to this person that they have not taken over yet (opened a shift since). */
  async pendingHandover(userId: string) {
    const log = await this.prisma.auditLog.findFirst({
      where: {
        action: 'SHIFT_HANDOVER',
        createdAt: { gte: new Date(Date.now() - HANDOVER_VALID_MS) },
        afterData: { path: ['toUserId'], equals: userId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!log) return null;
    const since = await this.prisma.shift.findFirst({
      where: { OR: [{ userId, openedAt: { gt: log.createdAt } }, activeShiftWhere(userId)] },
      select: { id: true },
    });
    if (since) return null;
    const d = (log.afterData ?? {}) as { cash?: number; wallets?: { carrier: string; balance: number }[] };
    return {
      shiftId:  log.entityId,
      fromName: log.actorName,
      at:       log.createdAt,
      cash:     Number(d.cash ?? 0),
      wallets:  d.wallets ?? [],
    };
  }

  private async acceptHandover(
    dto: OpenShiftDto,
    shift: { id: string; userId: string; user: { name: string } },
    tenantId: string | null,
    branchId: string | null,
  ) {
    const pending = await this.prisma.auditLog.findFirst({
      where: {
        action: 'SHIFT_HANDOVER',
        entityId: dto.handoverFromShiftId,
        createdAt: { gte: new Date(Date.now() - HANDOVER_VALID_MS) },
        afterData: { path: ['toUserId'], equals: shift.userId },
      },
    });
    if (!pending) return; // nothing handed to this person: an ordinary opening
    const handed = Number((pending.afterData as any)?.cash ?? 0);
    const difference = Math.round((Number(dto.openBalance) - handed) * 100) / 100;
    await this.auditLog.log({
      actorId: shift.userId,
      actorName: shift.user.name,
      action: 'SHIFT_HANDOVER_ACCEPTED',
      entityType: 'Shift',
      entityId: shift.id,
      afterData: { fromShiftId: dto.handoverFromShiftId, fromName: pending.actorName, handedCash: handed, countedCash: Number(dto.openBalance), difference },
    });
    if (Math.abs(difference) >= 1) {
      await this.notif.notify({
        type:       'SHIFT_MISMATCH',
        title:      `ส่งมอบกะ เงินสดไม่ตรง: ${difference > 0 ? '+' : ''}${difference.toFixed(0)} บาท`,
        message:    `${pending.actorName ?? ''} ส่งมอบ ${handed.toFixed(0)} บาท — ${shift.user.name} นับได้ ${Number(dto.openBalance).toFixed(0)} บาท`,
        severity:   'WARNING',
        entityType: 'Shift',
        entityId:   shift.id,
        tenantId,
        ...(branchId ? { branchId } : {}),
      }).catch(() => undefined);
    }
  }

  // Cash taken in this shift outside sales/final repair payments: repair deposits at intake and
  // debt payments (RepairAdditionalPayment). Both belong in the drawer's expected cash.
  private cashMovementsOf(shiftId: string) {
    return this.prisma.shiftCashMovement.findMany({
      where: { shiftId },
      select: { kind: true, direction: true, amount: true, paymentMethod: true, referenceType: true },
    });
  }

  /** Cash taken in this shift for SIM/package sales sold earlier on credit. */
  private async getCashPackageDebtPayments(shiftId: string) {
    const agg = await this.prisma.packageSaleDebtPayment.aggregate({
      where: { shiftId, paymentMethod: 'CASH' },
      _sum: { amount: true },
    });
    return Number(agg?._sum?.amount ?? 0);
  }

  private async getCashRepairInflows(shiftId: string) {
    const [deposits, debtPayments] = await Promise.all([
      this.prisma.repair.aggregate({
        where: { depositShiftId: shiftId, depositPaymentMethod: 'CASH' },
        _sum:  { deposit: true },
      }),
      this.prisma.repairAdditionalPayment.aggregate({
        where: { shiftId, paymentMethod: 'CASH' },
        _sum:  { amount: true },
      }),
    ]);
    return {
      cashDeposits:     Number(deposits._sum.deposit ?? 0),
      cashDebtPayments: Number(debtPayments._sum.amount ?? 0),
    };
  }

  /**
   * Shift totals: sales, repair payments, supplier payments, package sales, cash expenses and
   * refunds, and the cash the drawer should hold. Used when closing a shift and to reprint the
   * summary of a closed one (same numbers both times).
   */
  private async computeShiftTotals(shift: { id: string; openedAt: Date; closedAt: Date | null; openBalance: unknown; branchId?: string | null; user?: { tenantId: string | null } | null }) {
    const shiftId = shift.id;
    const [sales, repairPayments, supplierPayments, packageSales, cashExpensesAgg, cashRefundsAgg, packageSalesByCarrier, repairInflows, movements] = await Promise.all([
      this.prisma.sale.findMany({
        where: { shiftId, status: { not: 'VOIDED' } },
        select: {
          total: true, paymentMethod: true, payments: { select: { paymentMethod: true, amount: true } },
          userId: true, user: { select: { name: true } },
        },
      }),
      this.prisma.repair.findMany({
        where: { paymentShiftId: shiftId },
        select: { paidAmount: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: supplierPaymentsOfShiftWhere(shift),
        select: { amount: true, paymentMethod: true },
      }),
      this.prisma.packageSale.findMany({
        where: { shiftId },
        select: { packageAmount: true, profit: true, paymentMethod: true, creditAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: { shiftId, paymentMethod: 'CASH', voidedAt: null },
        _sum: { amount: true },
      }),
      // P0-3 FIX: sum CASH refunds for this shift so they are subtracted from expectedBalance
      (this.prisma as any).saleRefund.aggregate({
        where: { paymentMethod: 'CASH', ...refundsOfShiftWhere(shiftId) },
        _sum: { totalRefund: true },
      }),
      this.carrierWalletService.getShiftCarrierSummary(shiftId),
      this.getCashRepairInflows(shiftId),
      this.cashMovementsOf(shiftId),
    ]);
    const moves = movementTotals(movements);

    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const salesCount = sales.length;
    // Who sold what in this shift (a shared drawer has several people)
    const byStaff = new Map<string, { userId: string; name: string; salesCount: number; salesTotal: number }>();
    for (const sale of sales as Array<{ total: unknown; userId?: string; user?: { name: string } | null }>) {
      const id = sale.userId ?? 'unknown';
      const row = byStaff.get(id) ?? { userId: id, name: sale.user?.name ?? '-', salesCount: 0, salesTotal: 0 };
      row.salesCount += 1;
      row.salesTotal += Number(sale.total);
      byStaff.set(id, row);
    }
    const staffSales = [...byStaff.values()].sort((a, b) => b.salesTotal - a.salesTotal);

    const paymentBreakdown = sales.reduce(
      (acc, s) => {
        const legs = s.payments?.length
          ? s.payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) }))
          : [{ method: s.paymentMethod, amount: Number(s.total) }];
        for (const leg of legs) {
          acc[leg.method] = (acc[leg.method] || 0) + leg.amount;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    // Repair payments of this shift, plus those given back later (the repair no longer points here)
    const repairBreakdown = repairPayments.reduce(
      (acc, r) => {
        const m = r.paymentMethod ?? 'CASH';
        acc[m] = (acc[m] || 0) + Number(r.paidAmount ?? 0);
        return acc;
      },
      { ...moves.keptFinal } as Record<string, number>,
    );
    const repairTotalAmount = Object.values(repairBreakdown).reduce((sum, v) => sum + v, 0);

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
    // Only cash actually received: a credit ("ค้างจ่าย") sale brings in what was paid at the
    // counter, and repayments of earlier credit sales taken in this shift add theirs
    const cashPackageDebtPayments = await this.getCashPackageDebtPayments(shiftId);
    const cashPackageSales = packageSales
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + Number(p.packageAmount) - Number(p.creditAmount ?? 0), 0)
      + cashPackageDebtPayments;

    // Expected cash = opening + CASH sales + CASH repairs (final + deposits + debt payments) + CASH package sales
    //                 − CASH supplier payments − CASH expenses − CASH refunds
    const cashSales = paymentBreakdown['CASH'] ?? 0;
    const cashRepairs = repairBreakdown['CASH'] ?? 0;
    const cashSupplierPayments = supplierBreakdown['CASH'] ?? 0;
    const cashExpensesTotal = Number(cashExpensesAgg._sum.amount ?? 0);
    const cashRefundsTotal  = Number(cashRefundsAgg._sum.totalRefund ?? 0);
    const cashDeposits     = repairInflows.cashDeposits + moves.keptDepositCash;
    const cashDebtPayments = repairInflows.cashDebtPayments + moves.keptAdditionalCash;
    const { manualIn: cashManualIn, manualOut: cashManualOut, repairRefundCash: cashRepairRefunds } = moves;
    const expectedBalance =
      Number(shift.openBalance) + cashSales + cashRepairs + cashDeposits + cashDebtPayments + cashPackageSales
      + cashManualIn - cashSupplierPayments - cashExpensesTotal - cashRefundsTotal - cashRepairRefunds - cashManualOut;

    return {
      salesCount, totalSales, paymentBreakdown, staffSales,
      repairPayments, repairTotalAmount, repairBreakdown,
      supplierPayments, supplierTotalAmount, supplierBreakdown,
      packageSales, packageSaleTotalAmount, packageSaleProfit, packageSalesByCarrier,
      cashPackageSales, cashPackageDebtPayments,
      cashDeposits, cashDebtPayments,
      cashSales, cashRepairs, cashSupplierPayments, cashExpensesTotal, cashRefundsTotal,
      cashRepairRefunds, cashManualIn, cashManualOut, cashMovementCount: moves.manualCount,
      expectedBalance,
    };
  }

  private summaryOf(t: Awaited<ReturnType<ShiftsService['computeShiftTotals']>>, closeBalance: number) {
    return {
      salesCount: t.salesCount,
      totalSales: t.totalSales,
      paymentBreakdown: t.paymentBreakdown,
      staffSales: t.staffSales,
      repairPayments: {
        count: t.repairPayments.length,
        totalAmount: t.repairTotalAmount,
        paymentBreakdown: t.repairBreakdown,
      },
      supplierPayments: {
        count: t.supplierPayments.length,
        totalAmount: t.supplierTotalAmount,
        paymentBreakdown: t.supplierBreakdown,
      },
      packageSales: {
        count: t.packageSales.length,
        totalAmount: t.packageSaleTotalAmount,
        totalProfit: t.packageSaleProfit,
        byCarrier: t.packageSalesByCarrier,
        cashReceived: t.cashPackageSales,
        cashDebtPayments: t.cashPackageDebtPayments,
      },
      cashDeposits: t.cashDeposits,
      cashDebtPayments: t.cashDebtPayments,
      cashExpenses: t.cashExpensesTotal,
      cashRefunds: t.cashRefundsTotal,
      cashRepairRefunds: t.cashRepairRefunds,
      cashManualIn: t.cashManualIn,
      cashManualOut: t.cashManualOut,
      expectedBalance: t.expectedBalance,
      actualBalance: closeBalance,
      difference: closeBalance - t.expectedBalance,
    };
  }

  /** Per person: cash / other money in and out in the shift (never fails a close or a reprint). */
  private async staffMoney(shift: { id: string; openedAt: Date; closedAt: Date | null; user?: { tenantId: string | null } | null }) {
    try {
      return staffMoneyOf(await buildShiftLedger(this.prisma, shift));
    } catch (err) {
      this.logger.warn(`staffMoney failed for shift ${shift.id}: ${(err as Error).message}`);
      return [];
    }
  }

  /** Who may see a shift's money: the people in it, the owner, and the branch manager. */
  private async assertCanSeeShift(
    shift: { id: string; userId: string; branchId: string | null; tenantId: string | null },
    actor: { id: string; role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] },
  ) {
    if (actor.role !== 'SUPER_ADMIN' && shift.tenantId !== (actor.tenantId ?? null)) {
      throw new NotFoundException('ไม่พบกะนี้');
    }
    const isOwner = actor.role === 'OWNER' || actor.role === 'SUPER_ADMIN';
    const manager = actor.role === 'MANAGER' && (actor.permissions ?? []).includes('cash_drawer.view_balance') &&
      (!actor.branchId || shift.branchId === actor.branchId);
    if (isOwner || manager || shift.userId === actor.id) return;
    const member = await this.prisma.shiftMember.count({ where: { shiftId: shift.id, userId: actor.id } });
    if (!member) throw new ForbiddenException('ดูได้เฉพาะกะที่ตัวเองอยู่');
  }

  /** Every money movement of a shift with who did it, and the totals per person. */
  async getShiftLedger(
    shiftId: string,
    actor: { id: string; role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] },
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId },
      include: { user: { select: { id: true, name: true, tenantId: true } }, branch: { select: { tenantId: true } } },
    });
    if (!shift) throw new NotFoundException('ไม่พบกะนี้');
    await this.assertCanSeeShift(
      { id: shift.id, userId: shift.userId, branchId: shift.branchId, tenantId: shift.branch?.tenantId ?? shift.user?.tenantId ?? null },
      actor,
    );
    const entries = await buildShiftLedger(this.prisma, shift);
    return {
      id: shift.id,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      isActive: shift.isActive,
      openBalance: Number(shift.openBalance),
      openedBy: { id: shift.user.id, name: shift.user.name },
      staff: staffMoneyOf(entries),
      entries,
    };
  }

  /**
   * The summary of a closed shift, to print it again. Anyone may reprint their own shift;
   * owners and managers (cash_drawer.view_balance) any shift of their shop / branch.
   */
  async getClosedShiftSummary(
    shiftId: string,
    actor: { id: string; role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] },
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId },
      include: { user: { select: { id: true, name: true, tenantId: true } }, branch: { select: { tenantId: true } } },
    });
    const shopOf = shift ? (shift.branch?.tenantId ?? shift.user?.tenantId ?? null) : null;
    if (!shift || (actor.role !== 'SUPER_ADMIN' && shopOf !== (actor.tenantId ?? null))) {
      throw new NotFoundException('ไม่พบกะนี้');
    }
    const isOwner = actor.role === 'OWNER' || actor.role === 'SUPER_ADMIN';
    const canSeeOthers = isOwner ||
      ((actor.permissions ?? []).includes('cash_drawer.view_balance') && actor.role === 'MANAGER' &&
        (!actor.branchId || shift.branchId === actor.branchId));
    const wasMember = shift.userId !== actor.id && !canSeeOthers
      ? (await this.prisma.shiftMember.count({ where: { shiftId, userId: actor.id } })) > 0
      : false;
    if (shift.userId !== actor.id && !canSeeOthers && !wasMember) {
      throw new ForbiddenException('พิมพ์ซ้ำได้เฉพาะกะของตัวเอง');
    }
    if (shift.isActive || !shift.closedAt) throw new BadRequestException('กะนี้ยังไม่ปิด');
    const t = await this.computeShiftTotals(shift);
    const closeBalance = Number(shift.closeBalance ?? 0);
    return {
      id: shift.id,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openBalance: Number(shift.openBalance),
      note: shift.note,
      user: { id: shift.user.id, name: shift.user.name },
      summary: { ...this.summaryOf(t, closeBalance), staff: await this.staffMoney(shift) },
    };
  }

  async getCurrentShift(userId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: activeShiftWhere(userId),
      include: {
        user: { select: { id: true, name: true, tenantId: true } },
        members: { where: { leftAt: null }, select: { userId: true, joinedAt: true, user: { select: { name: true } } } },
      },
    });

    if (!shift) return null;

    const [sales, repairPayments, supplierPayments, packageSales, cashExpensesAgg, cashRefundsAgg, packageSalesByCarrier, repairInflows, movements] = await Promise.all([
      this.prisma.sale.findMany({
        where: { shiftId: shift.id, status: { not: 'VOIDED' } },
        select: { total: true, paymentMethod: true, payments: { select: { paymentMethod: true, amount: true } } },
      }),
      this.prisma.repair.findMany({
        where: { paymentShiftId: shift.id },
        select: { paidAmount: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: supplierPaymentsOfShiftWhere(shift),
        select: { amount: true, paymentMethod: true },
      }),
      this.prisma.packageSale.findMany({
        where: { shiftId: shift.id },
        select: { packageAmount: true, profit: true, paymentMethod: true, creditAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: { shiftId: shift.id, paymentMethod: 'CASH', voidedAt: null },
        _sum: { amount: true },
      }),
      // P0-3 FIX: sum CASH refunds for live shift expectedCashBalance
      (this.prisma as any).saleRefund.aggregate({
        where: { paymentMethod: 'CASH', ...refundsOfShiftWhere(shift.id) },
        _sum: { totalRefund: true },
      }),
      this.carrierWalletService.getShiftCarrierSummary(shift.id),
      this.getCashRepairInflows(shift.id),
      this.cashMovementsOf(shift.id),
    ]);
    const moves = movementTotals(movements);
    const keptFinalTotal = Object.values(moves.keptFinal).reduce((a, b) => a + b, 0);

    const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const repairRevenue = repairPayments.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0) + keptFinalTotal;
    const supplierExpenses = supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const packageSaleRevenue = packageSales.reduce((sum, p) => sum + Number(p.profit), 0);
    const packageSaleAmount = packageSales.reduce((sum, p) => sum + Number(p.packageAmount), 0);

    const cashSales = sales.reduce((sum, s) => {
      const legs = s.payments?.length
        ? s.payments.filter((p) => p.paymentMethod === 'CASH').map((p) => Number(p.amount))
        : s.paymentMethod === 'CASH' ? [Number(s.total)] : [];
      return sum + legs.reduce((a, b) => a + b, 0);
    }, 0);
    const cashRepairs = repairPayments.filter(r => r.paymentMethod === 'CASH').reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0)
      + (moves.keptFinal.CASH ?? 0);
    const cashSupplierPayments = supplierPayments.filter(p => p.paymentMethod === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0);
    const cashPackageDebtPayments = await this.getCashPackageDebtPayments(shift.id);
    const cashPackageSales = packageSales
      .filter(p => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + Number(p.packageAmount) - Number(p.creditAmount ?? 0), 0)
      + cashPackageDebtPayments;
    const cashExpenses = Number(cashExpensesAgg._sum.amount ?? 0);
    const cashRefunds  = Number(cashRefundsAgg._sum.totalRefund ?? 0);
    const cashDeposits     = repairInflows.cashDeposits + moves.keptDepositCash;
    const cashDebtPayments = repairInflows.cashDebtPayments + moves.keptAdditionalCash;
    const { manualIn: cashManualIn, manualOut: cashManualOut, repairRefundCash: cashRepairRefunds } = moves;
    const expectedCashBalance =
      Number(shift.openBalance) + cashSales + cashRepairs + cashDeposits + cashDebtPayments + cashPackageSales
      + cashManualIn - cashSupplierPayments - cashExpenses - cashRefunds - cashRepairRefunds - cashManualOut;

    return {
      ...shift,
      // joined: this person works in someone else's shift (shared drawer)
      joined: shift.userId !== userId,
      members: (shift.members ?? []).map((m) => ({ userId: m.userId, name: m.user.name, joinedAt: m.joinedAt })),
      salesCount: sales.length,
      totalSales,
      repairCount: repairPayments.length,
      repairRevenue,
      supplierPaymentCount: supplierPayments.length,
      supplierExpenses,
      packageSaleCount: packageSales.length,
      packageSaleRevenue,
      packageSaleAmount,
      packageSalesByCarrier,
      cashPackageDebtPayments,
      cashDeposits,
      cashDebtPayments,
      cashExpenses,
      cashRefunds,
      cashRepairRefunds,
      cashManualIn,
      cashManualOut,
      expectedCashBalance,
    };
  }

  /** Cash put into or taken out of the drawer by hand, in the shift this person works in now. */
  async addCashMovement(dto: CashMovementDto, user: { id: string; name?: string; tenantId?: string | null }) {
    const shift = await this.prisma.shift.findFirst({
      where: activeShiftWhere(user.id),
      include: { user: { select: { tenantId: true } } },
    });
    if (!shift) throw new BadRequestException('กรุณาเปิดกะก่อน');
    const tenantId = shift.user?.tenantId ?? user.tenantId ?? null;
    const out = dto.direction === 'OUT';
    const amount = Math.round(Number(dto.amount) * 100) / 100;
    if (dto.category) {
      const allowed: readonly string[] = out ? CASH_CATEGORY_OUT : CASH_CATEGORY_IN;
      if (!allowed.includes(dto.category)) throw new BadRequestException('หมวดไม่ตรงกับเงินเข้า/ออก');
    }

    // A shop expense paid from the drawer is an expense (profit, books, shift cash), not a bare movement
    if (out && dto.category === 'SHOP_EXPENSE') {
      if (!this.expenses) throw new BadRequestException('บันทึกค่าใช้จ่ายไม่ได้');
      const expense = await this.expenses.createFromDrawer({
        amount, description: dto.reason, userId: user.id, branchId: shift.branchId, tenantId,
      });
      return {
        id: expense.id, direction: 'OUT', amount, reason: dto.reason, category: dto.category,
        createdAt: expense.createdAt, expenseId: expense.id,
      };
    }

    const movement = await this.prisma.shiftCashMovement.create({
      data: {
        shiftId: shift.id,
        kind: out ? SHIFT_CASH_KIND.MANUAL_OUT : SHIFT_CASH_KIND.MANUAL_IN,
        direction: dto.direction,
        amount,
        paymentMethod: 'CASH',
        reason: dto.reason,
        category: dto.category ?? null,
        createdById: user.id,
        tenantId,
        branchId: shift.branchId,
      },
    });
    await this.auditLog.log({
      actorId: user.id,
      actorName: user.name,
      action: out ? 'SHIFT_CASH_OUT' : 'SHIFT_CASH_IN',
      entityType: 'Shift',
      entityId: shift.id,
      afterData: { movementId: movement.id, amount, reason: dto.reason, category: dto.category ?? null },
    });
    if (out) {
      // Owners hear about cash leaving the drawer
      await this.notif.notify({
        type:       'SHIFT_CASH_OUT',
        title:      `นำเงินออกจากลิ้นชัก ${amount.toLocaleString('th-TH')} บาท`,
        message:    `${user.name ?? ''} — ${dto.reason}`,
        severity:   'INFO',
        entityType: 'Shift',
        entityId:   shift.id,
        tenantId,
        ...(shift.branchId ? { branchId: shift.branchId } : {}),
      }).catch(() => undefined);
    }
    return { ...movement, amount: Number(movement.amount) };
  }

  /** Cash put in / taken out by hand in a shift, newest first, with who did it. */
  async listCashMovements(
    shiftId: string,
    actor: { id: string; role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] },
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId },
      include: { user: { select: { tenantId: true } }, branch: { select: { tenantId: true } } },
    });
    if (!shift) throw new NotFoundException('ไม่พบกะนี้');
    await this.assertCanSeeShift(
      { id: shift.id, userId: shift.userId, branchId: shift.branchId, tenantId: shift.branch?.tenantId ?? shift.user?.tenantId ?? null },
      actor,
    );
    const rows = await this.prisma.shiftCashMovement.findMany({
      where: { shiftId, kind: { in: [SHIFT_CASH_KIND.MANUAL_IN, SHIFT_CASH_KIND.MANUAL_OUT] } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = [...new Set(rows.map((r) => r.createdById))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      id: r.id, direction: r.direction, amount: Number(r.amount), reason: r.reason, category: r.category,
      createdAt: r.createdAt, createdBy: { id: r.createdById, name: nameOf.get(r.createdById) ?? '-' },
    }));
  }

  /** Open shifts this person could join: same shop, and their own branch when they have one. */
  /**
   * The last closed shift of my branch (or mine, without a branch): what was counted and what was
   * left in the drawer — the next shift opens with that float instead of 0.
   */
  async lastClose(user: { id: string; role?: string; permissions?: string[]; branchId?: string | null; tenantId?: string | null }) {
    const last = await this.prisma.shift.findFirst({
      where: {
        isActive: false,
        closedAt: { not: null },
        ...(user.branchId ? { branchId: user.branchId, user: { tenantId: user.tenantId ?? undefined } } : { userId: user.id }),
      },
      orderBy: { closedAt: 'desc' },
      select: { id: true, closedAt: true, closeBalance: true, floatLeft: true, user: { select: { name: true } } },
    });
    if (!last) return {};
    return {
      shiftId:      last.id,
      closedAt:     last.closedAt,
      // The float left for the next shift is for whoever opens it; the full count only for those
      // who may see drawer totals (as on the open-shifts list)
      ...(user.role === 'OWNER' || user.role === 'SUPER_ADMIN' || (user.permissions ?? []).includes('cash_drawer.view_balance')
        ? { closeBalance: Number(last.closeBalance ?? 0) } : {}),
      floatLeft:    last.floatLeft != null ? Number(last.floatLeft) : null,
      openedBy:     last.user.name,
    };
  }

  async listJoinable(user: { id: string; branchId?: string | null; tenantId?: string | null }) {
    if (!user.tenantId) return [];
    const shifts = await this.prisma.shift.findMany({
      where: {
        isActive: true,
        userId: { not: user.id },
        user: { tenantId: user.tenantId },
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        members: { where: { leftAt: null }, select: { user: { select: { name: true } } } },
      },
      orderBy: { openedAt: 'desc' },
    });
    return shifts.map((x) => ({
      id: x.id,
      openedAt: x.openedAt,
      user: x.user,
      branch: x.branch,
      members: x.members.map((m) => m.user.name),
    }));
  }

  /** Work in someone else's open shift (one cash drawer, several people). */
  async joinShift(shiftId: string, user: { id: string; name?: string; branchId?: string | null; tenantId?: string | null }) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, isActive: true },
      include: { user: { select: { tenantId: true, name: true } } },
    });
    if (!shift || !user.tenantId || shift.user?.tenantId !== user.tenantId) {
      throw new NotFoundException('ไม่พบกะที่เปิดอยู่');
    }
    if (user.branchId && shift.branchId && shift.branchId !== user.branchId) {
      throw new BadRequestException('เข้าร่วมได้เฉพาะกะของสาขาตัวเอง');
    }
    if (shift.userId === user.id) throw new BadRequestException('นี่คือกะของคุณเอง');
    const current = await this.prisma.shift.findFirst({ where: activeShiftWhere(user.id), select: { id: true } });
    if (current) {
      throw new BadRequestException(current.id === shiftId ? 'คุณอยู่ในกะนี้แล้ว' : 'คุณมีกะที่เปิดอยู่แล้ว — ปิดหรือออกจากกะนั้นก่อน');
    }
    await this.prisma.shiftMember.upsert({
      where:  { shiftId_userId: { shiftId, userId: user.id } },
      create: { shiftId, userId: user.id },
      update: { leftAt: null, joinedAt: new Date() },
    });
    await this.auditLog.log({
      actorId: user.id, actorName: user.name ?? '', action: 'SHIFT_JOINED',
      entityType: 'Shift', entityId: shiftId, afterData: { openedBy: shift.user?.name },
    });
    return this.getCurrentShift(user.id);
  }

  /** Stop working in a shift you joined; your sales so far stay in it. */
  async leaveShift(user: { id: string; name?: string }) {
    const membership = await this.prisma.shiftMember.findFirst({
      where: { userId: user.id, leftAt: null, shift: { isActive: true } },
      select: { id: true, shiftId: true },
    });
    if (!membership) throw new BadRequestException('คุณไม่ได้เข้าร่วมกะของใครอยู่');
    await this.prisma.shiftMember.update({ where: { id: membership.id }, data: { leftAt: new Date() } });
    await this.auditLog.log({
      actorId: user.id, actorName: user.name ?? '', action: 'SHIFT_LEFT',
      entityType: 'Shift', entityId: membership.shiftId, afterData: {},
    });
    return { left: true, shiftId: membership.shiftId };
  }

  /**
   * Every shift open right now that this owner (whole shop) or manager (their branch) may count and
   * close without joining it: one forgotten at closing time, or left open by someone who went home.
   */
  async listOpenNow(actor: { role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] }) {
    const isOwner = actor.role === 'OWNER' || actor.role === 'SUPER_ADMIN';
    if ((!isOwner && actor.role !== 'MANAGER') || !actor.tenantId) return [];
    const shifts = await this.prisma.shift.findMany({
      where: {
        isActive: true,
        OR: [{ branch: { tenantId: actor.tenantId } }, { branchId: null, user: { tenantId: actor.tenantId } }],
        ...(!isOwner && actor.branchId ? { branchId: actor.branchId } : {}),
      },
      include: {
        user:    { select: { id: true, name: true, tenantId: true } },
        branch:  { select: { id: true, name: true } },
        members: { where: { leftAt: null }, select: { user: { select: { name: true } } } },
      },
      orderBy: { openedAt: 'asc' },
    });
    const seesCash = isOwner || (actor.permissions ?? []).includes('cash_drawer.view_balance');
    return Promise.all(shifts.map(async (x) => {
      const t = seesCash ? await this.computeShiftTotals(x) : null;
      return {
        id: x.id,
        openedAt: x.openedAt,
        openBalance: Number(x.openBalance),
        user: { id: x.user.id, name: x.user.name },
        branch: x.branch,
        members: x.members.map((m) => m.user.name),
        salesCount: t?.salesCount ?? null,
        expectedCashBalance: t?.expectedBalance ?? null,
      };
    }));
  }

  /** The shift I was working in that someone else counted and closed in the last hours. */
  async closedByOther(userId: string) {
    if (await this.prisma.shift.findFirst({ where: activeShiftWhere(userId), select: { id: true } })) return null;
    const since = new Date(Date.now() - CLOSED_BY_OTHER_SHOWN_MS);
    const shift = await this.prisma.shift.findFirst({
      where: {
        isActive: false,
        closedAt: { gte: since },
        OR: [{ userId }, { members: { some: { userId } } }],
      },
      orderBy: { closedAt: 'desc' },
      select: {
        id: true, closedAt: true, userId: true, user: { select: { name: true } },
        members: { where: { userId }, select: { leftAt: true } },
      },
    });
    if (!shift) return null;
    // A member who had already left before the close was not closed out by anyone
    const left = shift.members[0]?.leftAt;
    if (shift.userId !== userId && left && shift.closedAt && left.getTime() < shift.closedAt.getTime() - 60_000) return null;
    const [log, handover] = await Promise.all([
      this.prisma.auditLog.findFirst({ where: { action: 'SHIFT_CLOSED', entityId: shift.id }, select: { actorId: true } }),
      this.prisma.auditLog.findFirst({ where: { action: 'SHIFT_HANDOVER', entityId: shift.id }, select: { afterData: true } }),
    ]);
    if (!log || log.actorId === userId) return null;
    // The person the drawer was handed to takes over: that is the handover screen, not this banner
    if ((handover?.afterData as { toUserId?: string } | null)?.toUserId === userId) return null;
    const closer = await this.prisma.user.findUnique({ where: { id: log.actorId }, select: { name: true } });
    return { shiftId: shift.id, openedBy: shift.user.name, closedAt: shift.closedAt, closedBy: closer?.name ?? '' };
  }

  /** Every hour: tell the shop about a shift left open for a day or more, at most once a day each. */
  @Cron('0 7 * * * *')
  async notifyLongOpenShifts() {
    const shifts = await this.prisma.shift.findMany({
      where: { isActive: true, openedAt: { lt: new Date(Date.now() - LONG_OPEN_SHIFT_MS) } },
      select: {
        id: true, openedAt: true, branchId: true,
        user: { select: { name: true, tenantId: true, tenant: { select: { status: true } } } },
      },
    });
    for (const x of shifts) {
      const tenantId = x.user?.tenantId;
      if (!tenantId || x.user?.tenant?.status !== 'ACTIVE') continue;
      const told = await this.prisma.notification.findFirst({
        where: { type: 'SHIFT_LONG_OPEN', entityId: x.id, createdAt: { gte: new Date(Date.now() - LONG_OPEN_SHIFT_MS) } },
        select: { id: true },
      });
      if (told) continue;
      // Yesterday's alert still unread would block today's (alerts are not repeated while unread):
      // it is replaced by the new one with the hours brought up to date
      await this.prisma.notification.updateMany({
        where: { type: 'SHIFT_LONG_OPEN', entityId: x.id, isRead: false },
        data:  { isRead: true },
      });
      const hours = Math.floor((Date.now() - x.openedAt.getTime()) / 3_600_000);
      await this.notif.notify({
        type:       'SHIFT_LONG_OPEN',
        title:      `กะของ ${x.user.name} เปิดค้างมา ${hours} ชั่วโมง`,
        message:    'ถ้าจบวันแล้วให้นับเงินและปิดกะ (เจ้าของ/ผู้จัดการปิดแทนได้ที่หน้ากะ) ยอดเงินสดจะได้ไม่ปนข้ามวัน',
        severity:   'WARNING',
        entityType: 'Shift',
        entityId:   x.id,
        tenantId,
        ...(x.branchId ? { branchId: x.branchId } : {}),
      });
    }
  }

  async findAll(query: { date?: string; userId?: string; branchId?: string; tenantId?: string }) {
    const where: any = {};

    // A person's shifts: the ones they opened and the ones they joined
    if (query.userId) where.AND = [{ OR: [{ userId: query.userId }, { members: { some: { userId: query.userId } } }] }];
    // Scope shifts to tenant: match branch.tenantId OR branchless shifts by user.tenantId
    if (query.branchId) {
      where.branchId = query.branchId;
    } else if (query.tenantId) {
      where.OR = [
        { branch: { tenantId: query.tenantId } },
        { branchId: null, user: { tenantId: query.tenantId } },
      ];
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
