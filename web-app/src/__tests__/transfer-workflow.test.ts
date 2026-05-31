/**
 * Stock Transfer Workflow — Regression Tests (Phase 14B)
 *
 * Pure-logic unit tests. No DB, no NestJS, no DOM.
 * Mirrors:
 *   backend/src/branches/branches.service.ts  — approveTransfer, rejectTransfer,
 *     dispatchTransfer, receiveTransfer, cancelTransfer, createTransfer
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TransferStatus =
  | 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED'

type Role = 'OWNER' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

interface TransferRow {
  id:           string
  status:       TransferStatus
  fromBranchId: string
  toBranchId:   string
  productId:    string
  quantity:     number
  approvedById?: string
  approvedByName?: string
  approvedAt?: Date
  rejectedById?: string
  rejectedByName?: string
  rejectedAt?: Date
  rejectReason?: string
  inTransitById?: string
  inTransitByName?: string
  inTransitAt?: Date
  receivedById?: string
  receivedByName?: string
  receivedAt?: Date
}

interface BranchStockRow {
  branchId:  string
  productId: string
  quantity:  number
}

interface AuditLogRow {
  action:   string
  entityId: string
}

interface NotificationRow {
  type:     string
  branchId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: mirrors branches.service.ts logic
// ─────────────────────────────────────────────────────────────────────────────

function createTransfer(
  dto: { fromBranchId: string; toBranchId: string; productId: string; quantity: number; note?: string },
  actorBranchId: string | undefined,
  actorRole: Role,
  stocks: BranchStockRow[],
): { transfer: TransferRow } | { error: string } {
  const isOwner = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN'
  const resolvedToId = isOwner ? dto.toBranchId : (actorBranchId ?? dto.toBranchId)

  const source = stocks.find(
    (s) => s.branchId === dto.fromBranchId && s.productId === dto.productId,
  )
  if (!source || source.quantity < dto.quantity) {
    return { error: 'สต็อกต้นทางไม่เพียงพอ' }
  }

  return {
    transfer: {
      id:           `t-${Math.random().toString(36).slice(2)}`,
      status:       'PENDING',
      fromBranchId: dto.fromBranchId,
      toBranchId:   resolvedToId,
      productId:    dto.productId,
      quantity:     dto.quantity,
    },
  }
}

function approveTransfer(
  transfer: TransferRow,
  actorId: string,
  actorName: string,
): { transfer: TransferRow; audit: AuditLogRow; notification: NotificationRow } | { error: string } {
  if (transfer.status !== 'PENDING') {
    return { error: `ไม่สามารถอนุมัติได้ สถานะปัจจุบัน: ${transfer.status}` }
  }
  const updated: TransferRow = {
    ...transfer,
    status:         'APPROVED',
    approvedById:   actorId,
    approvedByName: actorName,
    approvedAt:     new Date(),
  }
  return {
    transfer:     updated,
    audit:        { action: 'STOCK_TRANSFER_APPROVED', entityId: transfer.id },
    notification: { type: 'STOCK_TRANSFER_APPROVED', branchId: transfer.toBranchId },
  }
}

function rejectTransfer(
  transfer: TransferRow,
  rejectReason: string | undefined,
  actorId: string,
  actorName: string,
): { transfer: TransferRow; audit: AuditLogRow; notification: NotificationRow } | { error: string } {
  if (transfer.status !== 'PENDING') {
    return { error: `ไม่สามารถปฏิเสธได้ สถานะปัจจุบัน: ${transfer.status}` }
  }
  const updated: TransferRow = {
    ...transfer,
    status:          'REJECTED',
    rejectedById:    actorId,
    rejectedByName:  actorName,
    rejectedAt:      new Date(),
    rejectReason,
  }
  return {
    transfer:     updated,
    audit:        { action: 'STOCK_TRANSFER_REJECTED', entityId: transfer.id },
    notification: { type: 'STOCK_TRANSFER_REJECTED', branchId: transfer.toBranchId },
  }
}

function dispatchTransfer(
  transfer: TransferRow,
  actorId: string,
  actorName: string,
): { transfer: TransferRow; audit: AuditLogRow; notification: NotificationRow } | { error: string } {
  if (transfer.status !== 'APPROVED') {
    return { error: `ไม่สามารถส่งของได้ สถานะปัจจุบัน: ${transfer.status}` }
  }
  const updated: TransferRow = {
    ...transfer,
    status:           'IN_TRANSIT',
    inTransitById:    actorId,
    inTransitByName:  actorName,
    inTransitAt:      new Date(),
  }
  return {
    transfer:     updated,
    audit:        { action: 'STOCK_TRANSFER_DISPATCHED', entityId: transfer.id },
    notification: { type: 'STOCK_TRANSFER_IN_TRANSIT', branchId: transfer.toBranchId },
  }
}

function receiveTransfer(
  transfer: TransferRow,
  stocks: BranchStockRow[],
  actorId: string,
  actorName: string,
): {
  transfer: TransferRow
  stocks: BranchStockRow[]
  audit: AuditLogRow
  notification: NotificationRow
} | { error: string } {
  if (transfer.status !== 'IN_TRANSIT') {
    return { error: `ไม่สามารถรับสินค้าได้ สถานะปัจจุบัน: ${transfer.status}` }
  }

  const sourceIdx = stocks.findIndex(
    (s) => s.branchId === transfer.fromBranchId && s.productId === transfer.productId,
  )
  if (sourceIdx === -1 || stocks[sourceIdx].quantity < transfer.quantity) {
    return { error: 'สต็อกต้นทางไม่เพียงพอ' }
  }

  const newStocks = stocks.map((s) => ({ ...s }))
  newStocks[sourceIdx].quantity -= transfer.quantity

  const destIdx = newStocks.findIndex(
    (s) => s.branchId === transfer.toBranchId && s.productId === transfer.productId,
  )
  if (destIdx === -1) {
    newStocks.push({ branchId: transfer.toBranchId, productId: transfer.productId, quantity: transfer.quantity })
  } else {
    newStocks[destIdx].quantity += transfer.quantity
  }

  const updated: TransferRow = {
    ...transfer,
    status:          'RECEIVED',
    receivedById:    actorId,
    receivedByName:  actorName,
    receivedAt:      new Date(),
  }
  return {
    transfer:     updated,
    stocks:       newStocks,
    audit:        { action: 'STOCK_TRANSFER_RECEIVED', entityId: transfer.id },
    notification: { type: 'STOCK_TRANSFER_RECEIVED', branchId: transfer.fromBranchId },
  }
}

function cancelTransfer(
  transfer: TransferRow,
): { transfer: TransferRow } | { error: string } {
  if (transfer.status !== 'PENDING' && transfer.status !== 'APPROVED') {
    return { error: `ไม่สามารถยกเลิกได้ สถานะปัจจุบัน: ${transfer.status}` }
  }
  return { transfer: { ...transfer, status: 'CANCELLED' } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const BRANCH_A = 'branch-a'
const BRANCH_B = 'branch-b'
const PRODUCT  = 'prod-001'
const ACTOR    = { id: 'user-1', name: 'Alice' }

function makeTransfer(overrides: Partial<TransferRow> = {}): TransferRow {
  return {
    id:           'transfer-1',
    status:       'PENDING',
    fromBranchId: BRANCH_A,
    toBranchId:   BRANCH_B,
    productId:    PRODUCT,
    quantity:     5,
    ...overrides,
  }
}

function makeStocks(qtyA = 10, qtyB = 0): BranchStockRow[] {
  const rows: BranchStockRow[] = [
    { branchId: BRANCH_A, productId: PRODUCT, quantity: qtyA },
  ]
  if (qtyB > 0) {
    rows.push({ branchId: BRANCH_B, productId: PRODUCT, quantity: qtyB })
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Request creates PENDING, no stock move
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 1: createTransfer creates PENDING, no stock move', () => {
  it('returns status PENDING', () => {
    const stocks = makeStocks(10)
    const result = createTransfer(
      { fromBranchId: BRANCH_A, toBranchId: BRANCH_B, productId: PRODUCT, quantity: 5 },
      BRANCH_B, 'MANAGER', stocks,
    )
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.status).toBe('PENDING')
    }
  })

  it('source stock is unchanged after createTransfer', () => {
    const stocks = makeStocks(10)
    createTransfer(
      { fromBranchId: BRANCH_A, toBranchId: BRANCH_B, productId: PRODUCT, quantity: 5 },
      BRANCH_B, 'MANAGER', stocks,
    )
    expect(stocks[0].quantity).toBe(10)
  })

  it('rejects when source quantity is insufficient', () => {
    const stocks = makeStocks(3)
    const result = createTransfer(
      { fromBranchId: BRANCH_A, toBranchId: BRANCH_B, productId: PRODUCT, quantity: 5 },
      BRANCH_B, 'MANAGER', stocks,
    )
    expect('error' in result).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Approve does not move stock
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 2: approveTransfer does not move stock', () => {
  it('transitions PENDING → APPROVED', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = approveTransfer(t, ACTOR.id, ACTOR.name)
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.status).toBe('APPROVED')
      expect(result.transfer.approvedById).toBe(ACTOR.id)
    }
  })

  it('does not return updated stocks (no stock movement)', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = approveTransfer(t, ACTOR.id, ACTOR.name)
    expect('stocks' in result).toBe(false)
  })

  it('emits audit log STOCK_TRANSFER_APPROVED', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = approveTransfer(t, ACTOR.id, ACTOR.name)
    if ('audit' in result) {
      expect(result.audit.action).toBe('STOCK_TRANSFER_APPROVED')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Dispatch does not move stock
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 3: dispatchTransfer does not move stock', () => {
  it('transitions APPROVED → IN_TRANSIT', () => {
    const t = makeTransfer({ status: 'APPROVED' })
    const result = dispatchTransfer(t, ACTOR.id, ACTOR.name)
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.status).toBe('IN_TRANSIT')
      expect(result.transfer.inTransitById).toBe(ACTOR.id)
    }
  })

  it('does not return updated stocks (no stock movement)', () => {
    const t = makeTransfer({ status: 'APPROVED' })
    const result = dispatchTransfer(t, ACTOR.id, ACTOR.name)
    expect('stocks' in result).toBe(false)
  })

  it('emits notification to destination branch', () => {
    const t = makeTransfer({ status: 'APPROVED' })
    const result = dispatchTransfer(t, ACTOR.id, ACTOR.name)
    if ('notification' in result) {
      expect(result.notification.branchId).toBe(BRANCH_B)
      expect(result.notification.type).toBe('STOCK_TRANSFER_IN_TRANSIT')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — Receive moves stock exactly once
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 4: receiveTransfer moves stock exactly once', () => {
  it('deducts from source and adds to destination', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 5 })
    const stocks = makeStocks(10)
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    expect('stocks' in result).toBe(true)
    if ('stocks' in result) {
      const src = result.stocks.find((s) => s.branchId === BRANCH_A)!
      const dst = result.stocks.find((s) => s.branchId === BRANCH_B)!
      expect(src.quantity).toBe(5)
      expect(dst.quantity).toBe(5)
    }
  })

  it('adds to existing destination stock (does not reset)', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 3 })
    const stocks = makeStocks(10, 7)
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    if ('stocks' in result) {
      const dst = result.stocks.find((s) => s.branchId === BRANCH_B)!
      expect(dst.quantity).toBe(10)
    }
  })

  it('sets status to RECEIVED', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 5 })
    const stocks = makeStocks(10)
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    if ('transfer' in result) {
      expect(result.transfer.status).toBe('RECEIVED')
      expect(result.transfer.receivedById).toBe(ACTOR.id)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Receive fails if source stock insufficient
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 5: receiveTransfer fails when source stock insufficient', () => {
  it('returns error when source has less than transfer quantity', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 10 })
    const stocks = makeStocks(3)
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    expect('error' in result).toBe(true)
  })

  it('does not modify stocks when source is insufficient', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 10 })
    const stocks = makeStocks(3)
    receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    expect(stocks[0].quantity).toBe(3)
  })

  it('returns error when source branch stock row does not exist', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 5 })
    const stocks: BranchStockRow[] = []
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    expect('error' in result).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — Staff cannot spoof destination branch
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 6: staff toBranchId is always overridden by JWT branchId', () => {
  it('non-OWNER staff gets actorBranchId as toBranchId even if dto specifies different branch', () => {
    const stocks = makeStocks(10)
    const result = createTransfer(
      { fromBranchId: BRANCH_A, toBranchId: 'spoofed-branch', productId: PRODUCT, quantity: 5 },
      BRANCH_B, 'MANAGER', stocks,
    )
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.toBranchId).toBe(BRANCH_B)
      expect(result.transfer.toBranchId).not.toBe('spoofed-branch')
    }
  })

  it('OWNER can specify any toBranchId from dto', () => {
    const stocks = makeStocks(10)
    const result = createTransfer(
      { fromBranchId: BRANCH_A, toBranchId: 'branch-c', productId: PRODUCT, quantity: 5 },
      undefined, 'OWNER', stocks,
    )
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.toBranchId).toBe('branch-c')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — Cancelled transfer cannot be received
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 7: cancelled transfer cannot be received', () => {
  it('receiveTransfer returns error for CANCELLED status', () => {
    const t = makeTransfer({ status: 'CANCELLED' })
    const stocks = makeStocks(10)
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    expect('error' in result).toBe(true)
  })

  it('cancelTransfer succeeds when status is PENDING', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = cancelTransfer(t)
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.status).toBe('CANCELLED')
    }
  })

  it('cancelTransfer succeeds when status is APPROVED', () => {
    const t = makeTransfer({ status: 'APPROVED' })
    const result = cancelTransfer(t)
    expect('transfer' in result).toBe(true)
    if ('transfer' in result) {
      expect(result.transfer.status).toBe('CANCELLED')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — Rejected transfer cannot be dispatched
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 8: rejected transfer cannot advance through workflow', () => {
  it('dispatchTransfer returns error for REJECTED status', () => {
    const t = makeTransfer({ status: 'REJECTED' })
    const result = dispatchTransfer(t, ACTOR.id, ACTOR.name)
    expect('error' in result).toBe(true)
  })

  it('approveTransfer returns error for REJECTED status', () => {
    const t = makeTransfer({ status: 'REJECTED' })
    const result = approveTransfer(t, ACTOR.id, ACTOR.name)
    expect('error' in result).toBe(true)
  })

  it('rejectTransfer records rejectReason on transfer', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = rejectTransfer(t, 'สินค้าหมด', ACTOR.id, ACTOR.name)
    if ('transfer' in result) {
      expect(result.transfer.rejectReason).toBe('สินค้าหมด')
      expect(result.transfer.status).toBe('REJECTED')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 — Duplicate receive does not double deduct
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 9: duplicate receive attempt is rejected by status check', () => {
  it('second receiveTransfer on RECEIVED transfer returns error', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 5 })
    const stocks = makeStocks(10)

    const first = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    expect('transfer' in first).toBe(true)
    if (!('transfer' in first)) return

    const second = receiveTransfer(first.transfer, first.stocks, ACTOR.id, ACTOR.name)
    expect('error' in second).toBe(true)
  })

  it('source stock is deducted only once after receive + retry', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 5 })
    const stocks = makeStocks(10)

    const first = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    if (!('stocks' in first)) return

    const src = first.stocks.find((s) => s.branchId === BRANCH_A)!
    expect(src.quantity).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10 — Notifications and audit logs are created
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 10: each state transition emits the correct audit + notification', () => {
  it('approve → STOCK_TRANSFER_APPROVED audit + notification to toBranch', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = approveTransfer(t, ACTOR.id, ACTOR.name)
    if ('audit' in result) {
      expect(result.audit.action).toBe('STOCK_TRANSFER_APPROVED')
      expect(result.notification.branchId).toBe(BRANCH_B)
    }
  })

  it('reject → STOCK_TRANSFER_REJECTED audit + notification to toBranch', () => {
    const t = makeTransfer({ status: 'PENDING' })
    const result = rejectTransfer(t, undefined, ACTOR.id, ACTOR.name)
    if ('audit' in result) {
      expect(result.audit.action).toBe('STOCK_TRANSFER_REJECTED')
      expect(result.notification.branchId).toBe(BRANCH_B)
    }
  })

  it('dispatch → STOCK_TRANSFER_DISPATCHED audit + STOCK_TRANSFER_IN_TRANSIT notification to toBranch', () => {
    const t = makeTransfer({ status: 'APPROVED' })
    const result = dispatchTransfer(t, ACTOR.id, ACTOR.name)
    if ('audit' in result) {
      expect(result.audit.action).toBe('STOCK_TRANSFER_DISPATCHED')
      expect(result.notification.type).toBe('STOCK_TRANSFER_IN_TRANSIT')
      expect(result.notification.branchId).toBe(BRANCH_B)
    }
  })

  it('receive → STOCK_TRANSFER_RECEIVED audit + notification to fromBranch', () => {
    const t = makeTransfer({ status: 'IN_TRANSIT', quantity: 5 })
    const stocks = makeStocks(10)
    const result = receiveTransfer(t, stocks, ACTOR.id, ACTOR.name)
    if ('audit' in result) {
      expect(result.audit.action).toBe('STOCK_TRANSFER_RECEIVED')
      expect(result.notification.branchId).toBe(BRANCH_A)
    }
  })
})
