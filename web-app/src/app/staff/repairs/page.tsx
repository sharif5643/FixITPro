'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'

interface Repair {
  id:           string
  ticketNumber: string
  customerName: string
  deviceModel:  string
  status:       string
  createdAt:    string
  technicianName?: string
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

const FILTERS = [
  { label: 'ทั้งหมด',          value: '' },
  { label: 'รอตรวจสอบ',        value: 'PENDING' },
  { label: 'กำลังดำเนินการ',    value: 'IN_PROGRESS' },
  { label: 'รอรับ',             value: 'WAIT_PICKUP' },
  { label: 'เสร็จสิ้น',         value: 'COMPLETED' },
]

export default function StaffRepairsPage() {
  const router = useRouter()
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 10

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params: Record<string, any> = { page, limit: LIMIT, sortBy: 'createdAt', order: 'desc' }
    if (search) params.search = search
    if (filter) params.status = filter

    api.get('/repairs', { params })
      .then((res) => {
        if (cancelled) return
        const rows = res.data?.data ?? res.data ?? []
        const tot  = res.data?.total ?? rows.length
        setRepairs(rows)
        setTotal(tot)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [search, filter, page])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <h1 className="text-xl font-bold text-brand-black mb-4">งานซ่อม</h1>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="ค้นหาชื่อ, รุ่น, เลขงาน..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-brand-yellow focus:bg-white"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1) }}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? 'bg-brand-black text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : repairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-12 w-12 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-400">ไม่พบงานซ่อม</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {repairs.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/staff/repairs/${r.id}`)}
                className="flex w-full items-center gap-3 rounded-xl bg-white p-4 shadow-card text-left active:bg-slate-50"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-yellow/20">
                  <Clock className="h-5 w-5 text-brand-yellow" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-black truncate">{r.customerName || '—'}</p>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{r.deviceModel || '—'}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-slate-300 font-mono">{r.ticketNumber || r.id.slice(0, 8)}</p>
                    <p className="text-[10px] text-slate-300">
                      {formatDistanceToNow(new Date(r.createdAt), { locale: th, addSuffix: true })}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 px-1">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-card disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-slate-500">{page} / {totalPages}</span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-card disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
