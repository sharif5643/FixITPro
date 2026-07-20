'use client'

import { Award, Users } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { PCard, Skel, CardHeader } from './primitives'
import type { DashboardOverview } from './types'

interface Props {
  techs:   DashboardOverview['topTechnicians'] | undefined
  loading: boolean
}

const RANK_BG = [
  'bg-amber-400 text-white',
  'bg-slate-300 dark:bg-slate-500 text-white',
  'bg-amber-700/70 text-white',
]

export function TechnicianPerformance({ techs, loading }: Props) {
  const list = techs ?? []
  const maxRevenue = list.length > 0 ? Math.max(...list.map(t => t.repairRevenue), 1) : 1

  return (
    <PCard className="p-5">
      <CardHeader
        icon={Award}
        iconBg="bg-amber-50 dark:bg-amber-900/30"
        iconColor="text-amber-500"
        title="ประสิทธิภาพช่าง"
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skel key={i} className="h-14 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden />
          <p className="text-xs text-slate-400 dark:text-slate-500">ยังไม่มีข้อมูลช่างวันนี้</p>
        </div>
      ) : (
        <ol className="space-y-3" aria-label="อันดับช่างซ่อมตามรายรับ">
          {list.slice(0, 5).map((t, i) => {
            const pct = Math.round((t.repairRevenue / maxRevenue) * 100)
            const avgPerRepair = t.repairCount > 0
              ? Math.round(t.repairRevenue / t.repairCount) : 0
            return (
              <li key={t.id} className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0',
                      i < 3 ? RANK_BG[i] : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                    )}
                    aria-label={`อันดับ ${i + 1}`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{t.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                      {t.repairCount} งาน · เฉลี่ย {formatThaiMoney(avgPerRepair)}/งาน
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums flex-shrink-0">
                    {formatThaiMoney(t.repairRevenue)}
                  </span>
                </div>
                <div
                  className="h-1.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden ml-7"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${t.name} — ${pct}% ของยอดสูงสุด`}
                >
                  <div
                    className={cn(
                      'h-full rounded-full motion-safe:transition-all motion-safe:duration-500',
                      i === 0 ? 'bg-amber-400' : 'bg-blue-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </PCard>
  )
}
