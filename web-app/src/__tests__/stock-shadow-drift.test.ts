/**
 * Stock Shadow Drift & Branch-Aware Low Stock — Regression Tests
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Mirrors the logic in:
 *   backend/src/branches/branches.service.ts — syncProductShadowStock / setBranchStock
 *   backend/src/stock/stock.service.ts       — getLowStockProducts
 *   backend/src/stock/stock.controller.ts    — effectiveBranchId resolution
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Shadow-stock helpers — mirrors syncProductShadowStock pattern
// ─────────────────────────────────────────────────────────────────────────────

type BranchStockRow = { branchId: string; productId: string; quantity: number }

function computeShadowStock(productId: string, allBranchStocks: BranchStockRow[]): number {
  return allBranchStocks
    .filter((r) => r.productId === productId)
    .reduce((sum, r) => sum + r.quantity, 0)
}

function setBranchStock(
  branchId: string,
  productId: string,
  quantity: number,
  existingRows: BranchStockRow[],
): { rows: BranchStockRow[]; shadowStock: number } {
  const rows = existingRows.filter(
    (r) => !(r.branchId === branchId && r.productId === productId),
  )
  rows.push({ branchId, productId, quantity })
  const shadowStock = computeShadowStock(productId, rows)
  return { rows, shadowStock }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch-aware low-stock filter — mirrors getLowStockProducts logic
// ─────────────────────────────────────────────────────────────────────────────

type BranchLowStockRow = {
  id: string
  productId: string
  name: string
  sku: string
  stock: number
  minStock: number
  branchId: string
  branchName: string
  severity: 'OUT_OF_STOCK' | 'LOW_STOCK'
}

type FullBranchStockRow = BranchStockRow & {
  minStock: number
  name: string
  sku: string
  branchName: string
}

function filterLowStock(rows: FullBranchStockRow[], branchId?: string): BranchLowStockRow[] {
  const filtered = rows.filter(
    (r) =>
      r.minStock > 0 &&
      r.quantity <= r.minStock &&
      (branchId ? r.branchId === branchId : true),
  )
  return filtered.map((r) => ({
    id:         r.productId,
    productId:  r.productId,
    name:       r.name,
    sku:        r.sku,
    stock:      r.quantity,
    minStock:   r.minStock,
    branchId:   r.branchId,
    branchName: r.branchName,
    severity:   r.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective branchId resolution — mirrors stock.controller.ts low-stock handler
// ─────────────────────────────────────────────────────────────────────────────

function resolveEffectiveBranchId(
  role: string,
  jwtBranchId: string | null,
  queryBranchId?: string,
): string | undefined {
  const isElevated = role === 'OWNER' || role === 'SUPER_ADMIN'
  return isElevated
    ? (queryBranchId || undefined)
    : (jwtBranchId ?? undefined)
}

// ─────────────────────────────────────────────────────────────────────────────
// Shadow stock drift — setBranchStock must use SUM, not absolute set
// ─────────────────────────────────────────────────────────────────────────────

describe('Shadow stock — syncProductShadowStock', () => {
  it('single branch: shadow equals branch quantity', () => {
    const { shadowStock } = setBranchStock('branch-A', 'prod-1', 10, [])
    expect(shadowStock).toBe(10)
  })

  it('two branches: shadow is SUM, not the last-written value', () => {
    // Branch A: 10 units, Branch B: 5 units
    const { rows } = setBranchStock('branch-A', 'prod-1', 10, [])
    const { shadowStock } = setBranchStock('branch-B', 'prod-1', 5, rows)
    expect(shadowStock).toBe(15)
  })

  it('updating one branch does NOT reset other branches to 0', () => {
    const initial: BranchStockRow[] = [
      { branchId: 'branch-A', productId: 'prod-1', quantity: 10 },
      { branchId: 'branch-B', productId: 'prod-1', quantity: 5 },
    ]
    // Update branch-A quantity to 3; branch-B (5) must still be counted
    const { shadowStock } = setBranchStock('branch-A', 'prod-1', 3, initial)
    expect(shadowStock).toBe(8)
  })

  it('zero-quantity branch still aggregated correctly', () => {
    const initial: BranchStockRow[] = [
      { branchId: 'branch-A', productId: 'prod-1', quantity: 0 },
      { branchId: 'branch-B', productId: 'prod-1', quantity: 7 },
    ]
    const { shadowStock } = setBranchStock('branch-A', 'prod-1', 0, initial)
    expect(shadowStock).toBe(7)
  })

  it('three branches aggregate correctly', () => {
    let rows: BranchStockRow[] = []
    const r1 = setBranchStock('branch-A', 'prod-1', 4, rows)
    rows = r1.rows
    const r2 = setBranchStock('branch-B', 'prod-1', 6, rows)
    rows = r2.rows
    const r3 = setBranchStock('branch-C', 'prod-1', 2, rows)
    expect(r3.shadowStock).toBe(12)
  })

  it('different product IDs do not bleed into each other', () => {
    const initial: BranchStockRow[] = [
      { branchId: 'branch-A', productId: 'prod-1', quantity: 10 },
      { branchId: 'branch-A', productId: 'prod-2', quantity: 99 },
    ]
    const shadow = computeShadowStock('prod-1', initial)
    expect(shadow).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Branch-aware low-stock — getLowStockProducts
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_ROWS: FullBranchStockRow[] = [
  { branchId: 'branch-A', productId: 'prod-1', quantity: 0,  minStock: 5,  name: 'iPhone 15',  sku: 'IP15',  branchName: 'A' },
  { branchId: 'branch-A', productId: 'prod-2', quantity: 3,  minStock: 5,  name: 'Case',        sku: 'CASE1', branchName: 'A' },
  { branchId: 'branch-B', productId: 'prod-1', quantity: 20, minStock: 5,  name: 'iPhone 15',  sku: 'IP15',  branchName: 'B' },
  { branchId: 'branch-B', productId: 'prod-3', quantity: 1,  minStock: 10, name: 'Screen',      sku: 'SCR1',  branchName: 'B' },
  { branchId: 'branch-A', productId: 'prod-4', quantity: 8,  minStock: 5,  name: 'Adapter',    sku: 'ADP1',  branchName: 'A' },
]

describe('getLowStockProducts — branch filter', () => {
  it('branch A: returns only low-stock rows for branch A', () => {
    const result = filterLowStock(SAMPLE_ROWS, 'branch-A')
    const productIds = result.map((r) => r.productId)
    expect(productIds).toContain('prod-1')  // qty 0 < minStock 5
    expect(productIds).toContain('prod-2')  // qty 3 < minStock 5
    expect(productIds).not.toContain('prod-4') // qty 8 > minStock 5 — healthy
    expect(productIds).not.toContain('prod-3') // belongs to branch B
  })

  it('branch B: returns only low-stock rows for branch B', () => {
    const result = filterLowStock(SAMPLE_ROWS, 'branch-B')
    const productIds = result.map((r) => r.productId)
    expect(productIds).toContain('prod-3')  // qty 1 < minStock 10
    expect(productIds).not.toContain('prod-1') // branch B prod-1 qty 20 is healthy
    expect(productIds).not.toContain('prod-2') // belongs to branch A
  })

  it('OWNER global mode (no branchId): returns per-branch low-stock across all branches', () => {
    const result = filterLowStock(SAMPLE_ROWS)
    const keys = result.map((r) => `${r.branchId}:${r.productId}`)
    expect(keys).toContain('branch-A:prod-1')
    expect(keys).toContain('branch-A:prod-2')
    expect(keys).toContain('branch-B:prod-3')
    expect(keys).not.toContain('branch-B:prod-1') // healthy at branch B
    expect(keys).not.toContain('branch-A:prod-4') // healthy
  })

  it('severity OUT_OF_STOCK when quantity is 0', () => {
    const result = filterLowStock(SAMPLE_ROWS, 'branch-A')
    const outRow = result.find((r) => r.productId === 'prod-1')
    expect(outRow?.severity).toBe('OUT_OF_STOCK')
    expect(outRow?.stock).toBe(0)
  })

  it('severity LOW_STOCK when quantity > 0 but <= minStock', () => {
    const result = filterLowStock(SAMPLE_ROWS, 'branch-A')
    const lowRow = result.find((r) => r.productId === 'prod-2')
    expect(lowRow?.severity).toBe('LOW_STOCK')
    expect(lowRow?.stock).toBe(3)
  })

  it('item with minStock = 0 is excluded (no alert configured)', () => {
    const rows: FullBranchStockRow[] = [
      { branchId: 'branch-A', productId: 'prod-5', quantity: 0, minStock: 0, name: 'X', sku: 'X1', branchName: 'A' },
    ]
    const result = filterLowStock(rows, 'branch-A')
    expect(result).toHaveLength(0)
  })

  it('response id equals productId for detail navigation compatibility', () => {
    const result = filterLowStock(SAMPLE_ROWS, 'branch-A')
    for (const row of result) {
      expect(row.id).toBe(row.productId)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Controller — effective branchId resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('getLowStockProducts controller — effective branchId', () => {
  it('CASHIER always uses JWT branchId, ignores query param', () => {
    const id = resolveEffectiveBranchId('CASHIER', 'branch-A', 'branch-B')
    expect(id).toBe('branch-A')
  })

  it('TECHNICIAN uses JWT branchId', () => {
    const id = resolveEffectiveBranchId('TECHNICIAN', 'branch-C')
    expect(id).toBe('branch-C')
  })

  it('OWNER with no query param returns undefined (global mode)', () => {
    const id = resolveEffectiveBranchId('OWNER', null, undefined)
    expect(id).toBeUndefined()
  })

  it('OWNER with query branchId drills into that branch', () => {
    const id = resolveEffectiveBranchId('OWNER', null, 'branch-B')
    expect(id).toBe('branch-B')
  })

  it('SUPER_ADMIN with query branchId drills into that branch', () => {
    const id = resolveEffectiveBranchId('SUPER_ADMIN', null, 'branch-A')
    expect(id).toBe('branch-A')
  })

  it('SUPER_ADMIN with no query param returns undefined (global mode)', () => {
    const id = resolveEffectiveBranchId('SUPER_ADMIN', 'branch-X', undefined)
    expect(id).toBeUndefined()
  })

  it('staff with null JWT branchId returns undefined gracefully', () => {
    const id = resolveEffectiveBranchId('STOCK_STAFF', null)
    expect(id).toBeUndefined()
  })
})
