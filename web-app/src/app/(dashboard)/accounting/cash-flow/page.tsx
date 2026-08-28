'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2, TrendingUp, TrendingDown, Waves } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ModuleGate } from '@/components/auth/module-gate'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CashFlowItem {
  sourceType: string
  label:      string
  inflow:     number
  outflow:    number
  net:        number
}

interface CashFlowData {
  items:        CashFlowItem[]
  totalInflow:  number
  totalOutflow: number
  netCashFlow:  number
}

// ── Main ──────────────────────────────────────────────────────────────────────

function CashFlowContent() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ['accounting-cash-flow', startDate, endDate],
    queryFn:  () => api.get(`/accounting/reports/cash-flow?startDate=${startDate}&endDate=${endDate}`).then(r => r.data),
  })

  const handleExportCsv = () => {
    if (!data) return
    const rows: string[][] = [['ประเภทรายการ', 'เงินเข้า', 'เงินออก', 'สุทธิ']]
    for (const item of data.items) {
      rows.push([item.label, item.inflow.toFixed(2), item.outflow.toFixed(2), item.net.toFixed(2)])
    }
    rows.push(['รวม', data.totalInflow.toFixed(2), data.totalOutflow.toFixed(2), data.netCashFlow.toFixed(2)])
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `cash-flow-${format(viewMonth, 'yyyy-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isPositive = !data || data.netCashFlow >= 0

  return (
    <div className="space-y-5">
      {/* Controls */}
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

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5 flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">เงินเข้าทั้งหมด</p>
              <p className="mt-0.5 tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-lg leading-tight">
                {formatThaiMoney(data.totalInflow)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5 flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <TrendingDown className="h-4 w-4 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">เงินออกทั้งหมด</p>
              <p className="mt-0.5 tabular-nums font-bold text-red-600 dark:text-red-400 text-lg leading-tight">
                {formatThaiMoney(data.totalOutflow)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5 flex items-start gap-3">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              isPositive ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
            }`}>
              <Waves className={`h-4 w-4 ${isPositive ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">กระแสเงินสดสุทธิ</p>
              <p className={`mt-0.5 tabular-nums font-bold text-lg leading-tight ${
                isPositive ? 'text-blue-700 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {formatThaiMoney(data.netCashFlow)}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      )}

      {data && (
        <SectionCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700/60">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">ประเภทรายการ</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">เงินเข้า</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">เงินออก</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">สุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                      ยังไม่มีรายการในงวดนี้
                    </td>
                  </tr>
                ) : (
                  data.items.map(item => (
                    <tr key={item.sourceType} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{item.label}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-emerald-700 dark:text-emerald-400">
                        {item.inflow > 0 ? formatThaiMoney(item.inflow) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-red-600 dark:text-red-400">
                        {item.outflow > 0 ? formatThaiMoney(item.outflow) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-sm font-semibold ${
                        item.net >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatThaiMoney(item.net)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60">
                    <td className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">รวมทั้งสิ้น</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {formatThaiMoney(data.totalInflow)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-red-600 dark:text-red-400">
                      {formatThaiMoney(data.totalOutflow)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-bold ${
                      data.netCashFlow >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {formatThaiMoney(data.netCashFlow)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

export default function CashFlowPage() {
  return (
    <ModuleGate module="accounting">
      <PageHeader
        icon={ArrowUpDown}
        title="งบกระแสเงินสด"
        subtitle="Cash Flow Statement — กระแสเงินสดรับ/จ่าย แยกตามประเภทรายการ"
      />
      <CashFlowContent />
    </ModuleGate>
  )
}
