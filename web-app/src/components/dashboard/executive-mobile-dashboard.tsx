'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, LabelList, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis,
} from 'recharts'
import {
  Bell, Wrench, ShoppingCart, Users, UserPlus, ChevronRight, ChevronDown,
  TrendingUp, TrendingDown, Package, CalendarDays, BarChart2,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useShopName } from '@/hooks/useShopName'
import { formatThaiMoney, cn } from '@/lib/utils'
import api from '@/lib/api'

// ── Local types (subset of full dashboard types) ───────────────────────────────

interface Overview {
  finance: { totalRevenue: number; salesCount: number; netProfit: number; grossProfit: number }
  repairOps: { openRepairs: number; waitingParts: number; inProgress: number; completedNotDelivered: number }
  weeklyRevenue: { date: string; total: number; sales: number; repairs: number }[]
  notifications: { unreadCount: number }
}

interface OwnerSummary {
  today: { totalRevenue: number; netProfit: number; newCustomers: number }
}

interface LowProduct {
  id: string; name: string; currentStock: number; imageUrl?: string
}

// ── Role display ───────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'เจ้าของร้าน', MANAGER: 'ผู้จัดการ', SUPER_ADMIN: 'ผู้ดูแลระบบ',
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ExecutiveMobileDashboard() {
  const user     = useAuthStore((s) => s.user)
  const shopName = useShopName()

  const thaiNow  = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const todayStr = thaiNow.toISOString().slice(0, 10)

  const { data: overview } = useQuery<Overview>({
    queryKey: ['dashboard-overview', { startDate: todayStr, endDate: todayStr }],
    queryFn:  async () => (await api.get('/dashboard/overview', { params: { startDate: todayStr, endDate: todayStr } })).data,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: ownerSummary } = useQuery<OwnerSummary>({
    queryKey: ['dashboard-owner-summary'],
    queryFn:  async () => (await api.get('/dashboard/owner-summary')).data,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: lowProducts = [] } = useQuery<LowProduct[]>({
    queryKey: ['products-low-stock-widget'],
    queryFn:  async () => {
      const res = await api.get('/products', { params: { isActive: true, limit: 12, sortBy: 'currentStock', order: 'asc' } })
      const list: LowProduct[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
      return list.filter((p) => p.currentStock <= 5)
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Derived values ───────────────────────────────────────────────────────────

  const sparkData = overview?.weeklyRevenue ?? []

  const todayRevenue = ownerSummary?.today.totalRevenue ?? 0
  const todayProfit  = ownerSummary?.today.netProfit ?? 0

  const salesPct = useMemo(() => {
    const len = sparkData.length
    if (len < 2) return null
    const tod = sparkData[len - 1]?.total ?? 0
    const yes = sparkData[len - 2]?.total ?? 0
    if (yes === 0) return null
    return ((tod - yes) / yes * 100).toFixed(1)
  }, [sparkData])

  const received     = Math.max(0,
    (overview?.repairOps.openRepairs ?? 0) -
    (overview?.repairOps.inProgress ?? 0) -
    (overview?.repairOps.waitingParts ?? 0) -
    (overview?.repairOps.completedNotDelivered ?? 0),
  )
  const inProgress   = overview?.repairOps.inProgress ?? 0
  const waitingParts = overview?.repairOps.waitingParts ?? 0
  const readyPickup  = overview?.repairOps.completedNotDelivered ?? 0
  const totalRepairs = received + inProgress + waitingParts + readyPickup

  const donutData = [
    { name: 'รอรับเครื่อง',    value: received,     color: '#3B82F6' },
    { name: 'กำลังซ่อม',       value: inProgress,   color: '#F59E0B' },
    { name: 'รออะไหล่',         value: waitingParts, color: '#8B5CF6' },
    { name: 'ซ่อมเสร็จ รอรับ', value: readyPickup,  color: '#10B981' },
  ]

  const quickStats = [
    { label: 'งานซ่อมค้าง', value: overview?.repairOps.openRepairs ?? 0, unit: 'งาน',   icon: Wrench,    bg: 'bg-blue-50',   fg: 'text-blue-600',   href: '/repairs'   },
    { label: 'รอรับเครื่อง', value: readyPickup,                          unit: 'งาน',   icon: Package,   bg: 'bg-orange-50', fg: 'text-orange-500', href: '/repairs'   },
    { label: 'ขายสินค้า',    value: overview?.finance.salesCount ?? 0,    unit: 'รายการ', icon: ShoppingCart, bg: 'bg-purple-50', fg: 'text-purple-600', href: '/sales' },
    { label: 'ลูกค้าใหม่',    value: ownerSummary?.today.newCustomers ?? 0, unit: 'คน', icon: UserPlus,  bg: 'bg-green-50',  fg: 'text-green-600',  href: '/customers' },
  ]

  const barData = sparkData.map((d, i) => ({
    name:  format(new Date(d.date), 'd MMM', { locale: th }),
    total: d.total,
    last:  i === sparkData.length - 1,
  }))

  const unread    = overview?.notifications.unreadCount ?? 0
  const initials  = user?.name?.charAt(0)?.toUpperCase() ?? 'U'
  const greeting  = ROLE_LABEL[user?.role ?? ''] ?? user?.name ?? ''
  const dateLabel = format(thaiNow, 'd MMMM yyyy', { locale: th })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-100 min-h-screen pb-20">

      {/* ── Sticky header ── */}
      <div className="bg-white dark:bg-[#1E293B] border-b border-slate-100 dark:border-slate-700/60 px-4 pt-3 pb-3 flex items-center justify-between sticky top-0 z-40 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {/* Hamburger — dispatches event caught by layout */}
          <button
            className="p-1.5 -ml-1 rounded-lg hover:bg-slate-100 flex flex-col gap-1"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          >
            <span className="block w-5 h-0.5 bg-slate-600 rounded" />
            <span className="block w-3.5 h-0.5 bg-slate-600 rounded" />
            <span className="block w-5 h-0.5 bg-slate-600 rounded" />
          </button>
          <div>
            <div className="text-[17px] font-bold leading-none tracking-tight">
              <span className="text-slate-800">FixIT</span>
              <span className="text-blue-600">Pro</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">สวัสดีครับ {greeting}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/notifications" className="relative p-2 rounded-xl hover:bg-slate-50">
            <Bell className="h-5 w-5 text-slate-600" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-[11px] font-bold">{initials}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── Date bar ── */}
        <div className="inline-flex items-center gap-2 bg-white dark:bg-[#1E293B] rounded-full px-4 py-2.5 shadow-sm border border-slate-100 dark:border-slate-700/60">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">{dateLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* ── KPI gradient cards ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Sales */}
          <div className="rounded-2xl p-4 bg-gradient-to-br from-blue-500 to-blue-700 overflow-hidden relative shadow-lg shadow-blue-500/20">
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
            <div className="absolute top-8 -right-2 w-12 h-12 bg-white/5 rounded-full" />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-2">
                <p className="text-white/80 text-[11px] font-medium leading-tight">ยอดขายวันนี้</p>
                <div className="bg-white/20 rounded-xl p-1.5 backdrop-blur-sm">
                  <ShoppingCart className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <p className="text-white text-[19px] font-bold leading-tight">{formatThaiMoney(todayRevenue)}</p>
              {salesPct !== null && (
                <div className="flex items-center gap-1 mt-0.5">
                  {parseFloat(salesPct) >= 0
                    ? <TrendingUp className="h-3 w-3 text-white/70" />
                    : <TrendingDown className="h-3 w-3 text-white/70" />
                  }
                  <span className="text-white/70 text-[10px]">
                    {parseFloat(salesPct) >= 0 ? '+' : ''}{salesPct}% จากเมื่อวาน
                  </span>
                </div>
              )}
              {sparkData.length > 1 && (
                <div className="h-10 mt-2 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <Area type="monotone" dataKey="total" stroke="rgba(255,255,255,0.7)"
                        fill="rgba(255,255,255,0.15)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Profit */}
          <div className="rounded-2xl p-4 bg-gradient-to-br from-emerald-500 to-emerald-700 overflow-hidden relative shadow-lg shadow-emerald-500/20">
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
            <div className="absolute top-8 -right-2 w-12 h-12 bg-white/5 rounded-full" />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-2">
                <p className="text-white/80 text-[11px] font-medium leading-tight">กำไรวันนี้</p>
                <div className="bg-white/20 rounded-xl p-1.5 backdrop-blur-sm">
                  <BarChart2 className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <p className="text-white text-[19px] font-bold leading-tight">{formatThaiMoney(todayProfit)}</p>
              <p className="text-white/60 text-[10px] mt-0.5">กำไรสุทธิ</p>
              {sparkData.length > 1 && (
                <div className="h-10 mt-2 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <Area type="monotone" dataKey="sales" stroke="rgba(255,255,255,0.7)"
                        fill="rgba(255,255,255,0.15)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Quick stats ── */}
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] border border-slate-100 dark:border-slate-700/60">
          <div className="grid grid-cols-4 divide-x divide-slate-100">
            {quickStats.map((stat) => {
              const Icon = stat.icon
              return (
                <Link key={stat.label} href={stat.href}
                  className="flex flex-col items-center text-center gap-1.5 px-1 first:pl-0 last:pr-0"
                >
                  <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center', stat.bg)}>
                    <Icon className={cn('h-5 w-5', stat.fg)} />
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight px-0.5">{stat.label}</p>
                  <div>
                    <span className="text-[15px] font-bold text-slate-800">{stat.value}</span>
                    <span className="text-[9px] text-slate-400 ml-0.5">{stat.unit}</span>
                  </div>
                  <p className="text-[9px] text-blue-500 font-medium">ดูทั้งหมด &rsaquo;</p>
                </Link>
              )
            })}
          </div>
        </div>

        {/* ── Repair status donut ── */}
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] border border-slate-100 dark:border-slate-700/60">
          <p className="text-[13px] font-semibold text-slate-800 mb-3">งานซ่อมสถานะ</p>
          <div className="flex items-center gap-3">
            {/* Donut */}
            <div className="relative h-[96px] w-[96px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totalRepairs > 0 ? donutData.filter(d => d.value > 0) : [{ name: '-', value: 1, color: '#E2E8F0' }]}
                    cx="50%" cy="50%"
                    innerRadius={30} outerRadius={44}
                    paddingAngle={donutData.filter(d => d.value > 0).length > 1 ? 3 : 0}
                    dataKey="value" isAnimationActive={false}
                    startAngle={90} endAngle={-270}
                  >
                    {(totalRepairs > 0 ? donutData.filter(d => d.value > 0) : [{ color: '#E2E8F0' }]).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[9px] text-slate-400 leading-none">รวมทั้งหมด</p>
                <p className="text-[17px] font-bold text-slate-800 leading-none mt-0.5">{totalRepairs}</p>
                <p className="text-[9px] text-slate-400 leading-none">งาน</p>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2.5">
              {[
                { label: 'รอรับเครื่อง',    value: received,     color: '#3B82F6', href: '/repairs' },
                { label: 'กำลังซ่อม',       value: inProgress,   color: '#F59E0B', href: '/repairs' },
                { label: 'รออะไหล่',         value: waitingParts, color: '#8B5CF6', href: '/repairs' },
                { label: 'ซ่อมเสร็จ รอรับ', value: readyPickup,  color: '#10B981', href: '/repairs' },
              ].map((item) => (
                <Link key={item.label} href={item.href}
                  className="flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-slate-600 leading-none">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-800">{item.value} งาน</span>
                    <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Low stock products ── */}
        {lowProducts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-slate-800">สินค้าใกล้หมด</p>
              <Link href="/products" className="text-[11px] text-blue-600 font-medium flex items-center gap-0.5">
                ดูทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
              {lowProducts.slice(0, 8).map((product) => (
                <Link key={product.id} href="/products"
                  className="snap-start shrink-0 w-[90px] bg-white dark:bg-[#1E293B] rounded-2xl p-3 flex flex-col items-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] border border-slate-100 hover:border-blue-200 transition-colors"
                >
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name}
                      className="h-14 w-14 object-contain rounded-xl"
                    />
                  ) : (
                    <div className="h-14 w-14 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100">
                      <Package className="h-7 w-7 text-slate-300" />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-700 font-medium text-center leading-tight line-clamp-2 w-full">
                    {product.name}
                  </p>
                  <p className={cn(
                    'text-[10px] font-semibold leading-none',
                    product.currentStock === 0 ? 'text-red-500' : 'text-orange-500',
                  )}>
                    {product.currentStock === 0 ? 'หมดแล้ว' : `เหลือ ${product.currentStock} ชิ้น`}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Weekly bar chart ── */}
        {barData.length > 0 && (
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] border border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-slate-800">ยอดขาย 7 วันที่ผ่านมา</p>
              <Link href="/reports" className="text-[11px] text-blue-600 font-medium flex items-center gap-0.5">
                ดูรายงาน <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 18, right: 4, left: -20, bottom: 0 }} barCategoryGap="28%">
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(val) => [formatThaiMoney(Number(val ?? 0)), 'ยอดขาย']}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                    cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                  />
                  <Bar dataKey="total" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(v) => { const n = Number(v ?? 0); return n > 0 ? `฿${(n/1000).toFixed(n%1000===0?0:1)}K` : '' }}
                      style={{ fontSize: 8, fill: '#64748B', fontWeight: 600 }}
                    />
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.last ? '#3B82F6' : '#BFDBFE'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
