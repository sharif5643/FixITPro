'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Package } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

interface TopSellingWidgetProps {
  branchId?: string
  days?: number
}

export function TopSellingWidget({ branchId, days = 30 }: TopSellingWidgetProps) {
  const endDate   = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-overview', 'top-selling', startDate, endDate, branchId],
    queryFn: async () => {
      const params: Record<string, string> = { startDate, endDate }
      if (branchId) params.branchId = branchId
      const res = await api.get('/dashboard/overview', { params })
      return res.data as { topProducts: { name: string; sku: string; qty: number; revenue: number }[] }
    },
  })

  const items = data?.topProducts ?? []

  return (
    <SectionCard
      title="สินค้าขายดี"
      icon={TrendingUp}
      description={`ใน ${days} วันที่ผ่านมา`}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 dark:bg-slate-700/60 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          preset="products"
          size="sm"
          icon={Package}
          title="ยังไม่มีข้อมูลการขาย"
          description="สินค้าขายดีจะแสดงเมื่อมีการขาย"
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((p, i) => (
            <div key={p.sku + i} className="flex items-center gap-3">
              <span className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{p.qty} ชิ้น</p>
              </div>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                {formatThaiMoney(p.revenue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
