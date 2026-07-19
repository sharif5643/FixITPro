'use client'

import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, Wrench, X, Camera, LayoutGrid, LayoutList,
  AlertCircle, RefreshCw, Search, ScanBarcode, Clock, ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import { RepairFormDialog } from '@/components/repairs/repair-form-dialog'
import { RepairKanbanBoard } from '@/components/repairs/repair-kanban-board'
import { QrScannerDialog } from '@/components/repairs/qr-scanner-dialog'
import { RepairStatusBadge } from '@/components/ui/status-badge'
import { QcDialog } from '@/components/repairs/qc-dialog'
import { cn } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar, GlobalModeBanner } from '@/components/layout/branch-context-bar'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import api from '@/lib/api'
import { printRepairReceipt } from '@/lib/print'
import type { RepairStatus, Repair } from '@/types'

const RepairDetailDialog = dynamic(
  () => import('@/components/repairs/repair-detail-dialog').then((m) => ({ default: m.RepairDetailDialog })),
  { ssr: false },
)

// ── Config ────────────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ value: RepairStatus | 'ALL'; label: string; dot?: string }> = [
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

const STAT_CARDS = [
  { value: 'ALL' as const,           label: 'ทั้งหมด',     icon: '🔧' },
  { value: 'RECEIVED' as const,      label: 'รับงานใหม่',  icon: '📥' },
  { value: 'IN_PROGRESS' as const,   label: 'กำลังซ่อม',   icon: '⚙️' },
  { value: 'WAITING_PARTS' as const, label: 'รออะไหล่',    icon: '📦' },
  { value: 'COMPLETED' as const,     label: 'ซ่อมเสร็จ',   icon: '✅' },
  { value: 'DELIVERED' as const,     label: 'ส่งมอบแล้ว',  icon: '📤' },
]

const VIEW_MODE_KEY = 'repairViewMode'

// ── Page (inner — uses useSearchParams, must be inside Suspense) ──────────────

