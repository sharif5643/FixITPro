import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEvent {
  id: string;
  action: string;
  target: string;
  tenantId: string | null;
  tenantName: string | null;
  actor: string;
  time: Date;
  note: string | null;
}

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId?: string, page = 1, limit = 50) {
    const tenantFilter = tenantId ? { tenantId } : {};

    const [renewals, verifiedPayments, passwordResets, tenantCreations] = await Promise.all([
      this.prisma.tenantRenewal.findMany({
        where: tenantFilter,
        include: { tenant: { select: { id: true, shopName: true } } },
        orderBy: { createdAt: 'desc' },
      }),

      this.prisma.tenantPayment.findMany({
        where: { ...tenantFilter, verifiedAt: { not: null } },
        include: {
          tenant: { select: { id: true, shopName: true } },
          verifiedBy: { select: { email: true } },
        },
        orderBy: { verifiedAt: 'desc' },
      }),

      this.prisma.user.findMany({
        where: {
          ...tenantFilter,
          role: { not: 'SUPER_ADMIN' },
          passwordResetAt: { not: null },
        },
        select: {
          id: true,
          email: true,
          passwordResetAt: true,
          tenant: { select: { id: true, shopName: true } },
        },
        orderBy: { passwordResetAt: 'desc' },
      }),

      this.prisma.tenant.findMany({
        where: tenantId ? { id: tenantId } : {},
        select: { id: true, shopName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const events: AuditEvent[] = [];

    for (const t of tenantCreations) {
      events.push({
        id: `tc-${t.id}`,
        action: 'TENANT_CREATED',
        target: t.shopName,
        tenantId: t.id,
        tenantName: t.shopName,
        actor: 'system',
        time: t.createdAt,
        note: null,
      });
    }

    for (const r of renewals) {
      events.push({
        id: `tr-${r.id}`,
        action: r.action,
        target: r.tenant.shopName,
        tenantId: r.tenantId,
        tenantName: r.tenant.shopName,
        actor: 'superadmin@fixitpro.com',
        time: r.createdAt,
        note: r.note ?? null,
      });
    }

    for (const p of verifiedPayments) {
      events.push({
        id: `tp-${p.id}`,
        action: p.status === 'REJECTED' ? 'PAYMENT_REJECTED' : 'PAYMENT_VERIFIED',
        target: p.tenant.shopName,
        tenantId: p.tenantId,
        tenantName: p.tenant.shopName,
        actor: p.verifiedBy?.email ?? 'superadmin@fixitpro.com',
        time: p.verifiedAt!,
        note: p.adminNote ?? null,
      });
    }

    for (const u of passwordResets) {
      events.push({
        id: `pr-${u.id}`,
        action: 'PASSWORD_RESET',
        target: u.email,
        tenantId: u.tenant?.id ?? null,
        tenantName: u.tenant?.shopName ?? null,
        actor: 'superadmin@fixitpro.com',
        time: u.passwordResetAt!,
        note: null,
      });
    }

    events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const total = events.length;
    const skip = (page - 1) * limit;
    const data = events.slice(skip, skip + limit);

    return { data, total, page, limit };
  }
}
