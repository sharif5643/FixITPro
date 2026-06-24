'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Wrench, Clock, CheckCircle2, Package, Loader2, ChevronRight,
} from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'

interface Repair {
  id:           string
  ticketNumber: string
  status:       string
  customerName: string
  deviceBrand:  string
  deviceModel:  string
  issueTitle?:  string
  createdAt:    string
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-600',
  IN_PROGRESS: 'bg-blue-50 text-blue-600',
  WAIT_PARTS:  'bg-purple-50 text-purple-600',
  WAIT_PICKUP: 'bg-green-50 text-green-600',
  COMPLETED:   'bg-emerald-50 text-emerald-600',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:     'งานใหม่',
  IN_PROGRESS: 'กำลังซ่อม',
  WAIT_PARTS:  'รออะไหล่',
  WAIT_PICKUP: 'รอส่งมอบ',
  COMPLETED:   'เสร็จสิ้น',
}

export default function TechnicianPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [stats,   setStats]   = useState({ pending: 0, inProgress: 0, waitParts: 0, completed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/repairs?limit=20&activeOnly=true').catch(() => ({ data: [] })),
      api.get('/repairs/stats').catch(() => ({ data: {} })),
    ]).then(([rRes, sRes]) => {
      const list = rRes.data?.data ?? rRes.data ?? []
      setRepairs(Array.isArray(list) ? list : [])
      setStats({
        pending:    sRes.data?.pending    ?? 0,
        inProgress: sRes.data?.inProgress ?? sRes.data?.active ?? 0,
        waitParts:  sRes.data?.waitParts  ?? 0,
        completed:  sRes.data?.completed  ?? 0,
      })
    }).finally(() => setLoading(false))
  }, [])

  const STAT_CARDS = [
    { label: 'งานใหม่',     value: stats.pending,    color: 'bg-amber-50',  text: 'text-amber-600' },
    { label: 'กำลังซ่อม',  value: stats.inProgress, color: 'bg-blue-50',   text: 'text-blue-600'  },
    { label: 'รออะไหล่',   value: stats.waitParts,  color: 'bg-purple-50', text: 'text-purple-600'},
    { label: 'เสร็จวันนี้', value: stats.completed,  color: 'bg-emerald-50',text: 'text-emerald-600'},
  ]

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-400">แดชบอร์ดช่าง</p>
            <p className="font-bold text-brand-black">{user?.name}</p>
          </div>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-3">
          {STAT_CARDS.map((s) => (
            <div key={s.label} className={`flex flex-col gap-1 rounded-[20px] p-4 ${s.color} shadow-sm`}>
              <p className={`text-3xl font-extrabold ${s.text}`}>{s.value}</p>
              <p className={`text-xs font-medium ${s.text}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Job list */}
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">งานที่รับผิดชอบ</p>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {repairs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/staff/repairs/${r.id}`)}
                  className="flex items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow/10">
                    <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-400">{r.ticketNumber}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-brand-black truncate">{r.deviceBrand} {r.deviceModel}</p>
                    <p className="text-xs text-slate-400">{r.customerName}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <p className="text-[10px] text-slate-400">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: th })}
                    </p>
                    <ChevronRight className="h-4 w-4 text-slate-300 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
