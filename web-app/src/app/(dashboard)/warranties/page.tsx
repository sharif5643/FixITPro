'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format, isPast } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  BadgeCheck, Search, X, Loader2, ShieldOff, ShieldAlert,
  ShieldCheck, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import type { Warranty, WarrantyStatus } from '@/types'

const STATUS_CONFIG: Record<WarrantyStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  ACTIVE:  { label: 'ใช้งานได้',  cls: 'bg-green-50 text-green-700 border-green-200',  Icon: ShieldCheck },
  EXPIRED: { label: 'หมดอายุ',   cls: 'bg-gray-50 text-gray-500 border-gray-200',    Icon: ShieldOff },
  VOIDED:  { label: 'ยกเลิกแล้ว', cls: 'bg-red-50 text-red-600 border-red-200',      Icon: ShieldOff },
  CLAIMED: { label: 'ใช้สิทธิ์แล้ว', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: ShieldAlert },
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
    ? expired ? 'text-red-600 font-semibold' : 'text-gray-700'
    : 'text-gray-400 line-through'
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
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">การรับประกัน</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ทั้งหมด {total} รายการ
          </p>
        </div>
      </div>

      {/* Stat chips */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {[
            { key: '', label: 'ทั้งหมด', count: stats.active + stats.expired + stats.voided + stats.claimed, cls: 'bg-gray-100 text-gray-700' },
            { key: 'ACTIVE',  label: 'ใช้งานได้',    count: stats.active,  cls: 'bg-green-50 text-green-700 border border-green-200' },
            { key: 'EXPIRED', label: 'หมดอายุ',      count: stats.expired, cls: 'bg-gray-50 text-gray-500 border border-gray-200' },
            { key: 'CLAIMED', label: 'ใช้สิทธิ์แล้ว', count: stats.claimed, cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
            { key: 'VOIDED',  label: 'ยกเลิก',       count: stats.voided,  cls: 'bg-red-50 text-red-600 border border-red-200' },
          ].map(({ key, label, count, cls }) => (
            <button
              key={key}
              onClick={() => { setStatus(key); setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${cls} ${statusFilter === key ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-80 hover:opacity-100'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ค้นหา: ชื่อ, เบอร์, หมายเลข ticket, ใบเสร็จ, serial..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => { setSource(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        >
          <option value="">ทุกประเภท</option>
          <option value="REPAIR">งานซ่อม</option>
          <option value="PRODUCT">สินค้า</option>
        </select>
      </div>

      {/* Table */}
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <BadgeCheck className="h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium">ไม่พบข้อมูลการรับประกัน</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">เลขที่</th>
                  <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                  <th className="text-left px-4 py-3 font-medium">รายการ</th>
                  <th className="text-left px-4 py-3 font-medium">ประเภท</th>
                  <th className="text-left px-4 py-3 font-medium">หมดอายุ</th>
                  <th className="text-center px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id} className="border-b last:border-0 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-gray-700">{w.warrantyNumber}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(w.startDate), 'dd/MM/yy', { locale: th })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {w.customer ? (
                        <>
                          <p className="font-semibold text-gray-800">{w.customer.name}</p>
                          <p className="text-xs text-muted-foreground">{w.customer.phone ?? '—'}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {w.repair && (
                        <p className="text-sm font-medium text-blue-700 truncate">{w.repair.ticketNumber}</p>
                      )}
                      {w.saleItem && (
                        <>
                          <p className="text-sm font-medium truncate">{w.saleItem.product.name}</p>
                          <p className="text-xs text-muted-foreground">{w.saleItem.sale.receiptNumber}</p>
                        </>
                      )}
                      {w.serialNumber && (
                        <p className="text-xs font-mono text-gray-500">S/N: {w.serialNumber.serial}</p>
                      )}
                      {w.description && (
                        <p className="text-xs text-muted-foreground truncate">{w.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {SOURCE_LABEL[w.sourceType]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <EndDateCell endDate={w.endDate} status={w.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <WarrantyStatusBadge status={w.status} />
                    </td>
                    <td className="px-4 py-3">
                      {w.status === 'ACTIVE' && (
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => setClaimId(w.id)}
                          >
                            ใช้สิทธิ์
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setVoidId(w.id)}
                          >
                            ยกเลิก
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground bg-white rounded-xl border">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 bg-white rounded-xl border text-muted-foreground">
            <BadgeCheck className="h-10 w-10 text-gray-200" />
            <p className="text-sm">ไม่พบข้อมูลการรับประกัน</p>
          </div>
        ) : (
          items.map((w) => (
            <div key={w.id} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-semibold text-gray-600">{w.warrantyNumber}</p>
                  {w.customer && (
                    <p className="font-semibold text-gray-900">{w.customer.name}</p>
                  )}
                  {w.repair && (
                    <p className="text-sm text-blue-700">{w.repair.ticketNumber}</p>
                  )}
                  {w.saleItem && (
                    <p className="text-sm">{w.saleItem.product.name}</p>
                  )}
                </div>
                <WarrantyStatusBadge status={w.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">ประเภท</p>
                  <p className="font-medium text-xs">{SOURCE_LABEL[w.sourceType]}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">หมดอายุ</p>
                  <p className="font-medium text-xs">{format(new Date(w.endDate), 'dd/MM/yy', { locale: th })}</p>
                </div>
              </div>

              {w.status === 'ACTIVE' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs text-amber-600 border-amber-200"
                    onClick={() => setClaimId(w.id)}
                  >
                    ใช้สิทธิ์รับประกัน
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs text-red-500 border-red-200"
                    onClick={() => setVoidId(w.id)}
                  >
                    ยกเลิก
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">ยืนยันการยกเลิกการรับประกัน</h2>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">ยืนยันการใช้สิทธิ์การรับประกัน</h2>
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
