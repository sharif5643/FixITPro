/**
 * Phase 11 — Analytics & Intelligence tests
 *
 * Pure logic tests: dead stock calculation, repair aging buckets,
 * profit margin, technician metrics, branch filter enforcement.
 * No React rendering, no HTTP calls.
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers inlined from analytics.service.ts
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

function daysSince(date: Date | string, now = Date.now()): number {
  return Math.floor((now - new Date(date).getTime()) / MS_PER_DAY)
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'object' ? Number((v as any).toString()) : Number(v)
}

/** Maps a days-since-last-sold value to a suggested action. */
function suggestAction(daysSinceLastSold: number | null): string {
  if (!daysSinceLastSold)              return 'NEVER_SOLD'
  if (daysSinceLastSold > 90)          return 'DISCOUNT_OR_RETURN'
  if (daysSinceLastSold > 60)          return 'PROMOTE'
  return 'MONITOR'
}

/** Groups a list of open repairs into aging buckets. */
function groupByAgeBucket(repairs: Array<{ receivedAt: string }>, now = Date.now()) {
  const buckets = { fresh: [] as typeof repairs, moderate: [] as typeof repairs, old: [] as typeof repairs, critical: [] as typeof repairs }
  for (const r of repairs) {
    const d = daysSince(r.receivedAt, now)
    if (d <= 1)      buckets.fresh.push(r)
    else if (d <= 3) buckets.moderate.push(r)
    else if (d <= 7) buckets.old.push(r)
    else             buckets.critical.push(r)
  }
  return buckets
}

/** Calculate gross profit and margin for a list of sale items. */
function calcProfit(items: Array<{ quantity: number; price: number; costPrice: number }>) {
  let revenue = 0
  let cost    = 0
  for (const i of items) {
    revenue += i.price    * i.quantity
    cost    += i.costPrice * i.quantity
  }
  const grossProfit = revenue - cost
  const margin      = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0
  return { revenue, cost, grossProfit, margin }
}

/** Branch-filter enforcement logic (mirrors controller effectiveBranchId logic). */
function effectiveBranchId(role: string, queryBranchId: string | undefined, userBranchId: string | undefined) {
  const elevated = role === 'OWNER' || role === 'SUPER_ADMIN'
  return elevated ? queryBranchId : (userBranchId ?? undefined)
}

/** Dead-stock cost value calculation. */
function deadStockCostValue(items: Array<{ quantity: number; costPrice: number }>) {
  return items.reduce((sum, i) => sum + toNum(i.costPrice) * i.quantity, 0)
}

/** Technician claim rate. */
function claimRate(totalRepairs: number, claimCount: number): number {
  if (totalRepairs === 0) return 0
  return Math.round((claimCount / totalRepairs) * 1000) / 10
}

