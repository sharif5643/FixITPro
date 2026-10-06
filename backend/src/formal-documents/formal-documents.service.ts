import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FormalDocType, FormalDocumentDraftDto } from './dto/issue-formal-document.dto';

const PREFIX: Record<FormalDocType, string> = { QUOTATION: 'QT', INVOICE: 'IV', RECEIPT: 'RC' };

export interface FormalLine {
  key: string;
  description: string;
  detail?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface FormalContent {
  type: FormalDocType;
  title: string;
  titleEn: string;
  isTaxInvoice: boolean;
  seller: { name: string; address?: string | null; phone?: string | null; taxId?: string | null; taxBranch?: string | null; logoUrl?: string | null };
  buyer:  { name: string; address?: string | null; phone?: string | null; taxId?: string | null; taxBranch?: string | null };
  refs: string[];
  lines: FormalLine[];
  total: number;
  vatPercent: number;
  vatBase: number;
  vatAmount: number;
  /** ticked on the paper; null = none ticked (filled in by hand) */
  paymentMethod: string | null;
  /** every job is fully paid in the system */
  allPaid: boolean;
  note?: string | null;
  warrantyText?: string | null;
  quoteValidDays?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A date given as yyyy-MM-dd is the shop's day in Thailand; keep it at midday so no timezone moves it. */
function thaiDay(d: string): Date {
  return new Date(`${d}T12:00:00+07:00`);
}

function buddhistYear(d = new Date()): number {
  return new Date(d.getTime() + 7 * 3600_000).getUTCFullYear() + 543;
}

@Injectable()
export class FormalDocumentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private async loadRepairs(ids: string[], tenantId: string) {
    const repairs = await this.prisma.repair.findMany({
      where: {
        id: { in: ids },
        OR: [{ branch: { tenantId } }, { branchId: null, customer: { tenantId } }],
      },
      include: {
        customer: true,
        parts: { where: { isVoided: false, chargeToCustomer: true }, include: { product: { select: { name: true } } } },
      },
      orderBy: [{ receivedAt: 'asc' }, { ticketNumber: 'asc' }],
    });
    if (repairs.length !== new Set(ids).size) throw new NotFoundException('ไม่พบงานซ่อมบางรายการ');
    const customerIds = new Set(repairs.map((r) => r.customerId ?? ''));
    if (customerIds.size > 1) throw new BadRequestException('งานซ่อมที่เลือกต้องเป็นของลูกค้าคนเดียวกัน');
    return repairs;
  }

  /** Build the paper's content from the jobs, the shop settings and what the person typed. */
  async buildContent(dto: FormalDocumentDraftDto, tenantId: string): Promise<{ content: FormalContent; docDate: Date; customerId: string | null; branchId: string | null }> {
    const repairs  = await this.loadRepairs(dto.repairIds, tenantId);
    const settings = await this.prisma.shopSettings.findUnique({ where: { tenantId } });
    const vatPercent = Number(settings?.vatPercent ?? 0) > 0 ? Number(settings!.vatPercent) : 0;
    const type = dto.type;
    const overrides = new Map((dto.lines ?? []).map((l) => [l.key, l]));

    const lines: FormalLine[] = [];
    for (const r of repairs) {
      const raw = type === 'QUOTATION'
        ? (r.estimatedTotal ?? r.estimateCost ?? r.finalCost)
        : (r.finalCost ?? r.estimatedTotal ?? r.estimateCost);
      const price = Number(raw ?? 0);
      const parts = r.parts.map((p) => ({
        key: `${r.id}:part:${p.id}`,
        description: `${p.productName ?? p.product?.name ?? 'อะไหล่'} (อะไหล่)`,
        quantity: p.quantity,
        unit: 'ชิ้น',
        unitPrice: Number(p.sellPrice ?? 0),
      }));
      const partsSum = parts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
      const labour   = Math.max(0, price - partsSum);
      const device   = [r.deviceType, r.deviceBrand, r.deviceModel].filter(Boolean).join(' ');
      const detail   = [
        r.deviceImei ? `S/N ${r.deviceImei}` : '',
        r.assetTag ? `เลขครุภัณฑ์ ${r.assetTag}` : '',
        r.issue ? `อาการ: ${r.issue}` : '',
      ].filter(Boolean).join(' · ');
      const all = [
        { key: `${r.id}:labor`, description: `ค่าบริการซ่อม ${device}`.trim(), detail, quantity: 1, unit: 'งาน', unitPrice: labour },
        ...parts,
      ];
      for (const l of all) {
        const o = overrides.get(l.key);
        lines.push({
          key:         l.key,
          description: o?.description?.trim() || l.description,
          detail:      o?.detail !== undefined ? o.detail.trim() : (l as any).detail,
          quantity:    l.quantity,
          unit:        o?.unit?.trim() || l.unit,
          unitPrice:   round2(l.unitPrice),
          amount:      round2(l.quantity * l.unitPrice),
        });
      }
    }

    const total     = round2(lines.reduce((s, l) => s + l.amount, 0));
    const vatBase   = vatPercent ? round2(total * 100 / (100 + vatPercent)) : total;
    const vatAmount = vatPercent ? round2(total - vatBase) : 0;
    const isTaxInvoice = type === 'RECEIPT' && vatPercent > 0;
    if (isTaxInvoice && dto.hideDate) throw new BadRequestException('ใบกำกับภาษีต้องลงวันที่ตามกฎหมาย');

    const allPaid = repairs.every((r) => r.paymentStatus === 'PAID');
    const methods = new Set(repairs.flatMap((r) => [r.paymentMethod, Number(r.deposit ?? 0) > 0 ? r.depositPaymentMethod : null]).filter(Boolean) as string[]);
    const paymentMethod = type === 'RECEIPT' && allPaid && methods.size === 1 ? [...methods][0] : null;

    const latest = (dates: (Date | null)[]) => dates.filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    const docDate = dto.docDate
      ? thaiDay(dto.docDate)
      : type === 'RECEIPT' && allPaid ? (latest(repairs.map((r) => r.paidAt)) ?? new Date())
      : type === 'INVOICE' ? (latest(repairs.map((r) => r.deliveredAt)) ?? new Date())
      : new Date();

    const legal = dto.nameMode === 'LEGAL' && settings?.legalName?.trim();
    const c = repairs[0].customer;
    const b = dto.buyer ?? {};
    const content: FormalContent = {
      type,
      title:   type === 'QUOTATION' ? 'ใบเสนอราคา' : type === 'INVOICE' ? 'ใบส่งของ / ใบแจ้งหนี้' : isTaxInvoice ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี' : 'ใบเสร็จรับเงิน',
      titleEn: type === 'QUOTATION' ? 'QUOTATION' : type === 'INVOICE' ? 'DELIVERY NOTE / INVOICE' : isTaxInvoice ? 'RECEIPT / TAX INVOICE' : 'RECEIPT',
      isTaxInvoice,
      seller: {
        name:      legal ? settings!.legalName!.trim() : (settings?.shopName || 'FixITPro'),
        address:   settings?.shopAddress ?? null,
        phone:     settings?.shopPhone ?? null,
        taxId:     settings?.taxId ?? null,
        taxBranch: settings?.taxBranch || (vatPercent ? 'สำนักงานใหญ่' : null),
        logoUrl:   settings?.showLogo === false ? null : (settings?.logoUrl ?? null),
      },
      buyer: {
        name:      b.name?.trim() || c?.name || '—',
        address:   b.address !== undefined ? b.address.trim() || null : (c?.address ?? null),
        phone:     b.phone !== undefined ? b.phone.trim() || null : (c?.phone ?? null),
        taxId:     b.taxId !== undefined ? b.taxId.trim() || null : (c?.taxId ?? null),
        taxBranch: b.taxBranch !== undefined ? b.taxBranch.trim() || null : (c?.taxBranch ?? null),
      },
      refs: repairs.map((r) => r.ticketNumber),
      lines,
      total,
      vatPercent,
      vatBase,
      vatAmount,
      paymentMethod,
      allPaid,
      note: dto.note?.trim() || null,
      warrantyText: type === 'RECEIPT' ? (settings?.repairWarrantyText ?? null) : null,
      ...(type === 'QUOTATION' ? { quoteValidDays: 30 } : {}),
    };
    return { content, docDate, customerId: repairs[0].customerId, branchId: repairs[0].branchId };
  }

  /** What the paper would say — for the preview before issuing. No number is taken. */
  async draft(dto: FormalDocumentDraftDto, tenantId: string) {
    const { content, docDate } = await this.buildContent(dto, tenantId);
    return { content, docDate, hideDate: !!dto.hideDate };
  }

  private async nextNumber(tx: Prisma.TransactionClient, tenantId: string, type: FormalDocType): Promise<string> {
    const year = buddhistYear();
    const row = await tx.formalDocumentCounter.upsert({
      where:  { tenantId_type_year: { tenantId, type, year } },
      create: { tenantId, type, year, last: 1 },
      update: { last: { increment: 1 } },
    });
    return `${PREFIX[type]}${year}-${String(row.last).padStart(4, '0')}`;
  }

  async issue(dto: FormalDocumentDraftDto, actorId: string, actorName: string, tenantId: string) {
    const { content, docDate, customerId, branchId } = await this.buildContent(dto, tenantId);
    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await this.prisma.$transaction(async (tx) => {
          const number = await this.nextNumber(tx, tenantId, dto.type);
          return tx.formalDocument.create({
            data: {
              tenantId, branchId, customerId,
              type:       dto.type,
              number,
              docDate,
              hideDate:   !!dto.hideDate,
              repairIds:  dto.repairIds,
              total:      content.total,
              vatPercent: content.vatPercent,
              content:    content as unknown as Prisma.InputJsonValue,
              createdById: actorId,
              createdBy:   actorName,
            },
          });
        });
        await this.auditLog.log({
          actorId, actorName,
          action:     'FORMAL_DOCUMENT_ISSUED',
          entityType: 'FormalDocument',
          entityId:   doc.id,
          afterData:  { type: doc.type, number: doc.number, total: content.total, hideDate: doc.hideDate, repairs: content.refs },
        } as any);
        return doc;
      } catch (e) {
        // Two people issuing at the same moment: the counter row is created twice — try again
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  async list(query: { repairId?: string; customerId?: string }, tenantId: string) {
    if (!query.repairId && !query.customerId) throw new BadRequestException('ต้องระบุงานซ่อมหรือลูกค้า');
    return this.prisma.formalDocument.findMany({
      where: {
        tenantId,
        ...(query.repairId ? { repairIds: { has: query.repairId } } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      select: { id: true, type: true, number: true, docDate: true, hideDate: true, total: true, createdBy: true, createdAt: true, repairIds: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string, tenantId: string) {
    const doc = await this.prisma.formalDocument.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException('ไม่พบเอกสาร');
    return doc;
  }
}
