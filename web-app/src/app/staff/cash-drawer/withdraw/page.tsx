'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, TrendingDown, Check } from 'lucide-react'
import api from '@/lib/api'

const REASONS = ['ซื้ออุปกรณ์', 'ค่าอาหาร/เครื่องดื่ม', 'ค่าส่ง', 'ค่าบริการอื่น']

export default function WithdrawPage() {
  const router  = useRouter()
  const qc      = useQueryClient()
  const [amount, setAmount]  = useState('')
  const [reason, setReason]  = useState('')
  const [note, setNote]      = useState('')
  const [error, setError]    = useState('')

  const withdraw = useMutation({
    mutationFn: () =>
      api.post('/cash-drawer/session/withdraw', {
        amount:  parseFloat(amount),
        reason,
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-drawer-session-current'] })
      router.replace('/staff/cash-drawer')
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'เบิกเงินไม่สำเร็จ')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setError('กรุณาระบุจำนวนเงินที่ถูกต้อง'); return }
    if (!reason.trim()) { setError('กรุณาระบุเหตุผล'); return }
    withdraw.mutate()
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pt-14 pb-5 shadow-sm flex items-center gap-3">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl active:bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
          <TrendingDown className="h-5 w-5 text-red-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">เบิกเงินจากลิ้นชัก</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Amount */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">จำนวนเงิน</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">฿</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-2xl font-bold text-slate-800 outline-none focus:border-red-400 focus:bg-white"
            />
          </div>
        </div>

        {/* Reason */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">เหตุผล *</label>
          <div className="flex flex-wrap gap-2">
            {REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  reason === r
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="หรือพิมพ์เหตุผลเอง..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-red-400 focus:bg-white"
          />
        </div>

        {/* Note */}
        <div className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">หมายเหตุเพิ่มเติม (ไม่บังคับ)</label>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม..."
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-red-400 focus:bg-white"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="submit"
          disabled={withdraw.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-base font-bold text-white shadow-sm active:bg-red-600 disabled:opacity-50"
        >
          {withdraw.isPending ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <Check className="h-5 w-5" />
              ยืนยันเบิกเงิน
            </>
          )}
        </button>
      </form>
    </div>
  )
}
