'use client'

import dynamic from 'next/dynamic'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, AlertCircle, Clock, CheckCircle2, Inbox } from 'lucide-react'
import { format, isToday, isTomorrow, isPast, startOfDay, addDays, isWithinInterval } from 'date-fns'
import { th } from 'date-fns/locale'
import { PageHeader } from '@/components/ui/page-header'
import { RepairStatusBadge } from '@/components/ui/status-badge'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { useBranchContext } from '@/hooks/useBranchContext'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Repair } from '@/types'

const RepairDetailDialog = dynamic(
  () => import('@/components/repairs/repair-detail-dialog').then((m) => ({ default: m.RepairDetailDialog })),
  { ssr: false },
)

// ── Group types ───────────────────────────────────────────────────────────────

type Group = { key: string; label: string; icon: React.ElementType; color: string; items: Repair[] }

function groupRepairs(repairs: Repair[]): Group[] {
  const now  = new Date()
  const bod  = startOfDay(now)
  const eow  = addDays(bod, 7)

  const overdue:  Repair[] = []
  const today:    Repair[] = []
  const tomorrow: Repair[] = []
  const thisWeek: Repair[] = []
  const later:    Repair[] = []

  for (const r of repairs) {
    if (!r.dueDate) continue
    if (['DELIVERED', 'CANCELLED'].includes(r.status)) continue
    const d = new Date(r.dueDate)
    if (isPast(d) && !isToday(d))               overdue.push(r)
    else if (isToday(d))                         today.push(r)
    else if (isTomorrow(d))                      tomorrow.push(r)
    else if (isWithinInterval(d, { start: bod, end: eow })) thisWeek.push(r)
    else                                         later.push(r)
  }

  return [
    { key: 'overdue',   label: 'เกินกำหนด',     icon: AlertCircle,  color: 'text-red-600',    items: overdue   },
    { key: 'today',     label: 'วันนี้',          icon: Clock,        color: 'text-orange-600', items: today     },
    { key: 'tomorrow',  label: 'พรุ่งนี้',        icon: CalendarDays, color: 'text-yellow-600', items: tomorrow  },
    { key: 'this_week', label: 'สัปดาห์นี้',      icon: CalendarDays, color: 'text-blue-600',   items: thisWeek  },
    { key: 'later',     label: 'ต่อไป',           icon: CheckCircle2, color: 'text-slate-500',  items: later     },
  ].filter((g) => g.items.length > 0)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const { branchId } = useBranchContext()
  const queryClient  = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function isSafeBranchId(id: string | undefined): id is string {
    return typeof id === 'string' && id.length > 0 && id !== 'null' && id !== 'all'
  }

  const { data: repairs = [], isLoading } = useQuery<Repair[]>({
    queryKey: ['repairs', branchId, 'all'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (isSafeBranchId(branchId)) params.set('branchId', branchId)
      return (await api.get(`/repairs?${params.toString()}`)).data
    },
  })

  const groups = useMemo(() => groupRepairs(repairs), [repairs])
  const totalWithDue = useMemo(() => repairs.filter((r) => r.dueDate && !['DELIVERED', 'CANCELLED'].includes(r.status)).length, [repairs])

  return (
    <div className="space-y-4">
      <PageHeader
        title="รายการนัดหมาย"
        icon={CalendarDays}
        subtitle={`${totalWithDue} รายการที่มีวันนัด`}
        secondaryActions={<BranchContextBar className="hidden sm:flex" />}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
            <Inbox className="h-8 w-8 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">ยังไม่มีรายการนัดหมาย</p>
            <p className="text-sm text-muted-foreground mt-1">งานซ่อมที่มีการกำหนดวันนัดรับจะแสดงที่นี่</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <GroupSection key={group.key} group={group} onSelect={setSelectedId} />
          ))}
        </div>
      )}

      <RepairDetailDialog
        repairId={selectedId}
        onClose={() => setSelectedId(null)}
        onStatusChange={() => queryClient.invalidateQueries({ queryKey: ['repairs'] })}
      />
    </div>
  )
}

// ── Group section ─────────────────────────────────────────────────────────────

function GroupSection({ group, onSelect }: { group: Group; onSelect: (id: string) => void }) {
  const Icon = group.icon

  const headerBg: Record<string, string> = {
    overdue:   'bg-red-50 border-red-200',
    today:     'bg-orange-50 border-orange-200',
    tomorrow:  'bg-yellow-50 border-yellow-200',
    this_week: 'bg-blue-50 border-blue-200',
    later:     'bg-slate-50 border-slate-200',
  }

  return (
    <div>
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border mb-3 w-fit', headerBg[group.key])}>
        <Icon className={cn('h-4 w-4', group.color)} />
        <span className={cn('text-sm font-semibold', group.color)}>{group.label}</span>
        <span className="text-xs text-muted-foreground">({group.items.length})</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {group.items.map((repair) => (
          <RepairReminderCard key={repair.id} repair={repair} onSelect={onSelect} isOverdue={group.key === 'overdue'} />
        ))}
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function RepairReminderCard({ repair, onSelect, isOverdue }: { repair: Repair; onSelect: (id: string) => void; isOverdue: boolean }) {
  return (
    <button
      onClick={() => onSelect(repair.id)}
      className={cn(
        'w-full text-left bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all group',
        isOverdue && 'border-red-200 hover:border-red-300',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-bold text-blue-700">{repair.ticketNumber}</span>
        <RepairStatusBadge status={repair.status} />
      </div>

      <p className="font-semibold text-slate-900 text-sm leading-tight">
        {repair.customer?.name ?? 'ไม่ระบุลูกค้า'}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {repair.deviceBrand} {repair.deviceModel}
      </p>
      <p className="text-xs text-slate-500 line-clamp-1 mt-1">{repair.issue}</p>

      {repair.dueDate && (
        <div className={cn(
          'flex items-center gap-1.5 mt-2.5 pt-2 border-t text-xs font-medium',
          isOverdue ? 'text-red-600 border-red-100' : 'text-slate-500 border-slate-100',
        )}>
          <CalendarDays className="h-3 w-3 shrink-0" />
          นัดรับ: {format(new Date(repair.dueDate), 'eeee d MMM yyyy', { locale: th })}
        </div>
      )}

      {repair.technician && (
        <p className="text-[10px] text-muted-foreground mt-1">ช่าง: {repair.technician.name}</p>
      )}
    </button>
  )
}
