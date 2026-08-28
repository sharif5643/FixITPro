'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import { FileSpreadsheet, ChevronLeft, ChevronRight, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ModuleGate } from '@/components/auth/module-gate'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TBRow {
  code:        string
  nameTh:      string
  type:        string
  totalDebit:  number
  totalCredit: number
  balance:     number
}

interface TrialBalanceData {
  rows:        TBRow[]
  grandDebit:  number
  grandCredit: number
  balanced:    boolean
}

const TYPE_LABEL: Record<string, string> = {
  ASSET:     'สินทรัพย์',
  LIABILITY: 'หนี้สิน',
  EQUITY:    'ทุน',
  REVENUE:   'รายได้',
  EXPENSE:   'ค่าใช้จ่าย',
}

const TYPE_COLOR: Record<string, string> = {
  ASSET:     'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY:    'text-purple-600 dark:text-purple-400',
  REVENUE:   'text-green-600 dark:text-green-400',
  EXPENSE:   'text-amber-600 dark:text-amber-400',
}

// ── Main ──────────────────────────────────────────────────────────────────────

function TrialBalanceContent() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery<TrialBalanceData>({
    queryKey: ['accounting-trial-balance', startDate, endDate],
    queryFn:  () => api.get(`/accounting/reports/trial-balance?startDate=${startDate}&endDate=${endDate}`).then(r => r.data),
  })

  const handleExportCsv = () => {
    if (!data) return
    const rows: string[][] = [['รหัส', 'บัญชี', 'ประเภท', 'เดบิต', 'เครดิต', 'ยอดสุทธิ']]
    for (const r of data.rows) {
      rows.push([r.code, r.nameTh, TYPE_LABEL[r.type] ?? r.type, r.totalDebit.toFixed(2), r.totalCredit.toFixed(2), r.balance.toFixed(2)])
    }
    rows.push(['', 'รวมทั้งสิ้น', '', data.grandDebit.toFixed(2), data.grandCredit.toFixed(2), ''])

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `trial-balance-${format(viewMonth, 'yyyy-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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

      {isLoading && (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      )}

      {data && (
        <>
          {/* Balance indicator */}
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
            data.balanced
              ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700/40 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-400'
          }`}>
            {data.balanced
              ? <><CheckCircle2 className="h-4 w-4" /> งบทดลองสมดุล — เดบิต = เครดิต</>
              : <><AlertTriangle className="h-4 w-4" /> งบทดลองไม่สมดุล — ตรวจสอบรายการที่ผิดพลาด</>
            }
          </div>

          <SectionCard>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-700/60">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-16">รหัส</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">บัญชี</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">ประเภท</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">เดบิต</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">เครดิต</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden sm:table-cell">ยอดสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm italic">
                        ยังไม่มีรายการในงวดนี้
                      </td>
                    </tr>
                  ) : (
                    data.rows.map(r => (
                      <tr key={r.code} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-500">{r.code}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">{r.nameTh}</td>
                        <td className={`px-4 py-2.5 text-xs font-medium hidden sm:table-cell ${TYPE_COLOR[r.type] ?? ''}`}>
                          {TYPE_LABEL[r.type] ?? r.type}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-slate-700 dark:text-slate-200">
                          {r.totalDebit > 0 ? formatThaiMoney(r.totalDebit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-slate-700 dark:text-slate-200">
                          {r.totalCredit > 0 ? formatThaiMoney(r.totalCredit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-sm font-medium hidden sm:table-cell text-slate-800 dark:text-slate-100">
                          {formatThaiMoney(r.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60">
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">รวมทั้งสิ้น</td>
                      <td className="hidden sm:table-cell" />
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                        {formatThaiMoney(data.grandDebit)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-white">
                        {formatThaiMoney(data.grandCredit)}
                      </td>
                      <td className="hidden sm:table-cell" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}

export default function TrialBalancePage() {
  return (
    <ModuleGate module="accounting">
      <PageHeader
        icon={FileSpreadsheet}
        title="งบทดลอง"
        subtitle="Trial Balance — ยอดเดบิต/เครดิตรวมของทุกบัญชีในช่วงเวลาที่ระบุ"
      />
      <TrialBalanceContent />
    </ModuleGate>
  )
}
