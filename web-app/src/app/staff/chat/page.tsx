'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, ChevronRight, Loader2, Wrench } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import api from '@/lib/api'

interface Repair {
  id: string
  ticketNumber?: string
  status: string
  deviceBrand?: string
  deviceModel?: string
  technicianName?: string
  technician?: { name: string }
  customer?: { name: string }
  updatedAt: string
  createdAt: string
}

const ACTIVE_STATUSES = ['PENDING','IN_PROGRESS','WAIT_PARTS','WAIT_PICKUP','APPROVED','WAITING_APPROVAL','WAITING_PARTS']

const S_LABEL: Record<string,string> = {
  PENDING:'รอตรวจสอบ', IN_PROGRESS:'กำลังซ่อม', WAIT_PARTS:'รออะไหล่',
  WAIT_PICKUP:'รอรับเครื่อง', APPROVED:'อนุมัติแล้ว',
  WAITING_APPROVAL:'รออนุมัติ', WAITING_PARTS:'รออะไหล่',
}

export default function StaffChatListPage() {
  const router = useRouter()
  const [repairs,  setRepairs]  = useState<Repair[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    api.get('/repairs', { params: { limit: 30, sortBy: 'updatedAt', order: 'desc' } })
      .then((res) => {
        const rows: Repair[] = res.data?.data ?? res.data ?? []
        setRepairs(rows.filter(r => ACTIVE_STATUSES.includes(r.status)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      <div className="bg-white px-5 pt-14 pb-4 shadow-sm">
        <h1 className="text-xl font-bold text-brand-black">แชทงานซ่อม</h1>
        <p className="text-xs text-slate-400 mt-0.5">แชทกับลูกค้าผ่านงานซ่อมที่กำลังดำเนินการ</p>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : repairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow/20">
              <MessageCircle className="h-8 w-8 text-brand-yellow" />
            </div>
            <p className="text-sm font-medium text-slate-500">ยังไม่มีงานซ่อมที่ดำเนินการอยู่</p>
            <p className="text-xs text-slate-400 text-center">งานซ่อมที่กำลังดำเนินการจะแสดงที่นี่<br />เพื่อให้สามารถแชทกับลูกค้าได้</p>
          </div>
        ) : (
          <div className="space-y-2">
            {repairs.map((r) => {
              const techName = r.technician?.name ?? r.technicianName ?? 'ยังไม่มอบหมายช่าง'
              const label    = r.deviceBrand ? `${r.deviceBrand} ${r.deviceModel ?? ''}`.trim() : r.customer?.name ?? 'ลูกค้า'
              return (
                <button
                  key={r.id}
                  onClick={() => router.push(`/staff/chat/${r.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] text-left active:bg-slate-50"
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-yellow">
                    <Wrench className="h-5 w-5 text-brand-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-brand-black truncate">{label}</p>
                      <p className="text-[10px] text-slate-400 shrink-0">
                        {formatDistanceToNow(new Date(r.updatedAt), { locale: th, addSuffix: true })}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">ช่าง: {techName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                        {S_LABEL[r.status] ?? r.status}
                      </span>
                      <p className="text-[10px] text-slate-300 font-mono">{r.ticketNumber ?? r.id.slice(0,8)}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
