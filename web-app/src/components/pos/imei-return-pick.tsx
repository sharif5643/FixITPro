'use client'

import { cn } from '@/lib/utils'

/** The IMEIs of a sale line that are still out with the customer (returned ones are not listed) */
export function imeisOf(item: { product?: { hasSerial?: boolean } | null; serialNumbers?: { serial: string }[] }): string[] {
  return item.product?.hasSerial ? (item.serialNumbers ?? []).map((s) => s.serial) : []
}

/**
 * Phones sold by IMEI coming back: tick which ones. The count to return is the number ticked, so
 * the IMEIs go back in stock with exactly those phones.
 */
export function ImeiReturnPick({ serials, picked, onChange, compact }: {
  serials: string[]
  picked: string[]
  onChange: (next: string[]) => void
  compact?: boolean
}) {
  if (serials.length === 0) return null
  const toggle = (s: string) => onChange(picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s])
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <p className={cn('mb-1 text-slate-500', compact ? 'text-[10px]' : 'text-xs')}>เครื่องที่ลูกค้าคืน (เลือก IMEI)</p>
      <div className="flex flex-wrap gap-1.5">
        {serials.map((s) => (
          <button key={s} type="button" onClick={() => toggle(s)}
            className={cn('rounded-lg border px-2 py-1 font-mono tabular-nums',
              compact ? 'text-[10px]' : 'text-xs',
              picked.includes(s) ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
            {picked.includes(s) ? '✓ ' : ''}{s}
          </button>
        ))}
      </div>
    </div>
  )
}
