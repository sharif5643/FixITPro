'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Phone, MoreHorizontal, Wrench, ShoppingBag, Plus, Loader2, X, Edit2 } from 'lucide-react'
import api from '@/lib/api'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'

interface Customer {
  id:string; name:string; phone:string; lineId?:string; email?:string; address?:string
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
  const [showEdit, setShowEdit] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState({ name:'', phone:'', email:'', address:'' })

  function loadCustomer() {
    api.get(`/customers/${id}`).then(r=>{
      setCustomer(r.data)
      const c = r.data as Customer
      setForm({ name:c.name, phone:c.phone??'', email:c.email??'', address:c.address??'' })
    }).catch(()=>{}).finally(()=>setLoading(false))
  }

  useEffect(() => { loadCustomer() }, [id])

  async function saveEdit() {
    if (!form.name.trim()) { toast.error('กรุณากรอกชื่อลูกค้า'); return }
    setSaving(true)
    try {
      const body: Record<string,string> = { name: form.name.trim() }
      if (form.phone.trim())   body.phone   = form.phone.trim()
      if (form.email.trim())   body.email   = form.email.trim()
      if (form.address.trim()) body.address = form.address.trim()
      await api.put(`/customers/${id}`, body)
      toast.success('บันทึกข้อมูลสำเร็จ')
      setShowEdit(false)
      setLoading(true)
      loadCustomer()
    } catch { toast.error('บันทึกข้อมูลไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB]"><Loader2 className="h-8 w-8 animate-spin text-brand-yellow"/></div>
  if (!customer) return null

  const initials = customer.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
        <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
              <ChevronLeft className="h-5 w-5 text-slate-600"/>
            </button>
            <h1 className="flex-1 text-lg font-bold text-brand-black">ข้อมูลลูกค้า</h1>
            <button onClick={()=>setShowEdit(true)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
              <MoreHorizontal className="h-5 w-5 text-slate-600"/>
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow text-xl font-bold text-brand-black">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-brand-black">{customer.name}</p>
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 mt-0.5">
                  <Phone className="h-3.5 w-3.5 text-brand-success"/>
                  <span className="text-sm text-slate-600">{customer.phone}</span>
                </a>
              </div>
              <button onClick={()=>setShowEdit(true)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F8F9FB]">
                <Edit2 className="h-4 w-4 text-slate-500"/>
              </button>
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

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <div className="rounded-t-3xl bg-white px-5 pt-5 pb-10">
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-brand-black">แก้ไขข้อมูลลูกค้า</p>
              <button onClick={()=>setShowEdit(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F9FB]">
                <X className="h-4 w-4 text-slate-500"/>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                <input
                  value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">เบอร์โทร</label>
                <input
                  value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                  type="tel"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">อีเมล</label>
                <input
                  value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  type="email"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ที่อยู่</label>
                <input
                  value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <button onClick={saveEdit} disabled={saving}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
