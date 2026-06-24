'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Settings, Users, Building2, BarChart3, Bell, Shield, HelpCircle, LogOut, UserCircle, History, CreditCard, Wrench } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { toast } from 'sonner'

export default function MorePage() {
  const router    = useRouter()
  const user      = useAuthStore((s)=>s.user)
  const clearAuth = useAuthStore((s)=>s.clearAuth)

  const initials = user?.name?.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase()?? '?'
  const roleTH   = user?.role==='OWNER'?'เจ้าของร้าน':user?.role==='MANAGER'?'ผู้จัดการ':user?.role==='TECHNICIAN'?'ช่าง':'พนักงาน'
  const isOwner  = user?.role==='OWNER'||user?.role==='SUPER_ADMIN'
  const isTech   = user?.role==='TECHNICIAN'

  async function logout() {
    await api.post('/auth/logout').catch(()=>{})
    clearAuth()
    router.replace('/staff/login')
  }

  const SECTIONS = [
    {
      title: 'ฉัน',
      items: [
        { icon:<UserCircle className="h-5 w-5 text-brand-info"/>,  label:'ข้อมูลส่วนตัว', to:'/staff/profile' },
        ...(isTech ? [{ icon:<Wrench className="h-5 w-5 text-amber-500"/>, label:'งานของฉัน', to:'/staff/technician' }] : []),
        { icon:<History className="h-5 w-5 text-slate-500"/>,      label:'ประวัติงาน',     to:'/staff/repairs' },
      ],
    },
    {
      title: 'จัดการ',
      items: [
        { icon:<Users className="h-5 w-5 text-purple-500"/>,       label:'ลูกค้า',         to:'/staff/customers' },
        { icon:<BarChart3 className="h-5 w-5 text-brand-info"/>,   label:'รายงาน',         to:'/staff/reports' },
        { icon:<Bell className="h-5 w-5 text-amber-500"/>,         label:'แจ้งเตือน',      to:'/staff/notifications' },
        ...(isOwner ? [{ icon:<Building2 className="h-5 w-5 text-brand-yellow"/>, label:'Dashboard เจ้าของ', to:'/staff/owner' }] : []),
      ],
    },
    {
      title: 'ระบบ',
      items: [
        { icon:<Shield className="h-5 w-5 text-brand-success"/>,   label:'ความปลอดภัย',   to:'/staff/profile' },
        { icon:<Settings className="h-5 w-5 text-slate-500"/>,     label:'การตั้งค่า',    to:'/settings' },
        { icon:<HelpCircle className="h-5 w-5 text-brand-info"/>,  label:'ช่วยเหลือ',     to:'/help' },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      {/* Profile header */}
      <div className="bg-white px-5 pb-5 pt-14 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow text-lg font-bold text-brand-black">
            {initials}
          </div>
          <div className="flex-1">
            <p className="font-bold text-brand-black">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <span className="mt-1 inline-block rounded-full bg-brand-yellow/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
              {roleTH}
            </span>
          </div>
          <button onClick={()=>router.push('/staff/profile')} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <Settings className="h-4 w-4 text-slate-400"/>
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {SECTIONS.map(sec => (
          <div key={sec.title}>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{sec.title}</p>
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
              {sec.items.map((item,i) => (
                <button key={item.label} onClick={()=>router.push(item.to)}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 active:bg-[#F8F9FB] ${i>0?'border-t border-slate-50':''}`}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]">
                    {item.icon}
                  </div>
                  <p className="flex-1 text-left text-sm font-medium text-brand-black">{item.label}</p>
                  <ChevronRight className="h-4 w-4 text-slate-300"/>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button onClick={logout}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-red-100 bg-white text-sm font-bold text-red-500 active:bg-red-50">
          <LogOut className="h-4 w-4"/> ออกจากระบบ
        </button>

        <div className="flex flex-col items-center gap-1 pb-2">
          <p className="text-xs font-bold text-slate-400">FixIT<span className="text-brand-yellow">+</span></p>
          <p className="text-[10px] text-slate-300">Version 2.0.0</p>
        </div>
      </div>
    </div>
  )
}
