'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'
import { formatThaiMoney } from '@/lib/utils'

/**
 * The drawer is not empty when a shift opens: the last close left change in it. Opening at 0
 * made every close look "over" by that change (audit 2026-10: night shifts +300 to +1,800).
 */
export interface LastClose {
  shiftId?: string
  closedAt?: string
  closeBalance?: number
  floatLeft?: number | null
  openedBy?: string
}

export function useLastClose(enabled: boolean) {
  return useQuery<LastClose>({
    queryKey: ['shifts', 'last-close'],
    queryFn: async () => (await api.get('/shifts/last-close')).data ?? {},
    enabled,
    staleTime: 30_000,
  })
}

/** What the next shift should open with: the float left at the last close, if one was recorded. */
export function openingFloatOf(last?: LastClose | null): number | null {
  return last?.floatLeft != null ? Number(last.floatLeft) : null
}

/** Shown above "ยอดเปิดกะ": what the last close left, and a button to use the count when no float was recorded. */
export function LastCloseHint({ last, current, onUse }: { last?: LastClose | null; current: number; onUse: (n: number) => void }) {
  if (!last?.closedAt) return null
  const when = format(new Date(last.closedAt), 'd MMM HH:mm', { locale: th })
  const float = openingFloatOf(last)
  if (float != null) {
    return (
      <p className={`rounded-xl px-3 py-2 text-xs ${current === float ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        กะก่อน (ปิด {when}) เหลือเงินทอนไว้ในลิ้นชัก <b className="tabular-nums">{formatThaiMoney(float)}</b>
        {current !== float && (
          <button type="button" onClick={() => onUse(float)} className="ml-2 rounded-lg bg-amber-500 px-2 py-0.5 font-bold text-white">ใช้ยอดนี้</button>
        )}
      </p>
    )
  }
  const counted = Number(last.closeBalance ?? 0)
  if (counted <= 0) return null
  return (
    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
      กะก่อน (ปิด {when}) นับเงินได้ <b className="tabular-nums">{formatThaiMoney(counted)}</b> — ถ้ายังอยู่ในลิ้นชักทั้งหมด ให้ใส่เป็นยอดเปิดกะ
      {current !== counted && (
        <button type="button" onClick={() => onUse(counted)} className="ml-2 rounded-lg bg-slate-700 px-2 py-0.5 font-bold text-white">ใช้ยอดนี้</button>
      )}
    </p>
  )
}

/** At close: of the counted cash, what stays in the drawer for the next shift (the rest is taken out). */
export function FloatLeftField({ counted, value, onChange, className = '' }: {
  counted: number
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const left = Number(value) || 0
  const tooMuch = value !== '' && left > counted
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-semibold text-slate-600">เงินทอนที่เหลือไว้ในลิ้นชักให้กะหน้า (ไม่บังคับ)</label>
      <input
        type="number" inputMode="numeric" min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="เช่น 1000"
        className={`w-full h-12 px-4 border-2 rounded-xl text-lg font-bold bg-white focus:outline-none tabular-nums ${tooMuch ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'}`}
      />
      {value !== '' && (
        <p className={`text-xs ${tooMuch ? 'font-bold text-red-600' : 'text-slate-500'}`}>
          {tooMuch ? 'มากกว่าเงินที่นับได้' : `นำออกจากลิ้นชัก ${formatThaiMoney(Math.max(0, counted - left))} · กะหน้าจะเปิดด้วย ${formatThaiMoney(left)}`}
        </p>
      )}
    </div>
  )
}
