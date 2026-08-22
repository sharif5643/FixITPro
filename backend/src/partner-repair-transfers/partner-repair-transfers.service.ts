import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PartnerRepairTransferStatus } from '@prisma/client';
import { PrismaService }       from '../database/prisma.service';
import { AuditLogService }     from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

// ── State machine ─────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<PartnerRepairTransferStatus, PartnerRepairTransferStatus[]>> = {
  PENDING_ACCEPTANCE: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED:           ['DEVICE_RECEIVED', 'RECALLED'],
  DEVICE_RECEIVED:    ['IN_PROGRESS'],
  IN_PROGRESS:        ['COMPLETED'],
  COMPLETED:          ['DEVICE_RETURNED'],
  DEVICE_RETURNED:    ['OWNER_RECEIVED'],
};

const TERMINAL_STATUSES: PartnerRepairTransferStatus[] = [
  'REJECTED', 'CANCELLED', 'RECALLED', 'OWNER_RECEIVED',
];

function assertTransition(
  current: PartnerRepairTransferStatus,
  next: PartnerRepairTransferStatus,
): void {
  const allowed = VALID_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new ConflictException(
      `ไม่สามารถเปลี่ยนสถานะจาก ${current} เป็น ${next} ได้`,
    );
  }
}

// ── Minimal selects ───────────────────────────────────────────────────────────

const ACTOR_SELECT = { id: true, name: true, role: true } as const;

const REPAIR_OWNER_SELECT = {
  id:           true,
  ticketNumber: true,
  deviceBrand:  true,
  deviceModel:  true,
  deviceColor:  true,
  deviceImei:   true,
  issue:        true,
  status:       true,
  note:         true,
  branchId:     true,
  branch: {
    select: { id: true, name: true, tenantId: true },
  },
} as const;

// Fields safe to share with Shop B — NO customer, NO payment, NO cost data
const REPAIR_PARTNER_SELECT = {
  id:          true,
  deviceBrand: true,
  deviceModel: true,
  deviceColor: true,
  issue:       true,
  status:      true,
} as const;

const TRANSFER_BASE_SELECT = {
  id:                 true,
  status:             true,
  agreedPartnerPrice: true,
  pricingNote:        true,
  sharedDeviceInfo:   true,
  sharedImageUrls:    true,
  partnerWorkNote:    true,
  partnerPartsNote:   true,
  sentAt:             true,
  acceptedAt:         true,
  rejectedAt:         true,
  rejectionNote:      true,
  deviceReceivedAt:   true,
  partnerStartedAt:   true,
  completedAt:        true,
  completionNote:     true,
  returnedAt:         true,
  ownerReceivedAt:    true,
  cancelledAt:        true,
  cancellationNote:   true,
  recalledAt:         true,
  recallNote:         true,
  createdAt:          true,
  updatedAt:          true,
  repairId:           true,
  relationshipId:     true,
  ownerTenantId:      true,
  ownerBranchId:      true,
  partnerTenantId:    true,
  partnerBranchId:    true,
  sentById:           true,
  acceptedById:       true,
  rejectedById:       true,
  receivedById:       true,
  partnerStartedById: true,
  completedById:      true,
  returnedById:       true,
  ownerReceivedById:  true,
  cancelledById:      true,
  recalledById:       true,
} as const;

export interface CreateTransferDto {
  partnerTenantId:    string;
  relationshipId:     string;
  agreedPartnerPrice?: number;
  pricingNote?:        string;
  sharedDeviceInfo?:   Record<string, unknown>;
  sharedImageUrls?:    string[];
  partnerWorkNote?:    string;
}

type Actor = {
  id:       string;
  name:     string;
  role:     string;
  tenantId: string;
  branchId?: string | null;
};

@Injectable()
export class PartnerRepairTransfersService {
  constructor(
    private prisma:   PrismaService,
    private auditLog: AuditLogService,
    private notif:    NotificationsService,
  ) {}

  // ── Create transfer ────────────────────────────────────────────────────────

