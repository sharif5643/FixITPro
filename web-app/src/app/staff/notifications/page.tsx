'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Bell, Wrench, Package, MessageSquare, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'

interface Notif { id:string; type:string; title:string; message:string; isRead:boolean; createdAt:string; repairId?:string }

const TABS = ['ทั้งหมด','งานซ่อม','ระบบ','สต็อก'] as const
type Tab = typeof TABS[number]

const TYPE_TAB: Record<string,Tab> = {
  REPAIR_READY:'งานซ่อม', WAITING_PARTS:'งานซ่อม',
  CUSTOMER_CHAT:'งานซ่อม', LOW_STOCK:'สต็อก', SYSTEM:'ระบบ',
}
const TYPE_ICON: Record<string,React.ReactNode> = {
  REPAIR_READY:  <Wrench        className="h-5 w-5 text-brand-success"/>,
  WAITING_PARTS: <Package       className="h-5 w-5 text-orange-500"/>,
  CUSTOMER_CHAT: <MessageSquare className="h-5 w-5 text-brand-info"/>,
  LOW_STOCK:     <AlertTriangle className="h-5 w-5 text-red-500"/>,
  SYSTEM:        <Info          className="h-5 w-5 text-slate-500"/>,
}
const TYPE_BG: Record<string,string> = {
  REPAIR_READY:'bg-emerald-50', WAITING_PARTS:'bg-orange-50',
  CUSTOMER_CHAT:'bg-blue-50', LOW_STOCK:'bg-red-50', SYSTEM:'bg-slate-100',
}

const DEMO: Notif[] = [
  { id:'1', type:'REPAIR_READY',  title:'งานซ่อมเสร็จแล้ว',    message:'R-2024-0006 พร้อมส่งมอบให้ลูกค้า', isRead:false, createdAt:new Date(Date.now()-5*60000).toISOString() },
  { id:'2', type:'LOW_STOCK',     title:'สินค้าใกล้หมด',         message:'จอ iPhone 14 เหลือ 2 ชิ้น',         isRead:false, createdAt:new Date(Date.now()-30*60000).toISOString() },
  { id:'3', type:'CUSTOMER_CHAT', title:'ลูกค้าทักแชท',          message:'สมชาย ใจดี ส่งข้อความใหม่',          isRead:true,  createdAt:new Date(Date.now()-3600000).toISOString() },
  { id:'4', type:'WAITING_PARTS', title:'นัดหมายส่งมอบ',         message:'R-2024-0007 นัดรับเครื่อง 10.00 น.', isRead:true,  createdAt:new Date(Date.now()-2*3600000).toISOString() },
  { id:'5', type:'SYSTEM',        title:'อัปเดตระบบ',             message:'FixIT+ v2.0 พร้อมใช้งานแล้ว',        isRead:true,  createdAt:new Date(Date.now()-3*3600000).toISOString() },
]

export default function NotificationsPage() {
  const router  = useRouter()
  const [tab,     setTab]     = useState<Tab>('ทั้งหมด')
  const [notifs,  setNotifs]  = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/notifications?limit=50').then(r=>{
      const list = r.data?.data ?? r.data ?? []
      setNotifs(Array.isArray(list) && list.length>0 ? list : DEMO)
    }).catch(()=>setNotifs(DEMO)).finally(()=>setLoading(false))
  }, [])

  const visible = tab === 'ทั้งหมด' ? notifs : notifs.filter(n=>(TYPE_TAB[n.type]??'ระบบ')===tab)
  const unread  = notifs.filter(n=>!n.isRead).length

  function markAll() {
    setNotifs(prev=>prev.map(n=>({...n,isRead:true})))
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600"/>
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">แจ้งเตือน</h1>
          {unread>0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unread}</span>}
          {unread>0 && (
            <button onClick={markAll} className="text-xs font-semibold text-brand-yellow">Mark all as read</button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={()=>setTab(t)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab===t ? 'bg-brand-yellow text-brand-black' : 'bg-[#F8F9FB] text-slate-500'
              }`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="p-5 flex flex-col gap-2.5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow"/></div>
        ) : visible.length===0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Bell className="h-10 w-10 text-slate-200"/>
            <p className="text-sm text-slate-400">ไม่มีการแจ้งเตือน</p>
          </div>
        ) : visible.map(n => (
          <button key={n.id}
            onClick={()=>n.repairId && router.push(`/staff/repairs/${n.repairId}`)}
            className={`flex items-start gap-3 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform ${
              n.isRead ? 'bg-white' : 'bg-white border-l-[3px] border-brand-yellow'
            }`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TYPE_BG[n.type]??'bg-slate-100'}`}>
              {TYPE_ICON[n.type] ?? <Bell className="h-5 w-5 text-slate-400"/>}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-brand-black">{n.title}</p>
                {!n.isRead && <div className="h-2 w-2 shrink-0 rounded-full bg-brand-yellow"/>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
              <p className="text-[10px] text-slate-400 mt-1">
                {formatDistanceToNow(new Date(n.createdAt),{addSuffix:true,locale:th})}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
