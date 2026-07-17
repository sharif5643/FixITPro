'use client'

import {
  useState, useMemo, useEffect, useRef,
} from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  useSensor, useSensors, useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Banknote, Printer, Package, ExternalLink, Wrench,
  ChevronDown, ChevronUp, User, AlertTriangle, UserCog, X, CalendarClock, Info,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn, formatThaiMoney } from '@/lib/utils'
import { getSLATier, formatSLAAge, SLA_CLS, SLA_DOT } from '@/lib/sla'
import { beepSuccess, beepError, haptic } from '@/lib/beep'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { TechnicianAvatar } from '@/components/ui/technician-avatar'
import type { Repair, RepairStatus } from '@/types'

// ── Column definitions (maps to DB status values) ────────────────────────────

export const KANBAN_COLUMNS: Array<{
  status: RepairStatus
  label: string
  accent: string  // Tailwind border-top color class
}> = [
  { status: 'RECEIVED',         label: 'รับงาน',          accent: 'border-t-blue-500' },
  { status: 'DIAGNOSING',       label: 'ตรวจสอบ',         accent: 'border-t-yellow-500' },
  { status: 'WAITING_APPROVAL', label: 'รออนุมัติ',       accent: 'border-t-amber-500' },
  { status: 'APPROVED',         label: 'อนุมัติแล้ว',     accent: 'border-t-teal-500' },
  { status: 'WAITING_PARTS',    label: 'รออะไหล่',        accent: 'border-t-orange-500' },
  { status: 'IN_PROGRESS',      label: 'กำลังซ่อม',       accent: 'border-t-purple-500' },
  { status: 'QC_PENDING',       label: 'รอ QC',            accent: 'border-t-indigo-500' },
  { status: 'COMPLETED',        label: 'ซ่อมเสร็จ',       accent: 'border-t-green-500' },
  { status: 'READY_PICKUP',     label: 'พร้อมรับเครื่อง', accent: 'border-t-emerald-500' },
  { status: 'DELIVERED',        label: 'ส่งคืนแล้ว',      accent: 'border-t-slate-400' },
]

const ACTIVE_STATUSES = KANBAN_COLUMNS.map((c) => c.status) as RepairStatus[]

// ── Status transition guard ───────────────────────────────────────────────────

export function canMoveStatus(
  repair: Repair,
  toStatus: RepairStatus,
  isOwner: boolean,
): { ok: boolean; reason?: string } {
  // Block moving out of CANCELLED for non-owners
  if (repair.status === 'CANCELLED' && ACTIVE_STATUSES.includes(toStatus) && !isOwner) {
    return { ok: false, reason: 'เฉพาะเจ้าของร้านเท่านั้นที่สามารถยกเลิกการยกเลิกงานได้' }
  }
  // Block COMPLETED/READY_PICKUP → DELIVERED unless paid
  if (['COMPLETED', 'READY_PICKUP'].includes(repair.status) && toStatus === 'DELIVERED' && repair.paymentStatus !== 'PAID') {
    return { ok: false, reason: 'ยังไม่ได้รับชำระเงิน — กรุณารับเงินก่อนส่งคืนสินค้า' }
  }
  // QC_PENDING: can only move via QC dialog (not drag-and-drop)
  if (repair.status === 'QC_PENDING' && (toStatus === 'COMPLETED' || toStatus === 'IN_PROGRESS')) {
    return { ok: false, reason: 'ใช้ปุ่ม QC เพื่อตรวจสอบและเปลี่ยนสถานะ' }
  }
  return { ok: true }
}

// ── Shared type ──────────────────────────────────────────────────────────────

interface TechUser { id: string; name: string }

// ── Technician queue bar ──────────────────────────────────────────────────────