  async createTransfer(repairId: string, dto: CreateTransferDto, actor: Actor) {
    // 1. Load repair with branch/tenant info
    const repair = await this.prisma.repair.findUnique({
      where:  { id: repairId },
      select: {
        ...REPAIR_OWNER_SELECT,
        status:     true,
        customerId: true,
      },
    });
    if (!repair) throw new NotFoundException('ไม่พบงานซ่อม');

    // 2. Repair must belong to actor's tenant
    if (repair.branch?.tenantId !== actor.tenantId) {
      throw new ForbiddenException('งานซ่อมนี้ไม่ได้อยู่ในองค์กรของคุณ');
    }

    // 3. Cannot transfer DELIVERED or CANCELLED repair
    if (repair.status === 'DELIVERED') throw new BadRequestException('ไม่สามารถโอนงานซ่อมที่ส่งคืนลูกค้าแล้ว');
    if (repair.status === 'CANCELLED') throw new BadRequestException('ไม่สามารถโอนงานซ่อมที่ยกเลิกแล้ว');

    // 4. Cannot transfer to own tenant
    if (dto.partnerTenantId === actor.tenantId) {
      throw new ForbiddenException('ไม่สามารถโอนงานซ่อมให้ตัวเองได้');
    }

    // 5. Validate the relationship
    const relationship = await this.prisma.partnerRelationship.findUnique({
      where:  { id: dto.relationshipId },
      select: { id: true, status: true, initiatorTenantId: true, partnerTenantId: true },
    });
    if (!relationship || relationship.status !== 'ACCEPTED') {
      throw new ConflictException('ต้องมีความสัมพันธ์พาร์ทเนอร์ที่ยืนยันแล้วก่อนโอนงานซ่อม');
    }

    const involvedTenants = [relationship.initiatorTenantId, relationship.partnerTenantId];
    if (!involvedTenants.includes(actor.tenantId)) {
      throw new ForbiddenException('คุณไม่ได้เป็นส่วนหนึ่งของความสัมพันธ์พาร์ทเนอร์นี้');
    }
    // Partner tenant must be the other side of the relationship
    const expectedPartner = involvedTenants.find((t) => t !== actor.tenantId);
    if (dto.partnerTenantId !== expectedPartner) {
      throw new ForbiddenException('partnerTenantId ไม่ตรงกับความสัมพันธ์พาร์ทเนอร์');
    }

    // 6. Check for existing active transfer (partial unique index enforces this at DB level,
    //    but we check here first for a friendly error message)
    const existing = await this.prisma.partnerRepairTransfer.findFirst({
      where: {
        repairId,
        status: { notIn: TERMINAL_STATUSES },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new ConflictException('งานซ่อมนี้มีการโอนพาร์ทเนอร์ที่ยังดำเนินการอยู่แล้ว');
    }

    // 7. Create the transfer — P2002 guards the concurrent-creation race window after the findFirst check
    const transfer = await this.prisma.partnerRepairTransfer.create({
      data: {
        repairId,
        relationshipId:     dto.relationshipId,
        ownerTenantId:      actor.tenantId,
        ownerBranchId:      actor.branchId ?? repair.branchId ?? null,
        partnerTenantId:    dto.partnerTenantId,
        agreedPartnerPrice: dto.agreedPartnerPrice ? dto.agreedPartnerPrice : null,
        pricingNote:        dto.pricingNote   ?? null,
        sharedDeviceInfo:   (dto.sharedDeviceInfo ?? null) as any,
        sharedImageUrls:    (dto.sharedImageUrls   ?? null) as any,
        partnerWorkNote:    dto.partnerWorkNote   ?? null,
        sentById:           actor.id,
      },
      select: TRANSFER_BASE_SELECT,
    }).catch((err: any) => {
      if (err?.code === 'P2002') throw new ConflictException('งานซ่อมนี้มีการโอนพาร์ทเนอร์ที่ยังดำเนินการอยู่แล้ว');
      throw err;
    });

    // 8. Event
    await this.createEvent(transfer.id, 'CREATED', null, actor, actor.tenantId);

    // 9. Audit (fire-and-forget)
    this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action:     'CREATE',
      entityType: 'PartnerRepairTransfer',
      entityId:   transfer.id,
      afterData:  { status: 'PENDING_ACCEPTANCE', repairId, ownerTenantId: actor.tenantId, partnerTenantId: dto.partnerTenantId },
    }).catch(() => undefined);

    // 10. Notification to Shop B (fire-and-forget)
    this.notif.notify({
      type:       'PARTNER_REPAIR_REQUEST',
      title:      'คำขอโอนงานซ่อมพาร์ทเนอร์',
      message:    `ร้านพาร์ทเนอร์ส่งคำขอโอนงานซ่อม ${repair.ticketNumber ?? repairId}`,
      severity:   'INFO',
      entityType: 'PartnerRepairTransfer',
      entityId:   transfer.id,
      tenantId:   dto.partnerTenantId,
    }).catch(() => undefined);

    return transfer;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getTransferByRepair(repairId: string, tenantId: string) {
    const transfer = await this.prisma.partnerRepairTransfer.findFirst({
      where: {
        repairId,
        OR: [
          { ownerTenantId:   tenantId },
          { partnerTenantId: tenantId },
        ],
      },
      select: TRANSFER_BASE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    if (!transfer) return null;
    return this.applyPrivacy(transfer, tenantId);
  }

  async findAll(tenantId: string) {
    const transfers = await this.prisma.partnerRepairTransfer.findMany({
      where: {
        OR: [
          { ownerTenantId:   tenantId },
          { partnerTenantId: tenantId },
        ],
      },
      select: TRANSFER_BASE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return transfers.map((t) => this.applyPrivacy(t, tenantId));
  }

  async findOne(id: string, tenantId: string) {
    const transfer = await this.prisma.partnerRepairTransfer.findUnique({
      where:  { id },
      select: TRANSFER_BASE_SELECT,
    });
    if (!transfer) return null;
    // Tenant isolation — third-party gets null (caller maps to 404)
    if (transfer.ownerTenantId !== tenantId && transfer.partnerTenantId !== tenantId) {
      return null;
    }
    return this.applyPrivacy(transfer, tenantId);
  }

  async getEvents(id: string, tenantId: string) {
    const transfer = await this.prisma.partnerRepairTransfer.findUnique({
      where:  { id },
      select: { ownerTenantId: true, partnerTenantId: true },
    });
    if (!transfer) return null;
    if (transfer.ownerTenantId !== tenantId && transfer.partnerTenantId !== tenantId) {
      return null;
    }
    return this.prisma.partnerRepairTransferEvent.findMany({
      where:   { transferId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── State transitions — Shop B ────────────────────────────────────────────

  async accept(id: string, actor: Actor) {
    const transfer = await this.requireTransferForPartner(id, actor.tenantId);
    assertTransition(transfer.status, 'ACCEPTED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: actor.id },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'ACCEPTED', null, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_REPAIR_ACCEPTED', title: 'พาร์ทเนอร์ยืนยันรับงานซ่อม',
      message: 'ร้านพาร์ทเนอร์ยืนยันรับงานซ่อมของคุณแล้ว',
      severity: 'INFO', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.ownerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'ACCEPT');
    return updated;
  }

  async reject(id: string, rejectionNote: string | undefined, actor: Actor) {
    const transfer = await this.requireTransferForPartner(id, actor.tenantId);
    assertTransition(transfer.status, 'REJECTED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  { status: 'REJECTED', rejectedAt: new Date(), rejectedById: actor.id, rejectionNote: rejectionNote ?? null },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'REJECTED', rejectionNote, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_REPAIR_REJECTED', title: 'พาร์ทเนอร์ปฏิเสธงานซ่อม',
      message: 'ร้านพาร์ทเนอร์ปฏิเสธงานซ่อมของคุณ',
      severity: 'WARNING', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.ownerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'REJECT');
    return updated;
  }

  async deviceReceived(id: string, actor: Actor) {
    const transfer = await this.requireTransferForPartner(id, actor.tenantId);
    assertTransition(transfer.status, 'DEVICE_RECEIVED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  { status: 'DEVICE_RECEIVED', deviceReceivedAt: new Date(), receivedById: actor.id },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'DEVICE_RECEIVED', null, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_DEVICE_RECEIVED', title: 'พาร์ทเนอร์รับอุปกรณ์แล้ว',
      message: 'ร้านพาร์ทเนอร์ยืนยันรับอุปกรณ์แล้ว',
      severity: 'INFO', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.ownerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'DEVICE_RECEIVED');
    return updated;
  }

  async start(id: string, actor: Actor) {
    const transfer = await this.requireTransferForPartner(id, actor.tenantId);
    assertTransition(transfer.status, 'IN_PROGRESS');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  { status: 'IN_PROGRESS', partnerStartedAt: new Date(), partnerStartedById: actor.id },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'IN_PROGRESS', null, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_REPAIR_STARTED', title: 'พาร์ทเนอร์เริ่มซ่อมแล้ว',
      message: 'ร้านพาร์ทเนอร์เริ่มงานซ่อมแล้ว',
      severity: 'INFO', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.ownerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'START');
    return updated;
  }

  async complete(id: string, completionNote: string | undefined, actor: Actor) {
    const transfer = await this.requireTransferForPartner(id, actor.tenantId);
    assertTransition(transfer.status, 'COMPLETED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  {
        status: 'COMPLETED', completedAt: new Date(), completedById: actor.id,
        completionNote: completionNote ?? null,
      },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'COMPLETED', completionNote, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_REPAIR_COMPLETED', title: 'พาร์ทเนอร์ซ่อมเสร็จแล้ว',
      message: 'ร้านพาร์ทเนอร์ซ่อมเสร็จแล้ว รอส่งคืนอุปกรณ์',
      severity: 'INFO', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.ownerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'COMPLETE');
    return updated;
  }

  async returnDevice(id: string, actor: Actor) {
    const transfer = await this.requireTransferForPartner(id, actor.tenantId);
    assertTransition(transfer.status, 'DEVICE_RETURNED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  { status: 'DEVICE_RETURNED', returnedAt: new Date(), returnedById: actor.id },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'DEVICE_RETURNED', null, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_DEVICE_RETURNED', title: 'พาร์ทเนอร์คืนอุปกรณ์แล้ว',
      message: 'พาร์ทเนอร์ส่งคืนอุปกรณ์แล้ว กรุณารับอุปกรณ์',
      severity: 'INFO', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.ownerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'RETURN_DEVICE');
    return updated;
  }

  // ── State transitions — Shop A ────────────────────────────────────────────

  async ownerReceived(id: string, actor: Actor) {
    const transfer = await this.requireTransferForOwner(id, actor.tenantId);
    assertTransition(transfer.status, 'OWNER_RECEIVED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  { status: 'OWNER_RECEIVED', ownerReceivedAt: new Date(), ownerReceivedById: actor.id },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'OWNER_RECEIVED', null, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_OWNER_RECEIVED', title: 'ร้านหลักรับอุปกรณ์คืนแล้ว',
      message: 'ร้านหลักยืนยันรับอุปกรณ์คืนจากพาร์ทเนอร์แล้ว',
      severity: 'INFO', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.partnerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'OWNER_RECEIVED');
    return updated;
  }

  async cancel(id: string, cancellationNote: string | undefined, actor: Actor) {
    const transfer = await this.requireTransferForOwner(id, actor.tenantId);
    assertTransition(transfer.status, 'CANCELLED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  {
        status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id,
        cancellationNote: cancellationNote ?? null,
      },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'CANCELLED', cancellationNote, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_REPAIR_CANCELLED', title: 'ยกเลิกคำขอโอนงานซ่อม',
      message: 'ร้านหลักยกเลิกคำขอโอนงานซ่อม',
      severity: 'WARNING', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.partnerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'CANCEL');
    return updated;
  }

  async recall(id: string, recallNote: string | undefined, actor: Actor) {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('เฉพาะ OWNER เท่านั้นที่สามารถเรียกคืนงานซ่อมได้');
    }
    const transfer = await this.requireTransferForOwner(id, actor.tenantId);
    assertTransition(transfer.status, 'RECALLED');
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  {
        status: 'RECALLED', recalledAt: new Date(), recalledById: actor.id,
        recallNote: recallNote ?? null,
      },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'RECALLED', recallNote, actor, actor.tenantId);
    this.notif.notify({
      type: 'PARTNER_REPAIR_RECALLED', title: 'ร้านหลักเรียกคืนงานซ่อม',
      message: 'ร้านหลักเรียกคืนงานซ่อมจากพาร์ทเนอร์',
      severity: 'WARNING', entityType: 'PartnerRepairTransfer', entityId: id,
      tenantId: transfer.partnerTenantId,
    }).catch(() => undefined);
    this.auditTransition(id, actor, 'RECALL');
    return updated;
  }

  // ── Price update ──────────────────────────────────────────────────────────

  async updatePrice(
    id: string,
    agreedPartnerPrice: number | undefined,
    pricingNote: string | undefined,
    actor: Actor,
  ) {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('เฉพาะ OWNER เท่านั้นที่สามารถแก้ไขราคาได้');
    }
    const transfer = await this.requireTransferForOwner(id, actor.tenantId);
    if (TERMINAL_STATUSES.includes(transfer.status)) {
      throw new ConflictException('ไม่สามารถแก้ไขราคาของการโอนที่สิ้นสุดแล้ว');
    }
    const updated = await this.prisma.partnerRepairTransfer.update({
      where: { id },
      data:  {
        agreedPartnerPrice: agreedPartnerPrice ?? null,
        pricingNote:        pricingNote ?? null,
      },
      select: TRANSFER_BASE_SELECT,
    });
    await this.createEvent(id, 'PRICE_UPDATED', pricingNote, actor, actor.tenantId);
    this.auditTransition(id, actor, 'PRICE_UPDATE');
    return updated;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async requireTransferForOwner(id: string, tenantId: string) {
    const transfer = await this.prisma.partnerRepairTransfer.findUnique({
      where:  { id },
      select: { id: true, status: true, ownerTenantId: true, partnerTenantId: true },
    });
    if (!transfer || transfer.ownerTenantId !== tenantId) {
      throw new NotFoundException('ไม่พบข้อมูลการโอนงานซ่อม');
    }
    return transfer;
  }

  private async requireTransferForPartner(id: string, tenantId: string) {
    const transfer = await this.prisma.partnerRepairTransfer.findUnique({
      where:  { id },
      select: { id: true, status: true, ownerTenantId: true, partnerTenantId: true },
    });
    if (!transfer || transfer.partnerTenantId !== tenantId) {
      throw new NotFoundException('ไม่พบข้อมูลการโอนงานซ่อม');
    }
    return transfer;
  }

  private applyPrivacy(transfer: Record<string, any>, callerTenantId: string) {
    // Shop A (owner) gets full data
    if (transfer.ownerTenantId === callerTenantId) return transfer;

    // Shop B (partner) receives ONLY intentionally shared operational fields.
    // Strip ALL Shop A-side identifiers: tenant, branch, and every Shop A actor user ID.
    // This boundary is enforced here — never rely on frontend filtering alone.
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ownerTenantId:     _ot,
      ownerBranchId:     _ob,
      sentById:          _sb,
      ownerReceivedById: _or,
      cancelledById:     _cb,
      recalledById:      _rb,
      ...rest
    } = transfer;
    return rest;
  }

  private async createEvent(
    transferId: string,
    event: string,
    note: string | null | undefined,
    actor: Actor,
    tenantId: string,
  ) {
    await this.prisma.partnerRepairTransferEvent.create({
      data: {
        transferId,
        event,
        note:      note ?? null,
        actorId:   actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        tenantId,
      },
    });
  }

  private auditTransition(id: string, actor: Actor, action: string) {
    this.auditLog.log({
      actorId:    actor.id,
      actorName:  actor.name,
      action,
      entityType: 'PartnerRepairTransfer',
      entityId:   id,
    }).catch(() => undefined);
  }
}
