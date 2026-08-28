'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import { TrendingUp, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ModuleGate } from '@/components/auth/module-gate'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ISRow {
  code:    string
  nameTh:  string
  type:    string
  amount:  number
}

interface IncomeStatementData {
  revenues:     ISRow[]
  expenses:     ISRow[]
  totalRevenue: number
  totalExpense: number
  netIncome:    number
}

// ── Row component ─────────────────────────────────────────────────────────────

function AccountRow({ row, isExpense }: { row: ISRow; isExpense?: boolean }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-500 w-16">{row.code}</td>
      <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">{row.nameTh}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${
        isExpense ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'
      }`}>
        {formatThaiMoney(row.amount)}
      </td>
    </tr>
  )
}

function TotalRow({ label, amount, className }: { label: string; amount: number; className?: string }) {
  return (
    <tr className={`border-t-2 ${className ?? ''}`}>
      <td className="px-4 py-2.5 w-16" />
      <td className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">{label}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold">{formatThaiMoney(amount)}</td>
    </tr>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

function IncomeStatementContent() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery<IncomeStatementData>({
    queryKey: ['accounting-income-statement', startDate, endDate],
    queryFn:  () => api.get(`/accounting/reports/income-statement?startDate=${startDate}&endDate=${endDate}`).then(r => r.data),
  })

  const handleExportCsv = () => {
    if (!data) return
    const rows: string[][] = [['รหัส', 'บัญชี', 'ประเภท', 'จำนวน (บาท)']]
    for (const r of data.revenues) rows.push([r.code, r.nameTh, 'รายได้', r.amount.toFixed(2)])
    rows.push(['', 'รายได้รวม', '', data.totalRevenue.toFixed(2)])
    rows.push([])
    for (const r of data.expenses) rows.push([r.code, r.nameTh, 'ค่าใช้จ่าย', r.amount.toFixed(2)])
    rows.push(['', 'ค่าใช้จ่ายรวม', '', data.totalExpense.toFixed(2)])
    rows.push([])
    rows.push(['', 'กำไร(ขาดทุน)สุทธิ', '', data.netIncome.toFixed(2)])

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `income-statement-${format(viewMonth, 'yyyy-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Month navigator */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setViewMonth(m => startOfMonth(subMonths(m, 1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-slate-800 dark:text-slate-100 min-w-[140px] text-center">
            {format(viewMonth, 'MMMM yyyy', { locale: th })}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setViewMonth(m => startOfMonth(addMonths(m, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv} disabled={!data}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      )}

      {data && (
        <>
          {/* Net income summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4">
              <p className="text-xs text-muted-foreground mb-1">รายได้รวม</p>
              <p className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">{formatThaiMoney(data.totalRevenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4">
              <p className="text-xs text-muted-foreground mb-1">ค่าใช้จ่ายรวม</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">{formatThaiMoney(data.totalExpense)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${
              data.netIncome >= 0
                ? 'border-green-200 dark:border-green-700/40 bg-green-50 dark:bg-green-900/10'
                : 'border-red-200 dark:border-red-700/40 bg-red-50 dark:bg-red-900/10'
            }`}>
              <p className="text-xs text-muted-foreground mb-1">กำไร(ขาดทุน)สุทธิ</p>
              <p className={`text-xl font-bold tabular-nums ${data.netIncome >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatThaiMoney(data.netIncome)}
              </p>
            </div>
          </div>

          {/* Revenue table */}
          <SectionCard>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">รายได้</p>
            {data.revenues.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">ยังไม่มีรายได้ในงวดนี้</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground w-16">รหัส</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">บัญชี</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenues.map(r => <AccountRow key={r.code} row={r} />)}
                    <TotalRow label="รายได้รวม" amount={data.totalRevenue} className="border-slate-200 dark:border-slate-700/60 text-green-700 dark:text-green-400" />
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Expense table */}
          <SectionCard>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">ค่าใช้จ่าย</p>
            {data.expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">ยังไม่มีค่าใช้จ่ายในงวดนี้</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground w-16">รหัส</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">บัญชี</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map(r => <AccountRow key={r.code} row={r} isExpense />)}
                    <TotalRow label="ค่าใช้จ่ายรวม" amount={data.totalExpense} className="border-slate-200 dark:border-slate-700/60 text-red-600 dark:text-red-400" />
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Net income footer */}
          <div className={`rounded-xl border p-4 flex items-center justify-between ${
            data.netIncome >= 0
              ? 'border-green-200 dark:border-green-700/40 bg-green-50/60 dark:bg-green-900/10'
              : 'border-red-200 dark:border-red-700/40 bg-red-50/60 dark:bg-red-900/10'
          }`}>
            <p className="font-bold text-slate-800 dark:text-slate-100">กำไร(ขาดทุน)สุทธิ</p>
            <p className={`text-2xl font-bold tabular-nums ${data.netIncome >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatThaiMoney(data.netIncome)}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default function IncomeStatementPage() {
  return (
    <ModuleGate module="accounting">
      <PageHeader
        icon={TrendingUp}
        title="งบกำไรขาดทุน"
        subtitle="Income Statement — รายได้ ค่าใช้จ่าย และกำไรสุทธิในแต่ละเดือน"
      />
      <IncomeStatementContent />
    </ModuleGate>
  )
}
