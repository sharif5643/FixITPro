'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageCircle, CheckCircle2 } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'

interface LinkInfo {
  ready: boolean
  linked: boolean
  oaId: string | null
  url: string | null
  readsImages: boolean
}

/**
 * Staff link their own LINE once, then report SIM / package sales by typing "dtac 250" (or
 * sending a screenshot) in the chat with FixITPro's LINE account. Hidden until that account is
 * set up on the server.
 */
export function LineSimLink({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery<LinkInfo>({
    queryKey: ['line-staff-link'],
    queryFn: () => api.get('/line/staff/link').then((r) => r.data),
    staleTime: 60_000,
  })
  const unlink = useMutation({
    mutationFn: () => api.delete('/line/staff/link'),
    onSuccess: () => { toast.success('ยกเลิกการเชื่อม LINE แล้ว'); qc.invalidateQueries({ queryKey: ['line-staff-link'] }) },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  if (!data?.ready) return null

  return (
    <div className={`rounded-2xl border border-green-200 bg-green-50 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} space-y-2`}>
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-green-600 shrink-0" />
        <p className="font-semibold text-green-800 text-sm">บันทึกขายซิม/เน็ตผ่าน LINE</p>
        {data.linked && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto shrink-0" />}
      </div>
      {data.linked ? (
        <>
          <p className="text-xs text-green-700 leading-relaxed">
            เชื่อมแล้ว พิมพ์ในแชต {data.oaId} เช่น <b>dtac 250</b> หรือ <b>dtac 250 เหลือ 1200</b>
            {data.readsImages ? ' หรือส่งรูปหน้าจอแอปค่าย' : ''} ระบบจะหักกระเป๋าและตอบยอดคงเหลือให้
          </p>
          <div className="flex gap-2">
            {data.url && (
              <a href={data.url} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center rounded-xl bg-green-600 text-white text-sm font-semibold py-2 active:scale-[0.98]">
                เปิดแชต LINE
              </a>
            )}
            <button type="button" onClick={() => unlink.mutate()} disabled={unlink.isPending}
              className="rounded-xl border border-green-300 text-green-700 text-sm px-3 py-2">
              ยกเลิกการเชื่อม
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-green-700 leading-relaxed">
            กดปุ่มแล้วกดส่งข้อความในแชต LINE ครั้งเดียว จากนั้นพิมพ์ เช่น <b>dtac 250</b> ระบบจะบันทึกเป็นชื่อคุณ
          </p>
          {data.url && (
            <a href={data.url} target="_blank" rel="noopener noreferrer"
              onClick={() => setTimeout(() => qc.invalidateQueries({ queryKey: ['line-staff-link'] }), 15_000)}
              className="block text-center rounded-xl bg-green-600 text-white text-sm font-semibold py-2 active:scale-[0.98]">
              เชื่อม LINE ของฉัน
            </a>
          )}
        </>
      )}
    </div>
  )
}