function RepairsContent() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'ALL'>(() => {
    const s = searchParams.get('status')
    return s && FILTER_TABS.some(t => t.value === s) ? (s as RepairStatus | 'ALL') : 'ALL'
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRepairId, setSelectedRepairId] = useState<string | null>(null)
  const [qcRepairId, setQcRepairId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [scanOpen, setScanOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { branchId, isGlobalMode } = useBranchContext()
  const hasModule = useAuthStore((s) => s.hasModule)

  // Restore view-mode preference once on mount
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY)
    if (saved === 'board' || saved === 'list') setViewMode(saved)
  }, [])

  // Sync status filter whenever the URL query string changes (back/forward, sidebar links)
  useEffect(() => {
    const s = searchParams.get('status')
    const next = s && FILTER_TABS.some(t => t.value === s) ? (s as RepairStatus | 'ALL') : 'ALL'
    setStatusFilter(next)
  }, [searchParams])

  // Open QR scanner when ?scan=1
  useEffect(() => {
    if (searchParams.get('scan') === '1') setScanOpen(true)
  }, [searchParams])

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
      list = list.filter((r) =>
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

  function handleScanResult(text: string) {
    const trimmed = text.trim()
    const byTicket = repairs.find((r) => r.ticketNumber === trimmed)
    if (byTicket) { setSelectedRepairId(byTicket.id); return }
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
        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#111]">โหลดข้อมูลไม่สำเร็จ</h2>
          <p className="text-sm text-slate-500 mt-1">{backendMsg ?? 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />ลองใหม่
        </button>
      </div>
    )
  }

  // ── Board view ────────────────────────────────────────────────────────────────
  if (viewMode === 'board') {
    return (
      <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#111]">งานซ่อม</h1>
            <p className="text-xs text-slate-400 mt-0.5">{repairs.length} งานทั้งหมด</p>
          </div>
          <div className="flex items-center gap-2">
            <BranchContextBar className="hidden sm:flex" />
            <ViewToggle viewMode={viewMode} onSwitch={switchView} />
            <button
              onClick={() => { if (!isGlobalMode) setCreateOpen(true) }}
              disabled={isGlobalMode}
              className="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-[#FFC107] text-sm font-bold text-[#111] disabled:opacity-50 shadow-[0_4px_12px_rgba(255,193,7,0.3)] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">สร้างงานซ่อม</span>
            </button>
          </div>
        </div>
        {isGlobalMode && <GlobalModeBanner action="ไม่สามารถสร้างงานซ่อมในโหมดทุกสาขา" />}
        <div className="flex-1 min-h-0">
          <RepairKanbanBoard
            repairs={repairs}
            onOpenDetail={setSelectedRepairId}
            onPayment={(id) => setSelectedRepairId(id)}
            onPrint={(id) => printRepairReceipt(id, { paperWidth: '80mm' })}
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

  // ── List view — app style ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] -m-4 sm:-m-6 lg:-m-8 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1E293B] px-5 pb-4 pt-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] border-b border-transparent dark:border-slate-700/60 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[#111]">งานซ่อม</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLoading ? '...' : `${repairs.length} งานทั้งหมด`}
            </p>
          </div>
          <BranchContextBar className="hidden sm:flex" />
          <button
            onClick={() => setScanOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F8F9FB] text-slate-500 shrink-0"
            title="สแกน QR"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>
          <ViewToggle viewMode={viewMode} onSwitch={switchView} />
          <button
            onClick={() => { if (!isGlobalMode) setCreateOpen(true) }}
            disabled={isGlobalMode}
            className="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-[#FFC107] text-sm font-bold text-[#111] disabled:opacity-50 shadow-[0_4px_12px_rgba(255,193,7,0.3)] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">สร้างงานซ่อม</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, เบอร์, เลขงาน, IMEI, รุ่น..."
            className="h-11 w-full rounded-2xl bg-[#F8FAFC] dark:bg-slate-800 border border-slate-100 dark:border-slate-700 pl-11 pr-10 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {FILTER_TABS.map((tab) => {
            const count = statusCounts[tab.value] ?? 0
            const active = statusFilter === tab.value
            if (tab.value !== 'ALL' && count === 0) return null
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  'flex items-center gap-1.5 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
                  active ? 'bg-[#FFC107] text-[#111]' : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                )}
              >
                {tab.dot && !active && (
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', tab.dot)} />
                )}
                {tab.label}
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[16px] h-4 rounded-full px-1 text-[10px] font-bold',
                  active ? 'bg-[#111]/10 text-[#111]' : 'bg-slate-200 text-slate-500',
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 py-4">
        {STAT_CARDS.map((s) => {
          const count = statusCounts[s.value] ?? 0
          const active = statusFilter === s.value
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'shrink-0 rounded-2xl p-3 text-left transition-all min-w-[86px] active:scale-[0.97]',
                active
                  ? 'bg-[#FFC107] shadow-[0_4px_16px_rgba(255,193,7,0.4)]'
                  : 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]',
              )}
            >
              <p className="text-lg mb-1 leading-none">{s.icon}</p>
              <p className={cn(
                'text-2xl font-extrabold tabular-nums leading-none',
                active ? 'text-[#111]' : 'text-slate-800',
              )}>
                {isLoading ? '—' : count}
              </p>
              <p className={cn('text-[10px] mt-1 leading-tight', active ? 'text-[#111]/70' : 'text-slate-400')}>
                {s.label}
              </p>
            </button>
          )
        })}
      </div>

      {isGlobalMode && (
        <div className="px-5 mb-2">
          <GlobalModeBanner action="ไม่สามารถสร้างงานซ่อมในโหมดทุกสาขา" />
        </div>
      )}

      {/* ── Repair cards ─────────────────────────────────────────────────────── */}
      <div className="px-5 flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white dark:bg-[#1E293B] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800 rounded-full" />
                </div>
                <div className="h-6 w-16 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-[#1E293B] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Wrench className="h-8 w-8 text-slate-200 dark:text-slate-700" />
            </div>
            <p className="text-sm font-medium text-slate-400">{search ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีงานซ่อม'}</p>
            {!search && !isGlobalMode && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 h-10 px-5 rounded-2xl bg-[#FFC107] text-sm font-bold text-[#111] shadow-[0_4px_12px_rgba(255,193,7,0.3)]"
              >
                <Plus className="h-4 w-4" />รับงานซ่อมแรก
              </button>
            )}
          </div>
        ) : (
          filtered.map((repair) => {
            const isNew = (Date.now() - new Date(repair.receivedAt).getTime()) < 24 * 60 * 60 * 1000
            return (
              <button
                key={repair.id}
                onClick={() => setSelectedRepairId(repair.id)}
                className="flex items-center gap-3 rounded-2xl bg-white dark:bg-[#1E293B] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] border border-transparent dark:border-slate-700/60 active:scale-[0.98] transition-all text-left w-full hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.40)]"
              >
                {/* Icon avatar */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFC107]/10">
                  <Wrench className="h-5 w-5 text-[#FFC107]" strokeWidth={2.5} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wide">
                      {repair.ticketNumber}
                    </span>
                    {isNew && (
                      <span className="text-[9px] font-extrabold bg-[#FFC107] text-[#111] px-1.5 py-0.5 rounded-full leading-none">
                        ใหม่
                      </span>
                    )}
                    {(repair._count?.images ?? 0) > 0 && (
                      <Camera className="h-3 w-3 text-slate-300 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#111] truncate mt-0.5">
                    {repair.deviceBrand} {repair.deviceModel}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {repair.customer?.name ?? 'ไม่ระบุลูกค้า'}
                    {repair.customer?.phone && (
                      <span className="text-slate-400"> · {repair.customer.phone}</span>
                    )}
                  </p>
                  {repair.issue && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{repair.issue}</p>
                  )}
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <RepairStatusBadge status={repair.status} />
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    <span className="whitespace-nowrap">
                      {formatDistanceToNow(new Date(repair.receivedAt), { addSuffix: true, locale: th })}
                    </span>
                  </div>
                  <Link
                    href={`/repairs/${repair.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-300 hover:text-[#FFC107] transition-colors"
                    title="เปิด Workspace"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </button>
            )
          })
        )}
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

// ── ViewToggle ────────────────────────────────────────────────────────────────

function ViewToggle({ viewMode, onSwitch }: { viewMode: 'list' | 'board'; onSwitch: (v: 'list' | 'board') => void }) {
  return (
    <div className="flex items-center rounded-2xl bg-[#F8F9FB] p-1 gap-0.5 shrink-0">
      {(['list', 'board'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onSwitch(mode)}
          title={mode === 'list' ? 'แสดงแบบรายการ' : 'แสดงแบบบอร์ด'}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all',
            viewMode === mode
              ? 'bg-[#FFC107] text-[#111] shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {mode === 'list' ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  )
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

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

// ── Default export — Suspense boundary required by useSearchParams ─────────────

export default function RepairsPage() {
  return (
    <Suspense>
      <RepairsContent />
    </Suspense>
  )
}
