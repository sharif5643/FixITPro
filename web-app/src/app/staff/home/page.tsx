'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Wrench, ShoppingCart, Package, Users, TrendingUp,
  ChevronRight, FileText, BarChart2, MessageCircle, Calendar,
  LayoutGrid, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDistanceToNow, subDays, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Stats {
  todayRevenue:        number
  todayProfit:         number
  pendingRepairs:      number
  todayDeliveries:     number
  completedDeliveries: number
  lowStockItems:       number
  unreadNotifs:        number
  revenueChange:       number
  profitChange:        number
}
interface Repair {
  id: string; ticketNumber: string; status: string; issueTitle?: string
  deviceBrand: string; deviceModel: string; customerName?: string; createdAt: string
}
interface Notif { id: string; type: string; title: string; body: string; createdAt: string }
interface TopProduct { id: string; name: string; soldQty: number; totalRevenue: number }

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmt = (n: number) => n.toLocaleString('th-TH')

const REPAIR_LABEL: Record<string,string> = {
  PENDING:'รอตรวจสอบ', IN_PROGRESS:'กำลังซ่อม', WAIT_PARTS:'รออะไหล่',
  WAIT_PICKUP:'รอรับเครื่อง', COMPLETED:'เสร็จสิ้น', CANCELLED:'ยกเลิก',
}
const REPAIR_STYLE: Record<string,string> = {
  PENDING:'bg-blue-50 text-blue-600', IN_PROGRESS:'bg-amber-50 text-amber-600',
  WAIT_PARTS:'bg-orange-50 text-orange-600', WAIT_PICKUP:'bg-purple-50 text-purple-600',
  COMPLETED:'bg-emerald-50 text-emerald-600', CANCELLED:'bg-red-50 text-red-500',
}

function last7Days() {
  return Array.from({length:7}, (_,i) => ({
    label: format(subDays(new Date(), 6-i), 'EEE', {locale:th}),
    revenue: 0,
  }))
}