function TechnicianQueueBar({
  repairs,
  filterTechId,
  onFilterChange,
}: {
  repairs: Repair[]
  filterTechId: string | null
  onFilterChange: (id: string | null) => void
}) {
  const workload = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>()
    repairs.forEach((r) => {
      if (!r.technician) return
      const entry = map.get(r.technician.id) ?? { name: r.technician.name, count: 0 }
      entry.count++
      map.set(r.technician.id, entry)
    })
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [repairs])

  const unassigned = useMemo(
    () => repairs.filter((r) => !r.technician && r.status !== 'DELIVERED' && r.status !== 'CANCELLED').length,
    [repairs],
  )

  if (workload.length === 0 && unassigned === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-3 shrink-0">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
        <User className="h-3 w-3" />
        ช่าง
      </span>

      <button
        onClick={() => onFilterChange(null)}
        className={cn(
          'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
          filterTechId === null
            ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-600'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600',
        )}
      >
        ทั้งหมด
      </button>

      {workload.map(({ id, name, count }) => (
        <button
          key={id}
          onClick={() => onFilterChange(filterTechId === id ? null : id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filterTechId === id
              ? 'bg-purple-600 text-white border-purple-600 dark:bg-purple-600 dark:border-purple-600'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600',
          )}
        >
          <TechnicianAvatar name={name} size="sm" />
          {name}
          <span className={cn(
            'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
            filterTechId === id ? 'bg-white text-purple-600 dark:bg-slate-900 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
          )}>
            {count}
          </span>
        </button>
      ))}

      {unassigned > 0 && (
        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
          <AlertTriangle className="h-3 w-3" />
          ยังไม่มีช่าง {unassigned} งาน
        </span>
      )}
    </div>
  )
}

// ── Repair card (draggable) ───────────────────────────────────────────────────

interface RepairCardProps {
  repair: Repair
  now: number
  isDragOverlay?: boolean
  techUsers: TechUser[]
  onOpenDetail: (id: string) => void
  onPayment: (id: string) => void
  onPrint: (id: string) => void
  onQc: (id: string) => void
  onAssignTech: (repairId: string, technicianId: string | null) => void
}

