'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import type { AuditLogEntry } from '@/types'
import { cn } from '@/lib/utils'

const ACTION_STYLE: Record<string, string> = {
  TENANT_CREATED:     'text-emerald-400 bg-emerald-500/10',
  ACTIVATE:           'text-blue-400 bg-blue-500/10',
  RENEW:              'text-violet-400 bg-violet-500/10',
  PAYMENT_ACTIVATE:   'text-violet-400 bg-violet-500/10',
  PAYMENT_VERIFIED:   'text-blue-400 bg-blue-500/10',
  PAYMENT_REJECTED:   'text-red-400 bg-red-500/10',
  TENANT_SUSPENDED:   'text-orange-400 bg-orange-500/10',
  PASSWORD_RESET:     'text-amber-400 bg-amber-500/10',
}

const PAGE_SIZE = 25

export default function AuditLogsPage() {
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)

  const { data, isLoading, isError } = useQuery<{
    data: AuditLogEntry[]; total: number; page: number; limit: number
  }>({
    queryKey: ['sa-audit-logs', page],
    queryFn: () =>
      api.get('/super-admin/audit-logs', { params: { page, limit: PAGE_SIZE } }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const allEvents = data?.data ?? []
  const total     = data?.total ?? 0

  const filtered = search.trim()
    ? allEvents.filter((e) => {
        const q = search.toLowerCase()
        return (
          e.action.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q) ||
          (e.tenantName ?? '').toLowerCase().includes(q)
        )
      })
    : allEvents

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="text-slate-400 text-sm mt-0.5">ประวัติการดำเนินการทั้งหมดของ Super Admin</p>
      </div>

      <div className="flex gap-3">
        <div className="flex items-center gap-2 flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5">
          <Search className="h-4 w-4 text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา action, actor, target..."
            className="bg-transparent text-slate-300 placeholder:text-slate-600 text-sm outline-none flex-1"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-slate-400" />
            <p className="text-white font-semibold text-sm">Activity Log</p>
          </div>
          {data && (
            <span className="text-slate-500 text-xs">{total} รายการ</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <p className="text-red-400 text-sm">โหลดข้อมูลไม่สำเร็จ</p>
          </div>
        ) : filtered.length === 0 ? (
          <SuperAdminEmptyState
            icon={ScrollText}
            title="ไม่พบรายการ"
            description={search ? 'ลองค้นหาด้วยคำอื่น' : 'ยังไม่มีประวัติการดำเนินการ'}
          />
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filtered.map((e) => (
              <div key={e.id} className="px-5 py-4 flex items-start gap-4">
                <span className={cn(
                  'text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 mt-0.5',
                  ACTION_STYLE[e.action] ?? 'text-slate-400 bg-slate-800',
                )}>
                  {e.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium truncate">{e.target}</p>
                  {e.tenantName && e.tenantName !== e.target && (
                    <p className="text-slate-500 text-xs">{e.tenantName}</p>
                  )}
                  {e.note && <p className="text-slate-500 text-xs mt-0.5 italic">{e.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-slate-400 text-xs">{e.actor}</p>
                  <p className="text-slate-600 text-xs mt-0.5">
                    {format(new Date(e.time), 'd MMM yyyy HH:mm', { locale: th })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !search && (
          <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-slate-500 text-xs">
              หน้า {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
