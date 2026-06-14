'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, DollarSign, Loader2, Users, Package } from 'lucide-react'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import type { SAAnalytics, TenantPlan } from '@/types'
import { TENANT_PLAN_LABEL } from '@/types'
import { cn } from '@/lib/utils'

const PLAN_COLORS: Record<TenantPlan, string> = {
  TRIAL:      'bg-slate-500',
  BASIC:      'bg-blue-500',
  PRO:        'bg-violet-500',
  ENTERPRISE: 'bg-emerald-500',
}

function formatThb(n: number) {
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `฿${(n / 1_000).toFixed(1)}K`
  return `฿${n.toLocaleString()}`
}

function MiniBarChart({
  data,
  valueKey,
  labelKey,
  formatValue = String,
  color = 'bg-violet-500',
}: {
  data: Record<string, number>[]
  valueKey: string
  labelKey: string
  formatValue?: (v: number) => string
  color?: string
}) {
  const max = Math.max(...data.map((d) => d[valueKey] ?? 0), 1)
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => {
        const v = d[valueKey] ?? 0
        const pct = (v / max) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="w-full relative">
              <div
                style={{ height: `${Math.max(pct, 2)}%`, maxHeight: '72px', minHeight: v > 0 ? '4px' : '2px' }}
                className={cn('w-full rounded-t transition-all', color, v === 0 && 'opacity-20')}
              />
              {v > 0 && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-700 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  {formatValue(v)}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MonthLabel({ month }: { month: string }) {
  const parts = month.split('-')
  const m = parseInt(parts[1] ?? '1', 10)
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return <span className="text-[9px] text-slate-600">{months[m - 1]}</span>
}

export default function AnalyticsPage() {
  const { data, isLoading, isError } = useQuery<SAAnalytics>({
    queryKey: ['sa-analytics'],
    queryFn: () => api.get('/super-admin/analytics').then((r) => r.data),
    refetchInterval: 120_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">Platform-level metrics และ revenue analytics</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl">
          <SuperAdminEmptyState icon={BarChart3} title="โหลดข้อมูลไม่สำเร็จ" description="ลองรีเฟรชหน้า" />
        </div>
      </div>
    )
  }

  const totalActive = data.tenantStatusCounts['ACTIVE'] ?? 0
  const totalTenants = Object.values(data.tenantStatusCounts).reduce((s, n) => s + n, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-slate-400 text-sm mt-0.5">Platform-level metrics และ revenue analytics</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SuperAdminStatCard label="MRR"           value={formatThb(data.mrr)}           icon={DollarSign} accent="emerald" sub="Last 30 days" />
        <SuperAdminStatCard label="ARR (est.)"    value={formatThb(data.arr)}            icon={TrendingUp} accent="blue"    sub="MRR × 12" />
        <SuperAdminStatCard label="Total Revenue" value={formatThb(data.totalRevenue)}   icon={DollarSign} accent="violet"  sub="All time" />
        <SuperAdminStatCard label="Active Tenants" value={totalActive}                   icon={Users}      accent="slate"   sub={`/ ${totalTenants} ทั้งหมด`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Revenue by month */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-slate-800">
            <p className="text-white font-semibold text-sm">Revenue / Month (12 เดือนล่าสุด)</p>
            <p className="text-slate-500 text-xs mt-0.5">ยอดชำระที่เปิดใช้งานแล้ว</p>
          </div>
          <div className="p-5">
            {data.revenueByMonth.every((d) => d.revenue === 0) ? (
              <div className="h-24 flex items-center justify-center">
                <p className="text-slate-600 text-xs">ยังไม่มีข้อมูล revenue</p>
              </div>
            ) : (
              <>
                <MiniBarChart
                  data={data.revenueByMonth as any}
                  valueKey="revenue"
                  labelKey="month"
                  formatValue={formatThb}
                  color="bg-emerald-500"
                />
                <div className="flex gap-1 mt-2">
                  {data.revenueByMonth.map((d) => (
                    <div key={d.month} className="flex-1 flex justify-center">
                      <MonthLabel month={d.month} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* New tenants by month */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-slate-800">
            <p className="text-white font-semibold text-sm">New Tenants / Month (12 เดือนล่าสุด)</p>
            <p className="text-slate-500 text-xs mt-0.5">ร้านค้าใหม่ที่สมัครเข้ามา</p>
          </div>
          <div className="p-5">
            {data.tenantsByMonth.every((d) => d.count === 0) ? (
              <div className="h-24 flex items-center justify-center">
                <p className="text-slate-600 text-xs">ยังไม่มีข้อมูล</p>
              </div>
            ) : (
              <>
                <MiniBarChart
                  data={data.tenantsByMonth as any}
                  valueKey="count"
                  labelKey="month"
                  formatValue={(v) => `${v} ร้าน`}
                  color="bg-blue-500"
                />
                <div className="flex gap-1 mt-2">
                  {data.tenantsByMonth.map((d) => (
                    <div key={d.month} className="flex-1 flex justify-center">
                      <MonthLabel month={d.month} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Package distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-violet-400" />
              <p className="text-white font-semibold text-sm">Package Distribution (Active)</p>
            </div>
          </div>
          <div className="p-5">
            {data.planDistribution.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-8">ไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-3">
                {data.planDistribution.map(({ plan, count }) => {
                  const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0
                  return (
                    <div key={plan} className="flex items-center gap-3">
                      <span className="text-slate-300 text-sm w-24 shrink-0">{TENANT_PLAN_LABEL[plan as TenantPlan] ?? plan}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className={cn('h-full rounded-full', PLAN_COLORS[plan as TenantPlan] ?? 'bg-slate-500')}
                        />
                      </div>
                      <span className="text-slate-400 text-xs w-12 text-right">{count} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tenant status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <p className="text-white font-semibold text-sm">Tenant Status Breakdown</p>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-3">
              {(Object.entries(data.tenantStatusCounts) as [string, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                  const pct = totalTenants > 0 ? Math.round((count / totalTenants) * 100) : 0
                  const color =
                    status === 'ACTIVE'    ? 'bg-emerald-500' :
                    status === 'EXPIRED'   ? 'bg-red-500' :
                    status === 'SUSPENDED' ? 'bg-orange-500' : 'bg-slate-500'
                  const labels: Record<string, string> = {
                    ACTIVE: 'ใช้งานอยู่', EXPIRED: 'หมดอายุ',
                    SUSPENDED: 'ถูกระงับ', PENDING: 'รอเปิดใช้งาน',
                  }
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-slate-300 text-sm w-32 shrink-0">{labels[status] ?? status}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className={cn('h-full rounded-full', color)} />
                      </div>
                      <span className="text-slate-400 text-xs w-14 text-right">{count} ({pct}%)</span>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
