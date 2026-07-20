'use client'

import Link from 'next/link'
import { Activity, ChevronRight } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { Skel, PCard, HEALTH_CFG, CardHeader } from './primitives'
import type { DashboardOverview } from './types'

interface Props {
  branches: DashboardOverview['branchPerformance'] | undefined
  loading: boolean
}

export function BranchHealthRow({ branches, loading }: Props) {
  const hasBranches = loading || (branches && branches.length > 1)
  if (!hasBranches) return null

  const sorted = [...(branches ?? [])].sort((a, b) => {
    const order = { CRITICAL: 0, WARNING: 1, NORMAL: 2 }
    return order[a.health] - order[b.health]
  })

  return (
    <PCard className="p-5">
      <CardHeader
        icon={Activity} iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor="text-blue-600 dark:text-blue-400"
        title="สถานะสาขา"
      >
        <Link
          href="/branches"
          className="ml-auto text-[10px] text-blue-500 font-semibold hover:underline flex items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          จัดการ <ChevronRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardHeader>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => <Skel key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sorted.slice(0, 6).map(b => {
            const cfg = HEALTH_CFG[b.health]
            return (
              <div
                key={b.branchId}
                className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{b.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {formatThaiMoney(b.totalRevenue)}
                    {b.overdueRepairs > 0 && ` · เกิน ${b.overdueRepairs}`}
                  </p>
                </div>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0', cfg.cls)}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PCard>
  )
}
