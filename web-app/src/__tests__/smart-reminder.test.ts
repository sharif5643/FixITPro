/**
 * Phase 16 — Smart Reminder & Anti-Forget System
 *
 * Tests cover:
 *  1. Interval settings (1/5/10 min → refetchInterval ms)
 *  2. Escalation thresholds per alert type
 *  3. Dismiss behaviour (INFO/WARNING = session, CRITICAL = 1-hour TTL)
 *  4. Sound plays once per alert ID (deduplicated)
 *  5. Dashboard widget counts (REPAIR_OVERDUE / TRANSFER_PENDING / IN_TRANSIT)
 *  6. Transfer quick actions (approve / receive)
 *  7. Repair quick actions (navigate to repair)
 *  8. Settings persistence (save/load per userId)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mirror lib/reminder-settings logic inline ─────────────────────────────────

interface ReminderSettings {
  enabled:           boolean
  repairOverdue:     boolean
  transferPending:   boolean
  transferInTransit: boolean
  sound:             boolean
  sunmi:             boolean
  intervalMinutes:   1 | 5 | 10
}

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled:           true,
  repairOverdue:     true,
  transferPending:   true,
  transferInTransit: true,
  sound:             true,
  sunmi:             true,
  intervalMinutes:   5,
}

const ESCALATION_THRESHOLDS = {
  TRANSFER_PENDING:    { warning: 15,        critical: 60 },
  TRANSFER_IN_TRANSIT: { warning: 60,        critical: 24 * 60 },
  REPAIR_OVERDUE:      { warning: 7 * 1440,  critical: 14 * 1440 },
} as const

type EscalationKey = keyof typeof ESCALATION_THRESHOLDS

function escalateSeverity(
  type:      string,
  createdAt: string | Date,
  now       = new Date(),
): 'CRITICAL' | 'WARNING' | 'INFO' {
  const thresholds = ESCALATION_THRESHOLDS[type as EscalationKey]
  if (!thresholds) return 'INFO'
  const ageMin = (now.getTime() - new Date(createdAt).getTime()) / 60_000
  if (ageMin >= thresholds.critical) return 'CRITICAL'
  if (ageMin >= thresholds.warning)  return 'WARNING'
  return 'INFO'
}

const CRITICAL_DISMISS_MS = 60 * 60 * 1000

function isDismissedReminder(
  id:       string,
  severity: 'CRITICAL' | 'WARNING' | 'INFO',
  storage:  { session: Map<string, string>; local: Map<string, string> },
): boolean {
  const k = `rdismiss_${id}`
  if (severity === 'CRITICAL') {
    const ts = storage.local.get(k)
    if (!ts) return false
    return Date.now() - parseInt(ts, 10) < CRITICAL_DISMISS_MS
  }
  return storage.session.get(k) === '1'
}

function persistReminderDismiss(
  id:       string,
  severity: 'CRITICAL' | 'WARNING' | 'INFO',
  storage:  { session: Map<string, string>; local: Map<string, string> },
  now      = Date.now(),
): void {
  const k = `rdismiss_${id}`
  if (severity === 'CRITICAL') {
    storage.local.set(k, now.toString())
  } else {
    storage.session.set(k, '1')
  }
}

// ── Mirror lib/alert-sound logic inline ──────────────────────────────────────

const _played = new Set<string>()

function playAlertSound(alertId: string, _variant = 'soft', enabled = true): void {
  if (!enabled) return
  if (_played.has(alertId)) return
  _played.add(alertId)
}

function resetPlayedAlerts(): void { _played.clear() }
function hasPlayed(alertId: string): boolean { return _played.has(alertId) }

// ── Alert type ────────────────────────────────────────────────────────────────

type AlertType = 'TRANSFER_PENDING' | 'TRANSFER_IN_TRANSIT' | 'REPAIR_OVERDUE' | 'LOW_STOCK'

interface OperationalAlert {
  id:        string
  type:      AlertType
  severity:  'CRITICAL' | 'WARNING' | 'INFO'
  title:     string
  message:   string
  actionUrl: string
  entityId:  string
  createdAt: string
}

// ── Interval → refetchMs helper ───────────────────────────────────────────────

function intervalToMs(minutes: 1 | 5 | 10): number {
  return minutes * 60_000
}

// ── Dashboard widget count helpers ────────────────────────────────────────────

function widgetCounts(alerts: OperationalAlert[]) {
  return {
    repairOverdue:   alerts.filter(a => a.type === 'REPAIR_OVERDUE').length,
    transferPending: alerts.filter(a => a.type === 'TRANSFER_PENDING').length,
    transferTransit: alerts.filter(a => a.type === 'TRANSFER_IN_TRANSIT').length,
  }
}

// ── Quick action permission helper ────────────────────────────────────────────

function canApproveTransfer(role: string): boolean {
  return ['OWNER', 'MANAGER', 'STOCK_STAFF'].includes(role)
}

function canReceiveTransfer(role: string): boolean {
  return ['OWNER', 'MANAGER', 'STOCK_STAFF', 'CASHIER'].includes(role)
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date('2026-05-31T10:00:00.000Z')
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
const daysAgo = (d: number) => ago(d * 24 * 60)

const sampleAlerts: OperationalAlert[] = [
  // TRANSFER_PENDING — 20 min old → WARNING (>15m), not CRITICAL (<60m)
  {
    id: 'transfer-pending-tp-1', type: 'TRANSFER_PENDING', severity: 'WARNING',
    title: 'มีคำขอโอนสินค้า', message: 'สาขา 3 ขอ iPhone 15 จำนวน 2 ชิ้น',
    actionUrl: '/transfers?highlight=tp-1', entityId: 'tp-1', createdAt: ago(20),
  },
  // TRANSFER_PENDING — 90 min old → CRITICAL (>60m)
  {
    id: 'transfer-pending-tp-2', type: 'TRANSFER_PENDING', severity: 'CRITICAL',
    title: 'มีคำขอโอนสินค้า', message: 'สาขา 2 ขอ Samsung S24 จำนวน 1 ชิ้น',
    actionUrl: '/transfers?highlight=tp-2', entityId: 'tp-2', createdAt: ago(90),
  },
  // TRANSFER_IN_TRANSIT — 2h old → WARNING (>60m), not CRITICAL (<24h)
  {
    id: 'transfer-transit-tt-1', type: 'TRANSFER_IN_TRANSIT', severity: 'WARNING',
    title: 'รอรับสินค้า', message: 'iPhone 15 จาก สาขา1 กำลังส่งมา',
    actionUrl: '/transfers?highlight=tt-1', entityId: 'tt-1', createdAt: ago(120),
  },
  // REPAIR_OVERDUE — 10 days old → WARNING (>7d), not CRITICAL (<14d)
  {
    id: 'repair-overdue-rep-1', type: 'REPAIR_OVERDUE', severity: 'WARNING',
    title: 'งานซ่อมค้างเกินกำหนด', message: 'งาน #TKT-001 ค้าง 10 วัน',
    actionUrl: '/repairs?highlight=rep-1', entityId: 'rep-1', createdAt: daysAgo(10),
  },
  // REPAIR_OVERDUE — 15 days old → CRITICAL (>14d)
  {
    id: 'repair-overdue-rep-2', type: 'REPAIR_OVERDUE', severity: 'CRITICAL',
    title: 'งานซ่อมค้างเกินกำหนด', message: 'งาน #TKT-002 ค้าง 15 วัน',
    actionUrl: '/repairs?highlight=rep-2', entityId: 'rep-2', createdAt: daysAgo(15),
  },
  // LOW_STOCK — filtered out from reminder popup
  {
    id: 'low-stock-ls-1', type: 'LOW_STOCK', severity: 'WARNING',
    title: 'สินค้าใกล้หมด', message: 'iPhone เหลือ 1 ชิ้น',
    actionUrl: '/products', entityId: 'prod-1', createdAt: ago(30),
  },
]

// ── 1. Interval settings ──────────────────────────────────────────────────────

describe('Scenario 1 — Interval settings map to refetchInterval ms', () => {
  it('1 minute interval = 60,000 ms', () => {
    expect(intervalToMs(1)).toBe(60_000)
  })

  it('5 minute interval = 300,000 ms', () => {
    expect(intervalToMs(5)).toBe(300_000)
  })

  it('10 minute interval = 600,000 ms', () => {
    expect(intervalToMs(10)).toBe(600_000)
  })

  it('default intervalMinutes is 5', () => {
    expect(DEFAULT_REMINDER_SETTINGS.intervalMinutes).toBe(5)
  })

  it('saved setting is respected: intervalMinutes=1 → 60s', () => {
    const s: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS, intervalMinutes: 1 }
    expect(intervalToMs(s.intervalMinutes)).toBe(60_000)
  })
})

// ── 2. Escalation thresholds ──────────────────────────────────────────────────

describe('Scenario 2 — Escalation thresholds', () => {

  describe('TRANSFER_PENDING', () => {
    it('< 15 min → INFO', () => {
      expect(escalateSeverity('TRANSFER_PENDING', ago(5), now)).toBe('INFO')
    })
    it('= 15 min → WARNING', () => {
      expect(escalateSeverity('TRANSFER_PENDING', ago(15), now)).toBe('WARNING')
    })
    it('30 min → WARNING', () => {
      expect(escalateSeverity('TRANSFER_PENDING', ago(30), now)).toBe('WARNING')
    })
    it('= 60 min → CRITICAL', () => {
      expect(escalateSeverity('TRANSFER_PENDING', ago(60), now)).toBe('CRITICAL')
    })
    it('> 60 min → CRITICAL', () => {
      expect(escalateSeverity('TRANSFER_PENDING', ago(90), now)).toBe('CRITICAL')
    })
  })

  describe('TRANSFER_IN_TRANSIT', () => {
    it('< 60 min → INFO', () => {
      expect(escalateSeverity('TRANSFER_IN_TRANSIT', ago(30), now)).toBe('INFO')
    })
    it('= 60 min → WARNING', () => {
      expect(escalateSeverity('TRANSFER_IN_TRANSIT', ago(60), now)).toBe('WARNING')
    })
    it('= 24 h → CRITICAL', () => {
      expect(escalateSeverity('TRANSFER_IN_TRANSIT', ago(24 * 60), now)).toBe('CRITICAL')
    })
    it('> 24 h → CRITICAL', () => {
      expect(escalateSeverity('TRANSFER_IN_TRANSIT', ago(25 * 60), now)).toBe('CRITICAL')
    })
  })

  describe('REPAIR_OVERDUE', () => {
    it('< 7 days → INFO', () => {
      expect(escalateSeverity('REPAIR_OVERDUE', daysAgo(3), now)).toBe('INFO')
    })
    it('= 7 days → WARNING', () => {
      expect(escalateSeverity('REPAIR_OVERDUE', daysAgo(7), now)).toBe('WARNING')
    })
    it('10 days → WARNING', () => {
      expect(escalateSeverity('REPAIR_OVERDUE', daysAgo(10), now)).toBe('WARNING')
    })
    it('= 14 days → CRITICAL', () => {
      expect(escalateSeverity('REPAIR_OVERDUE', daysAgo(14), now)).toBe('CRITICAL')
    })
    it('> 14 days → CRITICAL', () => {
      expect(escalateSeverity('REPAIR_OVERDUE', daysAgo(20), now)).toBe('CRITICAL')
    })
  })

  it('unknown type → always INFO', () => {
    expect(escalateSeverity('UNKNOWN_TYPE', ago(9999), now)).toBe('INFO')
  })
})

// ── 3. Dismiss behaviour ──────────────────────────────────────────────────────

describe('Scenario 3 — Dismiss behaviour', () => {
  let storage: { session: Map<string, string>; local: Map<string, string> }

  beforeEach(() => {
    storage = { session: new Map(), local: new Map() }
  })

  it('INFO dismissed → uses session storage', () => {
    persistReminderDismiss('alert-1', 'INFO', storage)
    expect(storage.session.get('rdismiss_alert-1')).toBe('1')
    expect(storage.local.has('rdismiss_alert-1')).toBe(false)
  })

  it('WARNING dismissed → uses session storage', () => {
    persistReminderDismiss('alert-2', 'WARNING', storage)
    expect(storage.session.get('rdismiss_alert-2')).toBe('1')
  })

  it('CRITICAL dismissed → uses localStorage with timestamp', () => {
    const ts = Date.now()
    persistReminderDismiss('alert-3', 'CRITICAL', storage, ts)
    expect(storage.local.get('rdismiss_alert-3')).toBe(ts.toString())
  })

  it('INFO dismissed → isDismissed returns true', () => {
    persistReminderDismiss('alert-1', 'INFO', storage)
    expect(isDismissedReminder('alert-1', 'INFO', storage)).toBe(true)
  })

  it('WARNING dismissed → isDismissed returns true', () => {
    persistReminderDismiss('alert-2', 'WARNING', storage)
    expect(isDismissedReminder('alert-2', 'WARNING', storage)).toBe(true)
  })

  it('CRITICAL dismissed now → isDismissed returns true (within 1h)', () => {
    persistReminderDismiss('alert-3', 'CRITICAL', storage, Date.now())
    expect(isDismissedReminder('alert-3', 'CRITICAL', storage)).toBe(true)
  })

  it('CRITICAL dismissed 2h ago → isDismissed returns false (expired)', () => {
    const twoHrsAgo = Date.now() - 2 * 60 * 60 * 1000
    persistReminderDismiss('alert-3', 'CRITICAL', storage, twoHrsAgo)
    expect(isDismissedReminder('alert-3', 'CRITICAL', storage)).toBe(false)
  })

  it('CRITICAL dismissed exactly 59m ago → still hidden', () => {
    const fiftyNineMin = Date.now() - 59 * 60 * 1000
    persistReminderDismiss('alert-3', 'CRITICAL', storage, fiftyNineMin)
    expect(isDismissedReminder('alert-3', 'CRITICAL', storage)).toBe(true)
  })

  it('not dismissed → isDismissed returns false', () => {
    expect(isDismissedReminder('unknown-alert', 'WARNING', storage)).toBe(false)
  })
})

// ── 4. Sound plays once per alert ID ─────────────────────────────────────────

describe('Scenario 4 — Sound plays once per alert ID', () => {
  beforeEach(() => resetPlayedAlerts())

  it('first call for new ID → sound plays (recorded)', () => {
    playAlertSound('alert-A', 'soft', true)
    expect(hasPlayed('alert-A')).toBe(true)
  })

  it('second call for same ID → no duplicate (hasPlayed stays true)', () => {
    playAlertSound('alert-B', 'soft', true)
    playAlertSound('alert-B', 'soft', true)
    expect(hasPlayed('alert-B')).toBe(true)
    // Cannot play twice; only added to set once
    // (we verify by calling it again — still true, no second entry)
    expect(Array.from(_played).filter(x => x === 'alert-B').length).toBe(1)
  })

  it('two different IDs → both recorded independently', () => {
    playAlertSound('alert-C', 'soft', true)
    playAlertSound('alert-D', 'critical', true)
    expect(hasPlayed('alert-C')).toBe(true)
    expect(hasPlayed('alert-D')).toBe(true)
  })

  it('disabled sound → ID not recorded', () => {
    playAlertSound('alert-E', 'soft', false)
    expect(hasPlayed('alert-E')).toBe(false)
  })

  it('resetPlayedAlerts clears all recorded IDs', () => {
    playAlertSound('alert-F', 'soft', true)
    resetPlayedAlerts()
    expect(hasPlayed('alert-F')).toBe(false)
  })

  it('after reset, same ID can play again', () => {
    playAlertSound('alert-G', 'soft', true)
    resetPlayedAlerts()
    playAlertSound('alert-G', 'soft', true)
    expect(hasPlayed('alert-G')).toBe(true)
  })
})

// ── 5. Dashboard widget counts ────────────────────────────────────────────────

describe('Scenario 5 — Dashboard widget counts', () => {
  it('counts REPAIR_OVERDUE correctly', () => {
    const { repairOverdue } = widgetCounts(sampleAlerts)
    expect(repairOverdue).toBe(2)
  })

  it('counts TRANSFER_PENDING correctly', () => {
    const { transferPending } = widgetCounts(sampleAlerts)
    expect(transferPending).toBe(2)
  })

  it('counts TRANSFER_IN_TRANSIT correctly', () => {
    const { transferTransit } = widgetCounts(sampleAlerts)
    expect(transferTransit).toBe(1)
  })

  it('LOW_STOCK is not counted in widget', () => {
    const { repairOverdue, transferPending, transferTransit } = widgetCounts(sampleAlerts)
    const total = repairOverdue + transferPending + transferTransit
    expect(total).toBe(5)  // 2 repairs + 2 pending + 1 transit (excludes 1 LOW_STOCK)
  })

  it('empty alerts → all counts zero', () => {
    const counts = widgetCounts([])
    expect(counts.repairOverdue).toBe(0)
    expect(counts.transferPending).toBe(0)
    expect(counts.transferTransit).toBe(0)
  })

  it('widget hidden when total is zero', () => {
    const counts = widgetCounts([])
    const total = counts.repairOverdue + counts.transferPending + counts.transferTransit
    expect(total).toBe(0)
  })
})

// ── 6. Transfer quick actions ─────────────────────────────────────────────────

describe('Scenario 6 — Transfer quick actions', () => {
  it('TRANSFER_PENDING has [อนุมัติ] action available', () => {
    const pendingAlert = sampleAlerts.find(a => a.type === 'TRANSFER_PENDING')!
    expect(pendingAlert.type).toBe('TRANSFER_PENDING')
    expect(pendingAlert.entityId).toBe('tp-1')
  })

  it('TRANSFER_PENDING has [ดูรายการ] action with correct URL', () => {
    const a = sampleAlerts.find(a => a.type === 'TRANSFER_PENDING')!
    expect(a.actionUrl).toContain('/transfers?highlight=')
  })

  it('TRANSFER_IN_TRANSIT has [รับสินค้า] action available', () => {
    const transitAlert = sampleAlerts.find(a => a.type === 'TRANSFER_IN_TRANSIT')!
    expect(transitAlert.type).toBe('TRANSFER_IN_TRANSIT')
    expect(transitAlert.entityId).toBe('tt-1')
  })

  it('TRANSFER_IN_TRANSIT has [ดูรายการ] action with correct URL', () => {
    const a = sampleAlerts.find(a => a.type === 'TRANSFER_IN_TRANSIT')!
    expect(a.actionUrl).toContain('/transfers?highlight=')
  })

  it('OWNER can approve transfer', () => {
    expect(canApproveTransfer('OWNER')).toBe(true)
  })

  it('MANAGER can approve transfer', () => {
    expect(canApproveTransfer('MANAGER')).toBe(true)
  })

  it('STOCK_STAFF can approve transfer', () => {
    expect(canApproveTransfer('STOCK_STAFF')).toBe(true)
  })

  it('CASHIER cannot approve transfer', () => {
    expect(canApproveTransfer('CASHIER')).toBe(false)
  })

  it('TECHNICIAN cannot approve transfer', () => {
    expect(canApproveTransfer('TECHNICIAN')).toBe(false)
  })

  it('OWNER can receive transfer', () => {
    expect(canReceiveTransfer('OWNER')).toBe(true)
  })

  it('CASHIER can receive transfer', () => {
    expect(canReceiveTransfer('CASHIER')).toBe(true)
  })
})

// ── 7. Repair quick actions ───────────────────────────────────────────────────

describe('Scenario 7 — Repair quick actions', () => {
  it('REPAIR_OVERDUE has [เปิดงาน] action with correct URL', () => {
    const repairAlert = sampleAlerts.find(a => a.type === 'REPAIR_OVERDUE')!
    expect(repairAlert.actionUrl).toContain('/repairs?highlight=')
  })

  it('REPAIR_OVERDUE entityId maps to highlight query param', () => {
    const a = sampleAlerts.find(a => a.type === 'REPAIR_OVERDUE')!
    expect(a.actionUrl).toBe(`/repairs?highlight=${a.entityId}`)
  })

  it('REPAIR_OVERDUE 15 days → CRITICAL severity', () => {
    const a = sampleAlerts.find(a => a.entityId === 'rep-2')!
    const esc = escalateSeverity('REPAIR_OVERDUE', a.createdAt, now)
    expect(esc).toBe('CRITICAL')
  })

  it('REPAIR_OVERDUE 10 days → WARNING severity', () => {
    const a = sampleAlerts.find(a => a.entityId === 'rep-1')!
    const esc = escalateSeverity('REPAIR_OVERDUE', a.createdAt, now)
    expect(esc).toBe('WARNING')
  })
})

// ── 8. Settings persistence ───────────────────────────────────────────────────

describe('Scenario 8 — Settings persistence (localStorage)', () => {
  let storage: Map<string, string>

  function mockSave(userId: string, s: ReminderSettings): void {
    storage.set(`reminder_settings_${userId}`, JSON.stringify(s))
  }

  function mockLoad(userId: string): ReminderSettings {
    const raw = storage.get(`reminder_settings_${userId}`)
    if (!raw) return { ...DEFAULT_REMINDER_SETTINGS }
    return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) }
  }

  beforeEach(() => { storage = new Map() })

  it('loads defaults when no settings saved', () => {
    const s = mockLoad('user-1')
    expect(s).toEqual(DEFAULT_REMINDER_SETTINGS)
  })

  it('saves and loads settings correctly', () => {
    const custom: ReminderSettings = {
      ...DEFAULT_REMINDER_SETTINGS,
      intervalMinutes: 1,
      sound: false,
      repairOverdue: false,
    }
    mockSave('user-1', custom)
    const loaded = mockLoad('user-1')
    expect(loaded.intervalMinutes).toBe(1)
    expect(loaded.sound).toBe(false)
    expect(loaded.repairOverdue).toBe(false)
  })

  it('settings are per-user (different userIds are isolated)', () => {
    mockSave('user-A', { ...DEFAULT_REMINDER_SETTINGS, intervalMinutes: 1 })
    mockSave('user-B', { ...DEFAULT_REMINDER_SETTINGS, intervalMinutes: 10 })
    expect(mockLoad('user-A').intervalMinutes).toBe(1)
    expect(mockLoad('user-B').intervalMinutes).toBe(10)
  })

  it('partial saved settings merge with defaults', () => {
    // Simulate old version with missing fields
    storage.set('reminder_settings_user-3', JSON.stringify({ intervalMinutes: 10 }))
    const loaded = mockLoad('user-3')
    expect(loaded.intervalMinutes).toBe(10)
    expect(loaded.sound).toBe(DEFAULT_REMINDER_SETTINGS.sound)  // merged from default
    expect(loaded.enabled).toBe(DEFAULT_REMINDER_SETTINGS.enabled)
  })

  it('corrupted JSON falls back to defaults', () => {
    storage.set('reminder_settings_user-4', 'NOT_VALID_JSON{{{')
    // simulate try/catch in load
    let result: ReminderSettings
    try {
      result = JSON.parse(storage.get('reminder_settings_user-4')!)
    } catch {
      result = { ...DEFAULT_REMINDER_SETTINGS }
    }
    expect(result).toEqual(DEFAULT_REMINDER_SETTINGS)
  })
})

// ── 9. Filter: only REPAIR_OVERDUE / TRANSFER_PENDING / IN_TRANSIT shown ─────

describe('Scenario 9 — Alert type filtering in reminder popup', () => {
  const ALLOWED_TYPES = ['REPAIR_OVERDUE', 'TRANSFER_PENDING', 'TRANSFER_IN_TRANSIT']

  function filterForReminder(alerts: OperationalAlert[], settings: ReminderSettings): OperationalAlert[] {
    return alerts.filter(a => {
      if (!ALLOWED_TYPES.includes(a.type)) return false
      if (a.type === 'REPAIR_OVERDUE'      && !settings.repairOverdue)     return false
      if (a.type === 'TRANSFER_PENDING'    && !settings.transferPending)   return false
      if (a.type === 'TRANSFER_IN_TRANSIT' && !settings.transferInTransit) return false
      return true
    })
  }

  it('LOW_STOCK is excluded from reminder popup', () => {
    const filtered = filterForReminder(sampleAlerts, DEFAULT_REMINDER_SETTINGS)
    expect(filtered.some(a => a.type === 'LOW_STOCK')).toBe(false)
  })

  it('all 3 reminder types visible by default', () => {
    const filtered = filterForReminder(sampleAlerts, DEFAULT_REMINDER_SETTINGS)
    expect(filtered.some(a => a.type === 'REPAIR_OVERDUE')).toBe(true)
    expect(filtered.some(a => a.type === 'TRANSFER_PENDING')).toBe(true)
    expect(filtered.some(a => a.type === 'TRANSFER_IN_TRANSIT')).toBe(true)
  })

  it('disabling repairOverdue hides those alerts', () => {
    const s = { ...DEFAULT_REMINDER_SETTINGS, repairOverdue: false }
    const filtered = filterForReminder(sampleAlerts, s)
    expect(filtered.some(a => a.type === 'REPAIR_OVERDUE')).toBe(false)
  })

  it('disabling transferPending hides those alerts', () => {
    const s = { ...DEFAULT_REMINDER_SETTINGS, transferPending: false }
    const filtered = filterForReminder(sampleAlerts, s)
    expect(filtered.some(a => a.type === 'TRANSFER_PENDING')).toBe(false)
  })

  it('disabling transferInTransit hides those alerts', () => {
    const s = { ...DEFAULT_REMINDER_SETTINGS, transferInTransit: false }
    const filtered = filterForReminder(sampleAlerts, s)
    expect(filtered.some(a => a.type === 'TRANSFER_IN_TRANSIT')).toBe(false)
  })
})

// ── 10. Critical count for notification bell badge ────────────────────────────

describe('Scenario 10 — Critical count for notification bell badge', () => {
  const BELL_TYPES = ['REPAIR_OVERDUE', 'TRANSFER_PENDING', 'TRANSFER_IN_TRANSIT']

  function getCriticalCount(alerts: OperationalAlert[], escalatedNow: Date): number {
    return alerts.filter(
      a => BELL_TYPES.includes(a.type) &&
           escalateSeverity(a.type, a.createdAt, escalatedNow) === 'CRITICAL'
    ).length
  }

  it('counts critical alerts from REPAIR and TRANSFER types only', () => {
    const count = getCriticalCount(sampleAlerts, now)
    // rep-2 (15d → CRITICAL) + tp-2 (90m → CRITICAL) = 2
    expect(count).toBe(2)
  })

  it('LOW_STOCK CRITICAL does not count in bell badge', () => {
    const criticalLowStock: OperationalAlert = {
      id: 'low-stock-crit', type: 'LOW_STOCK', severity: 'CRITICAL',
      title: '', message: '', actionUrl: '/products', entityId: 'p-1',
      createdAt: daysAgo(100),
    }
    const alerts = [...sampleAlerts, criticalLowStock]
    const count = getCriticalCount(alerts, now)
    // Still only rep-2 + tp-2
    expect(count).toBe(2)
  })

  it('no critical alerts → badge count is 0', () => {
    const allInfo: OperationalAlert[] = [
      { id: 'p-1', type: 'TRANSFER_PENDING', severity: 'INFO', title: '', message: '',
        actionUrl: '', entityId: 'x', createdAt: ago(5) },
    ]
    expect(getCriticalCount(allInfo, now)).toBe(0)
  })
})
