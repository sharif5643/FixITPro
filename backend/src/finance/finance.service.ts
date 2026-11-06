import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  async getSummary(params: {
    startDate: string;
    endDate:   string;
    branchId?: string;
    tenantId?: string | null;
  }) {
    const start = new Date(`${params.startDate}T00:00:00+07:00`);
    const end   = new Date(`${params.endDate}T23:59:59+07:00`);

    const where: any = {
      createdAt: { gte: start, lte: end },
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    };

    const txns = await this.prisma.cashDrawerTransaction.findMany({
      where,
      select: {
        direction:  true,
        amount:     true,
        sourceType: true,
        type:       true,
      },
    });

    const totalIn  = txns.filter(t => t.direction === 'IN').reduce((s, t) => s + Number(t.amount), 0);
    const totalOut = txns.filter(t => t.direction === 'OUT').reduce((s, t) => s + Number(t.amount), 0);

    const bySource: Record<string, { in: number; out: number }> = {};
    for (const t of txns) {
      const key = t.sourceType ?? t.type;
      if (!bySource[key]) bySource[key] = { in: 0, out: 0 };
      if (t.direction === 'IN')  bySource[key].in  += Number(t.amount);
      if (t.direction === 'OUT') bySource[key].out += Number(t.amount);
    }

    return {
      period: { startDate: params.startDate, endDate: params.endDate },
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      txnCount: txns.length,
      bySource,
    };
  }

  async getBranchPnL(params: {
    startDate:  string;
    endDate:    string;
    tenantId?:  string | null;
  }) {
    const start = new Date(`${params.startDate}T00:00:00+07:00`);
    const end   = new Date(`${params.endDate}T23:59:59+07:00`);

    const txns = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      },
      select: { branchId: true, direction: true, amount: true },
    });

    const branchIds = [...new Set(txns.map(t => t.branchId).filter(Boolean))] as string[];
    const branches  = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(branches.map(b => [b.id, b.name]));

    const map: Record<string, { branchId: string; branchName: string; totalIn: number; totalOut: number }> = {};
    for (const t of txns) {
      const key = t.branchId ?? 'unassigned';
      if (!map[key]) {
        map[key] = {
          branchId:   key,
          branchName: nameMap[key] ?? (key === 'unassigned' ? 'ไม่ระบุสาขา' : key),
          totalIn:    0,
          totalOut:   0,
        };
      }
      if (t.direction === 'IN')  map[key].totalIn  += Number(t.amount);
      if (t.direction === 'OUT') map[key].totalOut += Number(t.amount);
    }

    return Object.values(map)
      .map(b => ({ ...b, net: b.totalIn - b.totalOut }))
      .sort((a, b) => b.net - a.net);
  }

  async getTransactions(params: {
    startDate?:  string;
    endDate?:    string;
    branchId?:   string;
    tenantId?:   string | null;
    sourceType?: string;
    direction?:  string;
    page?:       number;
    limit?:      number;
  }) {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (params.startDate) {
      where.createdAt = { gte: new Date(`${params.startDate}T00:00:00+07:00`) };
    }
    if (params.endDate) {
      where.createdAt = {
        ...(where.createdAt ?? {}),
        lte: new Date(`${params.endDate}T23:59:59+07:00`),
      };
    }
    if (params.branchId)   where.branchId   = params.branchId;
    if (params.tenantId)   where.tenantId   = params.tenantId;
    if (params.sourceType) where.sourceType = params.sourceType;
    if (params.direction)  where.direction  = params.direction;

    const [total, items] = await Promise.all([
      this.prisma.cashDrawerTransaction.count({ where }),
      this.prisma.cashDrawerTransaction.findMany({
        where,
        select: {
          id:            true,
          type:          true,
          direction:     true,
          amount:        true,
          sourceType:    true,
          referenceType: true,
          referenceId:   true,
          paymentMethod: true,
          reason:        true,
          createdAt:     true,
          sessionId:     true,
          actorUserId:   true,
          branchId:      true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const docs = await this.docsOf(items.map((t) => t.referenceId).filter((x): x is string => !!x));
    return {
      data: items.map(t => ({ ...t, amount: Number(t.amount), doc: t.referenceId ? docs.get(t.referenceId) ?? null : null })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Daily Close ──────────────────────────────────────────────────────────────

  async saveDailyClose(params: {
    date:           string;
    posRevenue:     number;
    repairRevenue:  number;
    packageRevenue: number;
    expenseTotal:   number;
    grandTotal:     number;
    cashRevenue:    number;
    transferRevenue: number;
    cardRevenue:    number;
    actualCash?:    number;
    cashDifference?: number;
    notes?:         string;
    tenantId?:      string | null;
    branchId?:      string;
    closedById:     string;
  }) {
    const existing = await this.prisma.dailyClose.findFirst({
      where: {
        date:     params.date,
        branchId: params.branchId ?? null,
        tenantId: params.tenantId ?? null,
      },
    });

    const data = {
      posRevenue:      params.posRevenue,
      repairRevenue:   params.repairRevenue,
      packageRevenue:  params.packageRevenue,
      expenseTotal:    params.expenseTotal,
      grandTotal:      params.grandTotal,
      cashRevenue:     params.cashRevenue,
      transferRevenue: params.transferRevenue,
      cardRevenue:     params.cardRevenue,
      actualCash:      params.actualCash ?? null,
      cashDifference:  params.cashDifference ?? null,
      notes:           params.notes ?? null,
      closedAt:        new Date(),
    };

    if (existing) {
      return this.prisma.dailyClose.update({ where: { id: existing.id }, data });
    }

    return this.prisma.dailyClose.create({
      data: {
        ...data,
        date:      params.date,
        tenantId:  params.tenantId ?? null,
        branchId:  params.branchId ?? null,
        closedById: params.closedById,
      },
    });
  }

  async getDailyCloseHistory(params: {
    tenantId?: string | null;
    branchId?: string;
    page?:     number;
    limit?:    number;
  }) {
    const page  = params.page  ?? 1;
    const limit = params.limit ?? 30;
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.branchId) where.branchId = params.branchId;

    const [total, items] = await Promise.all([
      this.prisma.dailyClose.count({ where }),
      this.prisma.dailyClose.findMany({
        where,
        include: {
          closedBy: { select: { id: true, name: true } },
          branch:   { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: items.map(r => ({
        ...r,
        posRevenue:      Number(r.posRevenue),
        repairRevenue:   Number(r.repairRevenue),
        packageRevenue:  Number(r.packageRevenue),
        expenseTotal:    Number(r.expenseTotal),
        grandTotal:      Number(r.grandTotal),
        cashRevenue:     Number(r.cashRevenue),
        transferRevenue: Number(r.transferRevenue),
        cardRevenue:     Number(r.cardRevenue),
        actualCash:      r.actualCash != null ? Number(r.actualCash) : null,
        cashDifference:  r.cashDifference != null ? Number(r.cashDifference) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
  /**
   * The document each ledger row came from (a bill, a repair job, an expense, a purchase order,
   * a SIM sale or a shift), whatever record its reference points at: a payment leg, a refund,
   * a cash movement… Unknown references are left out.
   */
  private async docsOf(ids: string[]) {
    type Doc = { kind: 'SALE' | 'REPAIR' | 'PACKAGE' | 'SHIFT' | 'EXPENSE' | 'PO'; id: string; label: string };
    const out = new Map<string, Doc>();
    if (!ids.length) return out;
    const id = { in: [...new Set(ids)] };
    const [sales, legs, refunds, repairs, extras, expenses, packages, supplier, moves] = await Promise.all([
      this.prisma.sale.findMany({ where: { id }, select: { id: true, receiptNumber: true } }),
      this.prisma.salePayment.findMany({ where: { id }, select: { id: true, sale: { select: { id: true, receiptNumber: true } } } }),
      this.prisma.saleRefund.findMany({ where: { id }, select: { id: true, sale: { select: { id: true, receiptNumber: true } } } }),
      this.prisma.repair.findMany({ where: { id }, select: { id: true, ticketNumber: true } }),
      this.prisma.repairAdditionalPayment.findMany({ where: { id }, select: { id: true, repair: { select: { id: true, ticketNumber: true } } } }),
      this.prisma.expense.findMany({ where: { id }, select: { id: true, description: true } }),
      this.prisma.packageSale.findMany({ where: { id }, select: { id: true, receiptNumber: true } }),
      this.prisma.supplierPayment.findMany({ where: { id }, select: { id: true, purchaseOrder: { select: { id: true, poNumber: true } } } }),
      this.prisma.shiftCashMovement.findMany({ where: { id }, select: { id: true, shiftId: true, referenceType: true, referenceId: true } }),
    ]);
    for (const x of sales)    out.set(x.id, { kind: 'SALE', id: x.id, label: x.receiptNumber });
    for (const x of legs)     out.set(x.id, { kind: 'SALE', id: x.sale.id, label: x.sale.receiptNumber });
    for (const x of refunds)  out.set(x.id, { kind: 'SALE', id: x.sale.id, label: x.sale.receiptNumber });
    for (const x of repairs)  out.set(x.id, { kind: 'REPAIR', id: x.id, label: x.ticketNumber });
    for (const x of extras)   out.set(x.id, { kind: 'REPAIR', id: x.repair.id, label: x.repair.ticketNumber });
    for (const x of expenses) out.set(x.id, { kind: 'EXPENSE', id: x.id, label: x.description });
    for (const x of packages) out.set(x.id, { kind: 'PACKAGE', id: x.id, label: x.receiptNumber });
    for (const x of supplier) out.set(x.id, { kind: 'PO', id: x.purchaseOrder.id, label: x.purchaseOrder.poNumber });
    // a delivery fee paid from the drawer belongs to its repair job; other cash movements to their shift
    const feeIds = moves.filter((m) => m.referenceType === 'RepairExtraCost' && m.referenceId).map((m) => m.referenceId!);
    const fees = feeIds.length
      ? new Map((await this.prisma.repairExtraCost.findMany({ where: { id: { in: feeIds } }, select: { id: true, repair: { select: { id: true, ticketNumber: true } } } })).map((c) => [c.id, c.repair]))
      : new Map<string, { id: string; ticketNumber: string }>();
    for (const m of moves) {
      const job = m.referenceId ? fees.get(m.referenceId) : undefined;
      out.set(m.id, job ? { kind: 'REPAIR', id: job.id, label: job.ticketNumber } : { kind: 'SHIFT', id: m.shiftId, label: 'ดูกะ' });
    }
    return out;
  }

}
