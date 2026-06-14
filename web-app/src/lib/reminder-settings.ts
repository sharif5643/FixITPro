/**
 * Per-user smart reminder settings stored in localStorage.
 * Falls back gracefully when localStorage is unavailable (SSR, incognito).
 */

export interface ReminderSettings {
  // Existing fields
  enabled:           boolean
  repairOverdue:     boolean
  transferPending:   boolean
  transferInTransit: boolean
  sound:             boolean
  sunmi:             boolean
  intervalMinutes:   1 | 5 | 10 | 30
  // Phase 16 additions
  vipRepair:         boolean   // VIP_REPAIR type from /reminders/active
  partsRequest:      boolean   // PARTS_REQUEST_PENDING type
  pickupWaiting:     boolean   // PICKUP_WAITING type
  ownerAllBranches:  boolean   // OWNER scope: true=all branches, false=own branch only
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled:           true,
  repairOverdue:     true,
  transferPending:   true,
  transferInTransit: true,
  sound:             true,
  sunmi:             true,
  intervalMinutes:   5,
  vipRepair:         true,
  partsRequest:      true,
  pickupWaiting:     true,
  ownerAllBranches:  true,
}

/** Reminders with the same entityId won't re-announce within this window. */
export const ANTI_SPAM_MINUTES = 5

function key(userId: string): string {
  return `reminder_settings_${userId}`
}

export function loadReminderSettings(userId: string): ReminderSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_REMINDER_SETTINGS }
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return { ...DEFAULT_REMINDER_SETTINGS }
    return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS }
  }
}

export function saveReminderSettings(userId: string, settings: ReminderSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key(userId), JSON.stringify(settings))
  } catch { /* storage quota exceeded or unavailable */ }
}

// ── Escalation thresholds ────────────────────────────────────────────────────
// All values in minutes.

export const ESCALATION_THRESHOLDS = {
  TRANSFER_PENDING:    { warning: 15,        critical: 60 },
  TRANSFER_IN_TRANSIT: { warning: 60,        critical: 24 * 60 },
  REPAIR_OVERDUE:      { warning: 7 * 1440,  critical: 14 * 1440 },
} as const

export type EscalationKey = keyof typeof ESCALATION_THRESHOLDS

/** Compute the effective severity for an alert based on its age. */
export function escalateSeverity(
  type:      EscalationKey | string,
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

// ── Dismiss helpers ──────────────────────────────────────────────────────────

const CRITICAL_DISMISS_MS = 60 * 60 * 1000  // 1 hour

export function isDismissedReminder(id: string, severity: 'CRITICAL' | 'WARNING' | 'INFO'): boolean {
  if (typeof window === 'undefined') return false
  const k = `rdismiss_${id}`
  try {
    if (severity === 'CRITICAL') {
      const ts = localStorage.getItem(k)
      if (!ts) return false
      return Date.now() - parseInt(ts, 10) < CRITICAL_DISMISS_MS
    }
    return sessionStorage.getItem(k) === '1'
  } catch {
    return false
  }
}

export function persistReminderDismiss(
  id:       string,
  severity: 'CRITICAL' | 'WARNING' | 'INFO',
  now      = Date.now(),
): void {
  if (typeof window === 'undefined') return
  const k = `rdismiss_${id}`
  try {
    if (severity === 'CRITICAL') {
      localStorage.setItem(k, now.toString())
    } else {
      sessionStorage.setItem(k, '1')
    }
  } catch { /* storage unavailable */ }
}

// ── Snooze helpers ───────────────────────────────────────────────────────────

export const SNOOZE_DURATIONS = [15, 30, 60] as const
export type SnoozeDuration = typeof SNOOZE_DURATIONS[number]

const SNOOZE_KEY_PREFIX = 'alert_snooze_'

export function isSnoozeActive(id: string, now = Date.now()): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(`${SNOOZE_KEY_PREFIX}${id}`)
    if (!raw) return false
    const until = parseInt(raw, 10)
    return now < until
  } catch { return false }
}

export function persistSnooze(id: string, minutes: SnoozeDuration, now = Date.now()): void {
  if (typeof window === 'undefined') return
  try {
    const until = now + minutes * 60_000
    localStorage.setItem(`${SNOOZE_KEY_PREFIX}${id}`, until.toString())
  } catch { /* storage unavailable */ }
}
