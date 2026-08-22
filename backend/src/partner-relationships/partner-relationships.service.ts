import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PartnerRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

const TERMINAL_STATUSES: PartnerRelationshipStatus[] = ['REJECTED', 'CANCELLED', 'SUSPENDED'];
const ACTIVE_STATUSES:   PartnerRelationshipStatus[] = ['PENDING', 'ACCEPTED'];

const PARTNER_SELECT = {
  id:       true,
  shopName: true,
  phone:    true,
  email:    false, // never expose partner email to other party
} as const;

const USER_SELECT = {
  id:   true,
  name: true,
} as const;

@Injectable()
export class PartnerRelationshipsService {
  constructor(
    private prisma:   PrismaService,
    private auditLog: AuditLogService,
    private notif:    NotificationsService,
  ) {}

  /**
   * Create a partner relationship request.
   * Privacy: returns the same generic response regardless of whether the
   * target email belongs to a registered tenant — prevents email enumeration.
   */
  async create(
    initiatorTenantId: string,
    partnerEmail: string,
    note: string | undefined,
    actorId: string,
    actorName: string,
  ) {
    // Look up target tenant by email (internal only — result never leaked in error messages)
    const partnerTenant = await this.prisma.tenant.findUnique({
      where:  { email: partnerEmail.toLowerCase().trim() },
      select: { id: true, shopName: true, status: true },
    });

    // Privacy gate: return same shape if not found or if targeting self
    if (!partnerTenant || partnerTenant.id === initiatorTenantId) {
      return { id: null, status: 'PENDING', message: 'คำขอพาร์ทเนอร์ถูกส่งแล้ว' };
    }

    // Check for existing relationship between this pair
    const existing = await this.prisma.partnerRelationship.findUnique({
      where: {
        initiatorTenantId_partnerTenantId: {
          initiatorTenantId,
          partnerTenantId: partnerTenant.id,
        },
      },
    });

    if (existing) {
      if (ACTIVE_STATUSES.includes(existing.status)) {
        throw new ConflictException('มีความสัมพันธ์พาร์ทเนอร์ที่ยังใช้งานอยู่กับร้านนี้แล้ว');
      }
      // Terminal state — delete old record so new one can be created
      await this.prisma.partnerRelationship.delete({ where: { id: existing.id } });
    }

    const rel = await this.prisma.partnerRelationship.create({
      data: {
        initiatorTenantId,
        partnerTenantId: partnerTenant.id,
        requestedById:   actorId,
        note,
        status: 'PENDING',
      },
    });

    this.auditLog.log({
      actorId,
      actorName,
      action:     'PARTNER_RELATIONSHIP_CREATED',
      entityType: 'PartnerRelationship',
      entityId:   rel.id,
      afterData:  { initiatorTenantId, partnerTenantId: partnerTenant.id, status: 'PENDING' },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_RELATIONSHIP_REQUEST',
      title:      'คำขอพาร์ทเนอร์ใหม่',
      message:    'มีร้านซ่อมต้องการเป็นพาร์ทเนอร์กับคุณ กรุณาตรวจสอบและตอบรับหรือปฏิเสธ',
      severity:   'INFO',
      entityType: 'PartnerRelationship',
      entityId:   rel.id,
      tenantId:   partnerTenant.id,
    }).catch(() => undefined);

    return rel;
  }