/* ─── Skeletons ──────────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`shimmer-block rounded-xl ${className}`}/>
}
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <Skeleton className="h-9 w-9 mb-3"/>
          <Skeleton className="h-6 w-24 mb-1.5"/>
          <Skeleton className="h-3 w-16"/>
        </div>
      ))}
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────── */
function ChangeBadge({ pct }: { pct: number }) {
  if (!pct) return null
  const up = pct >= 0
  return (
    <span className={`text-[10px] font-bold ${up ? 'text-emerald-500' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

interface KpiProps {
  label: string; value: string; sub?: string
  iconBg: string; iconColor: string; icon: React.ReactNode
  change?: number; onClick?: () => void
}
function KpiCard({ label, value, sub, iconBg, iconColor, icon, change, onClick }: KpiProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] text-left active:scale-[0.98] transition-transform"
    >
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-[18px] font-extrabold leading-tight text-[#111]">{value}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p className="text-[11px] text-slate-400">{label}</p>
        {change !== undefined && <ChangeBadge pct={change}/>}
      </div>
      {sub && <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p>}
    </button>
  )
}

/* ─── Main Dashboard ─────────────────────────────────────────────────── */
export default function HomePage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)

  const role       = (user?.role ?? '') as string
  const isOwner    = role === 'OWNER'
  const isManager  = role === 'MANAGER'
  const isTech     = role === 'TECHNICIAN'
  const canSeeRev  = isOwner || isManager
  const canSeePro  = isOwner

  const [stats,   setStats]   = useState<Stats>({ todayRevenue:0, todayProfit:0, pendingRepairs:0, todayDeliveries:0, completedDeliveries:0, lowStockItems:0, unreadNotifs:0, revenueChange:0, profitChange:0 })
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [notifs,  setNotifs]  = useState<Notif[]>([])
  const [topProd, setTopProd] = useState<TopProduct[]>([])
  const [weekly,  setWeekly]  = useState(last7Days())
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const [sRes, rRes, nRes, tRes, wRes] = await Promise.allSettled([
        api.get('/repairs/stats'),
        api.get('/repairs?limit=4&sort=createdAt:desc'),
        api.get('/notifications?limit=3&unread=true'),
        api.get('/products/stats/top-selling?limit=5'),
        api.get('/analytics/weekly'),
      ])

      if (sRes.status === 'fulfilled') {
        const d = sRes.value.data ?? {}
        setStats({
          todayRevenue:        d.todayRevenue     ?? d.totalRevenue ?? 0,
          todayProfit:         d.todayProfit      ?? 0,
          pendingRepairs:      d.pendingRepairs   ?? d.pending ?? 0,
          todayDeliveries:     d.todayDeliveries  ?? d.waitPickup ?? 0,
          completedDeliveries: d.completedToday   ?? 0,
          lowStockItems:       d.lowStockItems    ?? 0,
          unreadNotifs:        d.unreadNotifs     ?? 0,
          revenueChange:       d.revenueChange    ?? 0,
          profitChange:        d.profitChange     ?? 0,
        })
      }

      if (rRes.status === 'fulfilled') {
        const list = rRes.value.data?.data ?? rRes.value.data ?? []
        setRepairs(Array.isArray(list) ? list.slice(0,4) : [])
      }

      if (nRes.status === 'fulfilled') {
        const list = nRes.value.data?.data ?? nRes.value.data ?? []
        setNotifs(Array.isArray(list) ? list.slice(0,3) : [])
      }

      if (tRes.status === 'fulfilled') {
        const list = tRes.value.data?.data ?? tRes.value.data ?? []
        setTopProd(Array.isArray(list) ? list.slice(0,5) : [])
      }

      if (wRes.status === 'fulfilled') {
        const list = wRes.value.data?.data ?? wRes.value.data ?? []
        if (Array.isArray(list) && list.length) {
          setWeekly(list.slice(-7).map((d: any) => ({
            label: format(new Date(d.date), 'EEE', {locale:th}),
            revenue: d.revenue ?? 0,
          })))
        }
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const initials = user?.name?.split(' ').map((n:string) => n[0]).slice(0,2).join('').toUpperCase() ?? '??'
  const roleTH   = { OWNER:'เจ้าของร้าน', MANAGER:'ผู้จัดการ', TECHNICIAN:'ช่างซ่อม', STAFF:'พนักงาน' }[role] ?? 'พนักงาน'
  const roleBadgeStyle = isOwner ? 'bg-amber-100 text-amber-700' : isManager ? 'bg-blue-100 text-blue-700' : isTech ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'

  /* ── Quick menu ── */
  const QUICK_ALL = [
    { icon:<Wrench/>,        label:'รับงาน',    to:'/staff/create',      bg:'bg-[#FFF8E7]', ic:'text-[#F59E0B]' },
    { icon:<ShoppingCart/>,  label:'POS',        to:'/staff/pos',         bg:'bg-[#F0FDF4]', ic:'text-[#22C55E]' },
    { icon:<Package/>,       label:'สต็อก',     to:'/staff/stock',       bg:'bg-[#FFF1F2]', ic:'text-[#F43F5E]' },
    { icon:<Users/>,         label:'ลูกค้า',    to:'/staff/customers',   bg:'bg-[#F5F3FF]', ic:'text-[#8B5CF6]' },
    { icon:<FileText/>,      label:'ใบเสร็จ',   to:'/staff/pos',         bg:'bg-[#FFF7ED]', ic:'text-[#F97316]' },
    { icon:<BarChart2/>,     label:'รายงาน',    to:'/staff/reports',     bg:'bg-[#F0FDF4]', ic:'text-[#10B981]' },
    { icon:<TrendingUp/>,    label:'ยอดขาย',   to:'/staff/reports',     bg:'bg-[#EFF6FF]', ic:'text-[#3B82F6]' },
    { icon:<MessageCircle/>, label:'แชท',       to:'/staff/chat',        bg:'bg-[#F0FDF4]', ic:'text-[#22C55E]' },
    { icon:<Calendar/>,      label:'นัดหมาย',  to:'/staff/notifications',bg:'bg-[#EFF6FF]', ic:'text-[#3B82F6]' },
    { icon:<LayoutGrid/>,    label:'เพิ่มเติม', to:'/staff/more',        bg:'bg-[#F8F9FB]', ic:'text-[#6B7280]' },
  ]
  const QUICK = isTech
    ? QUICK_ALL.filter(q => ['รับงาน','แชท','นัดหมาย','เพิ่มเติม'].includes(q.label))
    : QUICK_ALL

  /* ── Notif icons ── */
  const NOTIF_ICON: Record<string,{ bg:string; ic:string }> = {
    REPAIR:    { bg:'bg-amber-50',   ic:'text-amber-500' },
    STOCK:     { bg:'bg-red-50',     ic:'text-red-500'   },
    SYSTEM:    { bg:'bg-blue-50',    ic:'text-blue-500'  },
    CHAT:      { bg:'bg-green-50',   ic:'text-green-500' },
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">

      {/* ── Header ── */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Left: avatar + name */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow text-[15px] font-bold text-brand-black shadow-sm">
              {initials}
            </div>
            <div>
              <p className="text-[12px] text-slate-400">สวัสดีครับ 👋</p>
              <div className="flex items-center gap-2">
                <p className="font-bold text-[#111] leading-tight">{user?.name?.split(' ')[0] ?? 'ผู้ใช้'}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeStyle}`}>
                  {roleTH}
                </span>
              </div>
            </div>
          </div>

          {/* Right: bell + branch */}
          <div className="flex items-center gap-2">
            {(isOwner || isManager) && (
              <button className="flex h-9 items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F8F9FB] px-3 text-[11px] font-semibold text-slate-600">
                {isOwner ? 'ทุกสาขา' : 'สาขาหลัก'} <span className="text-[9px]">▼</span>
              </button>
            )}
            <button
              onClick={() => router.push('/staff/notifications')}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F8F9FB]"
            >
              <Bell className="h-5 w-5 text-slate-600"/>
              {stats.unreadNotifs > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {stats.unreadNotifs > 9 ? '9+' : stats.unreadNotifs}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-5">

        {/* ── Error state ── */}
        {error && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="h-8 w-8 text-red-400"/>
            <p className="text-sm text-slate-500">โหลดข้อมูลไม่สำเร็จ</p>
            <button onClick={load} className="flex items-center gap-1.5 rounded-xl bg-brand-yellow px-4 py-2 text-sm font-bold text-brand-black">
              <RefreshCw className="h-4 w-4"/> ลองใหม่
            </button>
          </div>
        )}

        {/* ── KPI Cards ── */}
        {loading ? <KpiSkeleton/> : (
          <div className="grid grid-cols-2 gap-3">
            {canSeeRev && (
              <KpiCard
                label="รายได้วันนี้" value={`฿${fmt(stats.todayRevenue)}`}
                iconBg="bg-emerald-50" iconColor="text-emerald-600"
                icon={<TrendingUp className="h-5 w-5"/>}
                change={stats.revenueChange}
              />
            )}
            {canSeePro && (
              <KpiCard
                label="กำไรวันนี้" value={`฿${fmt(stats.todayProfit)}`}
                iconBg="bg-blue-50" iconColor="text-blue-600"
                icon={<BarChart2 className="h-5 w-5"/>}
                change={stats.profitChange}
              />
            )}
            {!canSeeRev && (
              <KpiCard
                label="งานของฉันวันนี้" value={`${stats.pendingRepairs} งาน`}
                iconBg="bg-amber-50" iconColor="text-amber-600"
                icon={<Wrench className="h-5 w-5"/>}
                onClick={() => router.push('/staff/repairs')}
              />
            )}
            <KpiCard
              label="งานซ่อมค้าง" value={`${stats.pendingRepairs} งาน`}
              iconBg="bg-amber-50" iconColor="text-amber-600"
              icon={<Wrench className="h-5 w-5"/>}
              onClick={() => router.push('/staff/repairs')}
            />
            <KpiCard
              label="ส่งมอบวันนี้" value={`${stats.todayDeliveries} งาน`}
              sub={stats.completedDeliveries ? `เสร็จแล้ว ${stats.completedDeliveries} งาน` : undefined}
              iconBg="bg-purple-50" iconColor="text-purple-600"
              icon={<Package className="h-5 w-5"/>}
              onClick={() => router.push('/staff/repairs?status=WAIT_PICKUP')}
            />
            {!canSeeRev && (
              <KpiCard
                label="สินค้าใกล้หมด" value={`${stats.lowStockItems} รายการ`}
                iconBg="bg-red-50" iconColor="text-red-500"
                icon={<AlertTriangle className="h-5 w-5"/>}
                onClick={() => router.push('/staff/stock')}
              />
            )}
          </div>
        )}

        {/* ── Quick menu ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-bold text-[#111]">เมนูด่วน</p>
          </div>
          <div className="grid grid-cols-5 gap-2.5">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => router.push(q.to)}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${q.bg}`}>
                  <span className={`[&>svg]:h-6 [&>svg]:w-6 ${q.ic}`}>{q.icon}</span>
                </div>
                <span className="text-center text-[10px] font-semibold leading-tight text-slate-600">{q.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Recent repairs ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-bold text-[#111]">งานซ่อมล่าสุด</p>
            <button onClick={() => router.push('/staff/repairs')} className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-yellow">
              ดูทั้งหมด<ChevronRight className="h-3.5 w-3.5"/>
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-xl"/>
                  <div className="flex-1 flex flex-col gap-2">
                    <Skeleton className="h-3 w-24"/>
                    <Skeleton className="h-4 w-40"/>
                    <Skeleton className="h-3 w-28"/>
                  </div>
                </div>
              ))}
            </div>
          ) : repairs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Wrench className="h-9 w-9 text-slate-200"/>
              <p className="text-sm text-slate-400">ยังไม่มีงานซ่อม</p>
              <button onClick={() => router.push('/staff/create')} className="rounded-xl bg-brand-yellow px-4 py-2 text-sm font-bold text-brand-black">
                รับงานซ่อมใหม่
              </button>
            </div>
          ) : repairs.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/staff/repairs/${r.id}`)}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <Wrench className="h-5 w-5 text-amber-500" strokeWidth={2}/>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[11px] font-bold text-slate-400">{r.ticketNumber}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REPAIR_STYLE[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                    {REPAIR_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <p className="text-[13px] font-semibold text-[#111] truncate">{r.deviceBrand} {r.deviceModel}</p>
                {r.customerName && <p className="text-[11px] text-slate-400 truncate">{r.customerName}</p>}
                {r.issueTitle   && <p className="text-[11px] text-slate-500 truncate">{r.issueTitle}</p>}
              </div>
              <p className="shrink-0 text-[10px] text-slate-400 whitespace-nowrap">
                {formatDistanceToNow(new Date(r.createdAt), { addSuffix:true, locale:th })}
              </p>
            </button>
          ))}
        </div>

        {/* ── Revenue chart — owner/manager only ── */}
        {canSeeRev && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="mb-1 flex items-start justify-between">
              <div>
                <p className="text-[13px] font-bold text-[#111]">ภาพรวมรายได้ (7 วัน)</p>
                <p className="text-[20px] font-extrabold text-[#111]">฿{fmt(stats.todayRevenue * 7)}</p>
                <ChangeBadge pct={stats.revenueChange}/>
              </div>
            </div>
            <div className="mt-3 h-[100px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly} margin={{top:4,right:4,left:4,bottom:0}}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#FFC107" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FFC107" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{fontSize:10, fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <Tooltip
                    contentStyle={{borderRadius:12, border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.12)', fontSize:12}}
                    formatter={(v: any) => [`฿${fmt(Number(v))}`, 'รายได้'] as [string, string]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#FFC107" strokeWidth={2.5} fill="url(#revGrad)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        {notifs.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-bold text-[#111]">การแจ้งเตือน</p>
              <button onClick={() => router.push('/staff/notifications')} className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-yellow">
                ดูทั้งหมด<ChevronRight className="h-3.5 w-3.5"/>
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {notifs.map((n) => {
                const s = NOTIF_ICON[n.type] ?? { bg:'bg-slate-50', ic:'text-slate-400' }
                return (
                  <div key={n.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.bg}`}>
                      <Bell className={`h-4 w-4 ${s.ic}`}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#111] truncate">{n.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{n.body}</p>
                    </div>
                    <p className="shrink-0 text-[10px] text-slate-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix:true, locale:th })}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Top products — owner/manager only ── */}
        {canSeeRev && topProd.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-bold text-[#111]">สินค้าขายดี 5 อันดับ</p>
              <button onClick={() => router.push('/staff/reports')} className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-yellow">
                ดูทั้งหมด<ChevronRight className="h-3.5 w-3.5"/>
              </button>
            </div>
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
              {topProd.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i < topProd.length-1 ? 'border-b border-[#F8F9FB]' : ''}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i===0?'bg-amber-400 text-white':i===1?'bg-slate-300 text-white':i===2?'bg-orange-300 text-white':'bg-[#F8F9FB] text-slate-400'}`}>
                    {i+1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111] truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-400">ขายแล้ว {p.soldQty} ชิ้น</p>
                  </div>
                  <p className="shrink-0 text-[13px] font-bold text-emerald-600">฿{fmt(p.totalRevenue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
