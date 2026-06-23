'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  TrendingUp, TrendingDown, Wrench, Package, AlertTriangle, Clock,
  CheckCircle, ShoppingCart, Banknote, ArrowRight, RefreshCw,
  AlertCircle, Wallet, Send, Building2, Shield,
  Bell, Activity, Filter, BarChart2, ArrowRightLeft, Settings2,
  CreditCard, Layers, UserPlus, CalendarDays, Zap,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatThaiMoney, cn } from '@/lib/utils'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useShopName } from '@/hooks/useShopName'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import { RevenueBarChart } from '@/components/charts/revenue-bar-chart'
import { ExecutiveMobileDashboard } from '@/components/dashboard/executive-mobile-dashboard'
import type { OperationalAlert } from '@/components/alerts/operational-alert-center'
import type { Repair } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  period: { startDate: string; endDate: string }
  finance: {
    totalRevenue: number; salesRevenue: number; salesCount: number
    repairRevenue: number; repairCount: number; packageRevenue: number
    packageCount: number; totalExpenses: number
    posCOGS: number; repairCOGS: number; grossProfit: number; netProfit: number
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

interface OwnerSummaryData {
  today: {
    salesRevenue: number; repairRevenue: number; totalRevenue: number
    posCOGS: number; repairCOGS: number; totalCOGS: number
    grossProfit: number; totalExpenses: number; netProfit: number; newCustomers: number
  }
  monthly: {
    salesRevenue: number; repairRevenue: number; totalRevenue: number
    posCOGS: number; repairCOGS: number; totalCOGS: number
    grossProfit: number; totalExpenses: number; netProfit: number
  }
  recentSales: {
    id: string; receiptNumber: string; total: number
    paymentMethod: string; createdAt: string; customerName: string | null
  }[]
  health: {
    abnormalPendingRepairs: boolean; hasLowStock: boolean
    highExpenses: boolean; belowAverageSales: boolean; hasOutstandingDebt: boolean
  }
  repairStats: {
    openRepairs: number; overdueRepairs: number; unpaidDebtCount: number
    outOfStock: number; lowStock: number
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
  INFO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  WARNING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ERROR: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CRITICAL: 'bg-red-600 text-white',
}

const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'รับงาน', DIAGNOSING: 'ตรวจสอบ', WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว', WAITING_PARTS: 'รออะไหล่', IN_PROGRESS: 'กำลังซ่อม',
  COMPLETED: 'ซ่อมเสร็จ', DELIVERED: 'ส่งคืนแล้ว', CANCELLED: 'ยกเลิก',
}

const REPAIR_STATUS_COLOR: Record<string, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  APPROVED:         'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  WAITING_PARTS:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  IN_PROGRESS:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  COMPLETED:        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  DELIVERED:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  CANCELLED:        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const thaiTime = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm', { locale: th }) } catch { return '' }
}

// ── KPI Card V3 ───────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accentColor, iconBg, urgent, href, loading,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType
  accentColor: string; iconBg: string; urgent?: boolean; href?: string; loading?: boolean
}) {
  const inner = (
    <div className={cn(
      'relative bg-white dark:bg-slate-900 rounded-xl shadow-sm overflow-hidden transition-all duration-150 border-l-4',
      urgent
        ? 'border-l-red-500 border border-red-100 dark:border-red-900/60 shadow-red-50/60 dark:shadow-none'
        : `border-l-${accentColor}-500 border border-slate-100 dark:border-slate-800 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700`,
    )}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn('text-xs font-medium uppercase tracking-wide', urgent ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500')}>
              {label}
            </p>
            {loading ? (
              <div className="h-9 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-2" />
            ) : (
              <p className={cn(
                'text-3xl font-bold mt-1 tracking-tight leading-none',
                urgent ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white',
              )}>
                {value}
              </p>
            )}
            {sub && !loading && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">{sub}</p>
            )}
          </div>
          <div className={cn('rounded-xl p-2.5 shrink-0 mt-0.5', iconBg)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </div>
  )
  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}

function SkeletonKpi() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border-l-4 border-l-slate-200 dark:border-l-slate-700 border border-slate-100 dark:border-slate-800 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2 mt-1">
          <div className="h-2.5 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-9 w-28 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  title, icon: Icon, href, linkLabel = 'ดูทั้งหมด',
}: {
  title: string; icon?: React.ElementType; href?: string; linkLabel?: string
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />}
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      </div>
      {href && (
        <Link href={href}>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 -mr-1">
            {linkLabel} <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      )}
    </div>
  )
}

