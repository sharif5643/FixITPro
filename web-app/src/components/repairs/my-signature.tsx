'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { SignaturePad } from './signature-pad'

/**
 * My own signature, saved once: it prints as the shop's signature on the repair slips I take in.
 * Full-screen sheet so it works the same in the web, the staff app and SUNMI.
 */
export function MySignatureSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ image: string | null }>({
    queryKey: ['my-signature'],
    queryFn: async () => (await api.get('/auth/my-signature')).data,
  })
  const [png, setPng] = useState<string | null>(null)
  const [redraw, setRedraw] = useState(false)
  const save = useMutation({
    mutationFn: (image: string | null) => (image ? api.put('/auth/my-signature', { image }) : api.delete('/auth/my-signature')),
    onSuccess: (_r, image) => {
      qc.setQueryData(['my-signature'], { image })
      toast.success(image ? 'บันทึกลายเซ็นของคุณแล้ว' : 'ลบลายเซ็นแล้ว')
      if (image) onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const drawing = redraw || !data?.image
  return (
    <div role="dialog" aria-modal="true" aria-label="ลายเซ็นของฉัน" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-slate-900">ลายเซ็นของฉัน</p>
            <p className="text-xs text-slate-500">ใช้เป็น &quot;ลายเซ็นร้าน&quot; ในใบรับซ่อมที่คุณเป็นคนรับงาน</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : drawing ? (
          <>
            <SignaturePad onChange={setPng} />
            <button type="button" onClick={() => png && save.mutate(png)} disabled={!png || save.isPending}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-sm font-bold text-white disabled:opacity-40">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              บันทึกลายเซ็นของฉัน
            </button>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data!.image!} alt="ลายเซ็นของฉัน" className="mx-auto h-32 object-contain" />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setRedraw(true)}
                className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">เซ็นใหม่</button>
              <button type="button" onClick={() => save.mutate(null)} disabled={save.isPending}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-600 disabled:opacity-40">
                <Trash2 className="h-4 w-4" /> ลบ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
