'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Star, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

export default function StaffReviewPage() {
  const router = useRouter()
  const { id: repairId } = useParams<{ id: string }>()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const LABELS = ['', 'แย่มาก', 'แย่', 'พอใช้', 'ดี', 'ดีมาก']

  async function submit() {
    if (!rating) { toast.error('กรุณาให้คะแนน'); return }
    setLoading(true)
    try {
      await api.post(`/repairs/${repairId}/review`, { rating, comment })
      toast.success('ขอบคุณสำหรับรีวิว')
      router.replace('/staff/repairs')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'ส่งรีวิวไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white px-5 pt-12 pb-4 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <h1 className="text-base font-bold text-brand-black">ให้คะแนนงาน</h1>
      </div>

      <div className="px-6 py-8 flex flex-col items-center gap-6">
        {/* Star rating */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-medium text-slate-600">คุณพอใจกับงานซ่อมนี้มากแค่ไหน?</p>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setRating(s)}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                className="transition-transform active:scale-90"
              >
                <Star
                  className={`h-10 w-10 transition-colors ${
                    s <= (hovered || rating)
                      ? 'fill-brand-yellow text-brand-yellow'
                      : 'text-slate-200'
                  }`}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <span className="text-sm font-semibold text-brand-black">
              {LABELS[hovered || rating]}
            </span>
          )}
        </div>

        {/* Comment */}
        <div className="w-full">
          <label className="text-sm font-medium text-slate-700 block mb-2">ความคิดเห็นเพิ่มเติม</label>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="บอกเราว่าคุณรู้สึกอย่างไรกับบริการ..."
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none resize-none focus:border-brand-yellow"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || !rating}
          className="w-full h-13 rounded-2xl bg-brand-yellow py-4 font-bold text-brand-black text-sm shadow-md disabled:opacity-60 flex items-center justify-center"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ส่งรีวิว'}
        </button>
      </div>
    </div>
  )
}
