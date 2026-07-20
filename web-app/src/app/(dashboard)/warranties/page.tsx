'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format, isPast } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  BadgeCheck, Loader2, ShieldOff, ShieldAlert,
  ShieldCheck, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { ExpiringSoonWidget } from '@/components/warranties/expiring-soon-widget'
import api from '@/lib/api'
import type { Warranty, WarrantyStatus } from '@/types'

const STATUS_CONFIG: Record<WarrantyStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  ACTIVE:  { label: 'ใช้งานได้',  cls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/60',  Icon: ShieldCheck },
  EXPIRED: { label: 'หมดอายุ',   cls: 'bg-slate-50 dark:bg-gray-900/20 text-slate-500 dark:text-slate-400 dark:text-gray-400 border-gray-200 dark:border-gray-800/60',    Icon: ShieldOff },
  VOIDED:  { label: 'ยกเลิกแล้ว', cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60',      Icon: ShieldOff },
  CLAIMED: { label: 'ใช้สิทธิ์แล้ว', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60', Icon: ShieldAlert },
}

const SOURCE_LABEL: Record<string, string> = {
  REPAIR:  'งานซ่อม',
  PRODUCT: 'สินค้า',
}

function WarrantyStatusBadge({ status }: { status: WarrantyStatus }) {
  const { label, cls, Icon } = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function EndDateCell({ endDate, status }: { endDate: string; status: WarrantyStatus }) {
  const date = new Date(endDate)
  const expired = isPast(date)
  const cls = status === 'ACTIVE' && !expired
    ? expired ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
    : 'text-slate-400 dark:text-slate-500 line-through'
  return (
    <div>
      <p className={`text-sm ${cls}`}>{format(date, 'dd MMM yyyy', { locale: th })}</p>
      {status === 'ACTIVE' && !expired && (
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(date, { addSuffix: true, locale: th })}
        </p>
      )}
    </div>
  )
}

export default function WarrantiesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('')
  const [sourceFilter, setSource]   = useState('')
  const [page, setPage]             = useState(1)
  const [voidId, setVoidId]         = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [claimId, setClaimId]       = useState<string | null>(null)
  const [actionLoading, setLoading] = useState(false)

  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['warranties', search, statusFilter, sourceFilter, page],
    queryFn: async () => {
      const params: any = { page, limit }
      if (search)       params.search     = search
      if (statusFilter) params.status     = statusFilter
      if (sourceFilter) params.sourceType = sourceFilter
      return (await api.get('/warranties', { params })).data as {
        items: Warranty[]
        total: number
        page: number
        limit: number
      }
    },
    placeholderData: (prev) => prev,
  })

  const { data: stats } = useQuery({
    queryKey: ['warranties-stats'],
    queryFn: async () => (await api.get('/warranties/stats')).data as {
      active: number; expired: number; voided: number; claimed: number
    },
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['warranties'] })
    queryClient.invalidateQueries({ queryKey: ['warranties-stats'] })
  }, [queryClient])

  const items      = data?.items ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const handleVoid = async () => {
    if (!voidId || !voidReason.trim()) return
    setLoading(true)
    try {
      await api.post(`/warranties/${voidId}/void`, { reason: voidReason })
      invalidate()
      setVoidId(null)
      setVoidReason('')
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleClaim = async () => {
    if (!claimId) return
    setLoading(true)
    try {
      await api.post(`/warranties/${claimId}/claim`)
      invalidate()
      setClaimId(null)
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="การรับประกัน"
        icon={BadgeCheck}
        subtitle={`ทั้งหมด ${total} รายการ`}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="ใช้งานได้"
          value={stats?.active ?? 0}
          icon={ShieldCheck}
          color="emerald"
          loading={!stats}
        />
        <StatCard
          label="หมดอายุ"
          value={stats?.expired ?? 0}
          icon={ShieldOff}
          color="slate"
          loading={!stats}
        />
        <StatCard
          label="ใช้สิทธิ์แล้ว"
          value={stats?.claimed ?? 0}
          icon={ShieldAlert}
          color="amber"
          loading={!stats}
        />
        <StatCard
          label="ยกเลิกแล้ว"
          value={stats?.voided ?? 0}
          icon={ShieldOff}
          color="red"
          loading={!stats}
        />
      </div>

      {/* Status filter chips */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {[
            { key: '', label: 'ทั้งหมด', count: stats.active + stats.expired + stats.voided + stats.claimed },
            { key: 'ACTIVE',  label: 'ใช้งานได้',    count: stats.active  },
            { key: 'EXPIRED', label: 'หมดอายุ',      count: stats.expired },
            { key: 'CLAIMED', label: 'ใช้สิทธิ์แล้ว', count: stats.claimed },
            { key: 'VOIDED',  label: 'ยกเลิก',       count: stats.voided  },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setStatus(key); setPage(1) }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                statusFilter === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Search + source filter */}
      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="ค้นหา: ชื่อ, เบอร์, เลข ticket, ใบเสร็จ, serial..."
      >
        <select
          value={sourceFilter}
          onChange={(e) => { setSource(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-3 py-1 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกประเภท</option>
          <option value="REPAIR">งานซ่อม</option>
          <option value="PRODUCT">สินค้า</option>
        </select>
      </FilterBar>

      <ExpiringSoonWidget />

      {/* Desktop table */}
      <SectionCard noPadding className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>เลขที่</DataTableHeadCell>
            <DataTableHeadCell>ลูกค้า</DataTableHeadCell>
            <DataTableHeadCell>รายการ</DataTableHeadCell>
            <DataTableHeadCell>ประเภท</DataTableHeadCell>
            <DataTableHeadCell>หมดอายุ</DataTableHeadCell>
            <DataTableHeadCell className="text-center">สถานะ</DataTableHeadCell>
            <DataTableHeadCell className="w-24" />
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={5} cols={7} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState preset="warranty" />
                </td>
              </tr>
            ) : items.map((w) => (
              <DataTableRow key={w.id}>
                <DataTableCell>
                  <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{w.warrantyNumber}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{format(new Date(w.startDate), 'dd/MM/yy', { locale: th })}</p>
                </DataTableCell>
                <DataTableCell>
                  {w.customer ? (
                    <>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{w.customer.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{w.customer.phone ?? '—'}</p>
                    </>
                  ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                </DataTableCell>
                <DataTableCell className="max-w-[200px]">
                  {w.repair && <p className="text-sm font-medium text-blue-700 dark:text-blue-400 truncate">{w.repair.ticketNumber}</p>}
                  {w.saleItem && (
                    <>
                      <p className="text-sm font-medium truncate">{w.saleItem.product.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{w.saleItem.sale.receiptNumber}</p>
                    </>
                  )}
                  {w.serialNumber && <p className="text-xs font-mono text-slate-500 dark:text-slate-400">S/N: {w.serialNumber.serial}</p>}
                  {w.description && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{w.description}</p>}
                </DataTableCell>
                <DataTableCell>
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/60">
                    {SOURCE_LABEL[w.sourceType]}
                  </span>
                </DataTableCell>
                <DataTableCell>
                  <EndDateCell endDate={w.endDate} status={w.status} />
                </DataTableCell>
                <DataTableCell className="text-center">
                  <WarrantyStatusBadge status={w.status} />
                </DataTableCell>
                <DataTableCell className="text-right">
                  {w.status === 'ACTIVE' && (
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={() => setClaimId(w.id)}>ใช้สิทธิ์</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setVoidId(w.id)}>ยกเลิก</Button>
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </SectionCard>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60">
            <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60">
            <EmptyState preset="warranty" />
          </div>
        ) : items.map((w) => (
          <div key={w.id} className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{w.warrantyNumber}</p>
                {w.customer && <p className="font-semibold text-slate-900 dark:text-white">{w.customer.name}</p>}
                {w.repair && <p className="text-sm text-blue-700 dark:text-blue-400">{w.repair.ticketNumber}</p>}
                {w.saleItem && <p className="text-sm">{w.saleItem.product.name}</p>}
              </div>
              <WarrantyStatusBadge status={w.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 dark:bg-[#1E293B]/40 px-3 py-2">
                <p className="text-[10px] text-slate-400 dark:text-slate-500">ประเภท</p>
                <p className="font-medium text-xs">{SOURCE_LABEL[w.sourceType]}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-[#1E293B]/40 px-3 py-2">
                <p className="text-[10px] text-slate-400 dark:text-slate-500">หมดอายุ</p>
                <p className="font-medium text-xs">{format(new Date(w.endDate), 'dd/MM/yy', { locale: th })}</p>
              </div>
            </div>
            {w.status === 'ACTIVE' && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60" onClick={() => setClaimId(w.id)}>ใช้สิทธิ์รับประกัน</Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-red-500 dark:text-red-400 border-red-200 dark:border-red-800/60" onClick={() => setVoidId(w.id)}>ยกเลิก</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            หน้า {page} / {totalPages} ({total} รายการ)
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Void confirmation modal */}
      {voidId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">ยืนยันการยกเลิกการรับประกัน</h2>
            <p className="text-sm text-muted-foreground">กรุณาระบุเหตุผลในการยกเลิก</p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
              placeholder="เหตุผล..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setVoidId(null); setVoidReason('') }}>
                ยกเลิก
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!voidReason.trim() || actionLoading}
                onClick={handleVoid}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยันยกเลิก'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Claim confirmation modal */}
      {claimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">ยืนยันการใช้สิทธิ์การรับประกัน</h2>
            <p className="text-sm text-muted-foreground">
              สถานะจะเปลี่ยนเป็น &quot;ใช้สิทธิ์แล้ว&quot; และจะไม่สามารถใช้ได้อีก
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setClaimId(null)}>
                ยกเลิก
              </Button>
              <Button
                size="sm"
                disabled={actionLoading}
                onClick={handleClaim}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยัน'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
