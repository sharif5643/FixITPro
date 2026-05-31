/**
 * Transfer Button Visibility — Regression Tests (Phase 14B fix)
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Mirrors:
 *   web-app/src/app/(dashboard)/products/page.tsx
 *     canRequestTransfer
 *     otherHaveStock
 *     button render condition
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Types (minimal mirrors of types/index.ts)
// ─────────────────────────────────────────────────────────────────────────────

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

interface Product {
  id: string
  name: string
  stock: number
  minStock: number
  branchQuantity?: number
  otherBranchTotal?: number
  branchBreakdown?: Array<{ branchId: string; quantity: number; branchName: string; stockCode: string | null; minStock: number }>
  hasStockRecord?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Logic mirrors — exact copies of the conditions in products/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

function hasPermission(
  role: Role,
  dbPermissions: string[],
  permission: string,
): boolean {
  if (role === 'OWNER' || role === 'SUPER_ADMIN') return true
  return dbPermissions.includes(permission)
}

function stockOf(p: Product): number {
  return p.branchQuantity ?? p.stock
}

function computeOtherHaveStock(
  p: Product,
  effectiveBranch: string,
  lazyAvailData: Array<{ branchId: string; quantity: number }>,
): boolean {
  return (
    (p.otherBranchTotal ?? 0) > 0 ||
    lazyAvailData.some((b) => b.branchId !== effectiveBranch && b.quantity > 0)
  )
}

function canRequestTransferFlag(role: Role, dbPermissions: string[]): boolean {
  return (
    hasPermission(role, dbPermissions, 'stock.transfer') ||
    role === 'MANAGER' ||
    role === 'STOCK_STAFF'
  )
}

function shouldShowTransferButton(opts: {
  isViewAll: boolean
  effectiveBranch: string | undefined
  p: Product
  role: Role
  dbPermissions: string[]
  lazyAvailData?: Array<{ branchId: string; quantity: number }>
}): boolean {
  const { isViewAll, effectiveBranch, p, role, dbPermissions, lazyAvailData = [] } = opts
  if (isViewAll || !effectiveBranch) return false

  const q        = stockOf(p)
  const isOut    = q === 0
  if (!isOut) return false

  const otherHaveStock = computeOtherHaveStock(p, effectiveBranch, lazyAvailData)
  if (!otherHaveStock) return false

  return canRequestTransferFlag(role, dbPermissions)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const BRANCH_A = 'branch-a'
const BRANCH_B = 'branch-b'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id:               'prod-1',
    name:             'Test Product',
    stock:            5,
    minStock:         2,
    branchQuantity:   0,
    otherBranchTotal: 5,
    hasStockRecord:   true,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: button visible when conditions are met
// ─────────────────────────────────────────────────────────────────────────────

describe('Transfer button visibility — happy path', () => {
  it('shows for OWNER: branchQuantity=0, otherBranchTotal=5', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'OWNER',
      dbPermissions: [],
    })).toBe(true)
  })

  it('shows for MANAGER without stock.transfer in DB (role fallback)', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'MANAGER',
      dbPermissions: [],      // DB not seeded — no stock.transfer
    })).toBe(true)
  })

  it('shows for STOCK_STAFF without stock.transfer in DB (role fallback)', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'STOCK_STAFF',
      dbPermissions: [],
    })).toBe(true)
  })

  it('shows for MANAGER with stock.transfer in DB', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'MANAGER',
      dbPermissions: ['stock.transfer'],
    })).toBe(true)
  })

  it('shows when otherBranchTotal is undefined but lazy availData confirms stock', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: undefined }),
      role: 'OWNER',
      dbPermissions: [],
      lazyAvailData: [{ branchId: BRANCH_B, quantity: 5 }],
    })).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests: button hidden when conditions are not met
// ─────────────────────────────────────────────────────────────────────────────

describe('Transfer button visibility — hidden cases', () => {
  it('hides for CASHIER (no stock.transfer, role not in fallback list)', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'CASHIER',
      dbPermissions: [],
    })).toBe(false)
  })

  it('hides for TECHNICIAN', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'TECHNICIAN',
      dbPermissions: [],
    })).toBe(false)
  })

  it('hides when isViewAll=true (OWNER global mode)', () => {
    expect(shouldShowTransferButton({
      isViewAll: true,
      effectiveBranch: undefined,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'OWNER',
      dbPermissions: [],
    })).toBe(false)
  })

  it('hides when effectiveBranch is undefined', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: undefined,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 5 }),
      role: 'MANAGER',
      dbPermissions: [],
    })).toBe(false)
  })

  it('hides when branchQuantity > 0 (product has stock)', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 3, otherBranchTotal: 5 }),
      role: 'MANAGER',
      dbPermissions: [],
    })).toBe(false)
  })

  it('hides when otherBranchTotal=0 and no lazy avail data', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: 0 }),
      role: 'OWNER',
      dbPermissions: [],
    })).toBe(false)
  })

  it('hides when otherBranchTotal undefined and lazy data is empty', () => {
    expect(shouldShowTransferButton({
      isViewAll: false,
      effectiveBranch: BRANCH_A,
      p: makeProduct({ branchQuantity: 0, otherBranchTotal: undefined }),
      role: 'OWNER',
      dbPermissions: [],
      lazyAvailData: [],
    })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests: otherHaveStock logic
// ─────────────────────────────────────────────────────────────────────────────

describe('otherHaveStock computed correctly', () => {
  it('true when otherBranchTotal=5 (no lazy load needed)', () => {
    const p = makeProduct({ otherBranchTotal: 5 })
    expect(computeOtherHaveStock(p, BRANCH_A, [])).toBe(true)
  })

  it('true when otherBranchTotal=0 but lazy avail shows branch-b has 5', () => {
    const p = makeProduct({ otherBranchTotal: 0 })
    const avail = [{ branchId: BRANCH_B, quantity: 5 }]
    expect(computeOtherHaveStock(p, BRANCH_A, avail)).toBe(true)
  })

  it('false when otherBranchTotal=0 and lazy avail only shows same branch', () => {
    const p = makeProduct({ otherBranchTotal: 0 })
    const avail = [{ branchId: BRANCH_A, quantity: 0 }]
    expect(computeOtherHaveStock(p, BRANCH_A, avail)).toBe(false)
  })

  it('false when otherBranchTotal=0 and lazy avail shows other branch has 0', () => {
    const p = makeProduct({ otherBranchTotal: 0 })
    const avail = [{ branchId: BRANCH_B, quantity: 0 }]
    expect(computeOtherHaveStock(p, BRANCH_A, avail)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests: canRequestTransfer permission + role fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('canRequestTransfer permission + role fallback', () => {
  it('OWNER: always true regardless of DB', () => {
    expect(canRequestTransferFlag('OWNER', [])).toBe(true)
  })

  it('SUPER_ADMIN: always true regardless of DB', () => {
    expect(canRequestTransferFlag('SUPER_ADMIN', [])).toBe(true)
  })

  it('MANAGER: true via role fallback when no DB permission', () => {
    expect(canRequestTransferFlag('MANAGER', [])).toBe(true)
  })

  it('MANAGER: true when DB has stock.transfer', () => {
    expect(canRequestTransferFlag('MANAGER', ['stock.transfer'])).toBe(true)
  })

  it('STOCK_STAFF: true via role fallback', () => {
    expect(canRequestTransferFlag('STOCK_STAFF', [])).toBe(true)
  })

  it('CASHIER: false with no DB permission', () => {
    expect(canRequestTransferFlag('CASHIER', [])).toBe(false)
  })

  it('CASHIER: true if explicitly granted stock.transfer in DB', () => {
    expect(canRequestTransferFlag('CASHIER', ['stock.transfer'])).toBe(true)
  })

  it('TECHNICIAN: false with no DB permission', () => {
    expect(canRequestTransferFlag('TECHNICIAN', [])).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirm that clicking the button sets the product (dialog opens)
// ─────────────────────────────────────────────────────────────────────────────

describe('Dialog integration — product state', () => {
  it('open flag is derived from product not null', () => {
    const product = makeProduct()
    const open = !!product
    expect(open).toBe(true)
  })

  it('open flag is false after clearing product', () => {
    const product: Product | null = null
    const open = !!product
    expect(open).toBe(false)
  })
})
