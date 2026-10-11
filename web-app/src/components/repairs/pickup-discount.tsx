'use client'

import { cn } from '@/lib/utils'

const QUICK = [50, 100, 200]

/**
 * A deal agreed when the customer picks the device up: taken off the price, printed on the receipt
 * as a discount, and recorded with who gave it.
 */
export function PickupDiscount({
  value, onChange, price, size = 'sm',
}: {
  value: string
  onChange: (v: string) => void
  price: number
  size?: 'sm' | 'lg'
}) {
  const n = Number(value) || 0
  const tooMuch = n > price
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-medium text-slate-700 dark:text-slate-300', size === 'lg' ? 'text-sm' : 'text-xs')}>ส่วนลด (ถ้ามี)</span>
        <div className="flex gap-1">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onChange(n === q ? '' : String(q))}
              className={cn(
                'rounded-full border px-2.5 font-semibold tabular-nums',
                size === 'lg' ? 'h-9 text-sm' : 'h-7 text-xs',
                n === q ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300',
              )}
            >
              -{q}
            </button>
          ))}
        </div>
      </div>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-md border bg-white px-3 text-right tabular-nums outline-none dark:bg-slate-900',
          size === 'lg' ? 'h-11 text-lg' : 'h-9 text-sm',
          tooMuch ? 'border-red-400' : 'border-slate-300 dark:border-slate-600',
        )}
      />
      {tooMuch && <p className="text-xs text-red-500">ส่วนลดมากกว่าราคาซ่อม</p>}
    </div>
  )
}
