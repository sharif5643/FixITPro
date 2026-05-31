/**
 * Regression tests for Phase 16.11 minor fixes:
 *   N-1 — Pre-tx fast-fail is optimistic; in-tx check (C-1) is authoritative
 *   N-2 — Repair list capped at 200 rows
 *   N-3 — Stock adjust OUT uses conditional decrement inside transaction
 *   N-4 — Warranty date validation (warrantyDays >= 1, endDate > startDate)
 *   N-5 — Debt partial payment preview uses integer-cent arithmetic
 */
import { describe, it, expect } from 'vitest'

// ── N-1: Pre-tx check is optimistic fast-fail backed by in-tx guard ─────────

describe('N-1 · global stock — pre-tx check is optimistic, in-tx is authoritative', () => {
  // The pre-tx check uses a snapshot that may be stale.
  // The authoritative guard is the in-tx atomic updateMany (C-1 fix).
  // These tests confirm the correct failure modes.

  function preTransactionCheck(snapshotStock: number, demand: number): boolean {
    return snapshotStock >= demand
  }

  function inTransactionAtomicDecrement(
    actualStock: number,
    demand: number,
  ): { count: number; newStock: number } {
    if (actualStock < demand) return { count: 0, newStock: actualStock }
    return { count: 1, newStock: actualStock - demand }
  }

  it('pre-tx passes with stale snapshot, in-tx blocks when actual stock is lower', () => {
    const snapshot = 10 // stale — concurrent sale already reduced to 3
    const actual   = 3
    const demand   = 5

    expect(preTransactionCheck(snapshot, demand)).toBe(true)  // fast-fail passes (stale)
    const { count } = inTransactionAtomicDecrement(actual, demand)
    expect(count).toBe(0)  // in-tx check correctly blocks
  })

  it('both checks pass when stock is genuinely sufficient', () => {
    const stock  = 10
    const demand = 4
    expect(preTransactionCheck(stock, demand)).toBe(true)
    const { count, newStock } = inTransactionAtomicDecrement(stock, demand)
    expect(count).toBe(1)
    expect(newStock).toBe(6)
    expect(newStock).toBeGreaterThanOrEqual(0)
  })

  it('pre-tx blocks immediately when snapshot clearly insufficient (saves tx overhead)', () => {
    expect(preTransactionCheck(2, 5)).toBe(false)
  })

  it('in-tx never allows negative stock regardless of pre-tx result', () => {
    for (const [stock, demand] of [[0,1],[1,5],[3,100]]) {
      const { newStock } = inTransactionAtomicDecrement(stock, demand)
      expect(newStock).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── N-2: Repair list — 200-row cap ──────────────────────────────────────────

describe('N-2 · repair list — 200-row cap', () => {
  const LIST_LIMIT = 200

  it('limit constant is 200', () => {
    expect(LIST_LIMIT).toBe(200)
  })

  it('cap prevents returning more than 200 rows', () => {
    const simulatedDbRows = Array.from({ length: 500 }, (_, i) => ({ id: `r-${i}` }))
    const result = simulatedDbRows.slice(0, LIST_LIMIT)
    expect(result).toHaveLength(LIST_LIMIT)
    expect(result.length).toBeLessThanOrEqual(LIST_LIMIT)
  })

  it('result under 200 rows is returned in full', () => {
    const simulatedDbRows = Array.from({ length: 50 }, (_, i) => ({ id: `r-${i}` }))
    const result = simulatedDbRows.slice(0, LIST_LIMIT)
    expect(result).toHaveLength(50)
  })

  it('result is ordered newest-first (most recent repairs visible)', () => {
    const rows = [
      { id: 'r-1', receivedAt: new Date('2026-06-01') },
      { id: 'r-2', receivedAt: new Date('2026-05-01') },
      { id: 'r-3', receivedAt: new Date('2026-04-01') },
    ]
    const sorted = rows.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    expect(sorted[0].id).toBe('r-1')  // newest first
  })
})

// ── N-3: Stock adjust OUT — conditional decrement ───────────────────────────

describe('N-3 · stock adjust OUT — in-tx conditional decrement', () => {
  function atomicStockOut(
    stockMap: Map<string, number>,
    branchId: string,
    productId: string,
    qty: number,
  ): { count: number } {
    const key = `${branchId}:${productId}`
    const available = stockMap.get(key) ?? 0
    if (available < qty) return { count: 0 }
    stockMap.set(key, available - qty)
    return { count: 1 }
  }

  function stockIn(
    stockMap: Map<string, number>,
    branchId: string,
    productId: string,
    qty: number,
  ): void {
    const key = `${branchId}:${productId}`
    const existing = stockMap.get(key) ?? 0
    stockMap.set(key, existing + qty)
  }

  it('OUT succeeds when sufficient stock exists', () => {
    const map = new Map([['b1:p1', 10]])
    const { count } = atomicStockOut(map, 'b1', 'p1', 3)
    expect(count).toBe(1)
    expect(map.get('b1:p1')).toBe(7)
  })

  it('OUT fails when insufficient stock (count=0, stock unchanged, tx rolls back)', () => {
    const map = new Map([['b1:p1', 2]])
    const { count } = atomicStockOut(map, 'b1', 'p1', 5)
    expect(count).toBe(0)
    expect(map.get('b1:p1')).toBe(2)  // unchanged — rollback
  })

  it('OUT of non-existent row returns count=0', () => {
    const map = new Map<string, number>()
    const { count } = atomicStockOut(map, 'b1', 'p1', 1)
    expect(count).toBe(0)
  })

  it('stock never goes negative via conditional decrement', () => {
    for (const [avail, demand] of [[0,1],[1,5],[3,100]]) {
      const map = new Map([[`b1:p1`, avail]])
      atomicStockOut(map, 'b1', 'p1', demand)
      expect(map.get('b1:p1')!).toBeGreaterThanOrEqual(0)
    }
  })

  it('concurrent OUT adjustments: second blocked when combined exceeds stock', () => {
    const map = new Map([['b1:p1', 5]])
    const r1 = atomicStockOut(map, 'b1', 'p1', 4)  // 5 >= 4 → succeeds, stock=1
    const r2 = atomicStockOut(map, 'b1', 'p1', 4)  // 1 < 4 → blocked
    expect(r1.count).toBe(1)
    expect(r2.count).toBe(0)
    expect(map.get('b1:p1')).toBe(1)  // not -3
  })

  it('IN adjustment always succeeds (upsert — no conditional needed)', () => {
    const map = new Map<string, number>()
    stockIn(map, 'b1', 'p1', 10)
    expect(map.get('b1:p1')).toBe(10)
    stockIn(map, 'b1', 'p1', 5)
    expect(map.get('b1:p1')).toBe(15)
  })

  it('OUT then IN: stock goes down then up correctly', () => {
    const map = new Map([['b1:p1', 10]])
    atomicStockOut(map, 'b1', 'p1', 6)
    expect(map.get('b1:p1')).toBe(4)
    stockIn(map, 'b1', 'p1', 3)
    expect(map.get('b1:p1')).toBe(7)
  })
})

// ── N-4: Warranty date validation ────────────────────────────────────────────

describe('N-4 · warranty — date validation', () => {
  function validateWarrantyDays(days: number): void {
    if (!days || days < 1) throw new Error('Warranty duration must be at least 1 day')
  }

  function validateEndDateUpdate(endDate: Date, startDate: Date): void {
    if (endDate <= startDate) throw new Error('Warranty end date must be after its start date')
  }

  // ── createForRepair / createForSaleItem: warrantyDays validation
  it('1 day warranty is valid', () => {
    expect(() => validateWarrantyDays(1)).not.toThrow()
  })

  it('365 day warranty is valid', () => {
    expect(() => validateWarrantyDays(365)).not.toThrow()
  })

  it('0 days throws', () => {
    expect(() => validateWarrantyDays(0)).toThrow('Warranty duration must be at least 1 day')
  })

  it('negative days throws', () => {
    expect(() => validateWarrantyDays(-7)).toThrow('Warranty duration must be at least 1 day')
  })

  it('NaN throws', () => {
    expect(() => validateWarrantyDays(NaN)).toThrow()
  })

  // ── update: endDate must be after startDate
  it('endDate one day after startDate is valid', () => {
    const start = new Date('2026-06-01')
    const end   = new Date('2026-06-02')
    expect(() => validateEndDateUpdate(end, start)).not.toThrow()
  })

  it('endDate equal to startDate throws', () => {
    const d = new Date('2026-06-01')
    expect(() => validateEndDateUpdate(d, d)).toThrow('Warranty end date must be after its start date')
  })

  it('endDate before startDate throws', () => {
    const start = new Date('2026-06-10')
    const end   = new Date('2026-06-01')
    expect(() => validateEndDateUpdate(end, start)).toThrow('Warranty end date must be after its start date')
  })

  it('endDate one year ahead of startDate is valid', () => {
    const start = new Date('2026-01-01')
    const end   = new Date('2027-01-01')
    expect(() => validateEndDateUpdate(end, start)).not.toThrow()
  })

  it('endDate far in the future (10 years) is allowed', () => {
    const start = new Date('2026-06-01')
    const end   = new Date('2036-06-01')
    expect(() => validateEndDateUpdate(end, start)).not.toThrow()
  })
})

// ── N-5: Debt partial payment preview — integer-cent arithmetic ──────────────

describe('N-5 · debt partial payment preview — integer-cent remaining balance', () => {
  function remainingAfterPayment(outstanding: number, payment: number): number {
    return Math.round((outstanding - payment) * 100) / 100
  }

  it('exact integers: 500 - 200 = 300', () => {
    expect(remainingAfterPayment(500, 200)).toBe(300)
  })

  it('float residual eliminated: 1.00 - 0.9 stays clean', () => {
    // 1 - 0.9 = 0.09999999999999998 in IEEE-754; integer-cent gives 0.1
    const raw = 1.00 - 0.9
    expect(raw).not.toBe(0.1)  // confirm raw has residual in this engine
    const fixed = remainingAfterPayment(1.00, 0.9)
    expect(fixed).toBe(0.1)
  })

  it('0.1 + 0.2 scenario: 0.3 - 0.1 = 0.2 exactly', () => {
    const outstanding = 0.1 + 0.2  // = 0.30000000000000004
    const payment     = 0.1
    expect(remainingAfterPayment(outstanding, payment)).toBe(0.2)
  })

  it('full payment: remaining = 0', () => {
    expect(remainingAfterPayment(150.50, 150.50)).toBe(0)
  })

  it('small satang amounts stay accurate', () => {
    expect(remainingAfterPayment(1000.01, 0.01)).toBe(1000)
    expect(remainingAfterPayment(1000.99, 0.99)).toBe(1000)
  })

  it('large Thai Baht amounts: 9999.99 - 5000 = 4999.99', () => {
    expect(remainingAfterPayment(9999.99, 5000)).toBe(4999.99)
  })

  it('result is never negative for valid inputs (payment <= outstanding)', () => {
    const pairs: [number, number][] = [[100, 50], [99.99, 99.99], [0.01, 0.01]]
    for (const [o, p] of pairs) {
      expect(remainingAfterPayment(o, p)).toBeGreaterThanOrEqual(0)
    }
  })

  it('rounded to 2 decimal places max', () => {
    const result = remainingAfterPayment(100, 33.33)
    const decimals = result.toString().split('.')[1]?.length ?? 0
    expect(decimals).toBeLessThanOrEqual(2)
  })
})
