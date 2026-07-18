import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';

export interface ReconciliationQuery {
  branchId:  string;
  tenantId:  string | null;
  startDate: Date;
  endDate:   Date;
}

export interface ReconciliationReport {
  query: { branchId: string; startDate: string; endDate: string };
  checks: {
    missingSalePaymentLedger:    MissingLedgerItem[];
    missingRepairPaymentLedger:  MissingLedgerItem[];
    missingExpensePaymentLedger: MissingLedgerItem[];
    orphanLedgerEntries:         OrphanLedgerItem[];
    duplicateReferences:         DuplicateRefItem[];
    postCloseTransactions:       PostCloseItem[];
    unassignedCashEntries:       UnassignedItem[];
  };
  summary: {
    totalIssues:    number;
    generatedAt:    string;
  };
}

export interface MissingLedgerItem {
  sourceId:       string;
  referenceNumber: string;
  amount:         number;
  createdAt:      string;
}

export interface OrphanLedgerItem {
  ledgerId:      string;
  referenceType: string | null;
  referenceId:   string | null;
  amount:        number;
  createdAt:     string;
}

export interface DuplicateRefItem {
  referenceType: string;
  referenceId:   string;
  count:         number;
  ledgerIds:     string[];
}

export interface PostCloseItem {
  ledgerId:    string;
  sessionId:   string;
  sessionClosedAt: string;
  txCreatedAt: string;
  amount:      number;
}

