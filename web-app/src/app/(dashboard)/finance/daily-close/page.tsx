'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, History, Save, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { ModuleGate } from '@/components/auth/module-gate'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyReport {
  date: string
  revenue: {
    pos:      { total: number; count: number; breakdown: Record<string, number> }
    repairs:  { total: number; count: number; breakdown: Record<string, number> }
    packages: { total: number; count: number }
    grandTotal: number
    cash:     number
    transfer: number
    card:     number
  }
  expenses: { totalAmount: number }
}

interface DailyCloseRecord {
  id:             string
  date:           string
  posRevenue:     number
  repairRevenue:  number
  packageRevenue: number
  expenseTotal:   number
  grandTotal:     number
  cashRevenue:    number
  transferRevenue: number
  cardRevenue:    number
  actualCash:     number | null
  cashDifference: number | null
  notes:          string | null
  closedAt:       string
  closedBy:       { name: string }
  branch:         { name: string } | null
}

interface HistoryResponse {
  data: DailyCloseRecord[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: th })
  } catch {
    return dateStr
  }
}

function SumCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{formatThaiMoney(value)}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DailyClosePage() {
  const qc = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [actualCash,   setActualCash]   = useState('')
  const [notes,        setNotes]        = useState('')
  const [showHistory,  setShowHistory]  = useState(false)
  const [savedOk,      setSavedOk]      = useState(false)

  // Load daily report for selected date
  const { data: report, isLoading: reportLoading } = useQuery<DailyReport>({
    queryKey: ['daily-closing', selectedDate],
    queryFn:  async () => (await api.get(`/reports/daily-closing?date=${selectedDate}`)).data,
    staleTime: 60_000,
  })

  // Load history
  const { data: history } = useQuery<HistoryResponse>({
    queryKey: ['daily-close-history'],
    queryFn:  async () => (await api.get('/finance/daily-close?limit=30')).data,
    staleTime: 60_000,
    enabled:  showHistory,
  })

  // Pre-fill actualCash from expected cash if field is empty
  useEffect(() => {
    if (report && actualCash === '') {
      setActualCash(String(Math.round(report.revenue.cash)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.date])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!report) return
      const cashNum = parseFloat(actualCash) || 0
      const body = {
        date:            selectedDate,
        posRevenue:      report.revenue.pos.total,
        repairRevenue:   report.revenue.repairs.total,
        packageRevenue:  report.revenue.packages.total,
        expenseTotal:    report.expenses.totalAmount,
        grandTotal:      report.revenue.grandTotal,
        cashRevenue:     report.revenue.cash,
        transferRevenue: report.revenue.transfer,
        cardRevenue:     report.revenue.card,
        actualCash:      cashNum,
        cashDifference:  cashNum - report.revenue.cash,
        notes:           notes.trim() || undefined,
      }
      return (await api.post('/finance/daily-close', body)).data
    },
    onSuccess: () => {
      setSavedOk(true)
      qc.invalidateQueries({ queryKey: ['daily-close-history'] })
      setTimeout(() => setSavedOk(false), 3000)
    },
  })

  const cashDiff = report
    ? (parseFloat(actualCash) || 0) - report.revenue.cash
    : 0

  return (
    <ModuleGate module="finance">
      <div className="max-w-2xl mx-auto pb-10 px-4">
        <PageHeader title="ปิดบัญชีประจำวัน" />

        {/* Date picker */}
        <div className="mb-4 flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-slate-500 shrink-0" />
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={(e) => {
              setSelectedDate(e.target.value)
              setActualCash('')
              setSavedOk(false)
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="text-sm text-slate-500">{formatDate(selectedDate)}</span>
        </div>

        {/* Revenue summary */}
        {reportLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="h-6 w-6 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <SumCard label="ยอดขาย POS"   value={report.revenue.pos.total}      sub={`${report.revenue.pos.count} รายการ`} />
              <SumCard label="รายรับซ่อม"   value={report.revenue.repairs.total}   sub={`${report.revenue.repairs.count} รายการ`} />
              <SumCard label="ขายแพ็กเกจ"   value={report.revenue.packages.total}  sub={`${report.revenue.packages.count} รายการ`} />
              <SumCard label="ค่าใช้จ่าย"   value={report.expenses.totalAmount} />
            </div>

            {/* Grand total bar */}
            <div className="bg-emerald-600 text-white rounded-xl p-4 mb-5 flex items-center justify-between">
              <span className="font-semibold">รายรับรวม</span>
              <span className="text-2xl font-bold">{formatThaiMoney(report.revenue.grandTotal)}</span>
            </div>

            {/* Payment breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
              <p className="text-sm font-semibold text-slate-700 mb-3">แยกตามช่องทางชำระ</p>
              <div className="space-y-2">
                {[
                  { label: 'เงินสด',       value: report.revenue.cash },
                  { label: 'โอนเงิน',      value: report.revenue.transfer },
                  { label: 'บัตรเครดิต',   value: report.revenue.card },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{formatThaiMoney(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash count */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-4 w-4 text-slate-500" />
                <p className="text-sm font-semibold text-slate-700">นับเงินสดจริง</p>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-slate-500 shrink-0">จำนวนเงิน (บาท)</span>
                <input
                  type="number"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="0"
                  min="0"
                />
              </div>
              {actualCash !== '' && (
                <div className={`text-sm font-semibold rounded-lg px-3 py-2 ${
                  cashDiff === 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : cashDiff > 0
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-red-50 text-red-700'
                }`}>
                  {cashDiff === 0 && 'ยอดเงินสดตรง'}
                  {cashDiff > 0 && `เงินสดเกิน ${formatThaiMoney(cashDiff)}`}
                  {cashDiff < 0 && `เงินสดขาด ${formatThaiMoney(Math.abs(cashDiff))}`}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="mb-5">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="หมายเหตุ (ถ้ามี)"
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* Save button */}
            {savedOk ? (
              <div className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-50 text-emerald-700 font-semibold text-sm mb-5">
                <CheckCircle2 className="h-5 w-5" /> บันทึกสำเร็จ
              </div>
            ) : (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full h-12 rounded-2xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 mb-5 disabled:opacity-60"
              >
                {saveMutation.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                บันทึกปิดบัญชีประจำวัน
              </button>
            )}
            {saveMutation.isError && (
              <p className="text-sm text-red-500 text-center mb-4">เกิดข้อผิดพลาด กรุณาลองอีกครั้ง</p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-slate-400 py-10">ไม่พบข้อมูล</p>
        )}

        {/* History toggle */}
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <span className="flex items-center gap-2"><History className="h-4 w-4" /> ประวัติการปิดบัญชี</span>
          {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {!history ? (
              <div className="flex justify-center py-6">
                <span className="h-5 w-5 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
              </div>
            ) : history.data.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-6">ยังไม่มีประวัติ</p>
            ) : (
              history.data.map((rec) => (
                <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900">{formatDate(rec.date)}</span>
                    <span className="text-sm font-bold text-emerald-700">{formatThaiMoney(rec.grandTotal)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-slate-500 mb-2">
                    <span>POS: {formatThaiMoney(rec.posRevenue)}</span>
                    <span>ซ่อม: {formatThaiMoney(rec.repairRevenue)}</span>
                    <span>ค่าใช้จ่าย: {formatThaiMoney(rec.expenseTotal)}</span>
                  </div>
                  {rec.actualCash != null && (
                    <div className={`text-xs rounded px-2 py-0.5 inline-block ${
                      (rec.cashDifference ?? 0) === 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : (rec.cashDifference ?? 0) > 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-red-50 text-red-700'
                    }`}>
                      นับเงินสด: {formatThaiMoney(rec.actualCash)}
                      {(rec.cashDifference ?? 0) !== 0 && (
                        <span> ({(rec.cashDifference ?? 0) > 0 ? '+' : ''}{formatThaiMoney(rec.cashDifference ?? 0)})</span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1.5">
                    บันทึกโดย {rec.closedBy.name}{rec.branch ? ` · ${rec.branch.name}` : ''} · {format(new Date(rec.closedAt), 'HH:mm')} น.
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </ModuleGate>
  )
}
