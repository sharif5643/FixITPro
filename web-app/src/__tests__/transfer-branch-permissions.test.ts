/**
 * Transfer Branch Permissions — Unit Tests
 *
 * Pure-logic tests. No DB, no NestJS, no DOM.
 * Mirrors the backend permission checks and frontend action-button visibility logic.
 *
 * Business rules:
 *   fromBranchId (source) = the branch that owns the stock and sends goods
 *   toBranchId (destination) = the branch that requested and will receive goods
 *
 *   PENDING   → source can approve/reject  | destination can cancel
 *   APPROVED  → source can dispatch        | destination can cancel
 *   IN_TRANSIT → destination can receive   | source is view-only (cannot receive)
 *   RECEIVED/REJECTED/CANCELLED → terminal, view-only
 */

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'
type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED'

interface Transfer {
  id: string
  fromBranchId: string
  toBranchId: string
  status: TransferStatus
  quantity: number
}

// ── Logic mirrors (backend + frontend) ───────────────────────────────────────

const PRIVILEGED: Role[] = ['OWNER', 'SUPER_ADMIN']

function isPrivileged(role: Role): boolean {
  return PRIVILEGED.includes(role)
}

// Backend approve permission
function canApprove(t: Transfer, actorBranchId: string | null, role: Role): boolean | string {
  if (t.status !== 'PENDING') return 'wrong-status'
  if (isPrivileged(role)) return true
  if (!actorBranchId) return false
  if (actorBranchId !== t.fromBranchId) return 'เฉพาะสาขาต้นทางเท่านั้นที่อนุมัติได้'
  return true
}

// Backend reject permission
function canReject(t: Transfer, actorBranchId: string | null, role: Role): boolean | string {
  if (t.status !== 'PENDING') return 'wrong-status'
  if (isPrivileged(role)) return true
  if (!actorBranchId) return false
  if (actorBranchId !== t.fromBranchId) return 'เฉพาะสาขาต้นทางเท่านั้นที่ปฏิเสธได้'
  return true
}

// Backend dispatch permission
function canDispatch(t: Transfer, actorBranchId: string | null, role: Role): boolean | string {
  if (t.status !== 'APPROVED') return 'wrong-status'
  if (isPrivileged(role)) return true
  if (!actorBranchId) return false
  if (actorBranchId !== t.fromBranchId) return 'เฉพาะสาขาต้นทางเท่านั้นที่จัดส่งได้'
  return true
}

// Backend receive permission
function canReceive(t: Transfer, actorBranchId: string | null, role: Role): boolean | string {
  if (t.status !== 'IN_TRANSIT') return 'wrong-status'
  if (isPrivileged(role)) return true
  if (!actorBranchId) return false
  if (actorBranchId === t.fromBranchId) return 'เฉพาะสาขาปลายทางเท่านั้นที่รับสินค้าได้'
  if (actorBranchId !== t.toBranchId) return 'เฉพาะสาขาปลายทางเท่านั้นที่รับสินค้าได้'
  return true
}

// Backend cancel permission
function canCancel(t: Transfer, actorBranchId: string | null, role: Role): boolean | string {
  const cancellable: TransferStatus[] = ['PENDING', 'APPROVED']
  if (!cancellable.includes(t.status)) return 'wrong-status'
  if (isPrivileged(role)) return true
  if (!actorBranchId) return false
  if (actorBranchId !== t.toBranchId) return 'เฉพาะสาขาที่ขอโอนเท่านั้นที่ยกเลิกได้'
  return true
}

// Frontend: isSource / isDest helpers for button visibility
function isSource(t: Transfer, branchId: string | null, isOwner: boolean): boolean {
  return isOwner || branchId === t.fromBranchId
}
function isDest(t: Transfer, branchId: string | null, isOwner: boolean): boolean {
  return isOwner || branchId === t.toBranchId
}

// Frontend: pending incoming requests for source banner
function pendingSourceCount(transfers: Transfer[], branchId: string | null): number {
  if (!branchId) return 0
  return transfers.filter(t => t.status === 'PENDING' && t.fromBranchId === branchId).length
}

