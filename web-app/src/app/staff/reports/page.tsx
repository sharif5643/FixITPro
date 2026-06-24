'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, TrendingUp, Wrench, ShoppingCart, DollarSign, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface DashData {
  todayRevenue?:     number
  todayProfit?:      number
  todaySalesCount?:  number
  pendingRepairs?:   number
  weeklyRevenue?:    { date: string; revenue: number }[]
}

export default function ReportsPage() {
  const router  = useRouter()
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily')
  const [data,   setData]   = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/overview').then((r) => {
      setData(r.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const chartData = data?.weeklyRevenue ?? []
  const maxRev    = Math.max(...chartData.map((d) => d.revenue), 1)

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-lg font-bold text-brand-black">รายงาน</h1>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2">
          {(['daily', 'monthly', 'yearly'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                period === p ? 'bg-brand-yellow text-brand-black' : 'bg-brand-light text-slate-500'
              }`}
            >
              {p === 'daily' ? 'รายวัน' : p === 'monthly' ? 'รายเดือน' : 'รายปี'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-yellow" />
        </div>
      ) : (
        <div className="p-5 flex flex-col gap-4">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3">
            <ReportCard
              icon={<TrendingUp className="h-5 w-5 text-brand-yellow" />}
              label="รายได้วันนี้"
              value={`฿${(data?.todayRevenue ?? 0).toLocaleString()}`}
              bg="bg-brand-yellow/10"
            />
            <ReportCard
              icon={<DollarSign className="h-5 w-5 text-brand-success" />}
              label="กำไร"
              value={`฿${(data?.todayProfit ?? 0).toLocaleString()}`}
              bg="bg-brand-success/10"
            />
            <ReportCard
              icon={<ShoppingCart className="h-5 w-5 text-brand-info" />}
              label="ยอดขายสินค้า"
              value={`${data?.todaySalesCount ?? 0} รายการ`}
              bg="bg-brand-info/10"
            />
            <ReportCard
              icon={<Wrench className="h-5 w-5 text-purple-500" />}
              label="งานซ่อม"
              value={`${data?.pendingRepairs ?? 0} งาน`}
              bg="bg-purple-50"
            />
          </div>

          {/* Revenue chart */}
          {chartData.length > 0 && (
            <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
              <h2 className="mb-4 font-semibold text-brand-black">รายได้รายวัน</h2>
              <div className="flex items-end gap-1.5 h-36">
                {chartData.map((d, i) => {
                  const pct = (d.revenue / maxRev) * 100
                  const isToday = i === chartData.length - 1
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative w-full flex items-end" style={{ height: '120px' }}>
                        <div
                          className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-brand-yellow' : 'bg-brand-yellow/20'}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-400">{new Date(d.date).getDate()}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-400">7 วันย้อนหลัง</p>
                <p className="text-xs font-semibold text-brand-black">
                  รวม ฿{chartData.reduce((s, d) => s + d.revenue, 0).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReportCard({ icon, label, value, bg }: {
  icon:  React.ReactNode
  label: string
  value: string
  bg:    string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-lg font-extrabold text-brand-black leading-tight">{value}</p>
      </div>
    </div>
  )
}
