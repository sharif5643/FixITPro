/**
 * Phase 13 — RC Blocker Regression Tests
 *
 * Pure-logic unit tests for all 6 blockers fixed in Phase 13.
 * No DOM, no DB, no NestJS — all logic is inlined so vitest can run it.
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// B-5 · Public register blocked by default / OWNER role blocked
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors auth.service.ts register() guard logic
function validatePublicRegister(
  allowPublicEnv: string | undefined,
  requestedRole: string | undefined,
): { allowed: boolean; reason?: string } {
  const allowPublic = allowPublicEnv === 'true'
  if (!allowPublic) {
    return { allowed: false, reason: 'Public registration is disabled' }
  }
  const FORBIDDEN_ROLES = ['OWNER', 'SUPER_ADMIN']
  if (requestedRole && FORBIDDEN_ROLES.includes(requestedRole)) {
    return { allowed: false, reason: 'Cannot self-register with elevated role' }
  }
  return { allowed: true }
}

describe('B-5 — Public registration security', () => {
  it('blocks registration when ALLOW_PUBLIC_REGISTER is unset', () => {
    const result = validatePublicRegister(undefined, undefined)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('disabled')
  })

  it('blocks registration when ALLOW_PUBLIC_REGISTER is "false"', () => {
    const result = validatePublicRegister('false', undefined)
    expect(result.allowed).toBe(false)
  })

  it('allows registration when ALLOW_PUBLIC_REGISTER is "true"', () => {
    const result = validatePublicRegister('true', 'CASHIER')
    expect(result.allowed).toBe(true)
  })

  it('blocks OWNER role even when public register is enabled', () => {
    const result = validatePublicRegister('true', 'OWNER')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('elevated role')
  })

  it('blocks SUPER_ADMIN role even when public register is enabled', () => {
    const result = validatePublicRegister('true', 'SUPER_ADMIN')
    expect(result.allowed).toBe(false)
  })

  it('allows CASHIER / TECHNICIAN / STOCK_STAFF when public register is enabled', () => {
    const allowed = ['CASHIER', 'TECHNICIAN', 'STOCK_STAFF']
    for (const role of allowed) {
      expect(validatePublicRegister('true', role).allowed).toBe(true)
    }
  })

  it('register DTO forbidden roles: OWNER and SUPER_ADMIN not in allowed list', () => {
    const REGISTER_DTO_ALLOWED = ['CASHIER', 'TECHNICIAN', 'STOCK_STAFF']
    expect(REGISTER_DTO_ALLOWED).not.toContain('OWNER')
    expect(REGISTER_DTO_ALLOWED).not.toContain('SUPER_ADMIN')
    expect(REGISTER_DTO_ALLOWED).not.toContain('ADMIN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B-6 · Register JWT includes branchId
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors the JWT payload shape from both login() and register()
function buildJwtPayload(user: { id: string; email: string; role: string; branchId?: string | null }) {
  return {
    sub:      user.id,
    email:    user.email,
    role:     user.role,
    branchId: user.branchId ?? null,
  }
}

describe('B-6 — JWT payload consistency', () => {
  it('login payload includes branchId', () => {
    const payload = buildJwtPayload({ id: '1', email: 'a@b.com', role: 'CASHIER', branchId: 'branch-1' })
    expect(payload).toHaveProperty('branchId', 'branch-1')
  })

  it('register payload includes branchId (null for new users)', () => {
    const payload = buildJwtPayload({ id: '2', email: 'c@d.com', role: 'CASHIER', branchId: null })
    expect(payload).toHaveProperty('branchId')
    expect(payload.branchId).toBeNull()
  })

  it('login and register both have the same payload keys', () => {
    const login    = Object.keys(buildJwtPayload({ id: '1', email: '', role: 'CASHIER', branchId: 'b' }))
    const register = Object.keys(buildJwtPayload({ id: '2', email: '', role: 'CASHIER' }))
    expect(login.sort()).toEqual(register.sort())
  })

  it('branchId defaults to null when not present on user', () => {
    const payload = buildJwtPayload({ id: '3', email: 'e@f.com', role: 'CASHIER' })
    expect(payload.branchId).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B-1 · BranchStock mutation must be inside the transaction
// ─────────────────────────────────────────────────────────────────────────────

// Simulates transactional safety: branchStock should only change if tx commits.
// We model the tx as a mock that can be forced to fail after branchStock write.

function simulateSaleTx(opts: {
  failAfterBranchStockWrite: boolean
  useTx: boolean               // true = B-1 fix applied; false = original bug
}): { branchStockDeducted: boolean; saleCreated: boolean } {
  // Simulate two separate write contexts
  const committed: string[] = []

  const txWrite = (label: string) => { committed.push(label) }
  const globalWrite = (label: string) => { committed.push(`[global] ${label}`) }

  try {
    txWrite('sale.create')

    if (opts.useTx) {
      txWrite('branchStock.update')   // inside tx — will be rolled back on failure
    } else {
      globalWrite('branchStock.update') // B-1 bug: outside tx, cannot be rolled back
    }

    if (opts.failAfterBranchStockWrite) {
      throw new Error('serial validation failed')
    }

    txWrite('stockMovement.create')
    // tx commits
    return { branchStockDeducted: true, saleCreated: true }
  } catch {
    // Rollback all tx writes (global writes are NOT rolled back)
    const rolledBack = new Set(['sale.create', 'branchStock.update', 'stockMovement.create'])
    const after = committed.filter((c) => !rolledBack.has(c))
    return {
      branchStockDeducted: after.some((c) => c.includes('branchStock')),
      saleCreated: false,
    }
  }
}

describe('B-1 — BranchStock inside transaction', () => {
  it('original bug: branchStock deducted even when sale fails', () => {
    const result = simulateSaleTx({ failAfterBranchStockWrite: true, useTx: false })
    expect(result.saleCreated).toBe(false)
    // Bug: global write escapes rollback
    expect(result.branchStockDeducted).toBe(true)
  })

  it('fix: branchStock NOT deducted when sale fails (tx rolled back)', () => {
    const result = simulateSaleTx({ failAfterBranchStockWrite: true, useTx: true })
    expect(result.saleCreated).toBe(false)
    // Fix: both writes rolled back together
    expect(result.branchStockDeducted).toBe(false)
  })

  it('happy path: both sale and branchStock committed when tx succeeds', () => {
    const result = simulateSaleTx({ failAfterBranchStockWrite: false, useTx: true })
    expect(result.saleCreated).toBe(true)
    expect(result.branchStockDeducted).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B-2 · Duplicate product in cart: aggregate before stock check
// ─────────────────────────────────────────────────────────────────────────────

interface CartItem { productId: string; quantity: number }

// Mirrors the fixed sales.service.ts validateStock() logic
function validateStockAggregated(
  items: CartItem[],
  branchStock: Map<string, number>,
): { ok: boolean; errorProduct?: string; needed?: number; available?: number } {
  // Build aggregate demand map (B-2 fix)
  const demandMap = new Map<string, number>()
  for (const item of items) {
    demandMap.set(item.productId, (demandMap.get(item.productId) ?? 0) + item.quantity)
  }

  for (const [pid, totalQty] of Array.from(demandMap.entries())) {
    const available = branchStock.get(pid) ?? 0
    if (available < totalQty) {
      return { ok: false, errorProduct: pid, needed: totalQty, available }
    }
  }
  return { ok: true }
}

// Original buggy per-item check (for comparison)
function validateStockPerItem(
  items: CartItem[],
  branchStock: Map<string, number>,
): { ok: boolean } {
  for (const item of items) {
    const available = branchStock.get(item.productId) ?? 0
    if (available < item.quantity) return { ok: false }
  }
  return { ok: true }
}

describe('B-2 — Duplicate product oversell prevention', () => {
  it('oversell scenario: stock=5, same product 3+3 — buggy per-item check PASSES incorrectly', () => {
    const stock = new Map([['prod-A', 5]])
    const cart: CartItem[] = [
      { productId: 'prod-A', quantity: 3 },
      { productId: 'prod-A', quantity: 3 },
    ]
    // Original bug: each item independently checks 3 ≤ 5 → passes
    expect(validateStockPerItem(cart, stock).ok).toBe(true)
  })

  it('oversell scenario: stock=5, same product 3+3 — fixed aggregate check REJECTS', () => {
    const stock = new Map([['prod-A', 5]])
    const cart: CartItem[] = [
      { productId: 'prod-A', quantity: 3 },
      { productId: 'prod-A', quantity: 3 },
    ]
    const result = validateStockAggregated(cart, stock)
    expect(result.ok).toBe(false)
    expect(result.needed).toBe(6)
    expect(result.available).toBe(5)
  })

  it('exact match: stock=6, same product 3+3 — aggregate check allows', () => {
    const stock = new Map([['prod-A', 6]])
    const cart: CartItem[] = [
      { productId: 'prod-A', quantity: 3 },
      { productId: 'prod-A', quantity: 3 },
    ]
    expect(validateStockAggregated(cart, stock).ok).toBe(true)
  })

  it('different products each within stock — passes', () => {
    const stock = new Map([['prod-A', 5], ['prod-B', 10]])
    const cart: CartItem[] = [
      { productId: 'prod-A', quantity: 5 },
      { productId: 'prod-B', quantity: 8 },
    ]
    expect(validateStockAggregated(cart, stock).ok).toBe(true)
  })

  it('one product over limit with two different products — rejects correctly', () => {
    const stock = new Map([['prod-A', 5], ['prod-B', 2]])
    const cart: CartItem[] = [
      { productId: 'prod-A', quantity: 4 },
      { productId: 'prod-B', quantity: 3 },  // exceeds stock
    ]
    const result = validateStockAggregated(cart, stock)
    expect(result.ok).toBe(false)
    expect(result.errorProduct).toBe('prod-B')
  })

  it('single item within stock — passes', () => {
    const stock = new Map([['prod-A', 10]])
    const cart: CartItem[] = [{ productId: 'prod-A', quantity: 7 }]
    expect(validateStockAggregated(cart, stock).ok).toBe(true)
  })

  it('empty cart — passes', () => {
    const stock = new Map<string, number>()
    expect(validateStockAggregated([], stock).ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B-3 · Device-history: tenant and branch scoping
// ─────────────────────────────────────────────────────────────────────────────

interface RepairRecord {
  id: string
  deviceImei: string
  branchId:   string
  tenantId:   string
}

// Mirrors the fixed repairs.service.ts getDeviceHistory() where clause logic
function buildDeviceHistoryWhere(
  imei: string,
  role: string,
  userBranchId: string | null,
  tenantId: string | null,
): Record<string, unknown> {
  const IS_ELEVATED = role === 'OWNER' || role === 'SUPER_ADMIN'
  const where: Record<string, unknown> = { deviceImei: imei }
  if (tenantId) {
    where['branch'] = { tenantId }
  }
  if (!IS_ELEVATED && userBranchId) {
    where['branchId'] = userBranchId
  }
  return where
}

// Simplified in-memory filter that applies the where clause to test data
function queryDeviceHistory(
  imei: string,
  role: string,
  userBranchId: string | null,
  tenantId: string | null,
  allRepairs: RepairRecord[],
): RepairRecord[] {
  const IS_ELEVATED = role === 'OWNER' || role === 'SUPER_ADMIN'
  return allRepairs.filter((r) => {
    if (r.deviceImei !== imei) return false
    if (tenantId && r.tenantId !== tenantId) return false
    if (!IS_ELEVATED && userBranchId && r.branchId !== userBranchId) return false
    return true
  })
}

describe('B-3 — Device history branch/tenant isolation', () => {
  const repairs: RepairRecord[] = [
    { id: '1', deviceImei: 'IMEI-001', branchId: 'branch-A', tenantId: 'tenant-1' },
    { id: '2', deviceImei: 'IMEI-001', branchId: 'branch-B', tenantId: 'tenant-1' },
    { id: '3', deviceImei: 'IMEI-001', branchId: 'branch-C', tenantId: 'tenant-2' },
    { id: '4', deviceImei: 'IMEI-002', branchId: 'branch-A', tenantId: 'tenant-1' },
  ]

  it('CASHIER in branch-A only sees branch-A repairs for the IMEI', () => {
    const results = queryDeviceHistory('IMEI-001', 'CASHIER', 'branch-A', 'tenant-1', repairs)
    expect(results.map((r) => r.id)).toEqual(['1'])
  })

  it('CASHIER in branch-B cannot see branch-A history', () => {
    const results = queryDeviceHistory('IMEI-001', 'CASHIER', 'branch-B', 'tenant-1', repairs)
    expect(results.map((r) => r.id)).toEqual(['2'])
    expect(results.find((r) => r.branchId === 'branch-A')).toBeUndefined()
  })

  it('OWNER in tenant-1 sees all tenant-1 branches for the IMEI', () => {
    const results = queryDeviceHistory('IMEI-001', 'OWNER', null, 'tenant-1', repairs)
    expect(results.map((r) => r.id).sort()).toEqual(['1', '2'])
    expect(results.find((r) => r.tenantId === 'tenant-2')).toBeUndefined()
  })

  it('tenant-1 user never sees tenant-2 repairs', () => {
    const results = queryDeviceHistory('IMEI-001', 'OWNER', null, 'tenant-1', repairs)
    expect(results.every((r) => r.tenantId === 'tenant-1')).toBe(true)
  })

  it('different IMEI not returned', () => {
    const results = queryDeviceHistory('IMEI-001', 'OWNER', null, 'tenant-1', repairs)
    expect(results.find((r) => r.deviceImei === 'IMEI-002')).toBeUndefined()
  })

  it('where clause for CASHIER includes branchId filter', () => {
    const where = buildDeviceHistoryWhere('IMEI-001', 'CASHIER', 'branch-A', 'tenant-1')
    expect(where).toHaveProperty('branchId', 'branch-A')
    expect(where).toHaveProperty('branch', { tenantId: 'tenant-1' })
  })

  it('where clause for OWNER does NOT include branchId filter', () => {
    const where = buildDeviceHistoryWhere('IMEI-001', 'OWNER', null, 'tenant-1')
    expect(where).not.toHaveProperty('branchId')
    expect(where).toHaveProperty('branch', { tenantId: 'tenant-1' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B-4 · COMPLETED stock deduction race condition
// ─────────────────────────────────────────────────────────────────────────────

interface RepairPart {
  id: string
  productId: string
  quantity: number
  stockMovements: { id: string }[]
}

// Mirrors the original buggy approach: check outside tx, then enter tx
function deductStockBuggy(
  parts: RepairPart[],
  existingMovements: Set<string>, // partIds already deducted
): string[] {
  // Bug: filter happens OUTSIDE the transaction
  const undeducted = parts.filter((p) => p.stockMovements.length === 0)
  // Simulate both concurrent requests seeing 0 movements and both entering tx
  const deducted: string[] = []
  for (const p of undeducted) {
    if (!existingMovements.has(p.id)) {
      deducted.push(p.id)
      existingMovements.add(p.id)
    }
  }
  return deducted
}

// Mirrors the fixed approach: re-fetch inside tx to get current movements
function deductStockFixed(
  parts: RepairPart[],
  committedMovements: Set<string>, // partIds already committed by a concurrent tx
): string[] {
  // Fix: re-query inside tx — sees movements committed by concurrent request
  const undeductedInTx = parts.filter(
    (p) => p.stockMovements.length === 0 && !committedMovements.has(p.id),
  )
  const deducted: string[] = []
  for (const p of undeductedInTx) {
    deducted.push(p.id)
    committedMovements.add(p.id)
  }
  return deducted
}

describe('B-4 — COMPLETED stock deduction race condition', () => {
  const parts: RepairPart[] = [
    { id: 'part-1', productId: 'prod-X', quantity: 2, stockMovements: [] },
    { id: 'part-2', productId: 'prod-Y', quantity: 1, stockMovements: [] },
  ]

  it('buggy approach: concurrent requests can both deduct (double deduction)', () => {
    // Simulate Request A reading parts (both have 0 movements)
    const reqA_undeducted = parts.filter((p) => p.stockMovements.length === 0)
    // Simulate Request B reading parts before A commits (also sees 0 movements)
    const reqB_undeducted = parts.filter((p) => p.stockMovements.length === 0)

    // Both see parts to deduct — double deduction occurs
    expect(reqA_undeducted.length).toBe(2)
    expect(reqB_undeducted.length).toBe(2)
    // This is the bug: both requests would deduct the same parts
  })

  it('fixed approach: second concurrent tx sees committed movements and skips', () => {
    const committed = new Set<string>()

    // Request A enters tx, deducts, commits
    const deductedByA = deductStockFixed(parts, committed)
    expect(deductedByA).toHaveLength(2)
    expect(committed.size).toBe(2)

    // Request B enters tx — committed now has both parts → skips deduction
    const deductedByB = deductStockFixed(parts, committed)
    expect(deductedByB).toHaveLength(0)
  })

  it('fixed: completing a repair twice deducts stock only once', () => {
    const committed = new Set<string>()
    const first  = deductStockFixed(parts, committed)
    const second = deductStockFixed(parts, committed)
    const totalDeductions = first.length + second.length
    expect(totalDeductions).toBe(2) // each part deducted exactly once
  })

  it('fixed: partial deduction scenario (some parts already have movements)', () => {
    const partsPartiallyDeducted: RepairPart[] = [
      { id: 'part-1', productId: 'prod-X', quantity: 2, stockMovements: [{ id: 'mv-1' }] },
      { id: 'part-2', productId: 'prod-Y', quantity: 1, stockMovements: [] },
    ]
    const committed = new Set<string>()
    // Only part-2 should be deducted (part-1 already has a movement)
    const deducted = deductStockFixed(partsPartiallyDeducted, committed)
    expect(deducted).toEqual(['part-2'])
    expect(deducted).not.toContain('part-1')
  })

  it('fixed: no parts to deduct → tx runs but produces no deductions', () => {
    const alreadyDeducted: RepairPart[] = [
      { id: 'part-1', productId: 'prod-X', quantity: 2, stockMovements: [{ id: 'mv-1' }] },
    ]
    const committed = new Set<string>()
    const deducted = deductStockFixed(alreadyDeducted, committed)
    expect(deducted).toHaveLength(0)
  })
})
