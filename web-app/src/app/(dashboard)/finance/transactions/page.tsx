'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import Link from 'next/link'
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle, Filter, ChevronLeft, ChevronRight,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatThaiMoney } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id:            string
  type:          string
  direction:     'IN' | 'OUT'
  amount:        number
  sourceType:    string | null
  referenceType: string | null
  referenceId:   string | null
  paymentMethod: string | null
  reason:        string | null
  createdAt:     string
  sessionId:     string | null
  actorUserId:   string | null
  branchId:      string | null
}

interface TransactionResponse {
  data: LedgerEntry[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  SALE_PAYMENT:              'ยอดขาย',
  REPAIR_FINAL_PAYMENT:      'ค่าซ่อม',
  REPAIR_DEPOSIT:            'มัดจำซ่อม',
  REPAIR_ADDITIONAL_PAYMENT: 'บริการเพิ่ม',
  EXPENSE_PAYMENT:           'ค่าใช้จ่าย',
  SUPPLIER_PAYMENT:          'ซัพพลายเออร์',
  SALE_REFUND:               'คืนเงิน',
  CASH_WITHDRAWAL:           'เบิกเงิน',
  CASH_DEPOSIT:              'เติมเงิน',
  BANK_DEPOSIT:              'ฝากธนาคาร',
  OPENING:                   'เปิดกะ',
  MANUAL:                    'อื่น ๆ',
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร',
  QR: 'QR', BANK: 'ธนาคาร',
}

function fmtDt(s: string) {
  try { return format(new Date(s), 'dd MMM yy HH:mm', { locale: th }) } catch { return s }
}

// ── Page ──────────────────────────────────────────────────────────────────────

const LIMIT = 50

export default function TransactionsPage() {
  const today    = new Date().toISOString().slice(0, 10)
  const [start,  setStart]  = useState('')
  const [end,    setEnd]    = useState('')
  const [dir,    setDir]    = useState('')
  const [src,    setSrc]    = useState('')
  const [page,   setPage]   = useState(1)

  const { branchId } = useBranchContext()

  const { data, isLoading } = useQuery<TransactionResponse>({
    queryKey: ['finance-transactions', start, end, dir, src, page, branchId],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (start)    p.set('startDate',  start)
      if (end)      p.set('endDate',    end)
      if (dir)      p.set('direction',  dir)
      if (src)      p.set('sourceType', src)
      if (branchId) p.set('branchId',   branchId)
      return (await api.get(`/finance/transactions?${p}`)).data
    },
    staleTime: 30_000,
    placeholderData: prev => prev,
  })

  const entries = data?.data ?? []
  const meta    = data?.meta

  return (
    <div className="space-y-5">
      <PageHeader
        title="รายการบัญชี"
        icon={Receipt}
        subtitle="ประวัติรายรับ-รายจ่ายทั้งหมดจากลิ้นชักเงินสด"
        secondaryActions={<BranchContextBar className="hidden sm:flex" />}
        primaryAction={
          <Link href="/finance">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              ภาพรวม
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        <input
          type="date"
          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
          value={start}
          placeholder="ตั้งแต่"
          onChange={e => { setStart(e.target.value); setPage(1) }}
        />
        <span className="text-slate-400 text-sm">–</span>
        <input
          type="date"
          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
          value={end}
          onChange={e => { setEnd(e.target.value); setPage(1) }}
        />
        <select
          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
          value={dir}
          onChange={e => { setDir(e.target.value); setPage(1) }}
        >
          <option value="">ทั้งหมด</option>
          <option value="IN">รายรับ</option>
          <option value="OUT">รายจ่าย</option>
        </select>
        <select
          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
          value={src}
          onChange={e => { setSrc(e.target.value); setPage(1) }}
        >
          <option value="">ทุกประเภท</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(start || end || dir || src) && (
          <Button variant="ghost" size="sm" onClick={() => { setStart(''); setEnd(''); setDir(''); setSrc(''); setPage(1) }}>
            ล้างตัวกรอง
          </Button>
        )}
        {meta && (
          <span className="ml-auto text-xs text-muted-foreground">{meta.total.toLocaleString()} รายการ</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-700/60">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-50 dark:bg-slate-700/20 animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Receipt className="h-10 w-10 text-slate-200 dark:text-slate-600" />
            <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {entries.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                <div className={`shrink-0 p-1.5 rounded-full ${e.direction === 'IN' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-500'}`}>
                  {e.direction === 'IN'
                    ? <ArrowUpCircle className="h-4 w-4" />
                    : <ArrowDownCircle className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {SOURCE_LABEL[e.sourceType ?? ''] ?? e.reason ?? e.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDt(e.createdAt)}
                    {e.paymentMethod && <span className="ml-1">· {PAYMENT_LABEL[e.paymentMethod] ?? e.paymentMethod}</span>}
                    {!e.sessionId && <span className="ml-1 text-amber-500">· ไม่มีเซสชัน</span>}
                  </p>
                </div>
                <div className={`shrink-0 text-sm font-semibold tabular-nums ${e.direction === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {e.direction === 'IN' ? '+' : '−'}{formatThaiMoney(e.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            หน้า {meta.page} / {meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
