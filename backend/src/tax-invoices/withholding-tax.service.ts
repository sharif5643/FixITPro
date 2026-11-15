import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ModulesService } from '../modules/modules.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

type Db = Prisma.TransactionClient | PrismaService;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Withholding tax still standing on each job (cancelled certificates do not count) */
export async function whtByRepair(db: Db, repairIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // (a test double without the table has no certificates)
  if (!repairIds.length || typeof (db as any).withholdingTax?.groupBy !== 'function') return out;
  const rows = await (db as any).withholdingTax.groupBy({
    by: ['repairId'], where: { repairId: { in: repairIds }, cancelledAt: null }, _sum: { amount: true },
  });
  for (const r of rows) out.set(r.repairId, Number(r._sum.amount ?? 0));
  return out;
}

export interface RecordWhtDto {
  amount: number;
  ratePercent: number;
  baseAmount: number;
  payerName: string;
  payerTaxId?: string;
  certificateNo?: string;
  certificateDate?: string;
  note?: string;
}

/**
 * Withholding tax on repair bills: an agency (1%) or a company (3% on services) pays the bill
 * less the tax and hands over a certificate (50 ทวิ). That part of the job is settled without
 * cash: it never enters a drawer, a shift or the daily close; in the books it is the shop's tax
 * credit (1150) against repair revenue; the shop claims it on its yearly income tax.
 */
@Injectable()
export class WithholdingTaxService {
  private readonly logger = new Logger(WithholdingTaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly journal?: JournalService,
    @Optional() private readonly modules?: ModulesService,
  ) {}

  private async jobOf(db: Db, repairId: string, tenantId: string) {
    const r = await (db as any).repair.findFirst({
      where:  { id: repairId, branch: { tenantId } },
      select: {
        id: true, ticketNumber: true, status: true, paymentStatus: true, branchId: true,
        finalCost: true, estimatedTotal: true, estimateCost: true, deposit: true, paidAmount: true,
        additionalPayments: { select: { amount: true } },
      },
    });
    if (!r) throw new NotFoundException('ไม่พบงานซ่อม');
    return r;
  }