// ── Weekly chart V3 ───────────────────────────────────────────────────────────
// Rendering moved to RevenueBarChart (recharts) — see src/components/charts/revenue-bar-chart.tsx

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

  const { data: reminderData } = useQuery<{ items: ReminderSummaryItem[] }>({
    queryKey: ['reminders', 'active', user?.id, 'dashboard'],
    queryFn:  async () => (await api.get('/reminders/active')).data,
    enabled:  hasPerm('notification.view'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const reminderItems = reminderData?.items ?? []

  const repairOverdue   = alerts.filter(a => a.type === 'REPAIR_OVERDUE').length
  const transferPending = alerts.filter(a => a.type === 'TRANSFER_PENDING').length
  const transferTransit = alerts.filter(a => a.type === 'TRANSFER_IN_TRANSIT').length

  const vipCount    = reminderItems.filter(r => r.type === 'VIP_REPAIR').length
  const urgentCount = reminderItems.filter(r => r.type === 'URGENT_REPAIR').length
  const partsCount  = reminderItems.filter(r => r.type === 'PARTS_REQUEST_PENDING').length
  const pickupCount = reminderItems.filter(r => r.type === 'PICKUP_WAITING').length
  const totalUrgent = vipCount + urgentCount

  const total = repairOverdue + transferPending + transferTransit + totalUrgent + partsCount + pickupCount
  if (total === 0) return null

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">สิ่งที่ต้องดำเนินการ</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {repairOverdue > 0 && (
          <Link href="/repairs" className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
            <Wrench className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">งานซ่อมค้าง</span>
            <Badge className="bg-red-600 text-white text-xs ml-1">{repairOverdue} งาน</Badge>
          </Link>
        )}
        {transferPending > 0 && (
          <Link href="/transfers" className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
            <ArrowRightLeft className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">คำขอโอนรออนุมัติ</span>
            <Badge className="bg-amber-500 text-white text-xs ml-1">{transferPending} รายการ</Badge>
          </Link>
        )}
        {transferTransit > 0 && (
          <Link href="/transfers" className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
            <Send className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">สินค้ารอรับ</span>
            <Badge className="bg-blue-600 text-white text-xs ml-1">{transferTransit} รายการ</Badge>
          </Link>
        )}
        {totalUrgent > 0 && (
          <Link href="/repairs?filter=urgent" className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800/60 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">งานซ่อมเร่งด่วน</span>
            <Badge className="bg-red-600 text-white text-xs ml-1">{totalUrgent} งาน</Badge>
          </Link>
        )}
        {partsCount > 0 && (
          <Link href="/repairs?filter=waiting_parts" className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800/60 px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
            <Settings2 className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">รอชิ้นส่วน</span>
            <Badge className="bg-orange-500 text-white text-xs ml-1">{partsCount} งาน</Badge>
          </Link>
        )}
        {pickupCount > 0 && (
          <Link href="/repairs?filter=completed" className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 border border-green-200 dark:border-green-800/60 px-3 py-2 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
            <Clock className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-300">รอรับเครื่อง</span>
            <Badge className="bg-green-600 text-white text-xs ml-1">{pickupCount} งาน</Badge>
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Recent Repairs widget ─────────────────────────────────────────────────────

function RecentRepairsWidget({ repairs, isLoading }: { repairs: Repair[]; isLoading: boolean }) {
  const items = repairs.slice(0, 5)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[52px] bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
          <Wrench className="h-5 w-5 text-slate-300 dark:text-slate-600" />
        </div>
        <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีงานซ่อม</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {items.map(repair => (
        <Link key={repair.id} href="/repairs">
          <div className="group flex items-center gap-3 rounded-lg border border-transparent bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5 hover:bg-white dark:hover:bg-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm transition-all cursor-pointer">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">{repair.ticketNumber}</span>
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none',
                  REPAIR_STATUS_COLOR[repair.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                )}>
                  {REPAIR_STATUS_LABEL[repair.status] ?? repair.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate leading-snug">
                {[repair.customer?.name, `${repair.deviceBrand} ${repair.deviceModel}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              {repair.finalCost != null ? (
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{formatThaiMoney(repair.finalCost)}</p>
              ) : repair.estimateCost != null ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">{formatThaiMoney(repair.estimateCost)}</p>
              ) : (
                <p className="text-xs text-slate-300 dark:text-slate-600">—</p>
              )}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{thaiTime(repair.receivedAt)}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Revenue breakdown bar (for sales summary) ─────────────────────────────────

function RevenueBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">{formatThaiMoney(value)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Business Health Cards ─────────────────────────────────────────────────────

function BusinessHealthCards({
  health, hasRepair, hasStock, hasFinance,
}: {
  health: OwnerSummaryData['health']
  hasRepair: boolean; hasStock: boolean; hasFinance: boolean
}) {
  const items = [
    hasRepair && {
      ok: !health.abnormalPendingRepairs, label: 'งานซ่อม',
      okText: 'ปกติ', warnText: 'ค้างมากผิดปกติ', href: '/repairs',
    },
    hasStock && {
      ok: !health.hasLowStock, label: 'สต็อก',
      okText: 'เพียงพอ', warnText: 'สินค้าใกล้หมด/หมด', href: '/products',
    },
    hasFinance && {
      ok: !health.highExpenses, label: 'รายจ่าย',
      okText: 'ปกติ', warnText: 'สูงกว่าปกติ', href: '/expenses',
    },
    {
      ok: !health.belowAverageSales, label: 'ยอดขาย',
      okText: 'ดีกว่าเฉลี่ย', warnText: 'ต่ำกว่าเฉลี่ย', href: '/reports',
    },
    hasRepair && {
      ok: !health.hasOutstandingDebt, label: 'บิลค้าง',
      okText: 'ไม่มีค้างชำระ', warnText: 'มีบิลค้างชำระ', href: '/repairs',
    },
  ].filter(Boolean) as { ok: boolean; label: string; okText: string; warnText: string; href: string }[]

  if (!items.length) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">สุขภาพร้านค้า</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map(item => (
          <Link key={item.label} href={item.href}>
            <div className={cn(
              'rounded-xl border p-3.5 transition-all hover:shadow-sm cursor-pointer',
              item.ok
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60 hover:bg-red-100 dark:hover:bg-red-900/30',
            )}>
              <p className={cn(
                'text-xs font-semibold uppercase tracking-wide mb-1.5',
                item.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              )}>
                {item.label}
              </p>
              <div className="flex items-center gap-1.5">
                {item.ok
                  ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className={cn(
                  'text-xs font-medium leading-tight',
                  item.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
                )}>
                  {item.ok ? item.okText : item.warnText}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ── Recent Sales Widget ───────────────────────────────────────────────────────

function RecentSalesWidget({
  sales, isLoading,
}: {
  sales: OwnerSummaryData['recentSales']
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (!sales.length) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <ShoppingCart className="h-8 w-8 text-slate-200 dark:text-slate-700 mb-2" />
        <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีการขาย</p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {sales.map(s => (
        <Link key={s.id} href="/sales">
          <div className="group flex items-center gap-3 rounded-lg border border-transparent bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5 hover:bg-white dark:hover:bg-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm transition-all cursor-pointer">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">{s.receiptNumber}</span>
                <Badge variant="outline" className="text-[10px] py-0 h-4">
                  {s.paymentMethod === 'CASH' ? 'เงินสด' : s.paymentMethod === 'TRANSFER' ? 'โอน' : 'บัตร'}
                </Badge>
              </div>
              {s.customerName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{s.customerName}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{formatThaiMoney(s.total)}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{thaiTime(s.createdAt)}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user      = useAuthStore(s => s.user)
  const hasModule = useAuthStore(s => s.hasModule)
  const shopName  = useShopName()
  const role = user?.role
  const isOwner = role === 'OWNER' || role === 'SUPER_ADMIN'
  const isOwnerOrManager = isOwner || role === 'MANAGER'
  const showRepairs = role !== 'STOCK_STAFF'
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

  // Owner summary — monthly data, health cards, recent bills
  const { data: ownerSummary, isLoading: ownerLoading } = useQuery<OwnerSummaryData>({
    queryKey: ['dashboard-owner-summary'],
    queryFn: async () => (await api.get('/dashboard/owner-summary')).data,
    enabled: isOwnerOrManager,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  // Recent repairs — same endpoint the repairs page uses, capped at 200 server-side
  const { data: recentRepairs = [], isLoading: repairsLoading } = useQuery<Repair[]>({
    queryKey: ['repairs-recent-dashboard', contextBranchId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (contextBranchId) params.set('branchId', contextBranchId)
      return (await api.get(`/repairs?${params.toString()}`)).data
    },
    enabled: showRepairs,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const f      = data?.finance
  const ops    = data?.repairOps
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
    <>
      {/* Executive mobile dashboard — OWNER/MANAGER only, mobile only */}
      {isOwnerOrManager && (
        <div className="-m-4 sm:-m-6 md:hidden">
          <ExecutiveMobileDashboard />
        </div>
      )}

    <div className={cn('space-y-6 max-w-7xl pb-10', isOwnerOrManager && 'hidden md:block')}>

      {/* ── Greeting card ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-5 py-5 sm:px-6 text-white overflow-hidden relative">
        {/* Decorative circles */}
        <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-blue-600/20 pointer-events-none" />
        <div className="absolute top-4 right-20 h-16 w-16 rounded-full bg-blue-500/10 pointer-events-none" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between relative">
          <div>
            <p className="text-xs text-slate-400 font-medium tracking-wider mb-1">
              {format(new Date(), "EEEE · d MMMM yyyy", { locale: th })}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              สวัสดี, {user?.name ?? 'ยินดีต้อนรับ'} 👋
            </h2>
            <p className="text-sm text-blue-200 font-medium mt-1">{shopName}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center rounded-full bg-white/15 text-white border border-white/10 px-2.5 py-0.5 text-xs font-semibold">
                {roleLabel[role ?? ''] ?? role}
              </span>
              {!isToday && (
                <span className="text-slate-400 text-xs">{periodLabel}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BranchContextBar />
            <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5 border border-white/10">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }}
                className="h-6 text-xs bg-transparent text-white focus:outline-none w-28 [color-scheme:dark]"
              />
              <span className="text-slate-500 text-xs">–</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="h-6 text-xs bg-transparent text-white focus:outline-none w-28 [color-scheme:dark]"
              />
            </div>
            {!isToday && (
              <Button variant="outline" size="sm" className="h-8 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                onClick={() => { setStartDate(todayStr); setEndDate(todayStr) }}>
                วันนี้
              </Button>
            )}
            {updatedLabel && <span className="text-xs text-slate-500">อัปเดต {updatedLabel}</span>}
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards V3 ──────────────────────────────────────────────────────── */}
      <div className={cn(
        'grid gap-4',
        isOwnerOrManager ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
      )}>
        {isLoading ? (
          Array.from({ length: isOwnerOrManager ? 4 : 3 }).map((_, i) => <SkeletonKpi key={i} />)
        ) : isOwnerOrManager ? (
          <>
            <KpiCard
              label="ยอดขายรวมวันนี้"
              value={formatThaiMoney(f?.totalRevenue ?? 0)}
              sub={`ขาย ${f?.salesCount ?? 0} · ซ่อม ${f?.repairCount ?? 0}`}
              icon={TrendingUp} accentColor="emerald" iconBg="bg-emerald-500" href="/reports"
            />
            <KpiCard
              label="กำไรสุทธิวันนี้"
              value={formatThaiMoney(f?.netProfit ?? 0)}
              sub={`ขั้นต้น ${formatThaiMoney(f?.grossProfit ?? 0)} · ต้นทุน ${formatThaiMoney((f?.posCOGS ?? 0) + (f?.repairCOGS ?? 0))}`}
              icon={Banknote}
              accentColor={(f?.netProfit ?? 0) >= 0 ? 'teal' : 'red'}
              iconBg={(f?.netProfit ?? 0) >= 0 ? 'bg-teal-500' : 'bg-red-500'}
              urgent={(f?.netProfit ?? 0) < 0}
            />
            <KpiCard
              label="งานซ่อมเปิดอยู่"
              value={String(ops?.openRepairs ?? 0)}
              sub={`เกินกำหนด ${ops?.overdueRepairs ?? 0} งาน`}
              icon={Wrench} accentColor="orange" iconBg="bg-orange-500" href="/repairs"
              urgent={(ops?.overdueRepairs ?? 0) > 0}
            />
            <KpiCard
              label="แจ้งเตือน"
              value={String(totalAlerts)}
              sub={totalAlerts > 0 ? 'ต้องดำเนินการ' : 'ทุกอย่างปกติ'}
              icon={AlertTriangle}
              accentColor={totalAlerts > 0 ? 'red' : 'slate'}
              iconBg={totalAlerts > 0 ? 'bg-red-500' : 'bg-slate-400'}
              urgent={totalAlerts > 0}
            />
          </>
        ) : role === 'CASHIER' ? (
          <>
            <KpiCard label="ยอดขาย POS" value={formatThaiMoney(f?.salesRevenue ?? 0)}
              sub={`${f?.salesCount ?? 0} บิล`}
              icon={ShoppingCart} accentColor="blue" iconBg="bg-blue-600" href="/sales" />
            <KpiCard label="สถานะกะ" value={shift?.isOpen ? 'เปิดอยู่' : 'ยังไม่เปิด'}
              sub={shift?.isOpen ? `เปิดโดย ${shift.userName}` : 'กดเพื่อเปิดกะ'}
              icon={Clock}
              accentColor={shift?.isOpen ? 'emerald' : 'slate'}
              iconBg={shift?.isOpen ? 'bg-emerald-500' : 'bg-slate-400'}
              href="/shifts" />
            <KpiCard label="งานซ่อมทั้งหมด" value={String(ops?.openRepairs ?? 0)}
              sub={`เกินกำหนด ${ops?.overdueRepairs ?? 0}`}
              icon={Wrench} accentColor="orange" iconBg="bg-orange-500" href="/repairs"
              urgent={(ops?.overdueRepairs ?? 0) > 0} />
          </>
        ) : role === 'TECHNICIAN' ? (
          <>
            <KpiCard label="กำลังซ่อม" value={String(ops?.inProgress ?? 0)}
              icon={Wrench} accentColor="indigo" iconBg="bg-indigo-500" href="/repairs" />
            <KpiCard label="รออะไหล่" value={String(ops?.waitingParts ?? 0)}
              icon={Package} accentColor="blue" iconBg="bg-blue-500" href="/repairs" />
            <KpiCard label="เสร็จแล้ว รอส่ง" value={String(ops?.completedNotDelivered ?? 0)}
              icon={CheckCircle} accentColor="emerald" iconBg="bg-emerald-500" href="/repairs"
              urgent={(ops?.completedNotDelivered ?? 0) > 0} />
          </>
        ) : (
          <>
            <KpiCard label="สินค้าหมด" value={String(data?.stock.outOfStock ?? 0)}
              icon={Package}
              accentColor={(data?.stock.outOfStock ?? 0) > 0 ? 'red' : 'slate'}
              iconBg={(data?.stock.outOfStock ?? 0) > 0 ? 'bg-red-500' : 'bg-slate-400'}
              urgent={(data?.stock.outOfStock ?? 0) > 0} href="/products" />
            <KpiCard label="ใกล้หมด" value={String(data?.stock.lowStock ?? 0)}
              icon={Package}
              accentColor={(data?.stock.lowStock ?? 0) > 0 ? 'yellow' : 'slate'}
              iconBg={(data?.stock.lowStock ?? 0) > 0 ? 'bg-yellow-500' : 'bg-slate-400'}
              href="/products" />
            <KpiCard label="งานซ่อมทั้งหมด" value={String(ops?.openRepairs ?? 0)}
              icon={Wrench} accentColor="orange" iconBg="bg-orange-500" href="/repairs" />
          </>
        )}
      </div>

      {/* ── Monthly Overview (OWNER/MANAGER) ─────────────────────────────────── */}
      {isOwnerOrManager && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                ภาพรวมเดือนนี้
              </h3>
            </div>
            {ownerLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                    <div className="h-7 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ยอดขายรวม</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{formatThaiMoney(ownerSummary?.monthly.totalRevenue ?? 0)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    POS {formatThaiMoney(ownerSummary?.monthly.salesRevenue ?? 0)}
                    {hasModule('repair') && ` · ซ่อม ${formatThaiMoney(ownerSummary?.monthly.repairRevenue ?? 0)}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ต้นทุนสินค้า</p>
                  <p className="text-xl font-bold text-rose-700 dark:text-rose-400 mt-0.5">{formatThaiMoney(ownerSummary?.monthly.totalCOGS ?? 0)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">COGS + อะไหล่</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">กำไรขั้นต้น</p>
                  <p className={cn('text-xl font-bold mt-0.5', (ownerSummary?.monthly.grossProfit ?? 0) >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400')}>
                    {formatThaiMoney(ownerSummary?.monthly.grossProfit ?? 0)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ก่อนหักค่าใช้จ่าย</p>
                </div>
                {hasModule('finance') && (
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ค่าใช้จ่าย</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-0.5">{formatThaiMoney(ownerSummary?.monthly.totalExpenses ?? 0)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ค่าดำเนินการ</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">กำไรสุทธิ</p>
                  <p className={cn('text-xl font-bold mt-0.5', (ownerSummary?.monthly.netProfit ?? 0) >= 0 ? 'text-teal-700 dark:text-teal-400' : 'text-red-700 dark:text-red-400')}>
                    {formatThaiMoney(ownerSummary?.monthly.netProfit ?? 0)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">หลังหักทุกต้นทุน</p>
                </div>
                {hasModule('crm') && (
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ลูกค้าใหม่วันนี้</p>
                    <p className="text-xl font-bold text-violet-700 dark:text-violet-400 mt-0.5 flex items-center gap-1.5">
                      <UserPlus className="h-4 w-4 shrink-0" />
                      {ownerSummary?.today.newCustomers ?? 0}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Business Health Cards (OWNER/MANAGER) ───────────────────────────── */}
      {isOwnerOrManager && ownerSummary && (
        <Card>
          <CardContent className="p-5">
            <BusinessHealthCards
              health={ownerSummary.health}
              hasRepair={hasModule('repair')}
              hasStock={hasModule('stock')}
              hasFinance={hasModule('finance')}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Quick Actions (OWNER/MANAGER, module-aware) ─────────────────────── */}
      {isOwnerOrManager && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">ทางลัดด่วน</h3>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {hasModule('pos') && (
              <Link href="/sales">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 gap-1.5 text-sm">
                  <ShoppingCart className="h-3.5 w-3.5" />เปิดบิลขาย
                </Button>
              </Link>
            )}
            {hasModule('repair') && (
              <Link href="/repairs">
                <Button className="bg-orange-500 hover:bg-orange-600 text-white h-9 px-4 gap-1.5 text-sm">
                  <Wrench className="h-3.5 w-3.5" />รับงานซ่อม
                </Button>
              </Link>
            )}
            {hasModule('stock') && (
              <Link href="/products">
                <Button variant="outline" className="h-9 px-4 gap-1.5 text-sm">
                  <Package className="h-3.5 w-3.5" />จัดการสินค้า
                </Button>
              </Link>
            )}
            {hasModule('crm') && (
              <Link href="/customers">
                <Button variant="outline" className="h-9 px-4 gap-1.5 text-sm">
                  <UserPlus className="h-3.5 w-3.5" />เพิ่มลูกค้า
                </Button>
              </Link>
            )}
            {hasModule('finance') && (
              <Link href="/expenses">
                <Button variant="outline" className="h-9 px-4 gap-1.5 text-sm">
                  <Banknote className="h-3.5 w-3.5" />บันทึกรายจ่าย
                </Button>
              </Link>
            )}
            {hasModule('report') && (
              <Link href="/reports">
                <Button variant="outline" className="h-9 px-4 gap-1.5 text-sm">
                  <BarChart2 className="h-3.5 w-3.5" />ดูรายงาน
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── สิ่งที่ต้องดำเนินการ ─────────────────────────────────────────────── */}
      <DashboardReminderWidget />

      {/* ── Recent Repairs + Repair Status ──────────────────────────────────── */}
      {showRepairs && hasModule('repair') && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

          {/* Recent Repairs — new in V3 */}
          <Card className="lg:col-span-3">
            <CardContent className="p-5">
              <SectionHeader title="งานซ่อมล่าสุด" icon={Wrench} href="/repairs" />
              <RecentRepairsWidget repairs={recentRepairs} isLoading={repairsLoading} />
            </CardContent>
          </Card>

          {/* Repair Status Breakdown */}
          <Card className="lg:col-span-2">
            <CardContent className="p-5">
              <SectionHeader title="สถานะงานซ่อม" icon={Layers} href="/repairs" />
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: 'รออนุมัติใบเสนอ', count: ops?.waitingApproval ?? 0, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', urgent: (ops?.waitingApproval ?? 0) > 0 },
                    { label: 'รออะไหล่',         count: ops?.waitingParts ?? 0,     color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',    urgent: false },
                    { label: 'กำลังซ่อม',        count: ops?.inProgress ?? 0,       color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400', urgent: false },
                    { label: 'เสร็จแล้ว รอส่ง',  count: ops?.completedNotDelivered ?? 0, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', urgent: (ops?.completedNotDelivered ?? 0) > 0 },
                    { label: 'เกินกำหนด',        count: ops?.overdueRepairs ?? 0,   color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',      urgent: (ops?.overdueRepairs ?? 0) > 0 },
                  ].map(row => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                        row.urgent && row.count > 0 ? 'bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800/60' : 'bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {row.urgent && row.count > 0 && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
                      </div>
                      <Badge variant="outline" className={`text-xs font-bold ${row.color}`}>{row.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {/* ── Today's Sales Summary (OWNER/MANAGER) ───────────────────────────── */}
      {isOwnerOrManager && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">รายรับ{isToday ? 'วันนี้' : ''}</h3>
              </div>
              <Link href="/reports">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 -mr-1">
                  รายงาน <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                    <div className="h-7 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {/* P&L row: mirrors /reports/profit */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ยอดขายรวม</p>
                    <p className="text-xl font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">{formatThaiMoney(f?.totalRevenue ?? 0)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">POS {f?.salesCount ?? 0} · ซ่อม {f?.repairCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ต้นทุนสินค้า</p>
                    <p className="text-xl font-bold mt-0.5 text-rose-700 dark:text-rose-400">{formatThaiMoney((f?.posCOGS ?? 0) + (f?.repairCOGS ?? 0))}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">COGS + อะไหล่/แรงงาน</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">กำไรขั้นต้น</p>
                    <p className={cn('text-xl font-bold mt-0.5', (f?.grossProfit ?? 0) >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400')}>
                      {formatThaiMoney(f?.grossProfit ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ก่อนหักค่าใช้จ่าย</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">ค่าใช้จ่าย</p>
                    <p className="text-xl font-bold mt-0.5 text-amber-700 dark:text-amber-400">{formatThaiMoney(f?.totalExpenses ?? 0)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ค่าดำเนินการ</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">กำไรสุทธิ</p>
                    <p className={cn('text-xl font-bold mt-0.5', (f?.netProfit ?? 0) >= 0 ? 'text-teal-700 dark:text-teal-400' : 'text-red-700 dark:text-red-400')}>
                      {formatThaiMoney(f?.netProfit ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">หลังหักทุกต้นทุน</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">แจ้งเตือน</p>
                    <p className={cn('text-xl font-bold mt-0.5', totalAlerts > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-400 dark:text-slate-500')}>
                      {totalAlerts}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{totalAlerts > 0 ? 'ต้องดำเนินการ' : 'ทุกอย่างปกติ'}</p>
                  </div>
                </div>

                {/* Revenue breakdown sub-row */}
                {(f?.totalRevenue ?? 0) > 0 && (
                  <div className="pt-3 border-t dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-xs">
                      <span className="text-slate-400 dark:text-slate-500">POS </span>
                      <span className="font-semibold text-blue-700 dark:text-blue-400">{formatThaiMoney(f?.salesRevenue ?? 0)}</span>
                      <span className="text-slate-400 dark:text-slate-500"> · กำไร </span>
                      <span className="font-semibold text-blue-700 dark:text-blue-400">{formatThaiMoney((f?.salesRevenue ?? 0) - (f?.posCOGS ?? 0))}</span>
                    </div>
                    {(f?.repairRevenue ?? 0) > 0 && (
                      <div className="text-xs">
                        <span className="text-slate-400 dark:text-slate-500">ซ่อม </span>
                        <span className="font-semibold text-orange-700 dark:text-orange-400">{formatThaiMoney(f?.repairRevenue ?? 0)}</span>
                        <span className="text-slate-400 dark:text-slate-500"> · กำไร </span>
                        <span className="font-semibold text-orange-700 dark:text-orange-400">{formatThaiMoney((f?.repairRevenue ?? 0) - (f?.repairCOGS ?? 0))}</span>
                      </div>
                    )}
                    <RevenueBar label="เงินสด" value={f?.cashIn ?? 0} total={f?.totalRevenue ?? 0} color="bg-emerald-500" />
                    <RevenueBar label="โอนเงิน" value={f?.transferIn ?? 0} total={f?.totalRevenue ?? 0} color="bg-blue-500" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Recent Bills + Repairs (OWNER with pos/repair modules) ─────────── */}
      {isOwnerOrManager && (hasModule('pos') || hasModule('repair')) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {hasModule('pos') && (
            <Card>
              <CardContent className="p-5">
                <SectionHeader title="บิลขายล่าสุด" icon={ShoppingCart} href="/sales" />
                <RecentSalesWidget
                  sales={ownerSummary?.recentSales ?? []}
                  isLoading={ownerLoading}
                />
              </CardContent>
            </Card>
          )}
          {hasModule('repair') && (
            <Card>
              <CardContent className="p-5">
                <SectionHeader title="งานซ่อมล่าสุด" icon={Wrench} href="/repairs" />
                <RecentRepairsWidget repairs={recentRepairs} isLoading={repairsLoading} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Weekly Chart + Alerts ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {isOwnerOrManager && (
          <Card className="lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">รายรับ 7 วัน</h3>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />ขาย</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-400" />ซ่อม</span>
                </div>
              </div>
              {isLoading ? (
                <div className="h-36 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              ) : data?.weeklyRevenue ? (
                <>
                  <RevenueBarChart data={data.weeklyRevenue} shortDate={shortDate} />
                  <div className="mt-3 pt-3 border-t dark:border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">รวม 7 วัน</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {formatThaiMoney(data.weeklyRevenue.reduce((s, d) => s + d.total, 0))}
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-36 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">ไม่มีข้อมูล</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* แจ้งเตือนด่วน */}
        <Card className={cn('lg:col-span-1', !isOwnerOrManager && 'lg:col-span-3', totalAlerts > 0 ? 'border-red-200 dark:border-red-800/60' : '')}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className={cn('h-4 w-4', totalAlerts > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500')} />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">แจ้งเตือนด่วน</h3>
              {totalAlerts > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 h-4 ml-1">{totalAlerts}</Badge>
              )}
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : totalAlerts === 0 ? (
              <div className="flex flex-col items-center py-6 text-center gap-2">
                <CheckCircle className="h-8 w-8 text-emerald-400 dark:text-emerald-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400">ทุกอย่างเรียบร้อย</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(alerts?.overdueRepairs ?? 0) > 0 && (
                  <Link href="/repairs">
                    <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        <span className="text-sm font-medium text-red-800 dark:text-red-300">งานซ่อมเกินกำหนด</span>
                      </div>
                      <Badge className="bg-red-600 dark:bg-red-700 text-white text-xs">{alerts?.overdueRepairs}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.unpaidRepairs ?? 0) > 0 && (
                  <Link href="/repairs">
                    <div className="flex items-center justify-between rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/50 px-3 py-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                        <span className="text-sm font-medium text-orange-800 dark:text-orange-300">รอรับเงิน (ซ่อมเสร็จ)</span>
                      </div>
                      <Badge className="bg-orange-500 dark:bg-orange-600 text-white text-xs">{alerts?.unpaidRepairs}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.outOfStock ?? 0) > 0 && (
                  <Link href="/products">
                    <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        <span className="text-sm font-medium text-red-800 dark:text-red-300">สินค้าหมด</span>
                      </div>
                      <Badge className="bg-red-600 dark:bg-red-700 text-white text-xs">{alerts?.outOfStock}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.lowStock ?? 0) > 0 && (
                  <Link href="/products">
                    <div className="flex items-center justify-between rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800/50 px-3 py-2 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                        <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">สินค้าใกล้หมด</span>
                      </div>
                      <Badge className="bg-yellow-500 dark:bg-yellow-600 text-white text-xs">{alerts?.lowStock}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.expiringWarranties ?? 0) > 0 && (
                  <Link href="/warranties">
                    <div className="flex items-center justify-between rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 px-3 py-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        <span className="text-sm font-medium text-purple-800 dark:text-purple-300">การรับประกันใกล้หมด</span>
                      </div>
                      <Badge className="bg-purple-600 dark:bg-purple-700 text-white text-xs">{alerts?.expiringWarranties}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.pendingClaims ?? 0) > 0 && (
                  <Link href="/claims">
                    <div className="flex items-center justify-between rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 px-3 py-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        <span className="text-sm font-medium text-purple-800 dark:text-purple-300">การเคลมรออยู่</span>
                      </div>
                      <Badge className="bg-purple-600 dark:bg-purple-700 text-white text-xs">{alerts?.pendingClaims}</Badge>
                    </div>
                  </Link>
                )}
                {(alerts?.overdueSuppliers ?? 0) > 0 && (
                  <Link href="/suppliers">
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 px-3 py-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">หนี้เจ้าหนี้เกินกำหนด</span>
                          {(alerts?.apOutstanding ?? 0) > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">{formatThaiMoney(alerts!.apOutstanding)}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-amber-500 dark:bg-amber-600 text-white text-xs">{alerts?.overdueSuppliers} PO</Badge>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Debt + Stock + Warranties ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">

        {isOwnerOrManager && (
          <Card>
            <CardContent className="p-5">
              <SectionHeader title="ลูกหนี้ค้างชำระ" icon={Wallet} href="/repairs" linkLabel="ดู" />
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  <div className="h-5 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <p className={`text-3xl font-bold ${(ops?.unpaidDebtTotal ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600'}`}>
                    {formatThaiMoney(ops?.unpaidDebtTotal ?? 0)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {ops?.unpaidDebtCount ?? 0} ใบงาน · ซ่อมเสร็จแล้วยังไม่รับเงิน
                  </p>
                  {(ops?.unpaidDebtTotal ?? 0) === 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      <CheckCircle className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                      <span className="text-xs text-slate-500 dark:text-slate-400">ไม่มีลูกหนี้ค้างชำระ</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {hasModule('stock') && (
        <Card className={isOwnerOrManager ? '' : 'sm:col-span-2'}>
          <CardContent className="p-5">
            <SectionHeader title="สถานะสต็อก" icon={Package} href="/products" linkLabel="สินค้า" />
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  (data?.stock.outOfStock ?? 0) > 0 ? 'bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800/50' : 'bg-slate-50 dark:bg-slate-800/60'
                }`}>
                  <div className="flex items-center gap-2">
                    {(data?.stock.outOfStock ?? 0) > 0 && <AlertCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />}
                    <span className="text-sm text-slate-700 dark:text-slate-300">สินค้าหมด</span>
                  </div>
                  <Badge variant="outline" className={`text-xs font-bold ${
                    (data?.stock.outOfStock ?? 0) > 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>{data?.stock.outOfStock ?? 0}</Badge>
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  (data?.stock.lowStock ?? 0) > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 ring-1 ring-yellow-200 dark:ring-yellow-800/50' : 'bg-slate-50 dark:bg-slate-800/60'
                }`}>
                  <span className="text-sm text-slate-700 dark:text-slate-300">ใกล้หมด</span>
                  <Badge variant="outline" className={`text-xs font-bold ${
                    (data?.stock.lowStock ?? 0) > 0 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>{data?.stock.lowStock ?? 0}</Badge>
                </div>
                {(data?.stock.outOfStock ?? 0) === 0 && (data?.stock.lowStock ?? 0) === 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">สต็อกเพียงพอ</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {hasModule('repair') && (
        <Card>
          <CardContent className="p-5">
            <SectionHeader title="การรับประกัน" icon={Shield} href="/warranties" linkLabel="ดู" />
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">ยังมีผล</span>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                    {data?.warranties.active ?? 0}
                  </Badge>
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  (data?.warranties.expiringSoon ?? 0) > 0 ? 'bg-orange-50 dark:bg-orange-900/20 ring-1 ring-orange-200 dark:ring-orange-800/50' : 'bg-slate-50 dark:bg-slate-800/60'
                }`}>
                  <div className="flex items-center gap-2">
                    {(data?.warranties.expiringSoon ?? 0) > 0 && <AlertCircle className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />}
                    <span className="text-sm text-slate-700 dark:text-slate-300">หมดใน 7 วัน</span>
                  </div>
                  <Badge variant="outline" className={`text-xs font-bold ${
                    (data?.warranties.expiringSoon ?? 0) > 0 ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>{data?.warranties.expiringSoon ?? 0}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* ── Top Products + Top Technicians + Shift/Quick (OWNER/MANAGER) ────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {isOwnerOrManager && (
          <Card>
            <CardContent className="p-5">
              <SectionHeader title="สินค้าขายดี" icon={TrendingUp} href="/reports" linkLabel="รายงาน" />
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  ))}
                </div>
              ) : !data?.topProducts?.length ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <Package className="h-7 w-7 text-slate-200 dark:text-slate-700 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีข้อมูลการขาย</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.topProducts.map((p, i) => (
                    <div key={p.sku + i} className="flex items-center gap-3">
                      <span className={cn(
                        'text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                        i === 0 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : i === 1 ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500',
                      )}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight">{p.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{p.sku} · {p.qty} ชิ้น</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {formatThaiMoney(p.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isOwnerOrManager && (
          <Card>
            <CardContent className="p-5">
              <SectionHeader title="ประสิทธิภาพช่าง" icon={Wrench} href="/technicians" linkLabel="ช่าง" />
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  ))}
                </div>
              ) : !data?.topTechnicians?.length ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <Wrench className="h-7 w-7 text-slate-200 dark:text-slate-700 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีงานซ่อมในช่วงนี้</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.topTechnicians.map((tech, i) => (
                    <div key={tech.id} className="flex items-center gap-3">
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white',
                        i === 0 ? 'bg-orange-500' : i === 1 ? 'bg-slate-400 dark:bg-slate-600' : 'bg-slate-300 dark:bg-slate-700',
                      )}>
                        {tech.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight">{tech.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{tech.repairCount} งาน</p>
                      </div>
                      <span className="text-sm font-bold text-orange-700 dark:text-orange-400 shrink-0">
                        {formatThaiMoney(tech.repairRevenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Shift + Quick Actions */}
        <div className="space-y-5">
          <Card className={shift?.isOpen ? 'border-emerald-200 dark:border-emerald-800/60' : ''}>
            <CardContent className="p-5">
              <SectionHeader title="กะปัจจุบัน" icon={Clock} href="/shifts" linkLabel="กะ" />
              {isLoading ? (
                <div className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              ) : shift?.isOpen ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">กะเปิดอยู่</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium">{shift.userName}</span>
                    {shift.userRole && (
                      <span className="text-slate-400 dark:text-slate-500 ml-1">({roleLabel[shift.userRole] ?? shift.userRole})</span>
                    )}
                  </p>
                  {shift.openedAt && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      เปิด {format(new Date(shift.openedAt), 'HH:mm น.')} · เงินต้น {formatThaiMoney(shift.openBalance)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">ยังไม่ได้เปิดกะ</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <SectionHeader title="เมนูทางลัด" />
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'รับซ่อม',     href: '/repairs',   icon: Wrench,       color: 'bg-orange-500' },
                  { label: 'ขายสินค้า',   href: '/sales',     icon: ShoppingCart, color: 'bg-blue-600' },
                  { label: 'สต็อก',       href: '/products',  icon: Package,      color: 'bg-purple-600' },
                  { label: 'เปิด/ปิดกะ', href: '/shifts',    icon: Clock,        color: 'bg-slate-700' },
                  { label: 'รายงาน',      href: '/reports',   icon: Send,         color: 'bg-teal-600' },
                  { label: 'พนักงาน',     href: '/employees', icon: CreditCard,   color: 'bg-indigo-600' },
                  ...(isOwnerOrManager ? [{ label: 'วิเคราะห์', href: '/analytics', icon: BarChart2, color: 'bg-rose-600' }] : []),
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 dark:border-slate-800 p-2.5 hover:border-blue-200 dark:hover:border-blue-800/60 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:shadow-sm transition-all">
                    <div className={`rounded-lg p-1.5 ${a.color}`}>
                      <a.icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 text-center leading-tight">{a.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Branch Comparison (OWNER only) ──────────────────────────────────── */}
      {isOwnerOrManager && (
        <Card>
          <CardContent className="p-5">
            <SectionHeader title="เปรียบเทียบสาขา" icon={Building2} />
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                ))}
              </div>
            ) : !data?.branchPerformance?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Building2 className="h-7 w-7 text-slate-200 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีข้อมูลสาขา</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
                      <th className="text-left py-2 font-medium">สาขา</th>
                      <th className="text-right py-2 font-medium">ยอดขาย</th>
                      <th className="text-right py-2 font-medium">ซ่อม</th>
                      <th className="text-right py-2 font-medium">รวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.branchPerformance.map((b, i) => (
                      <tr key={b.branchId} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4">{i + 1}</span>
                            <Link href="/branches" className="font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400">
                              {b.name}
                            </Link>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{formatThaiMoney(b.salesRevenue)}</td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{formatThaiMoney(b.repairRevenue)}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">{formatThaiMoney(b.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Notifications + Activities ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">การแจ้งเตือน</h3>
                {(notif?.unreadCount ?? 0) > 0 && (
                  <Badge className="bg-red-500 dark:bg-red-600 text-white text-xs px-1.5 py-0 h-4">
                    {notif?.unreadCount ?? 0}
                  </Badge>
                )}
              </div>
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 -mr-1">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                ))}
              </div>
            ) : !notif?.latest?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Bell className="h-7 w-7 text-slate-200 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notif.latest.map(n => (
                  <div key={n.id} className="flex items-start gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all">
                    <div className="mt-0.5 shrink-0">
                      <Badge className={`text-[10px] px-1.5 ${severityColor[n.severity] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                        {n.severity === 'CRITICAL' ? '!!' : n.severity === 'ERROR' ? '!' : n.severity === 'WARNING' ? '⚠' : 'i'}
                      </Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{n.message}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 mt-0.5">{thaiTime(n.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">กิจกรรมล่าสุด</h3>
              </div>
              <Link href="/audit-logs">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 -mr-1">
                  ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                ))}
              </div>
            ) : !data?.recentActivities?.length ? (
              <div className="flex flex-col items-center py-6 text-center">
                <Activity className="h-7 w-7 text-slate-200 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีกิจกรรม</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.recentActivities.map(a => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 px-2 py-1.5 transition-colors">
                    <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Activity className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {actionLabel[a.action] ?? a.action}
                        </span>
                        {a.entityType && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">· {a.entityType}</span>
                        )}
                      </div>
                      {a.actorName && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">โดย {a.actorName}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{thaiTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
    </>
  )
}
