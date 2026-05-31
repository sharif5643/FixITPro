'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { CheckCircle2, ShoppingCart, Wifi, Plus, Printer } from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import {
  buildDailyClosingHtml, buildDailyClosingPreviewData, shareDailyClosing,
  type PrintDailyClosingOptions,
} from '@/lib/printer'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type CurrentShift = {
  id: string
  openedAt: string
  openBalance: number
  note: string | null
  isActive: boolean
  user: { id: string; name: string }
  salesCount: number
  totalSales: number
  repairCount: number
  repairRevenue: number
  supplierPaymentCount: number
  supplierExpenses: number
  packageSaleCount: number
  packageSaleRevenue: number
  packageSaleAmount: number
  expectedCashBalance: number
}

type CloseSummary = {
  salesCount: number
  totalSales: number
  repairPayments: { count: number; totalAmount: number }
  packageSales: { count: number; totalAmount: number; totalProfit: number }
  expectedBalance: number
  actualBalance: number
  difference: number
}

type WalletBalance = { carrier: string; balance: number }

const CARRIERS = ['AIS', 'TRUE', 'DTAC', 'NT'] as const
type CarrierKey = typeof CARRIERS[number]

const CARRIER_COLORS: Record<CarrierKey, string> = {
  AIS:  'bg-blue-100 text-blue-700 border-blue-200',
  TRUE:  'bg-red-100 text-red-700 border-red-200',
  DTAC: 'bg-orange-100 text-orange-700 border-orange-200',
  NT:   'bg-green-100 text-green-700 border-green-200',
}

// ── Helper row ────────────────────────────────────────────────────────────────

