'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Phone, MessageCircle, Printer, Star, Loader2, X } from 'lucide-react'
import api from '@/lib/api'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'

interface Repair {
  id:string; ticketNumber:string; status:string
  customerName:string; customerPhone:string; customerLineId?:string
  deviceBrand:string; deviceModel:string; deviceColor?:string; deviceImei?:string
  issueTitle?:string; issueDescription?:string
  technicianName?:string; estimatedCost?:number
  createdAt:string; updatedAt:string
}

const TIMELINE = [
  { key:'PENDING',     label:'รับเครื่องแล้ว',  color:'text-brand-info'    },
  { key:'IN_PROGRESS', label:'กำลังซ่อม',        color:'text-brand-yellow'  },
  { key:'WAIT_PARTS',  label:'รออะไหล่',          color:'text-orange-500'    },
  { key:'WAIT_PICKUP', label:'รอส่งมอบ',          color:'text-brand-success' },
  { key:'COMPLETED',   label:'ส่งมอบแล้ว',        color:'text-brand-success' },
]
const ORDER = ['PENDING','IN_PROGRESS','WAIT_PARTS','WAIT_PICKUP','COMPLETED']

const BADGE: Record<string,string> = {
  PENDING:'bg-blue-100 text-blue-700',
  IN_PROGRESS:'bg-amber-100 text-amber-700',
  WAIT_PARTS:'bg-orange-100 text-orange-700',
  WAIT_PICKUP:'bg-green-100 text-green-700',
  COMPLETED:'bg-emerald-100 text-emerald-700',
  CANCELLED:'bg-red-100 text-red-600',
}
const BADGE_LABEL: Record<string,string> = {
  PENDING:'รอตรวจสอบ', IN_PROGRESS:'กำลังซ่อม',
  WAIT_PARTS:'รออะไหล่', WAIT_PICKUP:'รอรับเครื่อง',
  COMPLETED:'เสร็จสิ้น', CANCELLED:'ยกเลิก',
}

export default function RepairDetailPage() {
  const router = useRouter()
  const { id } = useParams<{id:string}>()
  const [repair,     setRepair]     = useState<Repair|null>(null)
  const [loading,    setLoading]    = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    api.get(`/repairs/${id}`).then(r => setRepair(r.data)).catch(() => toast.error('ไม่พบงานซ่อม')).finally(() => setLoading(false))
  }, [id])

  async function cancelRepair() {
    if (!confirm('ยืนยันยกเลิกงานซ่อม?')) return
    setCancelling(true)
    try {
      await api.patch(`/repairs/${id}`, {status:'CANCELLED'})
      toast.success('ยกเลิกแล้ว')
      router.back()
    } catch { toast.error('ยกเลิกไม่สำเร็จ') }
    finally { setCancelling(false) }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB]"><Loader2 className="h-8 w-8 animate-spin text-brand-yellow" /></div>
  if (!repair) return null

  const curIdx = ORDER.indexOf(repair.status)

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-400">รายละเอียดงานซ่อม</p>
            <p className="font-bold text-brand-black">{repair.ticketNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE[repair.status] ?? 'bg-slate-100 text-slate-500'}`}>
            {BADGE_LABEL[repair.status] ?? repair.status}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Customer + Device */}
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-brand-black">{repair.customerName}</p>
              <p className="text-sm text-slate-500">{repair.customerPhone}</p>
            </div>
            <div className="flex gap-2">
              <a href={`tel:${repair.customerPhone}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
                <Phone className="h-4 w-4 text-brand-success" />
              </a>
              <button
                onClick={() => router.push(`/staff/chat/${repair.id}`)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]"
              >
                <MessageCircle className="h-4 w-4 text-brand-info" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-[#F8F9FB] p-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/10">
              <span className="text-xl">📱</span>
            </div>
            <div>
              <p className="font-semibold text-brand-black">{repair.deviceBrand} {repair.deviceModel} {repair.deviceColor ? `(${repair.deviceColor})` : ''}</p>
              {repair.deviceImei && <p className="text-xs text-slate-400">IMEI: {repair.deviceImei}</p>}
              {repair.issueTitle && <p className="text-xs text-slate-500 mt-0.5">อาการ: {repair.issueTitle}</p>}
            </div>
          </div>
          {repair.technicianName && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-400">ช่างรับผิดชอบ:</span>
              <span className="text-xs font-semibold text-brand-black">{repair.technicianName}</span>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <p className="mb-4 text-sm font-semibold text-brand-black">ความคืบหน้า</p>
          <div className="flex flex-col gap-0">
            {TIMELINE.map((step, i) => {
              const done    = i < curIdx
              const current = i === curIdx
              const isLast  = i === TIMELINE.length - 1
              return (
                <div key={step.key} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      current ? 'bg-brand-yellow text-brand-black shadow-[0_4px_12px_rgba(255,193,7,0.4)]' :
                      done    ? 'bg-brand-success text-white' :
                                'bg-slate-100 text-slate-300'
                    }`}>
                      {done ? '✓' : i + 1}
                    </div>
                    {!isLast && <div className={`my-1 w-0.5 h-6 ${done ? 'bg-brand-success' : 'bg-slate-100'}`} />}
                  </div>
                  <div className={`pt-1.5 ${isLast ? '' : 'pb-2'}`}>
                    <p className={`text-sm font-semibold ${current ? 'text-brand-black' : done ? 'text-brand-success' : 'text-slate-300'}`}>
                      {step.label}
                    </p>
                    {current && (
                      <p className="text-[11px] text-slate-400">
                        {format(new Date(repair.updatedAt), 'd MMM yyyy HH:mm', {locale:th})}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={() => {}}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-base font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)]"
        >
          <Printer className="h-5 w-5" />
          พิมพ์ใบรับซ่อม
        </button>

        <div className="grid grid-cols-2 gap-3">
          <a
            href={`tel:${repair.customerPhone}`}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
          >
            <Phone className="h-4 w-4 text-brand-success" /> โทรหาลูกค้า
          </a>
          <button
            onClick={() => router.push(`/staff/chat/${repair.id}`)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
          >
            <MessageCircle className="h-4 w-4 text-brand-info" /> แชท
          </button>
        </div>

        {repair.status === 'COMPLETED' && (
          <button
            onClick={() => router.push(`/staff/review/${repair.id}`)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-black text-sm font-bold text-white"
          >
            <Star className="h-4 w-4 text-brand-yellow" /> รีวิวงาน
          </button>
        )}

        {repair.status === 'PENDING' && (
          <button
            onClick={cancelRepair}
            disabled={cancelling}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-red-100 text-sm font-semibold text-red-500"
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            ยกเลิกงานซ่อม
          </button>
        )}
      </div>
    </div>
  )
}
