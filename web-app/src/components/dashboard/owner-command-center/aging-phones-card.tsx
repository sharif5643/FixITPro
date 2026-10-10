'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Hourglass, ChevronRight } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { PCard, hoverCard, CardHeader } from './primitives'

type AgingPhones = {
  days: number
  count: number
  tiedUp: number | null
  items: { productId: string; name: string; stock: number; branchName: string; daysIdle: number; tiedUp: number | null }[]
}

/** Phones that have not sold for 60 days or more: money sitting on the shelf. Hidden when there are none. */
export function AgingPhonesCard({ branchId }: { branchId?: string | null }) {
  const hasModule = useAuthStore((s) => s.hasModule)
  const enabled = hasModule('inventory')
  const { data } = useQuery<AgingPhones>({
    queryKey: ['stock', 'aging-phones', branchId ?? 'all'],
    queryFn: () => api.get('/stock/aging-phones', { params: branchId ? { branchId } : undefined }).then((r) => r.data),
    enabled,
    staleTime: 10 * 60_000,
  })
  if (!enabled || !data || data.count === 0) return null

  return (
    <Link href="/products" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
      <PCard className={cn('p-4 cursor-pointer group', hoverCard)}>
        <CardHeader
          icon={Hourglass} iconBg="bg-violet-50 dark:bg-violet-900/20" iconColor="text-violet-600 dark:text-violet-400"
          title={`มือถือค้างสต็อกเกิน ${data.days} วัน`}
        >
          <ChevronRight className="ml-auto h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" aria-hidden />
        </CardHeader>
        <div className="flex items-end gap-3 mb-2">
          <p className="text-2xl font-black tabular-nums leading-tight text-violet-700 dark:text-violet-300">{data.count}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">
            เครื่อง{data.tiedUp != null && <> · ทุนจม <span className="font-semibold text-slate-600 dark:text-slate-300">{formatThaiMoney(data.tiedUp)}</span></>}
          </p>
        </div>
        <ul className="space-y-1">
          {data.items.slice(0, 3).map((i) => (
            <li key={`${i.productId}-${i.branchName}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{i.name}{i.stock > 1 ? ` ×${i.stock}` : ''}</span>
              <span className="shrink-0 font-semibold tabular-nums text-violet-600 dark:text-violet-400">{i.daysIdle} วัน</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">ไม่มีการขายนานแล้ว ลองลดราคาหรือจัดโปร</p>
      </PCard>
    </Link>
  )
}
