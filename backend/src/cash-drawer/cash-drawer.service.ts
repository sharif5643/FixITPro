import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CashDrawerSessionStatus, Prisma } from '@prisma/client';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { DepositDto } from './dto/deposit.dto';
import { ApproveDifferenceDto } from './dto/approve-difference.dto';

// Amount difference that triggers a notification / requires approval
const DIFFERENCE_THRESHOLD = 100;

@Injectable()
export class CashDrawerService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertSameTenant(userTenantId: string | null, recordTenantId: string | null) {
    if (userTenantId && recordTenantId && userTenantId !== recordTenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
  }

  private assertSameBranch(userBranchId: string | null, recordBranchId: string | null) {
    if (userBranchId && recordBranchId && userBranchId !== recordBranchId) {
      throw new ForbiddenException('Cross-branch access denied');
    }
  }

  /**
   * Compute expected cash balance for a session.
   *
   * Pure ledger sum: sum all CashDrawerTransactions for the session.
   * OPENING (direction IN) provides the starting balance; every subsequent
   * AccountingService.record() call adds SALE_CASH/REPAIR_PAYMENT (IN) or
   * EXPENSE/SALE_REFUND (OUT) entries; manual WITHDRAW/DEPOSIT/REVERSAL entries
   * from CashDrawerService round out the picture.
   *
   * Single source of truth — no separate queries to Sale/Repair/Expense tables.
   */
  async computeExpected(sessionId: string): Promise<Prisma.Decimal> {
    const rows = await this.prisma.cashDrawerTransaction.findMany({
      where:  { sessionId },
      select: { direction: true, amount: true },
    });

    let total = new Prisma.Decimal(0);
    for (const row of rows) {
      total = row.direction === 'IN' ? total.add(row.amount) : total.sub(row.amount);
    }
    return total;
  }

  // ── Cash Drawers ──────────────────────────────────────────────────────────

