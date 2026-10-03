/**
 * Pure commission maths, kept apart from the database so every rule can be unit-tested.
 * Nothing here changes stored money: commission is a report the shop pays from.
 */

export const REPAIR_TYPES = ['NONE', 'PERCENT_LABOR', 'PERCENT_TOTAL', 'FIXED', 'BY_TYPE'] as const;
export const SALE_TYPES   = ['NONE', 'PERCENT_PROFIT', 'PERCENT_TOTAL', 'FIXED_PER_UNIT'] as const;
export const SALE_SCOPES  = ['PHONE', 'ALL'] as const;
export type RepairCommissionType = (typeof REPAIR_TYPES)[number];
export type SaleCommissionType   = (typeof SALE_TYPES)[number];

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RepairJob {
  /** Money actually kept: deposit + payments + later payments − refunds */
  collected: number;
  partsCost: number;
  /** What the shop paid a partner shop that did the work */
  partnerCost: number;
  tags: string[];
}

export interface RepairRule { type: RepairCommissionType; value: number; typeRates: Record<string, number> }

/** Commission for one repair job, and a short note on how it was worked out. */
export function repairCommission(job: RepairJob, rule: RepairRule): { amount: number; note: string } {
  if (rule.type === 'NONE') return { amount: 0, note: '' };
  if (job.collected <= 0) return { amount: 0, note: 'ไม่มียอดเงินคงเหลือ (คืนเงินแล้ว/ยังไม่ได้รับ)' };

  switch (rule.type) {
    case 'PERCENT_TOTAL':
      return { amount: round2(job.collected * rule.value / 100), note: `${rule.value}% ของยอดงาน` };
    case 'PERCENT_LABOR': {
      const profit = Math.max(0, job.collected - job.partsCost - job.partnerCost);
      return { amount: round2(profit * rule.value / 100), note: `${rule.value}% ของกำไร ${round2(profit)}` };
    }
    case 'FIXED':
      return { amount: round2(rule.value), note: 'เหมาต่องาน' };
    case 'BY_TYPE': {
      // Several tags on one job pay the single highest rate, never the sum
      let best = 0;
      let bestTag = '';
      for (const tag of job.tags) {
        const rate = Number(rule.typeRates[tag] ?? 0);
        if (rate > best) { best = rate; bestTag = tag; }
      }
      return best > 0
        ? { amount: round2(best), note: `ประเภทงาน: ${bestTag}` }
        : { amount: 0, note: 'ไม่มีประเภทงานที่ตั้งค่าคอมไว้' };
    }
  }
  return { amount: 0, note: '' };
}

export interface SaleLine {
  /** Units still sold after refunds */
  qty: number;
  /** Net money for those units, after item and bill discounts */
  revenue: number;
  cost: number;
}

export interface SaleRule { type: SaleCommissionType; value: number }

export function saleCommission(line: SaleLine, rule: SaleRule): { amount: number; note: string } {
  if (rule.type === 'NONE' || line.qty <= 0) return { amount: 0, note: '' };
  switch (rule.type) {
    case 'PERCENT_TOTAL':
      return { amount: round2(line.revenue * rule.value / 100), note: `${rule.value}% ของยอดขาย` };
    case 'PERCENT_PROFIT': {
      const profit = Math.max(0, line.revenue - line.cost);
      return { amount: round2(profit * rule.value / 100), note: `${rule.value}% ของกำไร ${round2(profit)}` };
    }
    case 'FIXED_PER_UNIT':
      return { amount: round2(rule.value * line.qty), note: `${rule.value} บาท × ${line.qty} เครื่อง` };
  }
  return { amount: 0, note: '' };
}

/** A person's own rate when set, otherwise the shop's. */
export function pickRule<T extends { type: string; value: number }>(
  shop: T, own?: { type?: string | null; value?: number | null } | null,
): T {
  if (own?.type) return { ...shop, type: own.type, value: Number(own.value ?? 0) };
  return shop;
}
