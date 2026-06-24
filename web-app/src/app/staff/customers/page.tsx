'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, Users, Phone, ChevronRight, Loader2, Plus, Wrench } from 'lucide-react'
import api from '@/lib/api'

interface Customer { id:string; name:string; phone:string; totalSpending?:number; repairCount?:number }

const AVBG = ['bg-brand-yellow','bg-brand-info','bg-brand-success','bg-purple-400','bg-pink-400','bg-orange-400']

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    api.get('/customers?limit=100').then(r=>{
      const list = r.data?.data ?? r.data ?? []
      setCustomers(Array.isArray(list) ? list : [])
    }).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  )

  const initials = (name:string) => name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600"/>
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">ลูกค้า</h1>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow">
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
              {c.repairCount != null && <p className="text-xs text-slate-400">{c.repairCount} ครั้ง</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 shrink-0"/>
          </button>
        ))}
        <button className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-medium text-slate-400">
          <Plus className="h-4 w-4"/> เพิ่มลูกค้าใหม่
        </button>
      </div>
    </div>
  )
}
