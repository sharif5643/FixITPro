'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, ChevronRight, Loader2, Wrench } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'

interface ChatThread {
  repairId:       string
  ticketNumber:   string
  technicianName: string
  lastMessage:    string
  lastMessageAt:  string
  unread:         number
}

export default function StaffChatListPage() {
  const router = useRouter()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load repairs that have chat activity
    api.get('/repairs', { params: { limit: 20, hasChat: true, sortBy: 'updatedAt', order: 'desc' } })
      .then((res) => {
        const rows = res.data?.data ?? res.data ?? []
        setThreads(
          rows.slice(0, 10).map((r: any) => ({
            repairId:       r.id,
            ticketNumber:   r.ticketNumber ?? r.id.slice(0, 8),
            technicianName: r.technicianName ?? 'ช่าง',
            lastMessage:    r.lastMessage ?? 'ยังไม่มีข้อความ',
            lastMessageAt:  r.updatedAt ?? r.createdAt,
            unread:         r.unreadCount ?? 0,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <h1 className="text-xl font-bold text-brand-black">ข้อความ</h1>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow/20">
              <MessageCircle className="h-8 w-8 text-brand-yellow" />
            </div>
            <p className="text-sm font-medium text-slate-500">ยังไม่มีการสนทนา</p>
            <p className="text-xs text-slate-400 text-center">เมื่องานซ่อมเริ่มดำเนินการ<br />คุณสามารถแชทกับช่างได้ที่นี่</p>
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map((t) => (
              <button
                key={t.repairId}
                onClick={() => router.push(`/staff/chat/${t.repairId}`)}
                className="flex w-full items-center gap-3 rounded-xl bg-white p-4 shadow-card text-left active:bg-slate-50"
              >
                <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-yellow">
                  <Wrench className="h-5 w-5 text-brand-black" />
                  {t.unread > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {t.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-brand-black">{t.technicianName}</p>
                    <p className="text-[10px] text-slate-300">
                      {formatDistanceToNow(new Date(t.lastMessageAt), { locale: th, addSuffix: true })}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{t.lastMessage}</p>
                  <p className="text-[10px] text-slate-300 font-mono mt-0.5">{t.ticketNumber}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
