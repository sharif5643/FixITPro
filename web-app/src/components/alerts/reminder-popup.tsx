'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Wrench, Package, ArrowRightLeft, X, ChevronRight, AlertTriangle, AlertCircle, Crown, Settings2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import api from '@/lib/api'
import {
  escalateSeverity,
  isDismissedReminder,
  persistReminderDismiss,
  loadReminderSettings,
  ANTI_SPAM_MINUTES,
  type ReminderSettings,
} from '@/lib/reminder-settings'
import { playAlertSound, playTypedSound, triggerHaptic } from '@/lib/alert-sound'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import type { OperationalAlert } from '@/components/alerts/operational-alert-center'

// ── Phase 16: new reminder item types ────────────────────────────────────────

interface ReminderItem {
  id:         string
  type:       string
  severity:   'CRITICAL' | 'WARNING' | 'INFO'
  title:      string
  message:    string
  entityType: string
  entityId:   string
  actionUrl:  string
  ageMinutes: number
  branchId:   string | null
  branchName: string | null
  canDismiss: boolean
}

const REMINDER_TYPE_ICON: Record<string, React.ElementType> = {
  VIP_REPAIR:            Crown,
  URGENT_REPAIR:         Wrench,
  PARTS_REQUEST_PENDING: Settings2,
  TRANSFER_PENDING:      ArrowRightLeft,
  PICKUP_WAITING:        Clock,
}

const REMINDER_TYPE_LABEL: Record<string, string> = {
  VIP_REPAIR:            'VIP',
  URGENT_REPAIR:         'งานด่วน',
  PARTS_REQUEST_PENDING: 'รอชิ้นส่วน',
  TRANSFER_PENDING:      'รอโอนสต๊อก',
  PICKUP_WAITING:        'รอรับเครื่อง',
}

// ── Severity config ───────────────────────────────────────────────────────────

type Severity = 'CRITICAL' | 'WARNING' | 'INFO'

const SEV_CFG: Record<Severity, { icon: React.ElementType; card: string; text: string; badge: string }> = {
  CRITICAL: {
    icon:  AlertCircle,
    card:  'bg-red-50 border-red-300',
    text:  'text-red-700',
    badge: 'bg-red-600 text-white',
  },
  WARNING: {
    icon:  AlertTriangle,
    card:  'bg-amber-50 border-amber-200',
    text:  'text-amber-700',
    badge: 'bg-amber-500 text-white',
  },
  INFO: {
    icon:  AlertTriangle,
    card:  'bg-blue-50 border-blue-200',
    text:  'text-blue-700',
    badge: 'bg-blue-500 text-white',
  },
}

const TYPE_ICON: Record<string, React.ElementType> = {
  TRANSFER_PENDING:    ArrowRightLeft,
  TRANSFER_IN_TRANSIT: ArrowRightLeft,
  REPAIR_OVERDUE:      Wrench,
  LOW_STOCK:           Package,
}

