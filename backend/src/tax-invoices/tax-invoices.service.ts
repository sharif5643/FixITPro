import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ModulesService } from '../modules/modules.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

type Db = Prisma.TransactionClient | PrismaService;

export type TaxSourceType =
  | 'SALE' | 'SALE_REFUND'
  | 'REPAIR_DEPOSIT' | 'REPAIR_ADDITIONAL' | 'REPAIR_PAYMENT' | 'REPAIR_REFUND'
  | 'FORMAL_DOC';

export interface IssueArgs {
  tenantId:      string | null | undefined;
  branchId:      string | null | undefined;
  sourceType:    TaxSourceType;
  sourceId:      string;
  total:         number;
  reference?:    string | null;
  customerName?: string | null;
  actorId?:      string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Buddhist year in Bangkok: tax invoice numbers start again each year */
export function buddhistYearBkk(d: Date = new Date()): number {
  return new Date(d.getTime() + 7 * 3600_000).getUTCFullYear() + 543;
}

/** Price includes VAT: split it into the base and the tax */
export function splitVat(total: number, vatPercent: number): { vatBase: number; vatAmount: number } {
  if (!(vatPercent > 0)) return { vatBase: round2(total), vatAmount: 0 };
  const vatBase = round2(total * 100 / (100 + vatPercent));
  return { vatBase, vatAmount: round2(total - vatBase) };
}

/**
 * Abbreviated tax invoices (ใบกำกับภาษีอย่างย่อ) and credit notes (ใบลดหนี้) for shops that charge
 * VAT. Called inside the transaction that takes or gives back the money, so a bill and its tax
 * invoice number are saved together or not at all. A shop with no VAT set gets nothing.
 */
@Injectable()
export class TaxInvoicesService {
  private readonly logger = new Logger(TaxInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly journal?: JournalService,
    @Optional() private readonly modules?: ModulesService,
  ) {}

  /**
   * The VAT of tax invoices and credit notes into the shop's books (shops with accounting on).
   * Revenue is first booked VAT included, as for every shop; this moves the VAT out of revenue
   * into output VAT (a credit note moves it back), and takes it back again for a cancelled one.
   * Run after the money is saved; never throws, and safe to run again (each document once).
   */
  async bookVat(tenantId: string | null | undefined): Promise<void> {
    if (!tenantId || !this.journal || !this.modules) return;
    try {
      if (!(await this.modules.isAccountingEnabled(tenantId))) return;
      const rows = await this.prisma.taxInvoice.findMany({
        where:   { tenantId, OR: [{ vatBookedAt: null }, { cancelledAt: { not: null }, cancelBookedAt: null }] },
        orderBy: { createdAt: 'asc' },
        take:    200,
      });
      for (const inv of rows) {
        const vat = Number(inv.vatAmount);
        const revenue = inv.sourceType.startsWith('SALE') ? ACCOUNT_CODES.SALES_REVENUE : ACCOUNT_CODES.REPAIR_REVENUE;
        if (!inv.vatBookedAt) {
          // Cancelled before it was booked: nothing to book, nothing to take back
          if (vat > 0 && !inv.cancelledAt) {
            const amt = vat.toFixed(2);
            await this.journal.create({
              tenantId, branchId: inv.branchId, entryDate: inv.issuedAt,
              description: `${inv.kind === 'CN' ? 'ภาษีขายลดลง ใบลดหนี้' : 'ภาษีขาย'} ${inv.number}`,
              sourceType: 'TAX_INVOICE_VAT', sourceId: inv.id, sourceRef: inv.number, postedById: inv.createdById,
              lines: inv.kind === 'CN'
                ? [{ accountCode: ACCOUNT_CODES.OUTPUT_VAT, debit: amt }, { accountCode: revenue, credit: amt }]
                : [{ accountCode: revenue, debit: amt }, { accountCode: ACCOUNT_CODES.OUTPUT_VAT, credit: amt }],
            } as any);
          }
          await this.prisma.taxInvoice.updateMany({
            where: { id: inv.id, vatBookedAt: null },
            data:  { vatBookedAt: new Date(), ...(inv.cancelledAt ? { cancelBookedAt: new Date() } : {}) },
          });
          continue;
        }
        if (inv.cancelledAt && !inv.cancelBookedAt) {
          const booked = await this.journal.findBySource('TAX_INVOICE_VAT', inv.id, tenantId);
          if (booked && !booked.isVoided) {
            await this.journal.reverse(booked.id, tenantId, `ยกเลิก ${inv.number}`, inv.createdById);
          }
          await this.prisma.taxInvoice.updateMany({ where: { id: inv.id, cancelBookedAt: null }, data: { cancelBookedAt: new Date() } });
        }
      }
    } catch (err) {
      this.logger.warn(`TaxInvoicesService.bookVat failed for tenant ${tenantId}: ${err}`);
    }
  }

