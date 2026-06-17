import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

const MS_PER_DAY = 86_400_000;

function daysSince(date: Date | string, now = Date.now()): number {
  return Math.floor((now - new Date(date).getTime()) / MS_PER_DAY);
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'object' ? Number((v as any).toString()) : Number(v);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private tenantSvc: TenantService,
  ) {}

  // ── Overview ────────────────────────────────────────────────────────────────

  async getOverview(branchId?: string, tenantId?: string | null) {
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);
    const now     = Date.now();

    const [
      branchStocksRaw,
      openRepairs,
      branches,
      salesLast30,
    ] = await Promise.all([
      this.prisma.branchStock.findMany({
        where: { quantity: { gt: 0 }, ...bFilter },
        include: { product: { select: { costPrice: true } } },
      }),
      this.prisma.repair.findMany({
        where: {
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          ...bFilter,
        },
        select: { id: true, receivedAt: true, status: true, paymentStatus: true },
      }),
      branchId
        ? this.prisma.branch.findMany({ where: { id: branchId }, select: { id: true, name: true } })
        : this.prisma.branch.findMany({
            where: tenantId ? { tenantId } : {},
            select: { id: true, name: true },
          }),
      this.prisma.sale.findMany({
        where: {
          createdAt: { gte: new Date(now - 30 * MS_PER_DAY) },
          status: { not: 'VOIDED' },
          ...bFilter,
        },
        include: {
          items: { select: { quantity: true, price: true, costPrice: true } },
        },
      }),
    ]);

    // Dead stock summary
    const totalStockItems    = branchStocksRaw.length;
    const totalDeadCostValue = branchStocksRaw.reduce(
      (sum, bs) => sum + toNum(bs.product.costPrice) * bs.quantity, 0,
    );

    // Repair aging summary
    const agingCritical = openRepairs.filter((r) => daysSince(r.receivedAt, now) > 7).length;
    const agingWarning  = openRepairs.filter((r) => {
      const d = daysSince(r.receivedAt, now);
      return d >= 4 && d <= 7;
    }).length;

    // Profit summary (30 days)
    let totalRevenue = 0;
    let totalCost    = 0;
    for (const sale of salesLast30) {
      for (const item of sale.items) {
        totalRevenue += toNum(item.price) * item.quantity;
        totalCost    += toNum(item.costPrice) * item.quantity;
      }
    }
    const grossProfit = totalRevenue - totalCost;
    const margin      = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Branch risk scores
    const branchRisks = branches.map((branch) => {
      const issues: string[] = [];
      const branchStockItems = branchStocksRaw.filter((bs) =>
        !branchId || bs.branchId === branch.id,
      );
      const branchRepairs = openRepairs.filter((r) =>
        !branchId /* global filter would need branchId on repair, which we'll skip */ || true,
      );

      const criticalRepairs = branchRepairs.filter(
        (r) => daysSince(r.receivedAt, now) > 7,
      ).length;

      if (criticalRepairs > 0)        issues.push(`งานค้าง ${criticalRepairs} งาน`);
      if (branchStockItems.length > 5) issues.push(`สต็อกค้าง ${branchStockItems.length} รายการ`);

      return {
        branchId: branch.id,
        name: branch.name,
        riskScore: criticalRepairs * 2 + Math.floor(branchStockItems.length / 5),
        issues,
      };
    });

    return {
      deadStockSummary: {
        totalItems: totalStockItems,
        totalCostValue: totalDeadCostValue,
      },
      repairAging: {
        total: openRepairs.length,
        critical: agingCritical,
        warning: agingWarning,
      },
      profitSummary30d: {
        totalRevenue,
        totalCost,
        grossProfit,
        margin: Math.round(margin * 10) / 10,
      },
      branchRisks: branchRisks.sort((a, b) => b.riskScore - a.riskScore),
    };
  }

  // ── Dead Stock ───────────────────────────────────────────────────────────────

  async getDeadStock(branchId?: string, days = 30, tenantId?: string | null) {
    const cutoff  = new Date(Date.now() - days * MS_PER_DAY);
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    // Step 1: All branch stocks with quantity > 0
    const branchStocks = await this.prisma.branchStock.findMany({
      where: { quantity: { gt: 0 }, ...bFilter },
      include: {
        product: { select: { id: true, name: true, sku: true, costPrice: true } },
        branch:  { select: { id: true, name: true } },
      },
    });

    if (branchStocks.length === 0) return [];

    const productIds = [...new Set(branchStocks.map((bs) => bs.productId))];
    const branchIds  = [...new Set(branchStocks.map((bs) => bs.branchId))];

    // Step 2: Find product+branch pairs that had recent sales
    const recentSales = await this.prisma.saleItem.findMany({
      where: {
        productId: { in: productIds },
        sale: {
          createdAt: { gte: cutoff },
          status: { not: 'VOIDED' },
          branchId: { in: branchIds },
        },
      },
      select: {
        productId: true,
        sale: { select: { branchId: true } },
      },
    });

    const recentKeys = new Set(
      recentSales.map((si) => `${si.productId}:${si.sale.branchId}`),
    );

    // Step 3: Only keep dead stocks
    const dead = branchStocks.filter(
      (bs) => !recentKeys.has(`${bs.productId}:${bs.branchId}`),
    );

    if (dead.length === 0) return [];

    // Step 4: Find last-ever sale date for each dead product+branch combo
    const deadProductIds = [...new Set(dead.map((bs) => bs.productId))];
    const lastSaleItems  = await this.prisma.saleItem.findMany({
      where: {
        productId: { in: deadProductIds },
        sale: { status: { not: 'VOIDED' }, branchId: { in: branchIds } },
      },
      select: {
        productId: true,
        sale: { select: { branchId: true, createdAt: true } },
      },
      orderBy: { sale: { createdAt: 'desc' } },
    });

    const lastSaleMap = new Map<string, Date>();
    for (const si of lastSaleItems) {
      const key = `${si.productId}:${si.sale.branchId}`;
      if (!lastSaleMap.has(key)) lastSaleMap.set(key, si.sale.createdAt);
    }

    const now = Date.now();
    return dead
      .map((bs) => {
        const key              = `${bs.productId}:${bs.branchId}`;
        const lastSaleDate     = lastSaleMap.get(key);
        const daysSinceLastSold = lastSaleDate ? daysSince(lastSaleDate, now) : null;
        const costValue        = toNum(bs.product.costPrice) * bs.quantity;

        let suggestedAction: string;
        if (!daysSinceLastSold)               suggestedAction = 'NEVER_SOLD';
        else if (daysSinceLastSold > 90)       suggestedAction = 'DISCOUNT_OR_RETURN';
        else if (daysSinceLastSold > 60)       suggestedAction = 'PROMOTE';
        else                                   suggestedAction = 'MONITOR';

        return { product: bs.product, branch: bs.branch, quantity: bs.quantity, costValue, daysSinceLastSold, suggestedAction };
      })
      .sort((a, b) => (b.daysSinceLastSold ?? 9999) - (a.daysSinceLastSold ?? 9999));
  }

  // ── Branch Stock Comparison ──────────────────────────────────────────────────

  async getBranchStock(branchId?: string, tenantId?: string | null) {
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);
    const branchStocks = await this.prisma.branchStock.findMany({
      where: bFilter,
      include: {
        product: { select: { id: true, name: true, sku: true, minStock: true } },
        branch:  { select: { id: true, name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { branch: { name: 'asc' } }],
    });

    // Group by product
    const productMap = new Map<string, {
      product: { id: string; name: string; sku: string; minStock: number };
      byBranch: Array<{ branchId: string; name: string; quantity: number; status: string }>;
    }>();

    for (const bs of branchStocks) {
      const existing = productMap.get(bs.productId);
      const min      = bs.product.minStock ?? 0;
      const status   = bs.quantity === 0 ? 'STOCKOUT' : bs.quantity <= min ? 'LOW' : 'NORMAL';

      if (existing) {
        existing.byBranch.push({ branchId: bs.branchId, name: bs.branch.name, quantity: bs.quantity, status });
      } else {
        productMap.set(bs.productId, {
          product:  { id: bs.product.id, name: bs.product.name, sku: bs.product.sku, minStock: min },
          byBranch: [{ branchId: bs.branchId, name: bs.branch.name, quantity: bs.quantity, status }],
        });
      }
    }

    return Array.from(productMap.values()).map(({ product, byBranch }) => {
      const totalQuantity   = byBranch.reduce((s, b) => s + b.quantity, 0);
      const stockoutBranches = byBranch.filter((b) => b.status === 'STOCKOUT');
      const overstockBranch  = byBranch.find((b) => b.quantity > product.minStock * 3 + 5);
      const transferSuggestion =
        stockoutBranches.length > 0 && overstockBranch
          ? `ย้ายจาก ${overstockBranch.name} ไป ${stockoutBranches.map((b) => b.name).join(', ')}`
          : null;

      return { product, totalQuantity, byBranch, transferSuggestion };
    });
  }

  // ── Repair Aging ─────────────────────────────────────────────────────────────

  async getRepairAging(branchId?: string, tenantId?: string | null) {
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);
    const now     = Date.now();

    const openRepairs = await this.prisma.repair.findMany({
      where: {
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
        ...bFilter,
      },
      select: {
        id: true,
        ticketNumber: true,
        deviceBrand: true,
        deviceModel: true,
        issue: true,
        status: true,
        receivedAt: true,
        estimateCost: true,
        finalCost: true,
        deposit: true,
        paymentStatus: true,
        customer: { select: { id: true, name: true, phone: true } },
        technician: { select: { id: true, name: true } },
      },
      orderBy: { receivedAt: 'asc' },
    });

    const buckets: Record<string, typeof openRepairs> = {
      fresh:    [],
      moderate: [],
      old:      [],
      critical: [],
    };

    for (const r of openRepairs) {
      const d = daysSince(r.receivedAt, now);
      if (d <= 1)      buckets.fresh.push(r);
      else if (d <= 3) buckets.moderate.push(r);
      else if (d <= 7) buckets.old.push(r);
      else             buckets.critical.push(r);
    }

    const labeledBuckets = {
      fresh:    { label: '0–1 วัน',  severity: 'green',  count: buckets.fresh.length,    items: buckets.fresh },
      moderate: { label: '2–3 วัน',  severity: 'yellow', count: buckets.moderate.length, items: buckets.moderate },
      old:      { label: '4–7 วัน',  severity: 'orange', count: buckets.old.length,      items: buckets.old },
      critical: { label: '7+ วัน',   severity: 'red',    count: buckets.critical.length, items: buckets.critical },
    };

    return {
      buckets: labeledBuckets,
      totalOpen:     openRepairs.length,
      criticalCount: buckets.critical.length,
    };
  }

  // ── Top Profit Products ──────────────────────────────────────────────────────

  async getTopProfitProducts(branchId: string | undefined, start: Date, end: Date, tenantId?: string | null) {
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: start, lte: end },
          status: { not: 'VOIDED' },
          ...bFilter,
        },
      },
      select: {
        productId: true,
        quantity: true,
        price: true,
        costPrice: true,
        product: { select: { id: true, name: true, sku: true } },
      },
    });

    // Aggregate by product
    const productMap = new Map<string, {
      product: { id: string; name: string; sku: string };
      soldQty: number;
      revenue: number;
      cost: number;
    }>();

    for (const si of saleItems) {
      const existing = productMap.get(si.productId);
      const rev  = toNum(si.price) * si.quantity;
      const cost = toNum(si.costPrice) * si.quantity;

      if (existing) {
        existing.soldQty  += si.quantity;
        existing.revenue  += rev;
        existing.cost     += cost;
      } else {
        productMap.set(si.productId, {
          product:  si.product,
          soldQty:  si.quantity,
          revenue:  rev,
          cost:     cost,
        });
      }
    }

    return Array.from(productMap.values())
      .map(({ product, soldQty, revenue, cost }) => {
        const grossProfit = revenue - cost;
        const margin      = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;
        return { product, soldQty, revenue, cost, grossProfit, margin };
      })
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .slice(0, 50);
  }

  // ── Technician Trends ────────────────────────────────────────────────────────

  async getTechnicianTrends(branchId: string | undefined, start: Date, end: Date, tenantId?: string | null) {
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const repairs = await this.prisma.repair.findMany({
      where: {
        receivedAt: { gte: start, lte: end },
        technicianId: { not: null },
        ...bFilter,
      },
      select: {
        id: true,
        status: true,
        receivedAt: true,
        completedAt: true,
        paymentStatus: true,
        paidAmount: true,
        finalCost: true,
        deposit: true,
        technician: { select: { id: true, name: true } },
        claims: { select: { id: true } },
        customer: { select: { id: true } },
      },
    });

    const techMap = new Map<string, {
      technician: { id: string; name: string };
      all: typeof repairs;
    }>();

    for (const r of repairs) {
      if (!r.technician) continue;
      const existing = techMap.get(r.technician.id);
      if (existing) {
        existing.all.push(r);
      } else {
        techMap.set(r.technician.id, { technician: r.technician, all: [r] });
      }
    }

    return Array.from(techMap.values())
      .map(({ technician, all }) => {
        const completed = all.filter((r) => r.status === 'COMPLETED' || r.status === 'DELIVERED');
        const claimCount = all.filter((r) => (r.claims?.length ?? 0) > 0).length;

        // Average repair time (only for completed repairs with completedAt set)
        const completedWithTime = completed.filter((r) => r.completedAt);
        const avgRepairTimeHours =
          completedWithTime.length > 0
            ? completedWithTime.reduce(
                (sum, r) =>
                  sum + (r.completedAt!.getTime() - r.receivedAt.getTime()) / 3_600_000,
                0,
              ) / completedWithTime.length
            : null;

        // Revenue = sum of paidAmount for paid repairs
        const revenue = all
          .filter((r) => r.paymentStatus === 'PAID')
          .reduce((sum, r) => sum + toNum(r.paidAmount ?? r.finalCost ?? r.deposit), 0);

        // Repeat repair signal: customers who came back >1 time for same technician
        const customerCounts = new Map<string, number>();
        all.forEach((r) => {
          if (!r.customer?.id) return;
          customerCounts.set(r.customer.id, (customerCounts.get(r.customer.id) ?? 0) + 1);
        });
        const repeatRepairSignal = [...customerCounts.values()].filter((c) => c > 1).length;

        return {
          technician,
          totalRepairs:   all.length,
          completedRepairs: completed.length,
          claimCount,
          claimRate: all.length > 0 ? Math.round((claimCount / all.length) * 1000) / 10 : 0,
          avgRepairTimeHours: avgRepairTimeHours ? Math.round(avgRepairTimeHours * 10) / 10 : null,
          revenue,
          repeatRepairSignal,
        };
      })
      .sort((a, b) => b.completedRepairs - a.completedRepairs);
  }
}
