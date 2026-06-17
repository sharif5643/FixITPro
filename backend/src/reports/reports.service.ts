import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private tenantSvc: TenantService,
  ) {}

  async getDailyReport(date: string, branchId?: string, tenantId?: string | null) {
    // Use Thai timezone (UTC+7) so midnight-to-midnight matches the shop's day
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const [sales, voidedSales, packageSales, repairs, stockIn, repairPayments, supplierPayments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...bFilter },
        include: {
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
          user: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.sale.findMany({
        where: { voidedAt: { gte: start, lt: end }, status: 'VOIDED', ...bFilter },
        select: {
          id: true, receiptNumber: true, total: true, voidReason: true,
          voidedAt: true, voidedBy: { select: { name: true } },
          user: { select: { name: true } },
        },
        orderBy: { voidedAt: 'asc' },
      }),
      this.prisma.packageSale.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: {
          id: true, receiptNumber: true, carrier: true, packageAmount: true,
          walletDeduction: true, profit: true, paymentMethod: true,
          createdAt: true, createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.repair.findMany({
        where: { receivedAt: { gte: start, lt: end }, ...bFilter },
        include: {
          customer: { select: { name: true, phone: true } },
          technician: { select: { name: true } },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { createdAt: { gte: start, lt: end }, type: 'IN', ...(branchId ? { branchId } : {}) },
        include: { product: { select: { name: true, sku: true } } },
      }),
      this.prisma.repair.findMany({
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', ...bFilter },
        select: { id: true, ticketNumber: true, paidAmount: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: { paidAt: { gte: start, lt: end } },
        include: {
          purchaseOrder: {
            select: { poNumber: true, supplier: { select: { name: true } } },
          },
        },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalDiscount = sales.reduce((sum, s) => sum + Number(s.discount), 0);

    const paymentBreakdown = sales.reduce(
      (acc, s) => {
        acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + Number(s.total);
        return acc;
      },
      {} as Record<string, number>,
    );

    const repairRevenue = repairPayments.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0);
    const repairPaymentBreakdown = repairPayments.reduce(
      (acc, r) => {
        const m = r.paymentMethod ?? 'CASH';
        acc[m] = (acc[m] || 0) + Number(r.paidAmount ?? 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalExpenses = supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const expenseBreakdown = supplierPayments.reduce(
      (acc, p) => {
        acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + Number(p.amount);
        return acc;
      },
      {} as Record<string, number>,
    );

    const packageRevenue = packageSales.reduce((sum, p) => sum + Number(p.profit), 0);
    const packageTotal = packageSales.reduce((sum, p) => sum + Number(p.packageAmount), 0);

    return {
      date,
      sales: {
        count: sales.length,
        totalRevenue,
        totalDiscount,
        paymentBreakdown,
        items: sales,
      },
      voidedSales: {
        count: voidedSales.length,
        totalAmount: voidedSales.reduce((sum, s) => sum + Number(s.total), 0),
        items: voidedSales,
      },
      packageSales: {
        count: packageSales.length,
        totalPackageAmount: packageTotal,
        totalProfit: packageRevenue,
        items: packageSales,
      },
      repairPayments: {
        count: repairPayments.length,
        totalRevenue: repairRevenue,
        paymentBreakdown: repairPaymentBreakdown,
      },
      repairs: {
        count: repairs.length,
        byStatus: repairs.reduce(
          (acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        items: repairs,
      },
      stockIn: {
        count: stockIn.length,
        items: stockIn,
      },
      supplierPayments: {
        count: supplierPayments.length,
        totalAmount: totalExpenses,
        paymentBreakdown: expenseBreakdown,
        items: supplierPayments,
      },
    };
  }

  async getOwnerDashboard(branchId?: string, tenantId?: string | null) {
    const now = new Date();
    // Shift to Thai timezone (UTC+7) for date boundaries
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = thaiNow.toISOString().slice(0, 10);
    const todayStart = new Date(`${todayStr}T00:00:00+07:00`);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekAgoStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const toThaiDate = (d: Date) =>
      new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const [
      todaySalesAgg,
      todaySalesByMethod,
      todayRepairAgg,
      todayRepairByMethod,
      todayPackageSalesAgg,
      todayVoidedAgg,
      activeRepairsByStatus,
      overdueCount,
      weeklySales,
      weeklyRepairPmts,
      weeklyPackageSales,
      topProductGroups,
      staffSaleGroups,
      staffRepairGroups,
      outOfStockCount,
      lowStockResult,
      activeShift,
      pendingClaimsCount,
      unpaidRepairsCount,
      overdueSupplierPoCount,
      apOutstandingAgg,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bFilter },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bFilter },
        _sum: { total: true },
      }),
      this.prisma.repair.aggregate({
        where: { paidAt: { gte: todayStart, lt: todayEnd }, paymentStatus: 'PAID', ...bFilter },
        _sum: { paidAmount: true },
        _count: { id: true },
      }),
      this.prisma.repair.groupBy({
        by: ['paymentMethod'],
        where: { paidAt: { gte: todayStart, lt: todayEnd }, paymentStatus: 'PAID', ...bFilter },
        _sum: { paidAmount: true },
      }),
      this.prisma.packageSale.aggregate({
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
        _sum: { packageAmount: true, profit: true },
        _count: { id: true },
      }),
      this.prisma.sale.aggregate({
        where: { voidedAt: { gte: todayStart, lt: todayEnd }, status: 'VOIDED', ...bFilter },
        _sum: { total: true },
        _count: { id: true },
      }),
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
      this.prisma.sale.findMany({
        where: { createdAt: { gte: weekAgoStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bFilter },
        select: { total: true, createdAt: true },
      }),
      this.prisma.repair.findMany({
        where: { paidAt: { gte: weekAgoStart, lt: todayEnd }, paymentStatus: 'PAID', ...bFilter },
        select: { paidAmount: true, paidAt: true },
      }),
      this.prisma.packageSale.findMany({
        where: { createdAt: { gte: weekAgoStart, lt: todayEnd } },
        select: { profit: true, createdAt: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: { createdAt: { gte: weekAgoStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bFilter },
        },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      this.prisma.sale.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { not: 'VOIDED' }, ...bFilter },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.repair.groupBy({
        by: ['technicianId'],
        where: {
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          technicianId: { not: null },
          ...bFilter,
        },
        _count: { id: true },
      }),
      this.prisma.product.count({ where: { isActive: true, stock: 0, ...this.tenantSvc.scope(tenantId) } }),
      tenantId
        ? this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Product" WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock" AND "tenantId" = ${tenantId}`
        : this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Product" WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock"`,
      this.prisma.shift.findFirst({
        where: { isActive: true },
        include: { user: { select: { name: true, role: true } } },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.claim.count({
        where: {
          status: { notIn: ['CLOSED', 'CANCELLED'] },
          ...(tenantId ? { serialNumber: { product: { tenantId } } } : {}),
        },
      }),
      this.prisma.repair.count({
        where: { status: 'COMPLETED', paymentStatus: { not: 'PAID' }, ...bFilter },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          dueDate: { lt: now },
          paymentStatus: { not: 'PAID' },
          status: { not: 'CANCELLED' },
          ...(tenantId ? { supplier: { tenantId } } : {}),
        },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          paymentStatus: { not: 'PAID' },
          status: { not: 'CANCELLED' },
          ...(tenantId ? { supplier: { tenantId } } : {}),
        },
        _sum: { total: true, paidTotal: true },
      }),
    ]);

    // --- Today financials ---
    const salesRevenue = Number(todaySalesAgg._sum.total ?? 0);
    const repairRevenue = Number(todayRepairAgg._sum.paidAmount ?? 0);
    const packageSaleRevenue = Number(todayPackageSalesAgg._sum.profit ?? 0);
    const packageSaleAmount = Number(todayPackageSalesAgg._sum.packageAmount ?? 0);
    const totalRevenue = salesRevenue + repairRevenue + packageSaleRevenue;

    const voidedCount = todayVoidedAgg._count.id;
    const voidedAmount = Number(todayVoidedAgg._sum.total ?? 0);

    const cashIn =
      Number(todaySalesByMethod.find((r) => r.paymentMethod === 'CASH')?._sum.total ?? 0) +
      Number(todayRepairByMethod.find((r) => r.paymentMethod === 'CASH')?._sum.paidAmount ?? 0);
    const transferIn =
      Number(todaySalesByMethod.find((r) => r.paymentMethod === 'TRANSFER')?._sum.total ?? 0) +
      Number(todayRepairByMethod.find((r) => r.paymentMethod === 'TRANSFER')?._sum.paidAmount ?? 0);

    // --- Repair operations ---
    const statusMap = Object.fromEntries(
      activeRepairsByStatus.map((r) => [r.status, r._count.id]),
    );

    // --- Weekly revenue (last 7 days) ---
    const weeklyMap = new Map<string, { sales: number; repairs: number; packages: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgoStart.getTime() + i * 24 * 60 * 60 * 1000);
      weeklyMap.set(toThaiDate(d), { sales: 0, repairs: 0, packages: 0 });
    }
    weeklySales.forEach((s) => {
      const key = toThaiDate(s.createdAt);
      const entry = weeklyMap.get(key);
      if (entry) entry.sales += Number(s.total);
    });
    weeklyRepairPmts.forEach((r) => {
      if (!r.paidAt) return;
      const key = toThaiDate(r.paidAt);
      const entry = weeklyMap.get(key);
      if (entry) entry.repairs += Number(r.paidAmount ?? 0);
    });
    weeklyPackageSales.forEach((p) => {
      const key = toThaiDate(p.createdAt);
      const entry = weeklyMap.get(key);
      if (entry) entry.packages += Number(p.profit);
    });
    const weeklyRevenue = Array.from(weeklyMap.entries()).map(([date, v]) => ({
      date,
      sales: v.sales,
      repairs: v.repairs,
      packages: v.packages,
      total: v.sales + v.repairs + v.packages,
    }));

    // --- Top products (need names) ---
    const productIds = topProductGroups.map((p) => p.productId);
    const productRows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const productMap = new Map(productRows.map((p) => [p.id, p]));
    const topProducts = topProductGroups.map((p) => ({
      name: productMap.get(p.productId)?.name ?? 'Unknown',
      sku: productMap.get(p.productId)?.sku ?? '',
      qty: Number(p._sum.quantity ?? 0),
      revenue: Number(p._sum.total ?? 0),
    }));

    // --- Staff performance ---
    const userIds = [
      ...staffSaleGroups.map((s) => s.userId),
      ...staffRepairGroups.filter((r) => r.technicianId).map((r) => r.technicianId as string),
    ];
    const uniqueIds = [...new Set(userIds)];
    const userRows = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, role: true },
    });
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    type StaffEntry = { name: string; role: string; salesCount: number; salesRevenue: number; repairCount: number };
    const staffMap = new Map<string, StaffEntry>();
    staffSaleGroups.forEach((s) => {
      const u = userMap.get(s.userId);
      if (!u) return;
      staffMap.set(s.userId, {
        name: u.name,
        role: u.role,
        salesCount: s._count.id,
        salesRevenue: Number(s._sum.total ?? 0),
        repairCount: 0,
      });
    });
    staffRepairGroups.forEach((r) => {
      if (!r.technicianId) return;
      const u = userMap.get(r.technicianId);
      if (!u) return;
      const ex = staffMap.get(r.technicianId);
      if (ex) {
        ex.repairCount = r._count.id;
      } else {
        staffMap.set(r.technicianId, {
          name: u.name,
          role: u.role,
          salesCount: 0,
          salesRevenue: 0,
          repairCount: r._count.id,
        });
      }
    });

    const lowStockCount = Number((lowStockResult as [{ count: bigint }])[0]?.count ?? 0);
    const apOutstanding =
      Number(apOutstandingAgg._sum.total ?? 0) - Number(apOutstandingAgg._sum.paidTotal ?? 0);

    return {
      today: {
        salesRevenue,
        repairRevenue,
        packageSaleRevenue,
        packageSaleAmount,
        packageSaleCount: todayPackageSalesAgg._count.id,
        totalRevenue,
        salesCount: todaySalesAgg._count.id,
        repairPaymentsCount: todayRepairAgg._count.id,
        cashIn,
        transferIn,
        voidedCount,
        voidedAmount,
      },
      repairOps: {
        waitingApproval: statusMap['WAITING_APPROVAL'] ?? 0,
        waitingParts: statusMap['WAITING_PARTS'] ?? 0,
        inProgress: (statusMap['IN_PROGRESS'] ?? 0) + (statusMap['APPROVED'] ?? 0),
        completedNotDelivered: statusMap['COMPLETED'] ?? 0,
        overdue: overdueCount,
        totalActive: Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
      weeklyRevenue,
      topProducts,
      staffPerformance: Array.from(staffMap.values()),
      stock: { outOfStock: outOfStockCount, lowStock: lowStockCount },
      currentShift: activeShift
        ? {
            isOpen: true,
            openedAt: activeShift.openedAt,
            userName: activeShift.user.name,
            userRole: activeShift.user.role,
            openBalance: Number(activeShift.openBalance),
          }
        : { isOpen: false, openedAt: null, userName: null, userRole: null, openBalance: 0 },
      alerts: {
        pendingClaims: pendingClaimsCount,
        unpaidRepairs: unpaidRepairsCount,
        overdueRepairs: overdueCount,
        outOfStock: outOfStockCount,
        lowStock: lowStockCount,
        overdueSuppliers: overdueSupplierPoCount,
        apOutstanding,
      },
    };
  }

  async getSummary(startDate: string, endDate: string, branchId?: string, tenantId?: string | null) {
    const start = new Date(`${startDate}T00:00:00+07:00`);
    const end = new Date(`${endDate}T00:00:00+07:00`);
    end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...bFilter },
      select: { total: true, paymentMethod: true, createdAt: true },
    });

    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

    const topProducts = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          createdAt: { gte: start, lt: end },
          status: { not: 'VOIDED' },
        },
      },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    });

    const productIds = topProducts.map((tp) => tp.productId);
    const productRows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const productMap = new Map(productRows.map((p) => [p.id, p]));
    const topProductsWithNames = topProducts.map((tp) => ({
      product: productMap.get(tp.productId) ?? null,
      totalQuantity: tp._sum.quantity,
      totalRevenue: Number(tp._sum.total),
    }));

    const repairCount = await this.prisma.repair.count({
      where: { receivedAt: { gte: start, lt: end } },
    });

    return {
      period: { startDate, endDate },
      sales: {
        count: sales.length,
        totalRevenue,
      },
      repairs: { count: repairCount },
      topProducts: topProductsWithNames,
    };
  }

  async getDailyClosingReport(date: string, branchId?: string, tenantId?: string | null) {
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const [
      sales,
      voidedSales,
      refunds,
      repairPayments,
      packageSales,
      newRepairs,
      unpaidRepairs,
      shiftsToday,
      topProductGroups,
      staffSaleGroups,
      staffRepairGroups,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' }, ...bFilter },
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.sale.findMany({
        where: { voidedAt: { gte: start, lt: end }, status: 'VOIDED', ...bFilter },
        select: {
          id: true, receiptNumber: true, total: true, voidReason: true, voidedAt: true,
          voidedBy: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { voidedAt: 'asc' },
      }),
      this.prisma.saleRefund.findMany({
        where: { createdAt: { gte: start, lt: end } },
        include: {
          sale: { select: { receiptNumber: true } },
          items: { include: { product: { select: { name: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.repair.findMany({
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', ...bFilter },
        select: {
          id: true, ticketNumber: true, paidAmount: true, paymentMethod: true,
          finalCost: true, paidAt: true,
          customer: { select: { id: true, name: true } },
          technician: { select: { id: true, name: true } },
        },
        orderBy: { paidAt: 'asc' },
      }),
      this.prisma.packageSale.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: {
          id: true, receiptNumber: true, carrier: true, packageAmount: true,
          profit: true, paymentMethod: true, createdAt: true,
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.repair.findMany({
        where: { receivedAt: { gte: start, lt: end } },
        include: { customer: { select: { id: true, name: true, phone: true } }, technician: { select: { id: true, name: true } } },
      }),
      this.prisma.repair.findMany({
        where: { status: 'COMPLETED', paymentStatus: { not: 'PAID' } },
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.shift.findMany({
        where: {
          OR: [
            { openedAt: { gte: start, lt: end } },
            { isActive: true, openedAt: { lt: end } },
          ],
        },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: { sale: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' } } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      this.prisma.sale.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: start, lt: end }, status: { not: 'VOIDED' } },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.repair.groupBy({
        by: ['technicianId'],
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', technicianId: { not: null } },
        _count: { id: true },
        _sum: { paidAmount: true },
      }),
    ]);

    // Revenue
    const posRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const posPaymentBreakdown = sales.reduce((acc, s) => {
      acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + Number(s.total);
      return acc;
    }, {} as Record<string, number>);

    const repairRevenue = repairPayments.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0);
    const repairPaymentBreakdown = repairPayments.reduce((acc, r) => {
      const m = r.paymentMethod ?? 'CASH';
      acc[m] = (acc[m] || 0) + Number(r.paidAmount ?? 0);
      return acc;
    }, {} as Record<string, number>);

    const packageRevenue = packageSales.reduce((sum, p) => sum + Number(p.profit), 0);
    const packageAmount = packageSales.reduce((sum, p) => sum + Number(p.packageAmount), 0);
    const refundTotal = refunds.reduce((sum, r) => sum + Number(r.totalRefund), 0);
    const voidedTotal = voidedSales.reduce((sum, s) => sum + Number(s.total), 0);
    const unpaidTotal = unpaidRepairs.reduce((sum, r) => {
      return sum + Math.max(0, Number(r.finalCost ?? r.estimateCost ?? 0) - Number(r.deposit ?? 0));
    }, 0);
    const depositTotal = newRepairs.reduce((sum, r) => sum + Number(r.deposit ?? 0), 0);
    const grandTotal = posRevenue + repairRevenue + packageRevenue;

    // Repairs by status (current active state)
    const activeByStatus = await this.prisma.repair.groupBy({
      by: ['status'],
      where: { status: { notIn: ['DELIVERED', 'CANCELLED'] }, ...bFilter },
      _count: { id: true },
    });
    const repairByStatus = Object.fromEntries(activeByStatus.map((r) => [r.status, r._count.id]));

    // Overdue repairs
    const overdueRepairs = await this.prisma.repair.findMany({
      where: { dueDate: { lt: now }, status: { notIn: ['DELIVERED', 'CANCELLED', 'COMPLETED'] }, ...bFilter },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });

    // Expenses for the day
    const expensesToday = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: start, lt: end }, voidedAt: null, ...bFilter },
      include: {
        category:  { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: 'asc' },
    });

    // Low-stock products (stock <= minStock) via raw query to compare columns
    const lowStockProducts = tenantId
      ? await this.prisma.$queryRaw<Array<{ id: string; name: string; sku: string; stock: number; minStock: number }>>`
          SELECT id, name, sku, stock, "minStock" FROM "Product"
          WHERE "isActive" = true AND stock <= "minStock" AND "tenantId" = ${tenantId}
          ORDER BY stock ASC LIMIT 20
        `
      : await this.prisma.$queryRaw<Array<{ id: string; name: string; sku: string; stock: number; minStock: number }>>`
          SELECT id, name, sku, stock, "minStock" FROM "Product"
          WHERE "isActive" = true AND stock <= "minStock"
          ORDER BY stock ASC LIMIT 20
        `;

    // Shift cash reconciliation
    const shiftsWithCash = await Promise.all(
      shiftsToday.map(async (shift) => {
        const [shiftSalesCash, shiftRepairCash, shiftCashExpenses] = await Promise.all([
          this.prisma.sale.aggregate({
            where: { shiftId: shift.id, paymentMethod: 'CASH', status: { not: 'VOIDED' } },
            _sum: { total: true },
          }),
          this.prisma.repair.aggregate({
            where: { paymentShiftId: shift.id, paymentMethod: 'CASH' },
            _sum: { paidAmount: true },
          }),
          this.prisma.expense.aggregate({
            where: { shiftId: shift.id, paymentMethod: 'CASH', voidedAt: null },
            _sum: { amount: true },
          }),
        ]);
        const cashIn =
          Number(shiftSalesCash._sum.total ?? 0) + Number(shiftRepairCash._sum.paidAmount ?? 0);
        const cashExpenses = Number(shiftCashExpenses._sum.amount ?? 0);
        const expectedBalance = Number(shift.openBalance) + cashIn - cashExpenses;
        const difference =
          shift.closeBalance != null ? Number(shift.closeBalance) - expectedBalance : null;
        return { ...shift, cashIn, cashExpenses, expectedBalance, difference };
      }),
    );

    // Top products with names
    const productIds = topProductGroups.map((p) => p.productId);
    const productRows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const productMap = new Map(productRows.map((p) => [p.id, p]));
    const topProducts = topProductGroups.map((p) => ({
      productId: p.productId,
      name: productMap.get(p.productId)?.name ?? 'Unknown',
      sku: productMap.get(p.productId)?.sku ?? '',
      qty: Number(p._sum.quantity ?? 0),
      revenue: Number(p._sum.total ?? 0),
    }));

    // Staff performance
    const userIds = [
      ...staffSaleGroups.map((s) => s.userId),
      ...staffRepairGroups.filter((r) => r.technicianId).map((r) => r.technicianId as string),
    ];
    const userRows = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, name: true, role: true },
    });
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    type StaffEntry = {
      id: string; name: string; role: string;
      salesCount: number; salesRevenue: number;
      repairCount: number; repairRevenue: number;
    };
    const staffMap = new Map<string, StaffEntry>();
    staffSaleGroups.forEach((s) => {
      const u = userMap.get(s.userId);
      if (!u) return;
      staffMap.set(s.userId, {
        id: u.id, name: u.name, role: u.role,
        salesCount: s._count.id, salesRevenue: Number(s._sum.total ?? 0),
        repairCount: 0, repairRevenue: 0,
      });
    });
    staffRepairGroups.forEach((r) => {
      if (!r.technicianId) return;
      const u = userMap.get(r.technicianId);
      if (!u) return;
      const ex = staffMap.get(r.technicianId);
      if (ex) {
        ex.repairCount = r._count.id;
        ex.repairRevenue = Number(r._sum.paidAmount ?? 0);
      } else {
        staffMap.set(r.technicianId, {
          id: u.id, name: u.name, role: u.role,
          salesCount: 0, salesRevenue: 0,
          repairCount: r._count.id, repairRevenue: Number(r._sum.paidAmount ?? 0),
        });
      }
    });

    return {
      date,
      revenue: {
        pos: { total: posRevenue, count: sales.length, breakdown: posPaymentBreakdown },
        repairs: { total: repairRevenue, count: repairPayments.length, breakdown: repairPaymentBreakdown },
        packages: { total: packageRevenue, amount: packageAmount, count: packageSales.length },
        refunds: { total: refundTotal, count: refunds.length },
        voided: { total: voidedTotal, count: voidedSales.length },
        deposits: { total: depositTotal },
        outstanding: { total: unpaidTotal, count: unpaidRepairs.length },
        grandTotal,
        cash: (posPaymentBreakdown['CASH'] || 0) + (repairPaymentBreakdown['CASH'] || 0),
        transfer: (posPaymentBreakdown['TRANSFER'] || 0) + (repairPaymentBreakdown['TRANSFER'] || 0),
        card: (posPaymentBreakdown['CARD'] || 0) + (repairPaymentBreakdown['CARD'] || 0),
      },
      sales: { items: sales, count: sales.length },
      voidedSales: { items: voidedSales, count: voidedSales.length },
      refunds: { items: refunds, count: refunds.length },
      repairPayments: { items: repairPayments, count: repairPayments.length },
      packageSales: { items: packageSales, count: packageSales.length },
      repairSummary: {
        new: newRepairs.length,
        byStatus: repairByStatus,
        overdue: overdueRepairs.length,
        items: newRepairs,
        overdueItems: overdueRepairs,
      },
      unpaidRepairs: { items: unpaidRepairs, count: unpaidRepairs.length, total: unpaidTotal },
      shifts: { items: shiftsWithCash },
      expenses: {
        items:       expensesToday,
        count:       expensesToday.length,
        totalAmount: expensesToday.reduce((sum, e) => sum + Number(e.amount), 0),
        byCategory:  Object.values(
          expensesToday.reduce(
            (acc, e) => {
              const k = e.categoryId;
              if (!acc[k]) {
                acc[k] = { categoryId: e.categoryId, categoryName: (e.category as any).name, total: 0, count: 0 };
              }
              acc[k].total += Number(e.amount);
              acc[k].count++;
              return acc;
            },
            {} as Record<string, { categoryId: string; categoryName: string; total: number; count: number }>,
          ),
        ).sort((a, b) => b.total - a.total),
      },
      lowStock: { items: lowStockProducts, count: lowStockProducts.length },
      performance: {
        topProducts,
        topStaff: Array.from(staffMap.values()).sort(
          (a, b) => (b.salesRevenue + b.repairRevenue) - (a.salesRevenue + a.repairRevenue),
        ),
      },
    };
  }

  async getVoidLog(date: string, branchId?: string, tenantId?: string | null) {
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const voidedSales = await this.prisma.sale.findMany({
      where: { voidedAt: { gte: start, lt: end }, status: 'VOIDED', ...bFilter },
      select: {
        id: true,
        receiptNumber: true,
        total: true,
        voidReason: true,
        voidedAt: true,
        createdAt: true,
        voidedBy: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        customer: { select: { name: true, phone: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
      orderBy: { voidedAt: 'desc' },
    });

    return {
      date,
      count: voidedSales.length,
      totalAmount: voidedSales.reduce((sum, s) => sum + Number(s.total), 0),
      items: voidedSales,
    };
  }

  async getProfitReport(startDate: string, endDate: string, branchId?: string, tenantId?: string | null) {
    const start = new Date(`${startDate}T00:00:00+07:00`);
    const end   = new Date(`${endDate}T00:00:00+07:00`);
    end.setTime(end.getTime() + 24 * 60 * 60 * 1000); // include end date fully
    const bFilter = branchId ? { branchId } : this.tenantSvc.branchScope(tenantId);

    const [saleItems, repaids, packageSales, expenses] = await Promise.all([
      // POS: sale items for non-voided sales in range
      this.prisma.saleItem.findMany({
        where: {
          sale: {
            createdAt: { gte: start, lt: end },
            status: { not: 'VOIDED' },
            ...bFilter,
          },
        },
        select: {
          quantity: true,
          price: true,
          costPrice: true,
          discount: true,
          total: true,
          product: { select: { id: true, name: true, sku: true } },
          sale: {
            select: {
              createdAt: true,
              receiptNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),

      // Repairs: jobs paid (paidAt) within range
      this.prisma.repair.findMany({
        where: { paidAt: { gte: start, lt: end }, paymentStatus: 'PAID', ...bFilter },
        select: {
          id: true,
          ticketNumber: true,
          paidAmount: true,
          actualLaborCost: true,
          paidAt: true,
          deviceBrand: true,
          deviceModel: true,
          customer: { select: { name: true } },
          parts: {
            select: {
              quantity: true,
              price: true,
              product: { select: { name: true } },
            },
          },
        },
      }),

      // Package sales in range
      this.prisma.packageSale.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: {
          id: true,
          carrier: true,
          packageAmount: true,
          profit: true,
          walletDeduction: true,
          createdAt: true,
          receiptNumber: true,
        },
      }),

      // Expenses (non-voided) in range
      this.prisma.expense.findMany({
        where: {
          expenseDate: { gte: start, lt: end },
          voidedAt: null,
          ...bFilter,
        },
        select: {
          amount: true,
          expenseDate: true,
          description: true,
          paymentMethod: true,
          category: { select: { name: true, code: true } },
        },
      }),
    ]);

    // --- POS profit ---
    const posRevenue = saleItems.reduce((s, i) => s + Number(i.total), 0);
    const posCOGS    = saleItems.reduce((s, i) => s + Number(i.costPrice) * i.quantity, 0);
    const posProfit  = posRevenue - posCOGS;

    // --- Repair profit ---
    const repairRevenue   = repaids.reduce((s, r) => s + Number(r.paidAmount ?? 0), 0);
    const repairPartsCost = repaids.reduce(
      (s, r) => s + r.parts.reduce((ps, p) => ps + Number(p.price) * p.quantity, 0), 0,
    );
    const repairLaborCost = repaids.reduce((s, r) => s + Number(r.actualLaborCost ?? 0), 0);
    const repairProfit    = repairRevenue - repairPartsCost - repairLaborCost;

    // --- Package profit ---
    const packageProfit  = packageSales.reduce((s, p) => s + Number(p.profit), 0);
    const packageRevenue = packageSales.reduce((s, p) => s + Number(p.packageAmount), 0);

    // --- Expenses ---
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

    // Expense breakdown by category
    const expByCat = new Map<string, { name: string; total: number }>();
    expenses.forEach((e) => {
      const key = e.category.code;
      const existing = expByCat.get(key);
      if (existing) {
        existing.total += Number(e.amount);
      } else {
        expByCat.set(key, { name: e.category.name, total: Number(e.amount) });
      }
    });
    const expenseBreakdown = Array.from(expByCat.entries())
      .map(([code, v]) => ({ code, name: v.name, total: v.total }))
      .sort((a, b) => b.total - a.total);

    const grossProfit = posProfit + repairProfit + packageProfit;
    const netProfit   = grossProfit - totalExpenses;

    return {
      period: { startDate, endDate },
      pos: {
        revenue: posRevenue,
        cogs:    posCOGS,
        profit:  posProfit,
        margin:  posRevenue > 0 ? (posProfit / posRevenue) * 100 : 0,
        items:   saleItems.map((i) => ({
          time:          i.sale.createdAt.toISOString(),
          receiptNumber: i.sale.receiptNumber,
          customer:      i.sale.customer?.name ?? null,
          product:       i.product.name,
          qty:           i.quantity,
          revenue:       Number(i.total),
          cogs:          Number(i.costPrice) * i.quantity,
          profit:        Number(i.total) - Number(i.costPrice) * i.quantity,
        })),
      },
      repair: {
        revenue:   repairRevenue,
        partsCost: repairPartsCost,
        laborCost: repairLaborCost,
        profit:    repairProfit,
        count:     repaids.length,
        margin:    repairRevenue > 0 ? (repairProfit / repairRevenue) * 100 : 0,
        items:     repaids.map((r) => {
          const pc = r.parts.reduce((s, p) => s + Number(p.price) * p.quantity, 0);
          const lc = Number(r.actualLaborCost ?? 0);
          return {
            time:         (r.paidAt as Date).toISOString(),
            ticketNumber: r.ticketNumber,
            customer:     r.customer?.name ?? null,
            device:       `${r.deviceBrand} ${r.deviceModel}`,
            revenue:      Number(r.paidAmount ?? 0),
            partsCost:    pc,
            laborCost:    lc,
            profit:       Number(r.paidAmount ?? 0) - pc - lc,
          };
        }),
      },
      package: {
        revenue: packageRevenue,
        profit:  packageProfit,
        count:   packageSales.length,
        items:   packageSales.map((p) => ({
          time:          p.createdAt.toISOString(),
          receiptNumber: p.receiptNumber,
          carrier:       p.carrier,
          amount:        Number(p.packageAmount),
          profit:        Number(p.profit),
        })),
      },
      expenses: {
        total:     totalExpenses,
        breakdown: expenseBreakdown,
        items:     expenses.map((e) => ({
          time:          (e.expenseDate as Date).toISOString(),
          category:      e.category.name,
          description:   e.description,
          paymentMethod: e.paymentMethod,
          amount:        Number(e.amount),
        })),
      },
      summary: {
        grossProfit,
        netProfit,
        totalRevenue: posRevenue + repairRevenue + packageRevenue,
        grossMargin:  (posRevenue + repairRevenue + packageRevenue) > 0
          ? (grossProfit / (posRevenue + repairRevenue + packageRevenue)) * 100
          : 0,
        netMargin:    (posRevenue + repairRevenue + packageRevenue) > 0
          ? (netProfit / (posRevenue + repairRevenue + packageRevenue)) * 100
          : 0,
      },
    };
  }

  async getSupplierAging(tenantId?: string | null) {
    const today = new Date();

    const tenantSupplierIds = tenantId
      ? (await this.prisma.supplier.findMany({
          where: { tenantId },
          select: { id: true },
        })).map((s) => s.id)
      : null;

    const outstandingPos = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { not: 'CANCELLED' },
        paymentStatus: { not: 'PAID' },
        ...(tenantSupplierIds ? { supplierId: { in: tenantSupplierIds } } : {}),
      },
      select: {
        id: true, poNumber: true, orderDate: true, dueDate: true,
        total: true, paidTotal: true, paymentStatus: true, status: true,
        supplier: { select: { id: true, name: true, creditDays: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    type AgingEntry = {
      id: string; name: string; creditDays: number;
      b0to30: number; b31to60: number; b61to90: number; b90plus: number;
      total: number;
    };

    const supplierMap = new Map<string, AgingEntry>();

    for (const po of outstandingPos) {
      const balance = Math.max(0, Number(po.total) - Number(po.paidTotal));
      if (balance <= 0.001) continue;

      const effectiveDue = po.dueDate
        ? new Date(po.dueDate)
        : po.supplier.creditDays > 0
          ? new Date(new Date(po.orderDate).getTime() + po.supplier.creditDays * 86_400_000)
          : new Date(po.orderDate);

      const daysOverdue = Math.max(0, Math.floor((today.getTime() - effectiveDue.getTime()) / 86_400_000));

      const { id, name, creditDays } = po.supplier;
      if (!supplierMap.has(id)) {
        supplierMap.set(id, { id, name, creditDays, b0to30: 0, b31to60: 0, b61to90: 0, b90plus: 0, total: 0 });
      }
      const entry = supplierMap.get(id)!;
      entry.total += balance;

      if (daysOverdue <= 30)       entry.b0to30  += balance;
      else if (daysOverdue <= 60)  entry.b31to60 += balance;
      else if (daysOverdue <= 90)  entry.b61to90 += balance;
      else                          entry.b90plus  += balance;
    }

    const suppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.total - a.total);

    const totals = suppliers.reduce(
      (acc, s) => ({
        total:   acc.total   + s.total,
        b0to30:  acc.b0to30  + s.b0to30,
        b31to60: acc.b31to60 + s.b31to60,
        b61to90: acc.b61to90 + s.b61to90,
        b90plus: acc.b90plus + s.b90plus,
      }),
      { total: 0, b0to30: 0, b31to60: 0, b61to90: 0, b90plus: 0 },
    );

    return { suppliers, totals };
  }
}