  async getDrawers(branchId: string, tenantId: string | null) {
    return this.prisma.cashDrawer.findMany({
      where: { branchId, tenantId: tenantId ?? undefined, isActive: true },
      include: {
        sessions: {
          where: { status: CashDrawerSessionStatus.OPEN },
          select: {
            id: true,
            openedAt: true,
            openingAmount: true,
            openedBy: { select: { id: true, name: true } },
            _count: { select: { participants: true } },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async ensureDefaultDrawer(branchId: string, tenantId: string | null): Promise<string> {
    const existing = await this.prisma.cashDrawer.findFirst({
      where: { branchId, isActive: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.cashDrawer.create({
      data: {
        name: 'ลิ้นชักหลัก',
        code: 'MAIN',
        tenantId: tenantId ?? undefined,
        branchId,
      },
    });
    return created.id;
  }

  // ── Session ───────────────────────────────────────────────────────────────

  async getCurrentSession(branchId: string, tenantId: string | null) {
    const session = await this.prisma.cashDrawerSession.findFirst({
      where: {
        branchId,
        tenantId: tenantId ?? undefined,
        status: CashDrawerSessionStatus.OPEN,
      },
      include: {
        cashDrawer:   { select: { id: true, name: true, code: true } },
        openedBy:     { select: { id: true, name: true } },
        closedBy:     { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { actorUser: { select: { id: true, name: true } } },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    if (!session) return null;

    const expectedAmount = await this.computeExpected(session.id);
    return { ...session, expectedAmount };
  }

  async getSessionById(sessionId: string, actorTenantId: string | null) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
      include: {
        cashDrawer:   { select: { id: true, name: true, code: true } },
        openedBy:     { select: { id: true, name: true } },
        closedBy:     { select: { id: true, name: true } },
        approvedBy:   { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          include: { actorUser: { select: { id: true, name: true } } },
        },
      },
    });

    if (!session) throw new NotFoundException('Session not found');
    this.assertSameTenant(actorTenantId, session.tenantId);

    const expectedAmount = await this.computeExpected(session.id);
    return { ...session, expectedAmount };
  }

  async getSessionHistory(
    branchId: string,
    tenantId: string | null,
    query: { page?: number; limit?: number; drawerId?: string },
  ) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const skip  = (page - 1) * limit;

    const where: Prisma.CashDrawerSessionWhereInput = {
      branchId,
      tenantId:    tenantId ?? undefined,
      status:      { not: CashDrawerSessionStatus.OPEN },
      ...(query.drawerId ? { cashDrawerId: query.drawerId } : {}),
    };

    const [sessions, total] = await Promise.all([
      this.prisma.cashDrawerSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          cashDrawer:  { select: { id: true, name: true } },
          openedBy:    { select: { id: true, name: true } },
          closedBy:    { select: { id: true, name: true } },
          _count:      { select: { participants: true, transactions: true } },
        },
      }),
      this.prisma.cashDrawerSession.count({ where }),
    ]);

    return { sessions, total, page, limit };
  }

  async openSession(
    dto: OpenSessionDto,
    actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    if (!actor.branchId) throw new BadRequestException('ต้องผูกสาขาก่อนเปิดรอบลิ้นชัก');
    if (dto.openingAmount < 0) throw new BadRequestException('จำนวนเงินตั้งต้นต้องไม่ติดลบ');

    // Ensure a default drawer exists for this branch
    const drawerId = await this.ensureDefaultDrawer(actor.branchId, actor.tenantId);

    // Block duplicate open session on the same drawer
    const existing = await this.prisma.cashDrawerSession.findFirst({
      where: {
        cashDrawerId: drawerId,
        status: CashDrawerSessionStatus.OPEN,
      },
    });
    if (existing) {
      throw new ConflictException('ลิ้นชักนี้มีรอบที่เปิดอยู่แล้ว ต้องปิดก่อนจึงจะเปิดใหม่ได้');
    }

    const openingDecimal = new Prisma.Decimal(dto.openingAmount);

    const session = await this.prisma.$transaction(async (tx) => {
      const s = await tx.cashDrawerSession.create({
        data: {
          tenantId:      actor.tenantId ?? undefined,
          branchId:      actor.branchId!,
          cashDrawerId:  drawerId,
          openedById:    actor.id,
          openingAmount: openingDecimal,
          closingNote:   dto.note,
        },
      });

      // Add opener as first participant
      await tx.cashDrawerParticipant.create({
        data: { sessionId: s.id, userId: actor.id },
      });

      // Record OPENING transaction in ledger
      await tx.cashDrawerTransaction.create({
        data: {
          sessionId:    s.id,
          cashDrawerId: drawerId,
          tenantId:     actor.tenantId ?? undefined,
          branchId:     actor.branchId!,
          actorUserId:  actor.id,
          type:         'OPENING',
          direction:    'IN',
          amount:       openingDecimal,
          reason:       'เงินตั้งต้นเปิดรอบ',
        },
      });

      return s;
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_SESSION_OPENED',
      entityType: 'CashDrawerSession',
      entityId:   session.id,
      afterData:  { openingAmount: dto.openingAmount, drawerId },
    });

    return session;
  }

  async joinSession(
    sessionId: string,
    actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('ไม่พบรอบลิ้นชัก');
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('รอบลิ้นชักนี้ไม่ได้เปิดอยู่');
    }
    this.assertSameTenant(actor.tenantId, session.tenantId);
    this.assertSameBranch(actor.branchId, session.branchId);

    // Check for active (not left) participation
    const existing = await this.prisma.cashDrawerParticipant.findFirst({
      where: { sessionId, userId: actor.id, leftAt: null },
    });
    if (existing) throw new ConflictException('คุณเข้าร่วมรอบนี้แล้ว');

    // If previously left, allow re-joining by creating new participant row
    const participant = await this.prisma.cashDrawerParticipant.create({
      data: { sessionId, userId: actor.id },
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_SESSION_JOINED',
      entityType: 'CashDrawerSession',
      entityId:   sessionId,
    });

    return participant;
  }

  async leaveSession(
    sessionId: string,
    actor: { id: string; name: string; tenantId: string | null },
  ) {
    const participant = await this.prisma.cashDrawerParticipant.findFirst({
      where: { sessionId, userId: actor.id, leftAt: null },
    });
    if (!participant) throw new NotFoundException('คุณไม่ได้เข้าร่วมรอบนี้');

    const updated = await this.prisma.cashDrawerParticipant.update({
      where: { id: participant.id },
      data:  { leftAt: new Date() },
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_SESSION_LEFT',
      entityType: 'CashDrawerSession',
      entityId:   sessionId,
    });

    return updated;
  }

  async withdraw(
    sessionId: string,
    dto: WithdrawDto,
    actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('จำนวนเงินต้องมากกว่า 0');

    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('ไม่พบรอบลิ้นชัก');
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('รอบลิ้นชักนี้ไม่ได้เปิดอยู่');
    }
    this.assertSameTenant(actor.tenantId, session.tenantId);
    this.assertSameBranch(actor.branchId, session.branchId);

    const tx = await this.prisma.cashDrawerTransaction.create({
      data: {
        sessionId:    sessionId,
        cashDrawerId: session.cashDrawerId,
        tenantId:     session.tenantId ?? undefined,
        branchId:     session.branchId ?? undefined,
        actorUserId:  actor.id,
        type:         'WITHDRAWAL',
        direction:    'OUT',
        amount:       new Prisma.Decimal(dto.amount),
        reason:       dto.reason,
        metadata:     dto.note ? { note: dto.note } : undefined,
      },
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_WITHDRAWAL_CREATED',
      entityType: 'CashDrawerSession',
      entityId:   sessionId,
      afterData:  { amount: dto.amount, reason: dto.reason },
    });

    // Notify manager on large withdrawal
    if (dto.amount >= 1000) {
      await this.notif.notify({
        type:      'CASH_DRAWER_LARGE_WITHDRAWAL',
        title:     'เบิกเงินจำนวนมาก',
        message:   `${actor.name} เบิกเงิน ฿${dto.amount.toLocaleString()} — ${dto.reason}`,
        severity:  'WARNING',
        entityType: 'CashDrawerSession',
        entityId:  sessionId,
        branchId:  session.branchId ?? undefined,
        tenantId:  session.tenantId,
      });
    }

    return tx;
  }

  async deposit(
    sessionId: string,
    dto: DepositDto,
    actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('จำนวนเงินต้องมากกว่า 0');

    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('ไม่พบรอบลิ้นชัก');
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('รอบลิ้นชักนี้ไม่ได้เปิดอยู่');
    }
    this.assertSameTenant(actor.tenantId, session.tenantId);
    this.assertSameBranch(actor.branchId, session.branchId);

    const tx = await this.prisma.cashDrawerTransaction.create({
      data: {
        sessionId:    sessionId,
        cashDrawerId: session.cashDrawerId,
        tenantId:     session.tenantId ?? undefined,
        branchId:     session.branchId ?? undefined,
        actorUserId:  actor.id,
        type:         'DEPOSIT',
        direction:    'IN',
        amount:       new Prisma.Decimal(dto.amount),
        reason:       dto.reason,
        metadata:     dto.note ? { note: dto.note } : undefined,
      },
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_DEPOSIT_CREATED',
      entityType: 'CashDrawerSession',
      entityId:   sessionId,
      afterData:  { amount: dto.amount, reason: dto.reason },
    });

    return tx;
  }

  async closeSession(
    sessionId: string,
    dto: CloseSessionDto,
    actor: { id: string; name: string; tenantId: string | null; branchId: string | null; permissions: string[] },
  ) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('ไม่พบรอบลิ้นชัก');
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('รอบลิ้นชักนี้ไม่ได้เปิดอยู่');
    }
    this.assertSameTenant(actor.tenantId, session.tenantId);
    this.assertSameBranch(actor.branchId, session.branchId);

    const expectedAmount  = await this.computeExpected(sessionId);
    const countedAmount   = new Prisma.Decimal(dto.countedAmount);
    const differenceAmount = countedAmount.sub(expectedAmount);
    const absDiff         = differenceAmount.abs();

    const hasDifference   = absDiff.greaterThan(0);
    const canApprove      = actor.permissions.includes('cash_drawer.approve_difference');

    // Require a reason when difference is non-zero
    if (hasDifference && !dto.differenceReason) {
      throw new BadRequestException('กรุณาระบุเหตุผลกรณีเงินขาด/เกิน');
    }

    const status = hasDifference && !canApprove
      ? CashDrawerSessionStatus.PENDING_APPROVAL
      : CashDrawerSessionStatus.CLOSED;

    const closedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const s = await tx.cashDrawerSession.update({
        where: { id: sessionId },
        data:  {
          status,
          closedAt,
          closedById:      actor.id,
          expectedAmount,
          countedAmount,
          differenceAmount,
          closingNote:     dto.closingNote,
          differenceReason: dto.differenceReason,
          ...(status === CashDrawerSessionStatus.CLOSED && canApprove
            ? { approvedById: actor.id, approvedAt: closedAt }
            : {}),
        },
      });

      // Mark all participants without leftAt as left
      await tx.cashDrawerParticipant.updateMany({
        where:  { sessionId, leftAt: null },
        data:   { leftAt: closedAt },
      });

      return s;
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_SESSION_CLOSED',
      entityType: 'CashDrawerSession',
      entityId:   sessionId,
      afterData:  {
        countedAmount:   dto.countedAmount,
        expectedAmount:  expectedAmount.toNumber(),
        differenceAmount: differenceAmount.toNumber(),
        status,
      },
    });

