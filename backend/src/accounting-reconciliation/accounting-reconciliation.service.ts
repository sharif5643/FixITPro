import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { SalesAccountingAdapter } from '../sales/sales-accounting.adapter';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaleJournalStatus =
  | 'POSTED'
  | 'MISSING_REVENUE'
  | 'MISSING_COGS'
  | 'PARTIAL'
  | 'VOID_MISSING'
  | 'REFUND_MISSING'
  | 'ERROR';

export interface SaleReconciliationItem {
  saleId:         string;
  receiptNumber:  string;
  status:         SaleJournalStatus;
  missingRevenue: string[];   // SalePayment.ids with no SALE_PAYMENT journal
  missingCogs:    string[];   // SaleItem.ids with no SALE_COGS journal
  voidMissing:    boolean;    // voided sale with un-reversed journal(s)
  refundsMissing: string[];   // SaleRefund.ids or COGS_REVERSAL composite keys
  errors:         string[];   // amount-mismatch descriptions (manual review needed)
  recovered:      boolean;    // true if auto-recovery was attempted and succeeded
}

// ── Phase 4B.4G: Repair reconciliation ───────────────────────────────────────

export type RepairJournalStatus = 'POSTED' | 'MISSING' | 'ERROR' | 'NOT_APPLICABLE';

export interface RepairReconciliationItem {
  repairId:      string;
  ticketNumber:  string;
  status:        RepairJournalStatus;
  missingEvents: string[];   // e.g. 'REPAIR_DEPOSIT', 'REPAIR_FINAL_PAYMENT:partId'
  errors:        string[];   // amount-mismatch descriptions
}

// ── Phase 4B.4G: Expense reconciliation ──────────────────────────────────────

export type ExpenseJournalStatus = 'POSTED' | 'MISSING' | 'ERROR' | 'NOT_APPLICABLE';

export interface ExpenseReconciliationItem {
  expenseId:     string;
  status:        ExpenseJournalStatus;
  missingEvents: string[];   // 'EXPENSE_PAYMENT' | 'EXPENSE_REVERSAL'
  errors:        string[];
}

// ── Summary + Report ──────────────────────────────────────────────────────────

export interface ReconciliationSummary {
  scanned:       number;
  posted:        number;
  missing:       number;
  recovered:     number;
  errors:        number;
  notApplicable: number;  // scanned items where no journals were expected
}

export interface ReconciliationReport {
  scannedAt:    string;
  tenantId:     string | null;
  activationTs: string;
  summary:      ReconciliationSummary;
  items:        SaleReconciliationItem[];      // POS sales
  repairItems:  RepairReconciliationItem[];    // Phase 4B.4G
  expenseItems: ExpenseReconciliationItem[];   // Phase 4B.4G
}

// Fail-closed allowlist result — no ambiguous null semantics.
type AllowlistResult =
  | { mode: 'DISABLED' }                            // no allowlist set → nobody enabled
  | { mode: 'TENANT_LIST'; tenantIds: string[] }    // explicit pilot list
  | { mode: 'ALL_TENANTS' };                        // '*' sentinel → explicit full-rollout

type ActivationCheck =
  | { ok: true;  date: Date }
  | { ok: false; reason: 'MISSING' | 'INVALID' | 'TOO_OLD'; message: string };

// ── Constants ─────────────────────────────────────────────────────────────────

// Reconciliation scan is blocked if the activation timestamp is older than this.
// Prevents an accidentally far-past timestamp from backfilling all historical transactions.
const ACTIVATION_MAX_AGE_HOURS = 24;
const ACTIVATION_MAX_AGE_MS    = ACTIVATION_MAX_AGE_HOURS * 60 * 60 * 1000;

const BATCH_SIZE = 100; // max records to scan per tenant per cron run

