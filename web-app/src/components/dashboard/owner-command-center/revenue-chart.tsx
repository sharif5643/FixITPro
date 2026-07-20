'use client'

import { AlertTriangle, BarChart2, RefreshCw } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { PCard, CardHeader, ChartTooltip, Skel } from './primitives'
import type { DashboardOverview } from './types'

interface Props {
  data: DashboardOverview['weeklyRevenue'] | undefined
  loading: boolean
  isError: boolean
  onRetry: () => void
}

export function RevenueChart({ data, loading, isError, onRetry }: Props) {
  const chartData = (data ?? []).map(d => {
    const [, m, day] = d.date.split('-')
    return { date: `${day}/${m}`, ยอดขาย: d.sales, งานซ่อม: d.repairs }
  })

  const isEmpty = !loading && !isError && chartData.length === 0

  return (
    <PCard className="p-5">
      <CardHeader
        icon={BarChart2}
        iconBg="bg-blue-50 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        title="รายรับ 7 วันย้อนหลัง"
      >
        <div className="ml-auto flex items-center gap-4 text-[10px] text-slate-400" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />ยอดขาย
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />งานซ่อม
          </span>
        </div>
      </CardHeader>

      {loading && <Skel className="h-40 w-full" />}

      {isError && (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
          <AlertTriangle className="h-7 w-7 text-amber-400" aria-hidden />
          <p className="text-sm">โหลดข้อมูลไม่สำเร็จ</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />ลองใหม่
          </button>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
          <BarChart2 className="h-8 w-8 opacity-25" aria-hidden />
          <p className="text-sm">ยังไม่มีข้อมูลรายรับ</p>
        </div>
      )}

      {!loading && !isError && !isEmpty && (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 260 }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barGap={2} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: 'rgba(148,163,184,0.06)' }}
                />
                <Bar dataKey="ยอดขาย" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="งานซ่อม" stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </PCard>
  )
}
