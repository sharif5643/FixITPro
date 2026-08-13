'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Wallet, ArrowRight, BarChart2, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatThaiMoney } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import { ModuleGate } from '@/components/auth/module-gate'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinanceSummary {
  period:   { startDate: string; endDate: string }
  totalIn:  number
  totalOut: number
  net:      number
  txnCount: number
  bySource: Record<string, { in: number; out: number }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  SALE_PAYMENT:              'ยอดขาย POS',
  REPAIR_FINAL_PAYMENT:      'ค่าซ่อม',
  REPAIR_DEPOSIT:            'มัดจำงานซ่อม',
  REPAIR_ADDITIONAL_PAYMENT: 'ค่าบริการเพิ่ม',
  EXPENSE_PAYMENT:           'ค่าใช้จ่าย',
  SUPPLIER_PAYMENT:          'จ่ายซัพพลายเออร์',
  SALE_REFUND:               'คืนเงิน POS',
  CASH_WITHDRAWAL:           'เบิกเงิน',
  CASH_DEPOSIT:              'เติมเงิน',
  BANK_DEPOSIT:              'ฝากธนาคาร',
  MANUAL:                    'รายการอื่น',
}

const PRESET_RANGES = [
  { label: 'วันนี้',      days: 0 },
  { label: '7 วัน',      days: 7 },
  { label: '30 วัน',     days: 30 },
] as const

function toDate(d: Date) { return format(d, 'yyyy-MM-dd') }

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, amount, icon: Icon, color }: {
  label: string; amount: number; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{formatThaiMoney(amount)}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const today   = new Date()
  const [startDate, setStartDate] = useState(toDate(startOfMonth(today)))
  const [endDate,   setEndDate]   = useState(toDate(endOfMonth(today)))

  const { branchId } = useBranchContext()

  const { data, isLoading } = useQuery<FinanceSummary>({
    queryKey: ['finance-summary', startDate, endDate, branchId],
    queryFn: async () => {
      const p = new URLSearchParams({ startDate, endDate })
      if (branchId) p.set('branchId', branchId)
      return (await api.get(`/finance/summary?${p}`)).data
    },
    staleTime: 60_000,
  })

  function applyPreset(days: number) {
    if (days === 0) {
      setStartDate(toDate(today))
      setEndDate(toDate(today))
    } else {
      setStartDate(toDate(subDays(today, days - 1)))
      setEndDate(toDate(today))
    }
  }

  const inItems  = Object.entries(data?.bySource ?? {}).filter(([, v]) => v.in > 0)
  const outItems = Object.entries(data?.bySource ?? {}).filter(([, v]) => v.out > 0)

  return (
    <ModuleGate module="repair">
      <div className="space-y-5">
        <PageHeader
          title="การเงิน"
          icon={Wallet}
          subtitle="ภาพรวมรายรับ-รายจ่ายจากลิ้นชัก"
          secondaryActions={<BranchContextBar className="hidden sm:flex" />}
          primaryAction={
            <Link href="/finance/transactions">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Receipt className="h-4 w-4" />
                รายการทั้งหมด
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        />

        {/* Date range picker */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_RANGES.map(({ label, days }) => (
            <Button key={days} variant="outline" size="sm" onClick={() => applyPreset(days)}>
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span className="text-slate-400 text-sm">ถึง</span>
            <input
              type="date"
              className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-28 bg-slate-100 dark:bg-slate-700/60 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="รายรับรวม"   amount={data?.totalIn  ?? 0} icon={TrendingUp}   color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" />
              <StatCard label="รายจ่ายรวม"  amount={data?.totalOut ?? 0} icon={TrendingDown}  color="bg-red-100 dark:bg-red-900/30 text-red-600" />
              <StatCard label="สุทธิ"        amount={data?.net       ?? 0} icon={BarChart2}    color="bg-blue-100 dark:bg-blue-900/30 text-blue-600" />
            </div>

            {/* Breakdown */}
            {(inItems.length > 0 || outItems.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Income breakdown */}
                <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60 p-5 shadow-sm">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" /> รายรับ
                  </p>
                  <div className="space-y-2">
                    {inItems.map(([src, val]) => (
                      <div key={src} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{SOURCE_LABEL[src] ?? src}</span>
                        <span className="tabular-nums font-medium">{formatThaiMoney(val.in)}</span>
                      </div>
                    ))}
                    {inItems.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีรายการ</p>}
                  </div>
                </div>

                {/* Expense breakdown */}
                <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60 p-5 shadow-sm">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4" /> รายจ่าย
                  </p>
                  <div className="space-y-2">
                    {outItems.map(([src, val]) => (
                      <div key={src} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{SOURCE_LABEL[src] ?? src}</span>
                        <span className="tabular-nums font-medium text-red-600 dark:text-red-400">{formatThaiMoney(val.out)}</span>
                      </div>
                    ))}
                    {outItems.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีรายการ</p>}
                  </div>
                </div>
              </div>
            )}

            {data?.txnCount === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <BarChart2 className="h-10 w-10 text-slate-200 dark:text-slate-600" />
                <p className="text-sm text-muted-foreground">ไม่มีรายการในช่วงนี้</p>
              </div>
            )}
          </>
        )}
      </div>
    </ModuleGate>
  )
}
