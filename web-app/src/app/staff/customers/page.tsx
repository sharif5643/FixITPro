'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, Users, Phone, ChevronRight, Loader2, Plus, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

interface Customer { id:string; name:string; phone:string; totalSpending?:number; repairCount?:number }

const AVBG = ['bg-brand-yellow','bg-brand-info','bg-brand-success','bg-purple-400','bg-pink-400','bg-orange-400']

interface AddForm { name:string; phone:string; email:string; address:string }

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState<AddForm>({ name:'', phone:'', email:'', address:'' })

  function loadCustomers() {
    api.get('/customers?limit=100').then(r=>{
      const list = r.data?.data ?? r.data ?? []
      setCustomers(Array.isArray(list) ? list : [])
    }).catch(()=>{}).finally(()=>setLoading(false))
  }

  useEffect(() => { loadCustomers() }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  const initials = (name:string) => name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()

  function openAdd() {
    setForm({ name:'', phone:'', email:'', address:'' })
    setShowAdd(true)
  }

  async function saveCustomer() {
    if (!form.name.trim()) { toast.error('กรุณากรอกชื่อลูกค้า'); return }
    setSaving(true)
    try {
      const body: Record<string,string> = { name: form.name.trim() }
      if (form.phone.trim())   body.phone   = form.phone.trim()
      if (form.email.trim())   body.email   = form.email.trim()
      if (form.address.trim()) body.address = form.address.trim()
      await api.post('/customers', body)
      toast.success('เพิ่มลูกค้าสำเร็จ')
      setShowAdd(false)
      setLoading(true)
      loadCustomers()
    } catch { toast.error('เพิ่มลูกค้าไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
        <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
              <ChevronLeft className="h-5 w-5 text-slate-600"/>
            </button>
            <h1 className="flex-1 text-lg font-bold text-brand-black">ลูกค้า</h1>
            <button onClick={openAdd} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow">
              <Plus className="h-4 w-4 text-brand-black"/>
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="ค้นหา ชื่อ / เบอร์ / เลขงาน"
              className="h-11 w-full rounded-xl bg-[#F8F9FB] pl-10 pr-4 text-sm outline-none"
            />
          </div>
        </div>
        <div className="p-5 flex flex-col gap-2.5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow"/></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Users className="h-10 w-10 text-slate-200"/>
              <p className="text-sm text-slate-400">ไม่พบลูกค้า</p>
            </div>
          ) : filtered.map((c,i) => (
            <button key={c.id} onClick={()=>router.push(`/staff/customers/${c.id}`)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${AVBG[i%AVBG.length]}`}>
                <span className="text-sm font-bold text-white">{initials(c.name)}</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-brand-black">{c.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3 text-slate-400"/>
                  <p className="text-xs text-slate-400">{c.phone}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                {c.totalSpending != null && <p className="text-sm font-bold text-brand-black">฿{c.totalSpending.toLocaleString()}</p>}
                {c.repairCount   != null && <p className="text-xs text-slate-400">{c.repairCount} ครั้ง</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0"/>
            </button>
          ))}
          <button onClick={openAdd}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-medium text-slate-400">
            <Plus className="h-4 w-4"/> เพิ่มลูกค้าใหม่
          </button>
        </div>
      </div>

      {/* Add customer modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <div className="rounded-t-3xl bg-white px-5 pt-5 pb-10">
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-brand-black">เพิ่มลูกค้าใหม่</p>
              <button onClick={()=>setShowAdd(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F9FB]">
                <X className="h-4 w-4 text-slate-500"/>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                <input
                  value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  placeholder="ชื่อลูกค้า"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">เบอร์โทร</label>
                <input
                  value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                  placeholder="08X-XXX-XXXX"
                  type="tel"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">อีเมล</label>
                <input
                  value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  placeholder="email@example.com"
                  type="email"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ที่อยู่</label>
                <input
                  value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}
                  placeholder="ที่อยู่"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <button onClick={saveCustomer} disabled={saving}
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
