'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Plus, Search, Wrench, X, Camera, ExternalLink, LayoutList, LayoutGrid } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RepairFormDialog } from '@/components/repairs/repair-form-dialog'
import { RepairKanbanBoard } from '@/components/repairs/repair-kanban-board'
import { formatThaiMoney } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar, GlobalModeBanner } from '@/components/layout/branch-context-bar'
import api from '@/lib/api'
import type { RepairStatus, Repair } from '@/types'

const RepairDetailDialog = dynamic(
  () => import('@/components/repairs/repair-detail-dialog').then((m) => ({ default: m.RepairDetailDialog })),
  { ssr: false },
)

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED:         'รับงาน',
  DIAGNOSING:       'ตรวจสอบ',
  WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  COMPLETED:        'ซ่อมเสร็จ',
  DELIVERED:        'ส่งคืนแล้ว',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<RepairStatus, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700 border-blue-200',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700 border-yellow-200',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED:         'bg-teal-100 text-teal-700 border-teal-200',
  WAITING_PARTS:    'bg-orange-100 text-orange-700 border-orange-200',
  IN_PROGRESS:      'bg-purple-100 text-purple-700 border-purple-200',
  COMPLETED:        'bg-green-100 text-green-700 border-green-200',
  DELIVERED:        'bg-gray-100 text-gray-700 border-gray-200',
  CANCELLED:        'bg-red-100 text-red-700 border-red-200',
}

const STATUS_FILTERS: Array<{ value: RepairStatus | 'ALL'; label: string }> = [
  { value: 'ALL',              label: 'ทั้งหมด' },
  { value: 'RECEIVED',         label: 'รับงาน' },
  { value: 'DIAGNOSING',       label: 'ตรวจสอบ' },
  { value: 'WAITING_APPROVAL', label: 'รออนุมัติ' },
  { value: 'APPROVED',         label: 'อนุมัติแล้ว' },
  { value: 'WAITING_PARTS',    label: 'รออะไหล่' },
  { value: 'IN_PROGRESS',      label: 'กำลังซ่อม' },
  { value: 'COMPLETED',        label: 'ซ่อมเสร็จ' },
  { value: 'DELIVERED',        label: 'ส่งคืนแล้ว' },
  { value: 'CANCELLED',        label: 'ยกเลิก' },
]

