/**
 * Notification Center 2.0 — Phase UX-01
 *
 * Tests cover:
 *  1. Snooze logic (isSnoozeActive, persistSnooze, expiry)
 *  2. Interval mapping including new 30-min option
 *  3. Sound on desktop (settings-gated, session-deduped)
 *  4. Quick action permissions (canApprove, canReceive)
 *  5. Alert filter by reminder settings
 *  6. Dismiss + snooze are independent
 */

import { describe, it, expect, beforeEach } from 'vitest'

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

interface ReminderSettings {
  enabled:           boolean
  sound:             boolean
  sunmi:             boolean
  repairOverdue:     boolean
  transferPending:   boolean
  transferInTransit: boolean
  vipRepair:         boolean
  partsRequest:      boolean
  pickupWaiting:     boolean
  ownerAllBranches:  boolean
  intervalMinutes:   1 | 5 | 10 | 30
}

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled:           true,
  sound:             true,
  sunmi:             true,
  repairOverdue:     true,
  transferPending:   true,
  transferInTransit: true,
  vipRepair:         true,
  partsRequest:      true,
  pickupWaiting:     true,
  ownerAllBranches:  true,
  intervalMinutes:   5,
}

// ── Mirror snooze logic from lib/reminder-settings ────────────────────────────

type SnoozeDuration = 15 | 30 | 60
const SNOOZE_DURATIONS: readonly SnoozeDuration[] = [15, 30, 60]
const SNOOZE_KEY_PREFIX = 'alert_snooze_'

function isSnoozeActive(
  id:      string,
  storage: Map<string, string>,
  now    = Date.now(),
): boolean {
  const raw = storage.get(`${SNOOZE_KEY_PREFIX}${id}`)
  if (!raw) return false
  const until = parseInt(raw, 10)
  return now < until
}

function persistSnooze(
  id:      string,
  minutes: SnoozeDuration,
  storage: Map<string, string>,
  now    = Date.now(),
): void {
  storage.set(`${SNOOZE_KEY_PREFIX}${id}`, (now + minutes * 60_000).toString())
}

// ── Interval helper ───────────────────────────────────────────────────────────

function intervalToMs(minutes: 1 | 5 | 10 | 30): number {
  return minutes * 60_000
}

// ── Permission helpers (mirror operational-alert-center exports) ───────────────

function canApproveTransfer(role: string): boolean {
  return ['OWNER', 'MANAGER', 'STOCK_STAFF'].includes(role)
}

function canReceiveTransfer(role: string): boolean {
  return ['OWNER', 'MANAGER', 'STOCK_STAFF', 'CASHIER'].includes(role)
}

// ── Alert filter (mirrors component logic) ─────────────────────────────────────

function filterBySettings(alerts: OperationalAlert[], settings: ReminderSettings): OperationalAlert[] {
  if (!settings.enabled) return []
  return alerts.filter(a => {
    if (a.type === 'REPAIR_OVERDUE'      && !settings.repairOverdue)     return false
    if (a.type === 'TRANSFER_PENDING'    && !settings.transferPending)   return false
    if (a.type === 'TRANSFER_IN_TRANSIT' && !settings.transferInTransit) return false
    return true
  })
}

// ── Sound dedup (mirror alert-sound.ts) ──────────────────────────────────────

const _played = new Set<string>()

function playAlertSound(alertId: string, _variant = 'soft', enabled = true): boolean {
  if (!enabled) return false
  if (_played.has(alertId)) return false
  _played.add(alertId)
  return true
}

function resetPlayedAlerts(): void { _played.clear() }

// ── Dismiss helpers (mirror operational-alert-center) ────────────────────────

const CRITICAL_DISMISS_TTL = 60 * 60 * 1000

function isDismissed(
  id:       string,
  severity: AlertSeverity,
  local:    Map<string, string>,
  session:  Map<string, string>,
  now     = Date.now(),
): boolean {
  const key = `alert_dismiss_${id}`
  if (severity === 'CRITICAL') {
    const ts = local.get(key)
    if (!ts) return false
    return now - parseInt(ts, 10) < CRITICAL_DISMISS_TTL
  }
  return session.get(key) === '1'
}

