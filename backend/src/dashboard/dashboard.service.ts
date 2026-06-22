import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const notifWhere = params.branchId
      ? { OR: [{ branchId: params.branchId }, { branchId: null as string | null }] }
      : tenantId ? { branch: { tenantId } } : {};

    // Pre-fetch tenant user IDs for scoping AuditLog (no direct tenantId field)
    const tenantUserIds = tenantId
      ? (await this.prisma.user.findMany({ where: { tenantId }, select: { id: true } })).map((u) => u.id)
      : null;

    const [
      salesAgg,
      salesByMethod,
      repairPaymentsAgg,
      repairsByMethod,
      packageSalesAgg,
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
      weeklySales,
      weeklyRepairPmts,
      weeklyPackageSales,
      recentActivities,
      activeShift,
      pendingClaimsCount,
      overdueSupplierPoCount,
      apOutstandingAgg,
      salesByBranch,
      repairsByBranch,
      branches,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...bFilter },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...bFilter },
        _sum: { total: true },
      }),
      this.prisma.repair.aggregate({
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', ...bFilter },
        _sum: { paidAmount: true },
        _count: { id: true },
      }),
      this.prisma.repair.groupBy({
        by: ['paymentMethod'],
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', ...bFilter },
        _sum: { paidAmount: true },
      }),
      this.prisma.packageSale.aggregate({
        where: { createdAt: { gte: start, lt: end }, ...(tenantId ? { createdBy: { tenantId } } : {}) },
        _sum: { profit: true },
        _count: { id: true },
      }),
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
      // Unpaid debt: completed but not paid
      this.prisma.repair.findMany({
        where: { status: 'COMPLETED', paymentStatus: { not: 'PAID' }, ...bFilter },
        select: { finalCost: true, estimateCost: true, deposit: true },
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
      this.prisma.notification.count({ where: { isRead: false, ...notifWhere } }),
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
      // Weekly chart (always last 7 days)
      this.prisma.sale.findMany({
        where: { createdAt: { gte: weekAgoStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bFilter },
        select: { total: true, createdAt: true },
      }),
      this.prisma.repair.findMany({
        where: { paidAt: { gte: weekAgoStart, lt: todayEnd }, paymentStatus: 'PAID', ...bFilter },
        select: { paidAmount: true, paidAt: true },
      }),
      this.prisma.packageSale.findMany({
        where: { createdAt: { gte: weekAgoStart, lt: todayEnd }, ...(tenantId ? { createdBy: { tenantId } } : {}) },
        select: { profit: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: tenantUserIds ? { actorId: { in: tenantUserIds } } : {},
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
      // Branch performance (scoped to tenant)
      this.prisma.sale.groupBy({
        by: ['branchId'],
        where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...this.tenantSvc.branchScope(tenantId) },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.repair.groupBy({
        by: ['branchId'],
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', ...this.tenantSvc.branchScope(tenantId) },
        _sum: { paidAmount: true },
        _count: { id: true },
      }),
      this.prisma.branch.findMany({
        where: tenantId ? { tenantId } : {},
        select: { id: true, name: true },
      }),
    ]);

    // ── COGS (raw SQL — Prisma ORM can't SUM a product of two columns) ────────
    // Build tenant/branch filter fragment for raw queries
    const saleBranchSql: Prisma.Sql = params.branchId
      ? Prisma.sql`AND s."branchId" = ${params.branchId}`
      : tenantId
        ? Prisma.sql`AND s."branchId" IN (SELECT id FROM "Branch" WHERE "tenantId" = ${tenantId})`
        : Prisma.sql``;
    const repairBranchSql: Prisma.Sql = params.branchId
      ? Prisma.sql`AND r."branchId" = ${params.branchId}`
      : tenantId
        ? Prisma.sql`AND r."branchId" IN (SELECT id FROM "Branch" WHERE "tenantId" = ${tenantId})`
        : Prisma.sql``;

    const [posCOGSRow, repairCOGSRow] = await Promise.all([
      this.prisma.$queryRaw<[{ cogs: number }]>(Prisma.sql`
        SELECT COALESCE(SUM(si."costPrice"::float8 * si.quantity), 0) as cogs
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        WHERE s."createdAt" >= ${start}
          AND s."createdAt" < ${end}
          AND s.status != 'VOIDED'
          ${saleBranchSql}
      `),
      this.prisma.$queryRaw<[{ parts: number; labor: number }]>(Prisma.sql`
        SELECT
          COALESCE(SUM(COALESCE(rp."costPrice", rp.price)::float8 * rp.quantity), 0) as parts,
          COALESCE(SUM(r."actualLaborCost"::float8), 0)                               as labor
        FROM "Repair" r
        LEFT JOIN "RepairPart" rp ON rp."repairId" = r.id AND rp."isVoided" = false
        WHERE r."paidAt" >= ${start}
          AND r."paidAt" < ${end}
          AND r."paymentStatus" = 'PAID'
          ${repairBranchSql}
      `),
    ]);

    const posCOGS    = Number(posCOGSRow[0]?.cogs ?? 0);
    const repairCOGS = Number(repairCOGSRow[0]?.parts ?? 0) + Number(repairCOGSRow[0]?.labor ?? 0);

    // ── Financial ─────────────────────────────────────────────────────────────
    const salesRevenue   = Number(salesAgg._sum.total ?? 0);
    const repairRevenue  = Number(repairPaymentsAgg._sum.paidAmount ?? 0);
    const packageRevenue = Number(packageSalesAgg._sum.profit ?? 0);
    const totalRevenue   = salesRevenue + repairRevenue + packageRevenue;
    const totalExpenses  = Number(expensesAgg._sum.amount ?? 0);
    const grossProfit    = (salesRevenue - posCOGS) + (repairRevenue - repairCOGS) + packageRevenue;

    const cashIn =
      Number(salesByMethod.find(r => r.paymentMethod === 'CASH')?._sum.total ?? 0) +
      Number(repairsByMethod.find(r => r.paymentMethod === 'CASH')?._sum.paidAmount ?? 0);
    const transferIn =
      Number(salesByMethod.find(r => r.paymentMethod === 'TRANSFER')?._sum.total ?? 0) +
      Number(repairsByMethod.find(r => r.paymentMethod === 'TRANSFER')?._sum.paidAmount ?? 0);

    // ── Unpaid debt ────────────────────────────────────────────────────────────
    const unpaidDebtTotal = unpaidDebtRepairs.reduce((sum, r) => {
      const cost = Number(r.finalCost ?? r.estimateCost ?? 0);
      const paid = Number(r.deposit ?? 0);
      return sum + Math.max(0, cost - paid);
    }, 0);
    const unpaidDebtCount = unpaidDebtRepairs.length;

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
    weeklySales.forEach(s => {
      const e = weeklyMap.get(toThaiDate(s.createdAt));
      if (e) e.sales += Number(s.total);
    });
    weeklyRepairPmts.forEach(r => {
      if (!r.paidAt) return;
      const e = weeklyMap.get(toThaiDate(r.paidAt));
      if (e) e.repairs += Number(r.paidAmount ?? 0);
    });
    weeklyPackageSales.forEach(p => {
      const e = weeklyMap.get(toThaiDate(p.createdAt));
      if (e) e.packages += Number(p.profit);
    });
    const weeklyRevenue = Array.from(weeklyMap.entries()).map(([date, v]) => ({
      date,
      sales: v.sales,
      repairs: v.repairs,
      packages: v.packages,
      total: v.sales + v.repairs + v.packages,
    }));

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
    const branchMap      = new Map(branches.map(b => [b.id, b.name]));
    const branchSalesMap = new Map(salesByBranch.map(s => [s.branchId ?? '', Number(s._sum.total ?? 0)]));
    const branchRepMap   = new Map(repairsByBranch.map(r => [r.branchId ?? '', Number(r._sum.paidAmount ?? 0)]));
    const allBranchIds   = new Set([
      ...salesByBranch.map(s => s.branchId ?? ''),
      ...repairsByBranch.map(r => r.branchId ?? ''),
    ]);
    const branchPerformance = isOwner
      ? Array.from(allBranchIds)
          .map(bid => ({
            branchId:      bid,
            name:          bid ? (branchMap.get(bid) ?? 'ไม่ระบุสาขา') : 'ไม่ระบุสาขา',
            salesRevenue:  branchSalesMap.get(bid) ?? 0,
            repairRevenue: branchRepMap.get(bid) ?? 0,
            totalRevenue:  (branchSalesMap.get(bid) ?? 0) + (branchRepMap.get(bid) ?? 0),
          }))
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
      : [];

    return {
      period: { startDate: startDateStr, endDate: endDateStr },
      finance: {
        totalRevenue,
        salesRevenue,
        salesCount:    salesAgg._count.id,
        repairRevenue,
        repairCount:   repairPaymentsAgg._count.id,
        packageRevenue,
        packageCount:  packageSalesAgg._count.id,
        totalExpenses,
        // COGS and profit — mirrors /reports/profit calculation exactly
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
        outOfStock:          outOfStockCount,
        lowStock:            lowStockCount,
        expiringWarranties:  expiringWarrantyCount,
        pendingClaims:       pendingClaimsCount,
        overdueSuppliers:    overdueSupplierPoCount,
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
      todaySalesAgg, todayRepairAgg, todayExpensesAgg,
      newCustomersCount,
      monthlySalesAgg, monthlyRepairAgg, monthlyExpensesAgg,
      openRepairCount, overdueRepairCount, unpaidDebtRepairs,
      outOfStockCount, lowStockResult,
      recentSales,
      pastWeekSalesAgg,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bScope },
        _sum: { total: true },
      }),
      this.prisma.repair.aggregate({
        where: { paidAt: { gte: todayStart, lt: todayEnd }, paymentStatus: 'PAID', ...bScope },
        _sum: { paidAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: todayStart, lt: todayEnd }, voidedAt: null, ...bScope },
        _sum: { amount: true },
      }),
      this.prisma.customer.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd }, ...tScope },
      }),
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: monthStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bScope },
        _sum: { total: true },
      }),
      this.prisma.repair.aggregate({
        where: { paidAt: { gte: monthStart, lt: todayEnd }, paymentStatus: 'PAID', ...bScope },
        _sum: { paidAmount: true },
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
        where: { status: 'COMPLETED', paymentStatus: { not: 'PAID' }, ...bScope },
        select: { finalCost: true, estimateCost: true, deposit: true },
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
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: weekAgoStart, lt: todayStart }, status: { not: 'VOIDED' }, ...bScope },
        _sum: { total: true },
      }),
    ]);

    // COGS queries for today and this month (mirrors /reports/profit calculation)
    const saleBSql: Prisma.Sql = tenantId
      ? Prisma.sql`AND s."branchId" IN (SELECT id FROM "Branch" WHERE "tenantId" = ${tenantId})`
      : Prisma.sql``;
    const repairBSql: Prisma.Sql = tenantId
      ? Prisma.sql`AND r."branchId" IN (SELECT id FROM "Branch" WHERE "tenantId" = ${tenantId})`
      : Prisma.sql``;

    const [todayPosCOGSRow, todayRepairCOGSRow, monthlyPosCOGSRow, monthlyRepairCOGSRow] = await Promise.all([
      this.prisma.$queryRaw<[{ cogs: number }]>(Prisma.sql`
        SELECT COALESCE(SUM(si."costPrice"::float8 * si.quantity), 0) as cogs
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        WHERE s."createdAt" >= ${todayStart} AND s."createdAt" < ${todayEnd}
          AND s.status != 'VOIDED' ${saleBSql}
      `),
      this.prisma.$queryRaw<[{ parts: number; labor: number }]>(Prisma.sql`
        SELECT
          COALESCE(SUM(COALESCE(rp."costPrice", rp.price)::float8 * rp.quantity), 0) as parts,
          COALESCE(SUM(r."actualLaborCost"::float8), 0)                               as labor
        FROM "Repair" r
        LEFT JOIN "RepairPart" rp ON rp."repairId" = r.id AND rp."isVoided" = false
        WHERE r."paidAt" >= ${todayStart} AND r."paidAt" < ${todayEnd}
          AND r."paymentStatus" = 'PAID' ${repairBSql}
      `),
      this.prisma.$queryRaw<[{ cogs: number }]>(Prisma.sql`
        SELECT COALESCE(SUM(si."costPrice"::float8 * si.quantity), 0) as cogs
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        WHERE s."createdAt" >= ${monthStart} AND s."createdAt" < ${todayEnd}
          AND s.status != 'VOIDED' ${saleBSql}
      `),
      this.prisma.$queryRaw<[{ parts: number; labor: number }]>(Prisma.sql`
        SELECT
          COALESCE(SUM(COALESCE(rp."costPrice", rp.price)::float8 * rp.quantity), 0) as parts,
          COALESCE(SUM(r."actualLaborCost"::float8), 0)                               as labor
        FROM "Repair" r
        LEFT JOIN "RepairPart" rp ON rp."repairId" = r.id AND rp."isVoided" = false
        WHERE r."paidAt" >= ${monthStart} AND r."paidAt" < ${todayEnd}
          AND r."paymentStatus" = 'PAID' ${repairBSql}
      `),
    ]);

    const todayPosCOGS    = Number(todayPosCOGSRow[0]?.cogs ?? 0);
    const todayRepairCOGS = Number(todayRepairCOGSRow[0]?.parts ?? 0) + Number(todayRepairCOGSRow[0]?.labor ?? 0);
    const monthlyPosCOGS    = Number(monthlyPosCOGSRow[0]?.cogs ?? 0);
    const monthlyRepairCOGS = Number(monthlyRepairCOGSRow[0]?.parts ?? 0) + Number(monthlyRepairCOGSRow[0]?.labor ?? 0);

    const todaySalesRevenue  = Number(todaySalesAgg._sum.total ?? 0);
    const todayRepairRevenue = Number(todayRepairAgg._sum.paidAmount ?? 0);
    const todayRevenue       = todaySalesRevenue + todayRepairRevenue;
    const todayExpenses      = Number(todayExpensesAgg._sum.amount ?? 0);
    const todayGrossProfit   = (todaySalesRevenue - todayPosCOGS) + (todayRepairRevenue - todayRepairCOGS);

    const monthlySalesRevenue  = Number(monthlySalesAgg._sum.total ?? 0);
    const monthlyRepairRevenue = Number(monthlyRepairAgg._sum.paidAmount ?? 0);
    const monthlyRevenue       = monthlySalesRevenue + monthlyRepairRevenue;
    const monthlyExpenses      = Number(monthlyExpensesAgg._sum.amount ?? 0);
    const monthlyGrossProfit   = (monthlySalesRevenue - monthlyPosCOGS) + (monthlyRepairRevenue - monthlyRepairCOGS);

    const unpaidDebtCount = unpaidDebtRepairs.length;
    const lowStockCount   = Number((lowStockResult as [{ count: bigint }])[0]?.count ?? 0);

    const past6DaysSalesTotal = Number(pastWeekSalesAgg._sum.total ?? 0);
    const avgDailySales       = past6DaysSalesTotal / 6;

    return {
      today: {
        salesRevenue:  todaySalesRevenue,
        repairRevenue: todayRepairRevenue,
        totalRevenue:  todayRevenue,
        posCOGS:       todayPosCOGS,
        repairCOGS:    todayRepairCOGS,
        totalCOGS:     todayPosCOGS + todayRepairCOGS,
        grossProfit:   todayGrossProfit,
        totalExpenses: todayExpenses,
        netProfit:     todayGrossProfit - todayExpenses,
        newCustomers:  newCustomersCount,
      },
      monthly: {
        salesRevenue:  monthlySalesRevenue,
        repairRevenue: monthlyRepairRevenue,
        totalRevenue:  monthlyRevenue,
        posCOGS:       monthlyPosCOGS,
        repairCOGS:    monthlyRepairCOGS,
        totalCOGS:     monthlyPosCOGS + monthlyRepairCOGS,
        grossProfit:   monthlyGrossProfit,
        totalExpenses: monthlyExpenses,
        netProfit:     monthlyGrossProfit - monthlyExpenses,
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
