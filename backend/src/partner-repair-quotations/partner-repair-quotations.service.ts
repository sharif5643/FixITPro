import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService }        from '../database/prisma.service';
import { AuditLogService }      from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const QUOTATION_ALLOWED_TRANSFER_STATUSES = ['DEVICE_RECEIVED', 'IN_PROGRESS'] as const;

const QUOTATION_TERMINAL = ['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateQuotationDto {
  amount: number;
  note?: string;
}

export interface CounterQuotationDto {
  amount: number;
  note?: string;
}

type Actor = {
  id:       string;
  name:     string;
  role:     string;
  tenantId: string;
};

// ── Selects ───────────────────────────────────────────────────────────────────

const QUOTATION_SELECT = {
  id:                 true,
  version:            true,
  status:             true,
  proposedAmount:     true,
  currency:           true,
  note:               true,
  respondedAt:        true,
  expiresAt:          true,
  createdAt:          true,
  updatedAt:          true,
  transferId:         true,
  proposedByTenantId: true,
  proposedByUserId:   true,
  respondedByUserId:  true,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateAmount(amount: number): void {
  if (typeof amount !== 'number' || !isFinite(amount) || isNaN(amount)) {
    throw new BadRequestException('จำนวนเงินต้องเป็นตัวเลขที่ถูกต้อง');
  }
  if (amount <= 0) {
    throw new BadRequestException('จำนวนเงินต้องมากกว่า 0');
  }
  // Max precision: 12 digits total, 2 decimal places
  if (amount > 9_999_999_999.99) {
    throw new BadRequestException('จำนวนเงินเกินขีดสูงสุด');
  }
}

@Injectable()
export class PartnerRepairQuotationsService {
  constructor(
    private prisma:   PrismaService,
    private auditLog: AuditLogService,
    private notif:    NotificationsService,
  ) {}

  // ── Load & guard transfer ─────────────────────────────────────────────────

  private async loadTransferForQuotation(transferId: string, actorTenantId: string) {
    const transfer = await this.prisma.partnerRepairTransfer.findUnique({
      where:  { id: transferId },
      select: {
        id:             true,
        status:         true,
        ownerTenantId:  true,
        partnerTenantId: true,
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอนงานพาร์ทเนอร์');

    const isInvolved =
      transfer.ownerTenantId   === actorTenantId ||
      transfer.partnerTenantId === actorTenantId;
    if (!isInvolved) throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงรายการโอนงานนี้');

    return transfer;
  }

  private async loadQuotationForResponse(quotationId: string, actorTenantId: string) {
    const quotation = await this.prisma.partnerRepairQuotation.findUnique({
      where:  { id: quotationId },
      select: {
        ...QUOTATION_SELECT,
        transfer: {
          select: {
            id:              true,
            status:          true,
            ownerTenantId:   true,
            partnerTenantId: true,
          },
        },
      },
    });
    if (!quotation) throw new NotFoundException('ไม่พบใบเสนอราคา');

    const transfer = quotation.transfer;
    const isInvolved =
      transfer.ownerTenantId   === actorTenantId ||
      transfer.partnerTenantId === actorTenantId;
    if (!isInvolved) throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงใบเสนอราคานี้');

    // Block responses when the parent transfer has reached a terminal state
    const terminalTransferStatuses = ['REJECTED', 'CANCELLED', 'RECALLED', 'OWNER_RECEIVED'];
    if (terminalTransferStatuses.includes(transfer.status)) {
      throw new ConflictException(
        `ไม่สามารถดำเนินการกับใบเสนอราคาของการโอนที่สิ้นสุดแล้ว (สถานะโอน: ${transfer.status})`,
      );
    }

    // Caller must be "the other side" from the proposer
    if (quotation.proposedByTenantId === actorTenantId) {
      throw new ForbiddenException('คุณไม่สามารถตอบรับใบเสนอราคาของตัวเองได้');
    }

    if (quotation.status !== 'PENDING') {
      throw new ConflictException(`ใบเสนอราคานี้ไม่ได้อยู่ในสถานะ PENDING (ปัจจุบัน: ${quotation.status})`);
    }

    return { quotation, transfer };
  }

  private async createEvent(
    quotationId: string,
    event:       string,
    amount:      number | null,
    note:        string | null,
    actor:       Actor,
  ) {
    await this.prisma.partnerRepairQuotationEvent.create({
      data: {
        quotationId,
        event,
        amount: amount != null ? new Decimal(amount) : null,
        note,
        actorId:   actor.id,
        actorName: actor.name,
        tenantId:  actor.tenantId,
      },
    });
  }

  // ── Create quotation (Shop B initiates) ───────────────────────────────────

  async createQuotation(transferId: string, dto: CreateQuotationDto, actor: Actor) {
    validateAmount(dto.amount);

    const transfer = await this.loadTransferForQuotation(transferId, actor.tenantId);

    // Only Shop B (partnerTenantId) can create the initial quotation
    if (transfer.partnerTenantId !== actor.tenantId) {
      throw new ForbiddenException('เฉพาะร้านพาร์ทเนอร์เท่านั้นที่สร้างใบเสนอราคาได้');
    }

    // Transfer must be in allowed status
    if (!QUOTATION_ALLOWED_TRANSFER_STATUSES.includes(transfer.status as any)) {
      throw new BadRequestException(
        `ไม่สามารถสร้างใบเสนอราคาได้ในสถานะ ${transfer.status} (ต้องเป็น ${QUOTATION_ALLOWED_TRANSFER_STATUSES.join(', ')})`,
      );
    }

    // No active quotation must exist
    const existing = await this.prisma.partnerRepairQuotation.findFirst({
      where: {
        transferId,
        status: { notIn: [...QUOTATION_TERMINAL] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new ConflictException('มีใบเสนอราคาที่ยังดำเนินการอยู่แล้วสำหรับการโอนงานนี้');
    }

    // Next version number
    const count = await this.prisma.partnerRepairQuotation.count({ where: { transferId } });

    // P2002 guards the concurrent-creation race window after the findFirst check
    const quotation = await this.prisma.partnerRepairQuotation.create({
      data: {
        transferId,
        version:            count + 1,
        proposedAmount:     new Decimal(dto.amount),
        note:               dto.note ?? null,
        proposedByTenantId: actor.tenantId,
        proposedByUserId:   actor.id,
      },
      select: QUOTATION_SELECT,
    }).catch((err: any) => {
      if (err?.code === 'P2002') throw new ConflictException('มีใบเสนอราคาที่ยังดำเนินการอยู่แล้วสำหรับการโอนงานนี้');
      throw err;
    });

    await this.createEvent(quotation.id, 'CREATED', dto.amount, dto.note ?? null, actor);

    this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CREATE',
      entityType: 'PartnerRepairQuotation',
      entityId:   quotation.id,
      afterData:  { version: quotation.version, amount: dto.amount, transferId },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_QUOTATION_CREATED',
      title:      'ใบเสนอราคาใหม่จากพาร์ทเนอร์',
      message:    `พาร์ทเนอร์เสนอราคา ${dto.amount} บาท`,
      severity:   'INFO',
      entityType: 'PartnerRepairQuotation',
      entityId:   quotation.id,
      tenantId:   transfer.ownerTenantId,
    }).catch(() => undefined);

    return quotation;
  }

  // ── Accept ────────────────────────────────────────────────────────────────

  async acceptQuotation(quotationId: string, actor: Actor) {
    const { quotation, transfer } = await this.loadQuotationForResponse(quotationId, actor.tenantId);

    // Accept: update quotation + update transfer.agreedPartnerPrice
    const [updated] = await this.prisma.$transaction([
      this.prisma.partnerRepairQuotation.update({
        where: { id: quotationId },
        data:  {
          status:           'ACCEPTED',
          respondedByUserId: actor.id,
          respondedAt:       new Date(),
        },
        select: QUOTATION_SELECT,
      }),
      this.prisma.partnerRepairTransfer.update({
        where: { id: transfer.id },
        data:  { agreedPartnerPrice: quotation.proposedAmount },
      }),
    ]);

    await this.createEvent(quotationId, 'ACCEPTED', Number(quotation.proposedAmount), null, actor);

    this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'ACCEPT',
      entityType: 'PartnerRepairQuotation',
      entityId:   quotationId,
      afterData:  {
        quotationId,
        transferId:     transfer.id,
        version:        quotation.version,
        previousStatus: 'PENDING',
        newStatus:      'ACCEPTED',
      },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_QUOTATION_ACCEPTED',
      title:      'ใบเสนอราคาได้รับการยืนยัน',
      message:    `ยืนยันราคา ${quotation.proposedAmount} บาท`,
      severity:   'INFO',
      entityType: 'PartnerRepairQuotation',
      entityId:   quotationId,
      tenantId:   quotation.proposedByTenantId,
    }).catch(() => undefined);

    return updated;
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  async rejectQuotation(quotationId: string, note: string | undefined, actor: Actor) {
    const { quotation } = await this.loadQuotationForResponse(quotationId, actor.tenantId);

    const updated = await this.prisma.partnerRepairQuotation.update({
      where: { id: quotationId },
      data:  {
        status:            'REJECTED',
        respondedByUserId: actor.id,
        respondedAt:       new Date(),
      },
      select: QUOTATION_SELECT,
    });

    await this.createEvent(quotationId, 'REJECTED', null, note ?? null, actor);

    this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'REJECT',
      entityType: 'PartnerRepairQuotation',
      entityId:   quotationId,
      afterData:  {
        quotationId,
        transferId:     quotation.transferId,
        version:        quotation.version,
        previousStatus: 'PENDING',
        newStatus:      'REJECTED',
      },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_QUOTATION_REJECTED',
      title:      'ใบเสนอราคาถูกปฏิเสธ',
      message:    `ใบเสนอราคา ${quotation.proposedAmount} บาทถูกปฏิเสธ`,
      severity:   'WARNING',
      entityType: 'PartnerRepairQuotation',
      entityId:   quotationId,
      tenantId:   quotation.proposedByTenantId,
    }).catch(() => undefined);

    return updated;
  }

  // ── Counter-offer ─────────────────────────────────────────────────────────

  async counterQuotation(quotationId: string, dto: CounterQuotationDto, actor: Actor) {
    validateAmount(dto.amount);

    const { quotation, transfer } = await this.loadQuotationForResponse(quotationId, actor.tenantId);

    // Determine who receives this counter notification
    const notifyTenantId = quotation.proposedByTenantId;

    // Count existing quotations to compute next version
    const count = await this.prisma.partnerRepairQuotation.count({
      where: { transferId: quotation.transferId },
    });

    // Seal current quotation as COUNTER_OFFER, create new PENDING quotation
    const [, newQuotation] = await this.prisma.$transaction([
      this.prisma.partnerRepairQuotation.update({
        where: { id: quotationId },
        data:  {
          status:            'COUNTER_OFFER',
          respondedByUserId: actor.id,
          respondedAt:       new Date(),
        },
      }),
      this.prisma.partnerRepairQuotation.create({
        data: {
          transferId:         quotation.transferId,
          version:            count + 1,
          proposedAmount:     new Decimal(dto.amount),
          note:               dto.note ?? null,
          proposedByTenantId: actor.tenantId,
          proposedByUserId:   actor.id,
        },
        select: QUOTATION_SELECT,
      }),
    ]);

    await this.createEvent(quotationId, 'COUNTER_OFFER', dto.amount, dto.note ?? null, actor);
    await this.createEvent(newQuotation.id, 'CREATED', dto.amount, dto.note ?? null, actor);

    this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'COUNTER',
      entityType: 'PartnerRepairQuotation',
      entityId:   newQuotation.id,
      afterData:  {
        previousQuotationId: quotationId,
        newQuotationId:      newQuotation.id,
        transferId:          quotation.transferId,
        newVersion:          newQuotation.version,
        previousStatus:      'PENDING',
        newStatus:           'COUNTER_OFFER',
      },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_QUOTATION_COUNTERED',
      title:      'มีข้อเสนอราคาตอบกลับ',
      message:    `มีการเสนอราคาตอบกลับ ${dto.amount} บาท`,
      severity:   'INFO',
      entityType: 'PartnerRepairQuotation',
      entityId:   newQuotation.id,
      tenantId:   notifyTenantId,
    }).catch(() => undefined);

    return newQuotation;
  }

  // ── Cancel all pending (called when transfer is cancelled/recalled) ────────

  async cancelPendingQuotations(transferId: string, actor: Actor) {
    const pending = await this.prisma.partnerRepairQuotation.findMany({
      where:  { transferId, status: 'PENDING' },
      select: { id: true },
    });

    if (pending.length === 0) return;

    await this.prisma.partnerRepairQuotation.updateMany({
      where: { transferId, status: 'PENDING' },
      data:  { status: 'CANCELLED', respondedAt: new Date() },
    });

    for (const q of pending) {
      await this.createEvent(q.id, 'CANCELLED', null, 'โอนงานถูกยกเลิก', actor);
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getQuotations(transferId: string, actorTenantId: string) {
    await this.loadTransferForQuotation(transferId, actorTenantId);

    return this.prisma.partnerRepairQuotation.findMany({
      where:   { transferId },
      select:  QUOTATION_SELECT,
      orderBy: { version: 'asc' },
    });
  }

  async getActiveQuotation(transferId: string, actorTenantId: string) {
    await this.loadTransferForQuotation(transferId, actorTenantId);

    return this.prisma.partnerRepairQuotation.findFirst({
      where:   { transferId, status: 'PENDING' },
      select:  QUOTATION_SELECT,
      orderBy: { version: 'desc' },
    });
  }

  async getQuotationEvents(quotationId: string, actorTenantId: string) {
    const quotation = await this.prisma.partnerRepairQuotation.findUnique({
      where:  { id: quotationId },
      select: {
        id: true,
        transfer: {
          select: { ownerTenantId: true, partnerTenantId: true },
        },
      },
    });
    if (!quotation) throw new NotFoundException('ไม่พบใบเสนอราคา');

    const { ownerTenantId, partnerTenantId } = quotation.transfer;
    if (actorTenantId !== ownerTenantId && actorTenantId !== partnerTenantId) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงใบเสนอราคานี้');
    }

    return this.prisma.partnerRepairQuotationEvent.findMany({
      where:   { quotationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
