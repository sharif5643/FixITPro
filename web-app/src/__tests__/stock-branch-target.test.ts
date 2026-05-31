/**
 * Branch Stock Target — Regression Tests
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Mirrors:
 *   backend/src/stock/stock.controller.ts — effectiveBranchId resolution for adjustStock
 *   backend/src/stock/stock.service.ts    — BranchStock mutation isolation
 *   web-app add-stock-dialog.tsx          — frontend effectiveBranchId + OWNER global-mode guard
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: mirrors backend adjustStock branchId resolution
// ─────────────────────────────────────────────────────────────────────────────

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

function resolveAdjustBranchId(
  actorRole: Role,
  jwtBranchId: string | null,
  bodyBranchId: string | undefined,
): { branchId: string; error?: undefined } | { branchId?: undefined; error: string } {
  const isOwner = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN'
  if (!isOwner) {
    if (!jwtBranchId) return { error: 'ไม่พบข้อมูลสาขาของพนักงาน กรุณาติดต่อผู้ดูแลระบบ' }
    return { branchId: jwtBranchId } // body.branchId ignored for staff
  }
  if (!bodyBranchId) return { error: 'กรุณาเลือกสาขาก่อนเพิ่ม/ปรับสต็อก' }
  return { branchId: bodyBranchId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: mirrors frontend AddStockDialog OWNER global-mode guard
// ─────────────────────────────────────────────────────────────────────────────

function resolveDialogEffectiveBranchId(
  isOwner: boolean,
  isBranchLocked: boolean,
  isGlobalMode: boolean,
  contextBranchId: string | undefined,
  propBranchId: string | undefined,
  dialogSelectedBranchId: string | undefined,
): { effectiveBranchId: string | undefined; blocked: boolean } {
  // OWNER in global mode: block only when no branch is resolved at all
  // (neither from parent prop nor from dialog-internal dropdown selection)
  if (isOwner && isGlobalMode && !propBranchId && !dialogSelectedBranchId) {
    return { effectiveBranchId: undefined, blocked: true }
  }
  const effectiveBranchId = isBranchLocked
    ? contextBranchId
    : (propBranchId ?? dialogSelectedBranchId)
  return { effectiveBranchId, blocked: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: in-memory BranchStock store for service-level tests
// ─────────────────────────────────────────────────────────────────────────────

type BranchStockRow = { branchId: string; productId: string; quantity: number }

function applyAdjust(
  rows: BranchStockRow[],
  branchId: string,
  productId: string,
  quantityDelta: number,
): BranchStockRow[] {
  const copy = rows.map((r) => ({ ...r }))
  const idx  = copy.findIndex((r) => r.branchId === branchId && r.productId === productId)
  if (idx >= 0) {
    copy[idx].quantity = Math.max(0, copy[idx].quantity + quantityDelta)
  } else {
    copy.push({ branchId, productId, quantity: Math.max(0, quantityDelta) })
  }
  return copy
}

// ─────────────────────────────────────────────────────────────────────────────
// Test A — Branch 2 user adds Product A qty 10: only branch 2 changes
// ─────────────────────────────────────────────────────────────────────────────

describe('Test A — Branch 2 user adds 10 units', () => {
  const HQ       = 'hq-uuid'
  const BRANCH2  = 'branch-2-uuid'
  const BRANCH3  = 'branch-3-uuid'
  const PRODUCT  = 'prod-A'

  const initial: BranchStockRow[] = [
    { branchId: HQ,      productId: PRODUCT, quantity: 20 },
    { branchId: BRANCH3, productId: PRODUCT, quantity: 5  },
  ]

  it('backend resolves to Branch 2 JWT branchId, ignoring body', () => {
    const r = resolveAdjustBranchId('CASHIER', BRANCH2, HQ /* tampered body */)
    expect(r.branchId).toBe(BRANCH2)
    expect(r.error).toBeUndefined()
  })

  it('BranchStock for Branch 2 increases by 10', () => {
    const after = applyAdjust(initial, BRANCH2, PRODUCT, 10)
    const b2 = after.find((r) => r.branchId === BRANCH2 && r.productId === PRODUCT)
    expect(b2?.quantity).toBe(10)
  })

  it('BranchStock for HQ unchanged', () => {
    const after = applyAdjust(initial, BRANCH2, PRODUCT, 10)
    const hq = after.find((r) => r.branchId === HQ && r.productId === PRODUCT)
    expect(hq?.quantity).toBe(20)
  })

  it('BranchStock for Branch 3 unchanged', () => {
    const after = applyAdjust(initial, BRANCH2, PRODUCT, 10)
    const b3 = after.find((r) => r.branchId === BRANCH3 && r.productId === PRODUCT)
    expect(b3?.quantity).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test B — Branch 3 user adds Product A qty 5: only branch 3 changes
// ─────────────────────────────────────────────────────────────────────────────

describe('Test B — Branch 3 user adds 5 units', () => {
  const BRANCH2 = 'branch-2-uuid'
  const BRANCH3 = 'branch-3-uuid'
  const PRODUCT = 'prod-A'

  const initial: BranchStockRow[] = [
    { branchId: BRANCH2, productId: PRODUCT, quantity: 10 },
    { branchId: BRANCH3, productId: PRODUCT, quantity: 2  },
  ]

  it('backend resolves to Branch 3 JWT branchId', () => {
    const r = resolveAdjustBranchId('TECHNICIAN', BRANCH3, BRANCH2 /* wrong body */)
    expect(r.branchId).toBe(BRANCH3)
  })

  it('BranchStock(branch3, prodA) increases by 5', () => {
    const after = applyAdjust(initial, BRANCH3, PRODUCT, 5)
    const b3 = after.find((r) => r.branchId === BRANCH3 && r.productId === PRODUCT)
    expect(b3?.quantity).toBe(7)
  })

  it('BranchStock(branch2, prodA) unchanged', () => {
    const after = applyAdjust(initial, BRANCH3, PRODUCT, 5)
    const b2 = after.find((r) => r.branchId === BRANCH2 && r.productId === PRODUCT)
    expect(b2?.quantity).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test C — OWNER global mode: frontend blocks dialog, backend throws on empty branchId
// ─────────────────────────────────────────────────────────────────────────────

describe('Test C — OWNER global mode is blocked', () => {
  it('frontend: dialog is blocked when OWNER has no branch selected', () => {
    const { blocked } = resolveDialogEffectiveBranchId(
      true,  // isOwner
      false, // isBranchLocked
      true,  // isGlobalMode
      undefined, // contextBranchId
      undefined, // propBranchId (none from parent)
      undefined, // dialog-local selection
    )
    expect(blocked).toBe(true)
  })

  it('backend: throws Thai error when OWNER sends no branchId', () => {
    const r = resolveAdjustBranchId('OWNER', null, undefined)
    expect(r.error).toBe('กรุณาเลือกสาขาก่อนเพิ่ม/ปรับสต็อก')
    expect(r.branchId).toBeUndefined()
  })

  it('frontend: effectiveBranchId is undefined in global mode → isValid = false', () => {
    const { effectiveBranchId, blocked } = resolveDialogEffectiveBranchId(
      true, false, true, undefined, undefined, undefined,
    )
    expect(effectiveBranchId).toBeUndefined()
    expect(blocked).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test D — OWNER with Branch 2 selected: stock goes to Branch 2 only
// ─────────────────────────────────────────────────────────────────────────────

describe('Test D — OWNER selected Branch 2 adds stock', () => {
  const BRANCH2 = 'branch-2-uuid'
  const HQ      = 'hq-uuid'

  it('frontend: effectiveBranchId = Branch 2 from propBranchId', () => {
    const { effectiveBranchId, blocked } = resolveDialogEffectiveBranchId(
      true,     // isOwner
      false,    // isBranchLocked
      false,    // isGlobalMode (branch IS selected)
      undefined,
      BRANCH2,  // propBranchId from products page selectedBranch
      undefined,
    )
    expect(effectiveBranchId).toBe(BRANCH2)
    expect(blocked).toBe(false)
  })

  it('backend: OWNER body.branchId = Branch 2 is accepted', () => {
    const r = resolveAdjustBranchId('OWNER', null, BRANCH2)
    expect(r.branchId).toBe(BRANCH2)
    expect(r.error).toBeUndefined()
  })

  it('OWNER selecting Branch 2 in dialog: effectiveBranchId = Branch 2', () => {
    const { effectiveBranchId } = resolveDialogEffectiveBranchId(
      true, false, true,
      undefined,
      undefined,
      BRANCH2, // OWNER picked branch 2 in dialog dropdown
    )
    expect(effectiveBranchId).toBe(BRANCH2)
  })

  it('stock for Branch 2 increases; HQ unchanged', () => {
    const initial: BranchStockRow[] = [
      { branchId: HQ, productId: 'prod-A', quantity: 50 },
    ]
    const after = applyAdjust(initial, BRANCH2, 'prod-A', 10)
    const b2 = after.find((r) => r.branchId === BRANCH2)
    const hq = after.find((r) => r.branchId === HQ)
    expect(b2?.quantity).toBe(10)
    expect(hq?.quantity).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test E — body.branchId tampering: Branch 2 staff sends HQ, backend ignores it
// ─────────────────────────────────────────────────────────────────────────────

describe('Test E — body.branchId tampering by staff', () => {
  const HQ      = 'hq-uuid'
  const BRANCH2 = 'branch-2-uuid'
  const BRANCH3 = 'branch-3-uuid'

  it('CASHIER body.branchId = HQ is overridden to JWT branchId (Branch 2)', () => {
    const r = resolveAdjustBranchId('CASHIER', BRANCH2, HQ)
    expect(r.branchId).toBe(BRANCH2) // NOT HQ
  })

  it('MANAGER body.branchId = HQ is overridden to JWT branchId (Branch 2)', () => {
    const r = resolveAdjustBranchId('MANAGER', BRANCH2, HQ)
    expect(r.branchId).toBe(BRANCH2)
  })

  it('TECHNICIAN body.branchId = Branch 3 is overridden to their own JWT (Branch 2)', () => {
    const r = resolveAdjustBranchId('TECHNICIAN', BRANCH2, BRANCH3)
    expect(r.branchId).toBe(BRANCH2)
  })

  it('STOCK_STAFF body.branchId tampering always fails to target other branch', () => {
    const r = resolveAdjustBranchId('STOCK_STAFF', BRANCH2, BRANCH3)
    expect(r.branchId).toBe(BRANCH2)
  })

  it('CASHIER with null JWT branchId throws error (no fallback to HQ)', () => {
    const r = resolveAdjustBranchId('CASHIER', null, HQ)
    expect(r.error).toBeTruthy()
    expect(r.branchId).toBeUndefined()
  })

  it('stock mutation uses JWT-resolved branchId — body branchId irrelevant', () => {
    const initial: BranchStockRow[] = [
      { branchId: HQ, productId: 'prod-A', quantity: 100 },
    ]
    // Staff's JWT resolves to BRANCH2, so mutation targets BRANCH2 regardless of body
    const resolvedBranchId = resolveAdjustBranchId('CASHIER', BRANCH2, HQ).branchId!
    const after = applyAdjust(initial, resolvedBranchId, 'prod-A', 10)
    const hq = after.find((r) => r.branchId === HQ)
    const b2 = after.find((r) => r.branchId === BRANCH2)
    expect(hq?.quantity).toBe(100) // HQ unchanged
    expect(b2?.quantity).toBe(10)  // Branch 2 gets the stock
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional: shadow stock recalculation after adjust
// ─────────────────────────────────────────────────────────────────────────────

describe('Shadow stock recalculation after adjustStock', () => {
  type BS = BranchStockRow

  function syncShadow(productId: string, rows: BS[]): number {
    return rows
      .filter((r) => r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0)
  }

  it('shadow = SUM after branch 2 adds 10 to product with 20 in HQ', () => {
    const rows: BS[] = [
      { branchId: 'hq', productId: 'prod-A', quantity: 20 },
    ]
    const after = applyAdjust(rows, 'branch-2', 'prod-A', 10)
    expect(syncShadow('prod-A', after)).toBe(30)
  })

  it('shadow = SUM after branch 3 deducts 3 from its own 5', () => {
    const rows: BS[] = [
      { branchId: 'hq',      productId: 'prod-A', quantity: 20 },
      { branchId: 'branch-3', productId: 'prod-A', quantity: 5  },
    ]
    const after = applyAdjust(rows, 'branch-3', 'prod-A', -3)
    expect(syncShadow('prod-A', after)).toBe(22)
  })

  it('HQ quantity not mutated when branch-2 adjusts', () => {
    const rows: BS[] = [
      { branchId: 'hq',      productId: 'prod-A', quantity: 50 },
      { branchId: 'branch-2', productId: 'prod-A', quantity: 10 },
    ]
    const after = applyAdjust(rows, 'branch-2', 'prod-A', 5)
    const hq = after.find((r) => r.branchId === 'hq')
    expect(hq?.quantity).toBe(50)
    expect(syncShadow('prod-A', after)).toBe(65)
  })
})
