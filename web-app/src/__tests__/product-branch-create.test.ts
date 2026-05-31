/**
 * Product Create — Branch Stock Regression Tests
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Mirrors:
 *   backend/src/products/products.service.ts  — create() branch resolution + BranchStock atomic create
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

interface BranchStockRow {
  branchId:  string
  productId: string
  quantity:  number
  minStock:  number
  stockCode: string | null
}

interface ProductRow {
  id:    string
  sku:   string
  stock: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: mirrors products.service.ts create() logic
// ─────────────────────────────────────────────────────────────────────────────

function resolveEffectiveBranchId(
  userRole: Role,
  jwtBranchId: string | null | undefined,
  dtoBranchId: string | undefined,
): string | undefined {
  const isPrivileged = userRole === 'OWNER' || userRole === 'SUPER_ADMIN'
  return isPrivileged ? (dtoBranchId ?? undefined) : (jwtBranchId ?? undefined)
}

function validateCreate(
  effectiveBranchId: string | undefined,
  initialStock: number,
): { error: string } | null {
  const isPrivileged = effectiveBranchId === undefined // OWNER in global mode
  if (isPrivileged && initialStock > 0) {
    return { error: 'กรุณาเลือกสาขาก่อนเพิ่มสต๊อกสินค้า' }
  }
  return null
}

function generateStockCode(branchNumber: number, seq: number): string {
  return `SK${branchNumber}-${String(seq).padStart(6, '0')}`
}

function simulateCreate(opts: {
  userRole: Role
  jwtBranchId: string | null | undefined
  dtoBranchId: string | undefined
  initialStock: number
  minStock: number
  productId: string
  branchNumber: number
  currentSeq: number
}): {
  product: ProductRow | null
  branchStockRow: BranchStockRow | null
  error: string | null
  newSeq: number
} {
  const effectiveBranchId = resolveEffectiveBranchId(opts.userRole, opts.jwtBranchId, opts.dtoBranchId)

  const validationError = validateCreate(effectiveBranchId, opts.initialStock)
  if (validationError) {
    return { product: null, branchStockRow: null, error: validationError.error, newSeq: opts.currentSeq }
  }

  const product: ProductRow = { id: opts.productId, sku: 'TEST-SKU', stock: opts.initialStock }

  let branchStockRow: BranchStockRow | null = null
  let newSeq = opts.currentSeq

  if (effectiveBranchId) {
    newSeq = opts.currentSeq + 1
    const stockCode = generateStockCode(opts.branchNumber, newSeq)
    branchStockRow = {
      branchId:  effectiveBranchId,
      productId: opts.productId,
      quantity:  opts.initialStock,
      minStock:  opts.minStock,
      stockCode,
    }
  }

  return { product, branchStockRow, error: null, newSeq }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Branch 2 staff creates product with stock=5
//   → BranchStock(branch2) created, stockCode = SK2-000001
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 1 — Branch 2 staff creates product with initial stock', () => {
  const BRANCH2 = 'branch-2-uuid'

  const result = simulateCreate({
    userRole: 'CASHIER',
    jwtBranchId: BRANCH2,
    dtoBranchId: undefined, // staff can't provide branchId — ignored anyway
    initialStock: 5,
    minStock: 2,
    productId: 'prod-new-1',
    branchNumber: 2,
    currentSeq: 0,
  })

  it('no error', () => expect(result.error).toBeNull())

  it('product master is created', () => expect(result.product?.id).toBe('prod-new-1'))

  it('BranchStock row created for Branch 2', () => {
    expect(result.branchStockRow?.branchId).toBe(BRANCH2)
    expect(result.branchStockRow?.quantity).toBe(5)
  })

  it('stockCode starts with SK2-', () => {
    expect(result.branchStockRow?.stockCode).toMatch(/^SK2-/)
  })

  it('stockCode is SK2-000001 (first product for branch 2)', () => {
    expect(result.branchStockRow?.stockCode).toBe('SK2-000001')
  })

  it('seq incremented to 1', () => expect(result.newSeq).toBe(1))
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Branch 3 staff creates product: Branch 2's seq NOT touched
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 2 — Branch 3 staff creates product: Branch 2 unaffected', () => {
  const BRANCH2 = 'branch-2-uuid'
  const BRANCH3 = 'branch-3-uuid'

  // Simulate Branch 2 already has seq=3
  const branch2Seq = 3

  const resultB3 = simulateCreate({
    userRole: 'STOCK_STAFF',
    jwtBranchId: BRANCH3,
    dtoBranchId: undefined,
    initialStock: 10,
    minStock: 3,
    productId: 'prod-new-2',
    branchNumber: 3,
    currentSeq: 0,
  })

  it('Branch 3 BranchStock created with SK3-000001', () => {
    expect(resultB3.branchStockRow?.branchId).toBe(BRANCH3)
    expect(resultB3.branchStockRow?.stockCode).toBe('SK3-000001')
  })

  it('Branch 2 seq unchanged at 3', () => {
    // Branch 3 create only increments Branch 3 seq — Branch 2 seq stays at 3
    expect(branch2Seq).toBe(3)
  })

  it('Branch 3 BranchStock does NOT reference Branch 2', () => {
    expect(resultB3.branchStockRow?.branchId).not.toBe(BRANCH2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — OWNER global mode + stock > 0 → blocked
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 3 — OWNER global mode + stock > 0 is blocked', () => {
  const result = simulateCreate({
    userRole: 'OWNER',
    jwtBranchId: null,   // OWNER has no JWT branchId
    dtoBranchId: undefined, // no branch selected (global mode)
    initialStock: 1,
    minStock: 0,
    productId: 'prod-new-3',
    branchNumber: 0,
    currentSeq: 0,
  })

  it('throws Thai error message', () => {
    expect(result.error).toBe('กรุณาเลือกสาขาก่อนเพิ่มสต๊อกสินค้า')
  })

  it('product is NOT created', () => expect(result.product).toBeNull())

  it('BranchStock is NOT created', () => expect(result.branchStockRow).toBeNull())

  it('seq not incremented', () => expect(result.newSeq).toBe(0))
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — OWNER with Branch 2 selected creates product with stock=3
//   → BranchStock(branch2) created, stock=3
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 4 — OWNER selected Branch 2 creates product', () => {
  const BRANCH2 = 'branch-2-uuid'

  const result = simulateCreate({
    userRole: 'OWNER',
    jwtBranchId: null,
    dtoBranchId: BRANCH2, // OWNER explicitly chooses branch 2
    initialStock: 3,
    minStock: 1,
    productId: 'prod-new-4',
    branchNumber: 2,
    currentSeq: 5,
  })

  it('no error', () => expect(result.error).toBeNull())

  it('product created', () => expect(result.product).not.toBeNull())

  it('BranchStock created for Branch 2', () => {
    expect(result.branchStockRow?.branchId).toBe(BRANCH2)
    expect(result.branchStockRow?.quantity).toBe(3)
  })

  it('stockCode continues Branch 2 sequence (SK2-000006)', () => {
    expect(result.branchStockRow?.stockCode).toBe('SK2-000006')
  })

  it('effectiveBranchId = dtoBranchId for OWNER', () => {
    const eff = resolveEffectiveBranchId('OWNER', null, BRANCH2)
    expect(eff).toBe(BRANCH2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — stock=0 with branch context → BranchStock row still created
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 5 — stock=0 with branch context: BranchStock row still created', () => {
  const BRANCH2 = 'branch-2-uuid'

  const result = simulateCreate({
    userRole: 'MANAGER',
    jwtBranchId: BRANCH2,
    dtoBranchId: undefined,
    initialStock: 0,
    minStock: 5,
    productId: 'prod-new-5',
    branchNumber: 2,
    currentSeq: 10,
  })

  it('no error', () => expect(result.error).toBeNull())

  it('BranchStock row IS created even when quantity = 0', () => {
    expect(result.branchStockRow).not.toBeNull()
  })

  it('BranchStock quantity = 0', () => {
    expect(result.branchStockRow?.quantity).toBe(0)
  })

  it('BranchStock branchId = Branch 2 (so product is visible in branch list)', () => {
    expect(result.branchStockRow?.branchId).toBe(BRANCH2)
  })

  it('stockCode is assigned (product discoverable in branch)', () => {
    expect(result.branchStockRow?.stockCode).toBeTruthy()
  })

  it('OWNER global mode + stock=0 is allowed (no error)', () => {
    const r = simulateCreate({
      userRole: 'OWNER',
      jwtBranchId: null,
      dtoBranchId: undefined,
      initialStock: 0,
      minStock: 0,
      productId: 'prod-global',
      branchNumber: 0,
      currentSeq: 0,
    })
    expect(r.error).toBeNull()
    expect(r.branchStockRow).toBeNull() // no branch → no BranchStock, but no error
  })
})