    if (hasDifference) {
      await this.notif.notify({
        type:      'CASH_DRAWER_DIFFERENCE',
        title:     'เงินสดไม่ตรง',
        message:   `ผลต่าง ฿${differenceAmount.toNumber().toLocaleString()} — ${dto.differenceReason ?? ''}`,
        severity:  absDiff.greaterThanOrEqualTo(500) ? 'ERROR' : 'WARNING',
        entityType: 'CashDrawerSession',
        entityId:  sessionId,
        branchId:  session.branchId ?? undefined,
        tenantId:  session.tenantId,
      });
    }

    return { ...updated, expectedAmount, countedAmount, differenceAmount };
  }

  async approveDifference(
    sessionId: string,
    dto: ApproveDifferenceDto,
    actor: { id: string; name: string; tenantId: string | null },
  ) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('ไม่พบรอบลิ้นชัก');
    if (session.status !== CashDrawerSessionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('รอบนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
    }
    this.assertSameTenant(actor.tenantId, session.tenantId);

    const updated = await this.prisma.cashDrawerSession.update({
      where: { id: sessionId },
      data:  {
        status:      CashDrawerSessionStatus.CLOSED,
        approvedById: actor.id,
        approvedAt:  new Date(),
        closingNote: dto.approvalNote,
      },
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_DIFFERENCE_APPROVED',
      entityType: 'CashDrawerSession',
      entityId:   sessionId,
      afterData:  { approvalNote: dto.approvalNote },
    });

    return updated;
  }

  async reverseTransaction(
    txId: string,
    reason: string,
    actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    const original = await this.prisma.cashDrawerTransaction.findUnique({
      where: { id: txId },
      include: { session: true },
    });
    if (!original) throw new NotFoundException('ไม่พบรายการ');

    // Cannot reverse an ALLOW_UNASSIGNED entry (no session context)
    if (!original.session) {
      throw new BadRequestException('ไม่สามารถยกเลิกรายการที่ไม่ผูกกับเซสชัน');
    }
    if (original.session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('ไม่สามารถยกเลิกรายการในรอบที่ปิดแล้ว');
    }
    this.assertSameTenant(actor.tenantId, original.tenantId);
    this.assertSameBranch(actor.branchId, original.branchId);

    if (original.type === 'OPENING') {
      throw new BadRequestException('ไม่สามารถยกเลิกรายการเงินตั้งต้น');
    }
    if (original.type === 'REVERSAL') {
      throw new BadRequestException('ไม่สามารถยกเลิกรายการยกเลิก');
    }

    // Guard: prevent reversing an already-reversed transaction
    const alreadyReversed = await this.prisma.cashDrawerTransaction.findFirst({
      where: { reversalOfId: txId },
    });
    if (alreadyReversed) {
      throw new BadRequestException('รายการนี้ถูกยกเลิกแล้ว');
    }

    // Reversal direction is opposite of original
    const reversalDirection = original.direction === 'IN' ? 'OUT' : 'IN';

    const reversal = await this.prisma.cashDrawerTransaction.create({
      data: {
        sessionId:    original.sessionId,
        cashDrawerId: original.cashDrawerId,
        tenantId:     original.tenantId ?? undefined,
        branchId:     original.branchId ?? undefined,
        actorUserId:  actor.id,
        type:         'REVERSAL',
        direction:    reversalDirection as 'IN' | 'OUT',
        amount:       original.amount,
        reversalOfId: original.id,
        reason,
      },
    });

    await this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CASH_DRAWER_TRANSACTION_REVERSED',
      entityType: 'CashDrawerTransaction',
      entityId:   txId,
      afterData:  { reversalId: reversal.id, reason },
    });

    return reversal;
  }
}
