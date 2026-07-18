'use client'

import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Users, Clock, TrendingUp, TrendingDown,
  Wallet, LogOut, CheckCircle2,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { PermissionGate } from '@/components/staff/permission-gate'
import api from '@/lib/api'

interface Transaction {
  id: string
  type: string
  direction: 'IN' | 'OUT'
  amount: string
  reason?: string
  note?: string
  createdAt: string
  performedBy: { name: string }
}

interface Participant {
  id: string
  user: { id: string; name: string }
  joinedAt: string
  leftAt: string | null
}

interface SessionDetail {
  id: string
  openedAt: string
  openingAmount: number
  expectedAmount: number
  status: string
  cashDrawer: { name: string }
  openedBy: { name: string }
  participants: Participant[]
  transactions: Transaction[]
}

const TYPE_LABELS: Record<string, string> = {
  OPENING:     'เปิดรอบ',
  DEPOSIT:     'เติมเงิน',
  WITHDRAWAL:  'เบิกเงิน',
  BANK_DEPOSIT:'ฝากธนาคาร',
  REVERSAL:    'ยกเลิกรายการ',
}

export default function SessionPage() {
  const router   = useRouter()
  const qc       = useQueryClient()
  const user     = useAuthStore((s) => s.user)

  const { data: session, isLoading } = useQuery<SessionDetail | null>({
    queryKey: ['cash-drawer-session-current'],
    queryFn:  async () => (await api.get('/cash-drawer/session/current')).data,
    refetchInterval: 60_000,
  })

  const join = useMutation({
    mutationFn: () => api.post('/cash-drawer/session/join'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-drawer-session-current'] }),
  })

  const leave = useMutation({
    mutationFn: () => api.post('/cash-drawer/session/leave'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-drawer-session-current'] }),
  })

  function fmt(n?: number | string) {
    const v = typeof n === 'string' ? parseFloat(n) : n
    if (v == null || isNaN(v)) return '—'
    return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  const isParticipant = session?.participants.some(
    p => p.user.id === user?.id && !p.leftAt
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
        <Wallet className="h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-400">ยังไม่มีรอบที่เปิดอยู่</p>
        <button onClick={() => router.replace('/staff/cash-drawer')} className="text-sm text-amber-600 underline">
          กลับหน้าลิ้นชัก
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pt-14 pb-5 shadow-sm flex items-center gap-3">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl active:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">{session.cashDrawer.name}</h1>
          <p className="text-xs text-slate-400">เปิด {fmtTime(session.openedAt)} โดย {session.openedBy.name}</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />เปิดอยู่
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white shadow-sm p-4 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">เงินตั้งต้น</p>
            <p className="text-xl font-bold text-slate-700">฿{fmt(session.openingAmount)}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 shadow-sm p-4 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-amber-500">ยอดที่คาด</p>
            <p className="text-xl font-bold text-amber-700">฿{fmt(session.expectedAmount)}</p>
          </div>
        </div>

        {/* Join / Leave */}
        {isParticipant ? (
          <PermissionGate permission="cash_drawer.join_session">
            <button
              onClick={() => leave.mutate()}
              disabled={leave.isPending}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 active:bg-slate-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              ออกจากรอบนี้
              {leave.isPending && <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />}
            </button>
          </PermissionGate>
        ) : (
          <PermissionGate permission="cash_drawer.join_session">
            <button
              onClick={() => join.mutate()}
              disabled={join.isPending}
              className="flex w-full items-center gap-3 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-bold text-white active:bg-blue-600 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              เข้าร่วมรอบนี้
              {join.isPending && <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            </button>
          </PermissionGate>
        )}

        {/* Participants */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4" />
            ผู้ร่วมรอบ ({session.participants.filter(p => !p.leftAt).length} คน)
          </div>
          <div className="space-y-2">
            {session.participants.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${p.leftAt ? 'bg-slate-300' : 'bg-green-400'}`} />
                  <span className={p.leftAt ? 'text-slate-400' : 'text-slate-700 font-medium'}>
                    {p.user.name}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {fmtTime(p.joinedAt)}{p.leftAt ? ` → ${fmtTime(p.leftAt)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action shortcuts */}
        <div className="grid grid-cols-2 gap-3">
          <PermissionGate permission="cash_drawer.withdraw">
            <button
              onClick={() => router.push('/staff/cash-drawer/withdraw')}
              className="flex items-center gap-2 rounded-2xl bg-white shadow-sm px-4 py-3 text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              <TrendingDown className="h-4 w-4 text-red-400" />เบิกเงิน
            </button>
          </PermissionGate>
          <PermissionGate permission="cash_drawer.deposit">
            <button
              onClick={() => router.push('/staff/cash-drawer/deposit')}
              className="flex items-center gap-2 rounded-2xl bg-white shadow-sm px-4 py-3 text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              <TrendingUp className="h-4 w-4 text-green-400" />เติมเงิน
            </button>
          </PermissionGate>
        </div>

        {/* Transaction timeline */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-700">รายการในรอบนี้</p>
          {session.transactions.length === 0 ? (
            <p className="text-sm text-slate-400">ยังไม่มีรายการ</p>
          ) : (
            <div className="space-y-3">
              {session.transactions.map(tx => (
                <div key={tx.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    tx.direction === 'IN' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {tx.direction === 'IN'
                      ? <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      : <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {TYPE_LABELS[tx.type] ?? tx.type}
                      </span>
                      <span className={`text-sm font-bold ${tx.direction === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.direction === 'IN' ? '+' : '-'}฿{fmt(tx.amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {fmtTime(tx.createdAt)} • {tx.performedBy.name}
                      {tx.reason && ` • ${tx.reason}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close session CTA */}
        <PermissionGate permission="cash_drawer.close_session">
          <button
            onClick={() => router.push('/staff/cash-drawer/close')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white py-4 text-sm font-bold text-red-600 active:bg-red-50"
          >
            ปิดรอบลิ้นชัก
          </button>
        </PermissionGate>
      </div>
    </div>
  )
}
