'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Wrench, ShoppingCart, Package, Users,
  TrendingUp, Clock, ChevronRight, Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'

interface Repair {
  id: string; ticketNumber: string; status: string
  deviceBrand: string; deviceModel: string; createdAt: string
}

const S_LABEL: Record<string,string> = {
  PENDING:'รอตรวจสอบ', IN_PROGRESS:'กำลังซ่อม', WAIT_PARTS:'รออะไหล่',
  WAIT_PICKUP:'รอรับเครื่อง', COMPLETED:'เสร็จสิ้น', CANCELLED:'ยกเลิก',
}
const S_COLOR: Record<string,string> = {
  PENDING:'bg-blue-50 text-blue-600', IN_PROGRESS:'bg-amber-50 text-amber-600',
  WAIT_PARTS:'bg-orange-50 text-orange-600', WAIT_PICKUP:'bg-green-50 text-green-600',
  COMPLETED:'bg-emerald-50 text-emerald-600', CANCELLED:'bg-red-50 text-red-500',
}

export default function HomePage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const [stats,   setStats]   = useState({ revenue:0, pending:0, lowStock:0, notifs:0 })
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/repairs/stats').catch(() => ({ data:{} })),
      api.get('/repairs?limit=5&activeOnly=true').catch(() => ({ data:[] })),
    ]).then(([s, r]) => {
      setStats({
        revenue:  s.data?.todayRevenue ?? s.data?.totalRevenue ?? 0,
        pending:  s.data?.pendingRepairs ?? s.data?.pending ?? 0,
        lowStock: s.data?.lowStockItems ?? 0,
        notifs:   s.data?.unreadNotifs ?? 0,
      })
      const list = r.data?.data ?? r.data ?? []
      setRepairs(Array.isArray(list) ? list.slice(0,5) : [])
    }).finally(() => setLoading(false))
  }, [])

  const initials = user?.name?.split(' ').map((n:string) => n[0]).slice(0,2).join('').toUpperCase() ?? '?'
  const roleTH   = user?.role === 'OWNER' ? 'เจ้าของร้าน' : user?.role === 'MANAGER' ? 'ผู้จัดการ' : user?.role === 'TECHNICIAN' ? 'ช่าง' : 'พนักงาน'

  const KPI = [
    { label:'รายได้วันนี้', value:`฿${stats.revenue.toLocaleString()}`, icon:<TrendingUp className="h-5 w-5"/>, color:'bg-emerald-500', light:'bg-emerald-50 text-emerald-600' },
    { label:'งานซ่อมค้าง', value:String(stats.pending)+' งาน',         icon:<Wrench className="h-5 w-5"/>,      color:'bg-brand-yellow', light:'bg-amber-50 text-amber-600' },
    { label:'สินค้าใกล้หมด', value:String(stats.lowStock)+' รายการ',   icon:<Package className="h-5 w-5"/>,     color:'bg-orange-500',  light:'bg-orange-50 text-orange-600' },
    { label:'แจ้งเตือน',    value:String(stats.notifs)+' รายการ',      icon:<Bell className="h-5 w-5"/>,        color:'bg-red-500',     light:'bg-red-50 text-red-500' },
  ]

  const QUICK = [
    { icon:<Wrench className="h-7 w-7 text-brand-yellow"/>,      label:'รับงานซ่อม',  to:'/staff/create'        },
    { icon:<ShoppingCart className="h-7 w-7 text-brand-yellow"/>,label:'ขายสินค้า',   to:'/staff/pos'           },
    { icon:<Package className="h-7 w-7 text-brand-yellow"/>,     label:'เพิ่มสินค้า', to:'/staff/stock'         },
    { icon:<Users className="h-7 w-7 text-brand-yellow"/>,       label:'ลูกค้า',      to:'/staff/customers'     },
  ]

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pb-5 pt-14 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow font-bold text-brand-black">
              {initials}
            </div>
            <div>
              <p className="text-[13px] text-slate-400">สวัสดี</p>
              <p className="font-bold text-brand-black leading-tight">{user?.name}</p>
              <p className="text-xs text-slate-400">{roleTH}</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/staff/notifications')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F8F9FB]"
          >
            <Bell className="h-5 w-5 text-slate-600" />
            {stats.notifs > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {stats.notifs > 9 ? '9+' : stats.notifs}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-5">
        {/* KPI */}
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {KPI.map((k) => (
              <div key={k.label} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${k.light}`}>
                  {k.icon}
                </div>
                <p className="text-lg font-extrabold text-brand-black leading-tight">{k.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">เมนูด่วน</p>
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => router.push(q.to)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-brand-black p-3.5 active:scale-95 transition-transform"
              >
                {q.icon}
                <span className="text-center text-[10px] font-semibold leading-tight text-white">{q.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent repairs */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">งานล่าสุด</p>
            <button onClick={() => router.push('/staff/repairs')} className="flex items-center gap-1 text-xs font-bold text-brand-yellow">
              ดูทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {repairs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white py-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <Wrench className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">ยังไม่มีงานซ่อม</p>
              </div>
            ) : repairs.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/staff/repairs/${r.id}`)}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/10">
                  <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-400">{r.ticketNumber}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${S_COLOR[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {S_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-brand-black truncate">{r.deviceBrand} {r.deviceModel}</p>
                </div>
                <div className="flex flex-col items-end">
                  <Clock className="h-3.5 w-3.5 text-slate-300" />
                  <p className="text-[10px] text-slate-400 whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix:true, locale:th })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
