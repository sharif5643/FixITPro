'use client'

import { AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBranchStore } from '@/store/branch.store'
import type { BranchPerformanceRow } from './branch-ranking-table'

interface Props {
  branches: BranchPerformanceRow[]
}

export function BranchIssueList({ branches }: Props) {
  const setSelectedBranch = useBranchStore(s => s.setSelectedBranch)

  const issueRows = branches
    .filter(b => b.health !== 'NORMAL')
    .sort((a, b) => {
      if (a.health === 'CRITICAL' && b.health !== 'CRITICAL') return -1
      if (a.health !== 'CRITICAL' && b.health === 'CRITICAL') return 1
      return b.overdueRepairs + b.openRepairs - (a.overdueRepairs + a.openRepairs)
    })

  if (!issueRows.length) return null

  return (
    <div className="space-y-2">
      {issueRows.map(b => {
        const isCritical = b.health === 'CRITICAL'
        const Icon = isCritical ? AlertTriangle : AlertCircle
        const issueText = isCritical
          ? `${b.overdueRepairs} งานเกินกำหนด`
          : `งานเปิด ${b.openRepairs} รายการ`

        return (
          <button
            key={b.branchId}
            onClick={() => setSelectedBranch(b.branchId)}
            className={cn(
              'w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:opacity-80',
              isCritical
                ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0',
                isCritical ? 'text-red-500' : 'text-amber-500',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-semibold', isCritical ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300')}>
                {b.name}
              </p>
              <p className={cn('text-xs', isCritical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                {issueText}
              </p>
            </div>
            <ArrowRight className={cn('h-4 w-4 shrink-0', isCritical ? 'text-red-400' : 'text-amber-400')} />
          </button>
        )
      })}
    </div>
  )
}
