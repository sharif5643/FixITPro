'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { formatThaiMoney } from '@/lib/utils'

type Direction = 'IN' | 'OUT'

export type CashMovement = {
  id: string
  direction: Direction
  amount: number
  reason: string | null
  createdAt: string
  createdBy: { id: string; name: string }
}

const QUICK_REASONS: Record<Direction, string[]> = {
  OUT: ['เจ้าของเบิกเงิน', 'นำเงินไปฝากธนาคาร', 'แลกเงินทอน'],
  IN:  ['เติมเงินทอน', 'เจ้าของนำเงินมาใส่', 'รับเงินอื่นๆ'],
}

/**
 * Cash put into / taken out of the drawer by hand during the shift, with a reason.
 * Recorded so the cash expected at closing matches what is really in the drawer.
 * (Shop expenses go in "ค่าใช้จ่าย"; this is only for moving cash in and out.)
 */
export function ShiftCashMovements({ shiftId, onChanged }: { shiftId: string; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<Direction | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const { data: rows = [] } = useQuery<CashMovement[]>({
    queryKey: ['shifts', shiftId, 'cash-movements'],
    queryFn: async () => (await api.get(`/shifts/${shiftId}/cash-movements`)).data,
    staleTime: 10_000,
  })

  const reset = () => { setDirection(null); setAmount(''); setReason('') }

  const save = useMutation({
    mutationFn: () => api.post('/shifts/cash-movements', { direction, amount: Number(amount), reason: reason.trim() }),
    onSuccess: () => {
      toast.success(direction === 'OUT' ? 'บันทึกนำเงินออกแล้ว' : 'บันทึกรับเงินเข้าแล้ว')
      reset()
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      onChanged?.()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'บันทึกไม่สำเร็จ'))
    },
  })

  const amountNum = Number(amount)
  const canSave = !!direction && amountNum > 0 && reason.trim().length >= 2 && !save.isPending
  const totalIn = rows.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.amount, 0)
  const totalOut = rows.filter((r) => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">เงินเข้า / ออกลิ้นชัก</p>
          <p className="text-[11px] text-muted-foreground">หยิบเงินออกหรือใส่เงินเพิ่ม ให้บันทึกไว้ ยอดปิดกะจะได้ตรง</p>
        </div>
        {!direction && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDirection('IN')}
              className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 active:scale-95"
            >
              <ArrowDownCircle className="h-3.5 w-3.5" /> รับเงินเข้า
            </button>
            <button
              type="button"
              onClick={() => setDirection('OUT')}
              className="flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 active:scale-95"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" /> นำเงินออก
            </button>
          </div>
        )}
      </div>

      {direction && (
        <div className={`rounded-lg border p-3 space-y-2 ${direction === 'OUT' ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
          <p className={`text-xs font-bold ${direction === 'OUT' ? 'text-red-700' : 'text-emerald-700'}`}>
            {direction === 'OUT' ? 'นำเงินสดออกจากลิ้นชัก' : 'รับเงินสดเข้าลิ้นชัก'}
          </p>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="จำนวนเงิน (บาท)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-bold tabular-nums text-slate-900 outline-none focus:border-slate-500"
          />
          <input
            type="text"
            placeholder="เหตุผล (จำเป็น)"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS[direction].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 active:scale-95"
              >
                {r}
              </button>
            ))}
          </div>
          {direction === 'OUT' && (
            <p className="text-[11px] text-red-700">เจ้าของร้านจะได้รับแจ้งเตือนทุกครั้งที่นำเงินออก · ถ้าเป็นค่าใช้จ่ายร้าน ให้บันทึกที่เมนูค่าใช้จ่ายแทน</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => save.mutate()}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50 ${direction === 'OUT' ? 'bg-red-600' : 'bg-emerald-600'}`}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              บันทึก {amountNum > 0 ? formatThaiMoney(amountNum) : ''}
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                {format(new Date(r.createdAt), 'HH:mm', { locale: th })} · {r.reason} · {r.createdBy.name}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${r.direction === 'OUT' ? 'text-red-600' : 'text-emerald-700'}`}>
                {r.direction === 'OUT' ? '−' : '+'}{formatThaiMoney(r.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-700/60 pt-1 text-[11px] text-muted-foreground">
            <span>รวมรับเข้า {formatThaiMoney(totalIn)}</span>
            <span>รวมนำออก {formatThaiMoney(totalOut)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
