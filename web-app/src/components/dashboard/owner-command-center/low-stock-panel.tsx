'use client'

import Link from 'next/link'
import { Package, ChevronRight, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skel, PCard, hoverCard, CardHeader } from './primitives'
import type { DashboardOverview } from './types'

interface Props {
  stock: DashboardOverview['stock'] | undefined
  loading: boolean
}

export function LowStockPanel({ stock, loading }: Props) {
  const outOfStock = stock?.outOfStock ?? 0
  const lowStock   = stock?.lowStock ?? 0
  const total      = outOfStock + lowStock
  const urgent     = outOfStock > 0

  return (
    <Link href="/products" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
      <PCard urgent={urgent} className={cn('p-4 cursor-pointer group', hoverCard)}>
        <CardHeader
          icon={Package} iconBg="bg-amber-50 dark:bg-amber-900/20" iconColor="text-amber-600 dark:text-amber-400"
          title="สต็อกต่ำ"
        >
          <ChevronRight className="ml-auto h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" aria-hidden />
        </CardHeader>

        {loading ? <Skel className="h-12 w-full" /> : (
          <>
            <div className="flex items-end gap-3">
              <div>
                <p className={cn(
                  'text-2xl font-black tabular-nums leading-tight',
                  urgent      ? 'text-red-600 dark:text-red-400'
                  : total > 0 ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-white',
                )} aria-label={`${total} รายการสต็อกต่ำ`}>
                  {total}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">รายการ</p>
              </div>

              {total > 0 ? (
                <div className="mb-0.5 space-y-0.5">
                  {outOfStock > 0 && (
                    <p className="text-[10px] font-semibold text-red-500 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" aria-hidden />
                      {outOfStock} หมดสต็อก
                    </p>
                  )}
                  {lowStock > 0 && (
                    <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" aria-hidden />
                      {lowStock} ใกล้หมด
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-0.5">สต็อกปกติ ✓</p>
              )}
            </div>

            {total > 0 && (
              <div className="flex items-center gap-1 mt-3 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <ArrowRight className="h-3 w-3" aria-hidden />ดูรายการสต็อกต่ำ
              </div>
            )}
          </>
        )}
      </PCard>
    </Link>
  )
}