// SUNMI severity style (dark theme)
const SUNMI_SEV: Record<Severity, string> = {
  CRITICAL: 'bg-red-950/90 border-red-500/50',
  WARNING:  'bg-amber-950/90 border-amber-500/50',
  INFO:     'bg-blue-950/90 border-blue-500/50',
}
const SUNMI_TEXT: Record<Severity, string> = {
  CRITICAL: 'text-red-300',
  WARNING:  'text-amber-300',
  INFO:     'text-blue-300',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ReminderPopupProps {
  variant?: 'desktop' | 'sunmi'
}

type QuickAction = { kind: 'approve' | 'receive'; transferId: string } | null

export function ReminderPopup({ variant = 'desktop' }: ReminderPopupProps) {
  const router   = useRouter()
  const qc       = useQueryClient()
  const user     = useAuthStore((s) => s.user)
  const hasPerm  = useAuthStore((s) => s.hasPermission)

  const [mounted, setMounted]             = useState(false)
  const [settings, setSettings]           = useState<ReminderSettings | null>(null)
  const [dismissed, setDismissed]         = useState<Set<string>>(new Set())
  const [quickAction, setQuickAction]     = useState<QuickAction>(null)
  const [snoozeAllPending, setSnoozeAllPending] = useState(false)
  const playedRef   = useRef<Set<string>>(new Set())
  const now         = useRef(new Date())

  // ── Phase 16 state ──────────────────────────────────────────────────────────
  // Anti-spam: tracks entityId → timestamp when sound last played (5-min window)
  const soundedAtRef    = useRef<Map<string, number>>(new Map())
  // Local dismiss for new reminder items (non-CRITICAL only, session-only)
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set())
  const isOwner = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    setMounted(true)
    now.current = new Date()
  }, [])

  // Load user settings once mounted
  useEffect(() => {
    if (!mounted || !user?.id) return
    setSettings(loadReminderSettings(user.id))
  }, [mounted, user?.id])

  const refetchMs = (settings?.intervalMinutes ?? 5) * 60_000

  const { data: rawAlerts = [] } = useQuery<OperationalAlert[]>({
    queryKey: ['operational-alerts', user?.branchId],
    queryFn:  async () => {
      const r = await api.get('/alerts/operational')
      return r.data
    },
    enabled:         mounted && !!settings?.enabled && hasPerm('notification.view'),
    staleTime:       refetchMs - 5_000,
    refetchInterval: refetchMs,
  })

  // ── Phase 16: new server-side reminders ────────────────────────────────────
  const ownerAllBranches = settings?.ownerAllBranches ?? true
  const scopeParam = isOwner && !ownerAllBranches ? 'branch' : 'all'

  const { data: rawReminderItems = [] } = useQuery<ReminderItem[]>({
    queryKey:  ['reminders', 'active', user?.id, scopeParam],
    queryFn:   async () => {
      const qs = isOwner && !ownerAllBranches ? '?scope=branch' : ''
      const r  = await api.get(`/reminders/active${qs}`)
      return r.data.items ?? []
    },
    enabled:         mounted && !!settings?.enabled && hasPerm('notification.view'),
    staleTime:       refetchMs - 5_000,
    refetchInterval: refetchMs,
  })

  const snoozeMut = useMutation({
    mutationFn: (vars: { entityType: string; entityId: string; minutes: 5 | 15 | 30 }) =>
      api.post('/reminders/snooze', vars),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['reminders', 'active'] })
      // Immediate local hide so the card vanishes before the next poll
      setLocalDismissed(prev => new Set([...Array.from(prev), vars.entityId]))
      toast.success(`เลื่อนการแจ้งเตือน ${vars.minutes} นาที`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  // Filter new reminder items by settings + local dismiss
  const visibleReminderItems = mounted && settings
    ? rawReminderItems.filter(item => {
        if (localDismissed.has(item.entityId)) return false
        if (item.type === 'VIP_REPAIR'            && !settings.vipRepair)    return false
        if (item.type === 'PARTS_REQUEST_PENDING' && !settings.partsRequest) return false
        if (item.type === 'PICKUP_WAITING'        && !settings.pickupWaiting) return false
        return true
      })
    : []

  // Apply escalation + filter by settings + filter dismissed
  const visibleAlerts = mounted && settings
    ? rawAlerts
        .filter((a) => {
          if (!['TRANSFER_PENDING', 'TRANSFER_IN_TRANSIT', 'REPAIR_OVERDUE'].includes(a.type)) return false
          if (a.type === 'REPAIR_OVERDUE'      && !settings.repairOverdue)     return false
          if (a.type === 'TRANSFER_PENDING'    && !settings.transferPending)   return false
          if (a.type === 'TRANSFER_IN_TRANSIT' && !settings.transferInTransit) return false
          const esc = escalateSeverity(a.type, a.createdAt, now.current) as Severity
          if (dismissed.has(a.id) || isDismissedReminder(a.id, esc)) return false
          return true
        })
        .map((a) => ({
          ...a,
          severity: escalateSeverity(a.type, a.createdAt, now.current) as Severity,
        }))
        .sort((a, b) => {
          const sev = { CRITICAL: 0, WARNING: 1, INFO: 2 }
          return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3)
        })
    : []

  // Sound + haptic for existing operational alerts (unchanged behaviour)
  useEffect(() => {
    if (!settings?.sound || !mounted) return
    const isSunmi = variant === 'sunmi' || settings.sunmi
    for (const a of visibleAlerts) {
      if (!playedRef.current.has(a.id)) {
        playedRef.current.add(a.id)
        const soundVariant = a.severity === 'CRITICAL' ? 'critical' : 'soft'
        playAlertSound(a.id + '_reminder', soundVariant, settings.sound)
        if (isSunmi && a.severity === 'CRITICAL') triggerHaptic()
      }
    }
  }, [visibleAlerts, settings, mounted, variant])

  // Sound for Phase 16 new reminder items — with 5-min anti-spam per entityId
  useEffect(() => {
    if (!settings?.sound || !mounted) return
    const isSunmi = variant === 'sunmi' || settings.sunmi
    const spamMs  = ANTI_SPAM_MINUTES * 60_000
    const nowMs   = Date.now()
    for (const item of visibleReminderItems) {
      const lastPlayed = soundedAtRef.current.get(item.entityId) ?? 0
      if (nowMs - lastPlayed < spamMs) continue   // within anti-spam window — skip
      soundedAtRef.current.set(item.entityId, nowMs)
      playTypedSound(item.type, item.severity, 0.75)
      if (isSunmi && item.severity === 'CRITICAL') triggerHaptic()
    }
  }, [visibleReminderItems, settings, mounted, variant])

  const dismiss = useCallback((id: string, severity: Severity) => {
    persistReminderDismiss(id, severity)
    setDismissed((prev) => { const n = new Set(Array.from(prev)); n.add(id); return n })
  }, [])

  // ── Mutations ────────────────────────────────────────────────────────────────

  const approveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/approve`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['operational-alerts'] })
      toast.success('อนุมัติคำขอแล้ว')
      setQuickAction(null)
      dismiss(id, 'WARNING')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const receiveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/receive`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['operational-alerts'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('รับสินค้าแล้ว สต๊อกถูกอัปเดตเรียบร้อย')
      setQuickAction(null)
      dismiss(id, 'WARNING')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const handleQuickConfirm = useCallback(() => {
    if (!quickAction) return
    if (quickAction.kind === 'approve') approveMut.mutate(quickAction.transferId)
    if (quickAction.kind === 'receive') receiveMut.mutate(quickAction.transferId)
  }, [quickAction, approveMut, receiveMut])

  const hasAnything = visibleAlerts.length > 0 || visibleReminderItems.length > 0
  if (!mounted || !settings?.enabled || !hasAnything) return null

  // UX-4: non-CRITICAL items that can be bulk-snoozed
  const snoozableItems = visibleReminderItems.filter(i => i.severity !== 'CRITICAL')
  const showSnoozeAll  = snoozableItems.length >= 2

  async function snoozeAll() {
    if (snoozeAllPending || snoozableItems.length === 0) return
    setSnoozeAllPending(true)
    try {
      await Promise.all(
        snoozableItems.map(item =>
          api.post('/reminders/snooze', { entityType: item.entityType, entityId: item.entityId, minutes: 15 }),
        ),
      )
      qc.invalidateQueries({ queryKey: ['reminders', 'active'] })
      setLocalDismissed(prev => new Set([...Array.from(prev), ...snoozableItems.map(i => i.entityId)]))
      toast.success(`เลื่อนทั้งหมด 15 นาที (${snoozableItems.length} รายการ)`)
    } catch {
      toast.error('เลื่อนการแจ้งเตือนไม่สำเร็จ')
    } finally {
      setSnoozeAllPending(false)
    }
  }

  const isMutating = approveMut.isPending || receiveMut.isPending

  // ── Action buttons per alert type ────────────────────────────────────────

  function renderActions(a: OperationalAlert & { severity: Severity }, desktop: boolean) {
    const btnCls = desktop
      ? 'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors'
      : 'flex items-center gap-1 rounded-xl h-10 px-3 text-sm font-semibold transition-colors'

    const primary   = desktop ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-600 text-white active:bg-blue-700'
    const secondary = desktop ? 'border border-slate-300 text-slate-600 hover:bg-slate-50' : 'border border-slate-600 text-slate-300'

    if (a.type === 'TRANSFER_PENDING') return (
      <div className="flex gap-2 mt-2 flex-wrap">
        <button
          className={cn(btnCls, primary)}
          onClick={(e) => { e.stopPropagation(); setQuickAction({ kind: 'approve', transferId: a.entityId }) }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
          อนุมัติ
        </button>
        <button
          className={cn(btnCls, secondary)}
          onClick={(e) => { e.stopPropagation(); dismiss(a.id, a.severity); router.push(a.actionUrl) }}
        >
          ดูรายการ
        </button>
      </div>
    )

    if (a.type === 'TRANSFER_IN_TRANSIT') return (
      <div className="flex gap-2 mt-2 flex-wrap">
        <button
          className={cn(btnCls, 'bg-green-600 text-white hover:bg-green-700')}
          onClick={(e) => { e.stopPropagation(); setQuickAction({ kind: 'receive', transferId: a.entityId }) }}
        >
          รับสินค้า
        </button>
        <button
          className={cn(btnCls, secondary)}
          onClick={(e) => { e.stopPropagation(); dismiss(a.id, a.severity); router.push(a.actionUrl) }}
        >
          ดูรายการ
        </button>
      </div>
    )

    if (a.type === 'REPAIR_OVERDUE') return (
      <div className="mt-2">
        <button
          className={cn(btnCls, primary)}
          onClick={(e) => { e.stopPropagation(); dismiss(a.id, a.severity); router.push(a.actionUrl) }}
        >
          เปิดงาน
        </button>
      </div>
    )

    return null
  }

  // ── Desktop popup ─────────────────────────────────────────────────────────

  if (variant === 'desktop') {
    return (
      <>
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-h-[80vh] overflow-y-auto">
          <AnimatePresence initial={false}>
            {/* ── Existing operational alert cards ── */}
            {visibleAlerts.slice(0, 4).map((a) => {
              const scfg = SEV_CFG[a.severity] ?? SEV_CFG.INFO
              const TypeIc = TYPE_ICON[a.type] ?? Wrench

              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -24, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.95 }}
                  transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                  className={cn(
                    'w-80 rounded-2xl border-2 shadow-xl p-4',
                    scfg.card,
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('shrink-0 rounded-xl p-2 mt-0.5', scfg.badge)}>
                      <TypeIc className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-sm font-bold leading-tight', scfg.text)}>{a.title}</p>
                        <button
                          onClick={() => dismiss(a.id, a.severity)}
                          className="shrink-0 p-0.5 rounded-lg text-slate-400 hover:text-slate-600"
                          aria-label="ปิด"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-snug">{a.message}</p>
                      {renderActions(a, true)}
                    </div>
                  </div>
                </motion.div>
              )
            })}

            {/* ── Phase 16: new reminder item cards ── */}
            {visibleReminderItems.slice(0, 4).map((item) => {
              const scfg   = SEV_CFG[item.severity] ?? SEV_CFG.INFO
              const TypeIc = REMINDER_TYPE_ICON[item.type] ?? Wrench
              const label  = REMINDER_TYPE_LABEL[item.type] ?? item.type

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -24, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.95 }}
                  transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                  className={cn(
                    'w-80 rounded-2xl border-2 shadow-xl p-4',
                    scfg.card,
                    item.severity === 'CRITICAL' && 'border-l-4 border-l-red-600',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('shrink-0 rounded-xl p-2 mt-0.5', scfg.badge)}>
                      <TypeIc className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-bold leading-tight', scfg.text)}>{item.title}</p>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60 text-slate-600">
                            {label}{item.branchName ? ` · ${item.branchName}` : ''}
                          </span>
                        </div>
                        {item.canDismiss && (
                          <button
                            onClick={() => setLocalDismissed(prev => new Set([...Array.from(prev), item.entityId]))}
                            className="shrink-0 p-0.5 rounded-lg text-slate-400 hover:text-slate-600"
                            aria-label="ปิด"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-snug">{item.message}</p>

                      {/* Snooze buttons — always shown */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {([5, 15, 30] as const).map(m => (
                          <button
                            key={m}
                            disabled={snoozeMut.isPending}
                            onClick={() => snoozeMut.mutate({ entityType: item.entityType, entityId: item.entityId, minutes: m })}
                            className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors"
                          >
                            {m} น.
                          </button>
                        ))}
                        <button
                          onClick={() => router.push(item.actionUrl)}
                          className={cn('flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-lg font-semibold transition-colors', scfg.badge)}
                        >
                          ไปดู <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>

                      {/* CRITICAL cannot-dismiss badge */}
                      {!item.canDismiss && (
                        <p className="text-[10px] text-red-600 font-semibold mt-1.5">
                          ⚠ ต้องดำเนินการก่อนปิด
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/* UX-4: Snooze-all button (desktop) — appears when 2+ non-CRITICAL items visible */}
        {showSnoozeAll && (
          <button
            onClick={snoozeAll}
            disabled={snoozeAllPending}
            className="w-80 mt-1 h-9 rounded-xl bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 transition-colors shadow-lg"
          >
            {snoozeAllPending ? 'กำลังเลื่อน...' : `เลื่อนทั้งหมด 15 นาที (${snoozableItems.length} รายการ)`}
          </button>
        )}

        {/* Quick-action confirm dialog */}
        {quickAction && (
          <ConfirmActionDialog
            open={!!quickAction}
            onClose={() => setQuickAction(null)}
            onConfirm={handleQuickConfirm}
            loading={isMutating}
            title={quickAction.kind === 'approve' ? 'ยืนยันอนุมัติคำขอโอน' : 'ยืนยันรับสินค้า'}
            description={
              quickAction.kind === 'approve'
                ? 'ต้องการอนุมัติให้สาขาต้นทางจัดส่งสินค้านี้หรือไม่?'
                : 'เมื่อกดยืนยัน ระบบจะเพิ่มสต๊อกเข้าสาขาปลายทางและลดสต๊อกจากสาขาต้นทาง'
            }
            variant={quickAction.kind === 'receive' ? 'success' : 'info'}
            confirmLabel={quickAction.kind === 'approve' ? 'อนุมัติ' : 'รับสินค้าแล้ว'}
          />
        )}
      </>
    )
  }

  // ── SUNMI popup ───────────────────────────────────────────────────────────

  return (
    <>
      <div className="fixed top-[56px] left-0 right-0 z-50 px-3 pt-2 space-y-2 pointer-events-none">
        <AnimatePresence initial={false}>
          {/* Existing operational alert cards */}
          {visibleAlerts.slice(0, 2).map((a) => {
            const TypeIc = TYPE_ICON[a.type] ?? Wrench
            const sevText = SUNMI_TEXT[a.severity] ?? SUNMI_TEXT.INFO

            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ type: 'spring', duration: 0.25, bounce: 0.1 }}
                className={cn(
                  'pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl',
                  SUNMI_SEV[a.severity] ?? SUNMI_SEV.INFO,
                )}
              >
                <div className="flex items-start gap-3">
                  <TypeIc className={cn('h-5 w-5 shrink-0 mt-0.5', sevText)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-bold', sevText)}>{a.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{a.message}</p>
                    {renderActions(a, false)}
                  </div>
                  <button
                    onClick={() => dismiss(a.id, a.severity)}
                    className="shrink-0 p-1 rounded-xl text-slate-500"
                    aria-label="ปิด"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )
          })}

          {/* Phase 16 new reminder item cards (SUNMI dark theme) */}
          {visibleReminderItems.slice(0, 2).map((item) => {
            const TypeIc  = REMINDER_TYPE_ICON[item.type] ?? Wrench
            const sevText = SUNMI_TEXT[item.severity] ?? SUNMI_TEXT.INFO

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ type: 'spring', duration: 0.25, bounce: 0.1 }}
                className={cn(
                  'pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl',
                  SUNMI_SEV[item.severity] ?? SUNMI_SEV.INFO,
                )}
              >
                <div className="flex items-start gap-3">
                  <TypeIc className={cn('h-5 w-5 shrink-0 mt-0.5', sevText)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-bold', sevText)}>{item.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.message}</p>
                    {/* Snooze row — touch-friendly (h-10 targets) */}
                    <div className="flex gap-2 mt-2">
                      {([5, 15, 30] as const).map(m => (
                        <button
                          key={m}
                          disabled={snoozeMut.isPending}
                          onClick={() => snoozeMut.mutate({ entityType: item.entityType, entityId: item.entityId, minutes: m })}
                          className="flex items-center justify-center h-9 px-3 rounded-xl bg-white/10 text-slate-200 text-xs font-semibold active:bg-white/20 transition-colors"
                        >
                          {m}น.
                        </button>
                      ))}
                      <button
                        onClick={() => router.push(item.actionUrl)}
                        className={cn('flex items-center h-9 px-3 rounded-xl text-xs font-semibold active:opacity-80', sevText, 'bg-white/10')}
                      >
                        ดู
                      </button>
                    </div>
                  </div>
                  {item.canDismiss && (
                    <button
                      onClick={() => setLocalDismissed(prev => new Set([...Array.from(prev), item.entityId]))}
                      className="shrink-0 p-1 rounded-xl text-slate-500"
                      aria-label="ปิด"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* UX-4: Snooze-all button (SUNMI) */}
      {showSnoozeAll && (
        <div className="fixed top-[56px] left-0 right-0 z-50 flex justify-center px-3 pt-1">
          <button
            onClick={snoozeAll}
            disabled={snoozeAllPending}
            className="pointer-events-auto w-full max-w-sm h-10 rounded-xl bg-slate-800/90 text-slate-200 text-sm font-semibold active:bg-slate-700 disabled:opacity-50 transition-colors shadow-xl"
          >
            {snoozeAllPending ? 'กำลังเลื่อน...' : `เลื่อนทั้งหมด 15 น. (${snoozableItems.length})`}
          </button>
        </div>
      )}

      {quickAction && (
        <ConfirmActionDialog
          open={!!quickAction}
          onClose={() => setQuickAction(null)}
          onConfirm={handleQuickConfirm}
          loading={isMutating}
          buttonSize="lg"
          title={quickAction.kind === 'approve' ? 'ยืนยันอนุมัติคำขอโอน' : 'ยืนยันรับสินค้า'}
          description={
            quickAction.kind === 'approve'
              ? 'ต้องการอนุมัติให้สาขาต้นทางจัดส่งสินค้านี้หรือไม่?'
              : 'เมื่อกดยืนยัน ระบบจะเพิ่มสต๊อกเข้าสาขาปลายทางและลดสต๊อกจากสาขาต้นทาง'
          }
          variant={quickAction.kind === 'receive' ? 'success' : 'info'}
          confirmLabel={quickAction.kind === 'approve' ? 'อนุมัติ' : 'รับสินค้าแล้ว'}
        />
      )}
    </>
  )
}
