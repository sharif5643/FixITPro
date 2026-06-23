'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Wrench, Loader2, Package, Clock, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'

type InputType = 'ticket' | 'phone' | 'unknown'

interface RepairSummary {
  ticketNumber: string
  status: string
  statusLabel: string
  deviceBrand: string
  deviceModel: string
  deviceColor?: string
  receivedAt: string
  dueDate?: string
  completedAt?: string
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

function detectType(value: string): InputType {
  const v = value.trim().replace(/\s/g, '')
  if (!v) return 'unknown'
  if (/[A-Za-z]/.test(v) || v.includes('-')) return 'ticket'
  if (/^\d+$/.test(v)) return 'phone'
  return 'unknown'
}

function fmt(date: string | null | undefined) {
  if (!date) return '—'
  try { return format(new Date(date), 'd MMM yyyy', { locale: th }) } catch { return '—' }
}

export default function TrackPage() {
  const router = useRouter()
  const [query, setQuery]               = useState('')
  const [inputType, setInputType]       = useState<InputType>('unknown')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [phoneResults, setPhoneResults] = useState<RepairSummary[] | null>(null)

  useEffect(() => {
    setInputType(detectType(query))
    setError('')
    setPhoneResults(null)
  }, [query])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = query.trim()
    if (!v) { setError('กรุณากรอกเลขใบซ่อมหรือเบอร์โทร'); return }

    const type = detectType(v)

    if (type === 'ticket' || type === 'unknown') {
      router.push(`/track/${encodeURIComponent(v.toUpperCase())}`)
      return
    }

    // phone search
    setLoading(true)
    setError('')
    setPhoneResults(null)
    try {
      const qs = new URLSearchParams({ phone: v })
      const { data } = await axios.get<RepairSummary[]>(
        `${API_URL}/public/tracking/repair?${qs}`
      )
      if (data.length === 0) {
        setError('ไม่พบงานซ่อมที่ตรงกับเบอร์โทรนี้')
      } else {
        setPhoneResults(data)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      setError(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
              <Wrench className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ติดตามงานซ่อม</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              ตรวจสอบสถานะงานซ่อมแบบ real-time
            </p>
          </div>
        </div>

        {/* Search card */}
        <Card className="shadow-xl border-0 dark:bg-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ค้นหางานซ่อม</CardTitle>
            <CardDescription>กรอกเลขใบซ่อม หรือ เบอร์โทรศัพท์ อย่างใดอย่างหนึ่ง</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div className="relative">
                <Input
                  placeholder="REP-XXXXXX  หรือ  0812345678"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-24 font-mono tracking-wide text-base h-12"
                  autoComplete="off"
                  autoFocus
                />
                {inputType !== 'unknown' && query.trim() && (
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none
                    ${inputType === 'ticket'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    }`}
                  >
                    {inputType === 'ticket' ? 'เลขใบซ่อม' : 'เบอร์โทร'}
                  </span>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full gap-2 h-11" size="lg" disabled={loading}>
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />
                }
                {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Phone search results */}
        {phoneResults && phoneResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              พบ {phoneResults.length} รายการ
            </p>
            {phoneResults.map((r) => {
              const colorCls = STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-600'
              return (
                <button
                  key={r.ticketNumber}
                  type="button"
                  onClick={() => router.push(`/track/${encodeURIComponent(r.ticketNumber)}`)}
                  className="w-full text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                          {r.ticketNumber}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colorCls}`}>
                          {r.statusLabel}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {r.deviceBrand} {r.deviceModel}
                        {r.deviceColor ? ` · ${r.deviceColor}` : ''}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                        {(r.status === 'READY_PICKUP' || r.status === 'COMPLETED' || r.status === 'DELIVERED') ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {r.completedAt ? `เสร็จ ${fmt(r.completedAt)}` : 'เสร็จแล้ว'}
                          </span>
                        ) : r.dueDate ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            กำหนด {fmt(r.dueDate)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            รับเมื่อ {fmt(r.receivedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 shrink-0 mt-1 transition-colors" />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Hints */}
        <div className="text-center space-y-1">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            ค้นหาด้วย <span className="font-medium text-slate-500 dark:text-slate-400">เลขใบซ่อม</span> เช่น REP-20240101-A1B2
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            หรือ <span className="font-medium text-slate-500 dark:text-slate-400">เบอร์โทร</span> เพื่อดูงานซ่อมทั้งหมดของคุณ
          </p>
        </div>

      </div>
    </div>
  )
}
