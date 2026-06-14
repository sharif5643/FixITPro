'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, X, ChevronRight, AlertTriangle, AlertCircle,
  ArrowRightLeft, Wrench, Package, Info, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import {
  loadReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  isSnoozeActive,
  persistSnooze,
  SNOOZE_DURATIONS,
  type ReminderSettings,
  type SnoozeDuration,
} from '@/lib/reminder-settings'
import { playAlertSound, triggerHaptic } from '@/lib/alert-sound'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS'
export type AlertType =
  | 'TRANSFER_PENDING'
  | 'TRANSFER_IN_TRANSIT'
  | 'REPAIR_OVERDUE'
  | 'LOW_STOCK'
  | 'OVERDUE_DEBT'

export interface OperationalAlert {
  id:        string
  type:      AlertType
  severity:  AlertSeverity
  title:     string
  message:   string
  actionUrl: string
  entityId:  string
  createdAt: string
}

// ── Severity config ───────────────────────────────────────────────────────────

const SEV: Record<AlertSeverity, {
  icon: React.ElementType
  dot:  string
  bg:   string
  text: string
  border: string
  sunmiBg: string
  sunmiText: string
}> = {
  CRITICAL: {
    icon: AlertCircle,
    dot:    'bg-red-500',
    bg:     'bg-red-50',
    text:   'text-red-700',
    border: 'border-red-200',
    sunmiBg:   'bg-red-950/80 border-red-500/60',
    sunmiText: 'text-red-300',
  },
  WARNING: {
    icon: AlertTriangle,
    dot:    'bg-amber-500',
    text:   'text-amber-700',
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    sunmiBg:   'bg-amber-950/80 border-amber-500/60',
    sunmiText: 'text-amber-300',
  },
  INFO: {
    icon: Info,
    dot:    'bg-blue-500',
    text:   'text-blue-700',
    bg:     'bg-blue-50',
    border: 'border-blue-200',
    sunmiBg:   'bg-blue-950/80 border-blue-500/60',
    sunmiText: 'text-blue-300',
  },
  SUCCESS: {
    icon: Info,
    dot:    'bg-green-500',
    text:   'text-green-700',
    bg:     'bg-green-50',
    border: 'border-green-200',
    sunmiBg:   'bg-green-950/80 border-green-500/60',
    sunmiText: 'text-green-300',
  },
}

const TYPE_ICON: Record<AlertType, React.ElementType> = {
  TRANSFER_PENDING:    ArrowRightLeft,
  TRANSFER_IN_TRANSIT: ArrowRightLeft,
  REPAIR_OVERDUE:      Wrench,
  LOW_STOCK:           Package,
  OVERDUE_DEBT:        AlertCircle,
}

// ── Dismiss helpers ───────────────────────────────────────────────────────────

const CRITICAL_DISMISS_TTL = 60 * 60 * 1000