/** Average repair time in hours for completed repairs with completedAt set. */
function avgRepairTimeHours(
  repairs: Array<{ receivedAt: string; completedAt: string | null }>,
): number | null {
  const completed = repairs.filter((r) => r.completedAt)
  if (completed.length === 0) return null
  const totalHours = completed.reduce((sum, r) => {
    return sum + (new Date(r.completedAt!).getTime() - new Date(r.receivedAt).getTime()) / 3_600_000
  }, 0)
  return Math.round((totalHours / completed.length) * 10) / 10
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Branch filter enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('Branch filter enforcement', () => {
  it('OWNER can view all branches (no branchId → undefined)', () => {
    expect(effectiveBranchId('OWNER', undefined, 'branch-1')).toBeUndefined()
  })

  it('OWNER can filter to a specific branch via query param', () => {
    expect(effectiveBranchId('OWNER', 'branch-2', 'branch-1')).toBe('branch-2')
  })

  it('SUPER_ADMIN behaves like OWNER', () => {
    expect(effectiveBranchId('SUPER_ADMIN', 'branch-X', 'branch-1')).toBe('branch-X')
  })

  it('MANAGER is forced to their JWT branchId (query param ignored)', () => {
    expect(effectiveBranchId('MANAGER', 'branch-other', 'branch-1')).toBe('branch-1')
  })

  it('CASHIER is forced to their JWT branchId', () => {
    expect(effectiveBranchId('CASHIER', 'branch-other', 'branch-1')).toBe('branch-1')
  })

  it('TECHNICIAN is forced to their JWT branchId', () => {
    expect(effectiveBranchId('TECHNICIAN', undefined, 'branch-1')).toBe('branch-1')
  })

  it('non-elevated user with no branchId returns undefined', () => {
    expect(effectiveBranchId('CASHIER', 'branch-other', undefined)).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dead stock calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Dead stock calculation', () => {
  it('calculates cost value = costPrice × quantity for each item', () => {
    const items = [
      { quantity: 5,  costPrice: 100 },
      { quantity: 3,  costPrice: 250 },
    ]
    expect(deadStockCostValue(items)).toBe(5 * 100 + 3 * 250)
  })

  it('zero-quantity items contribute 0 to cost value', () => {
    const items = [{ quantity: 0, costPrice: 500 }]
    expect(deadStockCostValue(items)).toBe(0)
  })

  it('empty list returns 0', () => {
    expect(deadStockCostValue([])).toBe(0)
  })

  it('NEVER_SOLD when daysSinceLastSold is null', () => {
    expect(suggestAction(null)).toBe('NEVER_SOLD')
  })

  it('>90 days → DISCOUNT_OR_RETURN', () => {
    expect(suggestAction(91)).toBe('DISCOUNT_OR_RETURN')
    expect(suggestAction(200)).toBe('DISCOUNT_OR_RETURN')
  })

  it('61–90 days → PROMOTE', () => {
    expect(suggestAction(61)).toBe('PROMOTE')
    expect(suggestAction(90)).toBe('PROMOTE')
  })

  it('1–60 days → MONITOR', () => {
    expect(suggestAction(1)).toBe('MONITOR')
    expect(suggestAction(60)).toBe('MONITOR')
  })

  it('toNum handles Prisma Decimal objects via toString()', () => {
    const decimalLike = { toString: () => '123.45' }
    expect(toNum(decimalLike)).toBe(123.45)
  })

  it('toNum handles null / undefined as 0', () => {
    expect(toNum(null)).toBe(0)
    expect(toNum(undefined)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Repair aging buckets
// ─────────────────────────────────────────────────────────────────────────────

describe('Repair aging buckets', () => {
  const fix = (daysAgo: number, now: number) =>
    new Date(now - daysAgo * MS_PER_DAY).toISOString()

  it('same-day repair (0 days) → fresh', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(0, now) }], now)
    expect(result.fresh).toHaveLength(1)
    expect(result.moderate).toHaveLength(0)
  })

  it('1-day-old repair → fresh', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(1, now) }], now)
    expect(result.fresh).toHaveLength(1)
  })

  it('2-day-old repair → moderate', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(2, now) }], now)
    expect(result.moderate).toHaveLength(1)
  })

  it('3-day-old repair → moderate', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(3, now) }], now)
    expect(result.moderate).toHaveLength(1)
  })

  it('5-day-old repair → old', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(5, now) }], now)
    expect(result.old).toHaveLength(1)
  })

  it('7-day-old repair → old (boundary)', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(7, now) }], now)
    expect(result.old).toHaveLength(1)
  })

  it('8-day-old repair → critical', () => {
    const now    = Date.now()
    const result = groupByAgeBucket([{ receivedAt: fix(8, now) }], now)
    expect(result.critical).toHaveLength(1)
  })

  it('mixed repairs go into correct buckets', () => {
    const now     = Date.now()
    const repairs = [
      { receivedAt: fix(0, now) },  // fresh
      { receivedAt: fix(2, now) },  // moderate
      { receivedAt: fix(6, now) },  // old
      { receivedAt: fix(10, now) }, // critical
      { receivedAt: fix(15, now) }, // critical
    ]
    const result = groupByAgeBucket(repairs, now)
    expect(result.fresh).toHaveLength(1)
    expect(result.moderate).toHaveLength(1)
    expect(result.old).toHaveLength(1)
    expect(result.critical).toHaveLength(2)
  })

  it('empty list produces empty buckets', () => {
    const result = groupByAgeBucket([])
    expect(Object.values(result).every((b) => b.length === 0)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Profit margin calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Profit margin calculation', () => {
  it('calculates gross profit correctly', () => {
    const items = [{ quantity: 2, price: 500, costPrice: 300 }]
    const { revenue, cost, grossProfit } = calcProfit(items)
    expect(revenue).toBe(1000)
    expect(cost).toBe(600)
    expect(grossProfit).toBe(400)
  })

  it('margin = grossProfit / revenue × 100', () => {
    const items = [{ quantity: 1, price: 200, costPrice: 150 }]
    const { margin } = calcProfit(items)
    expect(margin).toBe(25)
  })

  it('margin is rounded to 1 decimal place', () => {
    // price=3, cost=2 → margin = 33.333...% → should round to 33.3
    const items = [{ quantity: 1, price: 3, costPrice: 2 }]
    const { margin } = calcProfit(items)
    expect(margin).toBe(33.3)
  })

  it('zero revenue → margin = 0 (no division by zero)', () => {
    const { margin } = calcProfit([])
    expect(margin).toBe(0)
  })

  it('aggregates multiple items correctly', () => {
    const items = [
      { quantity: 3, price: 100, costPrice: 60 },  // rev=300, cost=180
      { quantity: 2, price: 200, costPrice: 100 }, // rev=400, cost=200
    ]
    const { revenue, cost, grossProfit } = calcProfit(items)
    expect(revenue).toBe(700)
    expect(cost).toBe(380)
    expect(grossProfit).toBe(320)
  })

  it('negative gross profit (sold below cost) produces negative margin', () => {
    const items = [{ quantity: 1, price: 100, costPrice: 150 }]
    const { grossProfit, margin } = calcProfit(items)
    expect(grossProfit).toBe(-50)
    expect(margin).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Technician metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('Technician metrics', () => {
  it('claim rate = claimCount / total × 100', () => {
    expect(claimRate(10, 2)).toBe(20)
  })

  it('claim rate rounds to 1 decimal', () => {
    expect(claimRate(3, 1)).toBe(33.3)
  })

  it('claim rate is 0 when no repairs', () => {
    expect(claimRate(0, 0)).toBe(0)
  })

  it('avgRepairTimeHours returns null when no repairs have completedAt', () => {
    const repairs = [{ receivedAt: '2025-01-01T00:00:00Z', completedAt: null }]
    expect(avgRepairTimeHours(repairs)).toBeNull()
  })

  it('avgRepairTimeHours computes correctly for single completed repair', () => {
    const repairs = [{
      receivedAt:  '2025-01-01T08:00:00Z',
      completedAt: '2025-01-01T10:00:00Z', // 2 h later
    }]
    expect(avgRepairTimeHours(repairs)).toBe(2)
  })

  it('avgRepairTimeHours averages multiple completed repairs', () => {
    const repairs = [
      { receivedAt: '2025-01-01T08:00:00Z', completedAt: '2025-01-01T10:00:00Z' }, // 2 h
      { receivedAt: '2025-01-01T08:00:00Z', completedAt: '2025-01-01T12:00:00Z' }, // 4 h
    ]
    expect(avgRepairTimeHours(repairs)).toBe(3)
  })

  it('incomplete repairs (no completedAt) are excluded from average', () => {
    const repairs = [
      { receivedAt: '2025-01-01T08:00:00Z', completedAt: '2025-01-01T12:00:00Z' }, // 4 h
      { receivedAt: '2025-01-01T08:00:00Z', completedAt: null },
    ]
    expect(avgRepairTimeHours(repairs)).toBe(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. daysSince helper
// ─────────────────────────────────────────────────────────────────────────────

describe('daysSince helper', () => {
  it('returns 0 for "now"', () => {
    const now = Date.now()
    expect(daysSince(new Date(now).toISOString(), now)).toBe(0)
  })

  it('returns 1 for exactly 1 day ago', () => {
    const now = Date.now()
    expect(daysSince(new Date(now - MS_PER_DAY).toISOString(), now)).toBe(1)
  })

  it('returns 7 for 7 days ago', () => {
    const now = Date.now()
    expect(daysSince(new Date(now - 7 * MS_PER_DAY).toISOString(), now)).toBe(7)
  })

  it('accepts Date object as well as ISO string', () => {
    const now  = Date.now()
    const date = new Date(now - 3 * MS_PER_DAY)
    expect(daysSince(date, now)).toBe(3)
  })
})
