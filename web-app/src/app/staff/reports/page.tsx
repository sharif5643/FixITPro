'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, TrendingUp, Wrench, ShoppingCart, DollarSign, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface DashData { todayRevenue?:number; todayProfit?:number; todaySalesCount?:number; pendingRepairs?:number; weeklyRevenue?:{date:string;revenue:number}[] }

export default function ReportsPage() {
  const router  = useRouter()
  const [period, setPeriod] = useState<'daily'|'monthly'|'yearly'>('daily')
  const [data,   setData]   = useState<DashData|null>(null)
  const [loading,setLoading]= useState(true)

  useEffect(() => {
    api.get('/dashboard/overview').then(r=>setData(r.data)).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const chart = data?.weeklyRevenue ?? []
  const maxR  = Math.max(...chart.map(d=>d.revenue), 1)

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600"/>
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">รายงาน</h1>
        </div>
        <div className="flex gap-2">
          {(['daily','monthly','yearly'] as const).map(p => (
            <button key={p} onClick={()=>setPeriod(p)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                period===p ? 'bg-brand-yellow text-brand-black' : 'bg-[#F8F9FB] text-slate-500'
              }`}>
              {p==='daily'?'รายวัน':p==='monthly'?'รายเดือน':'รายปี'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand-yellow"/></div>
      ) : (
        <div className="p-5 flex flex-col gap-4">
          {/* Revenue + Profit - big cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                <TrendingUp className="h-5 w-5 text-brand-success"/>
              </div>
              <p className="text-[11px] text-slate-400">รายได้วันนี้</p>
              <p className="text-xl font-extrabold text-brand-black">฿{(data?.todayRevenue??0).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <DollarSign className="h-5 w-5 text-brand-info"/>
              </div>
              <p className="text-[11px] text-slate-400">กำไรวันนี้</p>
              <p className="text-xl font-extrabold text-brand-black">฿{(data?.todayProfit??0).toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                <ShoppingCart className="h-5 w-5 text-amber-500"/>
              </div>
              <p className="text-[11px] text-slate-400">ยอดขายสินค้า</p>
              <p className="text-xl font-extrabold text-brand-black">{data?.todaySalesCount??0} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
                <Wrench className="h-5 w-5 text-purple-500"/>
              </div>
              <p className="text-[11px] text-slate-400">งานซ่อม</p>
              <p className="text-xl font-extrabold text-brand-black">{data?.pendingRepairs??0} <span className="text-xs font-normal text-slate-400">งาน</span></p>
            </div>
          </div>

          {/* Chart */}
          {chart.length>0 && (
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-semibold text-brand-black">กราฟรายได้</p>
                <div className="flex gap-1.5">
                  {['7 วัน','30 วัน','90 วัน'].map(l => (
                    <button key={l} className="rounded-full bg-[#F8F9FB] px-2.5 py-1 text-[10px] font-semibold text-slate-500 first:bg-brand-yellow first:text-brand-black">
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-1 h-32">
                {chart.map((d,i) => {
                  const pct = (d.revenue/maxR)*100
                  const isLast = i===chart.length-1
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative w-full flex items-end" style={{height:'100px'}}>
                        <div className={`w-full rounded-t-lg ${isLast?'bg-brand-yellow':'bg-brand-yellow/25'}`}
                          style={{height:`${Math.max(pct,4)}%`}}/>
                      </div>
                      <p className="text-[9px] text-slate-400">{new Date(d.date).getDate()}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400">7 วันย้อนหลัง</p>
                <p className="text-sm font-bold text-brand-black">
                  รวม ฿{chart.reduce((s,d)=>s+d.revenue,0).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
