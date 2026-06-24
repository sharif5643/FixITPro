'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, TrendingUp, Wrench, Users, Building2, Package, DollarSign, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

interface OwnData {
  todayRevenue?:number; monthRevenue?:number; monthProfit?:number
  pendingRepairs?:number; lowStockItems?:number; onlineStaff?:number
  branchCount?:number; weeklyRevenue?:{date:string;revenue:number}[]
  branches?:{name:string;revenue:number}[]
}

export default function OwnerDashboardPage() {
  const router  = useRouter()
  const user    = useAuthStore((s)=>s.user)
  const [data,   setData]   = useState<OwnData|null>(null)
  const [loading,setLoading]= useState(true)

  useEffect(() => {
    api.get('/dashboard/overview').then(r=>setData(r.data)).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const initials = user?.name?.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase()?? '?'
  const chart    = data?.weeklyRevenue ?? []
  const maxR     = Math.max(...chart.map(d=>d.revenue), 1)
  const branches = data?.branches ?? []
  const maxB     = Math.max(...branches.map(b=>b.revenue), 1)

  const KPIS = [
    { label:'รายได้วันนี้',  value:`฿${(data?.todayRevenue??0).toLocaleString()}`,  icon:<TrendingUp className="h-5 w-5"/>, bg:'bg-emerald-50 text-brand-success' },
    { label:'กำไรวันนี้',    value:`฿${(data?.monthProfit??0).toLocaleString()}`,    icon:<DollarSign className="h-5 w-5"/>, bg:'bg-blue-50 text-brand-info' },
    { label:'งานซ่อมค้าง',  value:String(data?.pendingRepairs??0)+' งาน',            icon:<Wrench className="h-5 w-5"/>,     bg:'bg-amber-50 text-amber-600' },
    { label:'ร้านค้า/สาขา', value:String(data?.branchCount??1)+' สาขา',             icon:<Building2 className="h-5 w-5"/>,  bg:'bg-purple-50 text-purple-600' },
    { label:'สินค้าใกล้หมด',value:String(data?.lowStockItems??0)+' ชิ้น',           icon:<Package className="h-5 w-5"/>,    bg:'bg-orange-50 text-orange-600' },
    { label:'พนักงานออนไลน์',value:String(data?.onlineStaff??0)+' คน',              icon:<Users className="h-5 w-5"/>,      bg:'bg-slate-50 text-slate-600' },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pb-5 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow text-sm font-bold text-brand-black">
            {initials}
          </div>
          <div>
            <p className="font-bold text-brand-black">{user?.name}</p>
            <p className="text-xs text-slate-400">เจ้าของร้าน</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs font-medium text-slate-500">
              {format(new Date(),'d MMMM yyyy',{locale:th})}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand-yellow"/></div>
      ) : (
        <div className="p-5 flex flex-col gap-4">
          {/* KPI grid 2x3 */}
          <div className="grid grid-cols-2 gap-3">
            {KPIS.map(k => (
              <div key={k.label} className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${k.bg}`}>
                  {k.icon}
                </div>
                <p className="text-[11px] text-slate-400">{k.label}</p>
                <p className="text-lg font-extrabold text-brand-black leading-tight">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Revenue chart */}
          {chart.length>0 && (
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-4 font-semibold text-brand-black">กราฟเปรียบเทียบรายได้</p>
              <div className="flex items-end gap-1.5 h-28">
                {chart.map((d,i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="relative w-full flex items-end" style={{height:'96px'}}>
                      <div className="w-full rounded-t-lg bg-brand-yellow/30"
                        style={{height:`${Math.max((d.revenue/maxR)*100,4)}%`}}/>
                    </div>
                    <p className="text-[8px] text-slate-400">{new Date(d.date).getDate()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branch comparison */}
          {branches.length>0 && (
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-4 font-semibold text-brand-black">เปรียบเทียบสาขา</p>
              <div className="flex flex-col gap-3">
                {branches.map((b,i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-medium text-brand-black">{b.name}</p>
                      <p className="text-sm font-bold text-brand-yellow">฿{b.revenue.toLocaleString()}</p>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F8F9FB]">
                      <div className="h-full rounded-full bg-brand-yellow"
                        style={{width:`${Math.max((b.revenue/maxB)*100,4)}%`}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