function isDismissed(id: string, severity: AlertSeverity): boolean {
  if (typeof window === 'undefined') return false
  const key = `alert_dismiss_${id}`
  try {
    if (severity === 'CRITICAL') {
      const ts = localStorage.getItem(key)
      if (!ts) return false
      return Date.now() - parseInt(ts, 10) < CRITICAL_DISMISS_TTL
    }
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function persistDismiss(id: string, severity: AlertSeverity): void {
  if (typeof window === 'undefined') return
  const key = `alert_dismiss_${id}`
  try {
    if (severity === 'CRITICAL') {
      localStorage.setItem(key, Date.now().toString())
    } else {
      sessionStorage.setItem(key, '1')
    }
  } catch { /* storage unavailable */ }
}

// ── Permission helpers (exported for tests) ───────────────────────────────────

export function canApproveTransfer(role: string): boolean {
  return ['OWNER', 'MANAGER', 'STOCK_STAFF'].includes(role)
}

export function canReceiveTransfer(role: string): boolean {
  return ['OWNER', 'MANAGER', 'STOCK_STAFF', 'CASHIER'].includes(role)
}

// ── Snooze label map ──────────────────────────────────────────────────────────

const SNOOZE_LABELS: Record<SnoozeDuration, string> = {
  15: '15 นาที',
  30: '30 นาที',
  60: '1 ชั่วโมง',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OperationalAlertCenterProps {
  variant?: 'desktop' | 'sunmi'
}

export function OperationalAlertCenter({ variant = 'desktop' }: OperationalAlertCenterProps) {
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const hasPerm = useAuthStore((s) => s.hasPermission)

  const [collapsed, setCollapsed]     = useState(false)
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set())
  const [snoozed, setSnoozed]         = useState<Set<string>>(new Set())
  const [snoozeOpen, setSnoozeOpen]   = useState<string | null>(null)
  const [mounted, setMounted]         = useState(false)
  const [settings, setSettings]       = useState<ReminderSettings>({ ...DEFAULT_REMINDER_SETTINGS })
  const hapticRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setMounted(true)
    if (user?.id) setSettings(loadReminderSettings(user.id))
  }, [user?.id])

  const isPrivileged = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const canSeeAlerts = hasPerm('notification.view')
  const intervalMs   = settings.intervalMinutes * 60_000

  const { data: alerts = [] } = useQuery<OperationalAlert[]>({
    queryKey: ['operational-alerts', user?.branchId],
    queryFn:  async () => {
      const params = new URLSearchParams()
      if (isPrivileged && user?.branchId) params.set('branchId', user.branchId)
      const r = await api.get(`/alerts/operational?${params}`)
      return r.data
    },
    enabled:         mounted && canSeeAlerts,
    staleTime:       Math.max(intervalMs - 5_000, 10_000),
    refetchInterval: intervalMs,
  })

  // Apply type-filter, dismiss, and snooze
  const visibleAlerts = mounted
    ? alerts.filter(a => {
        if (dismissed.has(a.id) || isDismissed(a.id, a.severity)) return false
        if (snoozed.has(a.id) || isSnoozeActive(a.id))            return false
        if (a.type === 'REPAIR_OVERDUE'      && !settings.repairOverdue)     return false
        if (a.type === 'TRANSFER_PENDING'    && !settings.transferPending)   return false
        if (a.type === 'TRANSFER_IN_TRANSIT' && !settings.transferInTransit) return false
        return true
      })
    : []

  // Sound (desktop + SUNMI) and haptic (SUNMI only) for new critical/pending alerts
  useEffect(() => {
    if (!mounted || !settings.enabled) return
    let needsHaptic = false
    for (const a of visibleAlerts) {
      if (a.severity === 'CRITICAL' || a.type === 'TRANSFER_PENDING') {
        // playAlertSound has module-level session dedup — safe to call each render
        playAlertSound(a.id, a.severity === 'CRITICAL' ? 'critical' : 'soft', settings.sound)
        if (variant === 'sunmi' && settings.sunmi && !hapticRef.current.has(a.id)) {
          hapticRef.current.add(a.id)
          needsHaptic = true
        }
      }
    }
    if (needsHaptic) triggerHaptic()
  }, [visibleAlerts, variant, mounted, settings.enabled, settings.sound, settings.sunmi])

  const dismiss = useCallback((id: string, severity: AlertSeverity) => {
    persistDismiss(id, severity)
    setDismissed(prev => { const next = new Set(Array.from(prev)); next.add(id); return next })
    if (snoozeOpen === id) setSnoozeOpen(null)
  }, [snoozeOpen])

  const snooze = useCallback((id: string, minutes: SnoozeDuration) => {
    persistSnooze(id, minutes)
    setSnoozed(prev => { const next = new Set(Array.from(prev)); next.add(id); return next })
    setSnoozeOpen(null)
  }, [])

  const navigate = useCallback((alert: OperationalAlert) => {
    dismiss(alert.id, alert.severity)
    router.push(alert.actionUrl)
  }, [dismiss, router])

  if (!mounted || !canSeeAlerts || visibleAlerts.length === 0) return null

  const criticalCount = visibleAlerts.filter(a => a.severity === 'CRITICAL').length
  const badgeCount    = visibleAlerts.length

  // ── Desktop floating panel ─────────────────────────────────────────────────
  if (variant === 'desktop') {
    return (
      <div className="fixed bottom-4 right-4 z-40 w-80 flex flex-col gap-0">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
              className="mb-2 flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto"
            >
              {visibleAlerts.slice(0, 6).map((a) => {
                const scfg   = SEV[a.severity] ?? SEV.INFO
                const TypeIc = TYPE_ICON[a.type] ?? Info
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'rounded-2xl border shadow-lg px-3.5 py-3 flex flex-col gap-2 cursor-pointer',
                      'hover:shadow-xl transition-shadow',
                      scfg.bg, scfg.border,
                    )}
                    onClick={() => navigate(a)}
                  >
                    {/* Top row: type icon + title + snooze + dismiss */}
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 shrink-0 rounded-xl p-1.5', scfg.bg)}>
                        <TypeIc className={cn('h-4 w-4', scfg.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-semibold leading-tight', scfg.text)}>
                          {a.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-snug line-clamp-2">
                          {a.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* Snooze dropdown */}
                        <div className="relative">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setSnoozeOpen(snoozeOpen === a.id ? null : a.id)
                            }}
                            className="p-0.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
                            title="เลื่อนการแจ้งเตือน"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                          <AnimatePresence>
                            {snoozeOpen === a.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[110px]"
                              >
                                {SNOOZE_DURATIONS.map(dur => (
                                  <button
                                    key={dur}
                                    onClick={e => { e.stopPropagation(); snooze(a.id, dur) }}
                                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 text-slate-700"
                                  >
                                    {SNOOZE_LABELS[dur]}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        {/* Dismiss */}
                        <button
                          onClick={e => { e.stopPropagation(); dismiss(a.id, a.severity) }}
                          className="p-0.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
                          aria-label="ปิด"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom row: role-gated quick actions + view */}
                    <div
                      className="flex items-center gap-1.5 pl-[30px]"
                      onClick={e => e.stopPropagation()}
                    >
                      {a.type === 'TRANSFER_PENDING' &&
                       user?.role && canApproveTransfer(user.role) && (
                        <button
                          onClick={() => navigate({ ...a, actionUrl: `${a.actionUrl}&action=approve` })}
                          className={cn(
                            'text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors hover:opacity-80',
                            scfg.bg, scfg.text, scfg.border,
                          )}
                        >
                          อนุมัติ
                        </button>
                      )}
                      {a.type === 'TRANSFER_IN_TRANSIT' &&
                       user?.role && canReceiveTransfer(user.role) && (
                        <button
                          onClick={() => navigate({ ...a, actionUrl: `${a.actionUrl}&action=receive` })}
                          className={cn(
                            'text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors hover:opacity-80',
                            scfg.bg, scfg.text, scfg.border,
                          )}
                        >
                          รับสินค้า
                        </button>
                      )}
                      <button
                        onClick={() => navigate(a)}
                        className="ml-auto text-[11px] font-medium px-2 py-1 rounded-lg bg-white/70 text-slate-600 hover:bg-white border border-slate-200 flex items-center gap-1"
                      >
                        ดูรายการ
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
              {visibleAlerts.length > 6 && (
                <p className="text-xs text-center text-slate-500 py-1">
                  และอีก {visibleAlerts.length - 6} รายการ
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle badge */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={cn(
            'self-end flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-lg',
            'text-white font-semibold text-sm transition-all hover:shadow-xl',
            criticalCount > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600',
          )}
        >
          <Bell className="h-4 w-4" />
          {collapsed ? `แจ้งเตือน (${badgeCount})` : 'ซ่อน'}
          {criticalCount > 0 && !collapsed && (
            <span className="ml-1 h-2 w-2 rounded-full bg-white/80 animate-pulse" />
          )}
        </button>
      </div>
    )
  }

  // ── SUNMI banner ──────────────────────────────────────────────────────────
  return (
    <div className="fixed top-[56px] left-0 right-0 z-40 px-3 pt-2 pb-1 space-y-2 pointer-events-none">
      <AnimatePresence>
        {visibleAlerts.slice(0, 3).map((a) => {
          const scfg   = SEV[a.severity] ?? SEV.INFO
          const TypeIc = TYPE_ICON[a.type] ?? Info
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', duration: 0.25, bounce: 0.1 }}
              className={cn(
                'pointer-events-auto rounded-2xl border px-4 py-3 flex items-center gap-3 shadow-xl',
                scfg.sunmiBg,
              )}
              onClick={() => navigate(a)}
            >
              <TypeIc className={cn('h-5 w-5 shrink-0', scfg.sunmiText)} />
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-bold', scfg.sunmiText)}>{a.title}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{a.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-xs font-semibold', scfg.sunmiText)}>ดูรายการ</span>
                {/* Quick 15-min snooze for SUNMI */}
                <button
                  onClick={e => { e.stopPropagation(); snooze(a.id, 15) }}
                  className="p-1 rounded-xl text-slate-500 hover:text-slate-300"
                  title="เลื่อน 15 นาที"
                >
                  <Clock className="h-4 w-4" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); dismiss(a.id, a.severity) }}
                  className="p-1 rounded-xl text-slate-500 hover:text-slate-300"
                  aria-label="ปิด"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
      {visibleAlerts.length > 3 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-auto text-center text-xs text-slate-500 py-0.5"
        >
          และอีก {visibleAlerts.length - 3} รายการ
        </motion.p>
      )}
    </div>
  )
}
