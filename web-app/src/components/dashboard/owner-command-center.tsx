'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wrench, ShoppingCart, Package, Users,
  Bell, BarChart2, Banknote, AlertTriangle, CheckCircle2, Clock,
  ArrowRight, Zap, Star, RefreshCw, ChevronRight,
  Activity, Brain, ShieldAlert, ReceiptText,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn, formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import api from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  finance: {
    totalRevenue: number; salesRevenue: number; salesCount: number
    repairRevenue: number; repairCount: number; totalExpenses: number
    grossProfit: number; netProfit: number
  }
  repairOps: {
    openRepairs: number; waitingApproval: number; waitingParts: number
    inProgress: number; completedNotDelivered: number; overdueRepairs: number
    unpaidDebtTotal: number; unpaidDebtCount: number
  }
  stock: { outOfStock: number; lowStock: number }
  topTechnicians: { id: string; name: string; repairCount: number; repairRevenue: number }[]
  branchPerformance: {
    branchId: string; name: string; totalRevenue: number
    openRepairs: number; overdueRepairs: number; health: 'NORMAL' | 'WARNING' | 'CRITICAL'
  }[]
  weeklyRevenue: { date: string; sales: number; repairs: number; packages: number; total: number }[]
  notifications: {
    unreadCount: number
    latest: { id: string; type: string; title: string; message: string; severity: string; createdAt: string }[]
  }
  recentActivities: {
    id: string; action: string; entityType: string | null; actorName: string | null; createdAt: string
  }[]
  currentShift: {
    isOpen: boolean; openedAt: string | null; userName: string | null; openBalance: number
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
    grossProfit: number; totalExpenses: number; netProfit: number; newCustomers: number
  }
  monthly: {
    totalRevenue: number; grossProfit: number; netProfit: number
  }
  health: {
    abnormalPendingRepairs: boolean; hasLowStock: boolean
    highExpenses: boolean; belowAverageSales: boolean; hasOutstandingDebt: boolean
  }
  repairStats: {
    openRepairs: number; overdueRepairs: number; unpaidDebtCount: number
    outOfStock: number; lowStock: number
  }
}

// ── Shared atoms ───────────────────────────────────────────────────────────────

function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700/60', className)} />
}

function PCard({
  children, className, urgent,
}: { children: React.ReactNode; className?: string; urgent?: boolean }) {
  return (
    <div className={cn(
      'relative bg-white dark:bg-[#1E293B] rounded-2xl border',
      'shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)]',
      urgent
        ? 'border-red-200 dark:border-red-700/60'
        : 'border-slate-100 dark:border-slate-700/60',
      className,
    )}>
      {urgent && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-red-500 to-rose-600" />
      )}
      {children}
    </div>
  )
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { dataKey: string; value: number; fill: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mt-0.5">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-slate-500 dark:text-slate-400">{p.dataKey}</span>
          <span className="font-bold text-slate-800 dark:text-white ml-auto">{formatThaiMoney(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI metric card ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accentColor, iconBg, urgent, loading, href, trend,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType
  accentColor: string; iconBg: string; urgent?: boolean; loading?: boolean
  href?: string; trend?: 'up' | 'down' | null
}) {
  const inner = (
    <PCard urgent={urgent} className="p-5 group cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-[11px] font-bold uppercase tracking-widest',
            urgent ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500',
          )}>
            {label}
          </p>
          {loading
            ? <Skel className="h-8 w-28 mt-2" />
            : (
              <p className={cn(
                'text-[26px] font-black mt-1.5 tabular-nums leading-tight',
                urgent ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white',
              )}>
                {value}
              </p>
            )
          }
          {!loading && sub && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
              {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />}
              {sub}
            </p>
          )}
        </div>
        <div className={cn(
          'flex-shrink-0 rounded-2xl p-3 group-hover:scale-110 transition-transform',
          iconBg,
        )}>
          <Icon className={cn('h-5 w-5', accentColor)} />
        </div>
      </div>
    </PCard>
  )

  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}

// ── Revenue chart widget ───────────────────────────────────────────────────────