  /** What is still owed on a delivered job, after cash and certificates already recorded */
  private owed(r: any, wht: number): number {
    const price = Number(r.finalCost ?? r.estimatedTotal ?? r.estimateCost ?? 0);
    const paid  = Number(r.deposit ?? 0) + Number(r.paidAmount ?? 0)
      + (r.additionalPayments ?? []).reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0);
    return round2(price - paid - wht);
  }

  async record(repairId: string, dto: RecordWhtDto, actor: { id: string; name?: string; role: string }, tenantId: string) {
    if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') throw new ForbiddenException('บันทึกภาษีหัก ณ ที่จ่ายได้เฉพาะเจ้าของร้านหรือผู้จัดการ');
    const amount = round2(Number(dto.amount));
    if (!(amount > 0)) throw new BadRequestException('ยอดภาษีที่ถูกหักต้องมากกว่า 0');
    if (!dto.payerName?.trim()) throw new BadRequestException('กรุณาใส่ชื่อผู้หักภาษี (หน่วยงาน/บริษัทที่จ่ายเงิน)');
    const date = dto.certificateDate ? new Date(`${dto.certificateDate.slice(0, 10)}T12:00:00+07:00`) : new Date();
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86_400_000) throw new BadRequestException('วันที่ในหนังสือรับรองไม่ถูกต้อง');

    const row = await this.prisma.$transaction(async (tx) => {
      // One at a time per job: two entries at once could settle more than is owed
      await tx.$queryRaw`SELECT id FROM "Repair" WHERE id = ${repairId} FOR UPDATE`;
      const r = await this.jobOf(tx, repairId, tenantId);
      if (r.status !== 'DELIVERED') throw new BadRequestException('บันทึกภาษีหัก ณ ที่จ่ายได้หลังส่งมอบเครื่องและรับเงินส่วนที่เหลือแล้ว');
      const wht = (await whtByRepair(tx, [repairId])).get(repairId) ?? 0;
      const owed = this.owed(r, wht);
      if (amount > owed + 0.005) {
        throw new BadRequestException(`ยอดภาษี ${amount.toLocaleString('th-TH')} เกินยอดที่ยังค้างบนงานนี้ (${Math.max(0, owed).toLocaleString('th-TH')})`);
      }
      const created = await (tx as any).withholdingTax.create({
        data: {
          tenantId, branchId: r.branchId, repairId, amount,
          ratePercent: round2(Number(dto.ratePercent ?? 0)), baseAmount: round2(Number(dto.baseAmount ?? 0)),
          payerName: dto.payerName.trim().slice(0, 200), payerTaxId: dto.payerTaxId?.trim() || null,
          certificateNo: dto.certificateNo?.trim() || null, certificateDate: date,
          note: dto.note?.trim() || null, createdById: actor.id,
        },
      });
      // Settled in full: the job is paid (the certificate stands in for the last of the money)
      if (owed - amount <= 0.005 && r.paymentStatus !== 'PAID') {
        await tx.repair.update({ where: { id: repairId }, data: { paymentStatus: 'PAID' } });
      }
      await (tx as any).auditLog.create({
        data: {
          actorId: actor.id, actorName: actor.name ?? null, action: 'REPAIR_WHT_RECORDED', entityType: 'Repair', entityId: repairId,
          afterData: { amount, ratePercent: dto.ratePercent, payerName: dto.payerName, certificateNo: dto.certificateNo ?? null, ticketNumber: r.ticketNumber },
        },
      });
      return { ...created, ticketNumber: r.ticketNumber };
    });
    await this.book(row, tenantId, actor.id);
    return row;
  }

  async cancel(id: string, reason: string, actor: { id: string; name?: string; role: string }, tenantId: string) {
    if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') throw new ForbiddenException('ยกเลิกได้เฉพาะเจ้าของร้านหรือผู้จัดการ');
    const why = (reason ?? '').trim();
    if (why.length < 3) throw new BadRequestException('กรุณาระบุเหตุผลที่ยกเลิก');
    const row = await this.prisma.withholdingTax.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('ไม่พบรายการ');
    if (row.cancelledAt) throw new BadRequestException('รายการนี้ถูกยกเลิกไปแล้ว');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Repair" WHERE id = ${row.repairId} FOR UPDATE`;
      const won = await tx.withholdingTax.updateMany({ where: { id, cancelledAt: null }, data: { cancelledAt: new Date(), cancelReason: why.slice(0, 300) } });
      if (won.count === 0) throw new BadRequestException('รายการนี้ถูกยกเลิกไปแล้ว');
      const r = await this.jobOf(tx, row.repairId, tenantId);
      const wht = (await whtByRepair(tx, [row.repairId])).get(row.repairId) ?? 0;
      // Owed again: the job goes back to partly paid
      if (this.owed(r, wht) > 0.005 && r.paymentStatus === 'PAID') {
        await tx.repair.update({ where: { id: row.repairId }, data: { paymentStatus: 'PARTIAL' } });
      }
      await (tx as any).auditLog.create({
        data: { actorId: actor.id, actorName: actor.name ?? null, action: 'REPAIR_WHT_CANCELLED', entityType: 'Repair', entityId: row.repairId, afterData: { whtId: id, reason: why } },
      });
    });
    if (this.journal && this.modules && (await this.modules.isAccountingEnabled(tenantId).catch(() => false))) {
      try {
        const j = await this.journal.findBySource('REPAIR_WHT', id, tenantId);
        if (j && !j.isVoided) await this.journal.reverse(j.id, tenantId, `ยกเลิกภาษีหัก ณ ที่จ่าย: ${why}`, actor.id);
      } catch (e) { this.logger.warn(`WHT cancel journal failed ${id}: ${(e as Error).message}`); }
    }
    return { cancelled: true };
  }

  /** Books: the certificate is a tax credit against repair revenue. Never throws. */
  private async book(row: { id: string; amount: unknown; branchId: string | null; certificateDate: Date; ticketNumber: string }, tenantId: string, actorId: string) {
    if (!this.journal || !this.modules) return;
    try {
      if (!(await this.modules.isAccountingEnabled(tenantId))) return;
      const amt = Number(row.amount).toFixed(2);
      await this.journal.create({
        tenantId, branchId: row.branchId, entryDate: row.certificateDate,
        description: `ภาษีถูกหัก ณ ที่จ่าย — งานซ่อม ${row.ticketNumber}`,
        sourceType: 'REPAIR_WHT', sourceId: row.id, sourceRef: row.ticketNumber, postedById: actorId,
        lines: [
          { accountCode: ACCOUNT_CODES.WHT_RECEIVABLE, debit: amt },
          { accountCode: ACCOUNT_CODES.REPAIR_REVENUE, credit: amt },
        ],
      } as any);
    } catch (e) {
      this.logger.warn(`WHT journal failed ${row.id}: ${(e as Error).message}`);
    }
  }

  /** Certificates in a year (Buddhist or Christian year) — claimed on the yearly income tax */
  async yearReport(tenantId: string, year: string) {
    let y = Number(year);
    if (!Number.isInteger(y)) throw new BadRequestException('ปีไม่ถูกต้อง');
    if (y > 2400) y -= 543;
    const from = new Date(Date.UTC(y, 0, 1) - 7 * 3600_000);
    const to   = new Date(Date.UTC(y + 1, 0, 1) - 7 * 3600_000);
    const rows = await this.prisma.withholdingTax.findMany({
      where: { tenantId, certificateDate: { gte: from, lt: to } },
      orderBy: { certificateDate: 'asc' },
    });
    const jobs = rows.length
      ? await this.prisma.repair.findMany({ where: { id: { in: rows.map((r) => r.repairId) } }, select: { id: true, ticketNumber: true } })
      : [];
    const ticket = new Map(jobs.map((j) => [j.id, j.ticketNumber]));
    const lines = rows.map((r) => ({
      id: r.id, date: r.certificateDate, ticketNumber: ticket.get(r.repairId) ?? null, repairId: r.repairId,
      payerName: r.payerName, payerTaxId: r.payerTaxId, certificateNo: r.certificateNo,
      ratePercent: Number(r.ratePercent), baseAmount: Number(r.baseAmount), amount: Number(r.amount),
      cancelled: !!r.cancelledAt, cancelReason: r.cancelReason,
    }));
    const counted = lines.filter((l) => !l.cancelled);
    return {
      year: y + 543, lines,
      totals: { amount: round2(counted.reduce((s, l) => s + l.amount, 0)), baseAmount: round2(counted.reduce((s, l) => s + l.baseAmount, 0)), certificates: counted.length },
    };
  }

  forRepair(repairId: string, tenantId: string) {
    return this.prisma.withholdingTax.findMany({ where: { repairId, tenantId }, orderBy: { createdAt: 'asc' } });
  }
}
