import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JournalService, JOURNAL_SOURCE, JournalLineInput } from './journal.service';
import { ModulesService } from '../modules/modules.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';
import { PrismaService } from '../database/prisma.service';

/**
 * Double-entry journals for money that used to reach only the cash drawer, or nothing:
 * purchase orders (goods received, supplier payments), SIM / package sales and carrier
 * wallet top-ups, and manual cash drawer withdrawals / deposits.
 *
 * Same contract as the other accounting adapters: only for shops with the accounting
 * module on, posted after the business record commits, idempotent by source, and a
 * failure is logged but never breaks the sale, payment or receipt itself.
 */
@Injectable()
export class OpsAccountingAdapter {
  private readonly logger = new Logger(OpsAccountingAdapter.name);

  constructor(
    private readonly journal: JournalService,
    private readonly modules: ModulesService,
    private readonly prisma: PrismaService,
  ) {}

  private dec(v: Prisma.Decimal | number | string | null | undefined) {
    return new Prisma.Decimal(String(v ?? 0));
  }

  /** Cash goes to the cash account; transfer, card and QR wait in clearing like other payments. */
  private moneyAccount(paymentMethod?: string | null) {
    return paymentMethod === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.CLEARING;
  }

  private async post(
    tenantId: string | null | undefined,
    what: string,
    input: {
      branchId?: string | null; description: string; sourceType: string; sourceId: string;
      sourceRef?: string | null; actorId?: string | null; lines: JournalLineInput[];
    },
  ) {
    if (!tenantId) return;
    try {
      if (!await this.modules.isAccountingEnabled(tenantId)) return;
      await this.journal.create({
        tenantId,
        branchId:    input.branchId ?? null,
        entryDate:   new Date(),
        description: input.description,
        sourceType:  input.sourceType,
        sourceId:    input.sourceId,
        sourceRef:   input.sourceRef ?? null,
        postedById:  input.actorId ?? null,
        lines:       input.lines,
      });
    } catch (err) {
      this.logger.error(`OpsAccountingAdapter.${what} failed: source=${input.sourceType}/${input.sourceId}`, err as Error);
    }
  }

  // ── Purchase orders ─────────────────────────────────────────────────────────

