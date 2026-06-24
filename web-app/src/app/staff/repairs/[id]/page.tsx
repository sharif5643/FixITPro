'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ChevronLeft, MessageCircle, Phone, Printer, Star,
  Wrench, User, Smartphone, Clock, CheckCircle2,
  Package, Loader2, Edit2, X,
} from 'lucide-react'
import api from '@/lib/api'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'

interface Repair {
  id:              string
  ticketNumber:    string
  status:          string
  customerName:    string
  customerPhone:   string
  customerLineId?: string
  deviceBrand:     string
  deviceModel:     string
  deviceColor?:    string
  deviceImei?:     string
  deviceSerial?:   string
  issueTitle?:     string
  issueDescription?: string
  technicianName?: string
  estimatedCost?:  number
  createdAt:       string
  updatedAt:       string
  statusHistory?:  { status: string; note?: string; actorName?: string; createdAt: string }[]
}

const TIMELINE = [
  { key: 'PENDING',     label: 'รับเครื่อง',    icon: <Clock className="h-4 w-4" /> },
  { key: 'IN_PROGRESS', label: 'กำลังซ่อม',    icon: <Wrench className="h-4 w-4" /> },
  { key: 'WAIT_PARTS',  label: 'รออะไหล่',     icon: <Package className="h-4 w-4" /> },
  { key: 'WAIT_PICKUP', label: 'รอส่งมอบ',     icon: <CheckCircle2 className="h-4 w-4" /> },
  { key: 'COMPLETED',   label: 'ส่งมอบแล้ว',   icon: <CheckCircle2 className="h-4 w-4" /> },
]

const ORDER = ['PENDING', 'IN_PROGRESS', 'WAIT_PARTS', 'WAIT_PICKUP', 'COMPLETED']

const STATUS_COLOR: Record<string, string> = {
  PENDING:     'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  WAIT_PARTS:  'bg-purple-100 text-purple-700',
  WAIT_PICKUP: 'bg-green-100 text-green-700',
  COMPLETED:   'bg-emerald-100 text-emerald-700',
  CANCELLED:   'bg-red-100 text-red-600',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:     'รอตรวจสอบ',
  IN_PROGRESS: 'กำลังซ่อม',
  WAIT_PARTS:  'รออะไหล่',
  WAIT_PICKUP: 'รอรับเครื่อง',
  COMPLETED:   'เสร็จสิ้น',
  CANCELLED:   'ยกเลิก',
}