function RepairCard({
  repair,
  now,
  isDragOverlay = false,
  techUsers,
  onOpenDetail,
  onPayment,
  onPrint,
  onQc,
  onAssignTech,
}: RepairCardProps) {
  const [showTechPicker, setShowTechPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTechPicker) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowTechPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTechPicker])

  const currentUser = useAuthStore((s) => s.user)
  const isTechSelfAssign = currentUser?.role === 'TECHNICIAN' && !repair.technician

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: repair.id,
    data: { repair },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const tier        = getSLATier(repair.receivedAt, now)
  const ageText     = formatSLAAge(repair.receivedAt, now)
  const hasBalance  = repair.paymentStatus !== 'PAID'
  const hasParts    = (repair.parts?.length ?? 0) > 0
  const partsWaiting = repair.status === 'WAITING_PARTS'

  // Due date badge
  const dueBadge = useMemo(() => {
    if (!repair.dueDate) return null
    const due = new Date(repair.dueDate)
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const dueMs   = new Date(due).setHours(0, 0, 0, 0)
    const diffDays = Math.round((dueMs - todayMs) / 86_400_000)
    if (diffDays < 0)    return { label: `เกิน ${Math.abs(diffDays)} วัน`, cls: 'text-red-600 dark:text-red-400' }
    if (diffDays === 0)  return { label: 'นัดรับวันนี้', cls: 'text-amber-600 dark:text-amber-400' }
    if (diffDays === 1)  return { label: 'นัดรับพรุ่งนี้', cls: 'text-amber-500 dark:text-amber-400' }
    return { label: `นัดรับ ${format(due, 'd MMM', { locale: th })}`, cls: 'text-slate-500 dark:text-slate-400' }
  }, [repair.dueDate])

  const balance = useMemo(() => {
    if (!hasBalance) return 0
    const cost = repair.finalCost ?? repair.estimateCost ?? 0
    const paid = repair.paidAmount ?? repair.deposit ?? 0
    return Math.max(0, Number(cost) - Number(paid))
  }, [repair, hasBalance])

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...listeners, ...attributes })}
      className={cn(
        'bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm select-none',
        isDragOverlay
          ? 'opacity-95 shadow-xl rotate-1 cursor-grabbing ring-2 ring-blue-400 dark:ring-blue-600'
          : isDragging
            ? 'opacity-30 border-dashed cursor-grabbing'
            : 'card-lift cursor-grab active:cursor-grabbing hover:border-blue-300 dark:hover:border-blue-600',
      )}
    >
      {/* SLA accent bar */}
      <div className={cn('h-1 rounded-t-xl', {
        'bg-green-400': tier === 'green',
        'bg-amber-400': tier === 'yellow',
        'bg-red-500':   tier === 'red',
      })} />

      <div className="p-3 space-y-2">
        {/* Row 1: ticket + SLA age */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0">
            {repair.ticketNumber}
          </span>
          <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', SLA_CLS[tier])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', SLA_DOT[tier])} />
            {ageText}
          </span>
        </div>

        {/* Row 2: customer */}
        {repair.customer && (
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate leading-tight">
            {repair.customer.name}
          </p>
        )}

        {/* Row 3: device */}
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {repair.deviceBrand} {repair.deviceModel}
        </p>

        {/* Row 4: issue */}
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
          {repair.issue}
        </p>

        {/* Due date row */}
        {dueBadge && (
          <div className={cn('flex items-center gap-1 text-[10px] font-medium', dueBadge.cls)}>
            <CalendarClock className="h-3 w-3 shrink-0" />
            {dueBadge.label}
          </div>
        )}

        {/* Row 5: badges */}
        <div className="flex flex-wrap gap-1">
          {partsWaiting && (
            <span className="flex items-center gap-0.5 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 px-2 py-0.5 text-[10px] font-semibold">
              <Package className="h-2.5 w-2.5" />
              รออะไหล่
            </span>
          )}
          {!partsWaiting && hasParts && (
            <span className="flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-[10px]">
              <Package className="h-2.5 w-2.5" />
              {repair.parts.length} ชิ้น
            </span>
          )}
          {/* Assign technician badge/button */}
          <div className="relative" ref={pickerRef} onPointerDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowTechPicker((v) => !v)}
              className={cn(
                'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                repair.technician
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
              )}
            >
              {repair.technician ? (
                <><TechnicianAvatar name={repair.technician.name} size="xs" />{repair.technician.name}</>
              ) : (
                <><UserCog className="h-2.5 w-2.5" />เลือกช่าง</>
              )}
            </button>
            {showTechPicker && (
              <div className="absolute bottom-full left-0 mb-1 z-50 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 text-xs">
                {repair.technician && (
                  <button
                    onClick={() => { onAssignTech(repair.id, null); setShowTechPicker(false) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="h-3 w-3" /> ยกเลิกช่าง
                  </button>
                )}
                {techUsers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { onAssignTech(repair.id, t.id); setShowTechPicker(false) }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
                      repair.technician?.id === t.id && 'font-semibold text-purple-700 dark:text-purple-400',
                    )}
                  >
                    <TechnicianAvatar name={t.name} size="xs" />
                    {t.name}
                  </button>
                ))}
                {techUsers.length === 0 && (
                  <p className="px-3 py-2 text-slate-400 dark:text-slate-500">ไม่มีช่างในระบบ</p>
                )}
              </div>
            )}
          </div>
          {hasBalance && balance > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5 text-[10px] font-semibold">
              <Banknote className="h-2.5 w-2.5" />
              ค้าง {formatThaiMoney(balance)}
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div
          className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-700"
          onPointerDown={(e) => e.stopPropagation()} // prevent drag when clicking actions
        >
          {repair.status === 'QC_PENDING' && (
            <button
              onClick={() => onQc(repair.id)}
              className="flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 px-2 py-1 text-[10px] font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
            >
              <Wrench className="h-3 w-3" />
              QC
            </button>
          )}
          {hasBalance && repair.status !== 'QC_PENDING' && (
            <button
              onClick={() => onPayment(repair.id)}
              className="flex items-center gap-1 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 text-[10px] font-semibold hover:bg-green-100 dark:hover:bg-green-900/40 active:bg-green-200 dark:active:bg-green-900/60 transition-colors"
            >
              <Banknote className="h-3 w-3" />
              รับเงิน
            </button>
          )}
          <button
            onClick={() => onPrint(repair.id)}
            className="flex items-center gap-1 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
          >
            <Printer className="h-3 w-3" />
          </button>
          {isTechSelfAssign && (
            <button
              onClick={() => onAssignTech(repair.id, currentUser!.id)}
              className="flex items-center gap-1 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-2 py-1 text-[10px] font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
            >
              <UserCog className="h-3 w-3" />
              รับงานนี้
            </button>
          )}
          <button
            onClick={() => onOpenDetail(repair.id)}
            className="ml-auto flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 text-[10px] hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            รายละเอียด
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Kanban column (droppable) ─────────────────────────────────────────────────

interface KanbanColumnProps {
  status: RepairStatus
  label: string
  accent: string
  repairs: Repair[]
  now: number
  techUsers: TechUser[]
  onOpenDetail: (id: string) => void
  onPayment: (id: string) => void
  onPrint: (id: string) => void
  onQc: (id: string) => void
  onAssignTech: (repairId: string, technicianId: string | null) => void
}

function KanbanColumn({
  status, label, accent, repairs, now, techUsers,
  onOpenDetail, onPayment, onPrint, onQc, onAssignTech,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-xl border-2 border-t-4 bg-slate-50 dark:bg-slate-900/40 min-h-[200px] w-64 sm:w-72 shrink-0 transition-colors',
        accent,
        isOver ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 border-t-4' : '',
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-lg">
        <span className="text-sm font-bold text-slate-800 dark:text-white">{label}</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold px-1">
          {repairs.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-20rem)]">
        {repairs.length === 0 ? (
          <div className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 gap-2 text-slate-400 dark:text-slate-500 transition-colors',
            isOver ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700',
          )}>
            <Wrench className="h-6 w-6 opacity-30" />
            <p className="text-xs text-center">ไม่มีงานในสถานะนี้</p>
            {isOver && (
              <p className="text-xs text-blue-500 dark:text-blue-400 font-semibold">วางที่นี่</p>
            )}
          </div>
        ) : (
          repairs.map((repair) => (
            <RepairCard
              key={repair.id}
              repair={repair}
              now={now}
              techUsers={techUsers}
              onOpenDetail={onOpenDetail}
              onPayment={onPayment}
              onPrint={onPrint}
              onQc={onQc}
              onAssignTech={onAssignTech}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Cancelled section (collapsed) ─────────────────────────────────────────────

function CancelledSection({
  repairs,
  now,
  techUsers,
  onOpenDetail,
  onPayment,
  onPrint,
  onQc,
  onAssignTech,
}: {
  repairs: Repair[]
  now: number
  techUsers: TechUser[]
  onOpenDetail: (id: string) => void
  onPayment: (id: string) => void
  onPrint: (id: string) => void
  onQc: (id: string) => void
  onAssignTech: (repairId: string, technicianId: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (repairs.length === 0) return null

  return (
    <div className="shrink-0 border-t dark:border-slate-800 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-1 py-1 text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
      >
        {expanded
          ? <ChevronUp className="h-4 w-4" />
          : <ChevronDown className="h-4 w-4" />}
        งานยกเลิก ({repairs.length})
      </button>

      {expanded && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
          {repairs.map((r) => (
            <div key={r.id} className="w-64 sm:w-72 shrink-0 opacity-60">
              <RepairCard
                repair={r}
                now={now}
                techUsers={techUsers}
                onOpenDetail={onOpenDetail}
                onPayment={onPayment}
                onPrint={onPrint}
                onQc={onQc}
                onAssignTech={onAssignTech}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────

export interface RepairKanbanBoardProps {
  repairs: Repair[]
  onOpenDetail: (id: string) => void
  onPayment: (id: string) => void
  onPrint: (id: string) => void
  onQc: (id: string) => void
  /** Called after status change so parent can invalidate query if needed */
  onStatusChanged?: () => void
}

export function RepairKanbanBoard({
  repairs,
  onOpenDetail,
  onPayment,
  onPrint,
  onQc,
  onStatusChanged,
}: RepairKanbanBoardProps) {
  const qc      = useQueryClient()
  const user    = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'

  const [now, setNow] = useState(Date.now())
  const [activeRepair, setActiveRepair] = useState<Repair | null>(null)
  const [filterTechId, setFilterTechId] = useState<string | null>(null)

  const { data: techUsers = [] } = useQuery<TechUser[]>({
    queryKey: ['technicians-simple'],
    queryFn: () => api.get('/technicians').then((r) => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
  })

  const assignMutation = useMutation({
    mutationFn: ({ repairId, technicianId }: { repairId: string; technicianId: string | null }) =>
      api.patch(`/repairs/${repairId}`, { technicianId }),
    onSuccess: (_, vars) => {
      haptic(30)
      const patchCache = (key: unknown[]) => {
        qc.setQueryData<Repair[]>(key, (old) =>
          old?.map((r) => {
            if (r.id !== vars.repairId) return r
            const tech = vars.technicianId
              ? techUsers.find((t) => t.id === vars.technicianId)
              : undefined
            return { ...r, technician: tech ? { id: tech.id, name: tech.name } : undefined }
          }) ?? old,
        )
      }
      patchCache(['repairs', undefined])
      patchCache(['repairs', user?.branchId])
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'มอบหมายช่างไม่สำเร็จ')
    },
  })

  // Tick SLA timers every 60 s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // If current user is TECHNICIAN: only show their own + unassigned repairs
  const visibleRepairs = useMemo(() => {
    if (user?.role !== 'TECHNICIAN') return repairs
    return repairs.filter((r) => !r.technician || r.technician.id === user.id)
  }, [repairs, user])

  // Grouped by status (memoized)
  const grouped = useMemo(() => {
    const display = filterTechId
      ? visibleRepairs.filter((r) => r.technician?.id === filterTechId)
      : visibleRepairs

    const result: Record<string, Repair[]> = {}
    for (const col of KANBAN_COLUMNS) result[col.status] = []
    result['CANCELLED'] = []

    for (const r of display) {
      if (result[r.status]) {
        result[r.status].push(r)
      } else {
        result['RECEIVED'].push(r)
      }
    }
    return result
  }, [repairs, filterTechId])

  // DnD sensors — PointerSensor for desktop, TouchSensor for SUNMI/mobile
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // don't start drag on tap/click
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  )

  // Status update mutation
  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RepairStatus; previousStatus: RepairStatus }) =>
      api.patch(`/repairs/${id}`, { status }),
    onSuccess: () => {
      beepSuccess()
      haptic(40)
      onStatusChanged?.()
    },
    onError: (err: any, vars) => {
      beepError()
      // Rollback: restore previous status in query cache
      qc.setQueryData<Repair[]>(['repairs', undefined], (old) =>
        old?.map((r) => r.id === vars.id ? { ...r, status: vars.previousStatus } : r) ?? old,
      )
      qc.setQueryData<Repair[]>(['repairs', user?.branchId], (old) =>
        old?.map((r) => r.id === vars.id ? { ...r, status: vars.previousStatus } : r) ?? old,
      )
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'อัปเดตสถานะไม่สำเร็จ')
    },
  })

  function handleDragStart(event: DragStartEvent) {
    const r = event.active.data.current?.repair as Repair | undefined
    if (r) setActiveRepair(r)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveRepair(null)
    const { active, over } = event
    if (!over) return

    const toStatus    = over.id as RepairStatus
    const repair      = active.data.current?.repair as Repair
    if (!repair || repair.status === toStatus) return

    // Check transition rules
    const guard = canMoveStatus(repair, toStatus, isOwner)
    if (!guard.ok) {
      toast.error(guard.reason)
      beepError()
      return
    }

    const previousStatus = repair.status

    // Optimistic update — update every matching queryKey variant
    const patchCache = (key: unknown[]) => {
      qc.setQueryData<Repair[]>(key, (old) =>
        old?.map((r) => r.id === repair.id ? { ...r, status: toStatus } : r) ?? old,
      )
    }
    patchCache(['repairs', undefined])
    patchCache(['repairs', user?.branchId])

    moveMutation.mutate({ id: repair.id, status: toStatus, previousStatus })
  }

  return (
    <div className="flex flex-col h-full gap-0 min-h-0">
      {/* Technician queue */}
      <TechnicianQueueBar
        repairs={visibleRepairs}
        filterTechId={filterTechId}
        onFilterChange={setFilterTechId}
      />

      {/* Technician self-filter notice */}
      {user?.role === 'TECHNICIAN' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300 shrink-0">
          <Info className="h-4 w-4 shrink-0 text-blue-500" />
          <span>แสดงเฉพาะงานที่มอบหมายให้คุณ — <span className="font-bold">{visibleRepairs.length} งาน</span></span>
        </div>
      )}

      {/* Columns — horizontal scroll */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              accent={col.accent}
              repairs={grouped[col.status] ?? []}
              now={now}
              techUsers={techUsers}
              onOpenDetail={onOpenDetail}
              onPayment={onPayment}
              onPrint={onPrint}
              onQc={onQc}
              onAssignTech={(repairId, technicianId) => assignMutation.mutate({ repairId, technicianId })}
            />
          ))}
        </div>

        {/* Drag overlay — ghost card */}
        <DragOverlay dropAnimation={null}>
          {activeRepair && (
            <RepairCard
              repair={activeRepair}
              now={now}
              isDragOverlay
              techUsers={techUsers}
              onOpenDetail={() => {}}
              onPayment={() => {}}
              onPrint={() => {}}
              onQc={() => {}}
              onAssignTech={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Cancelled section */}
      <CancelledSection
        repairs={grouped['CANCELLED'] ?? []}
        now={now}
        techUsers={techUsers}
        onOpenDetail={onOpenDetail}
        onPayment={onPayment}
        onPrint={onPrint}
        onQc={onQc}
        onAssignTech={(repairId, technicianId) => assignMutation.mutate({ repairId, technicianId })}
      />
    </div>
  )
}