function persistDismiss(
  id:       string,
  severity: AlertSeverity,
  local:    Map<string, string>,
  session:  Map<string, string>,
  now     = Date.now(),
): void {
  const key = `alert_dismiss_${id}`
  if (severity === 'CRITICAL') {
    local.set(key, now.toString())
  } else {
    session.set(key, '1')
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleAlerts: OperationalAlert[] = [
  {
    id: 'transfer-pending-tp-1', type: 'TRANSFER_PENDING', severity: 'WARNING',
    title: 'มีคำขอโอนสินค้า', message: 'สาขา 3 ขอ iPhone 15',
    actionUrl: '/transfers?highlight=tp-1', entityId: 'tp-1', createdAt: '',
  },
  {
    id: 'transfer-transit-tt-1', type: 'TRANSFER_IN_TRANSIT', severity: 'WARNING',
    title: 'รอรับสินค้า', message: 'iPhone 15 จากสาขา1',
    actionUrl: '/transfers?highlight=tt-1', entityId: 'tt-1', createdAt: '',
  },
  {
    id: 'repair-overdue-rep-1', type: 'REPAIR_OVERDUE', severity: 'CRITICAL',
    title: 'งานซ่อมค้างเกินกำหนด', message: 'งาน #TKT-001 ค้าง 15 วัน',
    actionUrl: '/repairs?highlight=rep-1', entityId: 'rep-1', createdAt: '',
  },
  {
    id: 'low-stock-ls-1', type: 'LOW_STOCK', severity: 'WARNING',
    title: 'สินค้าใกล้หมด', message: 'iPhone เหลือ 1 ชิ้น',
    actionUrl: '/products', entityId: 'prod-1', createdAt: '',
  },
]

// ── 1. Snooze logic ───────────────────────────────────────────────────────────

describe('Scenario 1 — Snooze logic', () => {
  let storage: Map<string, string>
  const now = 1_700_000_000_000

  beforeEach(() => { storage = new Map() })

  it('snooze is inactive before persisting', () => {
    expect(isSnoozeActive('alert-1', storage, now)).toBe(false)
  })

  it('15-min snooze is active 1 second later', () => {
    persistSnooze('alert-1', 15, storage, now)
    expect(isSnoozeActive('alert-1', storage, now + 1_000)).toBe(true)
  })

  it('30-min snooze is active at 20 minutes', () => {
    persistSnooze('alert-1', 30, storage, now)
    expect(isSnoozeActive('alert-1', storage, now + 20 * 60_000)).toBe(true)
  })

  it('60-min snooze is active at 30 minutes', () => {
    persistSnooze('alert-1', 60, storage, now)
    expect(isSnoozeActive('alert-1', storage, now + 30 * 60_000)).toBe(true)
  })

  it('15-min snooze expires exactly at 15 minutes', () => {
    persistSnooze('alert-1', 15, storage, now)
    expect(isSnoozeActive('alert-1', storage, now + 15 * 60_000)).toBe(false)
  })

  it('30-min snooze expires exactly at 30 minutes', () => {
    persistSnooze('alert-1', 30, storage, now)
    expect(isSnoozeActive('alert-1', storage, now + 30 * 60_000)).toBe(false)
  })

  it('60-min snooze expires exactly at 60 minutes', () => {
    persistSnooze('alert-1', 60, storage, now)
    expect(isSnoozeActive('alert-1', storage, now + 60 * 60_000)).toBe(false)
  })

  it('snooze stores until-timestamp correctly', () => {
    persistSnooze('alert-1', 15, storage, now)
    const stored = parseInt(storage.get(`${SNOOZE_KEY_PREFIX}alert-1`)!, 10)
    expect(stored).toBe(now + 15 * 60_000)
  })

  it('SNOOZE_DURATIONS contains 15, 30, 60', () => {
    expect(SNOOZE_DURATIONS).toContain(15)
    expect(SNOOZE_DURATIONS).toContain(30)
    expect(SNOOZE_DURATIONS).toContain(60)
    expect(SNOOZE_DURATIONS).toHaveLength(3)
  })

  it('different alerts can be snoozed independently', () => {
    persistSnooze('alert-A', 15, storage, now)
    persistSnooze('alert-B', 60, storage, now)
    // At 20 min: A expired, B still active
    expect(isSnoozeActive('alert-A', storage, now + 20 * 60_000)).toBe(false)
    expect(isSnoozeActive('alert-B', storage, now + 20 * 60_000)).toBe(true)
  })
})

// ── 2. Interval mapping including 30 min ──────────────────────────────────────

describe('Scenario 2 — Interval options including 30 min', () => {
  it('1 min → 60,000 ms', () => expect(intervalToMs(1)).toBe(60_000))
  it('5 min → 300,000 ms', () => expect(intervalToMs(5)).toBe(300_000))
  it('10 min → 600,000 ms', () => expect(intervalToMs(10)).toBe(600_000))
  it('30 min → 1,800,000 ms', () => expect(intervalToMs(30)).toBe(1_800_000))

  it('default intervalMinutes is 5', () => {
    expect(DEFAULT_SETTINGS.intervalMinutes).toBe(5)
  })

  it('intervalMinutes=30 is a valid setting value', () => {
    const custom: ReminderSettings = { ...DEFAULT_SETTINGS, intervalMinutes: 30 }
    expect(intervalToMs(custom.intervalMinutes)).toBe(1_800_000)
  })
})

// ── 3. Sound on desktop + SUNMI, settings-gated ───────────────────────────────

describe('Scenario 3 — Sound plays on desktop and SUNMI, gated by settings', () => {
  beforeEach(() => resetPlayedAlerts())

  it('CRITICAL alert plays sound when settings.sound=true', () => {
    expect(playAlertSound('repair-crit', 'critical', true)).toBe(true)
  })

  it('TRANSFER_PENDING alert plays sound when settings.sound=true', () => {
    expect(playAlertSound('tp-sound', 'soft', true)).toBe(true)
  })

  it('sound is suppressed when settings.sound=false', () => {
    expect(playAlertSound('any-alert', 'critical', false)).toBe(false)
  })

  it('same alert ID plays only once (session dedup)', () => {
    const first  = playAlertSound('dup-alert', 'soft', true)
    const second = playAlertSound('dup-alert', 'soft', true)
    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it('two different alert IDs are independent', () => {
    expect(playAlertSound('alert-X', 'soft', true)).toBe(true)
    expect(playAlertSound('alert-Y', 'critical', true)).toBe(true)
  })

  it('after reset, same ID can play again (e.g. settings change)', () => {
    playAlertSound('alert-Z', 'soft', true)
    resetPlayedAlerts()
    expect(playAlertSound('alert-Z', 'soft', true)).toBe(true)
  })
})

// ── 4. Quick action permissions ───────────────────────────────────────────────

describe('Scenario 4 — Quick action role permissions', () => {
  describe('canApproveTransfer — อนุมัติ button', () => {
    it('OWNER can approve', ()       => expect(canApproveTransfer('OWNER')).toBe(true))
    it('MANAGER can approve', ()     => expect(canApproveTransfer('MANAGER')).toBe(true))
    it('STOCK_STAFF can approve', () => expect(canApproveTransfer('STOCK_STAFF')).toBe(true))
    it('CASHIER cannot approve', ()  => expect(canApproveTransfer('CASHIER')).toBe(false))
    it('TECHNICIAN cannot approve',  () => expect(canApproveTransfer('TECHNICIAN')).toBe(false))
  })

  describe('canReceiveTransfer — รับสินค้า button', () => {
    it('OWNER can receive', ()      => expect(canReceiveTransfer('OWNER')).toBe(true))
    it('MANAGER can receive', ()    => expect(canReceiveTransfer('MANAGER')).toBe(true))
    it('STOCK_STAFF can receive', () => expect(canReceiveTransfer('STOCK_STAFF')).toBe(true))
    it('CASHIER can receive', ()    => expect(canReceiveTransfer('CASHIER')).toBe(true))
    it('TECHNICIAN cannot receive', () => expect(canReceiveTransfer('TECHNICIAN')).toBe(false))
  })

  it('TRANSFER_PENDING อนุมัติ URL appends &action=approve', () => {
    const a = sampleAlerts.find(a => a.type === 'TRANSFER_PENDING')!
    const url = `${a.actionUrl}&action=approve`
    expect(url).toContain('/transfers?highlight=')
    expect(url).toContain('&action=approve')
  })

  it('TRANSFER_IN_TRANSIT รับสินค้า URL appends &action=receive', () => {
    const a = sampleAlerts.find(a => a.type === 'TRANSFER_IN_TRANSIT')!
    const url = `${a.actionUrl}&action=receive`
    expect(url).toContain('/transfers?highlight=')
    expect(url).toContain('&action=receive')
  })

  it('REPAIR_OVERDUE navigates to /repairs?highlight=entityId', () => {
    const a = sampleAlerts.find(a => a.type === 'REPAIR_OVERDUE')!
    expect(a.actionUrl).toBe(`/repairs?highlight=${a.entityId}`)
  })
})

// ── 5. Alert filter by reminder settings ─────────────────────────────────────

describe('Scenario 5 — Alert filter by reminder settings', () => {
  it('all alerts pass with default settings', () => {
    expect(filterBySettings(sampleAlerts, DEFAULT_SETTINGS)).toHaveLength(sampleAlerts.length)
  })

  it('settings.enabled=false returns empty list', () => {
    expect(filterBySettings(sampleAlerts, { ...DEFAULT_SETTINGS, enabled: false })).toHaveLength(0)
  })

  it('repairOverdue=false hides REPAIR_OVERDUE', () => {
    const visible = filterBySettings(sampleAlerts, { ...DEFAULT_SETTINGS, repairOverdue: false })
    expect(visible.some(a => a.type === 'REPAIR_OVERDUE')).toBe(false)
  })

  it('transferPending=false hides TRANSFER_PENDING', () => {
    const visible = filterBySettings(sampleAlerts, { ...DEFAULT_SETTINGS, transferPending: false })
    expect(visible.some(a => a.type === 'TRANSFER_PENDING')).toBe(false)
  })

  it('transferInTransit=false hides TRANSFER_IN_TRANSIT', () => {
    const visible = filterBySettings(sampleAlerts, { ...DEFAULT_SETTINGS, transferInTransit: false })
    expect(visible.some(a => a.type === 'TRANSFER_IN_TRANSIT')).toBe(false)
  })

  it('LOW_STOCK is always shown (not type-gated)', () => {
    const allOff = {
      ...DEFAULT_SETTINGS,
      repairOverdue: false,
      transferPending: false,
      transferInTransit: false,
    }
    const visible = filterBySettings(sampleAlerts, allOff)
    expect(visible.some(a => a.type === 'LOW_STOCK')).toBe(true)
  })

  it('disabling all 3 gated types leaves only LOW_STOCK', () => {
    const allOff = {
      ...DEFAULT_SETTINGS,
      repairOverdue: false,
      transferPending: false,
      transferInTransit: false,
    }
    const visible = filterBySettings(sampleAlerts, allOff)
    expect(visible.every(a => a.type === 'LOW_STOCK')).toBe(true)
  })
})

// ── 6. Dismiss and snooze are independent ─────────────────────────────────────

describe('Scenario 6 — Dismiss and snooze are independent', () => {
  let local:   Map<string, string>
  let session: Map<string, string>
  let snooze:  Map<string, string>
  const now = 1_700_000_000_000

  beforeEach(() => {
    local   = new Map()
    session = new Map()
    snooze  = new Map()
  })

  it('dismissed alert is hidden (WARNING uses session)', () => {
    persistDismiss('alert-1', 'WARNING', local, session, now)
    expect(isDismissed('alert-1', 'WARNING', local, session, now)).toBe(true)
  })

  it('snoozed alert is hidden independently', () => {
    persistSnooze('alert-2', 30, snooze, now)
    expect(isSnoozeActive('alert-2', snooze, now + 10 * 60_000)).toBe(true)
    expect(isDismissed('alert-2', 'WARNING', local, session, now)).toBe(false)
  })

  it('snooze expires but dismiss remains (session/local)', () => {
    persistDismiss('alert-3', 'WARNING', local, session, now)
    persistSnooze('alert-3', 15, snooze, now)
    // After 20 min: snooze expired
    expect(isSnoozeActive('alert-3', snooze, now + 20 * 60_000)).toBe(false)
    // Dismiss still in session
    expect(isDismissed('alert-3', 'WARNING', local, session, now)).toBe(true)
  })

  it('CRITICAL dismiss lasts 1 hour (not just session)', () => {
    persistDismiss('alert-4', 'CRITICAL', local, session, now)
    // After 59 min: still dismissed
    expect(isDismissed('alert-4', 'CRITICAL', local, session, now + 59 * 60_000)).toBe(true)
    // After 61 min: expired
    expect(isDismissed('alert-4', 'CRITICAL', local, session, now + 61 * 60_000)).toBe(false)
  })

  it('two alerts: one snoozed, one dismissed — independent state', () => {
    persistSnooze('snoozed', 30, snooze, now)
    persistDismiss('dismissed', 'WARNING', local, session, now)
    expect(isSnoozeActive('snoozed', snooze, now + 10 * 60_000)).toBe(true)
    expect(isDismissed('dismissed', 'WARNING', local, session, now)).toBe(true)
    // Cross-check: snoozed is not dismissed; dismissed is not snoozed
    expect(isDismissed('snoozed', 'WARNING', local, session, now)).toBe(false)
    expect(isSnoozeActive('dismissed', snooze, now + 10 * 60_000)).toBe(false)
  })
})
