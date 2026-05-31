import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface TechnicianKpi {
  totalRepairs: number;
  completedRepairs: number;
  cancelledRepairs: number;
  cancellationRate: number;
  avgRepairHours: number | null;
  revenue: number;
  laborRevenue: number;
  partsCost: number;
  laborProfit: number;
  warrantyClaims: number;
  warrantyClaimRate: number;
  repeatRepairs: number;
  inProgressRepairs: number;
}

export interface TechnicianSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastRepairAt: string | null;
  kpi: TechnicianKpi;
  rank?: number;
}

export interface DailyPoint {
  date: string;
  repairs: number;
  revenue: number;
}

@Injectable()
export class TechniciansService {
  constructor(private prisma: PrismaService) {}

  private buildDateWhere(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;
    const where: any = {};
    if (startDate) where.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      where.lt = end;
    }
    return where;
  }

  private async computeKpi(
    technicianId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<TechnicianKpi> {
    const dateWhere = this.buildDateWhere(startDate, endDate);
    const repairWhere: any = { technicianId };
    if (dateWhere) repairWhere.receivedAt = dateWhere;

    const repairs = await this.prisma.repair.findMany({
      where: repairWhere,
      select: {
        id: true,
        status: true,
        finalCost: true,
        actualLaborCost: true,
        receivedAt: true,
        completedAt: true,
        deliveredAt: true,
        customerId: true,
        parts: { select: { price: true, quantity: true } },
      },
    });

    const total       = repairs.length;
    const delivered   = repairs.filter((r) => r.status === 'DELIVERED');
    const cancelled   = repairs.filter((r) => r.status === 'CANCELLED');
    const inProgress  = repairs.filter(
      (r) => !['DELIVERED', 'CANCELLED'].includes(r.status),
    );

    // Avg repair time: receivedAt → completedAt (or deliveredAt) for DELIVERED
    const timesMs = delivered
      .map((r) => {
        const end = r.completedAt ?? r.deliveredAt;
        return end ? new Date(end).getTime() - new Date(r.receivedAt).getTime() : null;
      })
      .filter((t): t is number => t !== null && t > 0);

    const avgRepairHours =
      timesMs.length > 0
        ? timesMs.reduce((s, t) => s + t, 0) / timesMs.length / 3_600_000
        : null;

    const revenue     = delivered.reduce((s, r) => s + Number(r.finalCost ?? 0), 0);
    const laborRevenue = delivered.reduce((s, r) => s + Number(r.actualLaborCost ?? 0), 0);
    const partsCost   = delivered.reduce(
      (s, r) => s + r.parts.reduce((ps, p) => ps + Number(p.price) * p.quantity, 0),
      0,
    );
    const laborProfit = laborRevenue; // labor cost is salaried — revenue IS the profit contribution

    // Warranty claims: warranties where repairId in delivered repairIds and status=CLAIMED
    const deliveredIds = delivered.map((r) => r.id);
    let warrantyClaims = 0;
    if (deliveredIds.length > 0) {
      warrantyClaims = await (this.prisma as any).warranty.count({
        where: { repairId: { in: deliveredIds }, status: 'CLAIMED' },
      });
    }

    const warrantyClaimRate =
      delivered.length > 0 ? (warrantyClaims / delivered.length) * 100 : 0;

    // Repeat repairs: count of delivered repairs where same customer had another repair
    // with this technician within the previous 30 days
    let repeatRepairs = 0;
    for (const r of delivered) {
      if (!r.customerId) continue;
      const prior = await this.prisma.repair.count({
        where: {
          technicianId,
          customerId: r.customerId,
          id: { not: r.id },
          receivedAt: {
            gte: new Date(new Date(r.receivedAt).getTime() - 30 * 24 * 3_600_000),
            lt: new Date(r.receivedAt),
          },
        },
      });
      if (prior > 0) repeatRepairs++;
    }

    return {
      totalRepairs:     total,
      completedRepairs: delivered.length,
      cancelledRepairs: cancelled.length,
      cancellationRate: total > 0 ? (cancelled.length / total) * 100 : 0,
      avgRepairHours,
      revenue,
      laborRevenue,
      partsCost,
      laborProfit,
      warrantyClaims,
      warrantyClaimRate,
      repeatRepairs,
      inProgressRepairs: inProgress.length,
    };
  }

  async findAll(query: { startDate?: string; endDate?: string }) {
    const techs = await this.prisma.user.findMany({
      where: { role: { in: ['TECHNICIAN', 'MANAGER'] as any[] }, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        repairs: {
          select: { deliveredAt: true, receivedAt: true },
          orderBy: { receivedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    const results: TechnicianSummary[] = await Promise.all(
      techs.map(async (t) => {
        const kpi = await this.computeKpi(t.id, query.startDate, query.endDate);
        const lastRepair = t.repairs[0];
        return {
          id:          t.id,
          name:        t.name,
          email:       t.email,
          phone:       t.phone,
          isActive:    t.isActive,
          lastRepairAt: lastRepair
            ? (lastRepair.deliveredAt ?? lastRepair.receivedAt)?.toISOString() ?? null
            : null,
          kpi,
        };
      }),
    );

    // Rank by revenue desc
    const sorted = [...results].sort((a, b) => b.kpi.revenue - a.kpi.revenue);
    sorted.forEach((t, i) => { t.rank = i + 1; });

    return sorted;
  }

  async findOne(id: string, query: { startDate?: string; endDate?: string }) {
    const tech = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true },
    });
    if (!tech) return null;

    const kpi = await this.computeKpi(id, query.startDate, query.endDate);

    // Recent repairs (last 50)
    const dateWhere = this.buildDateWhere(query.startDate, query.endDate);
    const repairWhere: any = { technicianId: id };
    if (dateWhere) repairWhere.receivedAt = dateWhere;

    const recentRepairs = await this.prisma.repair.findMany({
      where: repairWhere,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });

    const daily = await this.getDailyData(id, query.startDate, query.endDate);

    return { ...tech, kpi, recentRepairs, daily };
  }

  async getDailyData(
    technicianId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DailyPoint[]> {
    const dateWhere = this.buildDateWhere(startDate, endDate);
    const repairWhere: any = { technicianId, status: 'DELIVERED' };
    if (dateWhere) repairWhere.receivedAt = dateWhere;

    const repairs = await this.prisma.repair.findMany({
      where: repairWhere,
      select: { receivedAt: true, finalCost: true },
      orderBy: { receivedAt: 'asc' },
    });

    const map = new Map<string, { repairs: number; revenue: number }>();
    for (const r of repairs) {
      const day = r.receivedAt.toISOString().slice(0, 10);
      const existing = map.get(day) ?? { repairs: 0, revenue: 0 };
      existing.repairs++;
      existing.revenue += Number(r.finalCost ?? 0);
      map.set(day, existing);
    }

    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }

  async getLeaderboard(query: { startDate?: string; endDate?: string; limit?: string }) {
    const all = await this.findAll(query);
    const limit = Math.min(20, Math.max(1, parseInt(query.limit ?? '10')));
    return all.slice(0, limit);
  }

  // Used by notifications check
  async getTechsWithHighClaimRate(
    thresholdPct: number,
    minRepairs: number,
    startDate: string,
    endDate: string,
  ) {
    const all = await this.findAll({ startDate, endDate });
    return all.filter(
      (t) => t.kpi.completedRepairs >= minRepairs && t.kpi.warrantyClaimRate >= thresholdPct,
    );
  }

  async getInactiveTechs(inactiveDays: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveDays);

    const techs = await this.prisma.user.findMany({
      where: { role: 'TECHNICIAN' as any, isActive: true },
      select: {
        id: true,
        name: true,
        repairs: {
          select: { receivedAt: true },
          orderBy: { receivedAt: 'desc' },
          take: 1,
        },
      },
    });

    return techs.filter((t) => {
      const last = t.repairs[0];
      if (!last) return true; // never assigned
      return new Date(last.receivedAt) < cutoff;
    });
  }
}
