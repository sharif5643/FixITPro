'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ScrollText, ChevronLeft, ChevronRight,
  Download, Loader2, ArrowLeft, ChevronLeftIcon, ChevronRightIcon,
} from 'lucide-react'
import { ModuleGate } from '@/components/auth/module-gate'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerItem {
  id:             string
  entryDate:      string
  entryNumber:    string
  description:    string
  sourceType?:    string | null
  debit:          number
  credit:         number
  note?:          string | null
  runningBalance: number
}

interface LedgerData {
  account: {
    code:    string
    nameTh:  string
    type:    string
  }
  openingBalance: number
  isDebitNormal:  boolean
  items:          LedgerItem[]
  total:          number
  page:           number
  limit:          number
}

// ── Source type labels ────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  REPAIR_DEPOSIT:               'มัดจำซ่อม',
  REPAIR_FINAL_PAYMENT:         'รับเงินซ่อม',
  REPAIR_DEPOSIT_SETTLE:        'หักมัดจำ',
  REPAIR_DEPOSIT_REFUND:        'คืนมัดจำ',
  REPAIR_COGS:                  'ต้นทุนซ่อม',
  REPAIR_PAYMENT_REVERSAL:      'ยกเลิกรับเงิน',
  REPAIR_COGS_REVERSAL:         'ยกเลิกต้นทุน',
  REPAIR_ADDITIONAL_PAYMENT:    'ชำระเพิ่มเติม',
  EXPENSE_PAYMENT:              'ค่าใช้จ่าย',
  EXPENSE_REVERSAL:             'ยกเลิกค่าใช้จ่าย',
  SALE_REVENUE:                 'รายได้ขาย',
  SALE_COGS:                    'ต้นทุนขาย',
  SALE_EXCHANGE:                'แลกสินค้า',
  JOURNAL_MANUAL:               'บันทึกทั่วไป',
  JOURNAL_REVERSAL:             'กลับรายการ',
}

const TYPE_COLOR: Record<string, string> = {
  ASSET:     'text-blue-600 dark:text-blue-400',
  LIABILITY: 'text-red-600 dark:text-red-400',
  EQUITY:    'text-purple-600 dark:text-purple-400',
  REVENUE:   'text-green-600 dark:text-green-400',
  EXPENSE:   'text-amber-600 dark:text-amber-400',
}

const TYPE_LABEL: Record<string, string> = {
  ASSET: 'สินทรัพย์', LIABILITY: 'หนี้สิน',
  EQUITY: 'ทุน', REVENUE: 'รายได้', EXPENSE: 'ค่าใช้จ่าย',
}

const LIMIT = 50

// ── Main ──────────────────────────────────────────────────────────────────────

function LedgerContent({ accountId }: { accountId: string }) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [page, setPage] = useState(1)

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery<LedgerData | null>({
    queryKey: ['accounting-ledger', accountId, startDate, endDate, page],
    queryFn:  () =>
      api.get(`/accounting/reports/ledger/${accountId}?startDate=${startDate}&endDate=${endDate}&page=${page}&limit=${LIMIT}`)
        .then(r => r.data),
  })

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1

  function handleMonthChange(delta: number) {
    setViewMonth(m => startOfMonth(delta > 0 ? addMonths(m, 1) : subMonths(m, 1)))
    setPage(1)
  }

  const handleExportCsv = () => {
    if (!data) return
    const rows: string[][] = [
      ['วันที่', 'เลขที่', 'รายการ', 'แหล่งที่มา', 'เดบิต', 'เครดิต', 'ยอดคงเหลือ'],
    ]
    rows.push(['', '', 'ยอดยกมา', '', '', '', data.openingBalance.toFixed(2)])
    for (const item of data.items) {
      rows.push([
        format(new Date(item.entryDate), 'dd/MM/yyyy'),
        item.entryNumber,
        item.description,
        SOURCE_LABEL[item.sourceType ?? ''] ?? (item.sourceType ?? ''),
        item.debit > 0 ? item.debit.toFixed(2) : '',
        item.credit > 0 ? item.credit.toFixed(2) : '',
        item.runningBalance.toFixed(2),
      ])
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `ledger-${data.account.code}-${format(viewMonth, 'yyyy-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/accounting/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        ผังบัญชี
      </Link>

      {/* Account header */}
      {data && (
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <ScrollText className="h-5 w-5 text-muted-foreground" />
              <span className="font-mono text-sm text-muted-foreground">{data.account.code}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[data.account.type]}`}>
                {TYPE_LABEL[data.account.type] ?? data.account.type}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{data.account.nameTh}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              บัญชีแยกประเภท · {data.isDebitNormal ? 'บัญชีปกติเดบิต' : 'บัญชีปกติเครดิต'}
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => handleMonthChange(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-slate-800 dark:text-slate-100 min-w-[140px] text-center">
            {format(viewMonth, 'MMMM yyyy', { locale: th })}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => handleMonthChange(1)}>
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
        <SectionCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700/60">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-24">วันที่</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">เลขที่</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">รายการ</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-28">เดบิต</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-28">เครดิต</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-32">ยอดคงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{startDate}</td>
                  <td className="px-4 py-2 hidden md:table-cell" />
                  <td className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 italic">ยอดยกมา</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className={`px-4 py-2 text-right tabular-nums text-sm font-semibold ${
                    data.openingBalance >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatThaiMoney(data.openingBalance)}
                  </td>
                </tr>

                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                      ไม่มีรายการในช่วงเวลานี้
                    </td>
                  </tr>
                ) : (
                  data.items.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.entryDate), 'dd/MM/yy', { locale: th })}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-500 hidden md:table-cell whitespace-nowrap">
                        {item.entryNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-slate-800 dark:text-slate-100 leading-snug">{item.description}</p>
                        {item.sourceType && (
                          <p className="text-xs text-muted-foreground">{SOURCE_LABEL[item.sourceType] ?? item.sourceType}</p>
                        )}
                        {item.note && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic">{item.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm text-slate-700 dark:text-slate-200">
                        {item.debit > 0 ? formatThaiMoney(item.debit) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm text-slate-700 dark:text-slate-200">
                        {item.credit > 0 ? formatThaiMoney(item.credit) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-semibold ${
                        item.runningBalance >= 0
                          ? 'text-slate-900 dark:text-white'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatThaiMoney(item.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Period totals footer */}
              {data.items.length > 0 && (() => {
                const totalDr = data.items.reduce((s, i) => s + i.debit, 0)
                const totalCr = data.items.reduce((s, i) => s + i.credit, 0)
                const closingBalance = data.items.at(-1)?.runningBalance ?? data.openingBalance
                return (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60">
                      <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground" colSpan={2}>รวมในงวด</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell"></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-slate-800 dark:text-slate-100">
                        {formatThaiMoney(totalDr)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-slate-800 dark:text-slate-100">
                        {formatThaiMoney(totalCr)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-bold ${
                        closingBalance >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatThaiMoney(closingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-muted-foreground">
                {data.total} รายการ · หน้า {page}/{totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

export default function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <ModuleGate module="accounting">
      <LedgerContent accountId={id} />
    </ModuleGate>
  )
}
