'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, LogOut, Users } from 'lucide-react'
import api from '@/lib/api'

export type JoinableShift = {
  id: string
  openedAt: string
  user: { id: string; name: string }
  branch: { id: string; name: string } | null
  members: string[]
}

/** Open shifts of my branch I can join instead of opening my own (one drawer, several people). */
export function JoinShifts({ onJoined }: { onJoined: () => void }) {
  const { data: shifts = [] } = useQuery<JoinableShift[]>({
    queryKey: ['shifts', 'joinable'],
    queryFn:  async () => (await api.get('/shifts/joinable')).data,
    staleTime: 10_000,
  })
  const join = useMutation({
    mutationFn: (id: string) => api.post(`/shifts/${id}/join`),
    onSuccess: () => { toast.success('เข้าร่วมกะแล้ว — ขายและรับเงินได้เลย'); onJoined() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'เข้าร่วมกะไม่สำเร็จ'),
  })
  if (shifts.length === 0) return null
  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
      <div>
        <p className="font-bold text-blue-900">ใช้ลิ้นชักเดียวกับเพื่อน?</p>
        <p className="text-xs text-blue-700 mt-0.5">มีกะเปิดอยู่แล้ว กด “เข้าร่วมกะ” ไม่ต้องใส่เงินเปิดกะ — ปิดกะและนับเงินครั้งเดียวตอนจบ</p>
      </div>
      {shifts.map((x) => (
        <div key={x.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 truncate">กะของ {x.user.name}</p>
            <p className="text-xs text-slate-500 truncate">
              เปิด {format(new Date(x.openedAt), 'HH:mm', { locale: th })} น.
              {x.branch ? ` · ${x.branch.name}` : ''}
              {x.members.length > 0 ? ` · ร่วมกะ: ${x.members.join(', ')}` : ''}
            </p>
          </div>
          <button
            onClick={() => join.mutate(x.id)}
            disabled={join.isPending}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {join.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} เข้าร่วมกะ
          </button>
        </div>
      ))}
    </div>
  )
}

/** Leave a shift you joined; your sales so far stay in it. */
export function LeaveShiftButton({ onLeft, className = '' }: { onLeft: () => void; className?: string }) {
  const leave = useMutation({
    mutationFn: () => api.post('/shifts/leave'),
    onSuccess: () => { toast.success('ออกจากกะแล้ว — ยอดขายที่ทำไปยังอยู่ในกะนั้น'); onLeft() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'ออกจากกะไม่สำเร็จ'),
  })
  return (
    <button
      onClick={() => leave.mutate()}
      disabled={leave.isPending}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-green-300 bg-white px-3 text-sm font-semibold text-green-800 disabled:opacity-60 ${className}`}
    >
      {leave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} ออกจากกะ
    </button>
  )
}