export default function RepairDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [repair,  setRepair]  = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    api.get(`/repairs/${id}`).then((r) => setRepair(r.data)).catch(() => toast.error('ไม่พบงานซ่อม')).finally(() => setLoading(false))
  }, [id])

  async function cancelRepair() {
    if (!confirm('ยืนยันการยกเลิกงานซ่อม?')) return
    setCancelling(true)
    try {
      await api.patch(`/repairs/${id}`, { status: 'CANCELLED' })
      toast.success('ยกเลิกงานซ่อมแล้ว')
      router.back()
    } catch {
      toast.error('ยกเลิกไม่สำเร็จ')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-light">
        <Loader2 className="h-8 w-8 animate-spin text-brand-yellow" />
      </div>
    )
  }

  if (!repair) return null

  const currentStep = ORDER.indexOf(repair.status)

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-28">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-400">หมายเลขซ่อม</p>
            <p className="font-bold text-brand-black">{repair.ticketNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[repair.status] || 'bg-slate-100 text-slate-500'}`}>
            {STATUS_LABEL[repair.status] || repair.status}
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Customer info */}
        <SectionCard title="ข้อมูลลูกค้า" icon={<User className="h-4 w-4 text-brand-info" />}>
          <InfoRow label="ชื่อ" value={repair.customerName} />
          <InfoRow label="เบอร์โทร" value={repair.customerPhone} />
          {repair.customerLineId && <InfoRow label="LINE ID" value={repair.customerLineId} />}
        </SectionCard>

        {/* Device info */}
        <SectionCard title="ข้อมูลอุปกรณ์" icon={<Smartphone className="h-4 w-4 text-brand-yellow" />}>
          <InfoRow label="ยี่ห้อ" value={repair.deviceBrand} />
          <InfoRow label="รุ่น"   value={repair.deviceModel} />
          {repair.deviceColor  && <InfoRow label="สี"     value={repair.deviceColor} />}
          {repair.deviceImei   && <InfoRow label="IMEI"   value={repair.deviceImei} />}
          {repair.deviceSerial && <InfoRow label="S/N"    value={repair.deviceSerial} />}
          {repair.issueTitle   && <InfoRow label="อาการ"  value={repair.issueTitle} />}
          {repair.technicianName && <InfoRow label="ช่างรับผิดชอบ" value={repair.technicianName} />}
          {repair.estimatedCost != null && (
            <InfoRow label="ราคาประเมิน" value={`฿${repair.estimatedCost.toLocaleString()}`} highlight />
          )}
        </SectionCard>

        {/* Timeline */}
        <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <p className="mb-4 text-sm font-semibold text-brand-black">ขั้นตอนการซ่อม</p>
          <div className="flex flex-col gap-0">
            {TIMELINE.map((step, i) => {
              const done    = i <= currentStep
              const current = i === currentStep
              const isLast  = i === TIMELINE.length - 1
              return (
                <div key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                      current ? 'bg-brand-yellow text-brand-black shadow-[0_4px_12px_rgba(255,193,7,0.5)]' :
                      done    ? 'bg-brand-success text-white' : 'bg-slate-100 text-slate-300'
                    }`}>
                      {step.icon}
                    </div>
                    {!isLast && (
                      <div className={`mt-1 mb-1 w-0.5 h-6 ${done && i < currentStep ? 'bg-brand-success' : 'bg-slate-100'}`} />
                    )}
                  </div>
                  <div className={`flex-1 pb-2 ${isLast ? '' : ''}`}>
                    <p className={`text-sm font-semibold pt-1 ${current ? 'text-brand-black' : done ? 'text-brand-success' : 'text-slate-300'}`}>
                      {step.label}
                    </p>
                    {current && (
                      <p className="text-[11px] text-slate-400">
                        {format(new Date(repair.updatedAt), "d MMM yyyy HH:mm", { locale: th })}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => repair.customerPhone && (window.location.href = `tel:${repair.customerPhone}`)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50"
          >
            <Phone className="h-4 w-4 text-brand-success" />
            โทรหาลูกค้า
          </button>
          <button
            onClick={() => router.push(`/staff/chat/${repair.id}`)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50"
          >
            <MessageCircle className="h-4 w-4 text-brand-info" />
            แชทกับช่าง
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push(`/repairs/${repair.id}/edit`)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50"
          >
            <Edit2 className="h-4 w-4 text-brand-warning" />
            แก้ไข
          </button>
          <button
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] active:opacity-90"
          >
            <Printer className="h-4 w-4" />
            พิมพ์ใบรับซ่อม
          </button>
        </div>

        {repair.status === 'COMPLETED' && (
          <button
            onClick={() => router.push(`/staff/review/${repair.id}`)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-black text-sm font-bold text-white active:opacity-90"
          >
            <Star className="h-4 w-4 text-brand-yellow" />
            รีวิวงาน
          </button>
        )}

        {repair.status === 'PENDING' && (
          <button
            onClick={cancelRepair}
            disabled={cancelling}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-brand-danger/20 text-sm font-semibold text-brand-danger active:bg-red-50"
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            ยกเลิกงานซ่อม
          </button>
        )}
      </div>
    </div>
  )
}

function SectionCard({ title, icon, children }: {
  title:    string
  icon:     React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-sm font-semibold text-brand-black">{title}</p>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <p className="w-28 shrink-0 text-xs text-slate-400">{label}</p>
      <p className={`flex-1 text-sm ${highlight ? 'font-bold text-brand-yellow' : 'font-medium text-slate-700'}`}>
        {value}
      </p>
    </div>
  )
}