  /** The VAT % the shop charges; 0 = the shop does not charge VAT */
  async vatPercentOf(tenantId: string | null | undefined, db: Db = this.prisma): Promise<number> {
    if (!tenantId) return 0;
    const s = await (db as any).shopSettings.findUnique({ where: { tenantId }, select: { vatPercent: true } });
    const p = Number(s?.vatPercent ?? 0);
    return p > 0 ? p : 0;
  }

  /** Next number for the shop, branch, kind and year — atomic, so two tills never share one */
  private async nextNumber(db: Db, tenantId: string, branchId: string | null | undefined, kind: 'ABB' | 'CN'): Promise<string> {
    let branchNo = 0;
    if (branchId) {
      const b = await (db as any).branch.findUnique({ where: { id: branchId }, select: { branchNumber: true } });
      branchNo = Number(b?.branchNumber ?? 0);
    }
    const bb   = String(branchNo).padStart(2, '0');
    const year = buddhistYearBkk();
    const rows = await (db as any).$queryRaw`
      INSERT INTO "TaxInvoiceCounter" ("tenantId", "branchKey", "kind", "year", "last")
      VALUES (${tenantId}, ${bb}, ${kind}, ${year}, 1)
      ON CONFLICT ("tenantId", "branchKey", "kind", "year")
      DO UPDATE SET "last" = "TaxInvoiceCounter"."last" + 1
      RETURNING "last"` as { last: number }[];
    return `${kind}${bb}-${year}-${String(Number(rows[0].last)).padStart(6, '0')}`;
  }

  /** Issue an abbreviated tax invoice for money taken. Returns null when the shop has no VAT. */
  async issue(db: Db, a: IssueArgs) {
    if (!a.tenantId || !(a.total > 0)) return null;
    const vatPercent = await this.vatPercentOf(a.tenantId, db);
    if (!vatPercent) return null;
    const { vatBase, vatAmount } = splitVat(a.total, vatPercent);
    const number = await this.nextNumber(db, a.tenantId, a.branchId, 'ABB');
    return (db as any).taxInvoice.create({
      data: {
        tenantId: a.tenantId, branchId: a.branchId ?? null, kind: 'ABB', number,
        sourceType: a.sourceType, sourceId: a.sourceId, reference: a.reference ?? null,
        customerName: a.customerName ?? null,
        total: round2(a.total), vatBase, vatAmount, vatPercent, createdById: a.actorId ?? null,
      },
    });
  }

