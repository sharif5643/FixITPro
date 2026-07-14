'use client'

import { Building2, AlertTriangle, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { useBranchStore } from '@/store/branch.store'

export interface BranchPerformanceRow {
  branchId: string
  name: string
  salesRevenue: number
  repairRevenue: number
  totalRevenue: number
  openRepairs: number
  overdueRepairs: number
  health: 'NORMAL' | 'WARNING' | 'CRITICAL'
}

interface Props {
  branches: BranchPerformanceRow[]
  isLoading?: boolean
}

const HEALTH_CONFIG = {
  CRITICAL: {
    label: 'วิกฤต',
    pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: AlertTriangle,
    iconCls: 'text-red-500',
    rowHighlight: 'border-l-2 border-l-red-400',
  },
  WARNING: {
    label: 'ต้องติดตาม',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: AlertCircle,
    iconCls: 'text-amber-500',
    rowHighlight: 'border-l-2 border-l-amber-400',
  },
  NORMAL: {
    label: 'ปกติ',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: CheckCircle,
    iconCls: 'text-emerald-500',
    rowHighlight: '',
  },
} as const

export function BranchRankingTable({ branches, isLoading }: Props) {
  const setSelectedBranch = useBranchStore(s => s.setSelectedBranch)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!branches.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Building2 className="h-8 w-8 text-slate-200 dark:text-slate-700" />
        <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีข้อมูลสาขา</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
            <th className="text-left py-2 pl-2 font-medium w-6">#</th>
            <th className="text-left py-2 font-medium">สาขา</th>
            <th className="text-right py-2 font-medium">ยอดรวม</th>
            <th className="text-right py-2 font-medium hidden sm:table-cell">ขาย</th>
            <th className="text-right py-2 font-medium hidden sm:table-cell">ซ่อม</th>
            <th className="text-right py-2 font-medium">งานเปิด</th>
            <th className="text-center py-2 font-medium">สถานะ</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {branches.map((b, i) => {
            const cfg = HEALTH_CONFIG[b.health]
            const Icon = cfg.icon
            return (
              <tr
                key={b.branchId}
                onClick={() => setSelectedBranch(b.branchId)}
                className={cn(
                  'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors',
                  cfg.rowHighlight,
                )}
              >
                <td className="py-3 pl-2 text-xs font-bold text-slate-300 dark:text-slate-600">{i + 1}</td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Building2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                      {b.name}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatThaiMoney(b.totalRevenue)}
                </td>
                <td className="py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums hidden sm:table-cell">
                  {formatThaiMoney(b.salesRevenue)}
                </td>
                <td className="py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums hidden sm:table-cell">
                  {formatThaiMoney(b.repairRevenue)}
                </td>
                <td className="py-3 text-right">
                  <span className={cn('tabular-nums font-medium', b.overdueRepairs > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400')}>
                    {b.openRepairs}
                    {b.overdueRepairs > 0 && (
                      <span className="text-xs text-red-500 ml-1">({b.overdueRepairs}⚠)</span>
                    )}
                  </span>
                </td>
                <td className="py-3 text-center">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', cfg.pill)}>
                    <Icon className={cn('h-3 w-3 shrink-0', cfg.iconCls)} />
                    {cfg.label}
                  </span>
                </td>
                <td className="py-3 pr-1">
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