// Notification deep link
function transferNotifRoute(entityId: string | null): string {
  return entityId ? `/transfers?highlight=${entityId}` : '/transfers'
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SOURCE_BRANCH = 'branch-source'
const DEST_BRANCH   = 'branch-dest'
const OTHER_BRANCH  = 'branch-other'

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id:           'tr-001',
    fromBranchId: SOURCE_BRANCH,
    toBranchId:   DEST_BRANCH,
    status:       'PENDING',
    quantity:     3,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Source branch can approve PENDING
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 1 — Source branch can approve PENDING', () => {
  const t = makeTransfer({ status: 'PENDING' })

  it('source MANAGER can approve', () => {
    expect(canApprove(t, SOURCE_BRANCH, 'MANAGER')).toBe(true)
  })

  it('source STOCK_STAFF can approve', () => {
    expect(canApprove(t, SOURCE_BRANCH, 'STOCK_STAFF')).toBe(true)
  })

  it('shows approve button for source branch in frontend', () => {
    expect(isSource(t, SOURCE_BRANCH, false)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Destination branch cannot approve
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 2 — Destination branch cannot approve', () => {
  const t = makeTransfer({ status: 'PENDING' })

  it('dest MANAGER gets forbidden message', () => {
    expect(canApprove(t, DEST_BRANCH, 'MANAGER')).toBe('เฉพาะสาขาต้นทางเท่านั้นที่อนุมัติได้')
  })

  it('other branch gets forbidden message', () => {
    expect(canApprove(t, OTHER_BRANCH, 'MANAGER')).toBe('เฉพาะสาขาต้นทางเท่านั้นที่อนุมัติได้')
  })

  it('dest is NOT source, so approve button hidden', () => {
    expect(isSource(t, DEST_BRANCH, false)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Source branch can dispatch APPROVED
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 3 — Source branch can dispatch APPROVED', () => {
  const t = makeTransfer({ status: 'APPROVED' })

  it('source MANAGER can dispatch', () => {
    expect(canDispatch(t, SOURCE_BRANCH, 'MANAGER')).toBe(true)
  })

  it('shows dispatch button for source branch', () => {
    expect(isSource(t, SOURCE_BRANCH, false)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Destination branch cannot dispatch
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 4 — Destination branch cannot dispatch', () => {
  const t = makeTransfer({ status: 'APPROVED' })

  it('dest gets forbidden message on dispatch', () => {
    expect(canDispatch(t, DEST_BRANCH, 'MANAGER')).toBe('เฉพาะสาขาต้นทางเท่านั้นที่จัดส่งได้')
  })

  it('dest is NOT source, dispatch button hidden', () => {
    expect(isSource(t, DEST_BRANCH, false)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Destination branch can receive IN_TRANSIT
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 5 — Destination branch can receive IN_TRANSIT', () => {
  const t = makeTransfer({ status: 'IN_TRANSIT' })

  it('dest MANAGER can receive', () => {
    expect(canReceive(t, DEST_BRANCH, 'MANAGER')).toBe(true)
  })

  it('dest STOCK_STAFF can receive', () => {
    expect(canReceive(t, DEST_BRANCH, 'STOCK_STAFF')).toBe(true)
  })

  it('shows receive button for dest branch in frontend', () => {
    expect(isDest(t, DEST_BRANCH, false) && !isSource(t, DEST_BRANCH, false)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Source branch cannot receive
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 6 — Source branch cannot receive', () => {
  const t = makeTransfer({ status: 'IN_TRANSIT' })

  it('source gets forbidden message on receive', () => {
    expect(canReceive(t, SOURCE_BRANCH, 'MANAGER')).toBe('เฉพาะสาขาปลายทางเท่านั้นที่รับสินค้าได้')
  })

  it('source branch is NOT dest, receive button hidden', () => {
    expect(isDest(t, SOURCE_BRANCH, false)).toBe(false)
  })

  it('source flagged explicitly (fromBranch === actorBranch)', () => {
    const result = canReceive(t, SOURCE_BRANCH, 'STOCK_STAFF')
    expect(result).toBe('เฉพาะสาขาปลายทางเท่านั้นที่รับสินค้าได้')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Stock moves only once (duplicate receive rejected)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 7 — Duplicate receive rejected by status check', () => {
  const received = makeTransfer({ status: 'RECEIVED' })

  it('RECEIVED transfer cannot be received again (wrong-status)', () => {
    expect(canReceive(received, DEST_BRANCH, 'MANAGER')).toBe('wrong-status')
  })

  it('RECEIVED is terminal — all actions return wrong-status', () => {
    expect(canApprove(received, SOURCE_BRANCH, 'MANAGER')).toBe('wrong-status')
    expect(canDispatch(received, SOURCE_BRANCH, 'MANAGER')).toBe('wrong-status')
    expect(canCancel(received, DEST_BRANCH, 'MANAGER')).toBe('wrong-status')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Transfer request creates notification for source branch
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 8 — Transfer request notification routes correctly', () => {
  it('notification type STOCK_TRANSFER_REQUESTED routes to /transfers?highlight=', () => {
    expect(transferNotifRoute('tr-001')).toBe('/transfers?highlight=tr-001')
  })

  it('notification without entityId routes to /transfers base', () => {
    expect(transferNotifRoute(null)).toBe('/transfers')
  })

  it('notification entityId = transferId used as highlight param', () => {
    const entityId = 'cmxyz123'
    expect(transferNotifRoute(entityId)).toContain(entityId)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Desktop incoming banner appears for source branch
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 9 — Desktop incoming banner logic', () => {
  const transfers: Transfer[] = [
    makeTransfer({ id: 'tr-1', fromBranchId: SOURCE_BRANCH, toBranchId: DEST_BRANCH, status: 'PENDING' }),
    makeTransfer({ id: 'tr-2', fromBranchId: SOURCE_BRANCH, toBranchId: DEST_BRANCH, status: 'PENDING' }),
    makeTransfer({ id: 'tr-3', fromBranchId: SOURCE_BRANCH, toBranchId: DEST_BRANCH, status: 'APPROVED' }),
    makeTransfer({ id: 'tr-4', fromBranchId: DEST_BRANCH,   toBranchId: SOURCE_BRANCH, status: 'IN_TRANSIT' }),
  ]

  it('source branch sees 2 PENDING requests to approve', () => {
    expect(pendingSourceCount(transfers, SOURCE_BRANCH)).toBe(2)
  })

  it('dest branch has 0 pending as source (none where dest is fromBranch + PENDING)', () => {
    expect(pendingSourceCount(transfers, DEST_BRANCH)).toBe(0)
  })

  it('other branch has 0 pending', () => {
    expect(pendingSourceCount(transfers, OTHER_BRANCH)).toBe(0)
  })

  it('null branchId returns 0', () => {
    expect(pendingSourceCount(transfers, null)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: OWNER bypass — can perform any action
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 10 — OWNER/SUPER_ADMIN bypass all branch restrictions', () => {
  const pending    = makeTransfer({ status: 'PENDING' })
  const approved   = makeTransfer({ status: 'APPROVED' })
  const inTransit  = makeTransfer({ status: 'IN_TRANSIT' })

  it('OWNER can approve regardless of branchId', () => {
    expect(canApprove(pending, OTHER_BRANCH, 'OWNER')).toBe(true)
    expect(canApprove(pending, null, 'OWNER')).toBe(true)
  })

  it('OWNER can dispatch regardless of branchId', () => {
    expect(canDispatch(approved, DEST_BRANCH, 'OWNER')).toBe(true)
  })

  it('OWNER can receive regardless of branchId (even from source)', () => {
    expect(canReceive(inTransit, SOURCE_BRANCH, 'OWNER')).toBe(true)
  })

  it('SUPER_ADMIN can receive', () => {
    expect(canReceive(inTransit, OTHER_BRANCH, 'SUPER_ADMIN')).toBe(true)
  })

  it('OWNER sees all action buttons (isSource + isDest both true)', () => {
    expect(isSource(pending, OTHER_BRANCH, true)).toBe(true)
    expect(isDest(pending, OTHER_BRANCH, true)).toBe(true)
  })

  it('OWNER cancel works on PENDING even from unrelated branch', () => {
    expect(canCancel(pending, OTHER_BRANCH, 'OWNER')).toBe(true)
  })
})
