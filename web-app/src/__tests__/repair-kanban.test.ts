/**
 * Phase 10 — Repair Workflow Pro tests
 *
 * Pure logic tests: status transition guards, SLA tiers, technician
 * grouping, optimistic rollback. No React rendering required.
 * Logic is inlined from repair-kanban-board.tsx / sla.ts to avoid JSX parsing.
 */

import { describe, it, expect } from 'vitest'
import { getSLATier, formatSLAAge, SLA_GREEN_H, SLA_YELLOW_H } from '@/lib/sla'
import type { Repair, RepairStatus } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Inlined from repair-kanban-board.tsx (pure logic only, no JSX)
// ─────────────────────────────────────────────────────────────────────────────

const KANBAN_STATUSES: RepairStatus[] = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_PARTS', 'IN_PROGRESS',
  'WAITING_APPROVAL', 'APPROVED', 'COMPLETED', 'DELIVERED',
]

const KANBAN_COLUMNS = [
  { status: 'RECEIVED'         as RepairStatus, label: 'รับงาน' },
  { status: 'DIAGNOSING'       as RepairStatus, label: 'ตรวจสอบ' },
  { status: 'WAITING_PARTS'    as RepairStatus, label: 'รออะไหล่' },
  { status: 'IN_PROGRESS'      as RepairStatus, label: 'กำลังซ่อม' },
  { status: 'WAITING_APPROVAL' as RepairStatus, label: 'รออนุมัติ' },
  { status: 'APPROVED'         as RepairStatus, label: 'อนุมัติแล้ว' },
  { status: 'COMPLETED'        as RepairStatus, label: 'พร้อมรับ' },
  { status: 'DELIVERED'        as RepairStatus, label: 'ส่งคืนแล้ว' },
]

