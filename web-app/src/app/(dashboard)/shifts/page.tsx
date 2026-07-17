'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
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
import api from '@/lib/api'

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

export default function ShiftsPage() {
  const queryClient = useQueryClient()
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeResult, setCloseResult] = useState<CloseShiftResult | null>(null)
  const { isGlobalMode } = useBranchContext()

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

  // ── Forms ──
  const openForm = useForm<OpenForm>({
    resolver: zodResolver(openSchema),
    defaultValues: { openBalance: 0, note: '' },
  })

  const closeForm = useForm<CloseForm>({
    resolver: zodResolver(closeSchema),
    defaultValues: { closeBalance: 0, note: '' },
  })

  // ── Mutations ──
  const openMutation = useMutation({
    mutationFn: async (data: OpenForm) =>
      (await api.post('/shifts/open', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      openForm.reset()
      toast.success('เปิดกะสำเร็จ')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const closeMutation = useMutation({
    mutationFn: async (data: CloseForm) => {
      // Always refetch current shift to get the real ID (avoids stale cache)
      const fresh = await queryClient.fetchQuery<{ id: string } | null>({
        queryKey: ['shifts', 'current'],
        queryFn: async () => (await api.get('/shifts/current')).data,
        staleTime: 0,
      })
      const shiftId = fresh?.id
      if (!shiftId) throw new Error('ไม่พบกะที่เปิดอยู่')
      return (await api.post(`/shifts/${shiftId}/close`, data)).data
    },
    onSuccess: (result: CloseShiftResult) => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      setCloseOpen(false)
      setCloseResult(result)
      closeForm.reset()
      toast.success('ปิดกะสำเร็จ')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  // ── Balance mismatch guard ──
  const closeBalanceWatch = closeForm.watch('closeBalance')
  const closeNoteWatch = closeForm.watch('note')
  const balanceMismatch =
    currentShift?.expectedCashBalance !== undefined &&
    Number(closeBalanceWatch) !== Number(currentShift.expectedCashBalance)
  const noteRequired = balanceMismatch && !closeNoteWatch?.trim()

  // ── Helpers ──
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shifts'] })

  const fmtDateTime = (d: string) =>
    format(new Date(d), 'dd MMM yyyy · HH:mm', { locale: th })

  const fmtDate = (d: string) =>
    format(new Date(d), 'dd MMM yy HH:mm', { locale: th })

  const diffCls = (diff: number) => {
    if (diff > 0) return { card: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'เงินเกิน' }
    if (diff < 0) return { card: 'bg-red-50 border-red-200',  text: 'text-red-700',  label: 'เงินขาด' }
    return { card: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'ยอดตรง' }
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
      {loadingCurrent ? (
        <SectionCard>
          <div className="flex items-center justify-center h-44 gap-2 text-slate-400">
            <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            <span>กำลังโหลดสถานะกะ...</span>
          </div>
        </SectionCard>
      ) : currentShift ? (
        /* Active shift */
        <div className="rounded-xl border border-green-300 bg-green-50/40 p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <CheckCircle2 className="h-4 w-4" />
            กะปัจจุบัน — กำลังดำเนินการ
          </div>
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-700">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {currentShift.user.name}
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
              <div className="rounded-xl border bg-white text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">เงินเริ่มต้น</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(Number(currentShift.openBalance))}
                </p>
              </div>
              <div className="rounded-xl border bg-white text-center py-3 px-2">
                <p className="text-[10px] text-blue-500 mb-1">ยอดขายสินค้า</p>
                <p className="font-bold text-sm tabular-nums text-blue-700">
                  {formatThaiMoney(Number(currentShift.totalSales))}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{currentShift.salesCount} บิล</p>
              </div>
              <div className="rounded-xl border bg-white text-center py-3 px-2">
                <p className="text-[10px] text-purple-500 mb-1">รายรับงานซ่อม</p>
                <p className="font-bold text-sm tabular-nums text-purple-700">
                  {formatThaiMoney(Number(currentShift.repairRevenue ?? 0))}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{currentShift.repairCount ?? 0} งาน</p>
              </div>
              <div className="rounded-xl border bg-white text-center py-3 px-2">
                <p className="text-[10px] text-emerald-500 mb-1">รายรับรวม</p>
                <p className="font-bold text-sm tabular-nums text-emerald-700">
                  {formatThaiMoney(Number(currentShift.totalSales) + Number(currentShift.repairRevenue ?? 0))}
                </p>
              </div>
            </div>

            {/* Expected cash */}
            <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>รายรับรวมในกะ (ทุกช่องทาง)</span>
              </div>
              <span className="font-bold tabular-nums text-gray-900">
                {formatThaiMoney(Number(currentShift.openBalance) + Number(currentShift.totalSales) + Number(currentShift.repairRevenue ?? 0))}
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="destructive"
                onClick={() => { closeForm.reset(); setCloseOpen(true) }}
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
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-8 flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 border-2 border-blue-200">
            <AlertTriangle className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">กรุณาเลือกสาขาก่อนเปิดกะ</p>
            <p className="text-sm text-slate-500 mt-1">ใช้เมนูสาขาที่มุมขวาบนเพื่อเลือกสาขาที่ต้องการ</p>
          </div>
        </div>
      ) : (
        /* No active shift — hero open form */
        <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 sm:p-8">
          <div className="flex flex-col items-center text-center gap-4 mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 border-2 border-emerald-200 shadow-sm">
              <Clock className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">เปิดกะใหม่</h3>
              <p className="text-sm text-slate-500 mt-1">กรอกเงินสดเริ่มต้นในลิ้นชักก่อนเริ่มขาย</p>
            </div>
          </div>

          <form
            onSubmit={openForm.handleSubmit((data) => openMutation.mutate(data))}
            className="space-y-4 max-w-sm mx-auto"
          >
            <div className="space-y-1.5">
              <Label htmlFor="openBalance" className="text-sm font-semibold">เงินสดเริ่มต้น (บาท)</Label>
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
                    className="rounded-full border border-emerald-200 bg-white text-emerald-700 text-xs px-3 py-1 hover:bg-emerald-50 transition-colors"
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
              เปิดกะ
            </Button>
          </form>
        </div>
      )}

      {/* ── Close Shift Result Card ── */}
      {closeResult && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" />
              ผลการปิดกะ
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-900" onClick={() => setCloseResult(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            ปิดเมื่อ {fmtDateTime(closeResult.closedAt)} · พนักงาน: {closeResult.user.name}
          </p>

          {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border bg-white text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">ยอดขายรวม</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(closeResult.summary.totalSales)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {closeResult.summary.salesCount} บิล
                </p>
              </div>
              <div className="rounded-xl border bg-white text-center py-3 px-2">
                <p className="text-[10px] text-muted-foreground mb-1">ยอดเงินสดคาด</p>
                <p className="font-bold text-sm tabular-nums">
                  {formatThaiMoney(closeResult.summary.expectedBalance)}
                </p>
              </div>
              <div className="rounded-xl border bg-white text-center py-3 px-2">
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
        </div>
      )}

      {/* ── Close Shift Dialog ── */}
      <Dialog
        open={closeOpen}
        onOpenChange={(v) => {
          if (!v && !closeMutation.isPending) setCloseOpen(false)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              ปิดกะ
            </DialogTitle>
          </DialogHeader>

          {/* Current shift info summary */}
          {currentShift && (
            <div className="space-y-2">
              <div className="rounded-lg border bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">พนักงาน</span>
                  <span className="font-medium">{currentShift.user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">เปิดเมื่อ</span>
                  <span className="font-medium">{fmtDateTime(currentShift.openedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ยอดขายสินค้า</span>
                  <span className="font-semibold tabular-nums text-blue-700">
                    {formatThaiMoney(Number(currentShift.totalSales))} ({currentShift.salesCount} บิล)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">รายรับงานซ่อม</span>
                  <span className="font-semibold tabular-nums text-purple-700">
                    {formatThaiMoney(Number(currentShift.repairRevenue ?? 0))} ({currentShift.repairCount ?? 0} งาน)
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1.5 mt-0.5">
                  <span className="text-muted-foreground font-medium">รายรับรวม</span>
                  <span className="font-bold tabular-nums text-emerald-700">
                    {formatThaiMoney(Number(currentShift.totalSales) + Number(currentShift.repairRevenue ?? 0))}
                  </span>
                </div>
              </div>
              {/* Expected cash callout */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-emerald-700 font-medium">เงินสดที่คาดในลิ้นชัก</span>
                <span className="font-bold tabular-nums text-emerald-800">
                  {formatThaiMoney(Number(currentShift.expectedCashBalance))}
                </span>
              </div>
            </div>
          )}

          <form
            onSubmit={closeForm.handleSubmit((data) => {
              if (noteRequired) {
                closeForm.setError('note', { message: 'กรุณาระบุหมายเหตุเมื่อยอดเงินไม่ตรง' })
                return
              }
              closeMutation.mutate(data)
            })}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="closeBalance">เงินสดจริง ณ ปิดกะ (บาท)</Label>
                {currentShift?.expectedCashBalance !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    คาด: <span className="font-semibold text-gray-700">{formatThaiMoney(Number(currentShift.expectedCashBalance))}</span>
                  </span>
                )}
              </div>
              <Input
                id="closeBalance"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                autoFocus
                {...closeForm.register('closeBalance')}
                className={
                  closeForm.formState.errors.closeBalance
                    ? 'border-red-400 focus-visible:ring-red-400'
                    : balanceMismatch ? 'border-amber-400 focus-visible:ring-amber-400' : ''
                }
              />
              {closeForm.formState.errors.closeBalance && (
                <p className="text-xs text-red-500">
                  {closeForm.formState.errors.closeBalance.message}
                </p>
              )}
              {balanceMismatch && !closeForm.formState.errors.closeBalance && (
                <p className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  ยอดไม่ตรงกับที่คาด ({formatThaiMoney(Number(currentShift!.expectedCashBalance))}) — กรุณาระบุหมายเหตุ
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closeNote">
                หมายเหตุ {balanceMismatch ? <span className="text-red-500">*</span> : '(ไม่บังคับ)'}
              </Label>
              <Input
                id="closeNote"
                placeholder="เช่น ครบตามยอด, มีเงินทอนค้าง..."
                {...closeForm.register('note')}
                className={closeForm.formState.errors.note ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {closeForm.formState.errors.note && (
                <p className="text-xs text-red-500">{closeForm.formState.errors.note.message}</p>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseOpen(false)}
                disabled={closeMutation.isPending}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={closeMutation.isPending}
                className="gap-2"
              >
                {closeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
                ยืนยันปิดกะ
              </Button>
            </DialogFooter>
          </form>
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
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-slate-400 mb-0.5">ยอดเริ่มต้น</p>
                      <p className="font-semibold tabular-nums">{formatThaiMoney(Number(shift.openBalance))}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-slate-400 mb-0.5">ยอดปิด</p>
                      <p className="font-semibold tabular-nums">{shift.closeBalance != null ? formatThaiMoney(Number(shift.closeBalance)) : '—'}</p>
                    </div>
                  </div>
                  {shift.note && <p className="text-xs text-slate-400">{shift.note}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
