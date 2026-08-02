'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
  Wrench, Loader2, AlertCircle, CheckCircle2, Clock, Package,
  ArrowLeft, Phone, Shield, CreditCard, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import axios from 'axios'

const API_URL = (() => {
  const env = process.env.NEXT_PUBLIC_API_URL
  if (typeof window === 'undefined') return env ?? '/api/v1'
  try {
    if (env && new URL(env).hostname === window.location.hostname) return env
  } catch { /* malformed env URL */ }
  return `${window.location.origin}/api/v1`
})()

interface StatusHistoryItem {
  status: string
  label: string
  changedAt: string
}

interface Warranty {
  id: string
  warrantyNumber: string
  status: string
  startDate: string
  endDate: string
  description?: string
}

interface RepairDetail {
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
  statusHistory: StatusHistoryItem[]
  phoneVerified: boolean
  customerName?: string | null
  outstanding?: number | null
  paymentStatus?: string | null
  warranties?: Warranty[]
  warrantyExpiresAt?: string | null
  warrantyNote?: string | null
  qcPassed?: boolean | null
  qcNote?: string | null
}

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  QC_PENDING:       'bg-indigo-100 text-indigo-700',
  COMPLETED:        'bg-green-100 text-green-700',
  READY_PICKUP:     'bg-emerald-100 text-emerald-800',
  DELIVERED:        'bg-slate-100 text-slate-600',
  CANCELLED:        'bg-red-100 text-red-600',
}

const STATUS_DOT: Record<string, string> = {
  RECEIVED:         'bg-blue-500',
  DIAGNOSING:       'bg-yellow-500',
  WAITING_APPROVAL: 'bg-amber-500',
  APPROVED:         'bg-teal-500',
  WAITING_PARTS:    'bg-orange-500',
  IN_PROGRESS:      'bg-purple-500',
  QC_PENDING:       'bg-indigo-500',
  COMPLETED:        'bg-green-500',
  READY_PICKUP:     'bg-emerald-500',
  DELIVERED:        'bg-slate-400',
  CANCELLED:        'bg-red-500',
}

function fmt(date: string | null | undefined) {
  if (!date) return '—'
  try { return format(new Date(date), 'd MMM yyyy', { locale: th }) } catch { return '—' }
}

function fmtDateTime(date: string | null | undefined) {
  if (!date) return '—'
  try { return format(new Date(date), 'd MMM yyyy HH:mm', { locale: th }) } catch { return '—' }
}