function RevenueChartWidget({
  data, loading,
}: { data?: DashboardOverview['weeklyRevenue']; loading: boolean }) {
  const chartData = (data ?? []).map(d => {
    const [, m, day] = d.date.split('-')
    return { date: `${day}/${m}`, ยอดขาย: d.sales, งานซ่อม: d.repairs }
  })

  return (
    <PCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-blue-50 dark:bg-blue-900/30">
          <BarChart2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-white text-sm">รายรับ 7 วันย้อนหลัง</h3>
        <div className="ml-auto flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />ยอดขาย
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />งานซ่อม
          </span>
        </div>
      </div>
      {loading ? (
        <Skel className="h-40 w-full" />
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} barGap={2} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
            <Bar dataKey="ยอดขาย" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="งานซ่อม" stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </PCard>
  )
}

// ── Quick actions ──────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'รับงานซ่อม',   href: '/repairs',               icon: Wrench,       color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' },
  { label: 'เปิด POS',      href: '/sales',                 icon: ShoppingCart, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' },
  { label: 'รายงานวันนี้',  href: '/reports/daily-closing', icon: BarChart2,    color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
  { label: 'สต็อกสินค้า',  href: '/products',              icon: Package,      color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
  { label: 'ลูกค้า',        href: '/customers',             icon: Users,        color: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400' },
  { label: 'แจ้งเตือน',    href: '/notifications',         icon: Bell,         color: 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400' },
]

function QuickActionsWidget() {
  return (
    <PCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-violet-50 dark:bg-violet-900/20">
          <Zap className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-white text-sm">Quick Actions</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map(a => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 p-2.5 hover:border-slate-200 dark:hover:border-slate-600 hover:-translate-y-0.5 hover:shadow-sm transition-all group"
          >
            <div className={cn('flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0', a.color)}>
              <a.icon className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">{a.label}</span>
          </Link>
        ))}
      </div>
    </PCard>
  )
}

// ── Repair queue detail ────────────────────────────────────────────────────────

function RepairQueueWidget({
  ops, loading,
}: { ops?: DashboardOverview['repairOps']; loading: boolean }) {
  const items = [
    { label: 'กำลังซ่อม',   count: ops?.inProgress ?? 0,           color: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400' },
    { label: 'รออะไหล่',    count: ops?.waitingParts ?? 0,         color: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400' },
    { label: 'รอรับสินค้า', count: ops?.completedNotDelivered ?? 0, color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'เกินกำหนด',  count: ops?.overdueRepairs ?? 0,        color: 'bg-red-500',     text: 'text-red-600 dark:text-red-400' },
  ]
  const total     = ops?.openRepairs ?? 0
  const hasOverdue = (ops?.overdueRepairs ?? 0) > 0

  return (
    <Link href="/repairs" className="block">
      <PCard urgent={hasOverdue} className="p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <Wrench className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">งานซ่อมทั้งหมด</p>
              {loading
                ? <Skel className="h-6 w-10 mt-0.5" />
                : <p className="text-xl font-black text-slate-900 dark:text-white leading-tight">{total}</p>
              }
            </div>
          </div>
          {hasOverdue && (
            <span className="flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" />{ops?.overdueRepairs} เกิน
            </span>
          )}
        </div>
        {loading ? <Skel className="h-16 w-full" /> : (
          <div className="space-y-1.5">
            {items.filter(i => i.count > 0).map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', item.color)} />
                <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">{item.label}</span>
                <span className={cn('text-xs font-bold tabular-nums', item.text)}>{item.count}</span>
              </div>
            ))}
            {items.every(i => i.count === 0) && (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-1">ไม่มีงานค้าง</p>
            )}
          </div>
        )}
      </PCard>
    </Link>
  )
}

// ── Best technician ────────────────────────────────────────────────────────────

function BestTechWidget({
  techs, loading,
}: { techs?: DashboardOverview['topTechnicians']; loading: boolean }) {
  const top = techs?.[0]

  return (
    <Link href="/employees" className="block">
      <PCard className="p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200 group">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-yellow-50 dark:bg-yellow-900/20">
            <Star className="h-3.5 w-3.5 text-yellow-500" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">ช่างยอดเยี่ยม</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">วันนี้</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
        </div>
        {loading ? <Skel className="h-14 w-full" /> : !top ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">ยังไม่มีข้อมูล</p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0 text-white font-black text-sm shadow-sm">
              {top.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{top.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {top.repairCount} งาน · {formatThaiMoney(top.repairRevenue)}
              </p>
            </div>
          </div>
        )}
      </PCard>
    </Link>
  )
}

// ── Outstanding debt ───────────────────────────────────────────────────────────

function DebtWidget({
  ops, loading,
}: { ops?: DashboardOverview['repairOps']; loading: boolean }) {
  const hasDebt = (ops?.unpaidDebtCount ?? 0) > 0

  return (
    <Link href="/repairs" className="block">
      <PCard urgent={hasDebt} className="p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-rose-50 dark:bg-rose-900/20">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">หนี้ค้างชำระ</p>
        </div>
        {loading ? <Skel className="h-14 w-full" /> : (
          <>
            <p className={cn(
              'text-xl font-black tabular-nums',
              hasDebt ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white',
            )}>
              {formatThaiMoney(ops?.unpaidDebtTotal ?? 0)}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {ops?.unpaidDebtCount ?? 0} งาน{!hasDebt ? ' · ไม่มีหนี้ค้าง' : ''}
            </p>
            {hasDebt && (
              <div className="flex items-center gap-1 mt-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                <ArrowRight className="h-3 w-3" />ดูงานค้างชำระ
              </div>
            )}
          </>
        )}
      </PCard>
    </Link>
  )
}

// ── Expenses widget ────────────────────────────────────────────────────────────

function ExpensesWidget({
  today, loading, highExpenses,
}: { today?: OwnerSummaryData['today']; loading: boolean; highExpenses?: boolean }) {
  const ratio = today && today.totalRevenue > 0
    ? Math.min(100, Math.round((today.totalExpenses / today.totalRevenue) * 100))
    : 0

  return (
    <Link href="/expenses" className="block">
      <PCard urgent={highExpenses} className="p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-orange-50 dark:bg-orange-900/20">
            <ReceiptText className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">ค่าใช้จ่ายวันนี้</p>
        </div>
        {loading ? <Skel className="h-14 w-full" /> : (
          <>
            <p className={cn(
              'text-xl font-black tabular-nums',
              highExpenses ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white',
            )}>
              {formatThaiMoney(today?.totalExpenses ?? 0)}
            </p>
            {today && today.totalRevenue > 0 ? (
              <>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{ratio}% ของรายรับ</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      ratio >= 60 ? 'bg-red-500' : ratio >= 40 ? 'bg-amber-400' : 'bg-emerald-500',
                    )}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ยังไม่มีรายรับวันนี้</p>
            )}
          </>
        )}
      </PCard>
    </Link>
  )
}

// ── Low stock widget ───────────────────────────────────────────────────────────

function LowStockWidget({
  stock, loading,
}: { stock?: DashboardOverview['stock']; loading: boolean }) {
  const outOfStock = stock?.outOfStock ?? 0
  const lowStock   = stock?.lowStock ?? 0
  const total      = outOfStock + lowStock
  const urgent     = outOfStock > 0

  return (
    <Link href="/products" className="block">
      <PCard urgent={urgent} className="p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200 group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">สต็อกต่ำ</p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
        </div>
        {loading ? <Skel className="h-12 w-full" /> : (
          <div className="flex items-end gap-3">
            <div>
              <p className={cn(
                'text-2xl font-black tabular-nums leading-tight',
                urgent ? 'text-red-600 dark:text-red-400' : total > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white',
              )}>
                {total}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">รายการ</p>
            </div>
            {total > 0 ? (
              <div className="mb-0.5 space-y-0.5">
                {outOfStock > 0 && (
                  <p className="text-[10px] font-semibold text-red-500 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />{outOfStock} หมดสต็อก
                  </p>
                )}
                {lowStock > 0 && (
                  <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />{lowStock} ใกล้หมด
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-0.5">สต็อกปกติ ✓</p>
            )}
          </div>
        )}
      </PCard>
    </Link>
  )
}

// ── AI insight placeholder ─────────────────────────────────────────────────────

function AIInsightWidget() {
  return (
    <PCard className="p-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-50/70 to-transparent dark:from-violet-900/10 dark:to-transparent pointer-events-none rounded-2xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex-shrink-0 shadow-sm">
          <Brain className="h-[18px] w-[18px] text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-slate-800 dark:text-white">AI Insight</h3>
            <span className="text-[9px] font-bold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700/40 px-1.5 py-0.5 rounded-full">
              Coming Soon
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            วิเคราะห์รูปแบบยอดขาย แนะนำการจัดการสต็อก และคาดการณ์รายรับด้วย AI
          </p>
        </div>
      </div>
    </PCard>
  )
}

// ── Alerts timeline ────────────────────────────────────────────────────────────

type SeverityKey = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS'

const SEV_CFG: Record<SeverityKey, { cls: string; dot: string; text: string }> = {
  CRITICAL: { cls: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/60',     dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-400' },
  WARNING:  { cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/60', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400' },
  INFO:     { cls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/60',  dot: 'bg-blue-400',    text: 'text-blue-700 dark:text-blue-400' },
  SUCCESS:  { cls: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/60', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
}

function AlertsTimelineWidget({
  notifications, activities, loading,
}: {
  notifications?: DashboardOverview['notifications']
  activities?: DashboardOverview['recentActivities']
  loading: boolean
}) {
  const items = useMemo(() => {
    const notifs = (notifications?.latest ?? []).map(n => ({
      id: n.id,
      title: n.title,
      sub: n.message,
      severity: (n.severity as SeverityKey) ?? 'INFO',
      time: n.createdAt,
    }))
    const acts = (activities ?? []).slice(0, 5).map(a => ({
      id: a.id,
      title: a.action.replace(/_/g, ' ').toLowerCase(),
      sub: a.actorName ?? '',
      severity: 'INFO' as SeverityKey,
      time: a.createdAt,
    }))
    return [...notifs, ...acts]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 7)
  }, [notifications, activities])

  return (
    <PCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-rose-50 dark:bg-rose-900/20">
          <Activity className="h-3.5 w-3.5 text-rose-500" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-white text-sm">Timeline วันนี้</h3>
        {notifications && notifications.unreadCount > 0 && (
          <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {notifications.unreadCount}
          </span>
        )}
        <Link href="/notifications" className="ml-auto text-[10px] text-blue-500 font-semibold hover:underline flex items-center gap-0.5">
          ดูทั้งหมด <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skel key={i} className="h-11 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
          <Bell className="h-8 w-8 opacity-25" />
          <p className="text-sm">ไม่มีการแจ้งเตือนวันนี้</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const cfg = SEV_CFG[item.severity] ?? SEV_CFG.INFO
            return (
              <div key={item.id} className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2', cfg.cls)}>
                <span className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-semibold line-clamp-1', cfg.text)}>{item.title}</p>
                  {item.sub && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{item.sub}</p>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                  {(() => {
                    try { return formatDistanceToNow(new Date(item.time), { locale: th, addSuffix: true }) }
                    catch { return '' }
                  })()}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PCard>
  )
}

// ── Branch health (multi-branch only) ─────────────────────────────────────────

const HEALTH_CFG = {
  NORMAL:   { label: 'ปกติ',  cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/60' },
  WARNING:  { label: 'ระวัง', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/60' },
  CRITICAL: { label: 'วิกฤต', cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700/60' },
}

function BranchHealthWidget({
  branches, loading,
}: { branches?: DashboardOverview['branchPerformance']; loading: boolean }) {
  if (!loading && (!branches || branches.length <= 1)) return null

  return (
    <PCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-blue-50 dark:bg-blue-900/30">
          <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="font-bold text-slate-800 dark:text-white text-sm">สถานะสาขา</h3>
        <Link href="/branches" className="ml-auto text-[10px] text-blue-500 font-semibold hover:underline flex items-center gap-0.5">
          จัดการ <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skel key={i} className="h-9 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {(branches ?? []).slice(0, 6).map(b => {
            const cfg = HEALTH_CFG[b.health]
            return (
              <div key={b.branchId} className="flex items-center gap-3 py-0.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1 truncate">{b.name}</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatThaiMoney(b.totalRevenue)}
                </span>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0', cfg.cls)}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PCard>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OwnerCommandCenter() {
  const user = useAuthStore(s => s.user)
  const { branchId: contextBranchId } = useBranchContext()

  const thaiNow = new Date(Date.now() + 7 * 3_600_000)
  const todayStr = thaiNow.toISOString().slice(0, 10)
  const hour = thaiNow.getHours()
  const greeting = hour < 12 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'

  const queryParams = contextBranchId ? { branchId: contextBranchId } : {}

  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview', queryParams],
    queryFn: () => api.get('/dashboard/overview', {
      params: contextBranchId ? { branchId: contextBranchId } : undefined,
    }).then(r => r.data),
    staleTime: 3 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const { data: summary, isLoading: sumLoading, refetch: refetchSum } = useQuery<OwnerSummaryData>({
    queryKey: ['dashboard-owner-summary'],
    queryFn: () => api.get('/dashboard/owner-summary').then(r => r.data),
    staleTime: 3 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const loading     = ovLoading || sumLoading
  const today       = summary?.today
  const ops         = overview?.repairOps
  const multiSite   = (overview?.branchPerformance?.length ?? 0) > 1

  const netProfitPct = today && today.totalRevenue > 0
    ? Math.round((today.netProfit / today.totalRevenue) * 100)
    : null

  function handleRefresh() {
    refetchOv()
    refetchSum()
  }

  return (
    <div className="space-y-4 pb-10 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">
            {greeting}, {user?.name?.split(' ')[0] ?? 'เจ้าของ'} 👋
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {format(thaiNow, 'EEEEที่ d MMMM yyyy', { locale: th })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BranchContextBar />
          {overview?.currentShift?.isOpen ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/60 px-2.5 py-1.5 rounded-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              กะเปิดอยู่
            </span>
          ) : (
            <Link
              href="/shifts"
              className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/60 px-2.5 py-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <Clock className="h-3.5 w-3.5" />เปิดกะ
            </Link>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
            aria-label="รีเฟรชข้อมูล"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="รายรับวันนี้"
          value={loading ? '...' : formatThaiMoney(today?.totalRevenue ?? 0)}
          sub={today
            ? `ขาย ${formatThaiMoney(today.salesRevenue)} · ซ่อม ${formatThaiMoney(today.repairRevenue)}`
            : undefined}
          icon={Banknote}
          accentColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          loading={loading}
          href="/reports/daily-closing"
          trend={summary?.health.belowAverageSales ? 'down' : null}
        />
        <KpiCard
          label="กำไรสุทธิวันนี้"
          value={loading ? '...' : formatThaiMoney(today?.netProfit ?? 0)}
          sub={netProfitPct !== null ? `margin ${netProfitPct}%` : undefined}
          icon={TrendingUp}
          accentColor={netProfitPct !== null && netProfitPct < 0 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}
          iconBg={netProfitPct !== null && netProfitPct < 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-blue-50 dark:bg-blue-900/20'}
          urgent={netProfitPct !== null && netProfitPct < 0}
          loading={loading}
          href="/reports/profit"
          trend={netProfitPct !== null && netProfitPct < 10 ? 'down' : netProfitPct !== null ? 'up' : null}
        />
        <KpiCard
          label="งานซ่อมเปิดอยู่"
          value={loading ? '...' : String(ops?.openRepairs ?? 0)}
          sub={(ops?.overdueRepairs ?? 0) > 0
            ? `เกินกำหนด ${ops!.overdueRepairs} งาน`
            : 'ทุกงานยังในกำหนด'}
          icon={Wrench}
          accentColor="text-purple-600 dark:text-purple-400"
          iconBg="bg-purple-50 dark:bg-purple-900/20"
          urgent={(ops?.overdueRepairs ?? 0) > 0}
          loading={loading}
          href="/repairs"
        />
        <KpiCard
          label="รอรับสินค้า"
          value={loading ? '...' : String(ops?.completedNotDelivered ?? 0)}
          sub={(ops?.completedNotDelivered ?? 0) > 0 ? 'รอลูกค้ามารับ' : 'ส่งคืนครบแล้ว'}
          icon={CheckCircle2}
          accentColor="text-teal-600 dark:text-teal-400"
          iconBg="bg-teal-50 dark:bg-teal-900/20"
          loading={loading}
          href="/repairs"
        />
      </div>

      {/* ── Chart + Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChartWidget data={overview?.weeklyRevenue} loading={loading} />
        </div>
        <QuickActionsWidget />
      </div>

      {/* ── Operations Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RepairQueueWidget ops={ops} loading={loading} />
        <BestTechWidget techs={overview?.topTechnicians} loading={loading} />
        <DebtWidget ops={ops} loading={loading} />
        <ExpensesWidget
          today={today}
          loading={loading}
          highExpenses={summary?.health.highExpenses}
        />
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AlertsTimelineWidget
            notifications={overview?.notifications}
            activities={overview?.recentActivities}
            loading={loading}
          />
        </div>
        <div className="space-y-4">
          <LowStockWidget stock={overview?.stock} loading={loading} />
          <AIInsightWidget />
        </div>
      </div>

      {/* ── Branch Health (multi-branch only) ── */}
      {multiSite && (
        <BranchHealthWidget branches={overview?.branchPerformance} loading={loading} />
      )}

    </div>
  )
}
