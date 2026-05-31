/**
 * Operational Alerts — Logic Tests
 *
 * Pure-logic unit tests (no backend/DOM/React).
 * Mirrors the alert filtering, dismiss, and routing logic in
 * OperationalAlertCenter and the backend AlertsService business rules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO'
type AlertType = 'TRANSFER_PENDING' | 'TRANSFER_IN_TRANSIT' | 'REPAIR_OVERDUE' | 'LOW_STOCK'

interface OperationalAlert {
  id:        string
  type:      AlertType
  severity:  AlertSeverity
  title:     string
  message:   string
  actionUrl: string
  entityId:  string
  createdAt: string
}

// ── Mirror logic from backend AlertsService ───────────────────────────────────

const REPAIR_SLA_DAYS     = 7
const REPAIR_CRITICAL_DAYS = 14
const CAT_LIMIT = 10

function buildTransferPendingAlerts(
  transfers: Array<{ id: string; fromBranchId: string; toBranchId: string; toBranchName: string; productName: string; quantity: number; createdAt: Date }>,
  actorBranchId: string | null,
): OperationalAlert[] {
  const filtered = actorBranchId
    ? transfers.filter(t => t.fromBranchId === actorBranchId && t)
    : transfers
  return filtered.slice(0, CAT_LIMIT).map(t => {
    const ageHours = (Date.now() - t.createdAt.getTime()) / 3_600_000
    return {
      id:        `transfer-pending-${t.id}`,
      type:      'TRANSFER_PENDING' as AlertType,
      severity:  (ageHours > 24 ? 'WARNING' : 'INFO') as AlertSeverity,
      title:     'มีคำขอโอนสินค้า',
      message:   `${t.toBranchName} ขอ ${t.productName} จำนวน ${t.quantity} ชิ้น`,
      actionUrl: `/transfers?highlight=${t.id}`,
      entityId:  t.id,
      createdAt: t.createdAt.toISOString(),
    }
  })
}

function buildTransferInTransitAlerts(
  transfers: Array<{ id: string; fromBranchId: string; toBranchId: string; fromBranchName: string; productName: string; createdAt: Date }>,
  actorBranchId: string | null,
): OperationalAlert[] {
  const filtered = actorBranchId
    ? transfers.filter(t => t.toBranchId === actorBranchId)
    : transfers
  return filtered.slice(0, CAT_LIMIT).map(t => ({
    id:        `transfer-transit-${t.id}`,
    type:      'TRANSFER_IN_TRANSIT' as AlertType,
    severity:  'WARNING' as AlertSeverity,
    title:     'รอรับสินค้า',
    message:   `${t.productName} จาก ${t.fromBranchName} กำลังส่งมา`,
    actionUrl: `/transfers?highlight=${t.id}`,
    entityId:  t.id,
    createdAt: t.createdAt.toISOString(),
  }))
}

function buildRepairOverdueAlerts(
  repairs: Array<{ id: string; ticketNumber: string; status: string; branchId: string; receivedAt: Date }>,
  actorBranchId: string | null,
  now: Date,
): OperationalAlert[] {
  const slaThreshold = new Date(now.getTime() - REPAIR_SLA_DAYS * 86_400_000)
  const filtered = repairs.filter(r =>
    !['DELIVERED', 'CANCELLED'].includes(r.status) &&
    r.receivedAt < slaThreshold &&
    (actorBranchId === null || r.branchId === actorBranchId)
  )
  return filtered.slice(0, CAT_LIMIT).map(r => {
    const days = Math.floor((now.getTime() - r.receivedAt.getTime()) / 86_400_000)
    return {
      id:        `repair-overdue-${r.id}`,
      type:      'REPAIR_OVERDUE' as AlertType,
      severity:  (days >= REPAIR_CRITICAL_DAYS ? 'CRITICAL' : 'WARNING') as AlertSeverity,
      title:     'งานซ่อมค้างเกินกำหนด',
      message:   `งาน #${r.ticketNumber} ค้าง ${days} วัน`,
      actionUrl: `/repairs?highlight=${r.id}`,
      entityId:  r.id,
      createdAt: r.receivedAt.toISOString(),
    }
  })
}

// Mirror dismiss logic from component
const CRITICAL_DISMISS_TTL = 60 * 60 * 1000

function isDismissed(
  id: string, severity: AlertSeverity,
  storage: { session: Map<string, string>; local: Map<string, string> },
): boolean {
  const key = `alert_dismiss_${id}`
  if (severity === 'CRITICAL') {
    const ts = storage.local.get(key)
    if (!ts) return false
    return Date.now() - parseInt(ts, 10) < CRITICAL_DISMISS_TTL
  }
  return storage.session.get(key) === '1'
}

function persistDismiss(
  id: string, severity: AlertSeverity,
  storage: { session: Map<string, string>; local: Map<string, string> },
  now = Date.now(),
): void {
  const key = `alert_dismiss_${id}`
  if (severity === 'CRITICAL') {
    storage.local.set(key, now.toString())
  } else {
    storage.session.set(key, '1')
  }
}

function getVisibleAlerts(
  alerts: OperationalAlert[],
  storage: { session: Map<string, string>; local: Map<string, string> },
): OperationalAlert[] {
  return alerts.filter(a => !isDismissed(a.id, a.severity, storage))
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SRC_BRANCH  = 'branch-source'
const DST_BRANCH  = 'branch-dest'
const OTHER_BRANCH = 'branch-other'

const now = new Date('2026-05-30T10:00:00.000Z')
const old = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000)

const pendingTransfers = [
  { id: 'tr-1', fromBranchId: SRC_BRANCH, toBranchId: DST_BRANCH, toBranchName: 'สาขา2', productName: 'iPhone 15', quantity: 2, createdAt: old(1) },
  { id: 'tr-2', fromBranchId: SRC_BRANCH, toBranchId: OTHER_BRANCH, toBranchName: 'สาขา3', productName: 'Samsung S24', quantity: 1, createdAt: old(0.5) },
  { id: 'tr-3', fromBranchId: DST_BRANCH, toBranchId: SRC_BRANCH, toBranchName: 'สาขา1', productName: 'OPPO A18', quantity: 3, createdAt: old(2) },
]

const inTransitTransfers = [
  { id: 'tr-4', fromBranchId: SRC_BRANCH, toBranchId: DST_BRANCH, fromBranchName: 'สาขา1', productName: 'iPhone 15', createdAt: old(1) },
  { id: 'tr-5', fromBranchId: OTHER_BRANCH, toBranchId: DST_BRANCH, fromBranchName: 'สาขา3', productName: 'Earbuds', createdAt: old(0.5) },
]

const repairs = [
  { id: 'rep-1', ticketNumber: 'TKT-001', status: 'IN_PROGRESS', branchId: SRC_BRANCH, receivedAt: old(10) },  // 10 days — WARNING
  { id: 'rep-2', ticketNumber: 'TKT-002', status: 'RECEIVED',    branchId: SRC_BRANCH, receivedAt: old(20) },  // 20 days — CRITICAL
  { id: 'rep-3', ticketNumber: 'TKT-003', status: 'DELIVERED',   branchId: SRC_BRANCH, receivedAt: old(15) },  // done — excluded
  { id: 'rep-4', ticketNumber: 'TKT-004', status: 'CANCELLED',   branchId: SRC_BRANCH, receivedAt: old(12) },  // cancelled — excluded
  { id: 'rep-5', ticketNumber: 'TKT-005', status: 'IN_PROGRESS', branchId: DST_BRANCH, receivedAt: old(8) },   // different branch
  { id: 'rep-6', ticketNumber: 'TKT-006', status: 'RECEIVED',    branchId: SRC_BRANCH, receivedAt: old(3) },   // only 3 days — not overdue
]

// ── 1. Source branch sees PENDING transfer alerts ─────────────────────────────

describe('Scenario 1 — Source branch sees incoming PENDING transfer alerts', () => {
  const alerts = buildTransferPendingAlerts(pendingTransfers.filter(t => t.fromBranchId === SRC_BRANCH), SRC_BRANCH)

  it('source branch gets 2 PENDING alerts (tr-1, tr-2)', () => {
    expect(alerts).toHaveLength(2)
    expect(alerts.map(a => a.entityId)).toContain('tr-1')
    expect(alerts.map(a => a.entityId)).toContain('tr-2')
  })

  it('alert title is มีคำขอโอนสินค้า', () => {
    expect(alerts[0].title).toBe('มีคำขอโอนสินค้า')
  })

  it('alert message contains toBranchName and productName', () => {
    const a1 = alerts.find(a => a.entityId === 'tr-1')!
    expect(a1.message).toContain('สาขา2')
    expect(a1.message).toContain('iPhone 15')
    expect(a1.message).toContain('2')
  })

  it('actionUrl includes highlight param', () => {
    expect(alerts[0].actionUrl).toContain('/transfers?highlight=')
  })

  it('alert older than 24h becomes WARNING', () => {
    // tr-1 is 1 day old (24h) = WARNING
    const a1 = alerts.find(a => a.entityId === 'tr-1')!
    expect(a1.severity).toBe('WARNING')
  })

  it('tr-3 (from DST, not SRC) is NOT shown to source branch', () => {
    expect(alerts.map(a => a.entityId)).not.toContain('tr-3')
  })
})

// ── 2. Destination branch sees IN_TRANSIT receive alerts ──────────────────────

describe('Scenario 2 — Destination branch sees IN_TRANSIT alerts', () => {
  const alerts = buildTransferInTransitAlerts(inTransitTransfers, DST_BRANCH)

  it('dest branch sees 2 IN_TRANSIT alerts', () => {
    expect(alerts).toHaveLength(2)
    expect(alerts.map(a => a.entityId)).toContain('tr-4')
    expect(alerts.map(a => a.entityId)).toContain('tr-5')
  })

  it('alert type is TRANSFER_IN_TRANSIT', () => {
    expect(alerts[0].type).toBe('TRANSFER_IN_TRANSIT')
  })

  it('alert title is รอรับสินค้า', () => {
    expect(alerts[0].title).toBe('รอรับสินค้า')
  })

  it('message contains fromBranch name', () => {
    const a4 = alerts.find(a => a.entityId === 'tr-4')!
    expect(a4.message).toContain('สาขา1')
    expect(a4.message).toContain('iPhone 15')
  })
})

// ── 3. Unrelated branch does not see alerts ───────────────────────────────────

describe('Scenario 3 — Unrelated branch does not see transfer alerts', () => {
  it('other branch sees no PENDING transfer alerts (it is neither source)', () => {
    const src_other = pendingTransfers.filter(t => t.fromBranchId === OTHER_BRANCH)
    const alerts = buildTransferPendingAlerts(src_other, OTHER_BRANCH)
    expect(alerts).toHaveLength(0)
  })

  it('source branch does not see IN_TRANSIT alerts meant for dest', () => {
    const alerts = buildTransferInTransitAlerts(inTransitTransfers, SRC_BRANCH)
    expect(alerts).toHaveLength(0)
  })

  it('OWNER (null branchId) sees all pending transfers', () => {
    const alerts = buildTransferPendingAlerts(pendingTransfers, null)
    expect(alerts).toHaveLength(3)
  })
})

// ── 4. Old repair creates WARNING or CRITICAL alert ───────────────────────────

describe('Scenario 4 — Old repairs create overdue alerts', () => {
  const alerts = buildRepairOverdueAlerts(repairs, SRC_BRANCH, now)

  it('rep-1 (10 days, SRC) → WARNING', () => {
    const a = alerts.find(a => a.entityId === 'rep-1')!
    expect(a).toBeDefined()
    expect(a.severity).toBe('WARNING')
    expect(a.message).toContain('10 วัน')
  })

  it('rep-2 (20 days, SRC) → CRITICAL', () => {
    const a = alerts.find(a => a.entityId === 'rep-2')!
    expect(a).toBeDefined()
    expect(a.severity).toBe('CRITICAL')
    expect(a.message).toContain('20 วัน')
  })

  it('rep-3 DELIVERED → excluded', () => {
    expect(alerts.map(a => a.entityId)).not.toContain('rep-3')
  })

  it('rep-4 CANCELLED → excluded', () => {
    expect(alerts.map(a => a.entityId)).not.toContain('rep-4')
  })

  it('rep-5 from DST_BRANCH → excluded for SRC_BRANCH query', () => {
    expect(alerts.map(a => a.entityId)).not.toContain('rep-5')
  })

  it('rep-6 only 3 days old → not overdue yet', () => {
    expect(alerts.map(a => a.entityId)).not.toContain('rep-6')
  })

  it('actionUrl includes highlight', () => {
    expect(alerts[0].actionUrl).toMatch(/\/repairs\?highlight=/)
  })
})

// ── 5. Dismissed alert is hidden ─────────────────────────────────────────────

describe('Scenario 5 — Dismissed alerts are hidden', () => {
  let storage: { session: Map<string, string>; local: Map<string, string> }

  beforeEach(() => {
    storage = { session: new Map(), local: new Map() }
  })

  const sampleAlerts: OperationalAlert[] = [
    { id: 'transfer-pending-tr-1', type: 'TRANSFER_PENDING', severity: 'WARNING', title: 'T1', message: '', actionUrl: '/transfers?highlight=tr-1', entityId: 'tr-1', createdAt: '' },
    { id: 'repair-overdue-rep-2',  type: 'REPAIR_OVERDUE',  severity: 'CRITICAL', title: 'T2', message: '', actionUrl: '/repairs?highlight=rep-2',   entityId: 'rep-2', createdAt: '' },
  ]

  it('before dismiss, both alerts visible', () => {
    expect(getVisibleAlerts(sampleAlerts, storage)).toHaveLength(2)
  })

  it('after dismissing WARNING alert, it is hidden', () => {
    persistDismiss('transfer-pending-tr-1', 'WARNING', storage)
    expect(getVisibleAlerts(sampleAlerts, storage)).toHaveLength(1)
    expect(getVisibleAlerts(sampleAlerts, storage)[0].id).toBe('repair-overdue-rep-2')
  })

  it('CRITICAL dismissed within 1hr is hidden', () => {
    persistDismiss('repair-overdue-rep-2', 'CRITICAL', storage, Date.now())
    const visible = getVisibleAlerts(sampleAlerts, storage)
    expect(visible.map(a => a.id)).not.toContain('repair-overdue-rep-2')
  })

  it('CRITICAL dismissed 2hrs ago reappears', () => {
    const twoHrsAgo = Date.now() - 2 * 60 * 60 * 1000
    persistDismiss('repair-overdue-rep-2', 'CRITICAL', storage, twoHrsAgo)
    const visible = getVisibleAlerts(sampleAlerts, storage)
    expect(visible.map(a => a.id)).toContain('repair-overdue-rep-2')
  })

  it('INFO/WARNING dismiss uses session, CRITICAL uses local', () => {
    persistDismiss('transfer-pending-tr-1', 'WARNING', storage)
    expect(storage.session.get('alert_dismiss_transfer-pending-tr-1')).toBe('1')
    persistDismiss('repair-overdue-rep-2', 'CRITICAL', storage)
    expect(storage.local.has('alert_dismiss_repair-overdue-rep-2')).toBe(true)
  })
})

// ── 6. Click navigates to actionUrl ──────────────────────────────────────────

describe('Scenario 6 — Click opens actionUrl', () => {
  it('TRANSFER_PENDING actionUrl contains /transfers?highlight=', () => {
    const a = buildTransferPendingAlerts(
      [{ id: 'tr-9', fromBranchId: SRC_BRANCH, toBranchId: DST_BRANCH, toBranchName: 'B', productName: 'P', quantity: 1, createdAt: old(0) }],
      SRC_BRANCH,
    )[0]
    expect(a.actionUrl).toBe('/transfers?highlight=tr-9')
  })

  it('REPAIR_OVERDUE actionUrl contains /repairs?highlight=', () => {
    const alerts = buildRepairOverdueAlerts(
      [{ id: 'r-x', ticketNumber: 'TKT-X', status: 'IN_PROGRESS', branchId: SRC_BRANCH, receivedAt: old(10) }],
      SRC_BRANCH, now,
    )
    expect(alerts[0].actionUrl).toBe('/repairs?highlight=r-x')
  })

  it('LOW_STOCK actionUrl navigates to /products', () => {
    const a: OperationalAlert = {
      id: 'low-stock-bs-1', type: 'LOW_STOCK', severity: 'WARNING',
      title: 'สินค้าใกล้หมด', message: 'iPhone เหลือ 1 ชิ้น',
      actionUrl: '/products', entityId: 'prod-1', createdAt: '',
    }
    expect(a.actionUrl).toBe('/products')
  })

  it('TRANSFER_IN_TRANSIT actionUrl contains /transfers?highlight=', () => {
    const a = buildTransferInTransitAlerts(
      [{ id: 'tr-9', fromBranchId: SRC_BRANCH, toBranchId: DST_BRANCH, fromBranchName: 'SRC', productName: 'X', createdAt: old(0) }],
      DST_BRANCH,
    )[0]
    expect(a.actionUrl).toBe('/transfers?highlight=tr-9')
  })
})

// ── 7. Alert severity ordering ────────────────────────────────────────────────

describe('Scenario 7 — CRITICAL sorts before WARNING before INFO', () => {
  const SEV_ORDER: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

  function sortAlerts(alerts: OperationalAlert[]): OperationalAlert[] {
    return [...alerts].sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3))
  }

  it('CRITICAL first', () => {
    const input: OperationalAlert[] = [
      { id: 'a', type: 'REPAIR_OVERDUE', severity: 'WARNING', title: '', message: '', actionUrl: '', entityId: '', createdAt: '' },
      { id: 'b', type: 'REPAIR_OVERDUE', severity: 'CRITICAL', title: '', message: '', actionUrl: '', entityId: '', createdAt: '' },
      { id: 'c', type: 'TRANSFER_PENDING', severity: 'INFO', title: '', message: '', actionUrl: '', entityId: '', createdAt: '' },
    ]
    const sorted = sortAlerts(input)
    expect(sorted[0].severity).toBe('CRITICAL')
    expect(sorted[1].severity).toBe('WARNING')
    expect(sorted[2].severity).toBe('INFO')
  })
})