// ── Repair source types that use Repair.id as sourceId ───────────────────────
const REPAIR_ID_SOURCE_TYPES = [
  'REPAIR_DEPOSIT',
  'REPAIR_FINAL_PAYMENT',
  'REPAIR_DEPOSIT_SETTLE',
  'REPAIR_PAYMENT_REVERSAL',
  'REPAIR_DEPOSIT_SETTLE_REVERSAL',
  'REPAIR_DEPOSIT_REFUND',  // Phase 4B.4J — deposit refund on cancellation
];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AccountingReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(AccountingReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesAccounting: SalesAccountingAdapter,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePermissions();
  }

  // ── Scheduled scan ────────────────────────────────────────────────────────

  @Cron('0 */15 * * * *')
  async scheduledScan(): Promise<void> {
    if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return;
    this.logger.log('AccountingReconciliationService: scheduled scan starting');
    try {
      const result = await this.runReconciliation();
      this.logger.log(
        `Scheduled scan complete: scanned=${result.summary.scanned} ` +
        `posted=${result.summary.posted} recovered=${result.summary.recovered} ` +
        `errors=${result.summary.errors}`,
      );
    } catch (err) {
      this.logger.error('Scheduled reconciliation scan failed', err);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async runReconciliation(options?: { tenantId?: string }): Promise<ReconciliationReport> {
    if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') {
      return this.emptyReport(options?.tenantId ?? null);
    }

    // Phase 4B.2.2: validate activation timestamp before scanning.
    // Fail if missing, invalid, or older than the 24-hour safety window.
    const activation = this.validateActivationTimestamp();
    if (activation.ok === false) {
      if (activation.reason === 'TOO_OLD') {
        this.logger.error(
          'Accounting activation timestamp is older than allowed safety window; reconciliation blocked.',
        );
      } else {
        this.logger.error(
          `AccountingReconciliationService: ${activation.message} — scan skipped.`,
        );
      }
      return this.emptyReport(options?.tenantId ?? null);
    }
    const activationTs = activation.date;

    if (options?.tenantId) {
      return this.scanTenants([options.tenantId], activationTs, options.tenantId);
    }

    // Phase 4B.2.2: fail-closed allowlist.
    // DISABLED (absent/empty) → log warning, return empty (nobody enabled).
    // TENANT_LIST → scan only listed tenants.
    // ALL_TENANTS ('*') → log warning, scan all tenants.
    const allowlist = this.getEnabledTenantIds();

    if (allowlist.mode === 'DISABLED') {
      this.logger.warn(
        'Accounting core enabled but no tenant allowlist configured; accounting remains disabled.',
      );
      return this.emptyReport(null);
    }

    if (allowlist.mode === 'ALL_TENANTS') {
      this.logger.warn('Accounting full rollout explicitly enabled.');
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      return this.scanTenants(tenants.map((t) => t.id), activationTs, null);
    }

    // TENANT_LIST mode
    return this.scanTenants(allowlist.tenantIds, activationTs, null);
  }

  async retrySale(
    saleId:        string,
    callerTenantId: string,
    callerRole:     string,
  ): Promise<SaleReconciliationItem> {
    const sale = await this.prisma.sale.findUnique({
      where:   { id: saleId },
      include: {
        payments: true,
        items:    true,
        refunds:  { include: { items: true } },
        branch:   { select: { tenantId: true } },
      },
    });

    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);

    const saleTenantId = sale.branch?.tenantId;
    if (callerRole !== 'SUPER_ADMIN' && saleTenantId !== callerTenantId) {
      throw new ForbiddenException('Access denied: sale belongs to a different tenant');
    }

    const effectiveTenantId = saleTenantId ?? callerTenantId;

    // Build journal index for this single sale
    const paymentIds    = sale.payments.map((p) => p.id);
    const itemIds       = sale.items.filter((i) => Number(i.costPrice) > 0).map((i) => i.id);
    const refundIds     = sale.refunds.map((r) => r.id);
    const refundCogsIds = sale.refunds.flatMap((r) =>
      r.items.map((ri) => `${r.id}:${ri.saleItemId}`),
    );

    const orClauses = [
      ...(paymentIds.length    ? [{ sourceType: 'SALE_PAYMENT',    sourceId: { in: paymentIds    } }] : []),
      ...(itemIds.length       ? [{ sourceType: 'SALE_COGS',        sourceId: { in: itemIds       } }] : []),
      ...(refundIds.length     ? [{ sourceType: 'SALE_REFUND',      sourceId: { in: refundIds     } }] : []),
      ...(refundCogsIds.length ? [{ sourceType: 'SALE_REFUND_COGS', sourceId: { in: refundCogsIds } }] : []),
    ];

    const journals = orClauses.length > 0
      ? await this.prisma.journalEntry.findMany({
          where:   { tenantId: effectiveTenantId, OR: orClauses },
          include: { lines: true },
        })
      : [];

    const allJournalIds = journals.map((j) => j.id);
    const reversals = allJournalIds.length > 0
      ? await this.prisma.journalEntry.findMany({
          where: {
            tenantId:   effectiveTenantId,
            sourceType: 'JOURNAL_REVERSAL',
            sourceId:   { in: allJournalIds },
          },
        })
      : [];

    const journalIndex = this.buildIndex([...journals, ...reversals]);
    const item = this.classifySale(sale, journalIndex);

    if (item.status !== 'POSTED' && item.status !== 'ERROR') {
      await this.recoverSale(sale, effectiveTenantId, item);
    }

    return item;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async ensurePermissions(): Promise<void> {
    try {
      await this.prisma.rolePermission.createMany({
        data:           [{ role: 'OWNER', permission: 'accounting.admin' }],
        skipDuplicates: true,
      });
    } catch {
      // Non-fatal: permission seeding is best-effort
    }
  }

  // Returns DISABLED when no allowlist is configured (fail-closed: nobody enabled).
  // Returns ALL_TENANTS only when the '*' sentinel is explicitly set.
  private getEnabledTenantIds(): AllowlistResult {
    const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
    if (!raw) return { mode: 'DISABLED' };
    if (raw === '*') return { mode: 'ALL_TENANTS' };
    const tenantIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return { mode: 'TENANT_LIST', tenantIds };
  }

  // Validates ACCOUNTING_ACTIVATION_TIMESTAMP.
  // Returns ok=false if missing, unparseable, or older than ACTIVATION_MAX_AGE_HOURS.
  // The 24-hour guard prevents an accidentally far-past date from backfilling historical transactions.
  private validateActivationTimestamp(): ActivationCheck {
    const ts = process.env.ACCOUNTING_ACTIVATION_TIMESTAMP;
    if (!ts) {
      return {
        ok:     false,
        reason: 'MISSING',
        message: 'ACCOUNTING_ACTIVATION_TIMESTAMP not set',
      };
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) {
      return {
        ok:      false,
        reason:  'INVALID',
        message: `ACCOUNTING_ACTIVATION_TIMESTAMP "${ts}" is not a valid ISO 8601 date`,
      };
    }
    const ageMs = Date.now() - d.getTime();
    if (ageMs > ACTIVATION_MAX_AGE_MS) {
      return {
        ok:      false,
        reason:  'TOO_OLD',
        message: `ACCOUNTING_ACTIVATION_TIMESTAMP is ${Math.round(ageMs / 3_600_000)}h old, exceeds ${ACTIVATION_MAX_AGE_HOURS}h safety window`,
      };
    }
    return { ok: true, date: d };
  }

  private async scanTenants(
    tenantIds:      string[],
    activationTs:   Date,
    scopedTenantId: string | null,
  ): Promise<ReconciliationReport> {
    const allSaleItems:    SaleReconciliationItem[]    = [];
    const allRepairItems:  RepairReconciliationItem[]  = [];
    const allExpenseItems: ExpenseReconciliationItem[] = [];

    for (const tenantId of tenantIds) {
      const branches = await this.prisma.branch.findMany({
        where:  { tenantId },
        select: { id: true },
      });
      if (branches.length === 0) continue;

      const branchIds = branches.map((b) => b.id);

      // ── POS sale scan (unchanged) ────────────────────────────────────────
      const sales = await this.prisma.sale.findMany({
        where: {
          branchId:  { in: branchIds },
          createdAt: { gte: activationTs },
        },
        include: {
          payments: true,
          items:    true,
          refunds:  { include: { items: true } },
        },
        take:    BATCH_SIZE,
        orderBy: { createdAt: 'asc' },
      });

      if (sales.length > 0) {
        const paymentIds    = sales.flatMap((s) => s.payments.map((p) => p.id));
        const itemIds       = sales.flatMap((s) =>
          s.items.filter((i) => Number(i.costPrice) > 0).map((i) => i.id),
        );
        const refundIds     = sales.flatMap((s) => s.refunds.map((r) => r.id));
        const refundCogsIds = sales.flatMap((s) =>
          s.refunds.flatMap((r) => r.items.map((ri) => `${r.id}:${ri.saleItemId}`)),
        );

        const saleOrClauses = [
          ...(paymentIds.length    ? [{ sourceType: 'SALE_PAYMENT',    sourceId: { in: paymentIds    } }] : []),
          ...(itemIds.length       ? [{ sourceType: 'SALE_COGS',        sourceId: { in: itemIds       } }] : []),
          ...(refundIds.length     ? [{ sourceType: 'SALE_REFUND',      sourceId: { in: refundIds     } }] : []),
          ...(refundCogsIds.length ? [{ sourceType: 'SALE_REFUND_COGS', sourceId: { in: refundCogsIds } }] : []),
        ];

        const saleJournals = saleOrClauses.length > 0
          ? await this.prisma.journalEntry.findMany({
              where:   { tenantId, OR: saleOrClauses },
              include: { lines: true },
            })
          : [];

        const saleJournalIds = saleJournals.map((j) => j.id);
        const saleReversals = saleJournalIds.length > 0
          ? await this.prisma.journalEntry.findMany({
              where: {
                tenantId,
                sourceType: 'JOURNAL_REVERSAL',
                sourceId:   { in: saleJournalIds },
              },
            })
          : [];

        const saleIndex = this.buildIndex([...saleJournals, ...saleReversals]);

        for (const sale of sales) {
          const item = this.classifySale(sale, saleIndex);
          allSaleItems.push(item);

          if (item.status !== 'POSTED' && item.status !== 'ERROR') {
            await this.recoverSale(sale, tenantId, item);
          }
        }
      }

      // ── Repair scan (Phase 4B.4G) ────────────────────────────────────────
      const repairItems = await this.scanRepairs(branchIds, tenantId, activationTs);
      allRepairItems.push(...repairItems);

      // ── Expense scan (Phase 4B.4G) ───────────────────────────────────────
      const expenseItems = await this.scanExpenses(branchIds, tenantId, activationTs);
      allExpenseItems.push(...expenseItems);
    }

    // ── Summary (aggregated across all transaction types) ─────────────────
    const allItems = [...allSaleItems, ...allRepairItems, ...allExpenseItems];
    const summary: ReconciliationSummary = {
      scanned:       allItems.length,
      posted:        allSaleItems.filter((i) => i.status === 'POSTED').length
                   + allRepairItems.filter((i)  => i.status === 'POSTED').length
                   + allExpenseItems.filter((i) => i.status === 'POSTED').length,
      missing:       allSaleItems.filter((i) => i.status !== 'POSTED' && i.status !== 'ERROR').length
                   + allRepairItems.filter((i)  => i.status === 'MISSING').length
                   + allExpenseItems.filter((i) => i.status === 'MISSING').length,
      recovered:     allSaleItems.filter((i) => i.recovered).length,
      errors:        allSaleItems.filter((i) => i.status === 'ERROR').length
                   + allRepairItems.filter((i)  => i.status === 'ERROR').length
                   + allExpenseItems.filter((i) => i.status === 'ERROR').length,
      notApplicable: allRepairItems.filter((i)  => i.status === 'NOT_APPLICABLE').length
                   + allExpenseItems.filter((i) => i.status === 'NOT_APPLICABLE').length,
    };

    return {
      scannedAt:    new Date().toISOString(),
      tenantId:     scopedTenantId,
      activationTs: activationTs.toISOString(),
      summary,
      items:        allSaleItems,
      repairItems:  allRepairItems,
      expenseItems: allExpenseItems,
    };
  }

  // ── Repair scan ───────────────────────────────────────────────────────────

  private async scanRepairs(
    branchIds:    string[],
    tenantId:     string,
    activationTs: Date,
  ): Promise<RepairReconciliationItem[]> {
    const repairs = await this.prisma.repair.findMany({
      where: {
        branchId:   { in: branchIds },
        receivedAt: { gte: activationTs },
      },
      select: {
        id:            true,
        ticketNumber:  true,
        deposit:       true,
        paidAmount:    true,
        status:        true,
        parts: {
          select: { id: true, costPrice: true, quantity: true, isVoided: true },
        },
        additionalPayments: {
          select: { id: true, amount: true },
        },
        paymentReversals: {
          select: { id: true },
        },
      },
      take:    BATCH_SIZE,
      orderBy: { receivedAt: 'asc' },
    });

    if (repairs.length === 0) return [];

    // Collect all sourceIds that might have journals for these repairs
    const repairIds  = repairs.map((r) => r.id);
    const partIds    = repairs.flatMap((r) =>
      r.parts.filter((p) => !p.isVoided && Number(p.costPrice ?? 0) > 0).map((p) => p.id),
    );
    const paymentIds = repairs.flatMap((r) => r.additionalPayments.map((p) => p.id));

    const orClauses: any[] = [
      { sourceType: { in: REPAIR_ID_SOURCE_TYPES }, sourceId: { in: repairIds } },
      ...(partIds.length    > 0 ? [{ sourceType: 'REPAIR_COGS',               sourceId: { in: partIds    } }] : []),
      ...(paymentIds.length > 0 ? [{ sourceType: 'REPAIR_ADDITIONAL_PAYMENT', sourceId: { in: paymentIds } }] : []),
    ];

    const journals = await this.prisma.journalEntry.findMany({
      where:   { tenantId, OR: orClauses },
      include: { lines: true },
    });

    const journalIndex = this.buildIndex(journals);

    return repairs.map((repair) => this.classifyRepair(repair as any, journalIndex));
  }

  private classifyRepair(repair: any, journalIndex: Map<string, any>): RepairReconciliationItem {
    const deposit      = Number(repair.deposit ?? 0);
    const paidAmount   = Number(repair.paidAmount ?? 0);
    const isDelivered  = repair.status === 'DELIVERED';
    const isCancelled  = repair.status === 'CANCELLED';
    const hasReversal  = (repair.paymentReversals ?? []).length > 0;
    const activeParts  = (repair.parts ?? []).filter(
      (p: any) => !p.isVoided && Number(p.costPrice ?? 0) > 0,
    );

    const missingEvents: string[] = [];
    const errors:        string[] = [];
    let anyExpected = false;

    // REPAIR_DEPOSIT — expected whenever a deposit was taken
    if (deposit > 0) {
      anyExpected = true;
      const j = journalIndex.get(`REPAIR_DEPOSIT:${repair.id}`);
      if (!j) {
        missingEvents.push('REPAIR_DEPOSIT');
      } else {
        const debitSum = this.sumDebit(j);
        if (Math.abs(debitSum - deposit) > 0.01) {
          errors.push(`REPAIR_DEPOSIT amount mismatch for repair ${repair.id}: expected ${deposit}, got ${debitSum}`);
        }
      }
    }

    // REPAIR_FINAL_PAYMENT — expected when repair is DELIVERED and paidAmount > 0
    if (isDelivered && paidAmount > 0) {
      anyExpected = true;
      const j = journalIndex.get(`REPAIR_FINAL_PAYMENT:${repair.id}`);
      if (!j) {
        missingEvents.push('REPAIR_FINAL_PAYMENT');
      } else {
        const debitSum = this.sumDebit(j);
        if (Math.abs(debitSum - paidAmount) > 0.01) {
          errors.push(`REPAIR_FINAL_PAYMENT amount mismatch for repair ${repair.id}: expected ${paidAmount}, got ${debitSum}`);
        }
      }
    }

    // REPAIR_DEPOSIT_SETTLE — expected when delivered AND deposit > 0
    if (isDelivered && deposit > 0) {
      anyExpected = true;
      const j = journalIndex.get(`REPAIR_DEPOSIT_SETTLE:${repair.id}`);
      if (!j) {
        missingEvents.push('REPAIR_DEPOSIT_SETTLE');
      } else {
        const debitSum = this.sumDebit(j);
        if (Math.abs(debitSum - deposit) > 0.01) {
          errors.push(`REPAIR_DEPOSIT_SETTLE amount mismatch for repair ${repair.id}: expected ${deposit}, got ${debitSum}`);
        }
      }
    }

    // REPAIR_COGS — expected per active part when repair is DELIVERED
    if (isDelivered) {
      for (const part of activeParts) {
        anyExpected = true;
        const expected = Number(part.costPrice ?? 0) * part.quantity;
        const j = journalIndex.get(`REPAIR_COGS:${part.id}`);
        if (!j) {
          missingEvents.push(`REPAIR_COGS:${part.id}`);
        } else {
          const debitSum = this.sumDebit(j);
          if (Math.abs(debitSum - expected) > 0.01) {
            errors.push(`REPAIR_COGS amount mismatch for part ${part.id}: expected ${expected}, got ${debitSum}`);
          }
        }
      }
    }

    // REPAIR_ADDITIONAL_PAYMENT — expected per additional payment record
    for (const payment of (repair.additionalPayments ?? [])) {
      anyExpected = true;
      const expected = Number(payment.amount ?? 0);
      const j = journalIndex.get(`REPAIR_ADDITIONAL_PAYMENT:${payment.id}`);
      if (!j) {
        missingEvents.push(`REPAIR_ADDITIONAL_PAYMENT:${payment.id}`);
      } else {
        const debitSum = this.sumDebit(j);
        if (Math.abs(debitSum - expected) > 0.01) {
          errors.push(`REPAIR_ADDITIONAL_PAYMENT amount mismatch for payment ${payment.id}: expected ${expected}, got ${debitSum}`);
        }
      }
    }

    // REPAIR_PAYMENT_REVERSAL — expected when a payment reversal exists
    if (hasReversal) {
      anyExpected = true;
      if (!journalIndex.get(`REPAIR_PAYMENT_REVERSAL:${repair.id}`)) {
        missingEvents.push('REPAIR_PAYMENT_REVERSAL');
      }
    }

    // REPAIR_DEPOSIT_SETTLE_REVERSAL — expected when reversal exists AND deposit settle was posted
    if (hasReversal && deposit > 0 && journalIndex.get(`REPAIR_DEPOSIT_SETTLE:${repair.id}`)) {
      anyExpected = true;
      if (!journalIndex.get(`REPAIR_DEPOSIT_SETTLE_REVERSAL:${repair.id}`)) {
        missingEvents.push('REPAIR_DEPOSIT_SETTLE_REVERSAL');
      }
    }

    // REPAIR_DEPOSIT_REFUND — expected when CANCELLED, deposit > 0, and original REPAIR_DEPOSIT was posted.
    // (If REPAIR_DEPOSIT was never posted, there is no liability to reverse — skip refund expectation.)
    if (isCancelled && deposit > 0 && journalIndex.get(`REPAIR_DEPOSIT:${repair.id}`)) {
      anyExpected = true;
      const refundJe = journalIndex.get(`REPAIR_DEPOSIT_REFUND:${repair.id}`);
      if (!refundJe) {
        missingEvents.push('REPAIR_DEPOSIT_REFUND');
      } else {
        const debitSum = this.sumDebit(refundJe);
        if (Math.abs(debitSum - deposit) > 0.01) {
          errors.push(`REPAIR_DEPOSIT_REFUND amount mismatch for repair ${repair.id}: expected ${deposit}, got ${debitSum}`);
        }
      }
    }

    if (!anyExpected) {
      return { repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'NOT_APPLICABLE', missingEvents: [], errors: [] };
    }
    if (errors.length > 0) {
      return { repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'ERROR', missingEvents, errors };
    }
    if (missingEvents.length > 0) {
      return { repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'MISSING', missingEvents, errors: [] };
    }
    return { repairId: repair.id, ticketNumber: repair.ticketNumber, status: 'POSTED', missingEvents: [], errors: [] };
  }

  // ── Expense scan ──────────────────────────────────────────────────────────

  private async scanExpenses(
    branchIds:    string[],
    tenantId:     string,
    activationTs: Date,
  ): Promise<ExpenseReconciliationItem[]> {
    const expenses = await this.prisma.expense.findMany({
      where: {
        branchId:  { in: branchIds },
        createdAt: { gte: activationTs },
      },
      select: {
        id:       true,
        amount:   true,
        voidedAt: true,
        branchId: true,
      },
      take:    BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (expenses.length === 0) return [];

    const expenseIds = expenses.map((e) => e.id);
    const journals   = await this.prisma.journalEntry.findMany({
      where: {
        tenantId,
        sourceType: { in: ['EXPENSE_PAYMENT', 'EXPENSE_REVERSAL'] },
        sourceId:   { in: expenseIds },
      },
      include: { lines: true },
    });

    const journalIndex = this.buildIndex(journals);

    return expenses.map((expense) => this.classifyExpense(expense as any, journalIndex));
  }

  private classifyExpense(expense: any, journalIndex: Map<string, any>): ExpenseReconciliationItem {
    // An expense with no branchId could not have a tenantId resolved — not applicable
    if (!expense.branchId) {
      return { expenseId: expense.id, status: 'NOT_APPLICABLE', missingEvents: [], errors: [] };
    }

    const amount       = Number(expense.amount ?? 0);
    const isVoided     = !!expense.voidedAt;
    const missingEvents: string[] = [];
    const errors:        string[] = [];

    // EXPENSE_PAYMENT — always expected for a branchId-scoped expense
    const paymentJe = journalIndex.get(`EXPENSE_PAYMENT:${expense.id}`);
    if (!paymentJe) {
      missingEvents.push('EXPENSE_PAYMENT');
    } else {
      const debitSum = this.sumDebit(paymentJe);
      if (Math.abs(debitSum - amount) > 0.01) {
        errors.push(`EXPENSE_PAYMENT amount mismatch for expense ${expense.id}: expected ${amount}, got ${debitSum}`);
      }
    }

    // EXPENSE_REVERSAL — expected only for voided expenses
    if (isVoided) {
      const reversalJe = journalIndex.get(`EXPENSE_REVERSAL:${expense.id}`);
      if (!reversalJe) {
        missingEvents.push('EXPENSE_REVERSAL');
      } else {
        const debitSum = this.sumDebit(reversalJe);
        if (Math.abs(debitSum - amount) > 0.01) {
          errors.push(`EXPENSE_REVERSAL amount mismatch for expense ${expense.id}: expected ${amount}, got ${debitSum}`);
        }
      }
    }

    if (errors.length > 0) {
      return { expenseId: expense.id, status: 'ERROR', missingEvents, errors };
    }
    if (missingEvents.length > 0) {
      return { expenseId: expense.id, status: 'MISSING', missingEvents, errors: [] };
    }
    return { expenseId: expense.id, status: 'POSTED', missingEvents: [], errors: [] };
  }

  // ── POS classification (unchanged) ────────────────────────────────────────

  private buildIndex(journals: any[]): Map<string, any> {
    const index = new Map<string, any>();
    for (const j of journals) {
      index.set(`${j.sourceType}:${j.sourceId}`, j);
    }
    return index;
  }

  private sumDebit(journal: any): number {
    return (journal.lines ?? [])
      .filter((l: any) => Number(l.debit) > 0)
      .reduce((s: number, l: any) => s + Number(l.debit), 0);
  }

  private classifySale(sale: any, journalIndex: Map<string, any>): SaleReconciliationItem {
    const missingRevenue: string[] = [];
    const missingCogs:    string[] = [];
    const refundsMissing: string[] = [];
    const errors:         string[] = [];
    let voidMissing = false;

    if (sale.status === 'VOIDED') {
      for (const leg of sale.payments) {
        const payJournal = journalIndex.get(`SALE_PAYMENT:${leg.id}`);
        if (payJournal && !payJournal.isVoided) {
          if (!journalIndex.get(`JOURNAL_REVERSAL:${payJournal.id}`)) voidMissing = true;
        }
      }
      for (const saleItem of sale.items) {
        const cogsJournal = journalIndex.get(`SALE_COGS:${saleItem.id}`);
        if (cogsJournal && !cogsJournal.isVoided) {
          if (!journalIndex.get(`JOURNAL_REVERSAL:${cogsJournal.id}`)) voidMissing = true;
        }
      }
      return this.makeItem(sale, voidMissing ? 'VOID_MISSING' : 'POSTED', [], [], voidMissing, [], []);
    }

    // Non-voided sale: check revenue, COGS, and refund journals
    for (const leg of sale.payments) {
      const j = journalIndex.get(`SALE_PAYMENT:${leg.id}`);
      if (!j) {
        missingRevenue.push(leg.id);
      } else if (leg.paymentMethod !== 'CASH') {
        const debitSum = j.lines
          .filter((l: any) => Number(l.debit) > 0)
          .reduce((s: number, l: any) => s + Number(l.debit), 0);
        if (Math.abs(debitSum - Number(leg.amount)) > 0.01) {
          errors.push(`Revenue mismatch for payment ${leg.id}: expected ${leg.amount}, got ${debitSum}`);
        }
      }
    }

    for (const saleItem of sale.items) {
      if (Number(saleItem.costPrice) <= 0) continue; // zero-cost: no COGS journal expected
      const j = journalIndex.get(`SALE_COGS:${saleItem.id}`);
      if (!j) {
        missingCogs.push(saleItem.id);
      } else {
        const expected = Number(saleItem.costPrice) * saleItem.quantity;
        const debitSum = j.lines
          .filter((l: any) => Number(l.debit) > 0)
          .reduce((s: number, l: any) => s + Number(l.debit), 0);
        if (Math.abs(debitSum - expected) > 0.01) {
          errors.push(`COGS mismatch for item ${saleItem.id}: expected ${expected}, got ${debitSum}`);
        }
      }
    }

    for (const refund of sale.refunds) {
      const j = journalIndex.get(`SALE_REFUND:${refund.id}`);
      if (!j) {
        refundsMissing.push(refund.id);
      } else {
        for (const ri of refund.items) {
          const compositeId = `${refund.id}:${ri.saleItemId}`;
          const saleItem = sale.items.find((si: any) => si.id === ri.saleItemId);
          if (saleItem && Number(saleItem.costPrice) > 0) {
            if (!journalIndex.get(`SALE_REFUND_COGS:${compositeId}`)) {
              refundsMissing.push(`COGS_REVERSAL:${compositeId}`);
            }
          }
        }
      }
    }

    // Priority: ERROR > PARTIAL > single-category missing > POSTED
    if (errors.length > 0) {
      return this.makeItem(sale, 'ERROR', missingRevenue, missingCogs, false, refundsMissing, errors);
    }

    const hasRevenueMissing = missingRevenue.length > 0;
    const hasCogsMissing    = missingCogs.length > 0;
    const hasRefundMissing  = refundsMissing.length > 0;

    if (!hasRevenueMissing && !hasCogsMissing && !hasRefundMissing) {
      return this.makeItem(sale, 'POSTED', [], [], false, [], []);
    }

    const categoryCount = [hasRevenueMissing, hasCogsMissing, hasRefundMissing].filter(Boolean).length;
    if (categoryCount > 1) {
      return this.makeItem(sale, 'PARTIAL', missingRevenue, missingCogs, false, refundsMissing, []);
    }

    if (hasRevenueMissing) return this.makeItem(sale, 'MISSING_REVENUE',  missingRevenue, [],         false, [],            []);
    if (hasCogsMissing)    return this.makeItem(sale, 'MISSING_COGS',     [],            missingCogs, false, [],            []);
    return                        this.makeItem(sale, 'REFUND_MISSING',   [],            [],         false, refundsMissing, []);
  }

  private makeItem(
    sale:           any,
    status:         SaleJournalStatus,
    missingRevenue: string[],
    missingCogs:    string[],
    voidMissing:    boolean,
    refundsMissing: string[],
    errors:         string[],
  ): SaleReconciliationItem {
    return {
      saleId:        sale.id,
      receiptNumber: sale.receiptNumber,
      status,
      missingRevenue,
      missingCogs,
      voidMissing,
      refundsMissing,
      errors,
      recovered:     false,
    };
  }

  private async recoverSale(
    sale:     any,
    tenantId: string,
    item:     SaleReconciliationItem,
  ): Promise<void> {
    try {
      if (sale.status === 'VOIDED') {
        // Missing void reversal: try to reverse existing journals
        await this.salesAccounting.reverseSaleJournal(sale, tenantId, null);
      } else {
        // Missing sale journal(s): create/recover via adapter (idempotent)
        await this.salesAccounting.recordSaleJournal(sale, tenantId, null);

        // Recover any missing refund journals
        for (const refund of sale.refunds) {
          const refundData = {
            id:            refund.id,
            totalRefund:   refund.totalRefund,
            paymentMethod: refund.paymentMethod,
            saleId:        sale.id,
          };
          const refundItems = refund.items.map((ri: any) => ({
            saleItemId: ri.saleItemId,
            quantity:   ri.quantity,
          }));
          await this.salesAccounting.recordRefundJournal(refundData, sale, refundItems, tenantId, null);
        }
      }
      item.recovered = true;
    } catch (err) {
      // Adapter methods should never throw; this catch is a belt-and-suspenders guard.
      this.logger.error(`recoverSale failed for saleId=${sale.id}`, err);
    }
  }

  private emptyReport(tenantId: string | null): ReconciliationReport {
    return {
      scannedAt:    new Date().toISOString(),
      tenantId,
      activationTs: '',
      summary:      { scanned: 0, posted: 0, missing: 0, recovered: 0, errors: 0, notApplicable: 0 },
      items:        [],
      repairItems:  [],
      expenseItems: [],
    };
  }
}