export interface UnassignedItem {
  ledgerId:     string;
  sourceType:   string | null;
  referenceId:  string | null;
  amount:       number;
  createdAt:    string;
}

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  async runReport(query: ReconciliationQuery): Promise<ReconciliationReport> {
    const { branchId, tenantId, startDate, endDate } = query;
    const dateRange = { gte: startDate, lte: endDate };

    const [
      missingSalePaymentLedger,
      missingRepairPaymentLedger,
      missingExpensePaymentLedger,
      orphanLedgerEntries,
      duplicateReferences,
      postCloseTransactions,
      unassignedCashEntries,
    ] = await Promise.all([
      this.findMissingSalePaymentLedger(branchId, tenantId, dateRange),
      this.findMissingRepairPaymentLedger(branchId, tenantId, dateRange),
      this.findMissingExpensePaymentLedger(branchId, tenantId, dateRange),
      this.findOrphanLedgerEntries(branchId, tenantId, dateRange),
      this.findDuplicateReferences(branchId, tenantId, dateRange),
      this.findPostCloseTransactions(branchId, tenantId, dateRange),
      this.findUnassignedCashEntries(branchId, tenantId, dateRange),
    ]);

    const totalIssues =
      missingSalePaymentLedger.length +
      missingRepairPaymentLedger.length +
      missingExpensePaymentLedger.length +
      orphanLedgerEntries.length +
      duplicateReferences.length +
      postCloseTransactions.length +
      unassignedCashEntries.length;

    return {
      query: { branchId, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      checks: {
        missingSalePaymentLedger,
        missingRepairPaymentLedger,
        missingExpensePaymentLedger,
        orphanLedgerEntries,
        duplicateReferences,
        postCloseTransactions,
        unassignedCashEntries,
      },
      summary: { totalIssues, generatedAt: new Date().toISOString() },
    };
  }

  // ── Check 1: CASH sales without a corresponding ledger entry ─────────────

  private async findMissingSalePaymentLedger(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<MissingLedgerItem[]> {
    const cashSales = await this.prisma.sale.findMany({
      where: {
        branchId,
        paymentMethod: 'CASH',
        status:        { not: 'VOIDED' },
        createdAt:     dateRange,
      },
      select: { id: true, receiptNumber: true, total: true, createdAt: true },
    });
    if (cashSales.length === 0) return [];

    const ledgerRefs = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        branchId,
        referenceType: 'SALE_PAYMENT',
        referenceId:   { in: cashSales.map(s => s.id) },
      },
      select: { referenceId: true },
    });
    const covered = new Set(ledgerRefs.map(r => r.referenceId).filter(Boolean) as string[]);

    return cashSales
      .filter(s => !covered.has(s.id))
      .map(s => ({
        sourceId:        s.id,
        referenceNumber: s.receiptNumber,
        amount:          Number(s.total),
        createdAt:       s.createdAt.toISOString(),
      }));
  }

  // ── Check 2: CASH repair final payments without a ledger entry ────────────

  private async findMissingRepairPaymentLedger(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<MissingLedgerItem[]> {
    const cashRepairs = await this.prisma.repair.findMany({
      where: {
        branchId,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        paidAt:        dateRange,
      },
      select: { id: true, ticketNumber: true, paidAmount: true, paidAt: true },
    });
    if (cashRepairs.length === 0) return [];

    const ledgerRefs = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        branchId,
        referenceType: 'REPAIR_FINAL_PAYMENT',
        referenceId:   { in: cashRepairs.map(r => r.id) },
      },
      select: { referenceId: true },
    });
    const covered = new Set(ledgerRefs.map(r => r.referenceId).filter(Boolean) as string[]);

    return cashRepairs
      .filter(r => !covered.has(r.id))
      .map(r => ({
        sourceId:        r.id,
        referenceNumber: r.ticketNumber,
        amount:          Number(r.paidAmount ?? 0),
        createdAt:       (r.paidAt ?? new Date()).toISOString(),
      }));
  }

  // ── Check 3: CASH expenses without a ledger entry ─────────────────────────

  private async findMissingExpensePaymentLedger(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<MissingLedgerItem[]> {
    const cashExpenses = await this.prisma.expense.findMany({
      where: {
        branchId,
        paymentMethod: 'CASH',
        createdAt:     dateRange,
      },
      select: { id: true, description: true, amount: true, createdAt: true },
    });
    if (cashExpenses.length === 0) return [];

    const ledgerRefs = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        branchId,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId:   { in: cashExpenses.map(e => e.id) },
      },
      select: { referenceId: true },
    });
    const covered = new Set(ledgerRefs.map(r => r.referenceId).filter(Boolean) as string[]);

    return cashExpenses
      .filter(e => !covered.has(e.id))
      .map(e => ({
        sourceId:        e.id,
        referenceNumber: e.description ?? e.id,
        amount:          Number(e.amount),
        createdAt:       e.createdAt.toISOString(),
      }));
  }

  // ── Check 4: Ledger entries whose referenceId no longer has a business record ─

  private async findOrphanLedgerEntries(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<OrphanLedgerItem[]> {
    const entries = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        branchId,
        referenceId:   { not: null },
        referenceType: { not: null },
        createdAt:     dateRange,
      },
      select: {
        id: true, referenceType: true, referenceId: true,
        amount: true, createdAt: true,
      },
    });

    const orphans: OrphanLedgerItem[] = [];
    for (const entry of entries) {
      const refId   = entry.referenceId!;
      const refType = entry.referenceType!;
      let exists = false;

      if (refType === 'SALE_PAYMENT') {
        exists = !!(await this.prisma.sale.findUnique({ where: { id: refId }, select: { id: true } }));
      } else if (refType === 'REPAIR_FINAL_PAYMENT') {
        exists = !!(await this.prisma.repair.findUnique({ where: { id: refId }, select: { id: true } }));
      } else if (refType === 'EXPENSE_PAYMENT') {
        exists = !!(await this.prisma.expense.findUnique({ where: { id: refId }, select: { id: true } }));
      } else if (refType === 'REPAIR_ADDITIONAL_PAYMENT') {
        exists = !!(await this.prisma.repairAdditionalPayment.findUnique({ where: { id: refId }, select: { id: true } }));
      } else if (refType === 'SALE_REFUND') {
        exists = !!(await this.prisma.saleRefund.findUnique({ where: { id: refId }, select: { id: true } }));
      } else {
        exists = true; // unknown types are not checked
      }

      if (!exists) {
        orphans.push({
          ledgerId:      entry.id,
          referenceType: entry.referenceType,
          referenceId:   entry.referenceId,
          amount:        Number(entry.amount),
          createdAt:     entry.createdAt.toISOString(),
        });
      }
    }
    return orphans;
  }

  // ── Check 5: Multiple ledger entries referencing the same business record ──

  private async findDuplicateReferences(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<DuplicateRefItem[]> {
    // Group by referenceType + referenceId, find groups with count > 1
    // Exclude REVERSALs as they legitimately reference the original transaction
    const entries = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        branchId,
        referenceId:   { not: null },
        referenceType: { not: null },
        type:          { not: 'REVERSAL' },
        createdAt:     dateRange,
      },
      select: { id: true, referenceType: true, referenceId: true },
    });

    const groups = new Map<string, string[]>();
    for (const e of entries) {
      const key = `${e.referenceType}:${e.referenceId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e.id);
    }

    const duplicates: DuplicateRefItem[] = [];
    for (const [key, ids] of groups.entries()) {
      if (ids.length > 1) {
        const [referenceType, referenceId] = key.split(':');
        duplicates.push({ referenceType, referenceId, count: ids.length, ledgerIds: ids });
      }
    }
    return duplicates;
  }

  // ── Check 6: Ledger entries timestamped after their session's closedAt ───

  private async findPostCloseTransactions(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<PostCloseItem[]> {
    // Get closed sessions in the range
    const closedSessions = await this.prisma.cashDrawerSession.findMany({
      where: {
        branchId,
        status:   'CLOSED',
        closedAt: { not: null },
      },
      select: { id: true, closedAt: true },
    });
    if (closedSessions.length === 0) return [];

    const results: PostCloseItem[] = [];
    for (const session of closedSessions) {
      const closedAt = session.closedAt!;
      const postCloseTxs = await this.prisma.cashDrawerTransaction.findMany({
        where: {
          sessionId: session.id,
          createdAt: { gt: closedAt },
        },
        select: { id: true, amount: true, createdAt: true },
      });
      for (const tx of postCloseTxs) {
        results.push({
          ledgerId:        tx.id,
          sessionId:       session.id,
          sessionClosedAt: closedAt.toISOString(),
          txCreatedAt:     tx.createdAt.toISOString(),
          amount:          Number(tx.amount),
        });
      }
    }
    return results;
  }

  // ── Check 7: CASH ledger entries with no session (ALLOW_UNASSIGNED entries) ─

  private async findUnassignedCashEntries(
    branchId: string,
    tenantId: string | null,
    dateRange: { gte: Date; lte: Date },
  ): Promise<UnassignedItem[]> {
    const entries = await this.prisma.cashDrawerTransaction.findMany({
      where: {
        branchId,
        sessionId:    null,
        paymentMethod: 'CASH',
        createdAt:    dateRange,
      },
      select: { id: true, sourceType: true, referenceId: true, amount: true, createdAt: true },
    });
    return entries.map(e => ({
      ledgerId:    e.id,
      sourceType:  e.sourceType,
      referenceId: e.referenceId,
      amount:      Number(e.amount),
      createdAt:   e.createdAt.toISOString(),
    }));
  }
}
