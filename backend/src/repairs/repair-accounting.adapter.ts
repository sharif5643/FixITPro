import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalService, JOURNAL_SOURCE } from '../journal/journal.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

// ── Minimal types for the Repair data the adapter needs ──────────────────────

export interface RepairPartForAccounting {
  id:        string;
  costPrice: Prisma.Decimal | number | string | null;
  quantity:  number;
  isVoided:  boolean;
}

export interface RepairForAccounting {
  id:            string;
  ticketNumber:  string;
  paidAmount:    Prisma.Decimal | number | string | null;
  paymentMethod: string | null;  // CASH | TRANSFER | CARD (final payment method)
  deposit:       Prisma.Decimal | number | string;
  branchId:      string | null;
}

export interface RepairWithPartsForAccounting extends RepairForAccounting {
  parts: RepairPartForAccounting[];
}

export interface AdditionalPaymentForAccounting {
  id:            string;
  amount:        Prisma.Decimal | number | string;
  paymentMethod: string;  // CASH | TRANSFER | CARD
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * RepairAccountingAdapter — post-commit bridge from Repair service to double-entry journal.
 *
 * Status: IMPLEMENTED, NOT WIRED.
 * RepairsService does NOT call this adapter yet — wiring is Phase 4B.4E.
 *
 * All public methods:
 *   - Are gated by isEnabledForTenant() — no-op when accounting is disabled.
 *   - NEVER throw back to the caller. Accounting failures are logged and swallowed
 *     so that the already-committed Repair transaction is never affected.
 *   - Are idempotent: calling twice with the same IDs returns {created:false} from
 *     JournalService and produces no duplicate entries.
 */
@Injectable()
export class RepairAccountingAdapter {
  private readonly logger = new Logger(RepairAccountingAdapter.name);

  constructor(private readonly journal: JournalService) {}

  // ── Feature flag + tenant allowlist ──────────────────────────────────────
  //
  // Fail-closed design (mirrors SalesAccountingAdapter):
  // ACCOUNTING_CORE_ENABLED != 'true'           → disabled (everyone)
  // ACCOUNTING_CORE_ENABLED = 'true' + no list  → disabled (fail-closed; nobody enabled)
  // ACCOUNTING_CORE_ENABLED = 'true' + '*'      → all tenants enabled (explicit sentinel)
  // ACCOUNTING_CORE_ENABLED = 'true' + 't1,t2' → only t1 and t2 enabled (pilot mode)

  isEnabledForTenant(tenantId: string): boolean {
    if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false;
    const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
    if (!raw) return false;
    if (raw === '*') return true;
    const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return allowed.includes(tenantId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private drAccount(paymentMethod: string | null): string {
    return paymentMethod === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.CLEARING;
  }

  private toDecimal(val: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
    return new Prisma.Decimal(String(val ?? 0));
  }

  // ── Public no-throw API ───────────────────────────────────────────────────

  /**
   * Record a repair deposit journal.
   * Called AFTER RepairsService.create() commits when deposit > 0.
   *
   * DR 1100/1120  deposit  (cash or clearing)
   * CR 2110       deposit  (customer deposit liability)
   *
   * sourceType: REPAIR_DEPOSIT, sourceId: repair.id
   */
  async recordDepositJournal(
    repair:               RepairForAccounting,
    depositPaymentMethod: string,
    tenantId:             string,
    actorId?:             string | null,
  ): Promise<void> {
    if (!this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordDepositJournal(repair, depositPaymentMethod, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `RepairAccountingAdapter.recordDepositJournal failed: repairId=${repair.id} ticket=${repair.ticketNumber}`,
        err,
      );
    }
  }

  /**
   * Record journals for a completed repair payment.
   * Called AFTER RepairsService.processPayment() commits.
   *
   * Creates up to 2 + N journal entries:
   *   1. REPAIR_FINAL_PAYMENT: DR 1100/1120, CR 4200 — paidAmount (what customer pays now)
   *   2. REPAIR_DEPOSIT_SETTLE: DR 2110, CR 4200 — deposit (only if REPAIR_DEPOSIT was posted)
   *   3..N. REPAIR_COGS: DR 5200, CR 1310 — per active RepairPart where costPrice > 0
   */
  async recordFinalPaymentJournal(
    repair:   RepairWithPartsForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordFinalPaymentJournal(repair, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `RepairAccountingAdapter.recordFinalPaymentJournal failed: repairId=${repair.id} ticket=${repair.ticketNumber}`,
        err,
      );
    }
  }

  /**
   * Record reversal journals for a payment reversal.
   * Called AFTER RepairsService.reversePayment() commits.
   *
   * Creates reversal entries (swapped debit/credit) for any previously posted
   * REPAIR_FINAL_PAYMENT and REPAIR_DEPOSIT_SETTLE journals.
   * Original entries are NOT modified — immutable audit trail preserved.
   *
   * REPAIR_PAYMENT_REVERSAL:        reverses REPAIR_FINAL_PAYMENT lines
   * REPAIR_DEPOSIT_SETTLE_REVERSAL: reverses REPAIR_DEPOSIT_SETTLE lines (if posted)
   */
  async reversePaymentJournal(
    repair:   RepairForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!this.isEnabledForTenant(tenantId)) return;
    try {
      await this._reversePaymentJournal(repair, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `RepairAccountingAdapter.reversePaymentJournal failed: repairId=${repair.id} ticket=${repair.ticketNumber}`,
        err,
      );
    }
  }

