'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import Link from 'next/link'
import {
  ArrowLeft, GitBranch, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BranchRow {
  branchId:   string
  branchName: string
  totalIn:    number
  totalOut:   number
  net:        number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(d: Date) { return format(d, 'yyyy-MM-dd') }

function NetBadge({ value }: { value: number }) {
  if (value > 0)  return <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">+{formatThaiMoney(value)}</span>
  if (value < 0)  return <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums">{formatThaiMoney(value)}</span>
  return <span className="text-muted-foreground font-semibold tabular-nums">{formatThaiMoney(0)}</span>
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PRESET_RANGES = [
  { label: 'เดือนนี้', fn: () => { const t = new Date(); return { start: toDate(startOfMonth(t)), end: toDate(endOfMonth(t)) } } },
  { label: '7 วัน',   fn: () => { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - 6); return { start: toDate(s), end: toDate(t) } } },
  { label: '30 วัน',  fn: () => { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - 29); return { start: toDate(s), end: toDate(t) } } },
]

export default function BranchPnLPage() {
  const today   = new Date()
  const [start, setStart] = useState(toDate(startOfMonth(today)))
  const [end,   setEnd]   = useState(toDate(endOfMonth(today)))

  const { data = [], isLoading } = useQuery<BranchRow[]>({
    queryKey: ['finance-branch-pnl', start, end],
    queryFn:  async () => {
      const p = new URLSearchParams({ startDate: start, endDate: end })
      return (await api.get(`/finance/branch-pnl?${p}`)).data
    },
    staleTime: 60_000,
  })

  const totalIn  = data.reduce((s, r) => s + r.totalIn,  0)
  const totalOut = data.reduce((s, r) => s + r.totalOut, 0)
  const netAll   = totalIn - totalOut

  return (
    <div className="space-y-5">
      <PageHeader
        title="P&L รายสาขา"
        icon={GitBranch}
        subtitle="เปรียบเทียบรายรับ-รายจ่ายแต่ละสาขาในช่วงเวลาที่เลือก"
        primaryAction={
          <Link href="/finance">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              ภาพรวม
            </Button>
          </Link>
        }
      />

      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_RANGES.map(({ label, fn }) => (
          <Button key={label} variant="outline" size="sm" onClick={() => { const r = fn(); setStart(r.start); setEnd(r.end) }}>
            {label}
          </Button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" value={start} className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm" onChange={e => setStart(e.target.value)} />
          <span className="text-slate-400 text-sm">ถึง</span>
          <input type="date" value={end}   className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm" onChange={e => setEnd(e.target.value)} />
        </div>
      </div>

      {/* Summary totals */}
      {!isLoading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'รายรับรวม', value: totalIn,  icon: TrendingUp,   cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
            { label: 'รายจ่ายรวม', value: totalOut, icon: TrendingDown, cls: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
            { label: 'สุทธิ',       value: netAll,   icon: Minus,        cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${cls}`}><Icon className="h-3.5 w-3.5" /></div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-xl font-bold tabular-nums">{formatThaiMoney(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Branch table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-50 dark:bg-slate-700/20 animate-pulse" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <GitBranch className="h-10 w-10 text-slate-200 dark:text-slate-600" />
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-4 px-5 py-2.5 bg-slate-50 dark:bg-slate-700/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>สาขา</span>
              <span className="text-right">รายรับ</span>
              <span className="text-right">รายจ่าย</span>
              <span className="text-right">สุทธิ</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {data.map(row => (
                <div key={row.branchId} className="grid grid-cols-4 items-center px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{row.branchName}</span>
                  </div>
                  <span className="text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">{formatThaiMoney(row.totalIn)}</span>
                  <span className="text-right text-sm tabular-nums text-red-600 dark:text-red-400">{formatThaiMoney(row.totalOut)}</span>
                  <div className="text-right"><NetBadge value={row.net} /></div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