export default function RepairDetailPage() {
  const params        = useParams()
  const searchParams  = useSearchParams()
  const router        = useRouter()

  const ticketNumber  = decodeURIComponent(String(params.ticketNumber ?? '')).toUpperCase()
  const phone         = searchParams.get('phone') ?? ''

  const [data, setData]           = useState<RepairDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneNeeded, setPhoneNeeded] = useState(false)

  async function fetchRepair(phoneOverride?: string) {
    if (!ticketNumber) return
    setLoading(true)
    setError('')
    setPhoneNeeded(false)
    try {
      const qs = new URLSearchParams({ ticketNumber })
      const p = phoneOverride ?? phone
      if (p) qs.set('phone', p)
      const { data: result } = await axios.get<RepairDetail>(
        `${API_URL}/public/tracking/repair?${qs}`,
      )
      setData(result)
    } catch (err: unknown) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      const text = Array.isArray(msg) ? msg[0] : msg
      if (httpStatus === 400 && String(text).includes('โทรศัพท์')) {
        setError('หมายเลขโทรศัพท์ไม่ถูกต้อง')
        setPhoneNeeded(true)
        // Retry without phone so we still show public-level info
        try {
          const qs2 = new URLSearchParams({ ticketNumber })
          const { data: pub } = await axios.get<RepairDetail>(`${API_URL}/public/tracking/repair?${qs2}`)
          setData(pub)
          setError('')
        } catch { /* show original error */ }
      } else {
        setError(text)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRepair()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber])

  const isDone = data && ['COMPLETED', 'READY_PICKUP', 'DELIVERED'].includes(data.status)

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 px-4 py-10">
      <div className="w-full max-w-md space-y-4">

        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/track')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            ค้นหาใหม่
          </button>
          <div className="flex-1" />
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow shadow-blue-500/30">
            <Wrench className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <Card className="shadow-xl border-0 dark:bg-[#1E293B]">
            <CardContent className="py-14 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลดข้อมูล...</p>
            </CardContent>
          </Card>
        )}

        {/* Fatal error (no data at all) */}
        {!loading && error && !data && (
          <Card className="shadow-xl border-0 dark:bg-[#1E293B]">
            <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">ไม่สามารถโหลดข้อมูลได้</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{error}</p>
              </div>
              <Button variant="outline" onClick={() => router.push('/track')}>
                กลับหน้าค้นหา
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main detail view */}
        {!loading && data && (
          <>
            {/* Status Hero card */}
            <Card className="shadow-xl border-0 dark:bg-[#1E293B] overflow-hidden">
              <div className={`h-1.5 w-full ${STATUS_DOT[data.status] ?? 'bg-slate-400'}`} />
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                        {data.ticketNumber}
                      </span>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[data.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {data.statusLabel}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {data.deviceBrand} {data.deviceModel}
                    </p>
                    {data.deviceColor && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{data.deviceColor}</p>
                    )}
                  </div>
                  {isDone && <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                      <Package className="h-3 w-3" />รับเครื่อง
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmt(data.receivedAt)}</p>
                  </div>
                  {data.completedAt ? (
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 mb-0.5">
                        <CheckCircle2 className="h-3 w-3" />ซ่อมเสร็จ
                      </div>
                      <p className="text-sm font-semibold text-green-800 dark:text-green-200">{fmt(data.completedAt)}</p>
                    </div>
                  ) : data.dueDate ? (
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                        <Clock className="h-3 w-3" />กำหนดเสร็จ
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmt(data.dueDate)}</p>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Wrong-phone banner (but we still have public data) */}
            {phoneNeeded && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  หมายเลขโทรศัพท์ไม่ถูกต้อง — กรุณากรอกใหม่เพื่อดูข้อมูลครบถ้วน
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="เบอร์โทรศัพท์"
                    className="flex-1 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <Button
                    size="sm"
                    onClick={() => fetchRepair(phoneInput)}
                    disabled={!phoneInput.trim()}
                  >
                    ยืนยัน
                  </Button>
                </div>
              </div>
            )}

            {/* Phone-verified details */}
            {data.phoneVerified && (data.customerName || data.paymentStatus !== null || typeof data.outstanding === 'number') && (
              <Card className="shadow-lg border-0 dark:bg-[#1E293B]">
                <CardHeader className="pb-3 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <User className="h-4 w-4 text-blue-500" />
                    ข้อมูลการซ่อม
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2.5">
                  {data.customerName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">ชื่อลูกค้า</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{data.customerName}</span>
                    </div>
                  )}
                  {data.paymentStatus && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">สถานะชำระ</span>
                      <span className={`font-semibold ${
                        data.paymentStatus === 'PAID'    ? 'text-green-600 dark:text-green-400' :
                        data.paymentStatus === 'PARTIAL' ? 'text-amber-600 dark:text-amber-400' :
                        'text-slate-700 dark:text-slate-300'
                      }`}>
                        {data.paymentStatus === 'PAID'    ? 'ชำระแล้ว' :
                         data.paymentStatus === 'PARTIAL' ? 'ชำระบางส่วน' :
                         data.paymentStatus === 'UNPAID'  ? 'ยังไม่ชำระ' :
                         data.paymentStatus}
                      </span>
                    </div>
                  )}
                  {typeof data.outstanding === 'number' && data.outstanding > 0 && (
                    <div className="flex justify-between text-sm border-t border-slate-100 dark:border-slate-700 pt-2.5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />ยอดค้างชำระ
                      </span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        ฿{data.outstanding.toLocaleString()}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Warranties */}
            {data.phoneVerified && data.warranties && data.warranties.length > 0 && (
              <Card className="shadow-lg border-0 dark:bg-[#1E293B]">
                <CardHeader className="pb-3 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <Shield className="h-4 w-4 text-green-500" />
                    การรับประกัน
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {data.warranties.map((w) => (
                    <div key={w.id} className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-xs font-semibold text-green-700 dark:text-green-400">{w.warrantyNumber}</span>
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">ยังไม่หมดอายุ</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {fmt(w.startDate)} – {fmt(w.endDate)}
                      </p>
                      {w.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{w.description}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Status History Timeline */}
            {data.statusHistory && data.statusHistory.length > 0 && (
              <Card className="shadow-lg border-0 dark:bg-[#1E293B]">
                <CardHeader className="pb-3 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <Clock className="h-4 w-4 text-slate-400" />
                    ประวัติสถานะ
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="relative pl-6">
                    {data.statusHistory.map((h, i) => {
                      const isLatest = i === data.statusHistory.length - 1
                      return (
                        <div key={i} className="relative pb-4 last:pb-0">
                          {!isLatest && (
                            <div className="absolute left-[-17px] top-5 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                          )}
                          <div className={`absolute left-[-21px] top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#1E293B] ${
                            isLatest ? (STATUS_DOT[h.status] ?? 'bg-slate-400') : 'bg-slate-300 dark:bg-slate-600'
                          }`} />
                          <div>
                            <p className={`text-sm font-semibold ${
                              isLatest ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              {h.label}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                              {fmtDateTime(h.changedAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Hint to verify phone if not yet done */}
            {!data.phoneVerified && !phoneNeeded && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex items-start gap-3">
                <Phone className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">ดูข้อมูลเพิ่มเติม</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    กลับหน้าค้นหาแล้วกรอกเบอร์โทรศัพท์เพื่อดูยอดค้างชำระและการรับประกัน
                  </p>
                </div>
              </div>
            )}

            <div className="text-center pt-1">
              <button
                onClick={() => router.push('/track')}
                className="text-sm text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                ← กลับหน้าค้นหา
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
