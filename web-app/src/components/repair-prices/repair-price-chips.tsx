'use client'

import { useQuery } from '@tanstack/react-query'
import { Tag } from 'lucide-react'
import api from '@/lib/api'
import { formatThaiMoney, cn } from '@/lib/utils'
import type { RepairPrice } from '@/lib/repair-prices'

/**
 * The shop's prices for this device while a job is taken in: one tap puts the job and its price
 * on the form. Nothing shows until a brand is typed, or when the shop has no price for it.
 */
export function RepairPriceChips({
  brand, model, picked = [], onPick, className,
}: {
  brand: string
  model: string
  picked?: string[]
  onPick: (p: RepairPrice) => void
  className?: string
}) {
  const b = brand.trim()
  const m = model.trim()
  const { data = [] } = useQuery<RepairPrice[]>({
    queryKey: ['repair-prices', 'lookup', b.toLowerCase(), m.toLowerCase()],
    queryFn: () => api.get('/repair-prices/lookup', { params: { brand: b, model: m } }).then((r) => r.data),
    enabled: b.length > 0,
    staleTime: 60_000,
  })
  if (!data.length) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        <Tag className="h-3 w-3" /> ราคาของร้าน — แตะเพื่อใส่งานและราคา
      </p>
      <div className="flex flex-wrap gap-1.5">
        {data.map((p) => {
          const on = picked.includes(p.service)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95',
                on
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
              )}
            >
              {p.service} <span className="font-bold tabular-nums">{formatThaiMoney(p.price)}</span>
              {p.warrantyDays ? <span className="opacity-75"> · ประกัน {p.warrantyDays} วัน</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
