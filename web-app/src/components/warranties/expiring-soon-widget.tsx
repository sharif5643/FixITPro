'use client'

import { useQuery } from '@tanstack/react-query'
import { differenceInDays, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ShieldAlert } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import api from '@/lib/api'
import type { Warranty } from '@/types'

const EXPIRING_SOON_DAYS = 30

export function ExpiringSoonWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['warranties', 'expiring-soon'],
    queryFn: async () =>
      (await api.get('/warranties', { params: { status: 'ACTIVE', limit: 100 } })).data as {
        items: Warranty[]
      },
  })

  const now = Date.now()
  const expiring = (data?.items ?? [])
    .filter((w) => {
      const days = differenceInDays(new Date(w.endDate), now)
      return days >= 0 && days <= EXPIRING_SOON_DAYS
    })
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
    .slice(0, 8)

  return (
    <SectionCard
      title="ใกล้หมดอายุ"
      icon={ShieldAlert}
      description={`ภายใน ${EXPIRING_SOON_DAYS} วัน`}
    >
      {isLoading ? (
        <div className="space-y-2 p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-700/60 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : expiring.length === 0 ? (
        <EmptyState preset="warranty" size="sm" title="ไม่มีรายการใกล้หมดอายุ" description="ไม่มีการรับประกันที่จะหมดอายุในเร็วๆ นี้" />
      ) : (
        <div className="space-y-1.5 p-1">
          {expiring.map((w) => {
            const days = differenceInDays(new Date(w.endDate), now)
            return (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {w.customer?.name ?? w.warrantyNumber}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {w.repair?.ticketNumber ?? w.saleItem?.product.name ?? w.warrantyNumber}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={
                    days <= 7
                      ? 'text-xs font-bold text-red-600 dark:text-red-400'
                      : 'text-xs font-bold text-amber-600 dark:text-amber-400'
                  }>
                    เหลือ {days} วัน
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {format(new Date(w.endDate), 'dd MMM yyyy', { locale: th })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
