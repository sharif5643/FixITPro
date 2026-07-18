'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Wallet, Check } from 'lucide-react'
import api from '@/lib/api'

export default function OpenSessionPage() {
  const router      = useRouter()
  const qc          = useQueryClient()
  const [amount, setAmount]   = useState('')
  const [note, setNote]       = useState('')
  const [error, setError]     = useState('')

  const open = useMutation({
    mutationFn: () =>
      api.post('/cash-drawer/session/open', {
        openingAmount: parseFloat(amount) || 0,
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-drawer-session-current'] })
      router.replace('/staff/cash-drawer')
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'เปิดรอบไม่สำเร็จ')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = parseFloat(amount)
    if (isNaN(n) || n < 0) { setError('กรุณาระบุจำนวนเงินที่ถูกต้อง'); return }
    open.mutate()
  }

  const quickAmounts = [0, 500, 1000, 2000, 5000]

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      {/* Header */}
      <div className="bg-white px-5 pt-14 pb-5 shadow-sm flex items-center gap-3">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl active:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
          <Wallet className="h-5 w-5 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">เปิดรอบลิ้นชัก</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">

        {/* Amount */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">เงินตั้งต้นในลิ้นชัก</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">฿</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-2xl font-bold text-slate-800 outline-none focus:border-amber-400 focus:bg-white"
            />
          </div>
          {/* Quick amounts */}
          <div className="flex flex-wrap gap-2">
            {quickAmounts.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(q.toString())}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  amount === q.toString()
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                {q === 0 ? 'ไม่มีเงินตั้งต้น' : `฿${q.toLocaleString()}`}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">หมายเหตุ (ไม่บังคับ)</label>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="เช่น กะเช้า, กะบ่าย..."
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-amber-400 focus:bg-white"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={open.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-base font-bold text-white shadow-sm active:bg-amber-600 disabled:opacity-50"
        >
          {open.isPending ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <Check className="h-5 w-5" />
              เปิดรอบลิ้นชัก
            </>
          )}
        </button>
      </form>
    </div>
  )
}
