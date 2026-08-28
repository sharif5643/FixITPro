'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import { BookMarked, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { ModuleGate } from '@/components/auth/module-gate'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalLine {
  id: string
  accountCode: string
  accountName?: string
  debit: string | number
  credit: string | number
  note?: string | null
}

interface JournalEntry {
  id: string
  entryDate: string
  description: string
  sourceType?: string | null
  sourceId?: string | null
  isVoided: boolean
  voidedAt?: string | null
  voidReason?: string | null
  totalDebit: string | number
  totalCredit?: string | number
  lines: JournalLine[]
}

interface JournalPage {
  items: JournalEntry[]
  total: number
  page: number
  limit: number
}

// ── Source type label map ─────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  REPAIR_DEPOSIT:         'มัดจำซ่อม',
  REPAIR_FINAL_PAYMENT:   'รับเงินซ่อม',
  REPAIR_DEPOSIT_SETTLE:  'หักมัดจำ',
  REPAIR_DEPOSIT_REFUND:  'คืนมัดจำ',
  REPAIR_COGS:            'ต้นทุนซ่อม',
  REPAIR_PAYMENT_REVERSAL:'ยกเลิกรับเงิน',
  REPAIR_COGS_REVERSAL:   'ยกเลิกต้นทุน',
  EXPENSE_PAYMENT:        'ค่าใช้จ่าย',
  EXPENSE_REVERSAL:       'ยกเลิกค่าใช้จ่าย',
  SALE_REVENUE:           'รายได้ขาย',
  SALE_COGS:              'ต้นทุนขาย',
  SALE_EXCHANGE:          'แลกสินค้า',
  JOURNAL_MANUAL:         'บันทึกทั่วไป',
  JOURNAL_REVERSAL:       'กลับรายการ',
}

function sourceLabel(type?: string | null) {
  if (!type) return '—'
  return SOURCE_LABEL[type] ?? type
}

// ── Journal detail row (expandable) ──────────────────────────────────────────

function JournalLinesRow({ lines }: { lines: JournalLine[] }) {
  return (
    <tr>
      <td colSpan={6} className="px-4 pb-3 pt-0">
        <div className="rounded-lg border border-slate-100 dark:border-slate-700/50 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                <th className="text-left px-3 py-1.5 font-medium">บัญชี</th>
                <th className="text-right px-3 py-1.5 font-medium">เดบิต</th>
                <th className="text-right px-3 py-1.5 font-medium">เครดิต</th>
                <th className="text-left px-3 py-1.5 font-medium hidden sm:table-cell">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
                <tr key={ln.id} className="border-t border-slate-100 dark:border-slate-700/40">
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 font-mono">
                    {ln.accountCode}{ln.accountName ? ` ${ln.accountName}` : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-50">
                    {Number(ln.debit) > 0 ? formatThaiMoney(Number(ln.debit)) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-50">
                    {Number(ln.credit) > 0 ? formatThaiMoney(Number(ln.credit)) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400 dark:text-slate-500 hidden sm:table-cell">
                    {ln.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function JournalListContent() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery<JournalPage>({
    queryKey: ['accounting-journals', startDate, endDate],
    queryFn: () =>
      api.get('/accounting/journals', {
        params: { startDate, endDate, limit: '200' },
      }).then((r) => r.data),
  })

  const entries = data?.items ?? []

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="สมุดบัญชี"
        icon={BookMarked}
        subtitle={`${format(viewMonth, 'MMMM yyyy', { locale: th })} · ${entries.length} รายการ`}
      />

      {/* Month navigation */}
      <div className="flex items-center gap-1 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded-lg px-1 py-1 w-fit">
        <button
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>
        <span className="text-sm font-medium px-2 min-w-[130px] text-center text-slate-700 dark:text-slate-300">
          {format(viewMonth, 'MMMM yyyy', { locale: th })}
        </span>
        <button
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          disabled={viewMonth >= startOfMonth(new Date())}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <SectionCard noPadding>
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>วันที่</DataTableHeadCell>
            <DataTableHeadCell>ประเภท</DataTableHeadCell>
            <DataTableHeadCell>รายการ</DataTableHeadCell>
            <DataTableHeadCell right hidden>เดบิต</DataTableHeadCell>
            <DataTableHeadCell right>ยอดรวม</DataTableHeadCell>
            <DataTableHeadCell className="w-10" />
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={8} cols={6} />
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-0">
                  <EmptyState
                    preset="default"
                    size="md"
                    title="ไม่มีรายการบัญชีในเดือนนี้"
                  />
                </td>
              </tr>
            ) : (
              entries.map((je) => (
                <>
                  <DataTableRow
                    key={je.id}
                    className={`cursor-pointer ${je.isVoided ? 'opacity-50' : ''}`}
                    onClick={() => toggleExpand(je.id)}
                  >
                    <DataTableCell muted>
                      <span className="text-xs whitespace-nowrap">
                        {format(new Date(je.entryDate), 'dd MMM yy', { locale: th })}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {sourceLabel(je.sourceType)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <p className={`text-sm truncate max-w-[220px] ${je.isVoided ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-50'}`}>
                        {je.description}
                      </p>
                      {je.isVoided && (
                        <p className="text-xs text-red-500 mt-0.5">ยกเลิก: {je.voidReason}</p>
                      )}
                    </DataTableCell>
                    <DataTableCell right hidden>
                      <span className="tabular-nums text-sm font-medium text-slate-700 dark:text-slate-300">
                        {formatThaiMoney(Number(je.totalDebit ?? 0))}
                      </span>
                    </DataTableCell>
                    <DataTableCell right>
                      <span className="tabular-nums font-bold text-slate-900 dark:text-slate-50">
                        {formatThaiMoney(Number(je.totalDebit ?? 0))}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <span className="text-xs text-slate-400">
                        {expandedId === je.id ? '▲' : '▼'}
                      </span>
                    </DataTableCell>
                  </DataTableRow>
                  {expandedId === je.id && je.lines?.length > 0 && (
                    <JournalLinesRow key={`${je.id}-lines`} lines={je.lines} />
                  )}
                </>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>
    </div>
  )
}

export default function AccountingPage() {
  return (
    <ModuleGate module="accounting">
      <JournalListContent />
    </ModuleGate>
  )
}
