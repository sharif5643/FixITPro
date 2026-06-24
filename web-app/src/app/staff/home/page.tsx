'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Wrench, ShoppingCart, Wallet, CreditCard,
  TrendingUp, Clock, ChevronRight, Loader2, MapPin,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'

interface Stats {
  totalRevenue:    number
  pendingRepairs:  number
  lowStockItems:   number
  unreadNotifs:    number
}

interface Repair {
  id:          string
  ticketNumber: string
  status:      string
  customerName: string
  deviceBrand:  string
  deviceModel:  string
  createdAt:    string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:     'รอตรวจสอบ',
  IN_PROGRESS: 'กำลังซ่อม',
  WAIT_PARTS:  'รออะไหล่',
  WAIT_PICKUP: 'รอรับเครื่อง',
  COMPLETED:   'เสร็จสิ้น',
  CANCELLED:   'ยกเลิก',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-600',
  IN_PROGRESS: 'bg-blue-50 text-blue-600',
  WAIT_PARTS:  'bg-purple-50 text-purple-600',
  WAIT_PICKUP: 'bg-green-50 text-green-600',
  COMPLETED:   'bg-emerald-50 text-emerald-600',
  CANCELLED:   'bg-red-50 text-red-500',
}

export default function StaffHomePage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const branchName = typeof window !== 'undefined' ? localStorage.getItem('selectedBranchName') : null

  useEffect(() => {
    Promise.all([
      api.get('/repairs/stats').catch(() => ({ data: {} })),
      api.get('/repairs?limit=5&activeOnly=true').catch(() => ({ data: [] })),
    ]).then(([statsRes, repairsRes]) => {
      setStats({
        totalRevenue:   statsRes.data?.todayRevenue ?? statsRes.data?.totalRevenue ?? 0,
        pendingRepairs: statsRes.data?.pendingRepairs ?? statsRes.data?.pending ?? 0,
        lowStockItems:  statsRes.data?.lowStockItems ?? 0,
        unreadNotifs:   statsRes.data?.unreadNotifs ?? 0,
      })
      const list = repairsRes.data?.data ?? repairsRes.data ?? []
      setRepairs(Array.isArray(list) ? list.slice(0, 5) : [])
    }).finally(() => setLoading(false))
  }, [])

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const QUICK_ACTIONS = [
    { icon: Wrench,      label: 'รับงานซ่อม',   color: 'bg-brand-yellow',    to: '/staff/create'    },
    { icon: ShoppingCart,label: 'ขายสินค้า',    color: 'bg-brand-black',     to: '/staff/pos'       },
    { icon: Wallet,      label: 'เติมวอลเล็ต',  color: 'bg-brand-info',      to: '/staff/more'      },
    { icon: CreditCard,  label: 'รับชำระเงิน',  color: 'bg-brand-success',   to: '/staff/repairs'   },
  ]

  return (
    <div className="min-h-screen bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-5 pt-14 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow text-sm font-bold text-brand-black">
              {initials}
            </div>
            <div>
              <p className="text-xs text-slate-400">สวัสดี</p>
              <p className="font-semibold text-brand-black leading-tight">{user?.name || 'พนักงาน'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {branchName && (
              <div className="flex items-center gap-1 rounded-full bg-brand-light px-2.5 py-1">
                <MapPin className="h-3 w-3 text-brand-yellow" />
                <span className="text-[11px] font-medium text-slate-600 max-w-[80px] truncate">{branchName}</span>
              </div>
            )}
            <button
              onClick={() => router.push('/staff/notifications')}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-brand-light"
            >
              <Bell className="h-5 w-5 text-slate-600" />
              {stats?.unreadNotifs ? (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-danger text-[9px] font-bold text-white">
                  {stats.unreadNotifs > 9 ? '9+' : stats.unreadNotifs}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-5">
        {/* KPI cards */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="รายได้วันนี้"
              value={`฿${(stats?.totalRevenue ?? 0).toLocaleString()}`}
              sub="บาท"
              icon={<TrendingUp className="h-5 w-5" />}
              accent="bg-brand-yellow"
              iconBg="bg-brand-yellow/10 text-brand-yellow-dark"
            />
            <KpiCard
              label="งานซ่อมค้าง"
              value={String(stats?.pendingRepairs ?? 0)}
              sub="งาน"
              icon={<Wrench className="h-5 w-5" />}
              accent="bg-brand-info"
              iconBg="bg-brand-info/10 text-brand-info"
            />
            <KpiCard
              label="สินค้าใกล้หมด"
              value={String(stats?.lowStockItems ?? 0)}
              sub="รายการ"
              icon={<ShoppingCart className="h-5 w-5" />}
              accent="bg-brand-danger"
              iconBg="bg-brand-danger/10 text-brand-danger"
            />
            <KpiCard
              label="แจ้งเตือน"
              value={String(stats?.unreadNotifs ?? 0)}
              sub="รายการ"
              icon={<Bell className="h-5 w-5" />}
              accent="bg-brand-warning"
              iconBg="bg-brand-warning/10 text-brand-warning"
            />
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">เมนูด่วน</h2>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map(({ icon: Icon, label, color, to }) => (
              <button
                key={label}
                onClick={() => router.push(to)}
                className="flex flex-col items-center gap-3 rounded-[20px] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-transform"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
                  <Icon className="h-6 w-6 text-white" strokeWidth={2} />
                </div>
                <span className="text-sm font-semibold text-brand-black">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent repairs */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">งานล่าสุด</h2>
            <button
              onClick={() => router.push('/staff/repairs')}
              className="flex items-center gap-1 text-xs font-semibold text-brand-yellow"
            >
              ดูทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {repairs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-[20px] bg-white py-10 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
                <Wrench className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">ยังไม่มีงานซ่อม</p>
              </div>
            ) : (
              repairs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/staff/repairs/${r.id}`)}
                  className="flex items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/10">
                    <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-brand-black">{r.ticketNumber || r.id.slice(-8).toUpperCase()}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 truncate">{r.deviceBrand} {r.deviceModel}</p>
                    <p className="text-xs text-slate-400 truncate">{r.customerName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-300" />
                    <p className="text-[10px] text-slate-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: th })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, iconBg }: {
  label:   string
  value:   string
  sub:     string
  icon:    React.ReactNode
  accent?: string
  iconBg:  string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className="text-2xl font-extrabold text-brand-black leading-tight">{value}</p>
          <p className="text-xs text-slate-400">{sub}</p>
        </div>
      </div>
    </div>
  )
}
