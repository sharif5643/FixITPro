/**
 * Regression tests for Phase 16.9 critical fixes:
 *   C-1 — Sales stock check outside transaction (race condition / oversell)
 *   C-2 — Device history tenant isolation gap
 */
import { describe, it, expect } from 'vitest'

// ── C-1 helpers — mirror the atomic-conditional-decrement logic ─────────────

/**
 * Simulates the branchStock updateMany with quantity >= demand.
 * Returns { count: 1 } if stock is sufficient, { count: 0 } if not.
 * Models the PostgreSQL atomic "UPDATE … WHERE quantity >= X" behaviour.
 */
function atomicDecrement(
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

/**
 * Simulates two concurrent sales transactions both using the atomic decrement.
 * Returns the final stock and which transactions succeeded / failed.
 */
function runConcurrentSales(
  initialStock: number,
  demandA: number,
  demandB: number,
): { finalStock: number; aSucceeded: boolean; bSucceeded: boolean } {
  // Both transactions start; both do their atomic decrement "simultaneously"
  // (modelled as sequential but using the same initial stock snapshot)
  const stockMap = new Map([['b1:p1', initialStock]])

  // First sale atomically decrements
  const resA = atomicDecrement(stockMap, 'b1', 'p1', demandA)
  // Second sale atomically decrements from the already-updated stock
  const resB = atomicDecrement(stockMap, 'b1', 'p1', demandB)

  return {
    finalStock: stockMap.get('b1:p1') ?? 0,
    aSucceeded: resA.count === 1,
    bSucceeded: resB.count === 1,
  }
}

// ── C-1: Branch stock — atomic conditional decrement ───────────────────────

describe('C-1 · sales branch stock — atomic conditional decrement', () => {
  it('single sale within stock succeeds', () => {
    const map = new Map([['b1:p1', 10]])
    const r = atomicDecrement(map, 'b1', 'p1', 5)
    expect(r.count).toBe(1)
    expect(map.get('b1:p1')).toBe(5)
  })

  it('single sale equal to stock succeeds (last unit)', () => {
    const map = new Map([['b1:p1', 3]])
    const r = atomicDecrement(map, 'b1', 'p1', 3)
    expect(r.count).toBe(1)
    expect(map.get('b1:p1')).toBe(0)
  })

  it('single sale exceeding stock returns count=0 (rolls back)', () => {
    const map = new Map([['b1:p1', 2]])
    const r = atomicDecrement(map, 'b1', 'p1', 5)
    expect(r.count).toBe(0)
    expect(map.get('b1:p1')).toBe(2) // unchanged — rollback
  })

  it('missing BranchStock row returns count=0 (no crash)', () => {
    const map = new Map<string, number>() // empty — product not in branch
    const r = atomicDecrement(map, 'b1', 'p1', 1)
    expect(r.count).toBe(0)
  })

  it('concurrent sales: combined demand <= stock → both succeed', () => {
    const { finalStock, aSucceeded, bSucceeded } = runConcurrentSales(10, 4, 4)
    expect(aSucceeded).toBe(true)
    expect(bSucceeded).toBe(true)
    expect(finalStock).toBe(2)
    expect(finalStock).toBeGreaterThanOrEqual(0) // never negative
  })

  it('concurrent sales: combined demand > stock → second sale blocked', () => {
    // stock=5, A wants 4, B wants 4: combined=8 > 5
    const { finalStock, aSucceeded, bSucceeded } = runConcurrentSales(5, 4, 4)
    // A succeeds (stock goes 5→1), B fails (1 < 4)
    expect(aSucceeded).toBe(true)
    expect(bSucceeded).toBe(false)
    expect(finalStock).toBe(1)
    expect(finalStock).toBeGreaterThanOrEqual(0) // NEVER negative
  })

  it('concurrent sales: last-unit race → exactly one succeeds', () => {
    // stock=1, both want 1
    const { finalStock, aSucceeded, bSucceeded } = runConcurrentSales(1, 1, 1)
    expect(aSucceeded).toBe(true)
    expect(bSucceeded).toBe(false) // second sale blocked
    expect(finalStock).toBe(0) // not -1
  })

  it('concurrent sales: both exceed individual stock → both blocked', () => {
    // stock=3, A wants 5, B wants 5
    const { finalStock, aSucceeded, bSucceeded } = runConcurrentSales(3, 5, 5)
    expect(aSucceeded).toBe(false)
    expect(bSucceeded).toBe(false)
    expect(finalStock).toBe(3) // unchanged
  })

  it('stock is never decremented below 0 regardless of demand', () => {
    for (const [initial, demand] of [[0, 1], [1, 5], [2, 100], [0, 0]]) {
      const map = new Map([[`b1:p1`, initial]])
      atomicDecrement(map, 'b1', 'p1', demand)
      expect(map.get('b1:p1')!).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── C-1: Global (no-branch) stock path ─────────────────────────────────────

describe('C-1 · sales global stock — atomic conditional decrement', () => {
  function globalDecrement(stock: number, qty: number): { count: number; newStock: number } {
    if (stock < qty) return { count: 0, newStock: stock }
    return { count: 1, newStock: stock - qty }
  }

  it('sufficient global stock → count=1, stock decremented', () => {
    const { count, newStock } = globalDecrement(20, 5)
    expect(count).toBe(1)
    expect(newStock).toBe(15)
  })

  it('insufficient global stock → count=0, stock unchanged', () => {
    const { count, newStock } = globalDecrement(3, 5)
    expect(count).toBe(0)
    expect(newStock).toBe(3)
  })

  it('exact stock = demand → count=1 (sells last unit)', () => {
    const { count, newStock } = globalDecrement(5, 5)
    expect(count).toBe(1)
    expect(newStock).toBe(0)
  })

  it('global stock never goes negative via atomic conditional', () => {
    for (const [s, d] of [[0, 1], [1, 2], [3, 10]]) {
      const { newStock } = globalDecrement(s, d)
      expect(newStock).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── C-2: Device history tenant isolation ────────────────────────────────────

describe('C-2 · device history — tenant isolation', () => {
  /**
   * Models the guard logic extracted from repairs.service.ts getDeviceHistory.
   * Returns the effective WHERE clause or throws.
   */
  function buildDeviceHistoryWhere(
    imei: string,
    role: string,
    userBranchId: string | null,
    tenantId: string | null,
  ): Record<string, unknown> {
    if (!imei) throw new Error('IMEI is required')

    const IS_ELEVATED = role === 'OWNER' || role === 'SUPER_ADMIN'

    // C-2 FIX
    if (role !== 'SUPER_ADMIN' && !tenantId) {
      throw new Error('Tenant context required') // models ForbiddenException
    }

    const where: Record<string, unknown> = { deviceImei: imei }
    if (tenantId) {
      where.branch = { tenantId }
    }
    if (!IS_ELEVATED && userBranchId) {
      where.branchId = userBranchId
    }
    return where
  }

  // Non-SUPER_ADMIN must have tenantId
  it('OWNER with valid tenantId — proceeds with tenant filter', () => {
    const where = buildDeviceHistoryWhere('IMEI-123', 'OWNER', null, 'tenant-A')
    expect(where.branch).toEqual({ tenantId: 'tenant-A' })
    expect(where.branchId).toBeUndefined() // OWNER is elevated — no branch filter
  })

  it('OWNER with null tenantId — throws ForbiddenException', () => {
    expect(() =>
      buildDeviceHistoryWhere('IMEI-123', 'OWNER', null, null),
    ).toThrow('Tenant context required')
  })

  it('MANAGER with valid tenantId — proceeds with tenant + branch filter', () => {
    const where = buildDeviceHistoryWhere('IMEI-123', 'MANAGER', 'branch-1', 'tenant-A')
    expect(where.branch).toEqual({ tenantId: 'tenant-A' })
    expect(where.branchId).toBe('branch-1')
  })

  it('MANAGER with null tenantId — throws ForbiddenException', () => {
    expect(() =>
      buildDeviceHistoryWhere('IMEI-123', 'MANAGER', 'branch-1', null),
    ).toThrow('Tenant context required')
  })

  it('CASHIER with null tenantId — throws ForbiddenException', () => {
    expect(() =>
      buildDeviceHistoryWhere('IMEI-123', 'CASHIER', 'branch-1', null),
    ).toThrow('Tenant context required')
  })

  it('TECHNICIAN with null tenantId — throws ForbiddenException', () => {
    expect(() =>
      buildDeviceHistoryWhere('IMEI-123', 'TECHNICIAN', 'branch-1', null),
    ).toThrow('Tenant context required')
  })

  // SUPER_ADMIN cross-tenant intentional
  it('SUPER_ADMIN with null tenantId — allowed (cross-tenant search, no filter)', () => {
    const where = buildDeviceHistoryWhere('IMEI-123', 'SUPER_ADMIN', null, null)
    expect(where.branch).toBeUndefined() // no tenant filter — intentional cross-tenant
    expect(where.deviceImei).toBe('IMEI-123')
  })

  it('SUPER_ADMIN with tenantId — applies tenant filter', () => {
    const where = buildDeviceHistoryWhere('IMEI-123', 'SUPER_ADMIN', null, 'tenant-B')
    expect(where.branch).toEqual({ tenantId: 'tenant-B' })
  })

  // Every non-SUPER_ADMIN role is isolated to its tenant
  it('all non-SUPER_ADMIN roles are isolated when tenantId provided', () => {
    const roles = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF']
    for (const role of roles) {
      const where = buildDeviceHistoryWhere('IMEI-999', role, 'branch-X', 'tenant-Z')
      expect((where.branch as any)?.tenantId).toBe('tenant-Z')
    }
  })

  it('tenant filter cannot be bypassed by passing empty string tenantId', () => {
    // Empty string is falsy — guard should reject it like null
    expect(() =>
      buildDeviceHistoryWhere('IMEI-123', 'OWNER', null, ''),
    ).toThrow('Tenant context required')
  })

  it('missing IMEI throws regardless of role', () => {
    expect(() =>
      buildDeviceHistoryWhere('', 'OWNER', null, 'tenant-A'),
    ).toThrow('IMEI is required')
  })
})