  /**
   * Record a deposit refund journal on repair cancellation.
   * Called AFTER RepairsService.update() cancellation $transaction commits.
   *
   * Looks up the original REPAIR_DEPOSIT journal to determine which cash/clearing account
   * was originally debited (1100 CASH or 1120 CLEARING), then creates the reversal:
   *
   * DR 2110  deposit  (Customer Deposit — close the liability)
   * CR 1100  deposit  (Cash on Hand)    ← if original deposit was CASH
   *   OR
   * CR 1120  deposit  (Clearing)        ← if original deposit was TRANSFER/CARD
   *
   * sourceType: REPAIR_DEPOSIT_REFUND, sourceId: repair.id
   * Idempotent: JournalService returns {created:false} if already posted.
   * No-op if deposit=0 or if the original REPAIR_DEPOSIT journal was never posted.
   */
  async recordDepositRefundJournal(
    repair:   RepairForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordDepositRefundJournal(repair, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `RepairAccountingAdapter.recordDepositRefundJournal failed: repairId=${repair.id} ticket=${repair.ticketNumber}`,
        err,
      );
    }
  }

  /**
   * Record an additional / debt payment journal.
   * Called AFTER RepairsService.addAdditionalPayment() OR DebtPaymentsService.create() commits.
   *
   * DR 1100/1120  amount  (cash or clearing)
   * CR 1200       amount  (repair A/R — reduces receivable balance)
   *
   * sourceType: REPAIR_ADDITIONAL_PAYMENT, sourceId: payment.id (RepairAdditionalPayment.id)
   */
  async recordAdditionalPaymentJournal(
    payment:  AdditionalPaymentForAccounting,
    repair:   { id: string; ticketNumber: string; branchId: string | null },
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordAdditionalPaymentJournal(payment, repair, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `RepairAccountingAdapter.recordAdditionalPaymentJournal failed: paymentId=${payment.id} repairId=${repair.id}`,
        err,
      );
    }
  }

  // ── Internal implementations (prefixed _ for unit testing) ────────────────

  async _recordDepositJournal(
    repair:               RepairForAccounting,
    depositPaymentMethod: string,
    tenantId:             string,
    actorId?:             string | null,
  ): Promise<void> {
    const deposit = this.toDecimal(repair.deposit);
    if (!deposit.gt(0)) {
      this.logger.warn(
        `RepairAccountingAdapter: skipping deposit journal for repair ${repair.id} — deposit=${deposit}`,
      );
      return;
    }

    await this.journal.create({
      tenantId,
      branchId:    repair.branchId,
      entryDate:   new Date(),
      description: `Deposit — Repair ${repair.ticketNumber}`,
      sourceType:  JOURNAL_SOURCE.REPAIR_DEPOSIT,
      sourceId:    repair.id,
      sourceRef:   repair.ticketNumber,
      postedById:  actorId ?? null,
      lines: [
        { accountCode: this.drAccount(depositPaymentMethod), debit:  deposit.toString() },
        { accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT,       credit: deposit.toString() },
      ],
    });
  }

  async _recordFinalPaymentJournal(
    repair:   RepairWithPartsForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    // 1. Final payment revenue
    const paidAmount = this.toDecimal(repair.paidAmount);
    if (paidAmount.gt(0)) {
      await this.journal.create({
        tenantId,
        branchId:    repair.branchId,
        entryDate:   new Date(),
        description: `Final Payment — Repair ${repair.ticketNumber}`,
        sourceType:  JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT,
        sourceId:    repair.id,
        sourceRef:   repair.ticketNumber,
        postedById:  actorId ?? null,
        lines: [
          { accountCode: this.drAccount(repair.paymentMethod), debit:  paidAmount.toString() },
          { accountCode: ACCOUNT_CODES.REPAIR_REVENUE,         credit: paidAmount.toString() },
        ],
      });
    } else {
      this.logger.warn(
        `RepairAccountingAdapter: skipping final payment journal for repair ${repair.id} — paidAmount=${paidAmount}`,
      );
    }

    // 2. Deposit settlement — only when REPAIR_DEPOSIT was previously journalized
    const deposit = this.toDecimal(repair.deposit);
    if (deposit.gt(0)) {
      const depositJe = await this.journal.findBySource(
        JOURNAL_SOURCE.REPAIR_DEPOSIT, repair.id, tenantId,
      );
      if (depositJe) {
        await this.journal.create({
          tenantId,
          branchId:    repair.branchId,
          entryDate:   new Date(),
          description: `Deposit Settlement — Repair ${repair.ticketNumber}`,
          sourceType:  JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE,
          sourceId:    repair.id,
          sourceRef:   repair.ticketNumber,
          postedById:  actorId ?? null,
          lines: [
            { accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, debit:  deposit.toString() },
            { accountCode: ACCOUNT_CODES.REPAIR_REVENUE,   credit: deposit.toString() },
          ],
        });
      } else {
        this.logger.debug(
          `RepairAccountingAdapter: no REPAIR_DEPOSIT journal for repair ${repair.id} — skipping deposit settlement`,
        );
      }
    }

    // 3. COGS per active RepairPart — sourceId = repairPart.id (one journal per part)
    const activeParts = (repair.parts ?? []).filter((p) => !p.isVoided);
    for (const part of activeParts) {
      const costPrice = this.toDecimal(part.costPrice);
      if (!costPrice.gt(0)) {
        this.logger.warn(
          `RepairAccountingAdapter: skipping COGS for part ${part.id} (repair ${repair.id}): costPrice=${costPrice}`,
        );
        continue;
      }
      const cogsAmount = costPrice.times(part.quantity).toDecimalPlaces(2);
      if (!cogsAmount.gt(0)) continue;

      await this.journal.create({
        tenantId,
        branchId:    repair.branchId,
        entryDate:   new Date(),
        description: `Parts COGS — Repair ${repair.ticketNumber}`,
        sourceType:  JOURNAL_SOURCE.REPAIR_COGS,
        sourceId:    part.id,
        sourceRef:   repair.ticketNumber,
        postedById:  actorId ?? null,
        lines: [
          { accountCode: ACCOUNT_CODES.REPAIR_COGS,     debit:  cogsAmount.toString() },
          { accountCode: ACCOUNT_CODES.PARTS_INVENTORY, credit: cogsAmount.toString() },
        ],
      });
    }
  }

  async _reversePaymentJournal(
    repair:   RepairForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    // 1. Reverse REPAIR_FINAL_PAYMENT — swap debit ↔ credit on all original lines
    const finalJe = await this.journal.findBySource(
      JOURNAL_SOURCE.REPAIR_FINAL_PAYMENT, repair.id, tenantId,
    );
    if (!finalJe) {
      this.logger.warn(
        `RepairAccountingAdapter.reversePaymentJournal: no REPAIR_FINAL_PAYMENT journal for repair ${repair.id}`,
      );
    } else {
      const reversedFinalLines = (finalJe.lines as any[]).map((line) => {
        const d = new Prisma.Decimal(line.debit.toString());
        return d.gt(0)
          ? { accountCode: line.account.code, credit: d.toString() }
          : { accountCode: line.account.code, debit: new Prisma.Decimal(line.credit.toString()).toString() };
      });
      await this.journal.create({
        tenantId,
        branchId:    repair.branchId,
        entryDate:   new Date(),
        description: `Payment Reversal — Repair ${repair.ticketNumber}`,
        sourceType:  JOURNAL_SOURCE.REPAIR_PAYMENT_REVERSAL,
        sourceId:    repair.id,
        sourceRef:   repair.ticketNumber,
        postedById:  actorId ?? null,
        lines:       reversedFinalLines,
      });
    }

    // 2. Reverse REPAIR_DEPOSIT_SETTLE if it was posted
    const settleJe = await this.journal.findBySource(
      JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE, repair.id, tenantId,
    );
    if (settleJe) {
      const reversedSettleLines = (settleJe.lines as any[]).map((line) => {
        const d = new Prisma.Decimal(line.debit.toString());
        return d.gt(0)
          ? { accountCode: line.account.code, credit: d.toString() }
          : { accountCode: line.account.code, debit: new Prisma.Decimal(line.credit.toString()).toString() };
      });
      await this.journal.create({
        tenantId,
        branchId:    repair.branchId,
        entryDate:   new Date(),
        description: `Deposit Settle Reversal — Repair ${repair.ticketNumber}`,
        sourceType:  JOURNAL_SOURCE.REPAIR_DEPOSIT_SETTLE_REVERSAL,
        sourceId:    repair.id,
        sourceRef:   repair.ticketNumber,
        postedById:  actorId ?? null,
        lines:       reversedSettleLines,
      });
    }
  }

  async _recordAdditionalPaymentJournal(
    payment:  AdditionalPaymentForAccounting,
    repair:   { id: string; ticketNumber: string; branchId: string | null },
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    const amount = this.toDecimal(payment.amount);
    if (!amount.gt(0)) {
      this.logger.warn(
        `RepairAccountingAdapter: skipping additional payment journal — amount=${amount} paymentId=${payment.id}`,
      );
      return;
    }

    await this.journal.create({
      tenantId,
      branchId:    repair.branchId,
      entryDate:   new Date(),
      description: `Additional Payment — Repair ${repair.ticketNumber}`,
      sourceType:  JOURNAL_SOURCE.REPAIR_ADDITIONAL_PAYMENT,
      sourceId:    payment.id,
      sourceRef:   repair.ticketNumber,
      postedById:  actorId ?? null,
      lines: [
        { accountCode: this.drAccount(payment.paymentMethod), debit:  amount.toString() },
        { accountCode: ACCOUNT_CODES.REPAIR_AR,               credit: amount.toString() },
      ],
    });
  }

  async _recordDepositRefundJournal(
    repair:   RepairForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    const deposit = this.toDecimal(repair.deposit);
    if (!deposit.gt(0)) {
      this.logger.warn(
        `RepairAccountingAdapter: skipping deposit refund journal for repair ${repair.id} — deposit=${deposit}`,
      );
      return;
    }

    // Look up the original REPAIR_DEPOSIT journal to determine which cash/clearing account
    // was originally debited (1100 for CASH, 1120 for non-CASH).
    // If no REPAIR_DEPOSIT journal exists (accounting was off at create time), skip refund.
    const depositJe = await this.journal.findBySource(
      JOURNAL_SOURCE.REPAIR_DEPOSIT, repair.id, tenantId,
    );
    if (!depositJe) {
      this.logger.warn(
        `RepairAccountingAdapter: no REPAIR_DEPOSIT journal for repair ${repair.id} — skipping deposit refund`,
      );
      return;
    }

    // Find the debit line in the original deposit journal to get the original DR account (1100 or 1120)
    const drLine = (depositJe.lines as any[]).find(
      (l: any) => new Prisma.Decimal(String(l.debit ?? 0)).gt(0),
    );
    if (!drLine) {
      this.logger.warn(
        `RepairAccountingAdapter: REPAIR_DEPOSIT journal ${depositJe.id} has no debit line — skipping refund`,
      );
      return;
    }
    const originalDrAccount: string = drLine.account.code;  // '1100' or '1120'

    // Reversal: DR 2110 (close liability) / CR {original DR account} (return cash or clearing)
    await this.journal.create({
      tenantId,
      branchId:    repair.branchId,
      entryDate:   new Date(),
      description: `Deposit Refund — Repair ${repair.ticketNumber}`,
      sourceType:  JOURNAL_SOURCE.REPAIR_DEPOSIT_REFUND,
      sourceId:    repair.id,
      sourceRef:   repair.ticketNumber,
      postedById:  actorId ?? null,
      lines: [
        { accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSIT, debit:  deposit.toString() },
        { accountCode: originalDrAccount,               credit: deposit.toString() },
      ],
    });
  }
}
