'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Lock, Users } from 'lucide-react'
import api from '@/lib/api'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

export type OpenShiftRow = {
  id: string
  openedAt: string
  openBalance: number
  user: { id: string; name: string }
  branch: { id: string; name: string } | null
  members: string[]
  salesCount: number | null
  expectedCashBalance: number | null
}

/** Counted cash vs what the drawer should hold: a difference needs a reason. */
export function closeDifference(counted: number, expected: number | null) {
  return expected == null ? 0 : Math.round((counted - expected) * 100) / 100
}

/**
 * For owners (whole shop) and managers (their branch): every shift open right now, and counting
 * and closing one without joining it — the one forgotten at closing time, or left open by
 * someone who went home. The people in it are told who closed it.
 */
export function OpenShiftsAdmin({ excludeId, className = '' }: { excludeId?: string | null; className?: string }) {
  const role = useAuthStore((st) => st.user?.role)
  const boss = role === 'OWNER' || role === 'MANAGER' || role === 'SUPER_ADMIN'
  const { data: rows = [] } = useQuery<OpenShiftRow[]>({
    queryKey: ['shifts', 'open-now'],
    queryFn: async () => (await api.get('/shifts/open-now')).data,
    staleTime: 30_000,
    enabled: boss,
  })
  const others = rows.filter((x) => x.id !== excludeId)
  if (!boss || others.length === 0) return null
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      <div>
        <p className="font-bold text-slate-900 dark:text-white">กะที่เปิดอยู่ในร้าน ({others.length})</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ปิดแทนได้โดยไม่ต้องเข้าร่วม — นับเงินในลิ้นชักแล้วใส่ยอดที่นับได้ คนในกะจะได้รับแจ้ง</p>
      </div>
      {others.map((x) => <OpenShiftItem key={x.id} row={x} />)}
    </div>
  )
}

function OpenShiftItem({ row }: { row: OpenShiftRow }) {
  const queryClient = useQueryClient()
  const [closing, setClosing] = useState(false)
  const [counted, setCounted] = useState(row.expectedCashBalance != null ? String(row.expectedCashBalance) : '')
  const [note, setNote] = useState('')
  const diff = closeDifference(Number(counted) || 0, row.expectedCashBalance)
  const needNote = diff !== 0 && !note.trim()
  const hours = Math.floor((Date.now() - new Date(row.openedAt).getTime()) / 3600_000)
  const opened = new Date(row.openedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const close = useMutation({
    mutationFn: () => api.post(`/shifts/${row.id}/close`, { closeBalance: Number(counted) || 0, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(`ปิดกะของ ${row.user.name} แล้ว${diff !== 0 ? ` — ต่างจากที่ควรมี ${diff > 0 ? '+' : ''}${formatThaiMoney(diff)}` : ''}`)
      setClosing(false)
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'ปิดกะไม่สำเร็จ'))
    },
  })

  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
            กะของ {row.user.name}{row.branch ? ` · ${row.branch.name}` : ''}
          </p>
          <p className={`text-xs truncate ${hours >= 24 ? 'text-amber-700 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
            เปิด {opened} ({hours} ชม.)
            {row.salesCount != null ? ` · ${row.salesCount} บิล` : ''}
            {row.members.length > 0 ? ` · ร่วมกะ: ${row.members.join(', ')}` : ''}
          </p>
        </div>
        {!closing && (
          <button
            onClick={() => setClosing(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700"
          >
            <Lock className="h-4 w-4" /> ปิดกะนี้
          </button>
        )}
      </div>
      {closing && (
        <div className="mt-3 space-y-2">
          {row.expectedCashBalance != null && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              เงินสดที่ควรมีในลิ้นชัก <span className="font-bold tabular-nums">{formatThaiMoney(row.expectedCashBalance)}</span>
            </p>
          )}
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            เงินสดที่นับได้จริง (บาท)
            <input
              type="number" inputMode="decimal" min={0} value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-base tabular-nums dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          {diff !== 0 && (
            <p className={`text-xs font-semibold ${diff > 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {diff > 0 ? 'เกิน' : 'ขาด'} {formatThaiMoney(Math.abs(diff))} — ใส่เหตุผล
            </p>
          )}
          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={diff !== 0 ? 'เหตุผลที่เงินไม่ตรง (จำเป็น)' : 'หมายเหตุ (ถ้ามี) เช่น ลืมปิดกะ'}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="flex gap-2">
            <button onClick={() => setClosing(false)} className="h-11 flex-1 rounded-xl border border-slate-300 text-sm font-semibold dark:border-slate-600">ยกเลิก</button>
            <button
              onClick={() => close.mutate()}
              disabled={close.isPending || counted === '' || needNote}
              className="flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-50"
            >
              {close.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} นับเงินและปิดกะ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
