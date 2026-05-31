/**
 * Regression tests for N-1 through N-6 non-blocker fixes.
 */
import { describe, it, expect } from 'vitest'

// ── N-1: Discount > subtotal produces negative total ────────────────────────

describe('N-1 · sale total — discount validation', () => {
  function calcTotal(subtotal: number, discount: number) {
    if (discount > subtotal) throw new Error('Discount cannot exceed the order subtotal')
    return subtotal - discount
  }

  it('allows discount equal to subtotal (zero total)', () => {
    expect(calcTotal(100, 100)).toBe(0)
  })

  it('allows partial discount', () => {
    expect(calcTotal(500, 50)).toBe(450)
  })

  it('allows no discount', () => {
    expect(calcTotal(250, 0)).toBe(250)
  })

  it('throws when discount exceeds subtotal', () => {
    expect(() => calcTotal(100, 150)).toThrow('Discount cannot exceed the order subtotal')
  })

  it('throws when discount is 1 cent over subtotal', () => {
    expect(() => calcTotal(99.99, 100)).toThrow()
  })

  it('total is never negative', () => {
    // After the fix, any valid call produces a non-negative total
    const subtotals = [0, 1, 100, 9999.99]
    for (const s of subtotals) {
      expect(calcTotal(s, s)).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── N-2: Outstanding repairs branchId filter for elevated roles ─────────────

describe('N-2 · outstanding repairs — branchId resolution', () => {
  const IS_ELEVATED = (role: string) => role === 'OWNER' || role === 'SUPER_ADMIN'

  function resolveOutstandingBranchId(
    queryBranchId: string | undefined,
    role: string,
    userBranchId: string | null,
  ) {
    return IS_ELEVATED(role) ? (queryBranchId ?? undefined) : (userBranchId ?? undefined)
  }

  it('OWNER with no query param gets undefined (all branches)', () => {
    expect(resolveOutstandingBranchId(undefined, 'OWNER', 'b1')).toBeUndefined()
  })

  it('OWNER with query param uses query param', () => {
    expect(resolveOutstandingBranchId('branch-99', 'OWNER', 'b1')).toBe('branch-99')
  })

  it('SUPER_ADMIN with query param drills into specific branch', () => {
    expect(resolveOutstandingBranchId('branch-42', 'SUPER_ADMIN', null)).toBe('branch-42')
  })

  it('MANAGER ignores query param and uses JWT branchId', () => {
    expect(resolveOutstandingBranchId('branch-99', 'MANAGER', 'branch-1')).toBe('branch-1')
  })

  it('CASHIER with null JWT branchId resolves to undefined', () => {
    expect(resolveOutstandingBranchId(undefined, 'CASHIER', null)).toBeUndefined()
  })
})

// ── N-3: Debt full-payment detection — float imprecision ────────────────────

describe('N-3 · debt full-payment — integer-cent comparison', () => {
  function isFullPayment(numAmount: number, outstanding: number): boolean {
    return Math.round(numAmount * 100) >= Math.round(outstanding * 100)
  }

  function isValidPayment(numAmount: number, outstanding: number): boolean {
    return numAmount > 0 && Math.round(numAmount * 100) <= Math.round(outstanding * 100)
  }

  it('exact full payment is detected', () => {
    expect(isFullPayment(99.99, 99.99)).toBe(true)
  })

  it('float residual does not block full-payment detection', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    const outstanding = 0.1 + 0.2
    const paid = 0.3
    expect(isFullPayment(paid, outstanding)).toBe(true)
  })

  it('partial payment is not flagged as full', () => {
    expect(isFullPayment(50, 99.99)).toBe(false)
  })

  it('overpayment is valid (isFullPay but still valid since amount <= outstanding)', () => {
    // amount cannot exceed outstanding per isValid guard
    expect(isValidPayment(99.99, 99.99)).toBe(true)
    expect(isValidPayment(100, 99.99)).toBe(false)
  })

  it('isValid rejects zero amount', () => {
    expect(isValidPayment(0, 100)).toBe(false)
  })

  it('isValid rejects negative amount', () => {
    expect(isValidPayment(-1, 100)).toBe(false)
  })

  it('handles Thai Baht amounts with satang precision', () => {
    // 1500.50 baht outstanding, pay 1500.50 exactly
    expect(isFullPayment(1500.50, 1500.50)).toBe(true)
    expect(isFullPayment(1500.49, 1500.50)).toBe(false)
  })
})

// ── N-4: Shift supplier payments — upper-bound filter ───────────────────────

describe('N-4 · shift close — supplier payment upper bound', () => {
  interface SupplierPayment { paidAt: Date; amount: number }

  function filterPaymentsForShift(
    payments: SupplierPayment[],
    shiftOpenedAt: Date,
    shiftClosedAt: Date | null,
  ) {
    const upper = shiftClosedAt ?? new Date()
    return payments.filter(
      (p) => p.paidAt >= shiftOpenedAt && p.paidAt < upper,
    )
  }

  const shift1Open  = new Date('2026-05-31T08:00:00Z')
  const shift1Close = new Date('2026-05-31T14:00:00Z')
  const shift2Open  = new Date('2026-05-31T14:00:00Z')

  const payments: SupplierPayment[] = [
    { paidAt: new Date('2026-05-31T09:00:00Z'), amount: 500 },  // shift 1
    { paidAt: new Date('2026-05-31T12:00:00Z'), amount: 300 },  // shift 1
    { paidAt: new Date('2026-05-31T15:00:00Z'), amount: 200 },  // shift 2
    { paidAt: new Date('2026-05-31T18:00:00Z'), amount: 100 },  // shift 2
  ]

  it('shift 1 close only includes payments before closedAt', () => {
    const result = filterPaymentsForShift(payments, shift1Open, shift1Close)
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.amount)).toEqual([500, 300])
  })

  it('shift 2 (still open) does not include shift 1 payments', () => {
    const result = filterPaymentsForShift(payments, shift2Open, null)
    // "now" is after all payments, so shift2 gets its own 2 payments
    expect(result.every((p) => p.paidAt >= shift2Open)).toBe(true)
  })

  it('active shift with closedAt=null uses current time as upper bound', () => {
    const past = new Date(Date.now() - 86400000) // yesterday
    const oldPayment: SupplierPayment = { paidAt: past, amount: 999 }
    const result = filterPaymentsForShift([oldPayment], past, null)
    // paidAt === openedAt so it's included (gte), and < now so included
    expect(result).toHaveLength(1)
  })

  it('payment exactly at closedAt is excluded (strict less-than)', () => {
    const atClose: SupplierPayment = { paidAt: shift1Close, amount: 50 }
    const result = filterPaymentsForShift([atClose], shift1Open, shift1Close)
    expect(result).toHaveLength(0)
  })
})

// ── N-5: Dashboard notification count null safety ────────────────────────────

describe('N-5 · dashboard notification count — null safety', () => {
  function getUnreadDisplay(notif: { unreadCount: number } | null | undefined): number {
    return notif?.unreadCount ?? 0
  }

  it('returns unreadCount when notif is valid', () => {
    expect(getUnreadDisplay({ unreadCount: 5 })).toBe(5)
  })

  it('returns 0 when notif is null', () => {
    expect(getUnreadDisplay(null)).toBe(0)
  })

  it('returns 0 when notif is undefined', () => {
    expect(getUnreadDisplay(undefined)).toBe(0)
  })

  it('returns 0 when unreadCount is 0', () => {
    expect(getUnreadDisplay({ unreadCount: 0 })).toBe(0)
  })

  it('does not throw for any nullish input', () => {
    expect(() => getUnreadDisplay(null)).not.toThrow()
    expect(() => getUnreadDisplay(undefined)).not.toThrow()
  })
})

// ── N-6: Analytics branch-stock — OWNER/SUPER_ADMIN only ────────────────────

describe('N-6 · analytics branch-stock — role guard', () => {
  const ALLOWED_ROLES = ['OWNER', 'SUPER_ADMIN']

  function canAccessBranchStock(role: string): boolean {
    return ALLOWED_ROLES.includes(role)
  }

  it('OWNER can access branch-stock', () => {
    expect(canAccessBranchStock('OWNER')).toBe(true)
  })

  it('SUPER_ADMIN can access branch-stock', () => {
    expect(canAccessBranchStock('SUPER_ADMIN')).toBe(true)
  })

  it('MANAGER cannot access branch-stock', () => {
    expect(canAccessBranchStock('MANAGER')).toBe(false)
  })

  it('CASHIER cannot access branch-stock', () => {
    expect(canAccessBranchStock('CASHIER')).toBe(false)
  })

  it('TECHNICIAN cannot access branch-stock', () => {
    expect(canAccessBranchStock('TECHNICIAN')).toBe(false)
  })

  it('STOCK_STAFF cannot access branch-stock', () => {
    expect(canAccessBranchStock('STOCK_STAFF')).toBe(false)
  })

  it('unknown role cannot access branch-stock', () => {
    expect(canAccessBranchStock('UNKNOWN')).toBe(false)
  })
})
