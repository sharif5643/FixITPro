'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronRight, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'

interface RepairStats {
  pending:    number
  inProgress: number
  waitPickup: number
  completed:  number
  total:      number
}

interface RecentRepair {
  id:          string
  ticketNumber: string
  customerName: string
  deviceModel:  string
  status:       string
  createdAt:    string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:      'รอตรวจสอบ',
  IN_PROGRESS:  'กำลังดำเนินการ',
  WAITING_PART: 'รอชิ้นส่วน',
  WAIT_PICKUP:  'รอรับ',
  COMPLETED:    'เสร็จสิ้น',
  CANCELLED:    'ยกเลิก',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:      'bg-amber-100 text-amber-700',
  IN_PROGRESS:  'bg-blue-100 text-blue-700',
  WAITING_PART: 'bg-purple-100 text-purple-700',
  WAIT_PICKUP:  'bg-green-100 text-green-700',
  COMPLETED:    'bg-slate-100 text-slate-600',
  CANCELLED:    'bg-red-100 text-red-600',
}

export default function StaffHomePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [stats, setStats] = useState<RepairStats | null>(null)
  const [recent, setRecent] = useState<RecentRepair[]>([])
  const [loading, setLoading] = useState(true)

  const firstName = user?.name?.split(' ')[0] || user?.name || 'คุณ'

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [statsRes, listRes] = await Promise.all([
          api.get('/repairs/stats'),
          api.get('/repairs', { params: { limit: 5, sortBy: 'createdAt', order: 'desc' } }),
        ])
        if (cancelled) return
        const s = statsRes.data
        setStats({
          pending:    s.pending    ?? s.PENDING    ?? 0,
          inProgress: s.inProgress ?? s.IN_PROGRESS ?? 0,
          waitPickup: s.waitPickup ?? s.WAIT_PICKUP ?? 0,
          completed:  s.completed  ?? s.COMPLETED   ?? 0,
          total:      s.total      ?? 0,
        })
        const rows = listRes.data?.data ?? listRes.data ?? []
        setRecent(rows.slice(0, 5))
      } catch {
        // silently fall through — show zeros
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 bg-white">
        <div>
          <p className="text-xs text-slate-400">สวัสดี 👋</p>
          <h2 className="text-lg font-bold text-brand-black">{firstName}</h2>
        </div>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <Bell className="h-5 w-5 text-slate-600" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
      </div>

      <div className="px-5 pb-6 space-y-5 pt-4">
        {/* Main yellow stats card */}
        <div className="rounded-2xl bg-brand-yellow p-5 shadow-[0_4px_20px_rgba(245,194,0,0.3)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-black/60">งานของฉันทั้งหมด</p>
              <p className="text-4xl font-extrabold text-brand-black mt-1">
                {loading ? '...' : (stats?.total ?? 0)}
              </p>
              <p className="text-xs text-black/50 mt-0.5">งาน</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/10">
              <AlertCircle className="h-6 w-6 text-brand-black" />
            </div>
          </div>
          <button
            onClick={() => router.push('/staff/repairs')}
            className="mt-4 flex items-center gap-1 text-xs font-semibold text-black/70"
          >
            ดูทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 2×2 stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'รอตรวจสอบ',       value: stats?.pending,    color: 'text-amber-600',  bg: 'bg-amber-50'  },
            { label: 'กำลังดำเนินการ',    value: stats?.inProgress, color: 'text-blue-600',   bg: 'bg-blue-50'   },
            { label: 'รอรับ',            value: stats?.waitPickup, color: 'text-green-600',  bg: 'bg-green-50'  },
            { label: 'เสร็จสิ้น',         value: stats?.completed,  color: 'text-slate-600',  bg: 'bg-slate-100' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl p-4 ${bg}`}>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (value ?? 0)}
              </p>
            </div>
          ))}
        </div>

        {/* Recent repairs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-black">งานล่าสุด</h3>
            <button
              onClick={() => router.push('/staff/repairs')}
              className="text-xs text-slate-400 font-medium flex items-center gap-0.5"
            >
              ดูทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
            </div>
          ) : recent.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-card">
              <CheckCircle2 className="h-10 w-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">ยังไม่มีงานซ่อม</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/staff/repairs/${r.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white p-4 shadow-card text-left active:bg-slate-50"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-yellow/20">
                    <Clock className="h-5 w-5 text-brand-yellow" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-black truncate">
                      {r.customerName || '—'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.deviceModel || r.ticketNumber || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {formatDistanceToNow(new Date(r.createdAt), { locale: th, addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick action */}
        <button
          onClick={() => router.push('/staff/create')}
          className="w-full flex items-center justify-center gap-2 h-13 rounded-2xl bg-brand-black text-white font-semibold text-sm py-4 shadow-md active:scale-[0.98] transition-transform"
        >
          + แจ้งซ่อมใหม่
        </button>
      </div>
    </div>
  )
}