const VIEW_MODE_KEY = 'repairViewMode'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepairsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'ALL'>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')

  const { branchId, isGlobalMode } = useBranchContext()

  // Restore persisted view mode
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY)
    if (saved === 'board' || saved === 'list') setViewMode(saved)
  }, [])

  function switchView(mode: 'list' | 'board') {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  const { data: repairs = [], isLoading } = useQuery<Repair[]>({
    queryKey: ['repairs', branchId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      return (await api.get(`/repairs?${params}`)).data
    },
    placeholderData: keepPreviousData,
  })

  const filtered = useMemo(() => {
    let list = repairs
    if (statusFilter !== 'ALL') list = list.filter((r) => r.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.ticketNumber.toLowerCase().includes(q) ||
          r.customer?.name?.toLowerCase().includes(q) ||
          r.customer?.phone?.toLowerCase().includes(q) ||
          (r.deviceImei?.toLowerCase().includes(q) ?? false) ||
          r.deviceModel.toLowerCase().includes(q) ||
          r.deviceBrand.toLowerCase().includes(q),
      )
    }
    return list
  }, [repairs, statusFilter, search])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['repairs'] })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={viewMode === 'board' ? 'flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]' : 'space-y-4 sm:space-y-5'}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">งานซ่อม</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ทั้งหมด {repairs.length} งาน
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View switcher */}
          <div className="flex rounded-lg border bg-white overflow-hidden">
            <button
              onClick={() => switchView('list')}
              title="แสดงแบบรายการ"
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <LayoutList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">รายการ</span>
            </button>
            <button
              onClick={() => switchView('board')}
              title="แสดงแบบบอร์ด"
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-l transition-colors',
                viewMode === 'board'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">บอร์ด</span>
            </button>
          </div>

          <BranchContextBar className="hidden sm:flex" />

          <Button
            onClick={() => { if (!isGlobalMode) setCreateOpen(true) }}
            disabled={isGlobalMode}
            title={isGlobalMode ? 'กรุณาเลือกสาขาก่อนสร้างงานซ่อม' : undefined}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">สร้างงานซ่อม</span>
            <span className="sm:hidden">สร้าง</span>
          </Button>
        </div>
      </div>

      {isGlobalMode && (
        <GlobalModeBanner action="ไม่สามารถสร้างงานซ่อมในโหมดทุกสาขา" />
      )}

      {/* ── BOARD VIEW ───────────────────────────────────────────────────── */}
      {viewMode === 'board' && (
        <div className="flex-1 min-h-0">
          <RepairKanbanBoard
            repairs={repairs}
            onOpenDetail={setSelectedRepairId}
            onPayment={(id) => setSelectedRepairId(id)}
            onPrint={(id) => {
              toast.info('กำลังพัฒนาระบบพิมพ์ใบงาน')
            }}
            onStatusChanged={invalidate}
          />
        </div>
      )}

      {/* ── LIST VIEW ────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          {/* Search + status filter */}
          <div className="space-y-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="ค้นหาชื่อลูกค้า, เบอร์, เลขงาน, IMEI, รุ่น..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => {
                const count = f.value !== 'ALL'
                  ? repairs.filter((r) => r.status === f.value).length
                  : repairs.length
                return (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={[
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      statusFilter === f.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600',
                    ].join(' ')}
                  >
                    {f.label}
                    <span className={`ml-1.5 text-[10px] ${statusFilter === f.value ? 'opacity-80' : 'opacity-50'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            {isLoading ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-medium">เลขงาน</th>
                      <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                      <th className="text-left px-4 py-3 font-medium">อุปกรณ์</th>
                      <th className="text-left px-4 py-3 font-medium">อาการ</th>
                      <th className="text-left px-4 py-3 font-medium">สถานะ</th>
                      <th className="text-right px-4 py-3 font-medium">ยอดประมาณ</th>
                      <th className="text-left px-4 py-3 font-medium">วันที่รับ</th>
                    </tr>
                  </thead>
                  <tbody className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-4 py-3"><div className="h-4 w-28 bg-gray-100 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-100 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-32 bg-gray-100 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-36 bg-gray-100 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-100 rounded-full" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded ml-auto" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-100 rounded" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <Wrench className="h-10 w-10 text-gray-200" />
                <p className="text-sm font-medium">ไม่พบงานซ่อม</p>
                {search && <p className="text-xs">ลองเปลี่ยนคำค้นหา</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3 font-medium">เลขงาน</th>
                      <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                      <th className="text-left px-4 py-3 font-medium">อุปกรณ์</th>
                      <th className="text-left px-4 py-3 font-medium">อาการ</th>
                      <th className="text-left px-4 py-3 font-medium">สถานะ</th>
                      <th className="text-right px-4 py-3 font-medium">ยอดประมาณ</th>
                      <th className="text-left px-4 py-3 font-medium">วันที่รับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((repair) => (
                      <tr
                        key={repair.id}
                        onClick={() => setSelectedRepairId(repair.id)}
                        className="border-b last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-blue-700 text-xs">
                              {repair.ticketNumber}
                            </span>
                            {(repair._count?.images ?? 0) > 0 && (
                              <Camera className="h-3 w-3 text-slate-400 shrink-0" />
                            )}
                            <Link
                              href={`/repairs/${repair.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="เปิด Workspace"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {repair.customer ? (
                            <div>
                              <p className="font-medium text-gray-900">{repair.customer.name}</p>
                              {repair.customer.phone && (
                                <p className="text-xs text-muted-foreground">{repair.customer.phone}</p>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {repair.deviceBrand} {repair.deviceModel}
                          </p>
                          {repair.deviceImei && (
                            <p className="text-xs text-muted-foreground font-mono">{repair.deviceImei}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="text-gray-700 truncate text-xs">{repair.issue}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${STATUS_COLOR[repair.status]}`}>
                            {STATUS_LABEL[repair.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {repair.estimateCost ? formatThaiMoney(Number(repair.estimateCost)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(repair.receivedAt), 'dd MMM yy HH:mm', { locale: th })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <RepairFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => { setCreateOpen(false); invalidate() }}
      />

      <RepairDetailDialog
        repairId={selectedRepairId}
        onClose={() => setSelectedRepairId(null)}
        onStatusChange={invalidate}
      />
    </div>
  )
}
