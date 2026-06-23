'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, Wrench, X, Camera, ExternalLink, LayoutList, LayoutGrid,
  AlertCircle, RefreshCw, Search, ScanBarcode, Printer, CalendarDays,
  ClipboardList, ChevronRight,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RepairFormDialog } from '@/components/repairs/repair-form-dialog'
import { RepairKanbanBoard } from '@/components/repairs/repair-kanban-board'
import { RepairMobileList } from '@/components/repairs/repair-mobile-list'
import { QrScannerDialog } from '@/components/repairs/qr-scanner-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { RepairStatusBadge } from '@/components/ui/status-badge'
import { QcDialog } from '@/components/repairs/qc-dialog'
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

const STAT_CARDS: Array<{ value: RepairStatus | 'ALL'; label: string; color: string; bg: string }> = [
  { value: 'ALL',          label: 'ทั้งหมด',       color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  { value: 'RECEIVED',     label: 'รับงานใหม่',    color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'  },
  { value: 'IN_PROGRESS',  label: 'กำลังซ่อม',     color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  { value: 'WAITING_PARTS',label: 'รออะไหล่',      color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  { value: 'COMPLETED',    label: 'ซ่อมเสร็จ',     color: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
  { value: 'DELIVERED',    label: 'ส่งมอบแล้ว',    color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200'  },
]

const STATUS_TABS: Array<{ value: RepairStatus | 'ALL'; label: string; dot?: string }> = [
  { value: 'ALL',              label: 'ทั้งหมด' },
  { value: 'RECEIVED',         label: 'รับงานใหม่',    dot: 'bg-blue-500'    },
  { value: 'DIAGNOSING',       label: 'ตรวจวินิจฉัย', dot: 'bg-yellow-500'  },
  { value: 'IN_PROGRESS',      label: 'กำลังซ่อม',    dot: 'bg-purple-500'  },
  { value: 'WAITING_PARTS',    label: 'รออะไหล่',     dot: 'bg-orange-500'  },
  { value: 'WAITING_APPROVAL', label: 'รออนุมัติ',    dot: 'bg-amber-500'   },
  { value: 'QC_PENDING',       label: 'รอ QC',         dot: 'bg-indigo-500'  },
  { value: 'COMPLETED',        label: 'ซ่อมเสร็จ',    dot: 'bg-green-500'   },
  { value: 'READY_PICKUP',     label: 'รอลูกค้ารับ',  dot: 'bg-emerald-500' },
  { value: 'DELIVERED',        label: 'ส่งมอบแล้ว',   dot: 'bg-slate-400'   },
  { value: 'CANCELLED',        label: 'ยกเลิก',        dot: 'bg-red-400'     },
]

const VIEW_MODE_KEY = 'repairViewMode'

function formatRelativeDate(dateStr: string) {
  const d = new Date(dateStr)
  if (isToday(d)) return `วันนี้ ${format(d, 'HH:mm', { locale: th })}`
  if (isYesterday(d)) return `เมื่อวาน ${format(d, 'HH:mm', { locale: th })}`
  return format(d, 'dd MMM yy HH:mm', { locale: th })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepairsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'ALL'>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null)
  const [qcRepairId, setQcRepairId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [scanOpen, setScanOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { branchId, isGlobalMode } = useBranchContext()
  const hasModule = useAuthStore((s) => s.hasModule)

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY)
    if (saved === 'board' || saved === 'list') setViewMode(saved)
    // Auto-open scanner if ?scan=1 in URL
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scan') === '1') {
      setScanOpen(true)
    }
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
      if (viewMode === 'board') params.set('activeOnly', 'true')
      return (await api.get(`/repairs?${params.toString()}`)).data
    },
    placeholderData: keepPreviousData,
    throwOnError: false,
  })

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: repairs.length }
    repairs.forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1 })
    return counts
  }, [repairs])

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

  const recentRepairs = useMemo(
    () => [...repairs].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()).slice(0, 6),
    [repairs],
  )

  function handleScanResult(text: string) {
    const trimmed = text.trim()
    // Match ticketNumber pattern REP-YYYYMMDD-XXXXXX or UUID
    const byTicket = repairs.find((r) => r.ticketNumber === trimmed)
    if (byTicket) { setSelectedRepairId(byTicket.id); return }
    // Try UUID match
    const byId = repairs.find((r) => r.id === trimmed)
    if (byId) { setSelectedRepairId(byId.id); return }
    toast.error(`ไม่พบใบงาน: ${trimmed}`)
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['repairs'] })
  }

  if (!hasModule('repair')) return <ModuleGate module="repair">{null}</ModuleGate>

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
          <p className="text-sm text-slate-500 mt-1">{backendMsg ?? 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'}</p>
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
            <Button onClick={() => { if (!isGlobalMode) setCreateOpen(true) }} disabled={isGlobalMode} className="gap-2">
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
            onQc={setQcRepairId}
            onStatusChanged={invalidate}
          />
        </div>
        <QrScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScanResult} />
        <Dialogs
          createOpen={createOpen} setCreateOpen={setCreateOpen}
          selectedRepairId={selectedRepairId} setSelectedRepairId={setSelectedRepairId}
          qcRepairId={qcRepairId} setQcRepairId={setQcRepairId}
          invalidate={invalidate} branchId={branchId} repairs={repairs}
        />
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile card view */}
      <div className="-m-4 sm:-m-6 md:hidden">
        <RepairMobileList
          repairs={repairs}
          isLoading={isLoading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          onOpenRepair={setSelectedRepairId}
          onCreateRepair={() => { if (!isGlobalMode) setCreateOpen(true) }}
          statusCounts={statusCounts}
        />
        <Dialogs
          createOpen={createOpen} setCreateOpen={setCreateOpen}
          selectedRepairId={selectedRepairId} setSelectedRepairId={setSelectedRepairId}
          qcRepairId={qcRepairId} setQcRepairId={setQcRepairId}
          invalidate={invalidate} branchId={branchId} repairs={repairs}
        />
        <QrScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScanResult} />
      </div>

    {/* Desktop list view */}
    <div className="hidden md:block space-y-4">

      {/* Header */}
      <PageHeader
        title="งานซ่อม"
        icon={Wrench}
        subtitle="ภาพรวมงานซ่อมทั้งหมดในระบบ"
        secondaryActions={
          <div className="flex items-center gap-2">
            <ViewToggle viewMode={viewMode} onSwitch={switchView} />
            <BranchContextBar className="hidden sm:flex" />
          </div>
        }
        primaryAction={
          <Button onClick={() => { if (!isGlobalMode) setCreateOpen(true) }} disabled={isGlobalMode} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">สร้างงานซ่อมใหม่</span>
            <span className="sm:hidden">สร้าง</span>
          </Button>
        }
      />

      {isGlobalMode && <GlobalModeBanner action="ไม่สามารถสร้างงานซ่อมในโหมดทุกสาขา" />}

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAT_CARDS.map((s) => {
          const count = statusCounts[s.value] ?? 0
          const active = statusFilter === s.value
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                active ? 'ring-2 ring-blue-500 ring-offset-1' : '',
                s.bg,
              )}
            >
              <p className={cn('text-2xl font-bold tabular-nums', s.color)}>
                {isLoading ? '—' : count}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </button>
          )
        })}
      </div>

      {/* Main + Sidebar */}
      <div className="flex gap-4 items-start">

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Search + tabs row */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า, เบอร์, เลขงาน, IMEI, รุ่น..."
                className="w-full pl-9 pr-4 h-9 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status tabs */}
            <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
              {STATUS_TABS.map((tab) => {
                const count = statusCounts[tab.value] ?? 0
                const active = statusFilter === tab.value
                if (tab.value !== 'ALL' && count === 0) return null
                return (
                  <button
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-all shrink-0',
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600',
                    )}
                  >
                    {tab.dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? 'bg-white/80' : tab.dot)} />}
                    {tab.label}
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
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <DataTable>
              <DataTableHead>
                <DataTableHeadCell>เลขงาน</DataTableHeadCell>
                <DataTableHeadCell>ลูกค้า</DataTableHeadCell>
                <DataTableHeadCell>อุปกรณ์</DataTableHeadCell>
                <DataTableHeadCell hidden>อาการ</DataTableHeadCell>
                <DataTableHeadCell>สถานะ</DataTableHeadCell>
                <DataTableHeadCell right hidden>ยอดประเมิน</DataTableHeadCell>
                <DataTableHeadCell hidden>วันที่รับ</DataTableHeadCell>
              </DataTableHead>
              <DataTableBody>
                {isLoading ? (
                  <DataTableLoadingRows rows={7} cols={7} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-0">
                      <EmptyState preset={search ? 'search' : 'repairs'} size="md" />
                    </td>
                  </tr>
                ) : (
                  filtered.map((repair) => {
                    const isNew = (Date.now() - new Date(repair.receivedAt).getTime()) < 24 * 60 * 60 * 1000
                    return (
                      <DataTableRow key={repair.id} onClick={() => setSelectedRepairId(repair.id)}>
                        <DataTableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-blue-700 text-xs">{repair.ticketNumber}</span>
                            {isNew && (
                              <span className="text-[9px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full leading-none">ใหม่</span>
                            )}
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
                          <p className="font-medium text-slate-900 leading-tight">{repair.deviceBrand} {repair.deviceModel}</p>
                          {repair.deviceImei && (
                            <p className="text-xs text-slate-400 font-mono mt-0.5">IMEI: {repair.deviceImei}</p>
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
                            {formatRelativeDate(repair.receivedAt)}
                          </span>
                        </DataTableCell>
                      </DataTableRow>
                    )
                  })
                )}
              </DataTableBody>
            </DataTable>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="hidden xl:flex flex-col gap-3 w-56 shrink-0">
          <RepairSidebar
            repairs={repairs}
            recentRepairs={recentRepairs}
            isGlobalMode={isGlobalMode}
            onCreateOpen={() => { if (!isGlobalMode) setCreateOpen(true) }}
            onOpenDetail={setSelectedRepairId}
            onFocusSearch={() => { searchInputRef.current?.focus(); searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
            onOpenScanner={() => setScanOpen(true)}
          />
        </div>
      </div>

      <QrScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScanResult} />

      <Dialogs
        createOpen={createOpen} setCreateOpen={setCreateOpen}
        selectedRepairId={selectedRepairId} setSelectedRepairId={setSelectedRepairId}
        qcRepairId={qcRepairId} setQcRepairId={setQcRepairId}
        invalidate={invalidate} branchId={branchId} repairs={repairs}
      />
    </div>
  </>
  )
}

// ── Right Sidebar ─────────────────────────────────────────────────────────────

function RepairSidebar({
  repairs, recentRepairs, isGlobalMode, onCreateOpen, onOpenDetail, onFocusSearch, onOpenScanner,
}: {
  repairs: Repair[]
  recentRepairs: Repair[]
  isGlobalMode: boolean
  onCreateOpen: () => void
  onOpenDetail: (id: string) => void
  onFocusSearch: () => void
  onOpenScanner: () => void
}) {
  const overdueCount = repairs.filter((r) =>
    r.dueDate && new Date(r.dueDate) < new Date() &&
    !['DELIVERED', 'CANCELLED'].includes(r.status)
  ).length

  return (
    <>
      {/* Quick actions */}
      <div className="bg-white rounded-xl border shadow-sm p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">การดำเนินการด่วน</p>
        <button
          onClick={onCreateOpen}
          disabled={isGlobalMode}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4 shrink-0" />
          สร้างงานซ่อมใหม่
        </button>
        <button onClick={onFocusSearch} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          ค้นหาใบงาน
        </button>
        <button onClick={onOpenScanner} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
          <ScanBarcode className="h-4 w-4 shrink-0 text-slate-400" />
          สแกน QR / Barcode
        </button>
        <Link href="/reminders" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
          รายการนัดหมาย
          {overdueCount > 0 && (
            <span className="ml-auto text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{overdueCount}</span>
          )}
        </Link>
        <Link href="/reports/daily-closing" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
          <ClipboardList className="h-4 w-4 shrink-0 text-slate-400" />
          รายงานปิดวัน
        </Link>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">กิจกรรมล่าสุด</p>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          {recentRepairs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">ยังไม่มีข้อมูล</p>
          ) : (
            recentRepairs.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenDetail(r.id)}
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-blue-700 font-mono truncate">{r.ticketNumber}</p>
                    <p className="text-xs text-slate-600 truncate leading-tight">
                      {r.customer?.name ?? 'ไม่ระบุลูกค้า'}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.deviceBrand} {r.deviceModel}</p>
                  </div>
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {format(new Date(r.receivedAt), 'HH:mm', { locale: th })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
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
            viewMode === mode ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50',
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
  createOpen, setCreateOpen,
  selectedRepairId, setSelectedRepairId,
  qcRepairId, setQcRepairId,
  invalidate, branchId, repairs,
}: {
  createOpen: boolean
  setCreateOpen: (v: boolean) => void
  selectedRepairId: string | null
  setSelectedRepairId: (v: string | null) => void
  qcRepairId: string | null
  setQcRepairId: (v: string | null) => void
  invalidate: () => void
  branchId: string | undefined
  repairs: Repair[]
}) {
  const qcRepair = repairs.find((r) => r.id === qcRepairId) ?? null
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
      {qcRepair && (
        <QcDialog repair={qcRepair} open={!!qcRepairId} onClose={() => { setQcRepairId(null); invalidate() }} />
      )}
    </>
  )
}
