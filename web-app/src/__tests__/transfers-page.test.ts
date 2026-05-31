/**
 * Desktop Transfers Page — Logic Tests
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Covers: permission gate, branch scoping, action availability per status,
 * filter tab logic, notification deep-link routing.
 */

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'
type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED'

interface StockTransfer {
  id: string
  transferNumber: string
  fromBranchId: string
  toBranchId: string
  productId: string
  quantity: number
  status: TransferStatus
  note?: string | null
  rejectReason?: string | null
  cancelReason?: string | null
  requestedByName?: string | null
  createdAt: string
  fromBranch?: { id: string; name: string }
  toBranch?:   { id: string; name: string }
  product?:    { id: string; name: string; sku: string }
}

// ── Logic mirrors ─────────────────────────────────────────────────────────────

function hasPermission(role: Role, dbPermissions: string[], permission: string): boolean {
  if (role === 'OWNER' || role === 'SUPER_ADMIN') return true
  return dbPermissions.includes(permission)
}

function canAccessTransfersPage(role: Role, dbPermissions: string[]): boolean {
  return hasPermission(role, dbPermissions, 'stock.transfer')
}

function buildTransferQueryParams(
  filter: string,
  isOwner: boolean,
  branchId: string | null | undefined,
): Record<string, string> {
  const params: Record<string, string> = {}
  if (filter !== 'ALL') params.status = filter
  if (!isOwner && branchId) params.branchId = branchId
  return params
}

function canApprove(t: StockTransfer): boolean  { return t.status === 'PENDING' }
function canReject(t: StockTransfer): boolean   { return t.status === 'PENDING' }
function canCancel(t: StockTransfer): boolean   { return t.status === 'PENDING' || t.status === 'APPROVED' }
function canDispatch(t: StockTransfer): boolean { return t.status === 'APPROVED' }
function canReceive(t: StockTransfer): boolean  { return t.status === 'IN_TRANSIT' }

