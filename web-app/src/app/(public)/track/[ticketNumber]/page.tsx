'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Wrench,
  Package,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Banknote,
  Camera,
  History,
  Circle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; step: number }> = {
  RECEIVED:         { label: 'รับงานแล้ว',             color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       icon: <Package className="h-4 w-4" />,      step: 1 },
  DIAGNOSING:       { label: 'กำลังวินิจฉัย',          color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: <Wrench className="h-4 w-4" />,       step: 2 },
  WAITING_APPROVAL: { label: 'รออนุมัติราคา',           color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',   icon: <Clock className="h-4 w-4" />,        step: 2 },
  APPROVED:         { label: 'อนุมัติแล้ว',             color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',       icon: <CheckCircle2 className="h-4 w-4" />, step: 3 },
  WAITING_PARTS:    { label: 'รออะไหล่',                color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: <Package className="h-4 w-4" />,     step: 3 },
  IN_PROGRESS:      { label: 'กำลังซ่อม',               color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', icon: <Wrench className="h-4 w-4" />,      step: 4 },
  QC_PENDING:       { label: 'กำลังตรวจ QC',            color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', icon: <ShieldCheck className="h-4 w-4" />, step: 5 },
  COMPLETED:        { label: 'ซ่อมเสร็จแล้ว',           color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',   icon: <CheckCircle2 className="h-4 w-4" />, step: 6 },
  READY_PICKUP:     { label: 'พร้อมรับเครื่อง 🎉',      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', icon: <CheckCircle2 className="h-4 w-4" />, step: 6 },
  DELIVERED:        { label: 'ส่งมอบแล้ว',              color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',      icon: <CheckCircle2 className="h-4 w-4" />, step: 7 },
  CANCELLED:        { label: 'ยกเลิก',                  color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',           icon: <AlertCircle className="h-4 w-4" />,  step: 0 },
}

const STEPS = ['รับงาน', 'วินิจฉัย', 'ซ่อม', 'ตรวจ QC', 'เสร็จ', 'รับเครื่อง']

function fmt(date: string | null | undefined) {
  if (!date) return '—'
  try { return format(new Date(date), 'd MMM yyyy HH:mm น.', { locale: th }) } catch { return '—' }
}

interface StatusEntry {
  status: string
  label: string
  changedAt: string
}

interface TrackData {
  ticketNumber: string
  status: string
  statusLabel: string
  deviceBrand: string
  deviceModel: string
  deviceColor?: string
  receivedAt: string
  dueDate?: string
  completedAt?: string
  deliveredAt?: string
  customerName?: string
  images: { id: string; url: string; createdAt: string }[]
  qcPassed: boolean | null
  qcNote: string | null
  qcAt?: string
  outstanding: number
  paymentStatus: string
  warranties: { id: string; warrantyNumber: string; status: string; startDate: string; endDate: string; description?: string }[]
  warrantyExpiresAt?: string
  warrantyNote?: string
  statusHistory: StatusEntry[]
}

export default function TrackDetailPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const router       = useRouter()

  const ticketNumber = decodeURIComponent(params.ticketNumber as string)
  const phone        = searchParams.get('phone') ?? ''

  const [data, setData]       = useState<TrackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    if (!ticketNumber) {
      setError('ข้อมูลไม่ครบถ้วน กรุณาค้นหาใหม่')
      setLoading(false)
      return
    }
    const qs = new URLSearchParams({ ticketNumber })
    if (phone) qs.set('phone', phone)
    axios
      .get<TrackData>(`${API_URL}/public/tracking/repair?${qs}`)
      .then((r) => setData(r.data))
      .catch((e) => {
        const msg = e.response?.data?.message ?? 'ไม่พบข้อมูลงานซ่อม กรุณาตรวจสอบข้อมูลและลองใหม่'
        setError(Array.isArray(msg) ? msg[0] : msg)
      })
      .finally(() => setLoading(false))
  }, [ticketNumber, phone])

  const cfg         = data ? (STATUS_CONFIG[data.status] ?? STATUS_CONFIG['RECEIVED']) : null
  const currentStep = cfg?.step ?? 0

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">

      {/* Top bar */}
      <div className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/track')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{ticketNumber}</p>
            <p className="text-xs text-muted-foreground">ติดตามงานซ่อม</p>
          </div>
          {data && cfg && (
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูล...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <CardContent className="pt-6 flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
                <Button
                  variant="link"
                  className="px-0 h-auto text-red-600 text-sm"
                  onClick={() => router.push('/track')}
                >
                  ← ค้นหาใหม่
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {data && cfg && (
          <>
            {/* ─── Status hero card ─── */}
            <Card className="overflow-hidden shadow-md border-0">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-blue-200 text-sm mb-1 truncate">
                      {data.deviceBrand} {data.deviceModel}
                      {data.deviceColor ? ` · ${data.deviceColor}` : ''}
                    </p>
                    <h2 className="text-xl font-bold">{ticketNumber}</h2>
                    {data.customerName && (
                      <p className="text-blue-100 text-sm mt-1">ลูกค้า: {data.customerName}</p>
                    )}
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
              </div>

              {/* Progress stepper */}
              {data.status !== 'CANCELLED' && (
                <div className="px-5 py-4 border-b dark:border-slate-700 bg-white dark:bg-slate-800">
                  <div className="flex items-center">
                    {STEPS.map((step, i) => {
                      const done   = i + 1 < currentStep
                      const active = i + 1 === currentStep
                      return (
                        <div key={step} className="flex items-center flex-1 min-w-0">
                          <div className={`shrink-0 flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold transition-colors
                            ${done   ? 'bg-blue-600 text-white'
                              : active ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ring-2 ring-blue-400'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}
                          >
                            {done ? '✓' : i + 1}
                          </div>
                          {i < STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1 transition-colors ${done ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-2">
                    {STEPS.map((step) => (
                      <span key={step} className="text-[9px] text-muted-foreground text-center flex-1">{step}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key dates */}
              <CardContent className="pt-4 pb-5 bg-white dark:bg-slate-800">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">รับเครื่องวันที่</dt>
                    <dd className="font-medium mt-0.5">{fmt(data.receivedAt)}</dd>
                  </div>
                  {data.dueDate && (
                    <div>
                      <dt className="text-muted-foreground text-xs">กำหนดเสร็จ</dt>
                      <dd className="font-medium mt-0.5">{fmt(data.dueDate)}</dd>
                    </div>
                  )}
                  {data.completedAt && (
                    <div>
                      <dt className="text-muted-foreground text-xs">ซ่อมเสร็จ</dt>
                      <dd className="font-medium mt-0.5 text-green-600 dark:text-green-400">{fmt(data.completedAt)}</dd>
                    </div>
                  )}
                  {data.deliveredAt && (
                    <div>
                      <dt className="text-muted-foreground text-xs">ส่งมอบ</dt>
                      <dd className="font-medium mt-0.5">{fmt(data.deliveredAt)}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* ─── Outstanding payment ─── */}
            {data.outstanding > 0 && (
              <Card className="border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <Banknote className="h-6 w-6 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      ยอดค้างชำระ {data.outstanding.toLocaleString('th-TH')} บาท
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">กรุณาชำระเมื่อมารับเครื่อง</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── QC result ─── */}
            {data.qcPassed !== null && (
              <Card>
                <CardContent className="pt-4 pb-4 flex items-start gap-3">
                  <ShieldCheck className={`h-5 w-5 shrink-0 mt-0.5 ${data.qcPassed ? 'text-green-500' : 'text-red-500'}`} />
                  <div>
                    <p className="font-medium text-sm">
                      QC {data.qcPassed ? 'ผ่านแล้ว ✓' : 'ยังไม่ผ่าน — กำลังดำเนินการแก้ไข'}
                    </p>
                    {data.qcNote && (
                      <p className="text-xs text-muted-foreground mt-1">{data.qcNote}</p>
                    )}
                    {data.qcAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">ตรวจเมื่อ {fmt(data.qcAt)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Photos ─── */}
            {data.images.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    รูปภาพงานซ่อม ({data.images.length} รูป)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    {data.images.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => setLightbox(img.url)}
                        className="aspect-square rounded-lg overflow-hidden border dark:border-slate-700 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${API_URL.replace('/api/v1', '')}${img.url}`}
                          alt="repair"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Warranties ─── */}
            {data.warranties.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    การรับประกัน
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-2">
                  {data.warrantyNote && (
                    <p className="text-xs text-muted-foreground mb-2">{data.warrantyNote}</p>
                  )}
                  {data.warranties.map((w) => (
                    <div key={w.id} className="flex items-center justify-between py-2 border-b dark:border-slate-700 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{w.warrantyNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(w.startDate)} — {fmt(w.endDate)}
                        </p>
                        {w.description && <p className="text-xs text-muted-foreground mt-0.5">{w.description}</p>}
                      </div>
                      <Badge variant={w.status === 'ACTIVE' ? 'default' : 'secondary'} className="ml-2 shrink-0">
                        {w.status === 'ACTIVE' ? 'ใช้งานได้' : 'หมดอายุ'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ─── Status history timeline ─── */}
            {data.statusHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    ประวัติสถานะ
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2">
                    {data.statusHistory.map((entry, i) => {
                      const isLast    = i === data.statusHistory.length - 1
                      const entryConf = STATUS_CONFIG[entry.status]
                      return (
                        <li key={i} className="mb-0 ml-4 pb-4 last:pb-0">
                          {/* Timeline dot */}
                          <span className={`absolute flex items-center justify-center w-4 h-4 rounded-full -left-2 mt-0.5 ring-2 ring-white dark:ring-slate-900
                            ${isLast ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                          >
                            {isLast
                              ? <Circle className="w-2 h-2 fill-white text-white" />
                              : <CheckCircle2 className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                            }
                          </span>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className={`text-sm font-medium ${isLast ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {entryConf?.label ?? entry.label}
                              </p>
                              <time className="text-xs text-muted-foreground">{fmt(entry.changedAt)}</time>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* ─── Back button ─── */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => router.push('/track')}
            >
              <ArrowLeft className="h-4 w-4" />
              ค้นหางานซ่อมอื่น
            </Button>
          </>
        )}
      </div>

      {/* ─── Lightbox ─── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="รูปภาพขยาย"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_URL.replace('/api/v1', '')}${lightbox}`}
            alt="repair"
            className="max-w-full max-h-full rounded-lg object-contain"
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
            onClick={() => setLightbox(null)}
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
