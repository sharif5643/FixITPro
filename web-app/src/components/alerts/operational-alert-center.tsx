'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, X, ChevronRight, AlertTriangle, AlertCircle,
  ArrowRightLeft, Wrench, Package, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

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
  TRANSFER_PENDING:   ArrowRightLeft,
  TRANSFER_IN_TRANSIT: ArrowRightLeft,
  REPAIR_OVERDUE:     Wrench,
  LOW_STOCK:          Package,
  OVERDUE_DEBT:       AlertCircle,
}

// ── Dismiss helpers ───────────────────────────────────────────────────────────

const CRITICAL_DISMISS_TTL = 60 * 60 * 1000  // 1 hour

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

// ── Audio helper (SUNMI only) ─────────────────────────────────────────────────

function playAlertBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  } catch { /* audio unavailable */ }
}

async function triggerHaptic(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch { /* haptics unavailable */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OperationalAlertCenterProps {
  variant?: 'desktop' | 'sunmi'
}

export function OperationalAlertCenter({ variant = 'desktop' }: OperationalAlertCenterProps) {
  const router   = useRouter()
  const user     = useAuthStore((s) => s.user)
  const hasPerm  = useAuthStore((s) => s.hasPermission)

  const [collapsed, setCollapsed]           = useState(false)
  const [dismissed, setDismissed]           = useState<Set<string>>(new Set())
  const [mounted, setMounted]               = useState(false)
  const playedRef = useRef<Set<string>>(new Set())

  // SSR guard — session/local storage only available on client
  useEffect(() => { setMounted(true) }, [])

  const isPrivileged = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const canSeeAlerts = hasPerm('notification.view')

  const { data: alerts = [] } = useQuery<OperationalAlert[]>({
    queryKey: ['operational-alerts', user?.branchId],
    queryFn:  async () => {
      const params = new URLSearchParams()
      if (isPrivileged && user?.branchId) params.set('branchId', user.branchId)
      const r = await api.get(`/alerts/operational?${params}`)
      return r.data
    },
    enabled:         mounted && canSeeAlerts,
    staleTime:       25_000,
    refetchInterval: 30_000,
  })

  // Filter out dismissed alerts
  const visibleAlerts = mounted
    ? alerts.filter((a) => !dismissed.has(a.id) && !isDismissed(a.id, a.severity))
    : []

  // Play sound + haptic for new CRITICAL / TRANSFER_PENDING on SUNMI
  useEffect(() => {
    if (variant !== 'sunmi' || !mounted) return
    let triggered = false
    for (const a of visibleAlerts) {
      if (!playedRef.current.has(a.id) &&
          (a.severity === 'CRITICAL' || a.type === 'TRANSFER_PENDING')) {
        playedRef.current.add(a.id)
        if (!triggered) {
          triggered = true
          playAlertBeep()
          triggerHaptic()
        }
      }
    }
  }, [visibleAlerts, variant, mounted])

  const dismiss = useCallback((id: string, severity: AlertSeverity) => {
    persistDismiss(id, severity)
    setDismissed((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next })
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
                const SevIc  = scfg.icon
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'rounded-2xl border shadow-lg px-3.5 py-3 flex items-start gap-3 cursor-pointer',
                      'hover:shadow-xl transition-shadow',
                      scfg.bg, scfg.border,
                    )}
                    onClick={() => navigate(a)}
                  >
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
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); dismiss(a.id, a.severity) }}
                        className="p-0.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
                        aria-label="ปิด"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className={cn('h-3.5 w-3.5', scfg.text)} />
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
          onClick={() => setCollapsed((c) => !c)}
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
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(a.id, a.severity) }}
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
