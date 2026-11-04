'use client'

import { BranchQuickPick } from '@/components/layout/branch-context-bar'
import { CashBillReview } from '@/components/shift/cash-bill-review'
import { PartsPendingReminder } from '@/components/quick-cash/quick-cash-bar'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { FloatLeftField, LastCloseHint, openingFloatOf, useLastClose } from '@/components/shifts/shift-float'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Clock,
  RefreshCw,
  Loader2,
  ShoppingCart,
  Wallet,
  Smartphone,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  User,
  CalendarDays,
  TrendingUp,
  X,
  Printer,
  Wifi,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell,
} from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatThaiMoney } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { JoinShifts, LeaveShiftButton, isBranchShiftOpenError, useMyBranchHasOpenShift } from '@/components/shifts/join-shifts'
import { OpenShiftsAdmin } from '@/components/shifts/open-shifts-admin'
import { ClosedByOtherNotice } from '@/components/shift/long-shift-banner'
import { ShiftLedgerSheet } from '@/components/shifts/shift-ledger'
import { HandoverCard, HandoverPicker, usePendingHandover, WALLET_FIELD, type PendingHandover } from '@/components/shifts/handover'
import { ShiftCashMovements } from '@/components/shifts/cash-movements'
import {
  CLOSE_TIMEOUT_MS, DiffBadge, NOTE_REQUIRED_DIFF, SlowHint, nextOpeningOf, noteRequiredFor, printPage, useSlowHint,
} from '@/components/shifts/close-shift-parts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveShift {
  id: string
  openedAt: string
  openBalance: number
  note: string | null
  isActive: true
  user: { id: string; name: string }
  salesCount: number
  totalSales: number
  repairCount: number
  repairRevenue: number
  expectedCashBalance: number
  packageSalesByCarrier?: CarrierShiftSummary[]
  /** working in someone else's shift (one cash drawer, several people) */
  joined?: boolean
  members?: { userId: string; name: string }[]
}

interface CarrierShiftSummary {
  carrier: string
  salesCount: number
  salesAmount: number
  walletDeduction: number
  profit?: number
  topupCount: number
  topupAmount: number
}

interface ShiftRecord {
  id: string
  openedAt: string
  closedAt: string | null
  openBalance: number
  closeBalance: number | null
  note: string | null
  isActive: boolean
  user: { id: string; name: string }
}

