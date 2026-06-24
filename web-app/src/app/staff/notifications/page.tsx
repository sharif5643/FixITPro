'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Bell, Wrench, Package, MessageSquare,
  AlertTriangle, Info, ChevronRight, Loader2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'

interface Notif {
  id:        string
  type:      string
  title:     string
  message:   string
  isRead:    boolean
  createdAt: string
  repairId?: string
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  REPAIR_READY:   <Wrench className="h-5 w-5 text-brand-success" />,
  WAITING_PARTS:  <Package className="h-5 w-5 text-brand-warning" />,
  CUSTOMER_CHAT:  <MessageSquare className="h-5 w-5 text-brand-info" />,
  LOW_STOCK:      <AlertTriangle className="h-5 w-5 text-brand-danger" />,
  SYSTEM:         <Info className="h-5 w-5 text-slate-500" />,
}

const TYPE_BG: Record<string, string> = {
  REPAIR_READY:  'bg-brand-success/10',
  WAITING_PARTS: 'bg-brand-warning/10',
  CUSTOMER_CHAT: 'bg-brand-info/10',
  LOW_STOCK:     'bg-brand-danger/10',
  SYSTEM:        'bg-slate-100',
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifs,  setNotifs]  = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/notifications?limit=50').then((r) => {
      const list = r.data?.data ?? r.data ?? []
      setNotifs(Array.isArray(list) ? list : [])
    }).catch(() => {
      // Show demo notifications if endpoint not available
      setNotifs([
        {
          id: '1', type: 'REPAIR_READY', title: 'งานรอส่งมอบ',
          message: 'R-2024-0006 พร้อมส่งมอบให้ลูกค้า', isRead: false,
          createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
        },
        {
          id: '2', type: 'WAITING_PARTS', title: 'งานรอชิ้นส่วน',
          message: 'iPhone 14 รออะไหล่หน้าจอ', isRead: false,
          createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
        },
        {
          id: '3', type: 'CUSTOMER_CHAT', title: 'ลูกค้าทักแชท',
          message: 'สมชาย ใจดี ส่งข้อความใหม่', isRead: true,
          createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
        },
        {
          id: '4', type: 'SYSTEM', title: 'แจ้งเตือนระบบ',
          message: 'FixITPro Mobile v2.0 พร้อมใช้งาน', isRead: true,
          createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
        },
      ])
    }).finally(() => setLoading(false))
  }, [])

  const unread = notifs.filter((n) => !n.isRead)

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">การแจ้งเตือน</h1>
          {unread.length > 0 && (
            <span className="rounded-full bg-brand-danger px-2 py-0.5 text-xs font-bold text-white">
              {unread.length} ใหม่
            </span>
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Bell className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">ไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          notifs.map((n) => (
            <button
              key={n.id}
              onClick={() => n.repairId && router.push(`/staff/repairs/${n.repairId}`)}
              className={`flex items-start gap-3 rounded-[20px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform ${
                n.isRead ? 'bg-white' : 'bg-white border-l-4 border-brand-yellow'
              }`}
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TYPE_BG[n.type] || 'bg-slate-100'}`}>
                {TYPE_ICON[n.type] || <Bell className="h-5 w-5 text-slate-400" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-brand-black">{n.title}</p>
                  {!n.isRead && (
                    <div className="h-2 w-2 rounded-full bg-brand-yellow shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: th })}
                </p>
              </div>
              {n.repairId && <ChevronRight className="h-4 w-4 text-slate-300 mt-1 shrink-0" />}
            </button>
          ))
        )}

        {notifs.length > 0 && (
          <button className="rounded-[20px] bg-white py-4 text-sm font-semibold text-brand-yellow shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            ดูทั้งหมด
          </button>
        )}
      </div>
    </div>
  )
}
