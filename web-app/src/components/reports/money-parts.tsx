'use client'

import { ChevronRight } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'

/**
 * Building blocks for the money screens (profit, daily close) in plain Thai: every number says
 * where it comes from, and the boxes add up in front of the reader.
 */

/** One line of a money box: label, amount, and an optional note on how it was worked out */
export function MoneyLine({ label, value, minus, total, muted, note }: {
  label: React.ReactNode
  value: number
  minus?: boolean
  total?: boolean
  muted?: boolean
  note?: string
}) {
  return (
    <div className={cn(
      'flex items-baseline justify-between gap-3 py-1 text-sm',
      total && 'mt-1.5 border-t border-slate-200 pt-2.5 text-base font-bold dark:border-slate-700',
      muted && 'pl-3 text-xs text-muted-foreground',
    )}>
      <span className="min-w-0">
        {label}
        {note && <span className="block text-[11px] font-normal text-muted-foreground">{note}</span>}
      </span>
      <span className={cn(
        'shrink-0 tabular-nums',
        !muted && !total && 'font-semibold',
        minus && 'text-red-600 dark:text-red-400',
        total && (value < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'),
      )}>
        {minus || (total && value < 0) ? '− ' : ''}{formatThaiMoney(Math.abs(value))}
      </span>
    </div>
  )
}

/** A box for one source of money (selling, repairs, SIM), with a plain note and a link to the list */
export function SourceCard({ icon, title, why, onDetail, detailLabel = 'ดูทีละรายการ', className, children }: {
  icon: string
  title: string
  why?: React.ReactNode
  onDetail?: () => void
  detailLabel?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B]', className)}>
      <h3 className="mb-2 flex items-center gap-2 text-base font-bold"><span>{icon}</span>{title}</h3>
      <div className="flex-1">{children}</div>
      {(why || onDetail) && (
        <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          {why}
          {onDetail && (
            <button type="button" onClick={onDetail} className="ml-1 inline-flex items-center font-semibold text-blue-600 hover:underline print:hidden">
              {detailLabel}<ChevronRight className="h-3 w-3" />
            </button>
          )}
        </p>
      )}
    </div>
  )
}

export type Pill = { label: string; value: number; tone: 'in' | 'out' | 'result'; result?: boolean }

const PILL_TONE: Record<Pill['tone'], string> = {
  in:     'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  out:    'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  result: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

/** "รับเงินมา ฿x − ทุน ฿y − ค่าใช้จ่าย ฿z = เหลือ ฿w", written out so it can be checked by hand */
export function MoneyEquation({ parts, className }: { parts: Pill[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-2', className)}>
      {parts.map((p, i) => {
        const op = i === 0 ? null : p.tone === 'result' ? '=' : p.tone === 'out' ? '−' : '+'
        return (
          <span key={p.label} className="flex items-center gap-2">
            {op && <span className="text-lg font-bold text-slate-400">{op}</span>}
            <span className={cn('rounded-xl px-3 py-1.5 text-sm font-bold tabular-nums', PILL_TONE[p.result && p.value < 0 ? 'out' : p.tone])}>
              {p.label} {formatThaiMoney(Math.abs(p.value))}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** One bar split into what stayed as profit, what the goods cost and what was spent */
export function SplitBar({ parts }: { parts: { value: number; className: string; label: string }[] }) {
  const shown = parts.filter((p) => p.value > 0)
  if (shown.length === 0) return null
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        {shown.map((p) => <div key={p.label} className={p.className} style={{ flex: p.value }} />)}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        {shown.map((p) => (
          <span key={p.label} className="flex items-center gap-1"><span className={cn('inline-block h-2 w-2 rounded-full', p.className)} />{p.label}</span>
        ))}
      </p>
    </div>
  )
}