interface CloseShiftResult {
  id: string
  openedAt: string
  closedAt: string
  openBalance: number
  closeBalance: number
  user: { id: string; name: string }
  summary: {
    salesCount: number
    totalSales: number
    paymentBreakdown: Record<string, number>
    repairPayments: {
      count: number
      totalAmount: number
      paymentBreakdown: Record<string, number>
    }
    cashManualIn?: number
    cashManualOut?: number
    cashRefunds?: number
    cashRepairRefunds?: number
    expectedBalance: number
    actualBalance: number
    difference: number
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const openSchema = z.object({
  openBalance: z.coerce.number().min(0, 'ต้องมากกว่าหรือเท่ากับ 0'),
  note: z.string().optional(),
})
type OpenForm = z.infer<typeof openSchema>

const closeSchema = z.object({
  closeBalance: z.coerce.number().min(0, 'ต้องมากกว่าหรือเท่ากับ 0'),
  note: z.string().optional(),
})
type CloseForm = z.infer<typeof closeSchema>

// ─── Config ───────────────────────────────────────────────────────────────────

const PAYMENT_CONFIG: Record<
  string,
  { label: string; Icon: React.ElementType; bg: string; border: string; text: string; icon: string }
> = {
  CASH:     { label: 'เงินสด',    Icon: Wallet,     bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  icon: 'text-green-600'  },
  TRANSFER: { label: 'โอนเงิน',  Icon: Smartphone,  bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   icon: 'text-blue-600'   },
  CARD:     { label: 'บัตร',     Icon: CreditCard,  bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-600' },
}

const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CARD'] as const

// ─── Page ─────────────────────────────────────────────────────────────────────

const CARRIERS = ['AIS', 'TRUE', 'DTAC', 'NT'] as const
type Carrier = typeof CARRIERS[number]

const CARRIER_COLORS: Record<Carrier, { bg: string; text: string; border: string }> = {
  AIS:  { bg: 'bg-red-50 dark:bg-red-900/20',    text: 'text-red-700 dark:text-red-400',    border: 'border-red-200 dark:border-red-800/60'  },
  TRUE: { bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-400',   border: 'border-blue-200 dark:border-blue-800/60' },
  DTAC: { bg: 'bg-sky-50 dark:bg-sky-900/20',     text: 'text-sky-700 dark:text-sky-400',     border: 'border-sky-200 dark:border-sky-800/60'  },
  NT:   { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/60' },
}

/** Opening exactly what the person leaving early counted ("ยอดตรง ยืนยันรับกะ"). */
function takeOver(h: PendingHandover): OpenForm & Record<string, unknown> {
  const body: OpenForm & Record<string, unknown> = { openBalance: h.cash, note: `รับกะต่อจาก ${h.fromName ?? ''}`, handoverFromShiftId: h.shiftId }
  for (const w of h.wallets) if (WALLET_FIELD[w.carrier] && Number(w.balance) !== 0) body[WALLET_FIELD[w.carrier]] = Number(w.balance)
  return body
}

export default function ShiftsPage() {
  const queryClient = useQueryClient()
  const [ledgerShiftId, setLedgerShiftId] = useState<string | null>(null)
  const { hasModule } = useAuthStore()
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeResult, setCloseResult] = useState<CloseShiftResult | null>(null)
  const [extrasOpen, setExtrasOpen] = useState(false)
  // What the next shift opens with after this close (null: handed over, no reopening here)
  const [nextOpening, setNextOpening] = useState<number | null>(null)
  const [paperSize, setPaperSize] = useState<'A4' | '80mm' | '58mm'>('80mm')
  const [walletInputs, setWalletInputs] = useState<Partial<Record<Carrier, string>>>({})
  // Leaving early: who takes the drawer over; taking over: the shift handed to me
  const [handoverTo, setHandoverTo] = useState('')
  const [handoverFrom, setHandoverFrom] = useState<string | null>(null)
  const { isGlobalMode } = useBranchContext()
  const showWalletReconcile = hasModule('package_sales')

  // ── Queries ──
  const { data: currentShift, isLoading: loadingCurrent } =
    useQuery<ActiveShift | null>({
      queryKey: ['shifts', 'current'],
      queryFn: async () => (await api.get('/shifts/current')).data,
      staleTime: 30_000,
    })

  const { data: history = [], isLoading: loadingHistory } =
    useQuery<ShiftRecord[]>({
      queryKey: ['shifts', 'history'],
      queryFn: async () => (await api.get('/shifts')).data,
      staleTime: 60_000,
    })

  const { data: walletBalances = [] } =
    useQuery<{ carrier: string; balance: number }[]>({
      queryKey: ['carrier-wallet', 'balances'],
      queryFn: async () => (await api.get('/carrier-wallet/balances')).data,
      staleTime: 30_000,
      enabled: showWalletReconcile,
    })

  const { data: handover } = usePendingHandover(!loadingCurrent && !currentShift)
  const branchShiftOpen = useMyBranchHasOpenShift(!loadingCurrent && !currentShift)

  // ── Forms ──
  const openForm = useForm<OpenForm>({
    resolver: zodResolver(openSchema),
    defaultValues: { openBalance: 0, note: '' },
  })

  const closeForm = useForm<CloseForm>({
    resolver: zodResolver(closeSchema),
    defaultValues: { closeBalance: 0, note: '' },
  })
  const [floatLeft, setFloatLeft] = useState('')

  // Open with the float the last close left in the drawer (still editable)
  const { data: lastClose } = useLastClose(!loadingCurrent && !currentShift)
  useEffect(() => {
    const float = openingFloatOf(lastClose)
    if (float != null && !openForm.formState.dirtyFields.openBalance) openForm.setValue('openBalance', float)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastClose])

  // ── Mutations ──
  const openMutation = useMutation({
    mutationFn: async (data: OpenForm & Record<string, unknown>) =>
      (await api.post('/shifts/open', data)).data,
    onSuccess: (res: { walletCheck?: { carrier: string; difference: number }[] }, data) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['carrier-wallet'] })
      openForm.reset()
      setHandoverFrom(null)
      toast.success(data.handoverFromShiftId ? 'รับกะแล้ว — เริ่มขายได้เลย' : 'เปิดกะสำเร็จ')
      const off = (res?.walletCheck ?? []).filter((w) => Math.abs(w.difference) >= 1)
      if (off.length > 0) {
        toast.warning(`ยอดกระเป๋าไม่ตรงกับระบบ: ${off.map((w) => `${w.carrier} ${w.difference > 0 ? '+' : ''}${formatThaiMoney(w.difference)}`).join(', ')} — แจ้งเจ้าของร้านแล้ว`, { duration: 8000 })
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
      // Someone opened this branch's shift a moment ago: show it to join
      if (isBranchShiftOpenError(err)) queryClient.invalidateQueries({ queryKey: ['shifts', 'joinable'] })
    },
  })

  const closeMutation = useMutation({
    mutationFn: async (data: CloseForm) => {
      const fresh = await queryClient.fetchQuery<{ id: string; joined?: boolean } | null>({
        queryKey: ['shifts', 'current'],
        queryFn: async () => (await api.get('/shifts/current')).data,
        staleTime: 0,
      })
      const shiftId = fresh?.id
      if (!shiftId) throw new Error('ไม่พบกะที่เปิดอยู่')

      // Reconcile carrier wallets if any inputs were filled (the opener only, in a shared shift)
      if (showWalletReconcile && !fresh?.joined) {
        const entries = CARRIERS
          .filter((c) => walletInputs[c] !== undefined && walletInputs[c] !== '')
          .map((c) => ({ carrier: c, actualBalance: Number(walletInputs[c]) }))
        if (entries.length > 0) {
          await api.post('/carrier-wallet/reconcile', { entries, shiftId })
        }
      }

      return (await api.post(`/shifts/${shiftId}/close`, {
        ...data,
        handoverToUserId: handoverTo || undefined,
        ...(!handoverTo && floatLeft !== '' ? { floatLeft: Number(floatLeft) || 0 } : {}),
      }, { timeout: CLOSE_TIMEOUT_MS })).data
    },
    onSuccess: (result: CloseShiftResult, data) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      queryClient.invalidateQueries({ queryKey: ['carrier-wallet'] })
      // The window stays open on the result: print, and open the next shift in one tap
      setNextOpening(handoverTo ? null : nextOpeningOf(Number(data.closeBalance) || 0, floatLeft))
      setFloatLeft('')
      setExtrasOpen(false)
      setCloseResult(result)
      setWalletInputs({})
      closeForm.reset()
      const to = (currentShift?.members ?? []).find((m) => m.userId === handoverTo)
      toast.success(to ? `ปิดกะแล้ว — ส่งต่อให้ ${to.name} รอเขากดยืนยันรับกะ` : 'ปิดกะสำเร็จ')
      setHandoverTo('')
    },
    onError: (err: any) => {
      // No answer in time: the close may still have gone through, so look before trying again
      if (err?.code === 'ECONNABORTED') {
        toast.error('ระบบตอบช้า — ตรวจสอบสถานะกะแล้วลองกดปิดกะอีกครั้ง')
        queryClient.invalidateQueries({ queryKey: ['shifts'] })
        return
      }
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })
  const closeSlow = useSlowHint(closeMutation.isPending)

  // Prints the close report without leaving this page (a new tab used to leave people stranded)
  const printCloseReport = (r: CloseShiftResult) => {
    const p = new URLSearchParams({
      staffName:       r.user.name,
      openedAt:        r.openedAt,
      closedAt:        r.closedAt,
      openBalance:     String(r.openBalance),
      closeBalance:    String(r.summary.actualBalance),
      expectedBalance: String(r.summary.expectedBalance),
      difference:      String(r.summary.difference),
      paper:           paperSize,
    })
    printPage(`/print/daily-close/${format(new Date(r.closedAt), 'yyyy-MM-dd')}?${p.toString()}`)
  }

  // From the "shift open too long" reminder: straight to counting
  useEffect(() => {
    if (!currentShift?.id || typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('close') === '1') {
      closeForm.reset({ closeBalance: '' as unknown as number, note: '' }); setCloseResult(null); setCloseOpen(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShift?.id])

  // ── Balance mismatch guard ──
  const closeBalanceWatch = closeForm.watch('closeBalance')
  const closeNoteWatch = closeForm.watch('note')
  const closeBalanceNum = Number(closeBalanceWatch) || 0
  const rawExpectedCash = Number(currentShift?.expectedCashBalance ?? 0)
  const expectedCashNegative = rawExpectedCash < 0
  const expectedCash = Math.max(0, rawExpectedCash)  // ลิ้นชักไม่มีทางติดลบ
  const balanceDiff = closeBalanceNum - expectedCash
  const closeBalanceTyped = closeBalanceWatch !== undefined && String(closeBalanceWatch) !== ''
  const balanceMismatch =
    currentShift?.expectedCashBalance !== undefined && closeBalanceTyped &&
    closeBalanceNum !== expectedCash
  // A few baht off needs no explanation; more than NOTE_REQUIRED_DIFF does
  const mustExplain = closeBalanceTyped && noteRequiredFor(balanceDiff)
  const noteRequired = mustExplain && !closeNoteWatch?.trim()

  // ── Helpers ──
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shifts'] })

  const fmtDateTime = (d: string) =>
    format(new Date(d), 'dd MMM yyyy · HH:mm', { locale: th })

  const fmtDate = (d: string) =>
    format(new Date(d), 'dd MMM yy HH:mm', { locale: th })

  const diffCls = (diff: number) => {
    if (diff > 0) return { card: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/60', text: 'text-blue-700 dark:text-blue-400', label: 'เงินเกิน' }
    if (diff < 0) return { card: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60', text: 'text-red-700 dark:text-red-400', label: 'เงินขาด' }
    return { card: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60', text: 'text-emerald-700 dark:text-emerald-400', label: 'ยอดตรง' }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="เปิด / ปิดกะ"
        icon={Clock}
        subtitle="จัดการกะพนักงานประจำวัน"
        secondaryActions={<BranchContextBar className="hidden sm:flex" />}
        primaryAction={
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">รีเฟรช</span>
          </Button>
        }
      />

      {/* ── Current Shift Block ── */}
      {!loadingCurrent && <OpenShiftsAdmin excludeId={currentShift?.id} />}

      {loadingCurrent ? (
        <SectionCard>
          <div className="flex items-center justify-center h-44 gap-2 text-slate-400">
            <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            <span>กำลังโหลดสถานะกะ...</span>
          </div>
        </SectionCard>
      ) : currentShift ? (
        /* Active shift */
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-900/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">กะปัจจุบัน — กำลังดำเนินการ</span>
            <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setLedgerShiftId(currentShift.id)}>รายการเงิน</Button>
            {currentShift.joined && <LeaveShiftButton onLeft={refresh} className="h-8" />}
          </div>
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {currentShift.joined ? `ร่วมกะของ ${currentShift.user.name}` : currentShift.user.name}
                {(currentShift.members ?? []).length > 0 && (
                  <span className="text-muted-foreground"> · ร่วมกะ: {(currentShift.members ?? []).map((m: { name: string }) => m.name).join(', ')}</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                เปิดเมื่อ {fmtDateTime(currentShift.openedAt)}
              </span>
              {currentShift.note && (
                <span className="text-muted-foreground text-xs">
                  หมายเหตุ: {currentShift.note}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">เงินเริ่มต้น</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(Number(currentShift.openBalance))}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-blue-500 mb-1">ยอดขายสินค้า</p>
                <p className="font-bold text-sm tabular-nums text-blue-700">
                  {formatThaiMoney(Number(currentShift.totalSales))}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{currentShift.salesCount} บิล</p>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-purple-500 mb-1">รายรับงานซ่อม</p>
                <p className="font-bold text-sm tabular-nums text-purple-700">
                  {formatThaiMoney(Number(currentShift.repairRevenue ?? 0))}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{currentShift.repairCount ?? 0} งาน</p>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-emerald-500 mb-1">รายรับรวม</p>
                <p className="font-bold text-sm tabular-nums text-emerald-700">
                  {formatThaiMoney(Number(currentShift.totalSales) + Number(currentShift.repairRevenue ?? 0))}
                </p>
              </div>
            </div>

            {/* Expected cash */}
            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 px-4 py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>เงินสดที่ควรมีในลิ้นชัก</span>
              </div>
              {/* Was "income in the shift" but added the opening cash; the drawer figure is what
                  the cashier checks against */}
              <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                {formatThaiMoney(Math.max(0, Number(currentShift.expectedCashBalance ?? 0)))}
              </span>
            </div>

            <ShiftCashMovements shiftId={currentShift.id} />

            <div className="flex justify-end pt-1">
              <Button
                variant="destructive"
                onClick={() => { closeForm.reset({ closeBalance: '' as unknown as number, note: '' }); setCloseResult(null); setCloseOpen(true) }}
                className="gap-2"
              >
                <Clock className="h-4 w-4" />
                ปิดกะ
              </Button>
            </div>
          </div>
        </div>
      ) : isGlobalMode ? (
        /* Global mode — cannot open shift without a branch */
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-900/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-8 flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_4px_12px_rgba(37,99,235,0.30)]">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white">กรุณาเลือกสาขาก่อนเปิดกะ</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">เลือกสาขาที่จะเปิดกะ</p>
          </div>
          <BranchQuickPick className="justify-center" />
        </div>
      ) : (
        /* No active shift — join a colleague's shift (one drawer) or open one */
        <div className="space-y-4">
        {handover && !handoverFrom && (
          <HandoverCard
            pending={handover}
            busy={openMutation.isPending}
            onConfirm={() => openMutation.mutate(takeOver(handover))}
            onEdit={() => { setHandoverFrom(handover.shiftId); openForm.setValue('openBalance', handover.cash); openForm.setValue('note', `รับกะต่อจาก ${handover.fromName ?? ''}`) }}
          />
        )}
        {handoverFrom && (
          <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">
            รับกะต่อจาก {handover?.fromName} — ใส่เงินสดที่นับได้จริงแล้วกด “ยืนยันรับกะ” (ยอดที่ไม่ตรงจะแจ้งเจ้าของร้าน)
          </p>
        )}
        <ClosedByOtherNotice />
        {!handoverFrom && <JoinShifts onJoined={refresh} />}
        {branchShiftOpen && !handoverFrom ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            หนึ่งสาขาเปิดได้หนึ่งกะ (ลิ้นชักเดียว) — กด “เข้าร่วมกะ” ด้านบนเพื่อเริ่มขาย
          </p>
        ) : (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-6 sm:p-8">
          <div className="flex flex-col items-center text-center gap-4 mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_8px_24px_rgba(16,185,129,0.35)]">
              <Clock className="h-10 w-10 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">เปิดกะใหม่</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">กรอกเงินสดเริ่มต้นในลิ้นชักก่อนเริ่มขาย</p>
            </div>
          </div>

          <form
            onSubmit={openForm.handleSubmit((data) => openMutation.mutate(handoverFrom ? { ...data, handoverFromShiftId: handoverFrom } : data))}
            className="space-y-4 max-w-sm mx-auto"
          >
            <div className="space-y-1.5">
              <Label htmlFor="openBalance" className="text-sm font-semibold">เงินสดเริ่มต้น (บาท)</Label>
              <LastCloseHint last={lastClose} current={Number(openForm.watch('openBalance')) || 0}
                onUse={(n) => openForm.setValue('openBalance', n, { shouldDirty: true })} />
              <Input
                id="openBalance"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                autoFocus
                {...openForm.register('openBalance')}
                className={`h-12 text-lg text-center font-bold tabular-nums ${openForm.formState.errors.openBalance ? 'border-red-400 focus-visible:ring-red-400' : 'border-emerald-300 focus-visible:ring-emerald-400'}`}
              />
              {openForm.formState.errors.openBalance && (
                <p className="text-xs text-red-500">{openForm.formState.errors.openBalance.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="openNote" className="text-sm font-semibold">หมายเหตุ (ไม่บังคับ)</Label>
              <Input id="openNote" placeholder="เช่น กะเช้า, กะบ่าย..." {...openForm.register('note')} />
              <div className="flex gap-2 flex-wrap pt-0.5">
                {['กะเช้า', 'กะบ่าย', 'กะค่ำ'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => openForm.setValue('note', label)}
                    className="rounded-full border border-emerald-200 dark:border-emerald-700/60 bg-white dark:bg-transparent text-emerald-700 dark:text-emerald-400 text-xs px-3 py-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              type="submit"
              disabled={openMutation.isPending}
              className="w-full gap-2 h-11 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              {openMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              {handoverFrom ? 'ยืนยันรับกะ' : 'เปิดกะ'}
            </Button>
          </form>
        </div>
        )}
        </div>
      )}

      {/* ── Close Shift Result Card ── */}
      {closeResult && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/30 dark:bg-blue-900/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
              <CheckCircle2 className="h-4 w-4" />
              ผลการปิดกะ
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                onClick={() => printCloseReport(closeResult)}
              >
                <Printer className="h-3.5 w-3.5" />
                พิมพ์รายงาน
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-900" onClick={() => setCloseResult(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            ปิดเมื่อ {fmtDateTime(closeResult.closedAt)} · พนักงาน: {closeResult.user.name}
          </p>

          {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">ยอดขายรวม</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(closeResult.summary.totalSales)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {closeResult.summary.salesCount} บิล
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">ยอดเงินสดคาด</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(closeResult.summary.expectedBalance)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">เงินสดจริง</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(closeResult.summary.actualBalance)}
                </p>
              </div>
              {(() => {
                const d = closeResult.summary.difference
                const { card, text, label } = diffCls(d)
                return (
                  <div className={`rounded-xl border text-center py-3 px-2 ${card}`}>
                    <p className={`text-[10px] mb-1 font-semibold ${text}`}>{label}</p>
                    <p className={`font-bold text-sm tabular-nums ${text}`}>
                      {d === 0 ? '—' : formatThaiMoney(Math.abs(d))}
                    </p>
                  </div>
                )
              })()}
            </div>

            {/* Payment breakdown — Sales */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                รายรับขายสินค้า แยกตามช่องทาง
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((method) => {
                  const cfg = PAYMENT_CONFIG[method]
                  const Icon = cfg.Icon
                  const amt = closeResult.summary.paymentBreakdown[method] ?? 0
                  return (
                    <div
                      key={method}
                      className={`rounded-xl border text-center py-3 px-2 ${cfg.bg} ${cfg.border}`}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1.5">
                        <Icon className={`h-3.5 w-3.5 ${cfg.icon}`} />
                        <span className={`text-[10px] font-semibold ${cfg.text}`}>{cfg.label}</span>
                      </div>
                      <p className={`font-bold text-sm tabular-nums ${cfg.text}`}>
                        {formatThaiMoney(amt)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Repair payments breakdown */}
            {(closeResult.summary.repairPayments?.count ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  รายรับงานซ่อม ({closeResult.summary.repairPayments.count} งาน · {formatThaiMoney(closeResult.summary.repairPayments.totalAmount)}) แยกตามช่องทาง
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((method) => {
                    const cfg = PAYMENT_CONFIG[method]
                    const Icon = cfg.Icon
                    const amt = closeResult.summary.repairPayments.paymentBreakdown[method] ?? 0
                    return (
                      <div
                        key={method}
                        className={`rounded-xl border text-center py-3 px-2 ${cfg.bg} ${cfg.border} opacity-80`}
                      >
                        <div className="flex items-center justify-center gap-1 mb-1.5">
                          <Icon className={`h-3.5 w-3.5 ${cfg.icon}`} />
                          <span className={`text-[10px] font-semibold ${cfg.text}`}>{cfg.label}</span>
                        </div>
                        <p className={`font-bold text-sm tabular-nums ${cfg.text}`}>
                          {formatThaiMoney(amt)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Cash in / out of the drawer by hand, and cash given back to customers */}
            {(() => {
              const sm = closeResult.summary
              const back = (sm.cashRefunds ?? 0) + (sm.cashRepairRefunds ?? 0)
              const rows = [
                ...((sm.cashManualIn ?? 0) > 0 ? [['รับเงินเข้าลิ้นชัก', `+${formatThaiMoney(sm.cashManualIn ?? 0)}`, 'text-emerald-700']] : []),
                ...((sm.cashManualOut ?? 0) > 0 ? [['นำเงินออกจากลิ้นชัก', `−${formatThaiMoney(sm.cashManualOut ?? 0)}`, 'text-red-600']] : []),
                ...(back > 0 ? [['คืนเงินสดลูกค้า', `−${formatThaiMoney(back)}`, 'text-red-600']] : []),
              ]
              if (!rows.length) return null
              return (
                <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 px-3 py-2 space-y-1 text-sm">
                  {rows.map(([label, value, cls]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
        </div>
      )}

      {/* ── Close Shift Dialog: count → close → print / open the next shift ── */}
      <Dialog
        open={closeOpen}
        onOpenChange={(v) => {
          if (!v && !closeMutation.isPending) { setCloseOpen(false); setWalletInputs({}); setExtrasOpen(false) }
        }}
      >
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          {closeResult ? (
            /* ── Step 2: closed ── */
            <div>
              <div className="flex items-center gap-4 px-6 pt-6 pb-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">ปิดกะเรียบร้อย</DialogTitle>
                  <p className="text-sm text-muted-foreground">{fmtDateTime(closeResult.closedAt)} · {closeResult.user.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 px-6 pb-5 sm:grid-cols-4">
                {[
                  ['ยอดขายรวม', formatThaiMoney(closeResult.summary.totalSales), ''],
                  ['เงินสดที่ควรมี', formatThaiMoney(closeResult.summary.expectedBalance), ''],
                  ['นับได้', formatThaiMoney(closeResult.summary.actualBalance), ''],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-bold tabular-nums">{value}</p>
                  </div>
                ))}
                {(() => {
                  const { card, text, label } = diffCls(closeResult.summary.difference)
                  return (
                    <div className={`rounded-xl border px-3 py-2.5 ${card}`}>
                      <p className={`text-xs font-semibold ${text}`}>{label}</p>
                      <p className={`text-lg font-bold tabular-nums ${text}`}>{closeResult.summary.difference === 0 ? 'ตรง' : formatThaiMoney(Math.abs(closeResult.summary.difference))}</p>
                    </div>
                  )
                })()}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-700/60">
                <div className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  กระดาษ
                  {(['80mm', '58mm', 'A4'] as const).map((size) => (
                    <button key={size} type="button" onClick={() => setPaperSize(size)}
                      className={`rounded-md border px-2 py-1 font-semibold ${paperSize === size ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30' : 'border-slate-200 dark:border-slate-600'}`}>
                      {size}
                    </button>
                  ))}
                </div>
                <Button type="button" variant="outline" className="gap-2" onClick={() => printCloseReport(closeResult)}>
                  <Printer className="h-4 w-4" /> พิมพ์รายงาน
                </Button>
                {nextOpening != null && !isGlobalMode && (
                  <Button type="button" className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={openMutation.isPending}
                    onClick={() => openMutation.mutate({ openBalance: nextOpening, note: '' }, { onSuccess: () => { setCloseOpen(false); setCloseResult(null) } })}>
                    {openMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                    เปิดกะใหม่ (เริ่ม {formatThaiMoney(nextOpening)})
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setCloseOpen(false)}>ปิดหน้าต่าง</Button>
              </div>
            </div>
          ) : (
          /* ── Step 1: count the drawer ── */
          <form
            onSubmit={closeForm.handleSubmit((data) => {
              if (!closeBalanceTyped) {
                closeForm.setError('closeBalance', { message: 'กรอกยอดเงินที่นับได้' })
                return
              }
              if (noteRequired) {
                closeForm.setError('note', { message: `ยอดต่างเกิน ${formatThaiMoney(NOTE_REQUIRED_DIFF)} — กรุณาบอกสาเหตุสั้นๆ` })
                return
              }
              closeMutation.mutate(data)
            })}
          >
            <DialogHeader className="border-b border-slate-100 px-6 py-4 dark:border-slate-700/60">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-red-500" />
                ปิดกะ
              </DialogTitle>
            </DialogHeader>

            <div className="grid max-h-[70vh] overflow-y-auto md:grid-cols-[300px_1fr]">
              {/* Left: what the shift took in, and what the drawer should hold */}
              {currentShift && (
                <div className="space-y-2 border-b border-slate-100 bg-slate-50 px-5 py-4 text-sm md:border-b-0 md:border-r dark:border-slate-700/60 dark:bg-slate-800/40">
                  <p className="text-xs text-muted-foreground">
                    กะของ {currentShift.user.name} · เปิด {fmtDateTime(currentShift.openedAt)}
                  </p>
                  <div className="flex justify-between"><span>ขายสินค้า {currentShift.salesCount} บิล</span><b className="tabular-nums">{formatThaiMoney(Number(currentShift.totalSales))}</b></div>
                  <div className="flex justify-between"><span>งานซ่อม {currentShift.repairCount ?? 0} งาน</span><b className="tabular-nums">{formatThaiMoney(Number(currentShift.repairRevenue ?? 0))}</b></div>
                  <div className="flex justify-between"><span>เงินเริ่มต้น</span><b className="tabular-nums">{formatThaiMoney(Number(currentShift.openBalance))}</b></div>
                  <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                    <p className="text-xs text-muted-foreground">เงินสดที่ควรมีในลิ้นชัก</p>
                    <p className="text-3xl font-bold tabular-nums">{formatThaiMoney(expectedCash)}</p>
                    {expectedCashNegative && (
                      <p className="mt-1 text-xs text-amber-700">รายจ่ายเกินเงินสด (คำนวณได้ {formatThaiMoney(rawExpectedCash)}) — กรอกเงินที่นับได้จริง</p>
                    )}
                  </div>
                </div>
              )}

              {/* Right: count, and close */}
              <div className="space-y-3 px-5 py-4">
                <PartsPendingReminder />
                {currentShift?.id && <CashBillReview shiftId={currentShift.id} />}
                <div className="space-y-1.5">
                  <Label htmlFor="closeBalance" className="text-base font-bold">นับเงินในลิ้นชักได้เท่าไหร่ (บาท)</Label>
                  <Input
                    id="closeBalance"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    autoFocus
                    {...closeForm.register('closeBalance')}
                    className={`h-16 text-right text-4xl font-bold tabular-nums ${closeForm.formState.errors.closeBalance ? 'border-red-400' : balanceMismatch ? 'border-amber-400' : ''}`}
                  />
                  {closeForm.formState.errors.closeBalance && (
                    <p className="text-xs text-red-500">{closeForm.formState.errors.closeBalance.message}</p>
                  )}
                </div>
                {closeBalanceTyped && <DiffBadge diff={balanceDiff} />}

                {/* A note only when the difference is worth explaining */}
                {mustExplain && (
                  <div className="space-y-1.5">
                    <Label htmlFor="closeNote">หมายเหตุ <span className="text-red-500">*</span> <span className="text-xs font-normal text-muted-foreground">(ขาด/เกินเกิน {formatThaiMoney(NOTE_REQUIRED_DIFF)})</span></Label>
                    <Input id="closeNote" placeholder="เช่น ทอนเงินผิด, ลืมคีย์บิล..." {...closeForm.register('note')}
                      className={closeForm.formState.errors.note ? 'border-red-400 focus-visible:ring-red-400' : ''} />
                    {closeForm.formState.errors.note && <p className="text-xs text-red-500">{closeForm.formState.errors.note.message}</p>}
                  </div>
                )}

                {/* The rest is rarely needed: folded away */}
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                  <button type="button" onClick={() => setExtrasOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-600 dark:text-slate-300">
                    <span>เพิ่มเติม (ไม่บังคับ){!extrasOpen && ' — เงินทอนที่เหลือ · ส่งต่อกะ · หมายเหตุ'}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${extrasOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {extrasOpen && (
                    <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
                      {!handoverTo && <FloatLeftField counted={closeBalanceNum} value={floatLeft} onChange={setFloatLeft} />}
                      {!currentShift?.joined && (
                        <HandoverPicker people={currentShift?.members ?? []} value={handoverTo} onChange={setHandoverTo} />
                      )}
                      {!mustExplain && (
                        <div className="space-y-1.5">
                          <Label htmlFor="closeNote">หมายเหตุ</Label>
                          <Input id="closeNote" placeholder="เช่น ครบตามยอด..." {...closeForm.register('note')} />
                        </div>
                      )}
                {/* ── Carrier wallet reconciliation (package_sales module only) ── */}
                {showWalletReconcile && currentShift?.joined && (
                  <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-muted-foreground">
                    ยอดกระเป๋าค่ายตรวจโดยคนเปิดกะ ({currentShift.user.name})
                  </p>
                )}
                {showWalletReconcile && !currentShift?.joined && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60">
                      <Wifi className="h-3.5 w-3.5 text-slate-500" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">ตรวจสอบกระเป๋าค่าย (ไม่บังคับ)</p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/40">
                      {CARRIERS.map((carrier) => {
                        const recorded = walletBalances.find((w) => w.carrier === carrier)?.balance ?? 0
                        const shiftSum = currentShift?.packageSalesByCarrier?.find((c) => c.carrier === carrier)
                        const rawInput = walletInputs[carrier]
                        const actual   = rawInput !== undefined && rawInput !== '' ? Number(rawInput) : null
                        const diff     = actual !== null ? Math.round((actual - recorded) * 100) / 100 : null
                        const clr      = CARRIER_COLORS[carrier]
                        return (
                          <div key={carrier} className="px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${clr.bg} ${clr.text} ${clr.border} border`}>
                                {carrier}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                ระบบ: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatThaiMoney(recorded)}</span>
                              </span>
                            </div>
                            {shiftSum && (shiftSum.salesCount > 0 || shiftSum.topupCount > 0) && (
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                                <span>ขาย {shiftSum.salesCount} รายการ <span className="font-semibold text-slate-700 dark:text-slate-300">{formatThaiMoney(shiftSum.salesAmount)}</span></span>
                                {shiftSum.profit != null && <span>กำไร <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatThaiMoney(shiftSum.profit)}</span></span>}
                                <span>เติมกระเป๋า <span className="font-semibold text-slate-700 dark:text-slate-300">{formatThaiMoney(shiftSum.topupAmount)}</span></span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder={`ยอดจริงใน${carrier} app`}
                                value={walletInputs[carrier] ?? ''}
                                onChange={(e) => setWalletInputs((prev) => ({ ...prev, [carrier]: e.target.value }))}
                                className="h-7 text-sm"
                              />
                              {diff !== null && (
                                <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {diff === 0 ? 'ตรง' : diff > 0 ? `+${formatThaiMoney(diff)}` : formatThaiMoney(diff)}
                                </span>
                              )}
                            </div>
                            {diff !== null && diff < 0 && (
                              <p className="flex items-center gap-1 text-[11px] text-red-600">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                ยอดขาด {formatThaiMoney(Math.abs(diff))} — อาจมีการขายที่ไม่บันทึก
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                    </div>
                  )}
                </div>
                <SlowHint show={closeSlow} />
              </div>
            </div>

            <DialogFooter className="flex-row items-center gap-2 border-t border-slate-100 px-6 py-3 dark:border-slate-700/60">
              <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">
                กด <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 font-sans dark:border-slate-600 dark:bg-slate-800">Enter</kbd> เพื่อปิดกะ
              </span>
              <Button type="button" variant="outline" onClick={() => setCloseOpen(false)} disabled={closeMutation.isPending}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="destructive" disabled={closeMutation.isPending} className="min-w-[120px] gap-2">
                {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                {handoverTo ? 'ปิดกะและส่งต่อ' : 'ปิดกะ'}
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Shift History ── */}
      {/* ── Shift History ── */}
      <SectionCard title="ประวัติกะทั้งหมด" icon={CalendarDays} noPadding>
        {loadingHistory ? (
          <div className="flex items-center justify-center h-32 gap-2 text-slate-400">
            <div className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            <span className="text-sm">กำลังโหลด...</span>
          </div>
        ) : history.length === 0 ? (
          <EmptyState preset="shifts" size="sm" />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <DataTable>
                <DataTableHead>
                  <DataTableHeadCell>วันที่เปิด</DataTableHeadCell>
                  <DataTableHeadCell>วันที่ปิด</DataTableHeadCell>
                  <DataTableHeadCell>พนักงาน</DataTableHeadCell>
                  <DataTableHeadCell right>ยอดเริ่มต้น</DataTableHeadCell>
                  <DataTableHeadCell right>ยอดปิด</DataTableHeadCell>
                  <DataTableHeadCell>หมายเหตุ</DataTableHeadCell>
                  <DataTableHeadCell className="text-center">สถานะ</DataTableHeadCell>
                  <DataTableHeadCell className="text-center"></DataTableHeadCell>
                </DataTableHead>
                <DataTableBody>
                  {history.map((shift) => (
                    <DataTableRow key={shift.id}>
                      <DataTableCell className="whitespace-nowrap text-slate-700 text-xs">{fmtDate(shift.openedAt)}</DataTableCell>
                      <DataTableCell muted className="whitespace-nowrap text-xs">{shift.closedAt ? fmtDate(shift.closedAt) : '—'}</DataTableCell>
                      <DataTableCell className="text-slate-700 text-xs">{shift.user.name}</DataTableCell>
                      <DataTableCell right className="tabular-nums font-medium text-xs">{formatThaiMoney(Number(shift.openBalance))}</DataTableCell>
                      <DataTableCell right className="tabular-nums font-medium text-xs">{shift.closeBalance != null ? formatThaiMoney(Number(shift.closeBalance)) : '—'}</DataTableCell>
                      <DataTableCell muted className="max-w-[140px] truncate text-xs">{shift.note ?? '—'}</DataTableCell>
                      <DataTableCell className="text-center">
                        {shift.isActive
                          ? <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-semibold">กำลังเปิด</span>
                          : <span className="rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold">ปิดแล้ว</span>
                        }
                      </DataTableCell>
                      <DataTableCell className="text-center">
                        <button
                          onClick={() => setLedgerShiftId(shift.id)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded px-1.5 py-1 transition-colors"
                          title="รายการเงินในกะ — ใครรับเท่าไหร่"
                        >
                          รายการเงิน
                        </button>
                        <button
                          onClick={() => {
                            const date = format(new Date(shift.openedAt), 'yyyy-MM-dd')
                            const p = new URLSearchParams({
                              staffName: shift.user.name,
                              openedAt: shift.openedAt,
                              closedAt: shift.closedAt ?? '',
                              openBalance: String(shift.openBalance),
                              closeBalance: String(shift.closeBalance ?? ''),
                              paper: '80mm',
                            })
                            window.open(`/print/daily-close/${date}?${p.toString()}`, '_blank')
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-1.5 py-1 transition-colors"
                          title="พิมพ์รายงานกะนี้"
                        >
                          <Printer className="h-3 w-3" />
                          พิมพ์
                        </button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {history.map((shift) => (
                <div key={shift.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{shift.user.name}</p>
                      <p className="text-xs text-slate-400">{fmtDate(shift.openedAt)}</p>
                    </div>
                    {shift.isActive
                      ? <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-semibold shrink-0">กำลังเปิด</span>
                      : <span className="rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold shrink-0">ปิดแล้ว</span>
                    }
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2">
                      <p className="text-slate-400 mb-0.5">ยอดเริ่มต้น</p>
                      <p className="font-semibold tabular-nums">{formatThaiMoney(Number(shift.openBalance))}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2">
                      <p className="text-slate-400 mb-0.5">ยอดปิด</p>
                      <p className="font-semibold tabular-nums">{shift.closeBalance != null ? formatThaiMoney(Number(shift.closeBalance)) : '—'}</p>
                    </div>
                  </div>
                  {shift.note && <p className="text-xs text-slate-400">{shift.note}</p>}
                  <button
                    onClick={() => {
                      const date = format(new Date(shift.openedAt), 'yyyy-MM-dd')
                      const p = new URLSearchParams({
                        staffName: shift.user.name,
                        openedAt: shift.openedAt,
                        closedAt: shift.closedAt ?? '',
                        openBalance: String(shift.openBalance),
                        closeBalance: String(shift.closeBalance ?? ''),
                        paper: '80mm',
                      })
                      window.open(`/print/daily-close/${date}?${p.toString()}`, '_blank')
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-lg px-3 py-1.5 w-full justify-center transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    พิมพ์รายงานกะนี้
                  </button>
                  <button
                    onClick={() => setLedgerShiftId(shift.id)}
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-1.5 w-full justify-center transition-colors"
                  >
                    รายการเงิน — ใครรับเท่าไหร่
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
      {ledgerShiftId && <ShiftLedgerSheet shiftId={ledgerShiftId} onClose={() => setLedgerShiftId(null)} />}
    </div>
  )
}
