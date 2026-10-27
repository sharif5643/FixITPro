import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ModulesService } from '../modules/modules.service';
import { JOURNAL_SOURCE } from '../journal/journal.service';
import { OpsAccountingAdapter } from '../journal/ops-accounting.adapter';
import { RepairAccountingAdapter } from '../repairs/repair-accounting.adapter';
import { ExpenseAccountingAdapter } from '../expenses/expense-accounting.adapter';
import { AccountingReconciliationService } from './accounting-reconciliation.service';

export interface CatchUpResult {
  enabled: boolean;
  repairs: number;
  sales: number;
  expenses: number;
  packageSales: number;
}

/**
 * Posts the journal entries a shop's books are missing: payments taken while its accounting was
 * on but could not be posted (a shop with no chart of accounts failed every posting until the
 * chart was created automatically). Only items with no entry are touched, every posting is
 * idempotent, so it is safe to run more than once. New entries are dated today.
 */
@Injectable()
export class BooksCatchUpService {
  private readonly logger = new Logger(BooksCatchUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly modules: ModulesService,
    private readonly repairs: RepairAccountingAdapter,
    private readonly expenses: ExpenseAccountingAdapter,
    private readonly ops: OpsAccountingAdapter,
    private readonly reconciliation: AccountingReconciliationService,
  ) {}

  /** What would be posted, without posting anything. */
  async preview(tenantId: string): Promise<CatchUpResult> {
    return this.run(tenantId, null, false);
  }

  async catchUp(tenantId: string, actorId: string | null): Promise<CatchUpResult> {
    return this.run(tenantId, actorId, true);
  }

  private async posted(tenantId: string, sourceType: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.prisma.journalEntry.findMany({
      where: { tenantId, sourceType, sourceId: { in: ids } },
      select: { sourceId: true },
    });
    return new Set(rows.map((r) => r.sourceId!).filter(Boolean));
  }

  private async run(tenantId: string, actorId: string | null, write: boolean): Promise<CatchUpResult> {
    const result: CatchUpResult = { enabled: false, repairs: 0, sales: 0, expenses: 0, packageSales: 0 };
    if (!tenantId || !await this.modules.isAccountingEnabled(tenantId)) return result;
    result.enabled = true;

    // ── Repairs: deposit, extra payments, then the final payment (with deposit settlement and parts cost)
    const repairs = await this.prisma.repair.findMany({
      where: { branch: { tenantId }, status: { not: 'CANCELLED' as any }, OR: [{ paidAt: { not: null } }, { deposit: { gt: 0 } }] },
      select: {
        id: true, ticketNumber: true, paidAmount: true, paymentMethod: true, paidAt: true,
        deposit: true, depositPaymentMethod: true, branchId: true,
        parts: { select: { id: true, costPrice: true, quantity: true, isVoided: true } },
        additionalPayments: { select: { id: true, amount: true, paymentMethod: true } },
      },
      orderBy: { receivedAt: 'asc' },
    });
    const ids = repairs.map((r) => r.id);
    const [deposits, finals, extras] = await Promise.all([
      this.posted(tenantId, JOURNAL_SOURCE.REPAIR_DEPOSIT, ids),
      this.posted(tenantId, JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT, ids),
      this.posted(tenantId, JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT, repairs.flatMap((r) => r.additionalPayments.map((p) => p.id))),
    ]);
    for (const r of repairs) {
      const needDeposit = Number(r.deposit) > 0 && !deposits.has(r.id);
      const needExtras = r.additionalPayments.filter((p) => !extras.has(p.id));
      const needFinal = !!r.paidAt && !finals.has(r.id);
      if (!needDeposit && !needExtras.length && !needFinal) continue;
      result.repairs++;
      if (!write) continue;
      if (needDeposit) await this.repairs.recordDepositJournal(r as any, r.depositPaymentMethod ?? 'CASH', tenantId, actorId);
      for (const p of needExtras) {
        await this.repairs.recordAdditionalPaymentJournal(
          { id: p.id, amount: p.amount, paymentMethod: p.paymentMethod as string },
          { id: r.id, ticketNumber: r.ticketNumber, branchId: r.branchId }, tenantId, actorId,
        );
      }
      if (needFinal) await this.repairs.recordFinalPaymentJournal(r as any, tenantId, actorId);
    }

    // ── Sales: the reconciliation rebuilds whatever a sale is missing
    const sales = await this.prisma.sale.findMany({
      where: { branch: { tenantId } },
      select: { id: true, payments: { select: { id: true } } },
    });
    const paidSales = await this.posted(tenantId, 'SALE_PAYMENT', sales.flatMap((s) => s.payments.map((p) => p.id)));
    for (const s of sales) {
      if (!s.payments.length || s.payments.every((p) => paidSales.has(p.id))) continue;
      result.sales++;
      if (write) await this.reconciliation.retrySale(s.id, tenantId, 'OWNER').catch((e) =>
        this.logger.warn(`Catch-up sale ${s.id}: ${(e as Error).message}`));
    }

    // ── Expenses that were not voided
    const expenses = await this.prisma.expense.findMany({
      where: { branch: { tenantId }, voidedAt: null },
      select: { id: true, description: true, amount: true, paymentMethod: true, branchId: true, category: { select: { code: true } } },
    });
    const paidExpenses = await this.posted(tenantId, JOURNAL_SOURCE.EXPENSE_PAYMENT, expenses.map((e) => e.id));
    for (const e of expenses) {
      if (paidExpenses.has(e.id)) continue;
      result.expenses++;
      if (write) await this.expenses.recordExpenseJournal({ ...e, paymentMethod: e.paymentMethod as string }, tenantId, actorId);
    }

    // ── SIM / package sales
    const packages = await this.prisma.packageSale.findMany({
      where: { tenantId },
      select: {
        id: true, receiptNumber: true, carrier: true, saleType: true, packageAmount: true, walletDeduction: true,
        profit: true, paymentMethod: true, creditAmount: true, shiftId: true,
      },
    });
    const paidPackages = await this.posted(tenantId, JOURNAL_SOURCE.PACKAGE_SALE, packages.map((p) => p.id));
    const shiftBranch = new Map(
      (await this.prisma.shift.findMany({
        where: { id: { in: packages.map((p) => p.shiftId).filter((x): x is string => !!x) } },
        select: { id: true, branchId: true },
      })).map((s) => [s.id, s.branchId]),
    );
    for (const p of packages) {
      if (paidPackages.has(p.id)) continue;
      result.packageSales++;
      if (!write) continue;
      await this.ops.recordPackageSale({
        tenantId, branchId: p.shiftId ? shiftBranch.get(p.shiftId) ?? null : null, actorId,
        sale: { ...p, carrier: p.carrier as string, saleType: p.saleType as string, paymentMethod: p.paymentMethod as string },
      }).catch((e) => this.logger.warn(`Catch-up package sale ${p.id}: ${(e as Error).message}`));
    }

    if (write) this.logger.log(`Books catch-up tenant=${tenantId}: ${JSON.stringify(result)}`);
    return result;
  }
}
