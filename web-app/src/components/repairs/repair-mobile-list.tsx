'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowLeft, Search, SlidersHorizontal, Plus, Phone, User,
  Wrench, Package, Clock, CheckCircle2, XCircle, ChevronRight,
  Smartphone, X,
} from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import type { Repair, RepairStatus } from '@/types'

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: 'ALL',           label: 'ทั้งหมด'         },
  { value: 'RECEIVED',      label: 'รอรับเครื่อง'    },
  { value: 'IN_PROGRESS',   label: 'กำลังซ่อม'       },
  { value: 'WAITING_PARTS', label: 'รออะไหล่'         },
  { value: 'READY_PICKUP',  label: 'ซ่อมเสร็จ รอรับ' },
  { value: 'DELIVERED',     label: 'ส่งมอบแล้ว'      },
] as const

type TabValue = typeof STATUS_TABS[number]['value']

const STATUS_BADGE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  RECEIVED:         { label: 'รอรับเครื่อง',    icon: Clock,         cls: 'bg-orange-50 text-orange-600 border-orange-100'   },
  DIAGNOSING:       { label: 'ตรวจวินิจฉัย',   icon: Search,        cls: 'bg-yellow-50 text-yellow-700 border-yellow-100'   },
  WAITING_APPROVAL: { label: 'รออนุมัติ',       icon: Clock,         cls: 'bg-amber-50 text-amber-700 border-amber-100'      },
  APPROVED:         { label: 'อนุมัติแล้ว',     icon: CheckCircle2,  cls: 'bg-teal-50 text-teal-700 border-teal-100'         },
  WAITING_PARTS:    { label: 'รออะไหล่',         icon: Package,       cls: 'bg-purple-50 text-purple-700 border-purple-100'   },
  IN_PROGRESS:      { label: 'กำลังซ่อม',       icon: Wrench,        cls: 'bg-blue-50 text-blue-600 border-blue-100'         },
  QC_PENDING:       { label: 'รอ QC',            icon: Clock,         cls: 'bg-indigo-50 text-indigo-700 border-indigo-100'   },
  COMPLETED:        { label: 'ซ่อมเสร็จ',       icon: CheckCircle2,  cls: 'bg-green-50 text-green-700 border-green-100'      },
  READY_PICKUP:     { label: 'ซ่อมเสร็จ รอรับ', icon: CheckCircle2,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  DELIVERED:        { label: 'ปิดงานแล้ว',      icon: CheckCircle2,  cls: 'bg-slate-50 text-slate-500 border-slate-200'      },
  CANCELLED:        { label: 'ยกเลิก',           icon: XCircle,       cls: 'bg-red-50 text-red-600 border-red-100'            },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    return format(d, 'd MMM yy · HH:mm', { locale: th })
  } catch { return '' }
}

function waitDays(iso: string) {
  try { return differenceInDays(new Date(), new Date(iso)) } catch { return 0 }
}

function techInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ── Repair Card ────────────────────────────────────────────────────────────────

