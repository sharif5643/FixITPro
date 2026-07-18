'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Wallet, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import api from '@/lib/api'

interface SessionListItem {
  id: string
  openedAt: string
  closedAt: string | null
  openingAmount: number
  countedAmount: number | null
  expectedAmount: number
  status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED'
  cashDrawer: { name: string }
  openedBy: { name: string }
  _count?: { participants: number; transactions: number }
}

const STATUS_CONFIG = {
  OPEN:             { label: 'เปิดอยู่',    bg: 'bg-green-100', text: 'text-green-700' },
  PENDING_APPROVAL: { label: 'รออนุมัติ',   bg: 'bg-amber-100', text: 'text-amber-700' },
  CLOSED:           { label: 'ปิดแล้ว',     bg: 'bg-slate-100', text: 'text-slate-500'  },
}

export default function CashDrawerHistoryPage() {
  const router = useRouter()

  const { data: sessions = [], isLoading } = useQuery<SessionListItem[]>({
    queryKey: ['cash-drawer-sessions'],
    queryFn:  async () => (await api.get('/cash-drawer/sessions')).data,
    staleTime: 60_000,
  })

  function fmt(n?: number | string | null) {
    const v = typeof n === 'string' ? parseFloat(n) : n
    if (v == null || isNaN(v)) return '—'
    return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pt-14 pb-5 shadow-sm flex items-center gap-3">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl active:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50">
          <Wallet className="h-5 w-5 text-slate-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">ประวัติรอบลิ้นชัก</h1>
      </div>

      <div className="p-5 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Wallet className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">ยังไม่มีประวัติรอบ</p>
          </div>
        ) : (
          sessions.map(s => {
            const cfg = STATUS_CONFIG[s.status]
            const diff = s.countedAmount != null ? s.countedAmount - s.expectedAmount : null
            return (
              <div key={s.id} className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{s.cashDrawer.name}</p>
                    <p className="text-xs text-slate-400">{fmtDate(s.openedAt)} • {fmtTime(s.openedAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <p className="text-[10px] text-slate-400">ตั้งต้น</p>
                    <p className="text-sm font-bold text-slate-700">฿{fmt(s.openingAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <p className="text-[10px] text-slate-400">คาดไว้</p>
                    <p className="text-sm font-bold text-slate-700">฿{fmt(s.expectedAmount)}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${diff == null ? 'bg-slate-50' : Math.abs(diff) < 0.01 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className="text-[10px] text-slate-400">นับได้</p>
                    <p className={`text-sm font-bold ${diff == null ? 'text-slate-400' : Math.abs(diff) < 0.01 ? 'text-green-700' : 'text-red-700'}`}>
                      {s.countedAmount != null ? `฿${fmt(s.countedAmount)}` : '—'}
                    </p>
                  </div>
                </div>

                {diff != null && Math.abs(diff) >= 0.01 && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    ส่วนต่าง: {diff > 0 ? '+' : ''}฿{fmt(diff)}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {s.openedBy.name}
                  </span>
                  {s.closedAt && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      ปิด {fmtTime(s.closedAt)}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
