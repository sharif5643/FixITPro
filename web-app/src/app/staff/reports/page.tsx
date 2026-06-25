'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, TrendingUp, Wrench, ShoppingCart, DollarSign, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface DashData {
  finance?: { totalRevenue:number; netProfit:number; salesCount:number }
  repairOps?: { openRepairs:number }
  weeklyRevenue?: { date:string; revenue:number }[]
}

const toISO = (dt: Date) => dt.toISOString().slice(0, 10)

function getRange(p: 'daily'|'monthly'|'yearly') {
  const today = new Date()
  if (p === 'daily')   return { startDate: toISO(today), endDate: toISO(today) }
  if (p === 'monthly') return { startDate: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: toISO(today) }
  return { startDate: toISO(new Date(today.getFullYear(), 0, 1)), endDate: toISO(today) }
}

export default function ReportsPage() {
  const router = useRouter()
  const [period,  setPeriod]  = useState<'daily'|'monthly'|'yearly'>('daily')
  const [data,    setData]    = useState<DashData|null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((p: 'daily'|'monthly'|'yearly') => {
    setLoading(true)
    api.get('/dashboard/overview', { params: getRange(p) })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const chart   = data?.weeklyRevenue ?? []
  const maxR    = Math.max(...chart.map(d => d.revenue), 1)
  const revenue = data?.finance?.totalRevenue ?? 0
  const profit  = data?.finance?.netProfit    ?? 0
  const sales   = data?.finance?.salesCount   ?? 0
  const repairs = data?.repairOps?.openRepairs ?? 0
  const label   = period === 'daily' ? 'วันนี้' : period === 'monthly' ? 'เดือนนี้' : 'ปีนี้'

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
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                <TrendingUp className="h-5 w-5 text-brand-success"/>
              </div>
              <p className="text-[11px] text-slate-400">รายได้{label}</p>
              <p className="text-xl font-extrabold text-brand-black">฿{revenue.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <DollarSign className="h-5 w-5 text-brand-info"/>
              </div>
              <p className="text-[11px] text-slate-400">กำไรสุทธิ</p>
              <p className="text-xl font-extrabold text-brand-black">฿{profit.toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                <ShoppingCart className="h-5 w-5 text-amber-500"/>
              </div>
              <p className="text-[11px] text-slate-400">ยอดขายสินค้า</p>
              <p className="text-xl font-extrabold text-brand-black">{sales} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
                <Wrench className="h-5 w-5 text-purple-500"/>
              </div>
              <p className="text-[11px] text-slate-400">งานซ่อม</p>
              <p className="text-xl font-extrabold text-brand-black">{repairs} <span className="text-xs font-normal text-slate-400">งาน</span></p>
            </div>
          </div>

          {chart.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-semibold text-brand-black">กราฟรายได้</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
              <div className="flex items-end gap-1 h-32">
                {chart.map((d,i) => {
                  const pct    = (d.revenue / maxR) * 100
                  const isLast = i === chart.length - 1
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
                <p className="text-xs text-slate-400">รวม{label}</p>
                <p className="text-sm font-bold text-brand-black">
                  ฿{chart.reduce((s,d)=>s+d.revenue,0).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
