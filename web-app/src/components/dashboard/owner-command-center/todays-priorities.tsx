'use client'

import Link from 'next/link'
import { Flag, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PCard, Skel, SEV_CFG, CardHeader } from './primitives'
import { computePriorities } from './utils'
import type { DashboardOverview, OwnerSummaryData } from './types'

interface Props {
  overview: DashboardOverview | undefined
  summary:  OwnerSummaryData | undefined
  loading:  boolean
}

const LEVEL_TO_SEV = { critical: 'CRITICAL', warning: 'WARNING', info: 'INFO' } as const

export function TodaysPriorities({ overview, summary, loading }: Props) {
  const priorities = computePriorities(overview, summary)
  const hasCritical = priorities.some(p => p.level === 'critical')

  return (
    <PCard className="p-5" urgent={hasCritical}>
      <CardHeader
        icon={Flag} iconBg="bg-red-50 dark:bg-red-900/30" iconColor="text-red-500"
        title="สิ่งที่ต้องทำวันนี้"
      />

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skel key={i} className="h-11 w-full" />)}
        </div>
      ) : priorities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden />
          <p className="text-xs text-slate-400 dark:text-slate-500">ไม่มีงานด่วนวันนี้</p>
        </div>
      ) : (
        <ol className="space-y-1.5" aria-label="รายการงานสำคัญวันนี้">
          {priorities.map((p, i) => {
            const cfg = SEV_CFG[LEVEL_TO_SEV[p.level]]
            return (
              <li key={p.id}>
                <Link
                  href={p.link}
                  aria-label={`${p.text} — ${p.linkLabel}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[44px]',
                    'motion-safe:transition-all hover:brightness-[1.04]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    cfg.cls,
                  )}
                >
                  <span className={cn('text-[10px] font-black tabular-nums w-4 flex-shrink-0', cfg.text)}>
                    {i + 1}
                  </span>
                  <span className={cn('flex-1 text-xs font-medium leading-snug', cfg.text)}>{p.text}</span>
                  <span className={cn('text-[10px] flex-shrink-0 hidden sm:block opacity-70', cfg.text)}>
                    {p.linkLabel}
                  </span>
                  <ChevronRight className={cn('h-3.5 w-3.5 flex-shrink-0 opacity-60', cfg.text)} aria-hidden />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </PCard>
  )
}
