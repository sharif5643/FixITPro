'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  TrendingUp, TrendingDown, Wrench, Package, AlertTriangle, Clock,
  CheckCircle, ShoppingCart, Users, Banknote, ArrowRight, RefreshCw,
  AlertCircle, Wallet, Send, ClipboardList, Building2, Shield,
  Bell, Activity, ChevronRight, Filter, BarChart2, ArrowRightLeft, Settings2,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import type { OperationalAlert } from '@/components/alerts/operational-alert-center'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  period: { startDate: string; endDate: string }
  finance: {
    totalRevenue: number; salesRevenue: number; salesCount: number
    repairRevenue: number; repairCount: number; packageRevenue: number
    packageCount: number; totalExpenses: number; netProfit: number
    cashIn: number; transferIn: number
  }
  repairOps: {
    openRepairs: number; waitingApproval: number; waitingParts: number
    inProgress: number; completedNotDelivered: number; overdueRepairs: number
    unpaidDebtTotal: number; unpaidDebtCount: number
  }
  stock: { outOfStock: number; lowStock: number }
  warranties: { active: number; expiringSoon: number }
  notifications: {
    unreadCount: number
    latest: {
      id: string; type: string; title: string; message: string
      severity: string; createdAt: string; entityType: string | null; entityId: string | null
    }[]
  }
  topProducts: { name: string; sku: string; qty: number; revenue: number }[]
  topTechnicians: { id: string; name: string; repairCount: number; repairRevenue: number }[]
  branchPerformance: {
    branchId: string; name: string; salesRevenue: number
    repairRevenue: number; totalRevenue: number
  }[]
  weeklyRevenue: { date: string; sales: number; repairs: number; packages: number; total: number }[]
  recentActivities: {
    id: string; action: string; entityType: string | null; actorName: string | null; createdAt: string
  }[]
  currentShift: {
    isOpen: boolean; openedAt: string | null; userName: string | null
    userRole: string | null; openBalance: number
  }
  alerts: {
    overdueRepairs: number; unpaidRepairs: number; unpaidDebt: number
    outOfStock: number; lowStock: number; expiringWarranties: number
    pendingClaims: number; overdueSuppliers: number; apOutstanding: number
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const roleLabel: Record<string, string> = {
  OWNER: 'เจ้าของ', MANAGER: 'ผู้จัดการ', CASHIER: 'แคชเชียร์',
  TECHNICIAN: 'ช่างซ่อม', STOCK_STAFF: 'สต็อก',
}

const actionLabel: Record<string, string> = {
  SALE_CREATED: 'บันทึกการขาย', REPAIR_CREATED: 'รับงานซ่อม',
  REPAIR_STATUS_CHANGED: 'อัปเดตสถานะ', REPAIR_COMPLETED: 'ซ่อมเสร็จ',
  REPAIR_PAID: 'รับชำระซ่อม', EXPENSE_CREATED: 'บันทึกค่าใช้จ่าย',
  USER_CREATED: 'สร้างผู้ใช้งาน', USER_BRANCH_ASSIGNED: 'กำหนดสาขา',
  USER_ROLE_CHANGED: 'เปลี่ยนตำแหน่ง', SHIFT_OPENED: 'เปิดกะ',
  SHIFT_CLOSED: 'ปิดกะ', ROLE_PERMISSIONS_SET: 'ตั้งค่าสิทธิ์',
  STOCK_ADJUSTED: 'ปรับสต็อก', CUSTOMER_CREATED: 'สร้างลูกค้า',
}

const severityColor: Record<string, string> = {
  INFO: 'bg-blue-100 text-blue-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  ERROR: 'bg-red-100 text-red-800',
  CRITICAL: 'bg-red-600 text-white',
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const thaiTime = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm', { locale: th }) } catch { return '' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-sm font-semibold text-slate-700 mb-3 ${className}`}>{children}</h3>
  )
}

