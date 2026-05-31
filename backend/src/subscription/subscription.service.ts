import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const SUB_ID = 1;
const TRIAL_DAYS = 30;

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  private computeEffectiveStatus(status: string, expiryDate: Date): string {
    if (status === 'SUSPENDED') return 'SUSPENDED';
    if (expiryDate < new Date()) return 'EXPIRED';
    return status;
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
    const effectiveStatus = this.computeEffectiveStatus(sub.status, sub.expiryDate);
    const msRemaining = sub.expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    return {
      ...sub,
      effectiveStatus,
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