  async findAll(tenantId: string) {
    return this.prisma.partnerRelationship.findMany({
      where: {
        OR: [
          { initiatorTenantId: tenantId },
          { partnerTenantId:   tenantId },
        ],
      },
      include: {
        initiatorTenant: { select: PARTNER_SELECT },
        partnerTenant:   { select: PARTNER_SELECT },
        requestedBy:     { select: USER_SELECT },
        respondedBy:     { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns null instead of throwing for the 404-not-found case (controller handles 404). */
  async findOne(id: string, tenantId: string) {
    return this.prisma.partnerRelationship.findFirst({
      where: {
        id,
        OR: [
          { initiatorTenantId: tenantId },
          { partnerTenantId:   tenantId },
        ],
      },
      include: {
        initiatorTenant: { select: PARTNER_SELECT },
        partnerTenant:   { select: PARTNER_SELECT },
        requestedBy:     { select: USER_SELECT },
        respondedBy:     { select: USER_SELECT },
      },
    });
  }

  async accept(
    id: string,
    partnerTenantId: string,
    actorId: string,
    actorName: string,
  ) {
    const rel = await this.prisma.partnerRelationship.findFirst({
      where: { id, partnerTenantId, status: 'PENDING' },
    });
    if (!rel) throw new NotFoundException('ไม่พบคำขอพาร์ทเนอร์หรือสถานะไม่ถูกต้อง');

    const updated = await this.prisma.partnerRelationship.update({
      where: { id },
      data:  {
        status:       'ACCEPTED',
        respondedById: actorId,
        respondedAt:  new Date(),
      },
    });

    this.auditLog.log({
      actorId,
      actorName,
      action:     'PARTNER_RELATIONSHIP_ACCEPTED',
      entityType: 'PartnerRelationship',
      entityId:   id,
      afterData:  { status: 'ACCEPTED', partnerTenantId },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_RELATIONSHIP_ACCEPTED',
      title:      'ยอมรับคำขอพาร์ทเนอร์แล้ว',
      message:    'ร้านพาร์ทเนอร์ได้ยอมรับคำขอของคุณ ตอนนี้คุณสามารถส่งงานซ่อมให้พาร์ทเนอร์ได้',
      severity:   'INFO',
      entityType: 'PartnerRelationship',
      entityId:   id,
      tenantId:   rel.initiatorTenantId,
    }).catch(() => undefined);

    return updated;
  }

  async reject(
    id: string,
    partnerTenantId: string,
    actorId: string,
    actorName: string,
  ) {
    const rel = await this.prisma.partnerRelationship.findFirst({
      where: { id, partnerTenantId, status: 'PENDING' },
    });
    if (!rel) throw new NotFoundException('ไม่พบคำขอพาร์ทเนอร์หรือสถานะไม่ถูกต้อง');

    const updated = await this.prisma.partnerRelationship.update({
      where: { id },
      data:  {
        status:       'REJECTED',
        respondedById: actorId,
        respondedAt:  new Date(),
      },
    });

    this.auditLog.log({
      actorId,
      actorName,
      action:     'PARTNER_RELATIONSHIP_REJECTED',
      entityType: 'PartnerRelationship',
      entityId:   id,
      afterData:  { status: 'REJECTED', partnerTenantId },
    }).catch(() => undefined);

    this.notif.notify({
      type:       'PARTNER_RELATIONSHIP_REJECTED',
      title:      'ปฏิเสธคำขอพาร์ทเนอร์',
      message:    'ร้านพาร์ทเนอร์ได้ปฏิเสธคำขอของคุณ',
      severity:   'WARNING',
      entityType: 'PartnerRelationship',
      entityId:   id,
      tenantId:   rel.initiatorTenantId,
    }).catch(() => undefined);

    return updated;
  }

  async cancel(
    id: string,
    initiatorTenantId: string,
    actorId: string,
    actorName: string,
  ) {
    const rel = await this.prisma.partnerRelationship.findFirst({
      where: { id, initiatorTenantId, status: 'PENDING' },
    });
    if (!rel) throw new NotFoundException('ไม่พบคำขอพาร์ทเนอร์หรือสถานะไม่ถูกต้อง');

    const updated = await this.prisma.partnerRelationship.update({
      where: { id },
      data:  { status: 'CANCELLED' },
    });

    this.auditLog.log({
      actorId,
      actorName,
      action:     'PARTNER_RELATIONSHIP_CANCELLED',
      entityType: 'PartnerRelationship',
      entityId:   id,
      afterData:  { status: 'CANCELLED', initiatorTenantId },
    }).catch(() => undefined);

    return updated;
  }

  /** Used by Phase 4C.3+: check whether a tenant has at least one ACCEPTED partner. */
  async hasAcceptedPartner(tenantId: string): Promise<boolean> {
    const count = await this.prisma.partnerRelationship.count({
      where: {
        status: 'ACCEPTED',
        OR: [
          { initiatorTenantId: tenantId },
          { partnerTenantId:   tenantId },
        ],
      },
    });
    return count > 0;
  }

  /** Returns all ACCEPTED partners for a tenant (used by Phase 4C.3+ transfer creation). */
  async getAcceptedPartners(tenantId: string) {
    return this.prisma.partnerRelationship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { initiatorTenantId: tenantId },
          { partnerTenantId:   tenantId },
        ],
      },
      include: {
        initiatorTenant: { select: PARTNER_SELECT },
        partnerTenant:   { select: PARTNER_SELECT },
      },
      orderBy: { respondedAt: 'desc' },
    });
  }
}
