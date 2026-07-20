'use client'

import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PCard } from './primitives'
import { computeInsights } from './utils'
import type { DashboardOverview, OwnerSummaryData, SmartInsight } from './types'

const LEVEL_CFG: Record<SmartInsight['level'], { icon: React.ElementType; cls: string; iconCls: string }> = {
  critical: { icon: AlertTriangle, cls: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/60',     iconCls: 'text-red-500' },
  warning:  { icon: TrendingDown,  cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/60', iconCls: 'text-amber-500' },
  info:     { icon: Lightbulb,     cls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/60',  iconCls: 'text-blue-500' },
  positive: { icon: TrendingUp,    cls: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/60', iconCls: 'text-emerald-500' },
}

interface Props {
  overview: DashboardOverview | undefined
  summary: OwnerSummaryData | undefined
  loading: boolean
}

export function AIInsightCard({ overview, summary, loading }: Props) {
  const insights = computeInsights(overview, summary)
  const hasData  = !loading && overview && summary

  return (
    <PCard className="p-4 overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-50/60 to-transparent dark:from-violet-900/10 dark:to-transparent pointer-events-none rounded-2xl" aria-hidden />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex-shrink-0 shadow-sm">
            <Lightbulb className="h-4 w-4 text-white" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-800 dark:text-white">Smart Insight</h3>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700/40 px-1.5 py-0.5 rounded-full">
                Beta
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">คำนวณจากข้อมูลจริงของร้าน</p>
          </div>
        </div>

        {/* Content */}
        {!hasData ? (
          <div className="space-y-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 rounded-xl bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" aria-hidden />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">ทุกตัวชี้วัดอยู่ในเกณฑ์ปกติ</p>
          </div>
        ) : (
          <ul className="space-y-1.5" aria-label="ข้อสังเกตจากข้อมูลร้าน">
            {insights.map((ins, i) => {
              const cfg = LEVEL_CFG[ins.level]
              return (
                <li key={i} className={cn('flex items-start gap-2 rounded-xl border px-3 py-2', cfg.cls)}>
                  <cfg.icon className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', cfg.iconCls)} aria-hidden />
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{ins.text}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </PCard>
  )
}
