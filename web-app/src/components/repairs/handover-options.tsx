'use client'

import { cn } from '@/lib/utils'

/** Warranty days offered when a repaired device goes back — same choices and default as the web. */
export const WARRANTY_CHOICES = [0, 7, 30, 90]
export const DEFAULT_WARRANTY_DAYS = '30'

export function WarrantyDaysPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-600">รับประกันงานซ่อม <span className="text-xs text-slate-400">— เลือก "ไม่มี" ถ้าไม่รับประกัน</span></p>
      <div className="flex gap-2">
        {WARRANTY_CHOICES.map((d) => (
          <button key={d} type="button" onClick={() => onChange(String(d))}
            className={cn('flex-1 h-11 rounded-xl border text-sm font-semibold',
              value === String(d) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600')}>
            {d === 0 ? 'ไม่มี' : `${d} วัน`}
          </button>
        ))}
        <input type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-16 h-11 rounded-xl border border-slate-200 bg-white text-center text-sm" aria-label="จำนวนวันรับประกัน" />
      </div>
    </div>
  )
}

/** "The customer takes the device now and pays the rest later" — the web's ค้างชำระ option. */
export function PayLaterToggle({ checked, onChange, owed }: { checked: boolean; onChange: (v: boolean) => void; owed: number }) {
  return (
    <label className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5',
      checked ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4" />
      <span className="text-sm">
        <span className="font-semibold text-slate-800">ค้างชำระ — ให้ลูกค้ารับเครื่องไปก่อน</span>
        <span className="block text-xs text-slate-500">
          {checked && owed > 0 ? `ยอดค้าง ${owed.toLocaleString('th-TH')} บาท ไปอยู่ที่หน้า "ลูกหนี้ / ค้างจ่าย"` : 'ใส่ยอดที่จ่ายวันนี้ (0 ได้)'}
        </span>
      </span>
    </label>
  )
}

/** Turns a warranty-days text box into the API value. */
export function warrantyDaysValue(v: string): number {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : 0
}
