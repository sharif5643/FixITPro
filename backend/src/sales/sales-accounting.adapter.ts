import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import { ModulesService } from '../modules/modules.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

// ── Minimal types for the Sale data the adapter needs ─────────────────────────

export interface SalePaymentForAccounting {
  id:            string;
  paymentMethod: string;
  amount:        Prisma.Decimal | number | string;
}

export interface SaleItemForAccounting {
  id:        string;
  quantity:  number;
  costPrice: Prisma.Decimal | number | string;
}

export interface SaleForAccounting {
  id:            string;
  receiptNumber: string;
  total:         Prisma.Decimal | number | string;
  branchId:      string | null;
  createdAt?:    Date;
  payments:      SalePaymentForAccounting[];
  items:         SaleItemForAccounting[];
}

export interface RefundForAccounting {
  id:            string;
  totalRefund:   Prisma.Decimal | number | string;
  paymentMethod: string;
  saleId:        string;
}

export interface RefundItemForAccounting {
  saleItemId: string;
  quantity:   number;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * SalesAccountingAdapter — post-commit bridge from POS to double-entry journal.
 *
 * All public methods:
 *   - Are gated by ACCOUNTING_CORE_ENABLED env var (no-op when disabled).
 *   - NEVER throw back to the caller. Accounting failures are logged and swallowed
 *     so that the already-committed POS sale is never affected.
 *   - Use SalePayment.id as sourceId for per-leg idempotency, backed by the
 *     Phase 4A.1 partial unique index on (sourceType, sourceId, tenantId).
 */
@Injectable()
export class SalesAccountingAdapter {
  private readonly logger = new Logger(SalesAccountingAdapter.name);

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

  // ── Public API (no-throw contract) ────────────────────────────────────────

  /**
   * Create journal entries for a completed sale.
   * One revenue journal per payment leg + one COGS journal per SaleItem (if costPrice > 0).
   * Called AFTER the POS $transaction commits.
   */
  async recordSaleJournal(
    sale:     SaleForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!await this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordSaleJournal(sale, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `SalesAccountingAdapter.recordSaleJournal failed: saleId=${sale.id} receipt=${sale.receiptNumber}`,
        err,
      );
    }
  }

  /**
   * Reverse all journal entries created for a voided sale.
   * Called AFTER the POS $transaction for void commits.
   */
  async reverseSaleJournal(
    sale:     SaleForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    if (!await this.isEnabledForTenant(tenantId)) return;
    try {
      await this._reverseSaleJournal(sale, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `SalesAccountingAdapter.reverseSaleJournal failed: saleId=${sale.id}`,
        err,
      );
    }
  }

  /**
   * Create journal entries for a sale refund (revenue reversal + COGS restore).
   * Called AFTER the POS $transaction for refund commits.
   */
  async recordRefundJournal(
    refund:      RefundForAccounting,
    sale:        SaleForAccounting,
    refundItems: RefundItemForAccounting[],
    tenantId:    string,
    actorId?:    string | null,
  ): Promise<void> {
    if (!await this.isEnabledForTenant(tenantId)) return;
    try {
      await this._recordRefundJournal(refund, sale, refundItems, tenantId, actorId);
    } catch (err) {
      this.logger.error(
        `SalesAccountingAdapter.recordRefundJournal failed: refundId=${refund.id} saleId=${sale.id}`,
        err,
      );
    }
  }

  // ── Internal implementations (exposed as _method for unit testing) ─────────

  async _recordSaleJournal(
    sale:     SaleForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    const saleTotal = new Prisma.Decimal(String(sale.total));

    // Separate CASH legs from non-CASH (TRANSFER / CARD)
    const cashLegs    = sale.payments.filter((p) => p.paymentMethod === 'CASH');
    const nonCashLegs = sale.payments.filter((p) => p.paymentMethod !== 'CASH');

    // Non-cash total determines how much of Sale.total is covered by clearing
    const nonCashTotal = nonCashLegs.reduce(
      (sum, p) => sum.plus(new Prisma.Decimal(String(p.amount))),
      new Prisma.Decimal(0),
    );

    // Net cash = Sale.total minus what was paid via non-cash legs.
    // This is the correct revenue amount for cash — it excludes customer change.
    const cashNetAmount = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      saleTotal.minus(nonCashTotal),
    );

    // Sum of tendered cash amounts (used for proportional split when >1 CASH leg)
    const cashTendered = cashLegs.reduce(
      (sum, p) => sum.plus(new Prisma.Decimal(String(p.amount))),
      new Prisma.Decimal(0),
    );

    for (const leg of sale.payments) {
      let journalAmount: Prisma.Decimal;

      if (leg.paymentMethod === 'CASH') {
        if (cashLegs.length > 1 && cashTendered.gt(0)) {
          // Multiple CASH legs: distribute cashNetAmount proportionally by tendered amount
          const fraction = new Prisma.Decimal(String(leg.amount)).div(cashTendered);
          journalAmount  = cashNetAmount.times(fraction).toDecimalPlaces(2);
        } else {
          journalAmount = cashNetAmount;
        }
      } else {
        // For non-CASH legs, SalePayment.amount IS the revenue (no change applies)
        journalAmount = new Prisma.Decimal(String(leg.amount));
      }

      if (!journalAmount.gt(0)) {
        this.logger.warn(
          `SalesAccountingAdapter: skipping zero-amount journal for payment ${leg.id} (sale ${sale.id})`,
        );
        continue;
      }

      const drAccount = leg.paymentMethod === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.CLEARING;

      await this.journal.create({
        tenantId,
        branchId:    sale.branchId,
        entryDate:   sale.createdAt ?? new Date(),
        description: `Sale ${sale.receiptNumber} — ${leg.paymentMethod}`,
        sourceType:  'SALE_PAYMENT',
        sourceId:    leg.id,
        sourceRef:   sale.receiptNumber,
        postedById:  actorId ?? null,
        lines: [
          { accountCode: drAccount,                   debit:  journalAmount.toString() },
          { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: journalAmount.toString() },
        ],
      });
    }

