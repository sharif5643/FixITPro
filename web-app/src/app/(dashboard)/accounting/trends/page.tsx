'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { BarChart2, Download, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ModuleGate } from '@/components/auth/module-gate'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthData {
  month:        string  // "yyyy-MM"
  totalRevenue: number
  totalExpense: number
  netIncome:    number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortMonth(m: string): string {
  try { return format(parseISO(`${m}-01`), 'MMM yy', { locale: th }) }
  catch { return m }
}

function thaiMonth(m: string): string {
  try { return format(parseISO(`${m}-01`), 'MMMM yyyy', { locale: th }) }
  catch { return m }
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const revenue = payload.find((p: any) => p.dataKey === 'totalRevenue')?.value ?? 0
  const expense = payload.find((p: any) => p.dataKey === 'totalExpense')?.value ?? 0
  const net     = payload.find((p: any) => p.dataKey === 'netIncome')?.value   ?? 0
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] shadow-lg px-4 py-3 text-xs space-y-1.5 min-w-[180px]">
      <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2">{thaiMonth(label)}</p>
      <div className="flex justify-between gap-4">
        <span className="text-emerald-600 dark:text-emerald-400">รายได้</span>
        <span className="tabular-nums font-medium">{formatThaiMoney(revenue)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-red-500 dark:text-red-400">ค่าใช้จ่าย</span>
        <span className="tabular-nums font-medium">{formatThaiMoney(expense)}</span>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 flex justify-between gap-4">
        <span className={net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}>
          กำไรสุทธิ
        </span>
        <span className="tabular-nums font-semibold">{formatThaiMoney(net)}</span>
      </div>
    </div>
  )
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0) return null
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const up  = pct >= 0
  return (
    <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      up ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
         : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
    }`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}% {label}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

function TrendsContent() {
  const [months, setMonths] = useState(12)

  const { data = [], isLoading } = useQuery<MonthData[]>({
    queryKey: ['accounting-monthly-trend', months],
    queryFn:  () => api.get(`/accounting/reports/monthly-trend?months=${months}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const handleExportCsv = () => {
    if (!data.length) return
    const rows: string[][] = [['เดือน', 'รายได้', 'ค่าใช้จ่าย', 'กำไรสุทธิ']]
    for (const d of data) {
      rows.push([thaiMonth(d.month), d.totalRevenue.toFixed(2), d.totalExpense.toFixed(2), d.netIncome.toFixed(2)])
    }
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pnl-trend-${months}m.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Summary cards — current month vs previous month
  const cur  = data[data.length - 1]
  const prev = data[data.length - 2]

  const totalRevenue = data.reduce((s, d) => s + d.totalRevenue, 0)
  const totalExpense = data.reduce((s, d) => s + d.totalExpense, 0)
  const totalNet     = totalRevenue - totalExpense

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {([3, 6, 12] as const).map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                months === m
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {m} เดือน
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv} disabled={!data.length}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Period summary cards */}
      {cur && (
        <div className="grid grid-cols-3 gap-3">
          {/* Revenue */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5">
            <p className="text-xs text-muted-foreground mb-1">รายได้รวม {months} เดือน</p>
            <p className="tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-lg leading-tight">
              {formatThaiMoney(totalRevenue)}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">เดือนนี้ {formatThaiMoney(cur.totalRevenue)}</span>
              {prev && <TrendBadge current={cur.totalRevenue} previous={prev.totalRevenue} label="MoM" />}
            </div>
          </div>

          {/* Expense */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5">
            <p className="text-xs text-muted-foreground mb-1">ค่าใช้จ่ายรวม {months} เดือน</p>
            <p className="tabular-nums font-bold text-red-600 dark:text-red-400 text-lg leading-tight">
              {formatThaiMoney(totalExpense)}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">เดือนนี้ {formatThaiMoney(cur.totalExpense)}</span>
              {prev && <TrendBadge current={cur.totalExpense} previous={prev.totalExpense} label="MoM" />}
            </div>
          </div>

          {/* Net */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5">
            <p className="text-xs text-muted-foreground mb-1">กำไรสุทธิรวม {months} เดือน</p>
            <p className={`tabular-nums font-bold text-lg leading-tight ${
              totalNet >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
            }`}>
              {formatThaiMoney(totalNet)}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">เดือนนี้ {formatThaiMoney(cur.netIncome)}</span>
              {prev && <TrendBadge current={cur.netIncome} previous={prev.netIncome} label="MoM" />}
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      )}

      {/* Bar chart */}
      {!isLoading && data.length > 0 && (
        <SectionCard>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis
                  dataKey="month"
                  tickFormatter={shortMonth}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => v === 0 ? '0' : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) =>
                    value === 'totalRevenue' ? 'รายได้' :
                    value === 'totalExpense' ? 'ค่าใช้จ่าย' : 'กำไรสุทธิ'
                  }
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.3} />
                <Bar dataKey="totalRevenue" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="totalExpense" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="netIncome"    fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Data table */}
      {!isLoading && data.length > 0 && (
        <SectionCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700/60">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">เดือน</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">รายได้</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">ค่าใช้จ่าย</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">กำไรสุทธิ</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">%ค่าใช้จ่าย</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((row) => {
                  const expRatio = row.totalRevenue > 0
                    ? ((row.totalExpense / row.totalRevenue) * 100).toFixed(1)
                    : '—'
                  return (
                    <tr key={row.month} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {thaiMonth(row.month)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-emerald-700 dark:text-emerald-400">
                        {formatThaiMoney(row.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-red-600 dark:text-red-400">
                        {formatThaiMoney(row.totalExpense)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-semibold ${
                        row.netIncome >= 0 ? 'text-slate-900 dark:text-white' : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {formatThaiMoney(row.netIncome)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">
                        {expRatio === '—' ? '—' : `${expRatio}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60">
                  <td className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">รวม</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {formatThaiMoney(totalRevenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-red-600 dark:text-red-400">
                    {formatThaiMoney(totalExpense)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-bold ${
                    totalNet >= 0 ? 'text-slate-900 dark:text-white' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    {formatThaiMoney(totalNet)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {totalRevenue > 0 ? `${((totalExpense / totalRevenue) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      )}

      {!isLoading && data.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] py-16 text-center text-sm text-muted-foreground italic">
          ยังไม่มีข้อมูลบัญชีในช่วงนี้
        </div>
      )}
    </div>
  )
}

export default function TrendsPage() {
  return (
    <ModuleGate module="accounting">
      <PageHeader
        icon={BarChart2}
        title="แนวโน้มกำไร"
        subtitle="Monthly P&L Trend — รายได้ / ค่าใช้จ่าย / กำไรสุทธิ รายเดือน"
      />
      <TrendsContent />
    </ModuleGate>
  )
}
