import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

// ── Input types ───────────────────────────────────────────────────────────────

interface PeriodInput {
  tenantId:  string;
  startDate?: Date;
  endDate?:   Date;
  branchId?:  string;
}

interface LedgerInput {
  tenantId:   string;
  accountId:  string;
  startDate?: Date;
  endDate?:   Date;
  page?:      number;
  limit?:     number;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function buildEntryWhere(
  tenantId:  string,
  startDate: Date | undefined,
  endDate:   Date | undefined,
  branchId:  string | undefined,
): Prisma.JournalEntryWhereInput {
  const dateFilter: Prisma.DateTimeFilter<'JournalEntry'> = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate)   dateFilter.lte = endDate;

  return {
    tenantId,
    isVoided: false,
    ...(branchId && { branchId }),
    ...(Object.keys(dateFilter).length && { entryDate: dateFilter }),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AccountingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Trial Balance ─────────────────────────────────────────────────────────

  async trialBalance({ tenantId, startDate, endDate, branchId }: PeriodInput) {
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: buildEntryWhere(tenantId, startDate, endDate, branchId) },
      include: { account: { select: { code: true, nameTh: true, type: true, sortOrder: true } } },
    });

    const map = new Map<string, {
      code: string; nameTh: string; type: string; sortOrder: number;
      dr: Prisma.Decimal; cr: Prisma.Decimal;
    }>();

    for (const l of lines) {
      const k = l.account.code;
      if (!map.has(k)) {
        map.set(k, {
          code: l.account.code, nameTh: l.account.nameTh,
          type: l.account.type, sortOrder: l.account.sortOrder,
          dr: new Prisma.Decimal(0), cr: new Prisma.Decimal(0),
        });
      }
      const r = map.get(k)!;
      r.dr = r.dr.add(l.debit);
      r.cr = r.cr.add(l.credit);
    }

    const rows = Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(r => ({
        code: r.code, nameTh: r.nameTh, type: r.type,
        totalDebit:  r.dr.toNumber(),
        totalCredit: r.cr.toNumber(),
        balance:     r.dr.minus(r.cr).toNumber(),
      }));

    const grandDebit  = rows.reduce((s, r) => s + r.totalDebit,  0);
    const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

    return { rows, grandDebit, grandCredit, balanced: Math.abs(grandDebit - grandCredit) < 0.005 };
  }

  // ── Income Statement ──────────────────────────────────────────────────────

  async incomeStatement({ tenantId, startDate, endDate, branchId }: PeriodInput) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry:   buildEntryWhere(tenantId, startDate, endDate, branchId),
        account: { type: { in: ['REVENUE', 'EXPENSE'] } },
      },
      include: { account: { select: { code: true, nameTh: true, type: true, sortOrder: true } } },
    });

    const map = new Map<string, {
      code: string; nameTh: string; type: string; sortOrder: number;
      dr: Prisma.Decimal; cr: Prisma.Decimal;
    }>();

    for (const l of lines) {
      const k = l.account.code;
      if (!map.has(k)) {
        map.set(k, {
          code: l.account.code, nameTh: l.account.nameTh,
          type: l.account.type, sortOrder: l.account.sortOrder,
          dr: new Prisma.Decimal(0), cr: new Prisma.Decimal(0),
        });
      }
      const r = map.get(k)!;
      r.dr = r.dr.add(l.debit);
      r.cr = r.cr.add(l.credit);
    }

    const rows = Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(r => ({
        code: r.code, nameTh: r.nameTh, type: r.type,
        // REVENUE: credit normal → cr - dr = positive income
        // EXPENSE: debit  normal → dr - cr = positive expense
        amount: r.type === 'REVENUE'
          ? r.cr.minus(r.dr).toNumber()
          : r.dr.minus(r.cr).toNumber(),
      }));

    const revenues = rows.filter(r => r.type === 'REVENUE');
    const expenses = rows.filter(r => r.type === 'EXPENSE');
    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);

    return { revenues, expenses, totalRevenue, totalExpense, netIncome: totalRevenue - totalExpense };
  }

  // ── Balance Sheet ─────────────────────────────────────────────────────────
  // Cumulative from inception to asOfDate.

  async balanceSheet({
    tenantId, endDate: asOfDate, branchId,
  }: Omit<PeriodInput, 'startDate'>) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry:   buildEntryWhere(tenantId, undefined, asOfDate, branchId),
        account: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
      },
      include: { account: { select: { code: true, nameTh: true, type: true, sortOrder: true } } },
    });

    const map = new Map<string, {
      code: string; nameTh: string; type: string; sortOrder: number;
      dr: Prisma.Decimal; cr: Prisma.Decimal;
    }>();

    for (const l of lines) {
      const k = l.account.code;
      if (!map.has(k)) {
        map.set(k, {
          code: l.account.code, nameTh: l.account.nameTh,
          type: l.account.type, sortOrder: l.account.sortOrder,
          dr: new Prisma.Decimal(0), cr: new Prisma.Decimal(0),
        });
      }
      const r = map.get(k)!;
      r.dr = r.dr.add(l.debit);
      r.cr = r.cr.add(l.credit);
    }

    const rows = Array.from(map.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(r => ({
        code: r.code, nameTh: r.nameTh, type: r.type,
        // ASSET: debit normal → dr - cr
        // LIABILITY, EQUITY: credit normal → cr - dr
        balance: r.type === 'ASSET'
          ? r.dr.minus(r.cr).toNumber()
          : r.cr.minus(r.dr).toNumber(),
      }));

    const assets      = rows.filter(r => r.type === 'ASSET');
    const liabilities = rows.filter(r => r.type === 'LIABILITY');
    const equity      = rows.filter(r => r.type === 'EQUITY');
    const totalAssets      = assets.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquity      = equity.reduce((s, r) => s + r.balance, 0);

    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity };
  }

  // ── General Ledger (per account) ──────────────────────────────────────────

  async generalLedger({ tenantId, accountId, startDate, endDate, page = 1, limit = 100 }: LedgerInput) {
    const account = await this.prisma.accountingAccount.findFirst({
      where: { id: accountId, tenantId },
    });
    if (!account) return null;

    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';

    // Opening balance: sum everything before startDate
    let openingBalance = new Prisma.Decimal(0);
    if (startDate) {
      const prevLines = await this.prisma.journalLine.findMany({
        where: { accountId, entry: { tenantId, isVoided: false, entryDate: { lt: startDate } } },
        select: { debit: true, credit: true },
      });
      for (const l of prevLines) {
        openingBalance = isDebitNormal
          ? openingBalance.add(l.debit).minus(l.credit)
          : openingBalance.add(l.credit).minus(l.debit);
      }
    }

    const periodWhere: Prisma.JournalLineWhereInput = {
      accountId,
      entry: buildEntryWhere(tenantId, startDate, endDate, undefined),
    };

    const [lines, total] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: periodWhere,
        include: {
          entry: { select: { entryDate: true, description: true, entryNumber: true, sourceType: true } },
        },
        orderBy: [{ entry: { entryDate: 'asc' } }, { entry: { id: 'asc' } }],
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      this.prisma.journalLine.count({ where: periodWhere }),
    ]);

    // Running balance starts from openingBalance + entries before this page
    // For simplicity, compute all entries' running balance from page 1
    // (full running balance requires pre-page aggregation — done via openingBalance above for page 1)
    let running = openingBalance;
    const items = lines.map(l => {
      running = isDebitNormal
        ? running.add(l.debit).minus(l.credit)
        : running.add(l.credit).minus(l.debit);
      return {
        id:             l.id,
        entryDate:      l.entry.entryDate,
        entryNumber:    l.entry.entryNumber,
        description:    l.entry.description,
        sourceType:     l.entry.sourceType,
        debit:          l.debit.toNumber(),
        credit:         l.credit.toNumber(),
        note:           l.note,
        runningBalance: running.toNumber(),
      };
    });

    return {
      account:        { code: account.code, nameTh: account.nameTh, type: account.type },
      openingBalance: openingBalance.toNumber(),
      isDebitNormal,
      items,
      total,
      page,
      limit,
    };
  }
}
