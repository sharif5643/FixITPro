'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, MessageCircle, X, Clock, CheckCircle2, Package, Loader2, Star } from 'lucide-react'
import api from '@/lib/api'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

interface Repair {
  id: string
  ticketNumber: string
  status: string
  createdAt: string
  deviceBrand?: string
  deviceModel?: string
  issueDescription?: string
  technicianName?: string
  estimatedCost?: number
  customerName?: string
  customerPhone?: string
  repairType?: string
}

const STEPS = [
  { key: 'PENDING',     label: 'รอตรวจสอบ',       icon: Clock          },
  { key: 'IN_PROGRESS', label: 'กำลังดำเนินการ',    icon: Package        },
  { key: 'WAIT_PICKUP', label: 'รอรับ',             icon: CheckCircle2   },
  { key: 'COMPLETED',   label: 'เสร็จสิ้น',         icon: CheckCircle2   },
]

const STATUS_ORDER = ['PENDING', 'IN_PROGRESS', 'WAIT_PICKUP', 'COMPLETED']

export default function StaffRepairDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [repair, setRepair] = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/repairs/${id}`)
      .then((res) => setRepair(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <Loader2 className="h-7 w-7 animate-spin text-brand-yellow" />
    </div>
  )

  if (!repair) return (
    <div className="flex h-screen flex-col items-center justify-center bg-white gap-4 px-6">
      <p className="text-slate-400">ไม่พบข้อมูลงานซ่อม</p>
      <button onClick={() => router.back()} className="text-brand-yellow font-semibold text-sm">กลับ</button>
    </div>
  )

  const currentStepIdx = STATUS_ORDER.indexOf(repair.status)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white px-5 pt-12 pb-4 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-brand-black">รายละเอียดงาน</h1>
          <p className="text-xs text-slate-400 font-mono">{repair.ticketNumber || repair.id.slice(0, 8)}</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Status badge */}
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-brand-black">สถานะงาน</h2>
            <span className="rounded-full bg-brand-yellow px-3 py-1 text-xs font-bold text-brand-black">
              {STEPS.find((s) => s.key === repair.status)?.label ?? repair.status}
            </span>
          </div>

          {/* Timeline */}
          <div className="relative">
            {STEPS.map((step, idx) => {
              const done    = idx <= currentStepIdx
              const current = idx === currentStepIdx
              const Icon    = step.icon
              return (
                <div key={step.key} className="flex items-start gap-3 pb-4 last:pb-0">
                  {/* Line connector */}
                  <div className="relative flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                      current ? 'bg-brand-yellow' : done ? 'bg-brand-black' : 'bg-slate-100'
                    }`}>
                      <Icon className={`h-4 w-4 ${done || current ? 'text-white' : 'text-slate-300'}`} strokeWidth={2} />
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className={`absolute top-8 h-4 w-0.5 ${done ? 'bg-brand-black' : 'bg-slate-200'}`} />
                    )}
                  </div>
                  <div className="pt-1">
                    <p className={`text-sm font-semibold ${current ? 'text-brand-black' : done ? 'text-slate-700' : 'text-slate-300'}`}>
                      {step.label}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-2xl bg-white p-4 shadow-card space-y-3">
          <h2 className="text-sm font-semibold text-brand-black">ข้อมูลงาน</h2>
          {[
            { label: 'ชื่อลูกค้า',    value: repair.customerName },
            { label: 'เบอร์โทร',       value: repair.customerPhone },
            { label: 'อุปกรณ์',        value: [repair.deviceBrand, repair.deviceModel].filter(Boolean).join(' ') || '—' },
            { label: 'ประเภทซ่อม',     value: repair.repairType },
            { label: 'ปัญหา',          value: repair.issueDescription },
            { label: 'ช่างที่รับผิดชอบ', value: repair.technicianName },
            { label: 'ค่าบริการ',       value: repair.estimatedCost ? `฿${repair.estimatedCost.toLocaleString()}` : undefined },
            { label: 'วันที่รับงาน',    value: format(new Date(repair.createdAt), 'd MMM yyyy', { locale: th }) },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <span className="text-xs text-slate-400 flex-shrink-0">{row.label}</span>
              <span className="text-xs font-medium text-brand-black text-right">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/staff/chat?repairId=${repair.id}`)}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-brand-yellow font-semibold text-sm text-brand-black"
          >
            <MessageCircle className="h-4 w-4" />
            แชทกับช่าง
          </button>
          {repair.status === 'COMPLETED' && (
            <button
              onClick={() => router.push(`/staff/review/${repair.id}`)}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-brand-black text-white font-semibold text-sm"
            >
              <Star className="h-4 w-4" />
              รีวิวงาน
            </button>
          )}
          {repair.status === 'PENDING' && (
            <button className="flex items-center justify-center gap-2 h-12 w-12 rounded-xl bg-red-50 text-red-500">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
