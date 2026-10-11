'use client'

import { cn } from '@/lib/utils'

/** How a part taken from stock for a repair is billed. */
export type PartMode = 'use' | 'free' | 'charge'

export const PART_MODES: { value: PartMode; label: string; hint: string }[] = [
  { value: 'use',    label: 'ใช้ซ่อม',     hint: 'รวมในราคาซ่อม ลูกค้าไม่เห็น' },
  { value: 'free',   label: 'แถมลูกค้า',   hint: 'ใบเสร็จแสดง "แถมฟรี" พร้อมมูลค่า' },
  { value: 'charge', label: 'คิดเงินเพิ่ม', hint: 'บวกราคานี้ในบิลลูกค้า' },
]

/** Body for POST /repairs/:id/parts from the chosen mode. */
export function partModeBody(mode: PartMode, price?: number) {
  if (mode === 'free') return { freebie: true }
  if (mode === 'charge') return { chargeToCustomer: true, ...(price !== undefined ? { price } : {}) }
  return {}
}

/**
 * Every part taken for a repair comes out of stock and its cost counts against the job; this only
 * decides what the customer sees and pays.
 */
export function PartModePicker({ value, onChange, size = 'sm' }: { value: PartMode; onChange: (m: PartMode) => void; size?: 'sm' | 'lg' }) {
  const hint = PART_MODES.find((m) => m.value === value)?.hint
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {PART_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={cn(
              'rounded-md font-semibold transition-colors',
              size === 'lg' ? 'h-11 text-sm' : 'h-8 text-xs',
              value === m.value
                ? m.value === 'free' ? 'bg-emerald-600 text-white' : m.value === 'charge' ? 'bg-blue-600 text-white' : 'bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {hint && <p className={cn('text-muted-foreground', size === 'lg' ? 'text-xs' : 'text-[11px]')}>{hint}</p>}
    </div>
  )
}

/** The part's billing as a short Thai label for lists. */
export function partModeLabel(p: { chargeToCustomer?: boolean | null; isFreebie?: boolean | null }): { text: string; cls: string } {
  if (p.isFreebie) return { text: 'แถมลูกค้า', cls: 'text-emerald-600 font-medium' }
  if (p.chargeToCustomer) return { text: 'คิดลูกค้า', cls: 'text-blue-600 font-medium' }
  return { text: 'ใช้ซ่อม', cls: 'text-slate-400' }
}