    // COGS journal per SaleItem — only when costPrice > 0
    for (const item of sale.items) {
      const costPrice = new Prisma.Decimal(String(item.costPrice));
      if (!costPrice.gt(0)) {
        this.logger.warn(
          `SalesAccountingAdapter: skipping COGS for saleItem ${item.id} (sale ${sale.id}): costPrice=0`,
        );
        continue;
      }

      const cogsAmount = costPrice.times(item.quantity).toDecimalPlaces(2);
      if (!cogsAmount.gt(0)) continue;

      await this.journal.create({
        tenantId,
        branchId:    sale.branchId,
        entryDate:   sale.createdAt ?? new Date(),
        description: `COGS — Sale ${sale.receiptNumber}`,
        sourceType:  'SALE_COGS',
        sourceId:    item.id,
        sourceRef:   sale.receiptNumber,
        postedById:  actorId ?? null,
        lines: [
          { accountCode: ACCOUNT_CODES.COGS,       debit:  cogsAmount.toString() },
          { accountCode: ACCOUNT_CODES.INVENTORY,   credit: cogsAmount.toString() },
        ],
      });
    }
  }

  async _reverseSaleJournal(
    sale:     SaleForAccounting,
    tenantId: string,
    actorId?: string | null,
  ): Promise<void> {
    // Reverse revenue journal for each payment leg
    for (const leg of sale.payments) {
      const existing = await this.journal.findBySource('SALE_PAYMENT', leg.id, tenantId);
      if (!existing) {
        this.logger.warn(
          `SalesAccountingAdapter.reverseSaleJournal: no SALE_PAYMENT journal for payment ${leg.id}`,
        );
        continue;
      }
      if (existing.isVoided) {
        this.logger.warn(
          `SalesAccountingAdapter.reverseSaleJournal: journal ${existing.id} already voided`,
        );
        continue;
      }
      await this.journal.reverse(
        existing.id,
        tenantId,
        `Void sale ${sale.receiptNumber}`,
        actorId,
      );
    }

    // Reverse COGS journal for each sale item
    for (const item of sale.items) {
      const existing = await this.journal.findBySource('SALE_COGS', item.id, tenantId);
      if (!existing) continue;
      if (existing.isVoided) continue;
      await this.journal.reverse(
        existing.id,
        tenantId,
        `Void COGS — sale ${sale.receiptNumber}`,
        actorId,
      );
    }
  }

  async _recordRefundJournal(
    refund:      RefundForAccounting,
    sale:        SaleForAccounting,
    refundItems: RefundItemForAccounting[],
    tenantId:    string,
    actorId?:    string | null,
  ): Promise<void> {
    const totalRefund = new Prisma.Decimal(String(refund.totalRefund));
    if (!totalRefund.gt(0)) return;

    // Revenue reversal: customer returns revenue
    const crAccount =
      refund.paymentMethod === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.CLEARING;

    await this.journal.create({
      tenantId,
      branchId:    sale.branchId,
      entryDate:   new Date(),
      description: `Refund — Sale ${sale.receiptNumber}`,
      sourceType:  'SALE_REFUND',
      sourceId:    refund.id,
      sourceRef:   sale.receiptNumber,
      postedById:  actorId ?? null,
      lines: [
        { accountCode: ACCOUNT_CODES.SALES_REVENUE, debit:  totalRefund.toString() },
        { accountCode: crAccount,                   credit: totalRefund.toString() },
      ],
    });

    // COGS reversal per refunded item: inventory returns at cost
    for (const ri of refundItems) {
      const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
      if (!saleItem) continue;

      const costPrice = new Prisma.Decimal(String(saleItem.costPrice));
      if (!costPrice.gt(0)) {
        this.logger.warn(
          `SalesAccountingAdapter: skipping COGS reversal for item ${ri.saleItemId}: costPrice=0`,
        );
        continue;
      }

      const restoreAmount = costPrice.times(ri.quantity).toDecimalPlaces(2);
      if (!restoreAmount.gt(0)) continue;

      await this.journal.create({
        tenantId,
        branchId:    sale.branchId,
        entryDate:   new Date(),
        description: `COGS Reversal — Refund ${refund.id}`,
        sourceType:  'SALE_REFUND_COGS',
        sourceId:    `${refund.id}:${ri.saleItemId}`,
        sourceRef:   sale.receiptNumber,
        postedById:  actorId ?? null,
        lines: [
          { accountCode: ACCOUNT_CODES.INVENTORY, debit:  restoreAmount.toString() },
          { accountCode: ACCOUNT_CODES.COGS,       credit: restoreAmount.toString() },
        ],
      });
    }
  }
}
