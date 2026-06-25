'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Wrench, Loader2, Plus, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Status config (matches backend exactly) ───────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RECEIVED:         'รับงานใหม่',
  DIAGNOSING:       'ตรวจวินิจฉัย',
  WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  QC_PENDING:       'รอ QC',
  COMPLETED:        'ซ่อมเสร็จ',
  READY_PICKUP:     'รอรับเครื่อง',
  DELIVERED:        'ส่งมอบแล้ว',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:         'bg-blue-50 text-blue-600',
  DIAGNOSING:       'bg-yellow-50 text-yellow-600',
  WAITING_APPROVAL: 'bg-amber-50 text-amber-600',
  APPROVED:         'bg-teal-50 text-teal-600',
  WAITING_PARTS:    'bg-orange-50 text-orange-600',
  IN_PROGRESS:      'bg-purple-50 text-purple-600',
  QC_PENDING:       'bg-indigo-50 text-indigo-600',
  COMPLETED:        'bg-green-50 text-green-600',
  READY_PICKUP:     'bg-emerald-50 text-emerald-600',
  DELIVERED:        'bg-slate-100 text-slate-500',
  CANCELLED:        'bg-red-50 text-red-500',
}

const FILTERS = [
  { label: 'ทั้งหมด',       value: '' },
  { label: 'รับงานใหม่',    value: 'RECEIVED' },
  { label: 'กำลังซ่อม',    value: 'IN_PROGRESS' },
  { label: 'รออะไหล่',     value: 'WAITING_PARTS' },
  { label: 'ซ่อมเสร็จ',    value: 'COMPLETED' },
  { label: 'รอรับเครื่อง', value: 'READY_PICKUP' },
  { label: 'ส่งมอบแล้ว',   value: 'DELIVERED' },
]

interface Repair {
  id:           string
  ticketNumber: string
  status:       string
  paymentStatus?: string
  customer?:    { name: string; phone?: string } | null
  deviceBrand:  string
  deviceModel:  string
  issue?:       string
  receivedAt:   string
}

// ── Page ──────────────────────────────────────────────────────────────────────

function RepairsPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')

  const customerId = searchParams.get('customerId')

  const { data: allRepairs = [], isLoading } = useQuery<Repair[]>({
    queryKey: ['staff-repairs', customerId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (customerId) params.set('customerId', customerId)
      const res = await api.get(`/repairs?${params}`)
      return res.data?.data ?? res.data ?? []
    },
    staleTime: 30_000,
  })

  const filtered = useMemo(() => {
    let list = allRepairs
    if (filter) list = list.filter((r) => r.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        r.ticketNumber.toLowerCase().includes(q) ||
        r.customer?.name?.toLowerCase().includes(q) ||
        r.customer?.phone?.toLowerCase().includes(q) ||
        r.deviceModel.toLowerCase().includes(q) ||
        r.deviceBrand.toLowerCase().includes(q),
      )
    }
    return list
  }, [allRepairs, filter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': allRepairs.length }
    allRepairs.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1 })
    return c
  }, [allRepairs])

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-24">

      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="flex-1 text-xl font-bold text-[#111]">งานซ่อม</h1>
          {isLoading
            ? <Loader2 className="h-4 w-4 animate-spin text-[#FFC107]" />
            : <span className="text-xs text-slate-400">{allRepairs.length} งาน</span>
          }
          <button
            onClick={() => router.push('/staff/create')}
            className="flex h-10 items-center gap-1.5 rounded-2xl bg-[#FFC107] px-4 text-sm font-bold text-[#111] shadow-[0_4px_12px_rgba(255,193,7,0.3)]"
          >
            <Plus className="h-4 w-4" />
            รับงาน
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาหมายเลข / ลูกค้า / อุปกรณ์..."
            className="h-11 w-full rounded-2xl bg-[#F8F9FB] pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#FFC107]/40"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FILTERS.map((f) => {
            const count = counts[f.value] ?? 0
            const active = filter === f.value
            if (f.value !== '' && count === 0) return null
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active ? 'bg-[#FFC107] text-[#111]' : 'bg-[#F8F9FB] text-slate-500'
                }`}
              >
                {f.label}
                <span className={`inline-flex items-center justify-center min-w-[16px] h-4 rounded-full px-1 text-[10px] font-bold ${
                  active ? 'bg-[#111]/10 text-[#111]' : 'bg-slate-200 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div className="p-5 flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 bg-slate-100 rounded-full" />
                  <div className="h-4 w-36 bg-slate-100 rounded-full" />
                  <div className="h-3 w-28 bg-slate-100 rounded-full" />
                </div>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Wrench className="h-8 w-8 text-slate-200" />
            </div>
            <p className="text-sm text-slate-400">
              {search || filter ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีงานซ่อม'}
            </p>
          </div>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/staff/repairs/${r.id}`)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform text-left w-full"
            >
              {/* Icon avatar */}
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFC107]/10">
                <Wrench className="h-5 w-5 text-[#FFC107]" strokeWidth={2.5} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 font-mono">{r.ticketNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.paymentStatus === 'PAID' && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600">
                      ชำระแล้ว
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-[#111] truncate mt-0.5">
                  {r.deviceBrand} {r.deviceModel}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {r.customer?.name ?? 'ไม่ระบุลูกค้า'}
                </p>
                {r.issue && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">{r.issue}</p>
                )}
              </div>

              {/* Time */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Clock className="h-3.5 w-3.5 text-slate-300" />
                <p className="text-[10px] text-slate-400 whitespace-nowrap">
                  {r.receivedAt
                    ? formatDistanceToNow(new Date(r.receivedAt), { addSuffix: true, locale: th })
                    : ''}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default function RepairsPage() {
  return <Suspense><RepairsPageInner /></Suspense>
}
