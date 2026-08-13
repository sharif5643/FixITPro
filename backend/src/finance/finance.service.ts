import { Injectable } from '@nestjs/common';
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

    return {
      data: items.map(t => ({ ...t, amount: Number(t.amount) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
