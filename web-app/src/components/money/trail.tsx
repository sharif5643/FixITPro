'use client'

import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { DrillDrawer } from '@/components/reports/drill-drawer'
import { cn, formatThaiMoney } from '@/lib/utils'
import { DocLink, type DocRef } from './doc-peek'

/**
 * What a number is made of: one row per bill, job, expense or cash movement, each linking to
 * its document, and a last line that checks the rows add up to the number that was tapped.
 */
export interface TrailRow {
  time?: string | null
  doc?: DocRef | null
  label?: string
  sub?: string
  /** signed: below zero is money out / taken off */
  amount: number
}

export interface Trail {
  title: string
  /** the number that was tapped: the rows must add up to it */
  expect: number
  rows: TrailRow[]
  note?: string
}

const when = (d?: string | null) => d
  ? new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : ''

export function TrailList({ trail }: { trail: Trail }) {
  const sum = Math.round(trail.rows.reduce((t, r) => t + r.amount, 0) * 100) / 100
  const ok = Math.abs(sum - trail.expect) < 0.5
  const rows = [...trail.rows].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  return (
    <div className="space-y-3">
      {trail.note && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">{trail.note}</p>}
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white dark:divide-slate-700/60 dark:border-slate-700/60 dark:bg-[#1E293B]">
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีรายการ</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                {r.doc && <DocLink doc={r.doc} />}
                {r.label && <span className="truncate text-sm">{r.label}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">{[when(r.time), r.sub].filter(Boolean).join(' · ')}</p>
            </div>
            <span className={cn('shrink-0 text-sm font-semibold tabular-nums', r.amount < 0 && 'text-red-600 dark:text-red-400')}>
              {r.amount < 0 ? '− ' : ''}{formatThaiMoney(Math.abs(r.amount))}
            </span>
          </div>
        ))}
      </div>
      <div className={cn('flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold',
        ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200')}>
        <span className="flex items-center gap-1.5">
          {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          รวม {rows.length} รายการ {ok ? '= ตรงกับยอด' : `(ยอดที่แสดง ${formatThaiMoney(trail.expect)})`}
        </span>
        <span className="tabular-nums">{sum < 0 ? '− ' : ''}{formatThaiMoney(Math.abs(sum))}</span>
      </div>
    </div>
  )
}

/** The trail in a side panel */
export function TrailDrawer({ trail, onClose }: { trail: Trail | null; onClose: () => void }) {
  if (!trail) return null
  return (
    <DrillDrawer title={trail.title} onClose={onClose}>
      <TrailList trail={trail} />
    </DrillDrawer>
  )
}

/** Rows from the report's money trail (bills, repair payments, SIM sales, money with no bill) */
export interface TrailEntry { time: string; ref: DocRef | null; amount: number; method?: string; cost?: number; profit?: number }
const METHOD: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร', QR: 'QR' }
export const entryRows = (list: TrailEntry[] | undefined, sign = 1, pick: (e: TrailEntry) => number = (e) => e.amount): TrailRow[] =>
  (list ?? []).map((e) => ({ time: e.time, doc: e.ref, amount: sign * pick(e), sub: e.method ? METHOD[e.method] ?? e.method : undefined }))