function isTerminal(t: StockTransfer): boolean {
  return ['RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(t.status)
}

const TRANSFER_NOTIFICATION_TYPES = new Set([
  'STOCK_TRANSFER_PENDING',
  'STOCK_TRANSFER_APPROVED',
  'STOCK_TRANSFER_REJECTED',
  'STOCK_TRANSFER_IN_TRANSIT',
  'STOCK_TRANSFER_RECEIVED',
])

function isTransferNotification(type: string): boolean {
  return TRANSFER_NOTIFICATION_TYPES.has(type)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BRANCH_A = 'branch-a'
const BRANCH_B = 'branch-b'

function makeTransfer(overrides: Partial<StockTransfer> = {}): StockTransfer {
  return {
    id:              'tr-1',
    transferNumber:  'TRF-0001',
    fromBranchId:    BRANCH_A,
    toBranchId:      BRANCH_B,
    productId:       'prod-1',
    quantity:        5,
    status:          'PENDING',
    createdAt:       '2026-05-30T10:00:00.000Z',
    fromBranch:      { id: BRANCH_A, name: 'สาขา A' },
    toBranch:        { id: BRANCH_B, name: 'สาขา B' },
    product:         { id: 'prod-1', name: 'iPhone 15', sku: 'IP15-001' },
    ...overrides,
  }
}

// ── 1. Permission gate ────────────────────────────────────────────────────────

describe('Page access: canAccessTransfersPage', () => {
  it('OWNER always has access', () => {
    expect(canAccessTransfersPage('OWNER', [])).toBe(true)
  })

  it('SUPER_ADMIN always has access', () => {
    expect(canAccessTransfersPage('SUPER_ADMIN', [])).toBe(true)
  })

  it('MANAGER with stock.transfer in DB has access', () => {
    expect(canAccessTransfersPage('MANAGER', ['stock.transfer'])).toBe(true)
  })

  it('STOCK_STAFF with stock.transfer in DB has access', () => {
    expect(canAccessTransfersPage('STOCK_STAFF', ['stock.transfer'])).toBe(true)
  })

  it('CASHIER without stock.transfer is blocked', () => {
    expect(canAccessTransfersPage('CASHIER', [])).toBe(false)
  })

  it('TECHNICIAN without stock.transfer is blocked', () => {
    expect(canAccessTransfersPage('TECHNICIAN', [])).toBe(false)
  })

  it('MANAGER without stock.transfer in DB is blocked (no role fallback on page access)', () => {
    expect(canAccessTransfersPage('MANAGER', [])).toBe(false)
  })
})

// ── 2. Branch scoping ─────────────────────────────────────────────────────────

describe('Branch scoping in query params', () => {
  it('OWNER sees all — no branchId param', () => {
    const params = buildTransferQueryParams('ALL', true, BRANCH_A)
    expect(params.branchId).toBeUndefined()
  })

  it('MANAGER sees own branch — branchId param set', () => {
    const params = buildTransferQueryParams('ALL', false, BRANCH_A)
    expect(params.branchId).toBe(BRANCH_A)
  })

  it('STOCK_STAFF sees own branch — branchId param set', () => {
    const params = buildTransferQueryParams('ALL', false, BRANCH_B)
    expect(params.branchId).toBe(BRANCH_B)
  })

  it('no branchId on user — no branchId param even for non-owner', () => {
    const params = buildTransferQueryParams('ALL', false, null)
    expect(params.branchId).toBeUndefined()
  })

  it('status filter applied when not ALL', () => {
    const params = buildTransferQueryParams('PENDING', false, BRANCH_A)
    expect(params.status).toBe('PENDING')
    expect(params.branchId).toBe(BRANCH_A)
  })

  it('no status param when filter is ALL', () => {
    const params = buildTransferQueryParams('ALL', false, BRANCH_A)
    expect(params.status).toBeUndefined()
  })
})

// ── 3. Action availability per status ────────────────────────────────────────

describe('Action buttons: PENDING transfer', () => {
  const t = makeTransfer({ status: 'PENDING' })

  it('can approve', ()  => expect(canApprove(t)).toBe(true))
  it('can reject', ()   => expect(canReject(t)).toBe(true))
  it('can cancel', ()   => expect(canCancel(t)).toBe(true))
  it('cannot dispatch', () => expect(canDispatch(t)).toBe(false))
  it('cannot receive',  () => expect(canReceive(t)).toBe(false))
  it('is not terminal', () => expect(isTerminal(t)).toBe(false))
})

describe('Action buttons: APPROVED transfer', () => {
  const t = makeTransfer({ status: 'APPROVED' })

  it('cannot approve', ()  => expect(canApprove(t)).toBe(false))
  it('cannot reject',  ()  => expect(canReject(t)).toBe(false))
  it('can cancel',     ()  => expect(canCancel(t)).toBe(true))
  it('can dispatch',   ()  => expect(canDispatch(t)).toBe(true))
  it('cannot receive', ()  => expect(canReceive(t)).toBe(false))
})

describe('Action buttons: IN_TRANSIT transfer', () => {
  const t = makeTransfer({ status: 'IN_TRANSIT' })

  it('cannot approve',  () => expect(canApprove(t)).toBe(false))
  it('cannot dispatch', () => expect(canDispatch(t)).toBe(false))
  it('cannot cancel',   () => expect(canCancel(t)).toBe(false))
  it('can receive',     () => expect(canReceive(t)).toBe(true))
})

describe('Action buttons: terminal statuses (view-only)', () => {
  const statuses: TransferStatus[] = ['RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED']

  for (const status of statuses) {
    it(`${status}: is terminal`, () => {
      expect(isTerminal(makeTransfer({ status }))).toBe(true)
    })

    it(`${status}: no actions available`, () => {
      const t = makeTransfer({ status })
      expect(canApprove(t) || canReject(t) || canCancel(t) || canDispatch(t) || canReceive(t)).toBe(false)
    })
  }
})

// ── 4. Notification deep-link routing ────────────────────────────────────────

describe('Notification deep-link: transfer types route to /transfers', () => {
  it('STOCK_TRANSFER_PENDING is a transfer notification', () => {
    expect(isTransferNotification('STOCK_TRANSFER_PENDING')).toBe(true)
  })

  it('STOCK_TRANSFER_APPROVED is a transfer notification', () => {
    expect(isTransferNotification('STOCK_TRANSFER_APPROVED')).toBe(true)
  })

  it('STOCK_TRANSFER_REJECTED is a transfer notification', () => {
    expect(isTransferNotification('STOCK_TRANSFER_REJECTED')).toBe(true)
  })

  it('STOCK_TRANSFER_IN_TRANSIT is a transfer notification', () => {
    expect(isTransferNotification('STOCK_TRANSFER_IN_TRANSIT')).toBe(true)
  })

  it('STOCK_TRANSFER_RECEIVED is a transfer notification', () => {
    expect(isTransferNotification('STOCK_TRANSFER_RECEIVED')).toBe(true)
  })

  it('LOW_STOCK is NOT a transfer notification', () => {
    expect(isTransferNotification('LOW_STOCK')).toBe(false)
  })

  it('OVERDUE_REPAIR is NOT a transfer notification', () => {
    expect(isTransferNotification('OVERDUE_REPAIR')).toBe(false)
  })

  it('ROLE_PERMISSION_CHANGED is NOT a transfer notification', () => {
    expect(isTransferNotification('ROLE_PERMISSION_CHANGED')).toBe(false)
  })
})
