import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const SUB_ID = 1;
const TRIAL_DAYS = 30;

const PLAN_LABELS: Record<string, string> = {
  TRIAL: 'Founding Customer (ทดลองใช้)',
  BASIC: 'Starter',
  PRO: 'Business',
  ENTERPRISE: 'Enterprise',
};

const PLAN_BRANCH_LIMITS: Record<string, string> = {
  TRIAL: '1 สาขา',
  BASIC: '1 สาขา',
  PRO: '3 สาขา',
  ENTERPRISE: 'ไม่จำกัด',
};

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  private computeEffectiveStatus(status: string, expiryDate: Date): { effectiveStatus: string; graceDaysRemaining: number } {
    if (status === 'SUSPENDED') return { effectiveStatus: 'SUSPENDED', graceDaysRemaining: 0 };
    const now = new Date();
    if (expiryDate >= now) return { effectiveStatus: status, graceDaysRemaining: 0 };

    const gracePeriodEnd = new Date(expiryDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

    if (gracePeriodEnd > now) {
      const graceDays = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { effectiveStatus: 'GRACE', graceDaysRemaining: graceDays };
    }

    return { effectiveStatus: 'EXPIRED', graceDaysRemaining: 0 };
  }

  async getSubscription() {
    let sub = await this.prisma.subscription.findFirst({
      include: { renewals: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });

    if (!sub) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + TRIAL_DAYS);
      sub = await this.prisma.subscription.create({
        data: { id: SUB_ID, expiryDate },
        include: { renewals: true },
      });
    }

    const now = new Date();
    const { effectiveStatus, graceDaysRemaining } = this.computeEffectiveStatus(sub.status, sub.expiryDate);
    const msRemaining = sub.expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    return {
      ...sub,
      effectiveStatus,
      graceDaysRemaining,
      daysRemaining,
    };
  }

  async updateSubscription(dto: {
    planName?: string;
    status?: string;
    expiryDate?: string;
    notes?: string;
  }) {
    const data: any = {};
    if (dto.planName !== undefined) data.planName = dto.planName;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.expiryDate !== undefined) data.expiryDate = new Date(dto.expiryDate);
    if (dto.notes !== undefined) data.notes = dto.notes;

    const existing = await this.prisma.subscription.findFirst();
    if (!existing) {
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + TRIAL_DAYS);
      await this.prisma.subscription.create({
        data: { id: SUB_ID, expiryDate: defaultExpiry },
      });
    }

    return this.prisma.subscription.update({
      where: { id: SUB_ID },
      data,
      include: { renewals: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });
  }

  async getSubscriptionForTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      include: { renewals: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });

    if (!tenant) return this.getSubscription();

    const now = new Date();
    const expiryDate = tenant.expiryDate ?? new Date(0);
    const { effectiveStatus, graceDaysRemaining } = this.computeEffectiveStatus(tenant.status, expiryDate);
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

    return {
      id: tenant.id,
      planName: PLAN_LABELS[tenant.plan] ?? tenant.plan,
      plan: tenant.plan,
      branchLimit: PLAN_BRANCH_LIMITS[tenant.plan] ?? '-',
      status: tenant.status,
      effectiveStatus,
      graceDaysRemaining,
      daysRemaining,
      startDate: tenant.startDate?.toISOString() ?? null,
      expiryDate: expiryDate.toISOString(),
      notes: tenant.notes ?? null,
      renewals: tenant.renewals.map((r) => ({
        id: r.id,
        action: r.action,
        plan: r.plan,
        duration: r.duration,
        expiryDate: r.expiryDate.toISOString(),
        note: r.note ?? null,
        amount: null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async addRenewal(dto: {
    expiryDate: string;
    amount?: number;
    note?: string;
    action?: string;
  }) {
    const expiryDate = new Date(dto.expiryDate);

    await this.prisma.subscription.upsert({
      where: { id: SUB_ID },
      create: {
        id: SUB_ID,
        expiryDate,
        status: 'ACTIVE',
        planName: 'Basic',
      },
      update: {
        expiryDate,
        status: 'ACTIVE',
      },
    });

    await this.prisma.subscriptionRenewal.create({
      data: {
        subscriptionId: SUB_ID,
        action: dto.action ?? 'RENEWED',
        expiryDate,
        amount: dto.amount,
        note: dto.note,
      },
    });

    return this.getSubscription();
  }
}