  /** Goods received on a PO: stock goes up and the shop owes the supplier. */
  async recordPurchaseReceipt(p: {
    tenantId: string | null | undefined; branchId?: string | null; movementId: string;
    poNumber: string; productName: string; productType?: string | null; amount: number | Prisma.Decimal;
    actorId?: string | null;
    /** VAT on the goods (input VAT), owed to the supplier with them; 0 when the PO has no VAT */
    vatAmount?: number | Prisma.Decimal;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    const vat = this.dec(p.vatAmount ?? 0).toDecimalPlaces(2);
    const stock = p.productType === 'PART' ? ACCOUNT_CODES.PARTS_INVENTORY : ACCOUNT_CODES.INVENTORY;
    await this.post(p.tenantId, 'recordPurchaseReceipt', {
      branchId: p.branchId, actorId: p.actorId,
      description: `รับสินค้า ${p.productName} — ${p.poNumber}`,
      sourceType: JOURNAL_SOURCE.PO_RECEIVE, sourceId: p.movementId, sourceRef: p.poNumber,
      lines: vat.gt(0)
        ? [
            { accountCode: stock,                   debit:  amount.toString() },
            { accountCode: ACCOUNT_CODES.INPUT_VAT, debit:  vat.toString() },
            { accountCode: ACCOUNT_CODES.AP,        credit: amount.plus(vat).toString() },
          ]
        : [
            { accountCode: stock,             debit:  amount.toString() },
            { accountCode: ACCOUNT_CODES.AP,  credit: amount.toString() },
          ],
    });
  }

  /** Paying the supplier: the debt goes down and the money leaves cash or bank. */
  async recordSupplierPayment(p: {
    tenantId: string | null | undefined; branchId?: string | null; paymentId: string;
    poNumber: string; paymentMethod: string; amount: number | Prisma.Decimal; actorId?: string | null;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    await this.post(p.tenantId, 'recordSupplierPayment', {
      branchId: p.branchId, actorId: p.actorId,
      description: `จ่ายซัพพลายเออร์ — ${p.poNumber}`,
      sourceType: JOURNAL_SOURCE.PO_PAYMENT, sourceId: p.paymentId, sourceRef: p.poNumber,
      lines: [
        { accountCode: ACCOUNT_CODES.AP,                  debit:  amount.toString() },
        { accountCode: this.moneyAccount(p.paymentMethod), credit: amount.toString(), paymentMethod: p.paymentMethod },
      ],
    });
  }

  // ── SIM / package sales ─────────────────────────────────────────────────────

  /**
   * A package paid from the carrier wallet: money in, the wallet goes down by its cost and
   * the difference is package revenue. A SIM sale has no wallet: the full price is revenue
   * and its cost moves from stock to cost of goods sold, like any product sale.
   * Sold on credit ("ค้างจ่าย"): the part not paid yet is owed by the customer (other
   * receivables) instead of money in; the revenue is the same.
   */
  async recordPackageSale(p: {
    tenantId: string | null | undefined; branchId?: string | null;
    sale: { id: string; receiptNumber: string; carrier: string; saleType: string; packageAmount: unknown; walletDeduction: unknown; profit: unknown; paymentMethod: string; creditAmount?: unknown };
    actorId?: string | null;
  }) {
    const price = this.dec(p.sale.packageAmount as any);
    const cost  = this.dec(p.sale.walletDeduction as any);
    if (!price.gt(0)) return;
    const money = this.moneyAccount(p.sale.paymentMethod);
    const isSim = p.sale.saleType === 'SIM_SALE';
    const owed  = Prisma.Decimal.min(this.dec(p.sale.creditAmount as any), price);
    const paid  = price.sub(owed);
    const lines: JournalLineInput[] = [];
    if (paid.gt(0)) lines.push({ accountCode: money, debit: paid.toString(), paymentMethod: p.sale.paymentMethod });
    if (owed.gt(0)) lines.push({ accountCode: ACCOUNT_CODES.OTHER_AR, debit: owed.toString() });
    if (isSim) {
      lines.push({ accountCode: ACCOUNT_CODES.PACKAGE_REVENUE, credit: price.toString() });
      if (cost.gt(0)) {
        lines.push({ accountCode: ACCOUNT_CODES.COGS,      debit:  cost.toString() });
        lines.push({ accountCode: ACCOUNT_CODES.INVENTORY, credit: cost.toString() });
      }
    } else {
      const profit = price.sub(cost);
      if (cost.gt(0))   lines.push({ accountCode: ACCOUNT_CODES.CARRIER_WALLET,  credit: cost.toString() });
      if (profit.gt(0)) lines.push({ accountCode: ACCOUNT_CODES.PACKAGE_REVENUE, credit: profit.toString() });
    }
    await this.post(p.tenantId, 'recordPackageSale', {
      branchId: p.branchId, actorId: p.actorId,
      description: `${isSim ? 'ขายซิม' : 'ขายแพ็กเกจ'} ${p.sale.carrier} — ${p.sale.receiptNumber}`,
      sourceType: JOURNAL_SOURCE.PACKAGE_SALE, sourceId: p.sale.id, sourceRef: p.sale.receiptNumber,
      lines,
    });
  }

  /** The customer pays (part of) what a credit SIM/package sale still owes. */
  async recordPackageDebtPayment(p: {
    tenantId: string | null | undefined; branchId?: string | null; paymentId: string; receiptNumber: string;
    saleReceipt: string; paymentMethod: string; amount: number | Prisma.Decimal; actorId?: string | null;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    await this.post(p.tenantId, 'recordPackageDebtPayment', {
      branchId: p.branchId, actorId: p.actorId,
      description: `รับชำระค้างจ่ายซิม/แพ็กเกจ — ${p.saleReceipt}`,
      sourceType: JOURNAL_SOURCE.PACKAGE_DEBT_PAYMENT, sourceId: p.paymentId, sourceRef: p.receiptNumber,
      lines: [
        { accountCode: this.moneyAccount(p.paymentMethod), debit: amount.toString(), paymentMethod: p.paymentMethod },
        { accountCode: ACCOUNT_CODES.OTHER_AR,             credit: amount.toString() },
      ],
    });
  }

  /** Topping up a carrier wallet moves money from the bank into the wallet. */
  async recordWalletTopup(p: {
    tenantId: string | null | undefined; branchId?: string | null; movementId: string;
    carrier: string; amount: number | Prisma.Decimal; actorId?: string | null;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    await this.post(p.tenantId, 'recordWalletTopup', {
      branchId: p.branchId, actorId: p.actorId,
      description: `เติมเงินกระเป๋า ${p.carrier}`,
      sourceType: JOURNAL_SOURCE.WALLET_TOPUP, sourceId: p.movementId,
      lines: [
        { accountCode: ACCOUNT_CODES.CARRIER_WALLET, debit:  amount.toString() },
        // The top-up screen does not ask how it was paid; shops top up by transfer
        { accountCode: ACCOUNT_CODES.CLEARING,       credit: amount.toString() },
      ],
    });
  }

  // ── Manual cash drawer entries ──────────────────────────────────────────────

  /**
   * Cash taken out of or put into the drawer by hand (not a sale, repair or expense).
   * It is booked against owner's equity: money the owner takes or brings in.
   */
  async recordDrawerManual(p: {
    tenantId: string | null | undefined; branchId?: string | null; txId: string;
    direction: 'IN' | 'OUT'; amount: number | Prisma.Decimal; reason?: string | null; actorId?: string | null;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    const out = p.direction === 'OUT';
    await this.post(p.tenantId, 'recordDrawerManual', {
      branchId: p.branchId, actorId: p.actorId,
      description: `${out ? 'เบิกเงินจากลิ้นชัก' : 'เติมเงินเข้าลิ้นชัก'}${p.reason ? ` — ${p.reason}` : ''}`,
      sourceType: out ? JOURNAL_SOURCE.DRAWER_WITHDRAWAL : JOURNAL_SOURCE.DRAWER_DEPOSIT, sourceId: p.txId,
      lines: out
        ? [
            { accountCode: ACCOUNT_CODES.OWNER_EQUITY, debit:  amount.toString() },
            { accountCode: ACCOUNT_CODES.CASH,         credit: amount.toString(), paymentMethod: 'CASH' },
          ]
        : [
            { accountCode: ACCOUNT_CODES.CASH,         debit:  amount.toString(), paymentMethod: 'CASH' },
            { accountCode: ACCOUNT_CODES.OWNER_EQUITY, credit: amount.toString() },
          ],
    });
  }

  /** Undoing a manual drawer entry undoes its journal (only when one was posted). */
  async reverseDrawerManual(p: {
    tenantId: string | null | undefined; branchId?: string | null; originalTxId: string; reversalTxId: string;
    actorId?: string | null;
  }) {
    if (!p.tenantId) return;
    try {
      if (!await this.modules.isAccountingEnabled(p.tenantId)) return;
      const original =
        (await this.journal.findBySource(JOURNAL_SOURCE.DRAWER_WITHDRAWAL, p.originalTxId, p.tenantId)) ??
        (await this.journal.findBySource(JOURNAL_SOURCE.DRAWER_DEPOSIT, p.originalTxId, p.tenantId));
      if (!original) return;
      await this.journal.create({
        tenantId:    p.tenantId,
        branchId:    p.branchId ?? null,
        entryDate:   new Date(),
        description: `ยกเลิก — ${original.description}`,
        sourceType:  JOURNAL_SOURCE.DRAWER_REVERSAL,
        sourceId:    p.reversalTxId,
        postedById:  p.actorId ?? null,
        // Swap every line's side
        lines: original.lines.map((l: any) => ({
          accountCode: l.account.code,
          debit:  Number(l.credit) > 0 ? String(l.credit) : undefined,
          credit: Number(l.debit)  > 0 ? String(l.debit)  : undefined,
          paymentMethod: l.paymentMethod ?? undefined,
        })),
      });
    } catch (err) {
      this.logger.error(`OpsAccountingAdapter.reverseDrawerManual failed: tx=${p.originalTxId}`, err as Error);
    }
  }

  // ── Quick money in / out at the till (shift) ────────────────────────────────

  /**
   * Cash put in or taken out at the counter in a shift. Money in with no bill
   * (INCOME_PRODUCT / INCOME_SERVICE) is revenue, as in the profit report; everything else
   * (change float, the owner taking or bringing money, buying things with drawer cash) is the
   * owner's money moving, not profit. A shop expense from the drawer is an Expense instead.
   */
  async recordShiftCash(p: {
    tenantId: string | null | undefined; branchId?: string | null; movementId: string;
    direction: 'IN' | 'OUT'; category?: string | null; amount: number | Prisma.Decimal;
    reason?: string | null; actorId?: string | null;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    const out = p.direction === 'OUT';
    const other = !out && p.category === 'INCOME_PRODUCT' ? ACCOUNT_CODES.SALES_REVENUE
      : !out && p.category === 'INCOME_SERVICE' ? ACCOUNT_CODES.REPAIR_REVENUE
      : ACCOUNT_CODES.OWNER_EQUITY;
    await this.post(p.tenantId, 'recordShiftCash', {
      branchId: p.branchId, actorId: p.actorId,
      description: `${out ? 'เงินออกจากลิ้นชัก' : other === ACCOUNT_CODES.OWNER_EQUITY ? 'เงินเข้าลิ้นชัก' : 'รับเงินไม่มีบิล'}${p.reason ? ` — ${p.reason}` : ''}`,
      sourceType: out ? JOURNAL_SOURCE.SHIFT_CASH_OUT : JOURNAL_SOURCE.SHIFT_CASH_IN, sourceId: p.movementId,
      lines: out
        ? [
            { accountCode: other,              debit:  amount.toString() },
            { accountCode: ACCOUNT_CODES.CASH, credit: amount.toString(), paymentMethod: 'CASH' },
          ]
        : [
            { accountCode: ACCOUNT_CODES.CASH, debit:  amount.toString(), paymentMethod: 'CASH' },
            { accountCode: other,              credit: amount.toString() },
          ],
    });
  }

  /**
   * An extra cost of a repair job (the delivery fee for its parts): part of the job's cost.
   * Paid from the drawer → cash goes down; paid by the owner → the owner put that money in.
   */
  async recordRepairExtraCost(p: {
    tenantId: string | null | undefined; branchId?: string | null; costId: string; ticketNumber: string;
    amount: number | Prisma.Decimal; fromDrawer: boolean; actorId?: string | null;
  }) {
    const amount = this.dec(p.amount);
    if (!amount.gt(0)) return;
    await this.post(p.tenantId, 'recordRepairExtraCost', {
      branchId: p.branchId, actorId: p.actorId,
      description: `ค่ารถส่งอะไหล่ — งาน ${p.ticketNumber}${p.fromDrawer ? '' : ' (เจ้าของจ่าย)'}`,
      sourceType: JOURNAL_SOURCE.REPAIR_EXTRA_COST, sourceId: p.costId, sourceRef: p.ticketNumber,
      lines: [
        { accountCode: ACCOUNT_CODES.REPAIR_COGS, debit: amount.toString() },
        p.fromDrawer
          ? { accountCode: ACCOUNT_CODES.CASH, credit: amount.toString(), paymentMethod: 'CASH' }
          : { accountCode: ACCOUNT_CODES.OWNER_EQUITY, credit: amount.toString() },
      ],
    });
  }


  // ── Stock in / out other than a purchase order, a sale or a repair ─────────

  /**
   * Goods put into stock without a purchase order (added on the product form, counted in,
   * imported): the shop now owns them, brought in by the owner. Goods taken out by hand
   * (damaged, lost, used in the shop) leave the books the same way. Valued at cost.
   */
  async recordStockChange(p: {
    tenantId: string | null | undefined; branchId?: string | null; movementId: string;
    productName: string; productType?: string | null; quantity: number;
    unitCost: number | Prisma.Decimal | string | null | undefined; actorId?: string | null;
  }) {
    const amount = this.dec(p.unitCost).times(Math.abs(p.quantity)).toDecimalPlaces(2);
    if (!amount.gt(0) || !p.quantity) return;
    const stock = p.productType === 'PART' ? ACCOUNT_CODES.PARTS_INVENTORY : ACCOUNT_CODES.INVENTORY;
    const into = p.quantity > 0;
    await this.post(p.tenantId, 'recordStockChange', {
      branchId: p.branchId, actorId: p.actorId,
      description: `${into ? 'ของเข้าสต็อก' : 'ของออกจากสต็อก'} ${p.productName} × ${Math.abs(p.quantity)}`,
      sourceType: JOURNAL_SOURCE.STOCK_ADJUST, sourceId: p.movementId,
      lines: into
        ? [
            { accountCode: stock,                      debit:  amount.toString() },
            { accountCode: ACCOUNT_CODES.OWNER_EQUITY, credit: amount.toString() },
          ]
        : [
            { accountCode: ACCOUNT_CODES.OWNER_EQUITY, debit:  amount.toString() },
            { accountCode: stock,                      credit: amount.toString() },
          ],
    });
  }


  /** Stock movements that come in / go out by hand reach the books (not PO, sale, repair, transfer) */
  // (a movement with no reference is one made by hand: "not PURCHASE_ORDER" alone would drop NULLs in SQL)
  static readonly HAND_STOCK = {
    type: { in: ['IN', 'OUT', 'ADJUST'] },
    OR: [{ referenceType: null }, { referenceType: { not: 'PURCHASE_ORDER' } }],
  } as const;

  /** Books one stock movement made by hand, by its id (after the stock change committed). */
  async bookStockMovement(movementId: string, actorId?: string | null) {
    try {
      const m = await this.prisma.stockMovement.findFirst({
        where: { id: movementId, ...OpsAccountingAdapter.HAND_STOCK } as any,
        select: {
          id: true, type: true, quantity: true, unitCost: true, branchId: true,
          product: { select: { name: true, type: true, costPrice: true, tenantId: true } },
        },
      });
      if (!m?.product?.tenantId) return;
      await this.recordStockChange({
        tenantId: m.product.tenantId, branchId: m.branchId, movementId: m.id, actorId,
        productName: m.product.name, productType: m.product.type as string,
        quantity: m.type === 'OUT' ? -Math.abs(m.quantity) : m.quantity,
        unitCost: m.unitCost ?? m.product.costPrice,
      });
    } catch (err) {
      this.logger.error(`OpsAccountingAdapter.bookStockMovement failed: movement=${movementId}`, err as Error);
    }
  }

}
