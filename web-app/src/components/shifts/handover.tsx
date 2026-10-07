'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ArrowRightLeft, CheckCircle2, Loader2, Pencil } from 'lucide-react'
import api from '@/lib/api'
import { formatThaiMoney } from '@/lib/utils'

/** A shift someone handed to me when they left early (their counted cash and carrier wallets). */
export type PendingHandover = {
  shiftId: string
  fromName: string | null
  at: string
  cash: number
  wallets: { carrier: string; balance: number }[]
}

export function usePendingHandover(enabled = true) {
  return useQuery<PendingHandover | null>({
    queryKey: ['shifts', 'handover'],
    // An empty body means nothing is waiting
    queryFn:  async () => {
      const data = (await api.get('/shifts/handover')).data
      return data?.shiftId ? data : null
    },
    staleTime: 10_000,
    enabled,
  })
}

/** Opening-form fields for each carrier's counted wallet. */
export const WALLET_FIELD: Record<string, 'aisOpeningBalance' | 'trueOpeningBalance' | 'dtacOpeningBalance' | 'ntOpeningBalance'> = {
  AIS: 'aisOpeningBalance', TRUE: 'trueOpeningBalance', DTAC: 'dtacOpeningBalance', NT: 'ntOpeningBalance',
}

/**
 * Taking over from the person who left early: check the amounts they counted, then confirm
 * (opens my shift with them) or count again (fills the opening form to change them).
 */
export function HandoverCard({
  pending, busy, onConfirm, onEdit,
}: {
  pending: PendingHandover
  busy?: boolean
  onConfirm: () => void
  onEdit: () => void
}) {
  const wallets = pending.wallets.filter((w) => Number(w.balance) !== 0)
  return (
    <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ArrowRightLeft className="h-5 w-5 shrink-0 text-violet-700 mt-0.5" />
        <div>
          <p className="font-bold text-violet-900">รับกะต่อจาก {pending.fromName ?? '-'}</p>
          <p className="text-xs text-violet-700 mt-0.5">
            ส่งต่อเมื่อ {format(new Date(pending.at), 'HH:mm', { locale: th })} น. — นับเงินในลิ้นชักและดูยอดในแอปค่ายให้ตรงก่อนกดยืนยัน
          </p>
        </div>
      </div>
      <div className="rounded-xl bg-white divide-y divide-slate-100 text-sm">
        <div className="flex justify-between px-3 py-2">
          <span className="text-slate-600">เงินสดในลิ้นชัก</span>
          <span className="font-bold tabular-nums text-slate-900">{formatThaiMoney(pending.cash)}</span>
        </div>
        {wallets.map((w) => (
          <div key={w.carrier} className="flex justify-between px-3 py-2">
            <span className="text-slate-600">กระเป๋า {w.carrier}</span>
            <span className="font-semibold tabular-nums text-slate-900">{formatThaiMoney(Number(w.balance))}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="flex h-12 items-center justify-center gap-1.5 rounded-xl border-2 border-violet-300 bg-white text-sm font-bold text-violet-800 disabled:opacity-60"
        >
          <Pencil className="h-4 w-4" /> ยอดไม่ตรง
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} ยอดตรง ยืนยันรับกะ
        </button>
      </div>
    </div>
  )
}

/** Closing: leave early and hand the drawer to someone still working in the shift. */
export function HandoverPicker({
  people, value, onChange,
}: {
  people: { userId: string; name: string }[]
  value: string
  onChange: (userId: string) => void
}) {
  if (people.length === 0) return null
  const chip = (active: boolean) =>
    `h-10 rounded-xl border-2 px-3 text-sm font-semibold ${active ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-600'}`
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-700">กลับก่อน? ส่งต่อกะให้คนที่ยังอยู่</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange('')} className={chip(value === '')}>ไม่ส่งต่อ</button>
        {people.map((p) => (
          <button key={p.userId} type="button" onClick={() => onChange(p.userId)} className={chip(value === p.userId)}>
            ส่งต่อให้ {p.name}
          </button>
        ))}
      </div>
      {value && (
        <p className="text-xs text-violet-700">
          คนที่รับต่อจะเห็นเงินสดและยอดกระเป๋าค่ายที่คุณนับ แล้วกดยืนยันรับกะ — ถ้ายอดไม่ตรง เจ้าของร้านจะได้รับแจ้ง
        </p>
      )}
    </div>
  )
}
