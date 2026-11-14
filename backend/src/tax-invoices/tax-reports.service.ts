import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TaxInvoicesService } from './tax-invoices.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** First and last instant of a month in Bangkok time ('2569-11' or '2026-11') */
function monthRange(month: string): { from: Date; to: Date; label: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!m) throw new BadRequestException('เดือนต้องเป็นรูปแบบ YYYY-MM');
  let year = Number(m[1]);
  if (year > 2400) year -= 543; // Buddhist year given
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new BadRequestException('เดือนไม่ถูกต้อง');
  const from = new Date(Date.UTC(year, mon - 1, 1) - 7 * 3600_000);
  const to   = new Date(Date.UTC(year, mon, 1) - 7 * 3600_000);
  return { from, to, label: `${String(mon).padStart(2, '0')}/${year + 543}` };
}

/**
 * The shop's monthly VAT reports: sales tax report (รายงานภาษีขาย), purchase tax report
 * (รายงานภาษีซื้อ) and the figures for the monthly VAT return (ภ.พ.30). Read only.
 */
@Injectable()
export class TaxReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxInvoices: TaxInvoicesService,
  ) {}

  private async shop(tenantId: string) {
    const s = await this.prisma.shopSettings.findUnique({
      where:  { tenantId },
      select: { shopName: true, legalName: true, taxId: true, taxBranch: true, shopAddress: true, vatPercent: true },
    });
    return {
      name:       s?.legalName || s?.shopName || '',
      taxId:      s?.taxId ?? null,
      taxBranch:  s?.taxBranch || 'สำนักงานใหญ่',
      address:    s?.shopAddress ?? null,
      vatPercent: Number(s?.vatPercent ?? 0),
    };
  }

  async sales(tenantId: string, month: string, branchId?: string) {
    const { from, to, label } = monthRange(month);
    // Anything not yet in the books goes there first (the report and the books agree)
    await this.taxInvoices.bookVat(tenantId);
    const rows = await this.prisma.taxInvoice.findMany({
      where:   { tenantId, issuedAt: { gte: from, lt: to }, ...(branchId ? { branchId } : {}) },
      orderBy: [{ issuedAt: 'asc' }, { number: 'asc' }],
    });
    const refIds = rows.map((r) => r.refId).filter(Boolean) as string[];
    const refs = refIds.length
      ? await this.prisma.taxInvoice.findMany({ where: { id: { in: refIds } }, select: { id: true, number: true } })
      : [];
    const docIds = rows.filter((r) => r.kind === 'FULL').map((r) => r.sourceId);
    const docs = docIds.length
      ? await this.prisma.formalDocument.findMany({ where: { id: { in: docIds }, tenantId }, select: { id: true, content: true } })
      : [];
    const buyerOf = new Map(docs.map((d) => [d.id, (d.content as any)?.buyer ?? null]));
    const branches = await this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    const lines = rows.map((r) => {
      const buyer = r.kind === 'FULL' ? buyerOf.get(r.sourceId) : null;
      const sign  = r.kind === 'CN' ? -1 : 1;
      const counts = !r.cancelledAt;
      return {
        id: r.id, date: r.issuedAt, number: r.number, kind: r.kind, reference: r.reference,
        branch: r.branchId ? branchName.get(r.branchId) ?? null : null,
        customerName: buyer?.name ?? r.customerName ?? null,
        customerTaxId: buyer?.taxId ?? null, customerTaxBranch: buyer?.taxBranch ?? null,
        refNumber: r.refId ? refs.find((x) => x.id === r.refId)?.number ?? null : null,
        vatBase: sign * Number(r.vatBase), vatAmount: sign * Number(r.vatAmount), total: sign * Number(r.total),
        cancelled: !counts, cancelReason: r.cancelReason,
      };
    });
    const counted = lines.filter((l) => !l.cancelled);
    return {
      shop: await this.shop(tenantId), month: label, lines,
      totals: {
        vatBase:   round2(counted.reduce((s, l) => s + l.vatBase, 0)),
        vatAmount: round2(counted.reduce((s, l) => s + l.vatAmount, 0)),
        total:     round2(counted.reduce((s, l) => s + l.total, 0)),
        documents: counted.length,
        cancelled: lines.length - counted.length,
      },
    };
  }

  async purchases(tenantId: string, month: string, branchId?: string) {
    const { from, to, label } = monthRange(month);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        vatAmount: { gt: 0 },
        status:    { not: 'CANCELLED' },
        OR: [{ branch: { tenantId } }, { branchId: null, supplier: { tenantId } }],
        ...(branchId ? { branchId } : {}),
        AND: [{ OR: [
          { supplierTaxInvoiceDate: { gte: from, lt: to } },
          { supplierTaxInvoiceDate: null, orderDate: { gte: from, lt: to } },
        ] }],
      },
      include: { supplier: { select: { name: true, taxId: true } } },
      orderBy: { orderDate: 'asc' },
    });
    const lines = pos.map((po) => {
      const vatAmount = Number(po.vatAmount);
      return {
        id: po.id, poNumber: po.poNumber,
        date: po.supplierTaxInvoiceDate ?? po.orderDate,
        supplierTaxInvoiceNo: po.supplierTaxInvoiceNo,
        supplierName: po.supplier?.name ?? '', supplierTaxId: po.supplier?.taxId ?? null,
        vatBase: round2(Number(po.total) - vatAmount), vatAmount, total: Number(po.total),
        // Input VAT is claimed only with the supplier's tax invoice in hand
        missing: !po.supplierTaxInvoiceNo ? 'ยังไม่ได้ใส่เลขที่ใบกำกับภาษีของผู้ขาย'
          : !po.supplier?.taxId ? 'ผู้ขายยังไม่มีเลขประจำตัวผู้เสียภาษี' : null,
      };
    });
    const claimable = lines.filter((l) => !l.missing);
    return {
      shop: await this.shop(tenantId), month: label, lines,
      totals: {
        vatBase:   round2(claimable.reduce((s, l) => s + l.vatBase, 0)),
        vatAmount: round2(claimable.reduce((s, l) => s + l.vatAmount, 0)),
        total:     round2(claimable.reduce((s, l) => s + l.total, 0)),
        documents: claimable.length,
        incomplete: lines.length - claimable.length,
      },
    };
  }

  /** The figures for the monthly VAT return */
  async pp30(tenantId: string, month: string, branchId?: string) {
    const [s, p] = await Promise.all([this.sales(tenantId, month, branchId), this.purchases(tenantId, month, branchId)]);
    const payable = round2(s.totals.vatAmount - p.totals.vatAmount);
    return {
      shop: s.shop, month: s.month,
      salesBase: s.totals.vatBase, outputVat: s.totals.vatAmount,
      purchaseBase: p.totals.vatBase, inputVat: p.totals.vatAmount,
      payable: payable > 0 ? payable : 0, carryForward: payable < 0 ? -payable : 0,
      incompletePurchases: p.totals.incomplete, cancelledSales: s.totals.cancelled,
    };
  }
}
