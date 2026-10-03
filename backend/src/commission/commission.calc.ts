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

/** How one kind of job pays: baht per job, or a percent of profit / of the job price */
export const RATE_METHODS = ['FIXED', 'PERCENT_LABOR', 'PERCENT_TOTAL'] as const;
export type RateMethod = (typeof RATE_METHODS)[number];
export interface RateRow { method: RateMethod; value: number }

/**
 * A rate card: a row per job type (from the intake tags) and one row for every other job.
 * Each row picks its own method, so screen jobs can pay 150 baht while board jobs pay 40%.
 */
export interface RepairCard { byTag: Record<string, RateRow>; other: RateRow | null }

/** Old single-rule settings and stored JSON both read into a rate card. */
export function normalizeRates(raw: unknown): Record<string, RateRow> {
  const out: Record<string, RateRow> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [tag, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' || typeof v === 'string') {
      // Early saves stored baht only
      if (Number(v) > 0) out[tag] = { method: 'FIXED', value: Number(v) };
    } else if (v && typeof v === 'object') {
      const { method, value } = v as { method?: string; value?: unknown };
      if (RATE_METHODS.includes(method as RateMethod) && Number(value) > 0) {
        out[tag] = { method: method as RateMethod, value: Number(value) };
      }
    }
  }
  return out;
}

export function otherRow(type: string | null | undefined, value: number | null | undefined): RateRow | null {
  return RATE_METHODS.includes(type as RateMethod) && Number(value ?? 0) > 0
    ? { method: type as RateMethod, value: Number(value) }
    : null;
}

const METHOD_NOTE = (r: RateRow) =>
  r.method === 'FIXED' ? `${r.value} บาท/งาน`
  : r.method === 'PERCENT_LABOR' ? `${r.value}% ของกำไร`
  : `${r.value}% ของราคางาน`;

function rowAmount(job: RepairJob, r: RateRow): number {
  switch (r.method) {
    case 'FIXED': return round2(r.value);
    case 'PERCENT_TOTAL': return round2(job.collected * r.value / 100);
    case 'PERCENT_LABOR': return round2(Math.max(0, job.collected - job.partsCost - job.partnerCost) * r.value / 100);
  }
}

/** Commission for one repair job under a rate card, and a short note on how it was worked out. */
export function repairCommission(job: RepairJob, card: RepairCard): { amount: number; note: string } {
  const matches = job.tags.filter((t) => card.byTag[t]);
  if (!matches.length && !card.other) {
    return { amount: 0, note: Object.keys(card.byTag).length ? 'ไม่มีประเภทงานที่ตั้งค่าคอมไว้' : '' };
  }
  if (job.collected <= 0) return { amount: 0, note: 'ไม่มียอดเงินคงเหลือ (คืนเงินแล้ว/ยังไม่ได้รับ)' };

  if (matches.length) {
    // Several job types on one job pay the single best row, never the sum
    let best = { amount: -1, note: '' };
    for (const tag of matches) {
      const r = card.byTag[tag];
      const amount = rowAmount(job, r);
      if (amount > best.amount) best = { amount, note: `${tag}: ${METHOD_NOTE(r)}` };
    }
    return best;
  }
  const r = card.other!;
  return { amount: rowAmount(job, r), note: `งานอื่นๆ: ${METHOD_NOTE(r)}` };
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

/** The shop's card: per-type rows plus its single rule as the row for every other job. */
export function shopCard(type: string, value: number, typeRates: unknown): RepairCard {
  return { byTag: normalizeRates(typeRates), other: otherRow(type, value) };
}

/** A person's own card when they have one, otherwise the shop's. */
export function personCard(
  own: { repairType?: string | null; repairValue?: number | null; repairRates?: unknown } | null | undefined,
  shop: RepairCard,
): RepairCard {
  if (!own || (own.repairType == null && own.repairRates == null)) return shop;
  // Saved before per-person tables: "by type" meant the shop's table
  if (own.repairType === 'BY_TYPE' && own.repairRates == null) return { byTag: shop.byTag, other: null };
  return { byTag: normalizeRates(own.repairRates), other: otherRow(own.repairType, own.repairValue) };
}
