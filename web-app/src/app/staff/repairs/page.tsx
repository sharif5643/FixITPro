'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Wrench, Loader2, ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'

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

const FILTERS = [
  { label: 'ทั้งหมด',     value: '' },
  { label: 'รอตรวจสอบ',  value: 'PENDING' },
  { label: 'กำลังซ่อม',  value: 'IN_PROGRESS' },
  { label: 'รออะไหล่',   value: 'WAIT_PARTS' },
  { label: 'รอรับเครื่อง', value: 'WAIT_PICKUP' },
  { label: 'เสร็จสิ้น',  value: 'COMPLETED' },
]

const STATUS_LABEL: Record<string, string> = {
  PENDING:     'รอตรวจสอบ',
  IN_PROGRESS: 'กำลังซ่อม',
  WAIT_PARTS:  'รออะไหล่',
  WAIT_PICKUP: 'รอรับเครื่อง',
  COMPLETED:   'เสร็จสิ้น',
  CANCELLED:   'ยกเลิก',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-600',
  IN_PROGRESS: 'bg-blue-50 text-blue-600',
  WAIT_PARTS:  'bg-purple-50 text-purple-600',
  WAIT_PICKUP: 'bg-green-50 text-green-600',
  COMPLETED:   'bg-emerald-50 text-emerald-600',
  CANCELLED:   'bg-red-50 text-red-500',
}

const PAGE_SIZE = 10

export default function RepairsPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('')
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = {
      limit:  String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    }
    if (filter) params.status = filter
    if (search) params.search = search
    const customerId = searchParams.get('customerId')
    if (customerId) params.customerId = customerId

    api.get('/repairs?' + new URLSearchParams(params)).then((r) => {
      const list = r.data?.data ?? r.data ?? []
      setRepairs(Array.isArray(list) ? list : [])
      setTotal(r.data?.total ?? list.length)
    }).catch(() => setRepairs([])).finally(() => setLoading(false))
  }, [filter, search, page, searchParams])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="flex-1 text-lg font-bold text-brand-black">งานซ่อม</h1>
          <button
            onClick={() => router.push('/staff/create')}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-yellow px-3 text-sm font-semibold text-brand-black"
          >
            <Plus className="h-4 w-4" />
            รับงาน
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="ค้นหาหมายเลข / ลูกค้า / อุปกรณ์..."
            className="h-11 w-full rounded-2xl bg-brand-light pl-10 pr-4 text-sm outline-none"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1) }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? 'bg-brand-yellow text-brand-black'
                  : 'bg-brand-light text-slate-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : repairs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Wrench className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">ไม่พบงานซ่อม</p>
          </div>
        ) : (
          repairs.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/staff/repairs/${r.id}`)}
              className="flex items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow/10">
                <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-slate-400">{r.ticketNumber}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] || 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-brand-black truncate mt-0.5">
                  {r.deviceBrand} {r.deviceModel}
                </p>
                <p className="text-xs text-slate-400 truncate">{r.customerName}</p>
                {r.issueTitle && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{r.issueTitle}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Clock className="h-3.5 w-3.5 text-slate-300" />
                <p className="text-[10px] text-slate-400 whitespace-nowrap">
                  {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: th })}
                </p>
              </div>
            </button>
          ))
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <p className="text-sm font-medium text-slate-600">
              หน้า {page} / {totalPages}
            </p>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