function Row({
  label, value, sub, highlight,
}: {
  label: string; value: string; sub?: string; highlight?: boolean
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? 'bg-blue-50 rounded-b-2xl' : ''}`}>
      <div>
        <p className={`text-sm font-medium ${highlight ? 'text-blue-700' : 'text-slate-600'}`}>{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`font-bold tabular-nums ${highlight ? 'text-blue-700 text-base' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Topup sheet ───────────────────────────────────────────────────────────────

function TopupSheet({
  shiftId,
  onClose,
  onSuccess,
}: {
  shiftId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [carrier, setCarrier] = useState<CarrierKey>('AIS')
  const [amount, setAmount]   = useState('')
  const [note, setNote]       = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/carrier-wallet/topup', {
        carrier,
        amount:  Number(amount),
        note:    note.trim() || undefined,
        shiftId,
      }),
    onSuccess: () => {
      toast.success(`เติมกระเป๋า ${carrier} สำเร็จ`)
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const canSubmit = Number(amount) > 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl p-5 space-y-4 pb-8">
        <div className="flex justify-center pt-1 pb-2">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        <p className="font-bold text-lg text-slate-900 text-center">เติมกระเป๋า Carrier</p>

        <div className="grid grid-cols-4 gap-2">
          {CARRIERS.map((c) => (
            <button
              key={c}
              onClick={() => setCarrier(c)}
              className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                carrier === c
                  ? `${CARRIER_COLORS[c]} border-current`
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-600">จำนวนเงิน (บาท)</label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full h-16 px-4 border-2 border-slate-200 rounded-xl text-3xl font-bold bg-white focus:outline-none focus:border-blue-500 tabular-nums"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-600">หมายเหตุ (ไม่บังคับ)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น โอนเงินเข้า AIS"
            className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={!canSubmit || mutation.isPending}
          className="w-full h-14 rounded-2xl bg-blue-600 text-white font-bold text-lg disabled:opacity-60 flex items-center justify-center gap-2 active:bg-blue-700"
        >
          {mutation.isPending
            ? <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
            : `เติม ${carrier} — ${formatThaiMoney(Number(amount) || 0)}`}
        </button>
      </div>
    </div>
  )
}

// ── Wallet balance cards ──────────────────────────────────────────────────────

function WalletBalances({ shiftId }: { shiftId: string }) {
  const qc = useQueryClient()
  const [showTopup, setShowTopup] = useState(false)

  const { data: wallets = [] } = useQuery<WalletBalance[]>({
    queryKey:  ['carrier-wallet', 'balances'],
    queryFn:   async () => (await api.get('/carrier-wallet/balances')).data,
    staleTime: 15_000,
  })

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-600">กระเป๋า Carrier</p>
          <button
            onClick={() => setShowTopup(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold active:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            เติมกระเป๋า
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CARRIERS.map((c) => {
            const w = wallets.find((w) => w.carrier === c)
            const balance = w?.balance ?? 0
            return (
              <div
                key={c}
                className={`rounded-xl border-2 p-3 ${CARRIER_COLORS[c]}`}
              >
                <p className="text-xs font-bold opacity-70">{c}</p>
                <p className="text-lg font-bold tabular-nums mt-0.5">
                  {formatThaiMoney(balance)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {showTopup && (
        <TopupSheet
          shiftId={shiftId}
          onClose={() => setShowTopup(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['carrier-wallet'] })}
        />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SunmiShiftsPage() {
  const router      = useRouter()
  const queryClient = useQueryClient()

  const [openBalance,   setOpenBalance]   = useState('0')
  const [openNote,      setOpenNote]      = useState('')
  const [closeBalance,  setCloseBalance]  = useState('')
  const [closeNote,     setCloseNote]     = useState('')
  const [closeSummary,  setCloseSummary]  = useState<CloseSummary | null>(null)
  const [closingOpts,   setClosingOpts]   = useState<PrintDailyClosingOptions | null>(null)
  const [showPrint,     setShowPrint]     = useState(false)
  const [showCarrierInputs, setShowCarrierInputs] = useState(false)

  // Carrier opening balances
  const [aisOpening,  setAisOpening]  = useState('')
  const [trueOpening, setTrueOpening] = useState('')
  const [dtacOpening, setDtacOpening] = useState('')
  const [ntOpening,   setNtOpening]   = useState('')

  const { data: shift, isLoading } = useQuery<CurrentShift | null>({
    queryKey: ['shifts', 'current'],
    queryFn:  async () => (await api.get('/shifts/current')).data,
    staleTime: 0,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey:  ['settings'],
    queryFn:   async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const openMutation = useMutation({
    mutationFn: () => {
      const body: any = {
        openBalance: Number(openBalance) || 0,
        note: openNote.trim() || undefined,
      }
      if (aisOpening  !== '') body.aisOpeningBalance  = Number(aisOpening)
      if (trueOpening !== '') body.trueOpeningBalance = Number(trueOpening)
      if (dtacOpening !== '') body.dtacOpeningBalance = Number(dtacOpening)
      if (ntOpening   !== '') body.ntOpeningBalance   = Number(ntOpening)
      return api.post('/shifts/open', body)
    },
    onSuccess: () => {
      toast.success('เปิดกะสำเร็จ')
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['carrier-wallet'] })
      router.push('/sunmi/sales')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เปิดกะไม่สำเร็จ'))
    },
  })

  const closeMutation = useMutation({
    mutationFn: () =>
      api.post(`/shifts/${shift!.id}/close`, {
        closeBalance: Number(closeBalance) || 0,
        note: closeNote.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success('ปิดกะสำเร็จ')
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      const summary: CloseSummary = res.data.summary
      setCloseSummary(summary)
      const now = new Date()
      setClosingOpts({
        shopName:          settings?.shopName ?? 'FixITPro',
        shopPhone:         settings?.shopPhone ?? undefined,
        cashierName:       shift!.user.name,
        openedAt:          format(new Date(shift!.openedAt), 'dd/MM/yyyy HH:mm', { locale: th }),
        closedAt:          format(now, 'dd/MM/yyyy HH:mm', { locale: th }),
        salesCount:        summary.salesCount,
        totalSales:        summary.totalSales,
        repairCount:       summary.repairPayments.count,
        repairTotal:       summary.repairPayments.totalAmount,
        packageSaleCount:  summary.packageSales?.count ?? 0,
        packageSaleTotal:  summary.packageSales?.totalAmount ?? 0,
        packageSaleProfit: summary.packageSales?.totalProfit ?? 0,
        expectedBalance:   summary.expectedBalance,
        actualBalance:     summary.actualBalance,
        difference:        summary.difference,
        footer:            settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
      })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'ปิดกะไม่สำเร็จ'))
    },
  })

  // ── Post-close summary ───────────────────────────────────────────────────────

  if (closeSummary) {
    const diff = closeSummary.difference
    return (
      <>
      <SunmiShell title="สรุปกะ" showBack={false}>
        <div className="p-4 space-y-4">
          <div className="flex flex-col items-center py-6">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xl font-bold text-slate-900">ปิดกะสำเร็จ</p>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden divide-y divide-slate-100">
            <Row label="ยอดขาย" value={formatThaiMoney(closeSummary.totalSales)} sub={`${closeSummary.salesCount} รายการ`} />
            <Row label="งานซ่อม" value={formatThaiMoney(closeSummary.repairPayments.totalAmount)} sub={`${closeSummary.repairPayments.count} งาน`} />
            {(closeSummary.packageSales?.count ?? 0) > 0 && (
              <Row
                label="SIM / แพ็กเกจ"
                value={formatThaiMoney(closeSummary.packageSales.totalAmount)}
                sub={`${closeSummary.packageSales.count} รายการ · กำไร ${formatThaiMoney(closeSummary.packageSales.totalProfit)}`}
              />
            )}
            <Row label="เงินสดที่ควรมี" value={formatThaiMoney(closeSummary.expectedBalance)} />
            <Row label="ยอดที่นับได้" value={formatThaiMoney(closeSummary.actualBalance)} />
            <div className={`flex items-center justify-between px-4 py-3 ${diff < 0 ? 'bg-red-50' : diff > 0 ? 'bg-green-50' : 'bg-slate-50'}`}>
              <span className="text-sm font-bold text-slate-700">ส่วนต่าง</span>
              <span className={`font-bold tabular-nums ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-slate-500'}`}>
                {diff >= 0 ? '+' : ''}{formatThaiMoney(diff)}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {closingOpts && (
              <button
                onClick={() => setShowPrint(true)}
                className="w-full h-12 rounded-2xl bg-slate-800 text-white font-bold flex items-center justify-center gap-2 active:bg-slate-700"
              >
                <Printer className="h-5 w-5" />
                พิมพ์สรุปกะ
              </button>
            )}
            <button
              onClick={() => router.push('/sunmi/sales')}
              className="w-full h-14 rounded-2xl bg-blue-600 text-white font-bold text-lg flex items-center justify-center gap-2 active:bg-blue-700"
            >
              <ShoppingCart className="h-5 w-5" />
              ไปหน้า POS
            </button>
            <button
              onClick={() => router.push('/sunmi')}
              className="w-full h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium flex items-center justify-center active:bg-slate-50"
            >
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </SunmiShell>

      {showPrint && closingOpts && (
        <PrinterFlowSheet
          receiptHtml={buildDailyClosingHtml(closingOpts)}
          jobName={`สรุปปิดกะ ${closingOpts.closedAt}`}
          previewData={buildDailyClosingPreviewData(closingOpts)}
          onShare={async () => shareDailyClosing(closingOpts)}
          onClose={() => setShowPrint(false)}
          successNavItems={[
            { label: 'ไปหน้า POS',   href: '/sunmi/sales' },
            { label: 'กลับหน้าหลัก', href: '/sunmi' },
          ]}
        />
      )}
      </>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SunmiShell title="เปิด/ปิดกะ" showBack>
        <div className="flex items-center justify-center h-48">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
        </div>
      </SunmiShell>
    )
  }

  // ── No active shift ──────────────────────────────────────────────────────────

  if (!shift) {
    return (
      <SunmiShell title="เปิด/ปิดกะ" showBack>
        <div className="p-4 space-y-5">
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-amber-800">ยังไม่ได้เปิดกะ</p>
              <p className="text-xs text-amber-600 mt-0.5">กรุณาเปิดกะก่อนเริ่มขายสินค้า</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-600">ยอดเปิดกะ (บาท)</label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={openBalance}
              onChange={(e) => setOpenBalance(e.target.value)}
              className="w-full h-16 px-4 border-2 border-slate-200 rounded-xl text-3xl font-bold bg-white focus:outline-none focus:border-blue-500 tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-600">หมายเหตุ (ไม่บังคับ)</label>
            <input
              value={openNote}
              onChange={(e) => setOpenNote(e.target.value)}
              placeholder="หมายเหตุสำหรับกะนี้..."
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Carrier wallet opening balances (collapsible) */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowCarrierInputs((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-cyan-50 border border-cyan-200 rounded-2xl text-cyan-700"
            >
              <span className="flex items-center gap-2 font-semibold text-sm">
                <Wifi className="h-4 w-4" />
                ยอดกระเป๋า Carrier (ถ้ามี)
              </span>
              <span className="text-xs font-medium opacity-70">
                {showCarrierInputs ? 'ซ่อน ▲' : 'ใส่ยอด ▼'}
              </span>
            </button>

            {showCarrierInputs && (
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['AIS',  aisOpening,  setAisOpening,  'border-blue-300'],
                  ['TRUE',  trueOpening, setTrueOpening, 'border-red-300'],
                  ['DTAC', dtacOpening, setDtacOpening, 'border-orange-300'],
                  ['NT',   ntOpening,   setNtOpening,   'border-green-300'],
                ] as [string, string, (v: string) => void, string][]).map(([label, val, setVal, border]) => (
                  <div key={label} className="space-y-1">
                    <label className={`text-xs font-bold ${CARRIER_COLORS[label as CarrierKey].split(' ')[1]}`}>
                      {label}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder="0"
                      className={`w-full h-12 px-3 border-2 ${border} rounded-xl text-xl font-bold bg-white focus:outline-none tabular-nums`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => openMutation.mutate()}
            disabled={openMutation.isPending}
            className="w-full h-16 rounded-2xl bg-green-600 text-white text-xl font-bold active:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {openMutation.isPending
              ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
              : 'เปิดกะ'}
          </button>
        </div>
      </SunmiShell>
    )
  }

  // ── Active shift ─────────────────────────────────────────────────────────────

  const closeBalanceNum = Number(closeBalance) || 0
  const liveDiff        = closeBalance !== '' ? closeBalanceNum - shift.expectedCashBalance : null

  return (
    <SunmiShell title="เปิด/ปิดกะ" showBack>
      <div className="p-4 space-y-4 pb-8">
        {/* Status */}
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-green-500 shrink-0 shadow-[0_0_0_4px_rgba(34,197,94,0.15)]" />
          <div>
            <p className="font-bold text-green-800">กะเปิดอยู่</p>
            <p className="text-xs text-green-600 mt-0.5">
              เปิดตั้งแต่ {format(new Date(shift.openedAt), 'HH:mm', { locale: th })} น.
              {' · '}
              {shift.user.name}
            </p>
          </div>
        </div>

        {/* Cash summary */}
        <div className="bg-white rounded-2xl overflow-hidden divide-y divide-slate-100">
          <Row label="ยอดเปิดกะ" value={formatThaiMoney(Number(shift.openBalance))} />
          <Row label="ยอดขาย" value={formatThaiMoney(shift.totalSales)} sub={`${shift.salesCount} รายการ`} />
          <Row label="งานซ่อม" value={formatThaiMoney(shift.repairRevenue)} sub={`${shift.repairCount} งาน`} />
          {(shift.packageSaleCount ?? 0) > 0 && (
            <Row
              label="SIM / แพ็กเกจ"
              value={formatThaiMoney(shift.packageSaleAmount ?? 0)}
              sub={`${shift.packageSaleCount} รายการ · กำไร ${formatThaiMoney(shift.packageSaleRevenue ?? 0)}`}
            />
          )}
          <Row label="เงินสดที่ควรมีในลิ้นชัก" value={formatThaiMoney(shift.expectedCashBalance)} highlight />
        </div>

        {/* Carrier wallet balances */}
        <WalletBalances shiftId={shift.id} />

        {/* Close form */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-600">ยอดเงินสดที่นับได้ (บาท)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={closeBalance}
            onChange={(e) => setCloseBalance(e.target.value)}
            placeholder={String(Math.round(shift.expectedCashBalance))}
            className="w-full h-16 px-4 border-2 border-slate-200 rounded-xl text-3xl font-bold bg-white focus:outline-none focus:border-blue-500 tabular-nums"
          />
          {liveDiff !== null && (
            <p className={`text-sm font-bold text-right pr-1 ${liveDiff < 0 ? 'text-red-500' : liveDiff > 0 ? 'text-green-600' : 'text-slate-500'}`}>
              {liveDiff >= 0 ? '+' : ''}{formatThaiMoney(liveDiff)} จากที่ควรมี
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-600">หมายเหตุ (ไม่บังคับ)</label>
          <input
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            placeholder="หมายเหตุสำหรับกะนี้..."
            className="w-full h-12 px-4 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => closeMutation.mutate()}
          disabled={closeMutation.isPending || closeBalance === ''}
          className="w-full h-16 rounded-2xl bg-red-600 text-white text-xl font-bold active:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {closeMutation.isPending
            ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
            : 'ปิดกะ'}
        </button>
      </div>
    </SunmiShell>
  )
}
