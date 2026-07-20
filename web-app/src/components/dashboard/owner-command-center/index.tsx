'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import api from '@/lib/api'

import { OwnerCommandHeader }  from './owner-command-header'
import { OwnerKpiGrid }        from './owner-kpi-grid'
import { RevenueChart }        from './revenue-chart'
import { QuickActions }        from './quick-actions'
import { OperationsSummary }   from './operations-summary'
import { AlertsTimeline }      from './alerts-timeline'
import { LowStockPanel }       from './low-stock-panel'
import { AIInsightCard }       from './ai-insight-card'
import { BranchHealthRow }     from './branch-health-row'
import type { DashboardOverview, OwnerSummaryData } from './types'

export function OwnerCommandCenter() {
  const user                      = useAuthStore(s => s.user)
  const { branchId: contextBranchId } = useBranchContext()

  const ovParams = contextBranchId ? { branchId: contextBranchId } : {}

  const {
    data: overview,
    isLoading: ovLoading,
    isError: ovError,
    refetch: refetchOv,
  } = useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview', ovParams],
    queryFn: () => api.get('/dashboard/overview', {
      params: contextBranchId ? { branchId: contextBranchId } : undefined,
    }).then(r => r.data),
    staleTime:       3 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const {
    data: summary,
    isLoading: sumLoading,
    refetch: refetchSum,
  } = useQuery<OwnerSummaryData>({
    queryKey: ['dashboard-owner-summary'],
    queryFn: () => api.get('/dashboard/owner-summary').then(r => r.data),
    staleTime:       3 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const loading     = ovLoading || sumLoading
  const multiSite   = (overview?.branchPerformance?.length ?? 0) > 1

  function handleRefresh() {
    refetchOv()
    refetchSum()
  }

  return (
    <div className="space-y-4 pb-10 max-w-7xl">

      {/* Header: greeting, date, branch selector, shift badge, refresh */}
      <OwnerCommandHeader
        userName={user?.name}
        currentShift={overview?.currentShift}
        loading={loading}
        onRefresh={handleRefresh}
      />

      {/* KPI Row: Revenue, Profit, Open Repairs, Ready for Pickup */}
      <OwnerKpiGrid
        today={summary?.today}
        ops={overview?.repairOps}
        weeklyRevenue={overview?.weeklyRevenue}
        health={summary?.health}
        loading={loading}
      />

      {/* Revenue chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChart
            data={overview?.weeklyRevenue}
            loading={ovLoading}
            isError={ovError}
            onRetry={refetchOv}
          />
        </div>
        <QuickActions />
      </div>

      {/* Operations: Repair Queue, Best Tech, Debt, Expenses */}
      <OperationsSummary
        ops={overview?.repairOps}
        techs={overview?.topTechnicians}
        today={summary?.today}
        highExpenses={summary?.health.highExpenses}
        loading={loading}
      />

      {/* Bottom row: Alerts Timeline | Low Stock + Smart Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AlertsTimeline
            notifications={overview?.notifications}
            activities={overview?.recentActivities}
            loading={loading}
          />
        </div>
        <div className="space-y-4">
          <LowStockPanel stock={overview?.stock} loading={loading} />
          <AIInsightCard overview={overview} summary={summary} loading={loading} />
        </div>
      </div>

      {/* Branch health — multi-branch owners only */}
      {multiSite && (
        <BranchHealthRow branches={overview?.branchPerformance} loading={loading} />
      )}

    </div>
  )
}