function canMoveStatus(
  repair: Repair,
  toStatus: RepairStatus,
  isOwner: boolean,
): { ok: boolean; reason?: string } {
  if (repair.status === 'CANCELLED' && KANBAN_STATUSES.includes(toStatus) && !isOwner) {
    return { ok: false, reason: 'เฉพาะเจ้าของร้านเท่านั้นที่สามารถยกเลิกการยกเลิกงานได้' }
  }
  if (repair.status === 'COMPLETED' && toStatus === 'DELIVERED' && repair.paymentStatus !== 'PAID') {
    return { ok: false, reason: 'ยังไม่ได้รับชำระเงิน — กรุณารับเงินก่อนส่งคืนสินค้า' }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRepair(overrides: Partial<Repair> = {}): Repair {
  return {
    id: 'r1',
    ticketNumber: 'TK-0001',
    deviceBrand: 'Apple',
    deviceModel: 'iPhone 14',
    issue: 'หน้าจอแตก',
    status: 'RECEIVED',
    deposit: 0,
    paymentStatus: 'PENDING',
    parts: [],
    receivedAt: new Date().toISOString(),
    ...overrides,
  }
}

function hoursAgo(hours: number, now = Date.now()): string {
  return new Date(now - hours * 3_600_000).toISOString()
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Status transition rules — canMoveStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('canMoveStatus — transition guards', () => {
  it('allows normal forward move (RECEIVED → IN_PROGRESS)', () => {
    const repair = makeRepair({ status: 'RECEIVED' })
    expect(canMoveStatus(repair, 'IN_PROGRESS', false).ok).toBe(true)
  })

  it('COMPLETED → DELIVERED blocked when payment is PENDING', () => {
    const repair = makeRepair({ status: 'COMPLETED', paymentStatus: 'PENDING' })
    const result = canMoveStatus(repair, 'DELIVERED', false)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/ยังไม่ได้รับชำระเงิน/)
  })

  it('COMPLETED → DELIVERED allowed when payment is PAID', () => {
    const repair = makeRepair({ status: 'COMPLETED', paymentStatus: 'PAID' })
    expect(canMoveStatus(repair, 'DELIVERED', false).ok).toBe(true)
  })

  it('COMPLETED → DELIVERED blocked for owner too when unpaid (payment guard is universal)', () => {
    const repair = makeRepair({ status: 'COMPLETED', paymentStatus: 'PENDING' })
    const result = canMoveStatus(repair, 'DELIVERED', true)
    expect(result.ok).toBe(false)
  })

  it('CANCELLED → active status blocked for non-owner', () => {
    const repair = makeRepair({ status: 'CANCELLED' })
    const result = canMoveStatus(repair, 'RECEIVED', false)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/เจ้าของร้าน/)
  })

  it('CANCELLED → active status allowed for owner', () => {
    const repair = makeRepair({ status: 'CANCELLED' })
    expect(canMoveStatus(repair, 'RECEIVED', true).ok).toBe(true)
  })

  it('non-CANCELLED source is never blocked by the cancellation guard', () => {
    const repair = makeRepair({ status: 'IN_PROGRESS' })
    expect(canMoveStatus(repair, 'COMPLETED', false).ok).toBe(true)
  })

  it('KANBAN_COLUMNS has 8 columns in correct order', () => {
    const statuses = KANBAN_COLUMNS.map((c) => c.status)
    expect(statuses).toEqual(KANBAN_STATUSES)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. SLA tier calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('SLA tier calculation', () => {
  it('< 24 h → green', () => {
    expect(getSLATier(hoursAgo(12))).toBe('green')
  })

  it('exactly at 24 h boundary → yellow', () => {
    expect(getSLATier(hoursAgo(SLA_GREEN_H))).toBe('yellow')
  })

  it('between 24 h and 72 h → yellow', () => {
    expect(getSLATier(hoursAgo(48))).toBe('yellow')
  })

  it('exactly at 72 h boundary → red', () => {
    expect(getSLATier(hoursAgo(SLA_YELLOW_H))).toBe('red')
  })

  it('> 72 h → red', () => {
    expect(getSLATier(hoursAgo(100))).toBe('red')
  })

  it('accepts optional `now` param for deterministic testing', () => {
    const fixedNow = new Date('2025-01-01T12:00:00Z').getTime()
    const received = new Date('2024-12-29T12:00:00Z').toISOString() // exactly 72 h ago
    expect(getSLATier(received, fixedNow)).toBe('red')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. SLA age formatting
// ─────────────────────────────────────────────────────────────────────────────

describe('formatSLAAge', () => {
  it('just received (< 1 min) → "เพิ่งรับ"', () => {
    expect(formatSLAAge(new Date().toISOString())).toBe('เพิ่งรับ')
  })

  it('5 minutes ago → "5 นาที"', () => {
    const now = Date.now()
    const receivedAt = new Date(now - 5 * 60_000).toISOString()
    expect(formatSLAAge(receivedAt, now)).toBe('5 นาที')
  })

  it('3 hours ago → "ค้าง 3 ชม."', () => {
    const now = Date.now()
    const receivedAt = new Date(now - 3 * 3_600_000).toISOString()
    expect(formatSLAAge(receivedAt, now)).toBe('ค้าง 3 ชม.')
  })

  it('exactly 24 h → "ค้าง 1 วัน"', () => {
    const now        = new Date('2025-06-01T12:00:00Z').getTime()
    const receivedAt = new Date('2025-05-31T12:00:00Z').toISOString()
    expect(formatSLAAge(receivedAt, now)).toBe('ค้าง 1 วัน')
  })

  it('48 h → "ค้าง 2 วัน"', () => {
    const now        = new Date('2025-06-03T12:00:00Z').getTime()
    const receivedAt = new Date('2025-06-01T12:00:00Z').toISOString()
    expect(formatSLAAge(receivedAt, now)).toBe('ค้าง 2 วัน')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Technician filter grouping
// ─────────────────────────────────────────────────────────────────────────────

describe('Technician filter grouping', () => {
  const TECH_A = { id: 'tech-a', name: 'Alice' }
  const TECH_B = { id: 'tech-b', name: 'Bob' }

  function groupByStatus(repairs: Repair[], filterTechId: string | null) {
    const display = filterTechId
      ? repairs.filter((r) => r.technician?.id === filterTechId)
      : repairs

    const result: Record<string, Repair[]> = {}
    for (const col of KANBAN_COLUMNS) result[col.status] = []
    result['CANCELLED'] = []

    for (const r of display) {
      if (result[r.status] !== undefined) {
        result[r.status].push(r)
      } else {
        result['RECEIVED'].push(r) // unknown status falls back to RECEIVED
      }
    }
    return result
  }

  const repairs: Repair[] = [
    makeRepair({ id: 'r1', status: 'RECEIVED',    technician: TECH_A }),
    makeRepair({ id: 'r2', status: 'IN_PROGRESS', technician: TECH_B }),
    makeRepair({ id: 'r3', status: 'COMPLETED',   technician: TECH_A }),
    makeRepair({ id: 'r4', status: 'DIAGNOSING',  technician: undefined }),
  ]

  it('no filter → all repairs appear in their columns', () => {
    const grouped = groupByStatus(repairs, null)
    expect(grouped['RECEIVED']).toHaveLength(1)
    expect(grouped['IN_PROGRESS']).toHaveLength(1)
    expect(grouped['COMPLETED']).toHaveLength(1)
    expect(grouped['DIAGNOSING']).toHaveLength(1)
  })

  it('filter by TECH_A → only TECH_A repairs shown (2 repairs)', () => {
    const grouped = groupByStatus(repairs, 'tech-a')
    const total   = Object.values(grouped).flat().length
    expect(total).toBe(2)
    expect(grouped['RECEIVED'][0].id).toBe('r1')
    expect(grouped['COMPLETED'][0].id).toBe('r3')
    expect(grouped['IN_PROGRESS']).toHaveLength(0)
  })

  it('filter by TECH_B → only TECH_B repairs shown', () => {
    const grouped = groupByStatus(repairs, 'tech-b')
    expect(grouped['IN_PROGRESS']).toHaveLength(1)
    expect(grouped['RECEIVED']).toHaveLength(0)
  })

  it('unassigned repairs are excluded when any tech filter is active', () => {
    const grouped = groupByStatus(repairs, 'tech-a')
    // r4 (unassigned) not visible
    const diagnosing = grouped['DIAGNOSING']
    expect(diagnosing).toHaveLength(0)
  })

  it('unknown status falls back to RECEIVED column', () => {
    const weird   = makeRepair({ id: 'rX', status: 'UNKNOWN_STATUS' as RepairStatus })
    const grouped = groupByStatus([weird], null)
    expect(grouped['RECEIVED'][0].id).toBe('rX')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Optimistic rollback logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Optimistic rollback — cache patch logic', () => {
  function applyOptimistic(cache: Repair[], id: string, toStatus: RepairStatus): Repair[] {
    return cache.map((r) => (r.id === id ? { ...r, status: toStatus } : r))
  }

  function rollback(cache: Repair[], id: string, previousStatus: RepairStatus): Repair[] {
    return cache.map((r) => (r.id === id ? { ...r, status: previousStatus } : r))
  }

  it('optimistic update changes only the target repair', () => {
    const cache: Repair[] = [
      makeRepair({ id: 'r1', status: 'RECEIVED' }),
      makeRepair({ id: 'r2', status: 'DIAGNOSING' }),
    ]
    const updated = applyOptimistic(cache, 'r1', 'IN_PROGRESS')
    expect(updated[0].status).toBe('IN_PROGRESS')
    expect(updated[1].status).toBe('DIAGNOSING')
  })

  it('rollback restores previous status after API error', () => {
    const cache: Repair[] = [makeRepair({ id: 'r1', status: 'IN_PROGRESS' })]
    const restored = rollback(cache, 'r1', 'RECEIVED')
    expect(restored[0].status).toBe('RECEIVED')
  })

  it('undefined cache returns undefined (old?.map() ?? old pattern)', () => {
    function patchCache(old: Repair[] | undefined, id: string, toStatus: RepairStatus) {
      return old?.map((r) => (r.id === id ? { ...r, status: toStatus } : r)) ?? old
    }
    expect(patchCache(undefined, 'r1', 'DELIVERED')).toBeUndefined()
  })

  it('optimistic update does not mutate original array', () => {
    const cache: Repair[] = [makeRepair({ id: 'r1', status: 'RECEIVED' })]
    applyOptimistic(cache, 'r1', 'DELIVERED')
    expect(cache[0].status).toBe('RECEIVED')
  })

  it('rollback after round-trip leaves status identical to original', () => {
    const original = makeRepair({ id: 'r1', status: 'RECEIVED' })
    let cache      = [original]
    cache = applyOptimistic(cache, 'r1', 'IN_PROGRESS')
    cache = rollback(cache, 'r1', 'RECEIVED')
    expect(cache[0].status).toBe('RECEIVED')
  })
})
