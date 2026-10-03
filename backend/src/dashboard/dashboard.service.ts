import { Injectable } from '@nestjs/common';
import { unreadSince } from '../notifications/notifications.service';
import { loadPeriodMoney, summarizeMoney, bangkokDay, MoneyRow } from '../common/money/period-money';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

interface OverviewParams {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  isOwner?: boolean;
  tenantId?: string | null;
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private tenantSvc: TenantService,
  ) {}

  async getOverview(params: OverviewParams) {
    const { isOwner = false, tenantId } = params;
    const now = new Date();
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = thaiNow.toISOString().slice(0, 10);

    const startDateStr = params.startDate || todayStr;
    const endDateStr   = params.endDate   || todayStr;

    const start = new Date(`${startDateStr}T00:00:00+07:00`);
    const end   = new Date(`${endDateStr}T00:00:00+07:00`);
    end.setTime(end.getTime() + 24 * 60 * 60 * 1000);

    // Weekly chart always uses last 7 days from today
    const todayStart   = new Date(`${todayStr}T00:00:00+07:00`);
    const todayEnd     = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekAgoStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const toThaiDate = (d: Date) =>
      new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const bFilter = params.branchId
      ? { branchId: params.branchId }
      : this.tenantSvc.branchScope(tenantId);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // When tenantId is null (SUPER_ADMIN), scope to nothing — SUPER_ADMIN should use /super-admin
    // Always tenant-scoped: the branch filter alone also matched other shops' branch-less
    // notifications. Personal notifications (userId set) belong to the bell of that user only,
    // and the badge counts the last UNREAD_WINDOW_DAYS so old alerts do not pile up to 99+.
    const notifWhere = !tenantId
      ? { id: 'no-tenant-scope' }
      : {
          tenantId,
          userId: null as string | null,
          ...(params.branchId ? { OR: [{ branchId: params.branchId }, { branchId: null as string | null }] } : {}),
        };

    // Pre-fetch tenant user IDs for scoping AuditLog (no direct tenantId field)
    const tenantUserIds = tenantId
      ? (await this.prisma.user.findMany({ where: { tenantId }, select: { id: true } })).map((u) => u.id)
      : null;

    const [
      expensesAgg,
      repairsByStatus,
      overdueCount,
      unpaidDebtRepairs,
      outOfStockCount,
      lowStockResult,
      activeWarrantyCount,
      expiringWarrantyCount,
      unreadNotifCount,
      latestNotifs,
      topProductGroups,
      techRepairGroups,
      recentActivities,
      activeShift,
      pendingClaimsCount,
      overdueSupplierPoCount,
      apOutstandingAgg,
      pendingReceivePoCount,
      openRepairsByBranch,
      overdueRepairsByBranch,
      branches,
    ] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: start, lt: end }, voidedAt: null, ...bFilter },
        _sum: { amount: true },
      }),
      // Current repair state (not date-filtered)
      this.prisma.repair.groupBy({
        by: ['status'],
        where: { status: { notIn: ['DELIVERED', 'CANCELLED'] }, ...bFilter },
        _count: { id: true },
      }),
      this.prisma.repair.count({
        where: {
          dueDate: { lt: now },
          status: { notIn: ['DELIVERED', 'CANCELLED', 'COMPLETED'] },
          ...bFilter,
        },
      }),
      // Unpaid debt: handed over without full payment — same rule as /repairs/outstanding (the
      // หนี้ค้างชำระ page). Completed-but-not-collected repairs are counted in unpaidRepairs instead.
      this.prisma.repair.findMany({
        where: { status: 'DELIVERED', paymentStatus: { in: ['PENDING', 'PARTIAL'] }, ...bFilter },
        select: {
          finalCost: true, estimateCost: true, deposit: true, paidAmount: true,
          additionalPayments: { select: { amount: true } },
        },
      }),
      this.prisma.product.count({ where: { isActive: true, stock: 0, ...this.tenantSvc.scope(tenantId) } }),
      tenantId
        ? this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "Product"
            WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock" AND "tenantId" = ${tenantId}`
        : this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "Product"
            WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock"`,
      this.prisma.warranty.count({ where: { status: 'ACTIVE', ...(tenantId ? { customer: { tenantId } } : {}) } }),
      this.prisma.warranty.count({
        where: { status: 'ACTIVE', endDate: { gte: now, lte: sevenDaysFromNow }, ...(tenantId ? { customer: { tenantId } } : {}) },
      }),
      this.prisma.notification.count({ where: { isRead: false, createdAt: { gte: unreadSince() }, ...notifWhere } }),
      this.prisma.notification.findMany({
        where: { isRead: false, ...notifWhere },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, type: true, title: true, message: true,
          severity: true, createdAt: true, entityType: true, entityId: true,
        },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: { sale: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...bFilter } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      this.prisma.repair.groupBy({
        by: ['technicianId'],
        where: {
          paidAt: { gte: start, lt: end },
          paymentStatus: 'PAID',
          technicianId: { not: null },
          ...bFilter,
        },
        _count: { id: true },
        _sum: { paidAmount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 3,
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: { in: tenantUserIds ?? [] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, entityType: true, actorName: true, createdAt: true },
      }),
      this.prisma.shift.findFirst({
        where: { isActive: true, ...(tenantId ? { user: { tenantId } } : {}) },
        include: { user: { select: { name: true, role: true } } },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.claim.count({
        where: {
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          ...(tenantId ? { serialNumber: { product: { tenantId } } } : {}),
        },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          dueDate: { lt: now }, paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' },
          ...(tenantId ? { supplier: { tenantId } } : {}),
        },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' },
          ...(tenantId ? { supplier: { tenantId } } : {}),
        },
        _sum: { total: true, paidTotal: true },
      }),
      // POs waiting to receive goods — branch-scoped for staff, tenant-scoped for owner
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['ORDERED', 'PARTIAL_RECEIVED'] },
          ...(tenantId ? { supplier: { tenantId } } : {}),
          ...(params.branchId ? { branchId: params.branchId } : {}),
        },
      }),
      // Per-branch open repairs (current state, not date-filtered)
      this.prisma.repair.groupBy({
        by: ['branchId'],
        where: { status: { notIn: ['DELIVERED', 'CANCELLED'] }, ...this.tenantSvc.branchScope(tenantId) },
        _count: { id: true },
      }),
      // Per-branch overdue repairs
      this.prisma.repair.groupBy({
        by: ['branchId'],
        where: {
          dueDate: { lt: now },
          status: { notIn: ['DELIVERED', 'CANCELLED', 'COMPLETED'] },
          ...this.tenantSvc.branchScope(tenantId),
        },
        _count: { id: true },
      }),
      this.prisma.branch.findMany({
        where: tenantId ? { tenantId } : {},
        select: { id: true, name: true },
      }),
    ]);

    // ── Money (shared with /reports/profit and daily closing) ─────────────────
    const rangeStart = new Date(Math.min(start.getTime(), weekAgoStart.getTime()));
    const rangeEnd   = new Date(Math.max(end.getTime(), todayEnd.getTime()));
    const moneyRows = await loadPeriodMoney(this.prisma, {
      start: rangeStart, end: rangeEnd, branchWhere: bFilter, branchId: params.branchId, tenantId,
    });
    const inPeriod = (r: MoneyRow) => r.date >= start && r.date < end;
    const money = summarizeMoney(moneyRows, inPeriod);

    const salesRevenue   = money.posRevenue;
    const repairRevenue  = money.repairRevenue;
    const packageRevenue = money.packageProfit;
    const totalRevenue   = money.totalRevenue;
    const totalExpenses  = Number(expensesAgg._sum.amount ?? 0);
    const posCOGS        = money.posCOGS;
    const repairCOGS     = money.repairCOGS;
    const grossProfit    = money.grossProfit;
    const cashIn         = money.byMethod['CASH'] ?? 0;
    const transferIn     = money.byMethod['TRANSFER'] ?? 0;

    // ── Unpaid debt ────────────────────────────────────────────────────────────
    const debtRemaining = unpaidDebtRepairs.map((r) => {
      const cost = Number(r.finalCost ?? r.estimateCost ?? 0);
      const paid = Number(r.deposit ?? 0) + Number(r.paidAmount ?? 0)
        + r.additionalPayments.reduce((s, p) => s + Number(p.amount), 0);
      return Math.max(0, cost - paid);
    }).filter((owed) => owed > 0);
    const unpaidDebtTotal = debtRemaining.reduce((sum, owed) => sum + owed, 0);
    const unpaidDebtCount = debtRemaining.length;

    // ── Stock ─────────────────────────────────────────────────────────────────
    const lowStockCount = Number((lowStockResult as [{ count: bigint }])[0]?.count ?? 0);

    // ── Repair ops ────────────────────────────────────────────────────────────
    const statusMap = Object.fromEntries(repairsByStatus.map(r => [r.status, r._count.id]));
    const openRepairs = Object.values(statusMap).reduce((a, b) => a + b, 0);

    // ── AP ────────────────────────────────────────────────────────────────────
    const apOutstanding =
      Number(apOutstandingAgg._sum.total ?? 0) - Number(apOutstandingAgg._sum.paidTotal ?? 0);

    // ── Weekly chart ──────────────────────────────────────────────────────────
    const weeklyMap = new Map<string, { sales: number; repairs: number; packages: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgoStart.getTime() + i * 24 * 60 * 60 * 1000);
      weeklyMap.set(toThaiDate(d), { sales: 0, repairs: 0, packages: 0 });
    }
    const weeklyRevenue = Array.from(weeklyMap.keys()).map((date) => {
      const day = summarizeMoney(moneyRows, (r) => bangkokDay(r.date) === date);
      return {
        date,
        sales: day.posRevenue,
        repairs: day.repairRevenue,
        packages: day.packageProfit,
        total: day.totalRevenue,
      };
    });

    // ── Top products ──────────────────────────────────────────────────────────
    const productIds = topProductGroups.map(p => p.productId);
    const productRows = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const productMap = new Map(productRows.map(p => [p.id, p]));
    const topProducts = topProductGroups.map(p => ({
      name: productMap.get(p.productId)?.name ?? 'Unknown',
      sku:  productMap.get(p.productId)?.sku  ?? '',
      qty:  Number(p._sum.quantity ?? 0),
      revenue: Number(p._sum.total ?? 0),
    }));

    // ── Top technicians ───────────────────────────────────────────────────────
    const techIds = techRepairGroups
      .filter(r => r.technicianId)
      .map(r => r.technicianId as string);
    const techUsers = techIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: techIds } },
          select: { id: true, name: true },
        })
      : [];
    const techUserMap = new Map(techUsers.map(u => [u.id, u]));
    const topTechnicians = techRepairGroups
      .filter(r => r.technicianId)
      .map(r => ({
        id:            r.technicianId!,
        name:          techUserMap.get(r.technicianId!)?.name ?? 'Unknown',
        repairCount:   r._count.id,
        repairRevenue: Number(r._sum.paidAmount ?? 0),
      }));

    // ── Branch performance ────────────────────────────────────────────────────
    const branchMap        = new Map(branches.map(b => [b.id, b.name]));
    const branchMoney      = (bid: string) => summarizeMoney(moneyRows, (r) => inPeriod(r) && r.branchId === bid);
    const branchOpenMap    = new Map(openRepairsByBranch.map(r => [r.branchId ?? '', r._count.id]));
    const branchOverdueMap = new Map(overdueRepairsByBranch.map(r => [r.branchId ?? '', r._count.id]));
    // Include ALL registered branches, even those with zero activity today
    const allBranchIds = new Set(branches.map(b => b.id));
    const branchPerformance = isOwner
      ? Array.from(allBranchIds)
          .filter(bid => bid) // exclude empty-string placeholder
          .map(bid => {
            const overdueRepairs = branchOverdueMap.get(bid) ?? 0;
            const openRepairs    = branchOpenMap.get(bid) ?? 0;
            const health: 'NORMAL' | 'WARNING' | 'CRITICAL' =
              overdueRepairs > 0 ? 'CRITICAL' : openRepairs > 5 ? 'WARNING' : 'NORMAL';
            const bm = branchMoney(bid);
            return {
              branchId:      bid,
              name:          branchMap.get(bid) ?? 'ไม่ระบุสาขา',
              salesRevenue:  bm.posRevenue,
              repairRevenue: bm.repairRevenue,
              totalRevenue:  bm.posRevenue + bm.repairRevenue,
              openRepairs,
              overdueRepairs,
              health,
            };
          })
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
      : [];

    return {
      period: { startDate: startDateStr, endDate: endDateStr },
      finance: {
        totalRevenue,
        salesRevenue,
        salesCount:    money.salesCount,
        salesRefunds:  money.posRefunds,
        repairRevenue,
        repairCount:   money.repairPaymentCount,
        repairDeposits:     money.repairDeposits,
        repairDebtPayments: money.repairDebtPayments,
        packageRevenue,
        packageCount:  money.packageCount,
        totalExpenses,
        // COGS and profit — same calculation as /reports/profit (common/money/period-money.ts)
        posCOGS,
        repairCOGS,
        grossProfit,
        netProfit: grossProfit - totalExpenses,
        cashIn,
        transferIn,
      },
      repairOps: {
        openRepairs,
        waitingApproval:       statusMap['WAITING_APPROVAL'] ?? 0,
        waitingParts:          statusMap['WAITING_PARTS'] ?? 0,
        inProgress:            (statusMap['IN_PROGRESS'] ?? 0) + (statusMap['APPROVED'] ?? 0),
        completedNotDelivered: statusMap['COMPLETED'] ?? 0,
        overdueRepairs:        overdueCount,
        unpaidDebtTotal,
        unpaidDebtCount,
      },
      stock: { outOfStock: outOfStockCount, lowStock: lowStockCount },
      warranties: { active: activeWarrantyCount, expiringSoon: expiringWarrantyCount },
      notifications: { unreadCount: unreadNotifCount, latest: latestNotifs },
      topProducts,
      topTechnicians,
      branchPerformance,
      weeklyRevenue,
      recentActivities,
      currentShift: activeShift
        ? {
            isOpen:      true,
            openedAt:    activeShift.openedAt,
            userName:    activeShift.user.name,
            userRole:    activeShift.user.role,
            openBalance: Number(activeShift.openBalance),
          }
        : { isOpen: false, openedAt: null, userName: null, userRole: null, openBalance: 0 },
      alerts: {
        overdueRepairs:      overdueCount,
        unpaidRepairs:       statusMap['COMPLETED'] ?? 0,
        unpaidDebt:          unpaidDebtTotal,
        unpaidDebtCount,
        outOfStock:          outOfStockCount,
        lowStock:            lowStockCount,
        expiringWarranties:  expiringWarrantyCount,
        pendingClaims:       pendingClaimsCount,
        overdueSuppliers:    overdueSupplierPoCount,
        pendingReceivePo:    pendingReceivePoCount,
        apOutstanding,
      },
    };
  }

  // ── Owner Summary ─────────────────────────────────────────────────────────────
  async getOwnerSummary(tenantId?: string | null) {
    const now      = new Date();
    const thaiNow  = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = thaiNow.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7) + '-01';

    const todayStart   = new Date(`${todayStr}T00:00:00+07:00`);
    const todayEnd     = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const monthStart   = new Date(`${monthStr}T00:00:00+07:00`);
    const weekAgoStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const bScope = this.tenantSvc.branchScope(tenantId);
    const tScope = this.tenantSvc.scope(tenantId);

    const [
      todayExpensesAgg,
      newCustomersCount,
      monthlyExpensesAgg,
      openRepairCount, overdueRepairCount, unpaidDebtRepairs,
      outOfStockCount, lowStockResult,
      recentSales,
    ] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: todayStart, lt: todayEnd }, voidedAt: null, ...bScope },
        _sum: { amount: true },
      }),
      this.prisma.customer.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd }, ...tScope },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: monthStart, lt: todayEnd }, voidedAt: null, ...bScope },
        _sum: { amount: true },
      }),
      this.prisma.repair.count({
        where: { status: { notIn: ['DELIVERED', 'CANCELLED'] }, ...bScope },
      }),
      this.prisma.repair.count({
        where: { dueDate: { lt: now }, status: { notIn: ['DELIVERED', 'CANCELLED', 'COMPLETED'] }, ...bScope },
      }),
      this.prisma.repair.findMany({
        where: { status: 'DELIVERED', paymentStatus: { in: ['PENDING', 'PARTIAL'] }, ...bScope },
        select: {
          finalCost: true, estimateCost: true, deposit: true, paidAmount: true,
          additionalPayments: { select: { amount: true } },
        },
      }),
      this.prisma.product.count({ where: { isActive: true, stock: 0, ...tScope } }),
      tenantId
        ? this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "Product"
            WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock" AND "tenantId" = ${tenantId}
          `
        : this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM "Product"
            WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock"
          `,
      this.prisma.sale.findMany({
        where: { status: { not: 'VOIDED' }, ...bScope },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, receiptNumber: true, total: true,
          paymentMethod: true, createdAt: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    // Same money rules as getOverview / reports (common/money/period-money.ts)
    const moneyRows = await loadPeriodMoney(this.prisma, {
      start: new Date(Math.min(monthStart.getTime(), weekAgoStart.getTime())), end: todayEnd,
      branchWhere: bScope, tenantId,
    });
    const today   = summarizeMoney(moneyRows, (r) => r.date >= todayStart && r.date < todayEnd);
    const monthly = summarizeMoney(moneyRows, (r) => r.date >= monthStart && r.date < todayEnd);
    const pastWeek = summarizeMoney(moneyRows, (r) => r.date >= weekAgoStart && r.date < todayStart);

    const todaySalesRevenue  = today.posRevenue;
    const todayRevenue       = today.totalRevenue;
    const todayExpenses      = Number(todayExpensesAgg._sum.amount ?? 0);
    const monthlyExpenses    = Number(monthlyExpensesAgg._sum.amount ?? 0);

    const unpaidDebtCount = unpaidDebtRepairs.filter((r) =>
      Number(r.finalCost ?? r.estimateCost ?? 0) - Number(r.deposit ?? 0) - Number(r.paidAmount ?? 0)
        - r.additionalPayments.reduce((sum, p) => sum + Number(p.amount), 0) > 0,
    ).length;
    const lowStockCount   = Number((lowStockResult as [{ count: bigint }])[0]?.count ?? 0);

    const past6DaysSalesTotal = pastWeek.posRevenue;
    const avgDailySales       = past6DaysSalesTotal / 6;

    return {
      today: {
        salesRevenue:  today.posRevenue,
        salesRefunds:  today.posRefunds,
        repairRevenue: today.repairRevenue,
        packageRevenue: today.packageProfit,
        totalRevenue:  today.totalRevenue,
        posCOGS:       today.posCOGS,
        repairCOGS:    today.repairCOGS,
        totalCOGS:     today.posCOGS + today.repairCOGS,
        grossProfit:   today.grossProfit,
        totalExpenses: todayExpenses,
        netProfit:     today.grossProfit - todayExpenses,
        newCustomers:  newCustomersCount,
      },
      monthly: {
        salesRevenue:  monthly.posRevenue,
        salesRefunds:  monthly.posRefunds,
        repairRevenue: monthly.repairRevenue,
        packageRevenue: monthly.packageProfit,
        totalRevenue:  monthly.totalRevenue,
        posCOGS:       monthly.posCOGS,
        repairCOGS:    monthly.repairCOGS,
        totalCOGS:     monthly.posCOGS + monthly.repairCOGS,
        grossProfit:   monthly.grossProfit,
        totalExpenses: monthlyExpenses,
        netProfit:     monthly.grossProfit - monthlyExpenses,
      },
      recentSales: recentSales.map(s => ({
        id:            s.id,
        receiptNumber: s.receiptNumber,
        total:         Number(s.total),
        paymentMethod: s.paymentMethod,
        createdAt:     s.createdAt,
        customerName:  s.customer?.name ?? null,
      })),
      health: {
        abnormalPendingRepairs: openRepairCount > 10 || overdueRepairCount > 0,
        hasLowStock:            lowStockCount > 0 || outOfStockCount > 0,
        highExpenses:           todayRevenue > 0 && todayExpenses > todayRevenue * 0.6,
        belowAverageSales:      avgDailySales > 100 && todaySalesRevenue < avgDailySales * 0.7,
        hasOutstandingDebt:     unpaidDebtCount > 0,
      },
      repairStats: {
        openRepairs:    openRepairCount,
        overdueRepairs: overdueRepairCount,
        unpaidDebtCount,
        outOfStock:     outOfStockCount,
        lowStock:       lowStockCount,
      },
    };
  }
}
