'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Phone, MoreHorizontal, Wrench, ShoppingBag, Plus, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

interface Customer {
  id:string; name:string; phone:string; lineId?:string
  totalSpending?:number; repairCount?:number; purchaseCount?:number
  repairs?:{ id:string; ticketNumber:string; status:string; deviceBrand:string; deviceModel:string; createdAt:string }[]
}

const S_BADGE: Record<string,string> = {
  PENDING:'bg-blue-50 text-blue-600', IN_PROGRESS:'bg-amber-50 text-amber-600',
  WAIT_PARTS:'bg-orange-50 text-orange-600', WAIT_PICKUP:'bg-green-50 text-green-600',
  COMPLETED:'bg-emerald-50 text-emerald-600', CANCELLED:'bg-red-50 text-red-500',
}
const S_LABEL: Record<string,string> = {
  PENDING:'รอตรวจสอบ', IN_PROGRESS:'กำลังซ่อม', WAIT_PARTS:'รออะไหล่',
  WAIT_PICKUP:'รอรับเครื่อง', COMPLETED:'เสร็จสิ้น', CANCELLED:'ยกเลิก',
}

export default function CustomerDetailPage() {
  const router  = useRouter()
  const { id }  = useParams<{id:string}>()
  const [tab,      setTab]      = useState<'repair'|'purchase'>('repair')
  const [customer, setCustomer] = useState<Customer|null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    api.get(`/customers/${id}`).then(r=>setCustomer(r.data)).catch(()=>{}).finally(()=>setLoading(false))
  }, [id])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB]"><Loader2 className="h-8 w-8 animate-spin text-brand-yellow"/></div>
  if (!customer) return null

  const initials = customer.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600"/>
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">ข้อมูลลูกค้า</h1>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <MoreHorizontal className="h-5 w-5 text-slate-600"/>
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Profile card */}
        <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow text-xl font-bold text-brand-black">
              {initials}
            </div>
            <div>
              <p className="text-lg font-bold text-brand-black">{customer.name}</p>
              <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3.5 w-3.5 text-brand-success"/>
                <span className="text-sm text-slate-600">{customer.phone}</span>
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#F8F9FB] p-3 text-center">
              <p className="text-lg font-extrabold text-brand-black">฿{(customer.totalSpending??0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">ยอดรวม</p>
            </div>
            <div className="rounded-xl bg-[#F8F9FB] p-3 text-center">
              <p className="text-lg font-extrabold text-brand-black">{customer.repairCount??0}</p>
              <p className="text-xs text-slate-400">ครั้งที่มา</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={()=>setTab('repair')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              tab==='repair' ? 'bg-brand-yellow text-brand-black' : 'bg-white text-slate-500'
            }`}>
            <Wrench className="h-4 w-4"/> ประวัติซ่อม
          </button>
          <button onClick={()=>setTab('purchase')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              tab==='purchase' ? 'bg-brand-yellow text-brand-black' : 'bg-white text-slate-500'
            }`}>
            <ShoppingBag className="h-4 w-4"/> ประวัติซื้อ
          </button>
        </div>

        {/* Repair list */}
        {tab === 'repair' && (
          <div className="flex flex-col gap-2.5">
            {(customer.repairs ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <Wrench className="h-8 w-8 text-slate-200"/>
                <p className="text-sm text-slate-400">ยังไม่มีประวัติซ่อม</p>
              </div>
            ) : (customer.repairs??[]).map(r => (
              <button key={r.id} onClick={()=>router.push(`/staff/repairs/${r.id}`)}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/10">
                  <Wrench className="h-5 w-5 text-brand-yellow" strokeWidth={2}/>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-400">{r.ticketNumber}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${S_BADGE[r.status]??''}`}>
                      {S_LABEL[r.status]??r.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-brand-black">{r.deviceBrand} {r.deviceModel}</p>
                  <p className="text-[11px] text-slate-400">{format(new Date(r.createdAt),'d MMM yyyy',{locale:th})}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'purchase' && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <ShoppingBag className="h-8 w-8 text-slate-200"/>
            <p className="text-sm text-slate-400">ยังไม่มีประวัติซื้อ</p>
          </div>
        )}

        <button onClick={()=>router.push('/staff/create')}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-base font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)]">
          <Plus className="h-5 w-5"/> รับงานซ่อมใหม่
        </button>
      </div>
    </div>
  )
}