  /** The tax invoice still standing for a source (the newest that is not cancelled) */
  async activeFor(db: Db, sourceType: TaxSourceType, sourceId: string) {
    return (db as any).taxInvoice.findFirst({
      where:   { sourceType, sourceId, kind: 'ABB', cancelledAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Money given back: a credit note against the tax invoice of the original money, at the VAT %
   * that invoice was issued with. Nothing when that money had no tax invoice (taken before the shop
   * charged VAT, or the shop has none).
   */
  async creditNote(db: Db, a: IssueArgs & { refSourceType: TaxSourceType; refSourceId: string }) {
    if (!a.tenantId || !(a.total > 0)) return null;
    const ref = await this.activeFor(db, a.refSourceType, a.refSourceId);
    if (!ref) return null;
    const vatPercent = Number(ref.vatPercent);
    const { vatBase, vatAmount } = splitVat(Math.min(a.total, Number(ref.total)), vatPercent);
    const number = await this.nextNumber(db, a.tenantId, a.branchId ?? ref.branchId, 'CN');
    return (db as any).taxInvoice.create({
      data: {
        tenantId: a.tenantId, branchId: a.branchId ?? ref.branchId ?? null, kind: 'CN', number,
        sourceType: a.sourceType, sourceId: a.sourceId, reference: a.reference ?? null,
        customerName: a.customerName ?? ref.customerName ?? null,
        total: round2(vatBase + vatAmount), vatBase, vatAmount, vatPercent, refId: ref.id,
        createdById: a.actorId ?? null,
      },
    });
  }

  /**
   * A full tax invoice (A4) for repair jobs replaces the abbreviated ones already handed out for
   * the money on those jobs: they are marked cancelled ("replaced by …") so the VAT is counted once,
   * and the full one is recorded here for the sales tax report and the books.
   */
  async recordFull(db: Db, a: {
    tenantId: string; branchId: string | null; docId: string; number: string; issuedAt: Date;
    repairIds: string[]; customerName: string | null; total: number; vatBase: number; vatAmount: number;
    vatPercent: number; actorId?: string | null;
  }) {
    const addIds = (await (db as any).repairAdditionalPayment.findMany({
      where: { repairId: { in: a.repairIds } }, select: { id: true },
    })).map((p: { id: string }) => p.id);
    await (db as any).taxInvoice.updateMany({
      where: {
        tenantId: a.tenantId, kind: 'ABB', cancelledAt: null,
        OR: [
          { sourceType: 'REPAIR_DEPOSIT', sourceId: { in: a.repairIds } },
          ...a.repairIds.map((id) => ({ sourceType: 'REPAIR_PAYMENT', sourceId: { startsWith: `${id}#` } })),
          ...(addIds.length ? [{ sourceType: 'REPAIR_ADDITIONAL', sourceId: { in: addIds } }] : []),
        ],
      },
      data: { cancelledAt: new Date(), cancelReason: `แทนด้วยใบกำกับภาษีเต็มรูป ${a.number}` },
    });
    return (db as any).taxInvoice.create({
      data: {
        tenantId: a.tenantId, branchId: a.branchId, kind: 'FULL', number: a.number, issuedAt: a.issuedAt,
        sourceType: 'FORMAL_DOC', sourceId: a.docId, reference: a.number, customerName: a.customerName,
        total: round2(a.total), vatBase: round2(a.vatBase), vatAmount: round2(a.vatAmount),
        vatPercent: a.vatPercent, createdById: a.actorId ?? null,
      },
    });
  }

  /** A voided bill: its tax invoice is kept and marked cancelled (never deleted) */
  async cancel(db: Db, sourceType: TaxSourceType, sourceId: string, reason: string) {
    await (db as any).taxInvoice.updateMany({
      where: { sourceType, sourceId, cancelledAt: null },
      data:  { cancelledAt: new Date(), cancelReason: reason.slice(0, 300) },
    });
  }

  /** Every tax invoice and credit note on a repair job (deposit, payments, refunds), oldest first */
  async forRepair(tenantId: string | null | undefined, repairId: string, additionalIds: string[]) {
    if (!tenantId) return [];
    return this.prisma.taxInvoice.findMany({
      where: {
        tenantId,
        OR: [
          { sourceType: 'REPAIR_DEPOSIT', sourceId: repairId },
          { sourceType: 'REPAIR_PAYMENT', sourceId: { startsWith: `${repairId}#` } },
          { sourceType: 'REPAIR_REFUND', sourceId: { startsWith: repairId } },
          ...(additionalIds.length
            ? [{ sourceType: 'REPAIR_ADDITIONAL', sourceId: { in: additionalIds } },
               { sourceType: 'REPAIR_REFUND', sourceId: { in: additionalIds.map((i) => `${i}:refund`) } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Tax invoices for a set of sources, for printing on the shop's own receipts */
  async forSources(tenantId: string | null | undefined, sourceType: TaxSourceType, ids: string[]) {
    if (!tenantId || ids.length === 0) return [];
    return this.prisma.taxInvoice.findMany({
      where:   { tenantId, sourceType, sourceId: { in: ids } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
