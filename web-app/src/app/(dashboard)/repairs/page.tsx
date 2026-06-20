'use client'

console.log('[BUILD] repairs-page')

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, Wrench, X, Camera, ExternalLink, LayoutList, LayoutGrid, AlertCircle, RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RepairFormDialog } from '@/components/repairs/repair-form-dialog'
import { RepairKanbanBoard } from '@/components/repairs/repair-kanban-board'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { RepairStatusBadge } from '@/components/ui/status-badge'
import { formatThaiMoney, cn } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar, GlobalModeBanner } from '@/components/layout/branch-context-bar'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import api from '@/lib/api'
import type { RepairStatus, Repair } from '@/types'

const RepairDetailDialog = dynamic(
  () => import('@/components/repairs/repair-detail-dialog').then((m) => ({ default: m.RepairDetailDialog })),
  { ssr: false },
)

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: RepairStatus | 'ALL'; label: string; dot?: string }> = [
  { value: 'ALL',              label: 'ทั้งหมด' },
  { value: 'RECEIVED',         label: 'รับงาน',      dot: 'bg-blue-500'   },
  { value: 'DIAGNOSING',       label: 'ตรวจสอบ',    dot: 'bg-yellow-500' },
  { value: 'WAITING_APPROVAL', label: 'รออนุมัติ',  dot: 'bg-amber-500'  },
  { value: 'APPROVED',         label: 'อนุมัติแล้ว', dot: 'bg-teal-500'   },
  { value: 'WAITING_PARTS',    label: 'รออะไหล่',   dot: 'bg-orange-500' },
  { value: 'IN_PROGRESS',      label: 'กำลังซ่อม',  dot: 'bg-purple-500' },
  { value: 'COMPLETED',        label: 'ซ่อมเสร็จ',  dot: 'bg-green-500'  },
  { value: 'DELIVERED',        label: 'ส่งคืนแล้ว', dot: 'bg-slate-400'  },
  { value: 'CANCELLED',        label: 'ยกเลิก',      dot: 'bg-red-400'    },
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
  const hasModule = useAuthStore((s) => s.hasModule)

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY)
    if (saved === 'board' || saved === 'list') setViewMode(saved)
  }, [])

  function switchView(mode: 'list' | 'board') {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  function isSafeBranchId(id: string | undefined): id is string {
    return typeof id === 'string' && id.length > 0 && id !== 'null' && id !== 'all'
  }

  const { data: repairs = [], isLoading, isError, error, refetch } = useQuery<Repair[]>({
    queryKey: ['repairs', branchId, viewMode],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (isSafeBranchId(branchId)) params.set('branchId', branchId)
      // Board view only needs active repairs — exclude DELIVERED/CANCELLED history
      // so old archived jobs never push current work out of the 2000-row window.
      if (viewMode === 'board') params.set('activeOnly', 'true')
      return (await api.get(`/repairs?${params.toString()}`)).data
    },
    placeholderData: keepPreviousData,
    throwOnError: false,
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

  if (!hasModule('repair')) return <ModuleGate module="repair">{null}</ModuleGate>

  // Error state
  if (isError) {
    const backendMsg = (() => {
      const m = (error as any)?.response?.data?.message
      if (Array.isArray(m)) return m.join(', ')
      return typeof m === 'string' ? m : undefined
    })()
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
        <div className="h-16 w-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">โหลดข้อมูลไม่สำเร็จ</h2>
          <p className="text-sm text-slate-500 mt-1">
            {backendMsg ?? 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'}
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />ลองใหม่
        </Button>
      </div>
    )
  }

  // ── Board view ────────────────────────────────────────────────────────────────
  if (viewMode === 'board') {
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)] space-y-4">
        <PageHeader
          title="งานซ่อม"
          icon={Wrench}
          subtitle={`${repairs.length} งานทั้งหมด`}
          secondaryActions={
            <div className="flex items-center gap-2">
              <ViewToggle viewMode={viewMode} onSwitch={switchView} />
              <BranchContextBar className="hidden sm:flex" />
            </div>
          }
          primaryAction={
            <Button
              onClick={() => { if (!isGlobalMode) setCreateOpen(true) }}
              disabled={isGlobalMode}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">สร้างงานซ่อม</span>
              <span className="sm:hidden">สร้าง</span>
            </Button>
          }
        />
        {isGlobalMode && <GlobalModeBanner action="ไม่สามารถสร้างงานซ่อมในโหมดทุกสาขา" />}
        <div className="flex-1 min-h-0">
          <RepairKanbanBoard
            repairs={repairs}
            onOpenDetail={setSelectedRepairId}
            onPayment={(id) => setSelectedRepairId(id)}
            onPrint={() => toast.info('กำลังพัฒนาระบบพิมพ์ใบงาน')}
            onStatusChanged={invalidate}
          />
        </div>
        <Dialogs
          createOpen={createOpen}
          setCreateOpen={setCreateOpen}
          selectedRepairId={selectedRepairId}
          setSelectedRepairId={setSelectedRepairId}
          invalidate={invalidate}
          branchId={branchId}
        />
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        title="งานซ่อม"
        icon={Wrench}
        subtitle={isLoading ? '' : `${repairs.length} งานทั้งหมด`}
        secondaryActions={
          <div className="flex items-center gap-2">
            <ViewToggle viewMode={viewMode} onSwitch={switchView} />
            <BranchContextBar className="hidden sm:flex" />
          </div>
        }
        primaryAction={
          <Button
            onClick={() => { if (!isGlobalMode) setCreateOpen(true) }}
            disabled={isGlobalMode}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">สร้างงานซ่อม</span>
            <span className="sm:hidden">สร้าง</span>
          </Button>
        }
      />

      {isGlobalMode && <GlobalModeBanner action="ไม่สามารถสร้างงานซ่อมในโหมดทุกสาขา" />}

      {/* Filter bar + status tabs */}
      <div className="space-y-3">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="ค้นหาชื่อลูกค้า, เบอร์, เลขงาน, IMEI, รุ่น..."
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const count = f.value === 'ALL' ? repairs.length : repairs.filter(r => r.status === f.value).length
            const active = statusFilter === f.value
            if (f.value !== 'ALL' && count === 0) return null
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600',
                )}
              >
                {f.dot && (
                  <span className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    active ? 'bg-white/80' : f.dot,
                  )} />
                )}
                {f.label}
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[16px] h-4 rounded-full px-1 text-[10px] font-semibold',
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <SectionCard noPadding>
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>เลขงาน</DataTableHeadCell>
            <DataTableHeadCell>ลูกค้า</DataTableHeadCell>
            <DataTableHeadCell>อุปกรณ์</DataTableHeadCell>
            <DataTableHeadCell hidden>อาการ</DataTableHeadCell>
            <DataTableHeadCell>สถานะ</DataTableHeadCell>
            <DataTableHeadCell right hidden>ยอดประมาณ</DataTableHeadCell>
            <DataTableHeadCell hidden>วันที่รับ</DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={7} cols={7} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-0">
                  <EmptyState
                    preset={search ? 'search' : 'repairs'}
                    size="md"
                  />
                </td>
              </tr>
            ) : (
              filtered.map((repair) => (
                <DataTableRow
                  key={repair.id}
                  onClick={() => setSelectedRepairId(repair.id)}
                >
                  <DataTableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-blue-700 text-xs">
                        {repair.ticketNumber}
                      </span>
                      {(repair._count?.images ?? 0) > 0 && (
                        <Camera className="h-3 w-3 text-slate-400 shrink-0" />
                      )}
                      <Link
                        href={`/repairs/${repair.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="เปิด Workspace"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    {repair.customer ? (
                      <div>
                        <p className="font-medium text-slate-900 leading-tight">{repair.customer.name}</p>
                        {repair.customer.phone && (
                          <p className="text-xs text-slate-400 mt-0.5">{repair.customer.phone}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    <p className="font-medium text-slate-900 leading-tight">
                      {repair.deviceBrand} {repair.deviceModel}
                    </p>
                    {repair.deviceImei && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{repair.deviceImei}</p>
                    )}
                  </DataTableCell>
                  <DataTableCell hidden className="max-w-[160px]">
                    <p className="text-xs text-slate-500 truncate">{repair.issue}</p>
                  </DataTableCell>
                  <DataTableCell>
                    <RepairStatusBadge status={repair.status} />
                  </DataTableCell>
                  <DataTableCell right hidden>
                    <span className="font-mono font-semibold text-slate-900">
                      {repair.estimateCost ? formatThaiMoney(Number(repair.estimateCost)) : '—'}
                    </span>
                  </DataTableCell>
                  <DataTableCell hidden muted>
                    <span className="text-xs whitespace-nowrap">
                      {format(new Date(repair.receivedAt), 'dd MMM yy HH:mm', { locale: th })}
                    </span>
                  </DataTableCell>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>

      <Dialogs
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        selectedRepairId={selectedRepairId}
        setSelectedRepairId={setSelectedRepairId}
        invalidate={invalidate}
        branchId={branchId}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ViewToggle({ viewMode, onSwitch }: { viewMode: 'list' | 'board'; onSwitch: (v: 'list' | 'board') => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
      {(['list', 'board'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onSwitch(mode)}
          title={mode === 'list' ? 'แสดงแบบรายการ' : 'แสดงแบบบอร์ด'}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
            mode === 'board' && 'border-l border-slate-200',
            viewMode === mode
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          {mode === 'list' ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{mode === 'list' ? 'รายการ' : 'บอร์ด'}</span>
        </button>
      ))}
    </div>
  )
}

function Dialogs({
  createOpen, setCreateOpen, selectedRepairId, setSelectedRepairId, invalidate, branchId,
}: {
  createOpen: boolean
  setCreateOpen: (v: boolean) => void
  selectedRepairId: string | null
  setSelectedRepairId: (v: string | null) => void
  invalidate: () => void
  branchId: string | undefined
}) {
  return (
    <>
      <RepairFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branchId={branchId}
        onSuccess={() => { setCreateOpen(false); invalidate() }}
      />
      <RepairDetailDialog
        repairId={selectedRepairId}
        onClose={() => setSelectedRepairId(null)}
        onStatusChange={invalidate}
      />
    </>
  )
}
