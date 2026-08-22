import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalService, JOURNAL_SOURCE } from '../journal/journal.service';
import { ModulesService } from '../modules/modules.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

// ── Minimal types for the Expense data the adapter needs ─────────────────────

export interface ExpenseCategoryForAccounting {
  code: string | null;
}

export interface ExpenseForAccounting {
  id:            string;
  description:   string;
  amount:        Prisma.Decimal | number | string;
  paymentMethod: string;   // CASH | TRANSFER | CARD
  branchId:      string | null;
  category:      ExpenseCategoryForAccounting | null;
}

// ── Category → Account mapping ────────────────────────────────────────────────
//
// Pilot COA has two expense accounts:
//   6100 Operating Expenses — rent, utilities, salary, marketing, supplies, maintenance, shipping
//   6200 Other Expenses     — misc (and any future unclassified categories)
//
// Rule: category.code === 'misc'  → 6200
//       everything else           → 6100  (including unknown custom tenant categories)

export function expenseAccountCode(categoryCode: string | null | undefined): string {
  return categoryCode === 'misc'
    ? ACCOUNT_CODES.OTHER_EXPENSE
    : ACCOUNT_CODES.OPERATING_EXPENSE;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * ExpenseAccountingAdapter — post-commit bridge from Expense service to double-entry journal.
 *
 * Status: IMPLEMENTED, NOT WIRED.
 * ExpensesService does NOT call this adapter yet — wiring is Phase 4B.4E.
 *
 * Journal mappings:
 *
 *   EXPENSE_PAYMENT  DR 6100/6200 (category)  CR 1100/1120 (payment method)
 *   EXPENSE_REVERSAL DR 1100/1120 (payment method)  CR 6100/6200 (category)
 *
 * All public methods:
 *   - Gated by isEnabledForTenant() — no-op when accounting is disabled.
 *   - NEVER throw back to the caller.
 *   - Idempotent: (sourceType, sourceId, tenantId) uniqueness enforced at DB level.
 */
@Injectable()
export class ExpenseAccountingAdapter {
  private readonly logger = new Logger(ExpenseAccountingAdapter.name);

  constructor(
    private readonly journal: JournalService,
    private readonly modules: ModulesService,
  ) {}

  // ── Feature flag + tenant allowlist ──────────────────────────────────────
  //
  // Checks env var (legacy pilot list) OR DB TenantModule override.
  // Fail-closed: no record and no env var → false.

  async isEnabledForTenant(tenantId: string): Promise<boolean> {
    return this.modules.isAccountingEnabled(tenantId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private crAccount(paymentMethod: string): string {
    return paymentMethod === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.CLEARING;
  }

  private toDecimal(val: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
    return new Prisma.Decimal(String(val ?? 0));
  }

  // ── Public no-throw API ───────────────────────────────────────────────────

  /**
   * Record an expense payment journal.
   * Called AFTER ExpensesService.create() commits when branchId is set.
   *
   * DR 6100/6200 (Operating/Other Expense — based on category.code)  amount
   * CR 1100/1120 (Cash/Clearing — based on paymentMethod)            amount
   *
   * sourceType: EXPENSE_PAYMENT, sourceId: expense.id
   */
  async recordExpenseJournal(
    expense:  ExpenseForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!await this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordExpenseJournal(expense, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `ExpenseAccountingAdapter.recordExpenseJournal failed: expenseId=${expense.id}`,
        err,
      );
    }
  }

  /**
   * Record an expense void reversal journal.
   * Called AFTER ExpensesService.voidExpense() commits when branchId is set.
   *
   * Only posts if EXPENSE_PAYMENT journal was previously recorded.
   * Creates a new reversal entry — original journal is NOT modified.
   *
   * DR 1100/1120 (Cash/Clearing — money returned)   amount
   * CR 6100/6200 (Operating/Other Expense reversed)  amount
   *
   * sourceType: EXPENSE_REVERSAL, sourceId: expense.id
   */
  async reverseExpenseJournal(
    expense:  ExpenseForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!await this.isEnabledForTenant(tenantId)) return;
    try {
      await this._reverseExpenseJournal(expense, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `ExpenseAccountingAdapter.reverseExpenseJournal failed: expenseId=${expense.id}`,
        err,
      );
    }
  }

  // ── Internal implementations (prefixed _ for unit testing) ────────────────

  async _recordExpenseJournal(
    expense:  ExpenseForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    const amount = this.toDecimal(expense.amount);
    if (!amount.gt(0)) {
      this.logger.warn(
        `ExpenseAccountingAdapter: skipping expense journal — amount=${amount} expenseId=${expense.id}`,
      );
      return;
    }

    const drAcct = expenseAccountCode(expense.category?.code);
    const crAcct = this.crAccount(expense.paymentMethod);

    await this.journal.create({
      tenantId,
      branchId:    expense.branchId,
      entryDate:   new Date(),
      description: expense.description,
      sourceType:  JOURNAL_SOURCE.EXPENSE_PAYMENT,
      sourceId:    expense.id,
      sourceRef:   expense.id,
      postedById:  actorId ?? null,
      lines: [
        { accountCode: drAcct, debit:  amount.toString() },
        { accountCode: crAcct, credit: amount.toString() },
      ],
    });
  }

  async _reverseExpenseJournal(
    expense:  ExpenseForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    // Only reverse if the original EXPENSE_PAYMENT journal was posted
    const original = await this.journal.findBySource(
      JOURNAL_SOURCE.EXPENSE_PAYMENT, expense.id, tenantId,
    );
    if (!original) {
      this.logger.warn(
        `ExpenseAccountingAdapter.reverseExpenseJournal: no EXPENSE_PAYMENT journal for expense ${expense.id} — skipping`,
      );
      return;
    }

    const amount  = this.toDecimal(expense.amount);
    const drAcct  = expenseAccountCode(expense.category?.code);
    const crAcct  = this.crAccount(expense.paymentMethod);

    await this.journal.create({
      tenantId,
      branchId:    expense.branchId,
      entryDate:   new Date(),
      description: `Void — ${expense.description}`,
      sourceType:  JOURNAL_SOURCE.EXPENSE_REVERSAL,
      sourceId:    expense.id,
      sourceRef:   expense.id,
      postedById:  actorId ?? null,
      lines: [
        { accountCode: crAcct, debit:  amount.toString() },  // cash/clearing returns
        { accountCode: drAcct, credit: amount.toString() },  // expense decreases
      ],
    });
  }
}