function StatCard({
  label, value, sub, icon: Icon, color, urgent, href, loading,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType
  color: string; urgent?: boolean; href?: string; loading?: boolean
}) {
  const inner = (
    <Card className={`border h-full ${urgent ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-slate-300'} transition-colors`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-medium truncate ${urgent ? 'text-red-600' : 'text-muted-foreground'}`}>
              {label}
            </p>
            {loading ? (
              <div className="h-7 w-24 bg-slate-200 rounded animate-pulse mt-1" />
            ) : (
              <p className={`text-2xl font-bold mt-1 tracking-tight ${urgent ? 'text-red-700' : ''}`}>
                {value}
              </p>
            )}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{sub}</p>
            )}
          </div>
          <div className={`rounded-xl p-2.5 ${color} flex-shrink-0 mt-0.5`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  if (href) return <Link href={href} className="block h-full">{inner}</Link>
  return inner
}

function SkeletonCard() {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
            <div className="h-7 w-24 bg-slate-200 rounded animate-pulse" />
            <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="h-9 w-9 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}

function WeeklyChart({ data }: { data: DashboardOverview['weeklyRevenue'] }) {
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <div className="flex items-end gap-1.5 h-28 pt-2">
      {data.map(d => {
        const totalH  = Math.max((d.total / max) * 88, d.total > 0 ? 4 : 0)
        const repairH = Math.max((d.repairs / max) * 88, d.repairs > 0 ? 2 : 0)
        const salesH  = Math.max(totalH - repairH, 0)
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end" style={{ height: 88 }}>
              <div className="w-full bg-orange-400 rounded-t-none" style={{ height: repairH }}
                title={`ซ่อม ${formatThaiMoney(d.repairs)}`} />
              <div className="w-full bg-emerald-500" style={{ height: salesH }}
                title={`ขาย ${formatThaiMoney(d.sales)}`} />
            </div>
            <span className="text-[10px] text-slate-400">{shortDate(d.date)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Dashboard Reminder Widget ─────────────────────────────────────────────────

interface ReminderSummaryItem { type: string; entityId: string }

function DashboardReminderWidget() {
  const user    = useAuthStore((s) => s.user)
  const hasPerm = useAuthStore((s) => s.hasPermission)

  const { data: alerts = [] } = useQuery<OperationalAlert[]>({
    queryKey: ['operational-alerts', user?.branchId],
    queryFn:  async () => (await api.get('/alerts/operational')).data,
    enabled:  hasPerm('notification.view'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Phase 16: new reminder summary from server-side endpoint
  const { data: reminderData } = useQuery<{ items: ReminderSummaryItem[] }>({
    queryKey: ['reminders', 'active', user?.id, 'dashboard'],
    queryFn:  async () => (await api.get('/reminders/active')).data,
    enabled:  hasPerm('notification.view'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const reminderItems = reminderData?.items ?? []

  // Existing operational alert counts
  const repairOverdue   = alerts.filter(a => a.type === 'REPAIR_OVERDUE').length
  const transferPending = alerts.filter(a => a.type === 'TRANSFER_PENDING').length
  const transferTransit = alerts.filter(a => a.type === 'TRANSFER_IN_TRANSIT').length

  // Phase 16 counts (from /reminders/active, deduplicated)
  const vipCount      = reminderItems.filter(r => r.type === 'VIP_REPAIR').length
  const urgentCount   = reminderItems.filter(r => r.type === 'URGENT_REPAIR').length
  const partsCount    = reminderItems.filter(r => r.type === 'PARTS_REQUEST_PENDING').length
  const pickupCount   = reminderItems.filter(r => r.type === 'PICKUP_WAITING').length
  const totalUrgent   = vipCount + urgentCount  // combine VIP + urgent under one chip

  const total = repairOverdue + transferPending + transferTransit + totalUrgent + partsCount + pickupCount
  if (total === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-semibold text-amber-800">สิ่งที่ต้องดำเนินการ</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {/* Existing chips */}
        {repairOverdue > 0 && (
          <Link href="/repairs" className="flex items-center gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2 hover:bg-amber-50 transition-colors">
            <Wrench className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-sm text-slate-700">งานซ่อมค้าง</span>
            <Badge className="bg-red-600 text-white text-xs ml-1">{repairOverdue} งาน</Badge>
          </Link>
        )}
        {transferPending > 0 && (
          <Link href="/transfers" className="flex items-center gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2 hover:bg-amber-50 transition-colors">
            <ArrowRightLeft className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-slate-700">คำขอโอนรออนุมัติ</span>
            <Badge className="bg-amber-500 text-white text-xs ml-1">{transferPending} รายการ</Badge>
          </Link>
        )}
        {transferTransit > 0 && (
          <Link href="/transfers" className="flex items-center gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2 hover:bg-amber-50 transition-colors">
            <Send className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-sm text-slate-700">สินค้ารอรับ</span>
            <Badge className="bg-blue-600 text-white text-xs ml-1">{transferTransit} รายการ</Badge>
          </Link>
        )}
        {/* Phase 16 chips */}
        {totalUrgent > 0 && (
          <Link href="/repairs?filter=urgent" className="flex items-center gap-2 rounded-lg bg-white border border-red-200 px-3 py-2 hover:bg-red-50 transition-colors">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-sm text-slate-700">งานซ่อมเร่งด่วน</span>
            <Badge className="bg-red-600 text-white text-xs ml-1">{totalUrgent} งาน</Badge>
          </Link>
        )}
        {partsCount > 0 && (
          <Link href="/repairs?filter=waiting_parts" className="flex items-center gap-2 rounded-lg bg-white border border-orange-200 px-3 py-2 hover:bg-orange-50 transition-colors">
            <Settings2 className="h-4 w-4 text-orange-600 shrink-0" />
            <span className="text-sm text-slate-700">รอชิ้นส่วน</span>
            <Badge className="bg-orange-500 text-white text-xs ml-1">{partsCount} งาน</Badge>
          </Link>
        )}
        {pickupCount > 0 && (
          <Link href="/repairs?filter=completed" className="flex items-center gap-2 rounded-lg bg-white border border-green-200 px-3 py-2 hover:bg-green-50 transition-colors">
            <Clock className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm text-slate-700">รอรับเครื่อง</span>
            <Badge className="bg-green-600 text-white text-xs ml-1">{pickupCount} งาน</Badge>
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const isOwner = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const { branchId: contextBranchId } = useBranchContext()

  const thaiNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const todayStr = thaiNow.toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate]     = useState(todayStr)

  const queryParams = useMemo(() => {
    const p: Record<string, string> = { startDate, endDate }
    if (contextBranchId) p.branchId = contextBranchId
    return p
  }, [startDate, endDate, contextBranchId])

  const { data, isLoading, dataUpdatedAt, refetch, isRefetching } = useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview', queryParams],
    queryFn: async () => {
      const res = await api.get('/dashboard/overview', { params: queryParams })
      return res.data
    },
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const f     = data?.finance
  const ops   = data?.repairOps
  const alerts = data?.alerts
  const shift  = data?.currentShift
  const notif  = data?.notifications

  const totalAlerts =
    (alerts?.overdueRepairs ?? 0) +
    (alerts?.unpaidRepairs ?? 0) +
    (alerts?.outOfStock ?? 0) +
    (alerts?.pendingClaims ?? 0) +
    (alerts?.overdueSuppliers ?? 0) +
    (alerts?.expiringWarranties ?? 0)

  const updatedLabel = dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm') : null
  const isToday = startDate === endDate && startDate === todayStr
  const periodLabel = isToday
    ? format(new Date(), "EEEEที่ d MMMM yyyy", { locale: th })
    : `${startDate} ถึง ${endDate}`

  return (
    <div className="space-y-5 max-w-7xl pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">แดชบอร์ด</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 capitalize">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchContextBar />
          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }}
              className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-xs text-slate-400">–</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {/* Today shortcut */}
          {!isToday && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => { setStartDate(todayStr); setEndDate(todayStr) }}>
              วันนี้
            </Button>
          )}
          {updatedLabel && <span className="text-xs text-slate-400">อัปเดต {updatedLabel}</span>}
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"
            onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── สิ่งที่ต้องดำเนินการ ─────────────────────────────────────────────── */}
      <DashboardReminderWidget />

      {/* ── SECTION: การเงินวันนี้ ───────────────────────────────────────────── */}
      <div>
        <SectionTitle>การเงิน{isToday ? 'วันนี้' : ''}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                label="รายรับรวม"
                value={formatThaiMoney(f?.totalRevenue ?? 0)}
                sub={`ขาย ${f?.salesCount ?? 0} · ซ่อม ${f?.repairCount ?? 0}`}
                icon={TrendingUp} color="bg-emerald-500" href="/reports"
              />
              <StatCard
                label="ยอดขาย (POS)"
                value={formatThaiMoney(f?.salesRevenue ?? 0)}
                sub={`${f?.salesCount ?? 0} บิล`}
                icon={ShoppingCart} color="bg-blue-500" href="/sales"
              />
              <StatCard
                label="รายรับซ่อม"
                value={formatThaiMoney(f?.repairRevenue ?? 0)}
                sub={`${f?.repairCount ?? 0} ใบงาน`}
                icon={Wrench} color="bg-orange-500" href="/repairs"
              />
              <StatCard
                label="ค่าใช้จ่าย"
                value={formatThaiMoney(f?.totalExpenses ?? 0)}
                sub="ไม่รวม COGS"
                icon={TrendingDown} color="bg-rose-500" href="/expenses"
              />
              <StatCard
                label="กำไรสุทธิ"
                value={formatThaiMoney(f?.netProfit ?? 0)}
                sub={`เงินสด ${formatThaiMoney(f?.cashIn ?? 0)}`}
                icon={Banknote}
                color={(f?.netProfit ?? 0) >= 0 ? 'bg-teal-500' : 'bg-red-500'}
                urgent={(f?.netProfit ?? 0) < 0}
              />
              <StatCard
                label="แจ้งเตือน"
                value={String(totalAlerts)}
                sub={totalAlerts > 0 ? 'ต้องดำเนินการ' : 'ทุกอย่างปกติ'}
                icon={AlertTriangle}
                color={totalAlerts > 0 ? 'bg-red-500' : 'bg-slate-400'}
                urgent={totalAlerts > 0}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Row 2: Repairs + Weekly Chart + Alerts ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* งานซ่อม */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">สถานะงานซ่อม</CardTitle>
              <Link href="/repairs">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />
              ))
            ) : (
              [
                { label: 'รออนุมัติใบเสนอ', count: ops?.waitingApproval ?? 0, color: 'bg-yellow-100 text-yellow-800', urgent: (ops?.waitingApproval ?? 0) > 0 },
                { label: 'รออะไหล่',        count: ops?.waitingParts ?? 0,     color: 'bg-blue-100 text-blue-800',   urgent: false },
                { label: 'กำลังซ่อม',       count: ops?.inProgress ?? 0,       color: 'bg-indigo-100 text-indigo-800', urgent: false },
                { label: 'เสร็จแล้ว รอส่ง', count: ops?.completedNotDelivered ?? 0, color: 'bg-emerald-100 text-emerald-800', urgent: (ops?.completedNotDelivered ?? 0) > 0 },
                { label: 'เกินกำหนด',       count: ops?.overdueRepairs ?? 0,   color: 'bg-red-100 text-red-800',     urgent: (ops?.overdueRepairs ?? 0) > 0 },
              ].map(row => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    row.urgent && row.count > 0 ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {row.urgent && row.count > 0 && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <span className="text-sm">{row.label}</span>
                  </div>
                  <Badge variant="outline" className={`text-xs font-bold ${row.color}`}>{row.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* รายรับ 7 วัน */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">รายรับ 7 วัน</CardTitle>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />ขาย
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-400" />ซ่อม
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="h-28 bg-slate-100 rounded animate-pulse" />
            ) : data?.weeklyRevenue ? (
              <>
                <WeeklyChart data={data.weeklyRevenue} />
                <div className="mt-3 pt-3 border-t flex justify-between items-center">
                  <span className="text-xs text-slate-500">รวม 7 วัน</span>
                  <span className="text-sm font-bold text-emerald-700">
                    {formatThaiMoney(data.weeklyRevenue.reduce((s, d) => s + d.total, 0))}
                  </span>
                </div>
              </>
            ) : (
              <div className="h-28 flex items-center justify-center text-sm text-slate-400">ไม่มีข้อมูล</div>
            )}
          </CardContent>
        </Card>

        {/* แจ้งเตือนด่วน */}
        <Card className={totalAlerts > 0 ? 'border-red-200' : ''}>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">แจ้งเตือนด่วน</CardTitle>
              {totalAlerts > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : totalAlerts === 0 ? (
              <div className="flex flex-col items-center py-6 text-center gap-2">
                <CheckCircle className="h-8 w-8 text-emerald-400" />
                <p className="text-sm text-slate-500">ทุกอย่างเรียบร้อย</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(alerts?.overdueRepairs ?? 0) > 0 && (
                  <Link href="/repairs">
                    <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-3 py-2 hover:bg-red-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-red-600" />
                        <span className="text-sm font-medium text-red-800">งานซ่อมเกินกำหนด</span>
                      </div>
                      <Badge className="bg-red-600 text-white text-xs">{alerts?.overdueRepairs}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.unpaidRepairs ?? 0) > 0 && (
                  <Link href="/repairs">
                    <div className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 hover:bg-orange-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5 text-orange-600" />
                        <span className="text-sm font-medium text-orange-800">รอรับเงิน (ซ่อมเสร็จ)</span>
                      </div>
                      <Badge className="bg-orange-500 text-white text-xs">{alerts?.unpaidRepairs}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.outOfStock ?? 0) > 0 && (
                  <Link href="/products">
                    <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-3 py-2 hover:bg-red-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-red-600" />
                        <span className="text-sm font-medium text-red-800">สินค้าหมด</span>
                      </div>
                      <Badge className="bg-red-600 text-white text-xs">{alerts?.outOfStock}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.lowStock ?? 0) > 0 && (
                  <Link href="/products">
                    <div className="flex items-center justify-between rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 hover:bg-yellow-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-800">สินค้าใกล้หมด</span>
                      </div>
                      <Badge className="bg-yellow-500 text-white text-xs">{alerts?.lowStock}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.expiringWarranties ?? 0) > 0 && (
                  <Link href="/warranties">
                    <div className="flex items-center justify-between rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 hover:bg-purple-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">การรับประกันใกล้หมด</span>
                      </div>
                      <Badge className="bg-purple-600 text-white text-xs">{alerts?.expiringWarranties}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.pendingClaims ?? 0) > 0 && (
                  <Link href="/claims">
                    <div className="flex items-center justify-between rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 hover:bg-purple-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">การเคลมรออยู่</span>
                      </div>
                      <Badge className="bg-purple-600 text-white text-xs">{alerts?.pendingClaims}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.overdueSuppliers ?? 0) > 0 && (
                  <Link href="/suppliers">
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 hover:bg-amber-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-amber-600" />
                        <div>
                          <span className="text-sm font-medium text-amber-800">หนี้เจ้าหนี้เกินกำหนด</span>
                          {(alerts?.apOutstanding ?? 0) > 0 && (
                            <p className="text-xs text-amber-600">{formatThaiMoney(alerts!.apOutstanding)}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-amber-500 text-white text-xs">{alerts?.overdueSuppliers} PO</Badge>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Debt + Stock + Warranties ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">

        {/* ลูกหนี้ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">ลูกหนี้ค้างชำระ</CardTitle>
              <Link href="/repairs">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  ดู <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
                <div className="h-6 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <p className={`text-3xl font-bold ${(ops?.unpaidDebtTotal ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {formatThaiMoney(ops?.unpaidDebtTotal ?? 0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {ops?.unpaidDebtCount ?? 0} ใบงาน · ซ่อมเสร็จแล้วยังไม่รับเงิน
                </p>
                {(ops?.unpaidDebtTotal ?? 0) === 0 && (
                  <div className="flex items-center gap-1.5 mt-3">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-slate-500">ไม่มีลูกหนี้ค้างชำระ</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* สต๊อก */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">สถานะสต็อก</CardTitle>
              <Link href="/products">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  สินค้า <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  (data?.stock.outOfStock ?? 0) > 0 ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-2">
                    {(data?.stock.outOfStock ?? 0) > 0 && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                    <span className="text-sm">สินค้าหมด</span>
                  </div>
                  <Badge variant="outline" className={`text-xs font-bold ${
                    (data?.stock.outOfStock ?? 0) > 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                  }`}>{data?.stock.outOfStock ?? 0}</Badge>
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  (data?.stock.lowStock ?? 0) > 0 ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-slate-50'
                }`}>
                  <span className="text-sm">ใกล้หมด</span>
                  <Badge variant="outline" className={`text-xs font-bold ${
                    (data?.stock.lowStock ?? 0) > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'
                  }`}>{data?.stock.lowStock ?? 0}</Badge>
                </div>
                {(data?.stock.outOfStock ?? 0) === 0 && (data?.stock.lowStock ?? 0) === 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-slate-500">สต็อกเพียงพอ</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* การรับประกัน */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">การรับประกัน</CardTitle>
              <Link href="/warranties">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  ดู <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-sm">ยังมีผล</span>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold bg-emerald-100 text-emerald-800">
                    {data?.warranties.active ?? 0}
                  </Badge>
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  (data?.warranties.expiringSoon ?? 0) > 0 ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-2">
                    {(data?.warranties.expiringSoon ?? 0) > 0 && <AlertCircle className="h-3.5 w-3.5 text-orange-500" />}
                    <span className="text-sm">หมดใน 7 วัน</span>
                  </div>
                  <Badge variant="outline" className={`text-xs font-bold ${
                    (data?.warranties.expiringSoon ?? 0) > 0 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'
                  }`}>{data?.warranties.expiringSoon ?? 0}</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Top Products + Top Technicians + Shift/Quick ─────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* สินค้าขายดี */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">สินค้าขายดี</CardTitle>
              <Link href="/reports">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  รายงาน <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : !data?.topProducts?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Package className="h-7 w-7 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">ยังไม่มีข้อมูลการขาย</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.topProducts.map((p, i) => (
                  <div key={p.sku + i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-4 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-tight">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.sku} · {p.qty} ชิ้น</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700 shrink-0">
                      {formatThaiMoney(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ประสิทธิภาพช่าง */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">ประสิทธิภาพช่าง</CardTitle>
              <Link href="/technicians">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  ช่าง <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : !data?.topTechnicians?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Wrench className="h-7 w-7 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">ยังไม่มีงานซ่อมในช่วงนี้</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.topTechnicians.map((tech, i) => (
                  <div key={tech.id} className="flex items-center gap-3">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white ${
                      i === 0 ? 'bg-orange-500' : i === 1 ? 'bg-slate-400' : 'bg-slate-300'
                    }`}>
                      {tech.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-tight">{tech.name}</p>
                      <p className="text-xs text-slate-400">{tech.repairCount} งาน</p>
                    </div>
                    <span className="text-sm font-bold text-orange-700 shrink-0">
                      {formatThaiMoney(tech.repairRevenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shift + Quick Actions */}
        <div className="space-y-4">
          <Card className={shift?.isOpen ? 'border-emerald-200' : 'border-slate-200'}>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">กะปัจจุบัน</CardTitle>
                <Link href="/shifts">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                    กะ <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? (
                <div className="h-12 bg-slate-100 rounded animate-pulse" />
              ) : shift?.isOpen ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-emerald-700">กะเปิดอยู่</span>
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">{shift.userName}</span>
                    {shift.userRole && (
                      <span className="text-slate-400 ml-1">({roleLabel[shift.userRole] ?? shift.userRole})</span>
                    )}
                  </p>
                  {shift.openedAt && (
                    <p className="text-xs text-slate-400">
                      เปิด {format(new Date(shift.openedAt), 'HH:mm น.')} · เงินต้น {formatThaiMoney(shift.openBalance)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                  <span className="text-sm text-slate-500">ยังไม่ได้เปิดกะ</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">เมนูทางลัด</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'รับซ่อม',        href: '/repairs',    icon: Wrench,       color: 'bg-orange-500' },
                  { label: 'ขายสินค้า',      href: '/sales',      icon: ShoppingCart, color: 'bg-blue-600' },
                  { label: 'สต็อก',          href: '/products',   icon: Package,      color: 'bg-purple-600' },
                  { label: 'เปิด/ปิดกะ',    href: '/shifts',     icon: Clock,        color: 'bg-slate-700' },
                  { label: 'รายงาน',         href: '/reports',    icon: Send,         color: 'bg-teal-600' },
                  { label: 'พนักงาน',        href: '/employees',  icon: Users,        color: 'bg-indigo-600' },
                  ...(isOwner ? [{ label: 'วิเคราะห์เชิงลึก', href: '/analytics', icon: BarChart2, color: 'bg-rose-600' }] : []),
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    className="flex flex-col items-center gap-1.5 rounded-lg border p-2 hover:border-blue-200 hover:bg-blue-50 transition-all">
                    <div className={`rounded-lg p-1.5 ${a.color}`}>
                      <a.icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-700 text-center leading-tight">{a.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Row 5: Branch Comparison (OWNER only) ────────────────────────────── */}
      {isOwner && (
        <div>
          <SectionTitle>เปรียบเทียบสาขา</SectionTitle>
          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : !data?.branchPerformance?.length ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <Building2 className="h-7 w-7 text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">ยังไม่มีข้อมูลสาขา</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-slate-500">
                        <th className="text-left py-2 font-medium">สาขา</th>
                        <th className="text-right py-2 font-medium">ยอดขาย</th>
                        <th className="text-right py-2 font-medium">ซ่อม</th>
                        <th className="text-right py-2 font-medium">รวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.branchPerformance.map((b, i) => (
                        <tr key={b.branchId} className="hover:bg-slate-50">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                              <Link href="/branches" className="font-medium text-slate-800 hover:text-blue-600">
                                {b.name}
                              </Link>
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-slate-600">{formatThaiMoney(b.salesRevenue)}</td>
                          <td className="py-2.5 text-right text-slate-600">{formatThaiMoney(b.repairRevenue)}</td>
                          <td className="py-2.5 text-right font-bold text-emerald-700">{formatThaiMoney(b.totalRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Row 6: Notifications Preview + Recent Activities ─────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* การแจ้งเตือน */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">การแจ้งเตือน</CardTitle>
                {(notif?.unreadCount ?? 0) > 0 && (
                  <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 h-4">
                    {notif?.unreadCount ?? 0}
                  </Badge>
                )}
              </div>
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : !notif?.latest?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Bell className="h-7 w-7 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notif.latest.map(n => (
                  <div key={n.id} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="mt-0.5">
                      <Badge className={`text-[10px] px-1.5 ${severityColor[n.severity] ?? 'bg-slate-100 text-slate-600'}`}>
                        {n.severity === 'CRITICAL' ? '!!' : n.severity === 'ERROR' ? '!' : n.severity === 'WARNING' ? '⚠' : 'i'}
                      </Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 truncate">{n.message}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{thaiTime(n.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* กิจกรรมล่าสุด */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">กิจกรรมล่าสุด</CardTitle>
              <Link href="/audit-logs">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : !data?.recentActivities?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Activity className="h-7 w-7 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">ยังไม่มีกิจกรรม</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.recentActivities.map(a => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg hover:bg-slate-50 px-2 py-1.5 transition-colors">
                    <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Activity className="h-3 w-3 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-700">
                          {actionLabel[a.action] ?? a.action}
                        </span>
                        {a.entityType && (
                          <span className="text-[10px] text-slate-400">· {a.entityType}</span>
                        )}
                      </div>
                      {a.actorName && (
                        <p className="text-[11px] text-slate-400">โดย {a.actorName}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{thaiTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
