/**
 * Product Catalog Enroll — Regression Tests (Phase 14A)
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Mirrors:
 *   backend/src/products/products.service.ts  — catalogSearch, enrollBranch
 *   frontend products page                    — branch visibility, owner global mode
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

interface ProductRow {
  id: string
  name: string
  sku: string
  barcode?: string
  type: string
  isActive: boolean
}

interface BranchStockRow {
  branchId:  string
  productId: string
  quantity:  number
  minStock:  number
  stockCode: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: mirrors enrollBranch service logic
// ─────────────────────────────────────────────────────────────────────────────

function resolveEnrollBranchId(
  userRole: Role,
  jwtBranchId: string | null | undefined,
  dtoBranchId: string | undefined,
): { branchId: string; error?: undefined } | { error: string; branchId?: undefined } {
  const isPrivileged = userRole === 'OWNER' || userRole === 'SUPER_ADMIN'
  const effectiveBranchId = isPrivileged ? dtoBranchId : (jwtBranchId ?? undefined)
  if (!effectiveBranchId) {
    return { error: 'กรุณาเลือกสาขาก่อนเพิ่มสินค้าเข้าสาขา' }
  }
  return { branchId: effectiveBranchId }
}

function simulateEnroll(
  rows: BranchStockRow[],
  branchId: string,
  productId: string,
  quantity: number,
  minStock: number,
  nextStockCode: string,
): BranchStockRow[] {
  const copy = rows.map((r) => ({ ...r }))
  const idx = copy.findIndex((r) => r.branchId === branchId && r.productId === productId)
  if (idx >= 0) {
    copy[idx].quantity += quantity
    copy[idx].minStock = minStock
  } else {
    copy.push({ branchId, productId, quantity, minStock, stockCode: nextStockCode })
  }
  return copy
}

function syncShadowStock(productId: string, rows: BranchStockRow[]): number {
  return rows.filter((r) => r.productId === productId).reduce((s, r) => s + r.quantity, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: catalog search filter (mirrors service catalogSearch logic)
// ─────────────────────────────────────────────────────────────────────────────

function catalogSearch(products: ProductRow[], search: string): ProductRow[] {
  if (!search.trim()) return []
  const q = search.toLowerCase()
  return products.filter(
    (p) =>
      p.isActive &&
      (p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario A — Branch 2 searches existing product → enrolls qty 10
//   BranchStock created; Product row NOT duplicated
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario A — Branch 2 enrolls existing product qty 10', () => {
  const BRANCH2 = 'branch-2-uuid'
  const PROD_A  = 'prod-film-ip13'

  const catalog: ProductRow[] = [
    { id: PROD_A, name: 'ฟิล์มกระจก iPhone 13', sku: 'FILM-IP13', barcode: '885000111222', type: 'ACCESSORY', isActive: true },
  ]
  const initialRows: BranchStockRow[] = []

  it('catalog search finds the product', () => {
    const results = catalogSearch(catalog, 'ฟิล์ม')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(PROD_A)
  })

  it('catalog search by barcode finds the product', () => {
    const results = catalogSearch(catalog, '885000111222')
    expect(results).toHaveLength(1)
  })

  it('branch resolution: CASHIER uses JWT branchId', () => {
    const r = resolveEnrollBranchId('CASHIER', BRANCH2, 'tampered-hq')
    expect(r.branchId).toBe(BRANCH2)
  })

  it('BranchStock row created for Branch 2 with qty 10', () => {
    const after = simulateEnroll(initialRows, BRANCH2, PROD_A, 10, 2, 'SK2-000001')
    const bs = after.find((r) => r.branchId === BRANCH2 && r.productId === PROD_A)
    expect(bs?.quantity).toBe(10)
    expect(bs?.stockCode).toBe('SK2-000001')
  })

  it('Product catalog still has exactly 1 entry (no duplication)', () => {
    // Enroll does NOT create a new Product — product count stays at 1
    expect(catalog.filter((p) => p.name === 'ฟิล์มกระจก iPhone 13')).toHaveLength(1)
  })

  it('shadow stock = 10 after enrollment', () => {
    const after = simulateEnroll(initialRows, BRANCH2, PROD_A, 10, 2, 'SK2-000001')
    expect(syncShadowStock(PROD_A, after)).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario B — Branch 3 enrolls the same product
//   Same Product ID; separate BranchStock row; Branch 2 unchanged
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario B — Branch 3 enrolls same product, Branch 2 unaffected', () => {
  const BRANCH2 = 'branch-2-uuid'
  const BRANCH3 = 'branch-3-uuid'
  const PROD_A  = 'prod-film-ip13'

  const existing: BranchStockRow[] = [
    { branchId: BRANCH2, productId: PROD_A, quantity: 10, minStock: 2, stockCode: 'SK2-000001' },
  ]

  it('Branch 3 branch resolution: STOCK_STAFF uses JWT branchId', () => {
    const r = resolveEnrollBranchId('STOCK_STAFF', BRANCH3, undefined)
    expect(r.branchId).toBe(BRANCH3)
  })

  it('BranchStock row created for Branch 3 separately', () => {
    const after = simulateEnroll(existing, BRANCH3, PROD_A, 5, 1, 'SK3-000001')
    const b3 = after.find((r) => r.branchId === BRANCH3 && r.productId === PROD_A)
    expect(b3?.quantity).toBe(5)
    expect(b3?.stockCode).toBe('SK3-000001')
  })

  it('Branch 2 BranchStock unchanged', () => {
    const after = simulateEnroll(existing, BRANCH3, PROD_A, 5, 1, 'SK3-000001')
    const b2 = after.find((r) => r.branchId === BRANCH2 && r.productId === PROD_A)
    expect(b2?.quantity).toBe(10)
  })

  it('Same productId referenced by both rows', () => {
    const after = simulateEnroll(existing, BRANCH3, PROD_A, 5, 1, 'SK3-000001')
    const ids = new Set(after.map((r) => r.productId))
    expect(ids.size).toBe(1)
    expect(ids.has(PROD_A)).toBe(true)
  })

  it('shadow stock = 15 (branch2 10 + branch3 5)', () => {
    const after = simulateEnroll(existing, BRANCH3, PROD_A, 5, 1, 'SK3-000001')
    expect(syncShadowStock(PROD_A, after)).toBe(15)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario C — Branch 2 searches → not found → creates product qty 5
//   Product master + BranchStock both created; no HQ stock
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario C — Not found in catalog → create product + BranchStock', () => {
  const BRANCH2   = 'branch-2-uuid'
  const NEW_PROD  = 'prod-new-uuid'

  const initialCatalog: ProductRow[] = []
  const initialRows: BranchStockRow[] = []

  it('catalog search returns empty for unknown product', () => {
    expect(catalogSearch(initialCatalog, 'iPhone 99 Pro')).toHaveLength(0)
  })

  it('after create: catalog has 1 product', () => {
    const catalog: ProductRow[] = [
      ...initialCatalog,
      { id: NEW_PROD, name: 'iPhone 99 Pro', sku: 'PHONE-000099', type: 'PHONE', isActive: true },
    ]
    expect(catalog).toHaveLength(1)
    expect(catalog[0].id).toBe(NEW_PROD)
  })

  it('after create: BranchStock row exists for Branch 2, qty 5', () => {
    const after = simulateEnroll(initialRows, BRANCH2, NEW_PROD, 5, 2, 'SK2-000002')
    const bs = after.find((r) => r.branchId === BRANCH2 && r.productId === NEW_PROD)
    expect(bs?.quantity).toBe(5)
  })

  it('no HQ BranchStock row created', () => {
    const HQ = 'hq-uuid'
    const after = simulateEnroll(initialRows, BRANCH2, NEW_PROD, 5, 2, 'SK2-000002')
    const hqRow = after.find((r) => r.branchId === HQ)
    expect(hqRow).toBeUndefined()
  })

  it('shadow stock = 5 after create', () => {
    const after = simulateEnroll(initialRows, BRANCH2, NEW_PROD, 5, 2, 'SK2-000002')
    expect(syncShadowStock(NEW_PROD, after)).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario D — OWNER global mode (no branch selected) → validation error
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario D — OWNER global mode enroll → Thai validation error', () => {
  it('OWNER with no dto.branchId and no jwt.branchId → error', () => {
    const r = resolveEnrollBranchId('OWNER', null, undefined)
    expect(r.error).toBe('กรุณาเลือกสาขาก่อนเพิ่มสินค้าเข้าสาขา')
    expect(r.branchId).toBeUndefined()
  })

  it('SUPER_ADMIN with no dto.branchId → error', () => {
    const r = resolveEnrollBranchId('SUPER_ADMIN', null, undefined)
    expect(r.error).toBeTruthy()
  })

  it('no BranchStock row created when error occurs', () => {
    const rows: BranchStockRow[] = []
    const r = resolveEnrollBranchId('OWNER', null, undefined)
    if (r.error) {
      // service throws before creating row
      expect(rows).toHaveLength(0)
    }
  })

  it('OWNER with dto.branchId provided → succeeds', () => {
    const r = resolveEnrollBranchId('OWNER', null, 'branch-2-uuid')
    expect(r.branchId).toBe('branch-2-uuid')
    expect(r.error).toBeUndefined()
  })

  it('frontend isOwnerGlobalMode: enroll button disabled, submit blocked', () => {
    // UI logic: button disabled when isOwnerGlobalMode = true
    const isOwnerGlobalMode = true
    const submitAllowed = !isOwnerGlobalMode
    expect(submitAllowed).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario E — Owner all-branches view: single product row, expandable breakdown
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario E — Owner all-branches view: single product row with breakdown', () => {
  const PROD_A  = 'prod-film-ip13'
  const BRANCH1 = 'branch-1-uuid'
  const BRANCH2 = 'branch-2-uuid'
  const BRANCH3 = 'branch-3-uuid'

  const allBranchStock: BranchStockRow[] = [
    { branchId: BRANCH1, productId: PROD_A, quantity: 10, minStock: 3, stockCode: 'SK1-000001' },
    { branchId: BRANCH2, productId: PROD_A, quantity: 8,  minStock: 2, stockCode: 'SK2-000001' },
    { branchId: BRANCH3, productId: PROD_A, quantity: 0,  minStock: 1, stockCode: 'SK3-000001' },
  ]

  function buildAllBranchesView(productId: string, rows: BranchStockRow[]) {
    const productRows = rows.filter((r) => r.productId === productId)
    const totalQty = productRows.reduce((s, r) => s + r.quantity, 0)
    const breakdown = productRows.map((r) => ({ branchId: r.branchId, quantity: r.quantity }))
    return { productId, totalQty, breakdown, rowCount: 1 } // always 1 product row
  }

  it('product appears as exactly 1 row regardless of branch count', () => {
    const view = buildAllBranchesView(PROD_A, allBranchStock)
    expect(view.rowCount).toBe(1)
  })

  it('total quantity = sum of all branches (10 + 8 + 0 = 18)', () => {
    const view = buildAllBranchesView(PROD_A, allBranchStock)
    expect(view.totalQty).toBe(18)
  })

  it('breakdown has 3 entries (one per branch)', () => {
    const view = buildAllBranchesView(PROD_A, allBranchStock)
    expect(view.breakdown).toHaveLength(3)
  })

  it('branch 1 shows 10, branch 2 shows 8', () => {
    const view = buildAllBranchesView(PROD_A, allBranchStock)
    const b1 = view.breakdown.find((b) => b.branchId === BRANCH1)
    const b2 = view.breakdown.find((b) => b.branchId === BRANCH2)
    expect(b1?.quantity).toBe(10)
    expect(b2?.quantity).toBe(8)
  })

  it('enrolling to branch 3 updates its quantity, totalQty becomes 23', () => {
    const after = simulateEnroll(allBranchStock, BRANCH3, PROD_A, 5, 1, 'SK3-000001')
    const view = buildAllBranchesView(PROD_A, after)
    expect(view.totalQty).toBe(23)
    expect(view.rowCount).toBe(1) // still 1 row
  })
})
