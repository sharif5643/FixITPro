import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthlyBuckets(months: number): Map<string, number> {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    map.set(monthKey(d), 0);
  }
  return map;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const oneYearAgo   = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const [
      recentPayments,
      yearPayments,
      newTenantRows,
      planDist,
      totalRevenueAgg,
      tenantStats,
    ] = await Promise.all([
      // MRR: revenue from activated payments in last 30 days
      this.prisma.tenantPayment.findMany({
        where: { activatedAt: { not: null, gte: thirtyDaysAgo }, paymentAmount: { not: null } },
        select: { paymentAmount: true },
      }),

      // Revenue by month (last 12 months)
      this.prisma.tenantPayment.findMany({
        where: { activatedAt: { not: null, gte: oneYearAgo }, paymentAmount: { not: null } },
        select: { paymentAmount: true, activatedAt: true },
      }),

      // New tenants per month (last 12 months)
      this.prisma.tenant.findMany({
        where: { createdAt: { gte: oneYearAgo } },
        select: { createdAt: true },
      }),

      // Plan distribution of active tenants
      this.prisma.tenant.groupBy({
        by: ['plan'],
        where: { status: 'ACTIVE' },
        _count: true,
      }),

      // Total revenue all time
      this.prisma.tenantPayment.aggregate({
        where: { activatedAt: { not: null } },
        _sum: { paymentAmount: true },
      }),

      // Tenant status counts
      this.prisma.tenant.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    // MRR = sum of revenue in last 30 days
    const mrr = recentPayments.reduce((s, p) => s + Number(p.paymentAmount ?? 0), 0);

    // Revenue by month (12 buckets)
    const revBuckets = buildMonthlyBuckets(12);
    for (const p of yearPayments) {
      const key = monthKey(new Date(p.activatedAt!));
      if (revBuckets.has(key)) {
        revBuckets.set(key, revBuckets.get(key)! + Number(p.paymentAmount ?? 0));
      }
    }
    const revenueByMonth = Array.from(revBuckets.entries()).map(([month, revenue]) => ({ month, revenue }));

    // New tenants by month (12 buckets)
    const tenantBuckets = buildMonthlyBuckets(12);
    for (const t of newTenantRows) {
      const key = monthKey(new Date(t.createdAt));
      if (tenantBuckets.has(key)) {
        tenantBuckets.set(key, tenantBuckets.get(key)! + 1);
      }
    }
    const tenantsByMonth = Array.from(tenantBuckets.entries()).map(([month, count]) => ({ month, count }));

    const planDistribution = planDist.map((p) => ({ plan: p.plan, count: p._count }));

    const totalRevenue = Number(totalRevenueAgg._sum.paymentAmount ?? 0);

    const statusMap: Record<string, number> = {};
    for (const s of tenantStats) {
      statusMap[s.status] = s._count;
    }

    return {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      revenueByMonth,
      tenantsByMonth,
      planDistribution,
      tenantStatusCounts: statusMap,
    };
  }
}
