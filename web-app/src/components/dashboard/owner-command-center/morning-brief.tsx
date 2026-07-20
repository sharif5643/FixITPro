'use client'

import { Coffee, Sun, Sunset, Moon, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { PCard, Skel } from './primitives'
import { getTimeOfDay } from './utils'
import type { DashboardOverview, OwnerSummaryData } from './types'

interface Props {
  overview: DashboardOverview | undefined
  summary:  OwnerSummaryData | undefined
  loading:  boolean
}

const TIME_CFG = {
  morning:   { greeting: 'สวัสดีตอนเช้า', icon: Coffee, gradient: 'from-amber-500/8 via-transparent to-transparent', iconBg: 'bg-amber-50 dark:bg-amber-900/30', iconColor: 'text-amber-500' },
  afternoon: { greeting: 'สวัสดีตอนบ่าย', icon: Sun,    gradient: 'from-orange-500/8 via-transparent to-transparent', iconBg: 'bg-orange-50 dark:bg-orange-900/30', iconColor: 'text-orange-500' },
  evening:   { greeting: 'สวัสดีตอนเย็น', icon: Sunset, gradient: 'from-purple-500/8 via-transparent to-transparent', iconBg: 'bg-purple-50 dark:bg-purple-900/30', iconColor: 'text-purple-500' },
  night:     { greeting: 'ทำงานดึกด้วยนะ', icon: Moon,  gradient: 'from-slate-500/8 via-transparent to-transparent', iconBg: 'bg-slate-100 dark:bg-slate-700/40',  iconColor: 'text-slate-400 dark:text-slate-400' },
} as const

export function MorningBrief({ overview, summary, loading }: Props) {
  const tod = getTimeOfDay()
  const cfg = TIME_CFG[tod]
  const TimeIcon = cfg.icon

  const alerts = overview?.alerts
  const criticalCount = alerts
    ? (alerts.overdueRepairs > 0 ? 1 : 0) +
      (alerts.outOfStock > 0 ? 1 : 0) +
      (!overview?.currentShift.isOpen ? 1 : 0)
    : 0

  const shift   = overview?.currentShift
  const today   = summary?.today
  const netProfit = today?.netProfit ?? 0
  const profitable = today ? today.netProfit >= 0 : null

  return (
    <PCard className="overflow-hidden">
      <div className={cn('absolute inset-0 bg-gradient-to-r pointer-events-none', cfg.gradient)} aria-hidden />
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5">

        {/* Greeting */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn('flex items-center justify-center h-10 w-10 rounded-xl flex-shrink-0', cfg.iconBg)}>
            <TimeIcon className={cn('h-5 w-5', cfg.iconColor)} aria-hidden />
          </div>
          <div className="min-w-0">
            {loading ? (
              <>
                <Skel className="h-4 w-36 mb-1.5" />
                <Skel className="h-3 w-52" />
              </>
            ) : (
              <>
                <p className="font-bold text-slate-800 dark:text-white text-sm">{cfg.greeting}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {shift?.isOpen
                    ? `กะเปิดโดย ${shift.userName ?? '—'} · ยอดวันนี้ ${formatThaiMoney(today?.totalRevenue ?? 0)}`
                    : 'ยังไม่ได้เปิดกะวันนี้'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Right: net profit + alert badge */}
        {!loading && today && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">กำไรสุทธิวันนี้</p>
              <p className={cn(
                'text-sm font-black tabular-nums',
                profitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500',
              )}>
                {profitable ? '+' : ''}{formatThaiMoney(netProfit)}
              </p>
            </div>
            {criticalCount > 0 ? (
              <div
                aria-label={`${criticalCount} เรื่องด่วนที่ต้องดูแล`}
                className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 text-red-600 dark:text-red-400 rounded-xl px-2.5 py-1.5"
              >
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span className="text-xs font-bold whitespace-nowrap">{criticalCount} เรื่องด่วน</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/60 text-emerald-600 dark:text-emerald-400 rounded-xl px-2.5 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span className="text-xs font-bold whitespace-nowrap">ไม่มีเรื่องด่วน</span>
              </div>
            )}
          </div>
        )}
      </div>
    </PCard>
  )
}
