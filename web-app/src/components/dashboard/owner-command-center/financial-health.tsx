'use client'

import { DollarSign, TrendingDown } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { PCard, Skel, CardHeader } from './primitives'
import type { OwnerSummaryData } from './types'

interface Props {
  summary: OwnerSummaryData | undefined
  loading: boolean
}

function PnLRow({
  label, value, color,
}: { label: string; value: number | null; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={cn('text-xs font-bold tabular-nums', color ?? 'text-slate-700 dark:text-slate-300')}>
        {value !== null ? formatThaiMoney(value) : '—'}
      </span>
    </div>
  )
}

export function FinancialHealth({ summary, loading }: Props) {
  const today   = summary?.today
  const monthly = summary?.monthly

  const grossMarginPct = today && today.totalRevenue > 0
    ? Math.round((today.grossProfit / today.totalRevenue) * 100) : null
  const netMarginPct = today && today.totalRevenue > 0
    ? Math.round((today.netProfit / today.totalRevenue) * 100) : null
  const expenseRatioPct = today && today.grossProfit > 0
    ? Math.min(100, Math.round((today.totalExpenses / today.grossProfit) * 100)) : null

  const salesShare  = today && today.totalRevenue > 0
    ? Math.round((today.salesRevenue / today.totalRevenue) * 100) : 50
  const repairShare = 100 - salesShare

  function marginColor(pct: number | null, goodThreshold: number, warnThreshold: number) {
    if (pct === null) return 'text-slate-400'
    if (pct >= goodThreshold) return 'text-emerald-600 dark:text-emerald-400'
    if (pct >= warnThreshold) return 'text-amber-500'
    return 'text-red-500'
  }

  return (
    <PCard className="p-5">
      <CardHeader
        icon={DollarSign}
        iconBg="bg-emerald-50 dark:bg-emerald-900/30"
        iconColor="text-emerald-600 dark:text-emerald-400"
        title="สุขภาพการเงิน"
      />

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skel key={i} className="h-6 w-full" />)}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Margin gauges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Gross Margin</p>
              <p className={cn('text-2xl font-black tabular-nums', marginColor(grossMarginPct, 30, 15))}>
                {grossMarginPct !== null ? `${grossMarginPct}%` : '—'}
              </p>
            </div>
            <div className="text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Net Margin</p>
              <p className={cn('text-2xl font-black tabular-nums', marginColor(netMarginPct, 10, 0))}>
                {netMarginPct !== null ? `${netMarginPct}%` : '—'}
              </p>
            </div>
          </div>

          {/* Revenue split bar */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
              <span>POS {salesShare}%</span>
              <span>ซ่อม {repairShare}%</span>
            </div>
            <div
              className="flex h-2 rounded-full overflow-hidden"
              role="img"
              aria-label={`ยอดขาย POS ${salesShare}% ซ่อม ${repairShare}%`}
            >
              <div className="bg-blue-500" style={{ width: `${salesShare}%` }} />
              <div className="bg-violet-500 flex-1" />
            </div>
          </div>

          {/* P&L rows */}
          <div>
            <PnLRow label="รายรับรวมวันนี้" value={today?.totalRevenue ?? null} />
            <PnLRow
              label="กำไรขั้นต้น" value={today?.grossProfit ?? null}
              color={today && today.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}
            />
            <PnLRow label="ค่าใช้จ่าย" value={today?.totalExpenses ?? null} color="text-amber-500" />
            <PnLRow
              label="กำไรสุทธิ" value={today?.netProfit ?? null}
              color={today && today.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}
            />
          </div>

          {/* Monthly summary */}
          {monthly && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">เดือนนี้ (สะสม)</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([
                  { label: 'รายรับ',    value: monthly.totalRevenue, color: '' },
                  { label: 'กำไรขั้นต้น', value: monthly.grossProfit, color: monthly.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
                  { label: 'กำไรสุทธิ',  value: monthly.netProfit,   color: monthly.netProfit  >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
                ] as const).map(({ label, value, color }) => (
                  <div key={label}>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
                    <p className={cn('text-xs font-bold tabular-nums mt-0.5', color || 'text-slate-700 dark:text-slate-300')}>
                      {formatThaiMoney(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense warning */}
          {expenseRatioPct !== null && expenseRatioPct >= 80 && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/60 rounded-xl px-3 py-2">
              <TrendingDown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" aria-hidden />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ค่าใช้จ่าย {expenseRatioPct}% ของกำไรขั้นต้น — สูงกว่าเกณฑ์
              </p>
            </div>
          )}
        </div>
      )}
    </PCard>
  )
}
