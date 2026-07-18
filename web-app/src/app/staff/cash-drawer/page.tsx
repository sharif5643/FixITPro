'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Wallet, Plus, Users, TrendingUp, TrendingDown, Clock,
  ChevronRight, History, AlertCircle, Lock,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { PermissionGate } from '@/components/staff/permission-gate'
import api from '@/lib/api'

interface SessionSummary {
  id: string
  openedAt: string
  openingAmount: number
  expectedAmount: number
  openedBy: { name: string }
  participants: { user: { name: string } }[]
  cashDrawer: { name: string }
}

export default function CashDrawerPage() {
  const router   = useRouter()
  const has      = useAuthStore((s) => s.hasPermission)
  const canView  = has('cash_drawer.view_balance')

  const { data: session, isLoading } = useQuery<SessionSummary | null>({
    queryKey: ['cash-drawer-session-current'],
    queryFn:  async () => {
      const res = await api.get('/cash-drawer/session/current')
      return res.data
    },
    enabled: canView,
    staleTime: 30_000,
  })

  const hasSession = !!session

  function fmt(n?: number) {
    if (n == null) return '—'
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pt-14 pb-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <Wallet className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">ลิ้นชักเงินสด</h1>
            <p className="text-xs text-slate-400">
              {hasSession ? `รอบเปิดอยู่ • ${session!.cashDrawer.name}` : 'ยังไม่มีรอบที่เปิดอยู่'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* Current session status card */}
        {canView && (
          <>
            {isLoading ? (
              <div className="rounded-2xl bg-white shadow-sm p-6 flex items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              </div>
            ) : hasSession ? (
              <button
                onClick={() => router.push('/staff/cash-drawer/session')}
                className="w-full rounded-2xl bg-white shadow-sm p-5 text-left space-y-3 active:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    เปิดอยู่
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">เงินตั้งต้น</p>
                    <p className="text-lg font-bold text-slate-700">฿{fmt(session!.openingAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-[10px] text-amber-600 uppercase tracking-wide">ยอดที่คาด</p>
                    <p className="text-lg font-bold text-amber-700">฿{fmt(session!.expectedAmount)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  เปิดโดย {session!.openedBy.name} • {new Date(session!.openedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {session!.participants.length} คนในรอบนี้: {session!.participants.map(p => p.user.name).join(', ')}
                </div>
              </button>
            ) : (
              <div className="rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 p-6 text-center space-y-2">
                <Wallet className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-500">ยังไม่ได้เปิดรอบลิ้นชัก</p>
                <p className="text-xs text-slate-400">เปิดรอบก่อนเริ่มรับเงิน</p>
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="space-y-3">

          {/* Open session */}
          <PermissionGate permission="cash_drawer.open_session">
            {!hasSession && (
              <button
                onClick={() => router.push('/staff/cash-drawer/open')}
                className="flex w-full items-center gap-4 rounded-2xl bg-amber-500 px-5 py-4 text-white active:bg-amber-600 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold">เปิดรอบลิ้นชัก</p>
                  <p className="text-xs text-amber-100">บันทึกเงินตั้งต้นและเริ่มรอบ</p>
                </div>
                <ChevronRight className="h-5 w-5 text-amber-200" />
              </button>
            )}
          </PermissionGate>

          {/* Join session */}
          <PermissionGate permission="cash_drawer.join_session">
            {hasSession && (
              <button
                onClick={() => router.push(`/staff/cash-drawer/session`)}
                className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm active:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-slate-800">ดูรอบปัจจุบัน</p>
                  <p className="text-xs text-slate-400">Timeline · เบิก/เติม · ปิดรอบ</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            )}
          </PermissionGate>

          {/* Withdraw */}
          <PermissionGate permission="cash_drawer.withdraw">
            {hasSession && (
              <button
                onClick={() => router.push('/staff/cash-drawer/withdraw')}
                className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm active:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-slate-800">เบิกเงิน</p>
                  <p className="text-xs text-slate-400">นำเงินออกจากลิ้นชัก</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            )}
          </PermissionGate>

          {/* Deposit */}
          <PermissionGate permission="cash_drawer.deposit">
            {hasSession && (
              <button
                onClick={() => router.push('/staff/cash-drawer/deposit')}
                className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm active:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-slate-800">เติมเงิน</p>
                  <p className="text-xs text-slate-400">เติมเงินเข้าลิ้นชัก (ไม่ใช่รายรับ)</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            )}
          </PermissionGate>

          {/* Close session */}
          <PermissionGate permission="cash_drawer.close_session">
            {hasSession && (
              <button
                onClick={() => router.push('/staff/cash-drawer/close')}
                className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm active:bg-slate-50 border border-red-100"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-red-600">ปิดรอบลิ้นชัก</p>
                  <p className="text-xs text-slate-400">นับเงินจริงและสิ้นสุดรอบ</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            )}
          </PermissionGate>

          {/* History */}
          <PermissionGate permission="cash_drawer.view_balance">
            <button
              onClick={() => router.push('/staff/cash-drawer/history')}
              className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm active:bg-slate-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
                <History className="h-5 w-5 text-slate-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-slate-800">ประวัติรอบ</p>
                <p className="text-xs text-slate-400">ดูรอบที่ผ่านมา</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          </PermissionGate>

          {/* No permission */}
          {!canView && (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-slate-500">
              <Lock className="h-5 w-5 shrink-0" />
              <p className="text-sm">คุณไม่มีสิทธิ์เข้าถึงระบบลิ้นชักเงินสด</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