function RepairCard({ repair, onClick }: { repair: Repair; onClick: () => void }) {
  const badge   = STATUS_BADGE[repair.status] ?? STATUS_BADGE['RECEIVED']
  const BadgeIcon = badge.icon
  const imgUrl  = repair.images?.[0]?.url
  const price   = repair.finalCost ?? repair.estimateCost ?? repair.estimatedTotal
  const days    = (repair.status === 'READY_PICKUP' || repair.status === 'COMPLETED') ? waitDays(repair.receivedAt) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-slate-100 px-4 py-3.5 flex gap-3 shadow-sm active:bg-slate-50 transition-colors"
    >
      {/* Device image */}
      <div className="shrink-0 h-[72px] w-[72px] rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center">
        {imgUrl ? (
          <img src={imgUrl} alt={repair.deviceModel} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1">
            <Smartphone className="h-7 w-7 text-slate-300" />
            <span className="text-[9px] text-slate-300 font-medium leading-none">
              {repair.deviceBrand.slice(0, 6)}
            </span>
          </div>
        )}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        {/* Ticket + status row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-bold text-blue-600 leading-tight truncate">
            {repair.ticketNumber}
          </p>
          <div className={cn(
            'shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-none',
            badge.cls,
          )}>
            <BadgeIcon className="h-2.5 w-2.5" />
            {badge.label}
          </div>
        </div>

        {/* Device */}
        <p className="text-[12px] font-semibold text-slate-800 mt-0.5 leading-tight truncate">
          {repair.deviceBrand} {repair.deviceModel}
          {repair.deviceColor ? ` · ${repair.deviceColor}` : ''}
        </p>
        <p className="text-[11px] text-slate-500 leading-tight truncate">{repair.issue}</p>

        {/* Customer */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[11px] text-slate-600 min-w-0">
            <User className="h-3 w-3 text-slate-400 shrink-0" />
            <span className="truncate">{repair.customer?.name ?? '—'}</span>
          </span>
          {repair.customer?.phone && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
              <Phone className="h-3 w-3 text-slate-400" />
              {repair.customer.phone}
            </span>
          )}
        </div>

        {/* Bottom row: date + price + tech + days */}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 leading-tight">
              วันที่รับ {fmtDate(repair.receivedAt)}
            </p>
            {price != null && price > 0 && (
              <p className="text-[11px] font-semibold text-rose-600 leading-tight mt-0.5">
                {repair.finalCost != null ? 'ราคาตกลง: ' : 'ประเมินราคา: '}
                {formatThaiMoney(price)}
              </p>
            )}
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            {/* Technician avatar */}
            {repair.technician && (
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <span className="text-white text-[8px] font-bold">{techInitials(repair.technician.name)}</span>
              </div>
            )}
            {/* Days waiting for pickup */}
            {days > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[9px] font-semibold px-2 py-0.5 rounded-full leading-none">
                รอรับ {days} วัน
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="shrink-0 self-center">
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  repairs: Repair[]
  isLoading: boolean
  statusFilter: RepairStatus | 'ALL'
  setStatusFilter: (s: RepairStatus | 'ALL') => void
  search: string
  setSearch: (s: string) => void
  onOpenRepair: (id: string) => void
  onCreateRepair: () => void
  statusCounts: Record<string, number>
}

export function RepairMobileList({
  repairs, isLoading,
  statusFilter, setStatusFilter,
  search, setSearch,
  onOpenRepair, onCreateRepair,
  statusCounts,
}: Props) {
  const [searchVisible, setSearchVisible] = useState(!!search)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchVisible) searchRef.current?.focus()
  }, [searchVisible])

  // Filter repairs
  const filtered = repairs.filter((r) => {
    const tabMatch = statusFilter === 'ALL' || r.status === statusFilter
    if (!tabMatch) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.ticketNumber.toLowerCase().includes(q) ||
      r.customer?.name?.toLowerCase().includes(q) ||
      r.customer?.phone?.includes(q) ||
      r.deviceBrand.toLowerCase().includes(q) ||
      r.deviceModel.toLowerCase().includes(q) ||
      r.issue.toLowerCase().includes(q)
    )
  })

  const total = statusCounts['ALL'] ?? repairs.length

  return (
    <div className="bg-slate-100 min-h-screen pb-24 flex flex-col">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </Link>
          <h1 className="text-[17px] font-bold text-slate-800">งานซ่อม</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setSearchVisible(v => !v); if (searchVisible) setSearch('') }}
            className="p-2 rounded-xl hover:bg-slate-100"
          >
            {searchVisible
              ? <X className="h-5 w-5 text-slate-500" />
              : <Search className="h-5 w-5 text-slate-600" />
            }
          </button>
          <button className="p-2 rounded-xl hover:bg-slate-100">
            <SlidersHorizontal className="h-5 w-5 text-slate-600" />
          </button>
          <button
            onClick={onCreateRepair}
            className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shadow-sm shadow-blue-500/30 active:bg-blue-700"
          >
            <Plus className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Status chips ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-2.5">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {STATUS_TABS.map((tab) => {
            const count = tab.value === 'ALL' ? total : (statusCounts[tab.value] ?? 0)
            const active = statusFilter === tab.value
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value as RepairStatus | 'ALL')}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-colors',
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
                )}
              >
                {tab.label}
                <span className={cn(
                  'text-[11px] font-bold min-w-[16px] text-center',
                  active ? 'text-blue-100' : 'text-slate-400',
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Search bar (collapsible) ── */}
      {searchVisible && (
        <div className="bg-white border-b border-slate-100 px-4 py-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาเลขที่งาน / ชื่อลูกค้า / รุ่นเครื่อง / เบอร์โทร"
              className="w-full pl-9 pr-4 py-2.5 text-[13px] rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Card list ── */}
      <div className="flex-1 px-4 pt-3 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-[110px] animate-pulse border border-slate-100" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Wrench className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400 font-medium">ไม่พบงานซ่อม</p>
          </div>
        ) : (
          filtered.map((repair) => (
            <RepairCard
              key={repair.id}
              repair={repair}
              onClick={() => onOpenRepair(repair.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
