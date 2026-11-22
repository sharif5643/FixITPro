'use client'

import { useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { PartsPendingDialog } from '@/components/quick-cash/parts-pending-dialog'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage, cn } from '@/lib/utils'

/**
 * "ยังไม่ได้เบิกอะไหล่ — ใส่ต้นทุนไว้ก่อน": closing a job in a hurry before its parts are taken
 * from stock. The cost typed here counts in the job's profit at once; the job then waits in
 * "รอเบิกอะไหล่", where the real parts replace it (or it is kept for a part bought outside).
 */
export interface PartsLaterValue { on: boolean; cost: string; note: string }
export const emptyPartsLater: PartsLaterValue = { on: false, cost: '', note: '' }

export function partsLaterError(v: PartsLaterValue): string | null {
  if (!v.on) return null
  const n = Number(v.cost)
  return n > 0 ? null : 'กรุณาใส่ต้นทุนอะไหล่ที่ยังไม่ได้เบิก'
}

/** Saves the typed cost after the payment went through; never blocks the handover */
export async function savePartsLater(repairId: string, v: PartsLaterValue): Promise<boolean> {
  if (!v.on || !(Number(v.cost) > 0)) return false
  try {
    await api.post(`/repairs/${repairId}/parts-later`, { estimate: Number(v.cost), note: v.note.trim() || undefined })
    toast.success('บันทึกต้นทุนอะไหล่แล้ว — งานอยู่ใน "รอเบิกอะไหล่"')
    return true
  } catch (e) {
    toast.error(`รับเงินแล้ว แต่บันทึกต้นทุนอะไหล่ไม่สำเร็จ: ${apiErrorMessage(e)}`)
    return false
  }
}

export function PartsLaterField({
  value, onChange, dark = false,
}: { value: PartsLaterValue; onChange: (v: PartsLaterValue) => void; dark?: boolean }) {
  const box = dark
    ? 'border-white/15 bg-white/5 text-slate-100'
    : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100'
  const input = dark
    ? 'border-white/20 bg-slate-900 text-white placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white'
  return (
    <div className={cn('rounded-xl border p-3 space-y-2.5', box)}>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={value.on}
          onChange={(e) => onChange({ ...value, on: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <PackageOpen className="h-4 w-4 shrink-0" aria-hidden />
            ยังไม่ได้เบิกอะไหล่ — ใส่ต้นทุนไว้ก่อน
          </span>
          <span className={cn('block text-xs mt-0.5', dark ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400')}>
            ลูกค้าไม่เห็นยอดนี้ · กำไรนับต้นทุนนี้ทันที · ค่อยเบิกของจริงทีหลังจาก “รอเบิกอะไหล่”
          </span>
        </span>
      </label>
      {value.on && (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
          <label className="block">
            <span className="sr-only">ต้นทุนอะไหล่ (บาท)</span>
            <input
              type="number" inputMode="decimal" min={0} step="any" autoFocus
              value={value.cost}
              onChange={(e) => onChange({ ...value, cost: e.target.value })}
              placeholder="ต้นทุน ฿"
              className={cn('h-11 w-full rounded-lg border px-3 text-base tabular-nums outline-none focus:ring-2 focus:ring-blue-500', input)}
            />
          </label>
          <label className="block">
            <span className="sr-only">อะไหล่อะไร (ไม่บังคับ)</span>
            <input
              type="text" maxLength={200}
              value={value.note}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              placeholder="อะไหล่อะไร (ไม่บังคับ)"
              className={cn('h-11 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500', input)}
            />
          </label>
        </div>
      )}
    </div>
  )
}

/** On a job closed before its parts were taken: says so and opens the list to take them */
export function PartsPendingBanner({ repair, branchId }: { repair: { partsPending?: boolean | null; branchId?: string | null }; branchId?: string }) {
  const [open, setOpen] = useState(false)
  if (!repair.partsPending) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
      >
        <span className="font-bold">📦 งานนี้ยังไม่ได้เบิกอะไหล่</span>
        <span className="block text-xs opacity-80">แตะเพื่อเบิกของจริง (ต้นทุนจริงจะแทนยอดที่กรอกไว้)</span>
      </button>
      <PartsPendingDialog open={open} onOpenChange={setOpen} branchId={branchId ?? repair.branchId ?? undefined} />
    </>
  )
}
