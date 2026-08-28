'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Scale, Download, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ModuleGate } from '@/components/auth/module-gate'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BSRow {
  code:    string
  nameTh:  string
  type:    string
  balance: number
}

interface BalanceSheetData {
  assets:           BSRow[]
  liabilities:      BSRow[]
  equity:           BSRow[]
  totalAssets:      number
  totalLiabilities: number
  totalEquity:      number
}

// ── Row component ─────────────────────────────────────────────────────────────

function BSRow({ row, color }: { row: BSRow; color: string }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-500 w-16">{row.code}</td>
      <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">{row.nameTh}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${color}`}>
        {formatThaiMoney(row.balance)}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, amount, borderClass, textClass }: { label: string; amount: number; borderClass: string; textClass: string }) {
  return (
    <tr className={`border-t-2 ${borderClass}`}>
      <td className="px-4 py-2.5 w-16" />
      <td className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">{label}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-bold ${textClass}`}>{formatThaiMoney(amount)}</td>
    </tr>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

function BalanceSheetContent() {
  const [asOfDate, setAsOfDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const { data, isLoading } = useQuery<BalanceSheetData>({
    queryKey: ['accounting-balance-sheet', asOfDate],
    queryFn:  () => api.get(`/accounting/reports/balance-sheet?asOfDate=${asOfDate}`).then(r => r.data),
  })

  const balanced = data ? Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 0.01 : true

  const handleExportCsv = () => {
    if (!data) return
    const rows: string[][] = [['รหัส', 'บัญชี', 'ประเภท', 'ยอดคงเหลือ (บาท)']]
    for (const r of data.assets)      rows.push([r.code, r.nameTh, 'สินทรัพย์', r.balance.toFixed(2)])
    rows.push(['', 'สินทรัพย์รวม', '', data.totalAssets.toFixed(2)])
    rows.push([])
    for (const r of data.liabilities) rows.push([r.code, r.nameTh, 'หนี้สิน', r.balance.toFixed(2)])
    rows.push(['', 'หนี้สินรวม', '', data.totalLiabilities.toFixed(2)])
    rows.push([])
    for (const r of data.equity)      rows.push([r.code, r.nameTh, 'ทุน', r.balance.toFixed(2)])
    rows.push(['', 'ทุนรวม', '', data.totalEquity.toFixed(2)])
    rows.push([])
    rows.push(['', 'หนี้สิน + ทุน รวม', '', (data.totalLiabilities + data.totalEquity).toFixed(2)])

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `balance-sheet-${asOfDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Date picker + export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">ณ วันที่</label>
          <input
            type="date"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
            className="h-8 rounded-md border border-slate-200 dark:border-slate-700/60 bg-background px-2 text-sm"
          />
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
          {/* Balanced indicator */}
          {!balanced && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-700/40 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
              ⚠ งบดุลไม่สมดุล — ตรวจสอบรายการที่ขาดหรือผิดพลาด
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-blue-100 dark:border-blue-700/40 bg-blue-50/50 dark:bg-blue-900/10 p-4">
              <p className="text-xs text-muted-foreground mb-1">สินทรัพย์รวม</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">{formatThaiMoney(data.totalAssets)}</p>
            </div>
            <div className="rounded-xl border border-red-100 dark:border-red-700/40 bg-red-50/50 dark:bg-red-900/10 p-4">
              <p className="text-xs text-muted-foreground mb-1">หนี้สินรวม</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">{formatThaiMoney(data.totalLiabilities)}</p>
            </div>
            <div className="rounded-xl border border-purple-100 dark:border-purple-700/40 bg-purple-50/50 dark:bg-purple-900/10 p-4">
              <p className="text-xs text-muted-foreground mb-1">ทุนรวม</p>
              <p className="text-xl font-bold text-purple-700 dark:text-purple-400 tabular-nums">{formatThaiMoney(data.totalEquity)}</p>
            </div>
          </div>

          {/* Assets */}
          <SectionCard>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-3">สินทรัพย์ (Assets)</p>
            {data.assets.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground w-16">รหัส</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">บัญชี</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">ยอดคงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assets.map(r => <BSRow key={r.code} row={r} color="text-blue-700 dark:text-blue-400" />)}
                    <SubtotalRow label="สินทรัพย์รวม" amount={data.totalAssets} borderClass="border-blue-200 dark:border-blue-700/40" textClass="text-blue-700 dark:text-blue-400" />
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Liabilities */}
          <SectionCard>
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-3">หนี้สิน (Liabilities)</p>
            {data.liabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground w-16">รหัส</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">บัญชี</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">ยอดคงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.liabilities.map(r => <BSRow key={r.code} row={r} color="text-red-600 dark:text-red-400" />)}
                    <SubtotalRow label="หนี้สินรวม" amount={data.totalLiabilities} borderClass="border-red-200 dark:border-red-700/40" textClass="text-red-600 dark:text-red-400" />
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Equity */}
          <SectionCard>
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-3">ทุน (Equity)</p>
            {data.equity.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground w-16">รหัส</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">บัญชี</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">ยอดคงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.equity.map(r => <BSRow key={r.code} row={r} color="text-purple-700 dark:text-purple-400" />)}
                    <SubtotalRow label="ทุนรวม" amount={data.totalEquity} borderClass="border-purple-200 dark:border-purple-700/40" textClass="text-purple-700 dark:text-purple-400" />
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Balance check */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4 flex items-center justify-between">
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">หนี้สิน + ทุน รวม</p>
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatThaiMoney(data.totalLiabilities + data.totalEquity)}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default function BalanceSheetPage() {
  return (
    <ModuleGate module="accounting">
      <PageHeader
        icon={Scale}
        title="งบดุล"
        subtitle="Balance Sheet — สินทรัพย์ หนี้สิน และทุนของกิจการ ณ วันที่ระบุ"
      />
      <BalanceSheetContent />
    </ModuleGate>
  )
}
