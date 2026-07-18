'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react'
import api from '@/lib/api'

interface SessionSummary {
  id: string
  openingAmount: number
  expectedAmount: number
  cashDrawer: { name: string }
}

type Step = 'count' | 'confirm'

export default function CloseSessionPage() {
  const router = useRouter()
  const qc     = useQueryClient()
  const [step, setStep]               = useState<Step>('count')
  const [counted, setCounted]         = useState('')
  const [closingNote, setClosingNote] = useState('')
  const [diffReason, setDiffReason]   = useState('')
  const [error, setError]             = useState('')

  const { data: session } = useQuery<SessionSummary | null>({
    queryKey: ['cash-drawer-session-current'],
    queryFn:  async () => (await api.get('/cash-drawer/session/current')).data,
  })

  const close = useMutation({
    mutationFn: () =>
      api.post('/cash-drawer/session/close', {
        countedAmount:    parseFloat(counted),
        closingNote:      closingNote || undefined,
        differenceReason: diffReason  || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-drawer-session-current'] })
      router.replace('/staff/cash-drawer')
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'ปิดรอบไม่สำเร็จ')
    },
  })

  function fmt(n?: number) {
    if (n == null) return '—'
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const countedNum  = parseFloat(counted) || 0
  const expected    = session?.expectedAmount ?? 0
  const difference  = countedNum - expected
  const hasDiff     = Math.abs(difference) >= 0.01

  function handleNextStep(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = parseFloat(counted)
    if (isNaN(n) || n < 0) { setError('กรุณาระบุจำนวนเงินที่ถูกต้อง'); return }
    setStep('confirm')
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pt-14 pb-5 shadow-sm flex items-center gap-3">
        <button onClick={() => step === 'confirm' ? setStep('count') : router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl active:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">ปิดรอบลิ้นชัก</h1>
          <p className="text-xs text-slate-400">{step === 'count' ? 'ขั้นที่ 1: นับเงินจริง' : 'ขั้นที่ 2: ยืนยัน'}</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 px-5 pt-4">
        {(['count', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              step === s ? 'bg-red-500 text-white' : step === 'confirm' && s === 'count' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
            }`}>
              {step === 'confirm' && s === 'count' ? '✓' : i + 1}
            </div>
            <span className={`text-xs ${step === s ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
              {s === 'count' ? 'นับเงิน' : 'ยืนยัน'}
            </span>
            {i < 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
          </div>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {step === 'count' ? (
          <form onSubmit={handleNextStep} className="space-y-4">
            {/* Expected */}
            {session && (
              <div className="rounded-2xl bg-amber-50 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">ยอดที่ระบบคาดไว้</p>
                <p className="text-3xl font-bold text-amber-700">฿{fmt(session.expectedAmount)}</p>
                <p className="text-xs text-amber-500">{session.cashDrawer.name}</p>
              </div>
            )}

            {/* Count input */}
            <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">เงินที่นับได้จริง</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">฿</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={counted}
                  onChange={e => setCounted(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-2xl font-bold text-slate-800 outline-none focus:border-red-400 focus:bg-white"
                />
              </div>
              {counted !== '' && session && (
                <div className={`rounded-xl p-3 text-sm font-medium ${
                  hasDiff ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {hasDiff
                    ? `ส่วนต่าง: ${difference > 0 ? '+' : ''}฿${fmt(difference)}`
                    : 'ยอดตรงกัน'}
                </div>
              )}
            </div>

            {/* Note */}
            <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">หมายเหตุปิดรอบ (ไม่บังคับ)</label>
              <textarea
                rows={2}
                value={closingNote}
                onChange={e => setClosingNote(e.target.value)}
                placeholder="สรุปรอบ..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-red-400 focus:bg-white"
              />
            </div>

            {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-4 text-base font-bold text-white shadow-sm active:bg-slate-700"
            >
              ดูสรุป →
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-2xl bg-white shadow-sm p-5 space-y-4">
              <p className="text-sm font-semibold text-slate-600">สรุปการปิดรอบ</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">ยอดที่คาด</span>
                  <span className="font-semibold">฿{fmt(expected)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">นับได้จริง</span>
                  <span className="font-semibold">฿{fmt(countedNum)}</span>
                </div>
                <div className={`flex justify-between rounded-xl p-2.5 text-sm font-bold ${
                  hasDiff ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  <span>ส่วนต่าง</span>
                  <span>{difference >= 0 ? '+' : ''}฿{fmt(difference)}</span>
                </div>
              </div>
            </div>

            {/* Difference reason */}
            {hasDiff && (
              <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  เหตุผลที่มีส่วนต่าง (ไม่บังคับ)
                </label>
                <textarea
                  rows={2}
                  value={diffReason}
                  onChange={e => setDiffReason(e.target.value)}
                  placeholder="อธิบายสาเหตุ..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-red-400 focus:bg-white"
                />
                {hasDiff && (
                  <p className="text-xs text-amber-600">
                    หากมีส่วนต่างและไม่มีสิทธิ์ approve ระบบจะรอ Manager อนุมัติก่อน
                  </p>
                )}
              </div>
            )}

            {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

            <button
              onClick={() => close.mutate()}
              disabled={close.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-base font-bold text-white shadow-sm active:bg-red-600 disabled:opacity-50"
            >
              {close.isPending ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  ยืนยันปิดรอบ
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
