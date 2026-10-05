'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BellRing, CheckCircle2, Copy, Loader2, MessageCircle } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'

interface LinkCode { code: string | null; expiresInSec?: number; oaId?: string | null; addFriendUrl?: string | null; shopReady: boolean }

/**
 * Job alerts on LINE (arrive even when the phone is locked): add the shop's LINE Official
 * Account as a friend, then send it the code shown here.
 */
export function LineLinkCard() {
  const qc = useQueryClient()
  const [code, setCode] = useState<LinkCode | null>(null)

  const { data: status } = useQuery<{ linked: boolean }>({
    queryKey: ['line-staff-status'],
    queryFn: async () => (await api.get('/line/staff/status')).data,
    // While a code is shown, check every few seconds for the link to arrive
    refetchInterval: code && !code.shopReady ? false : code ? 4_000 : false,
  })
  const linked = !!status?.linked

  const create = useMutation({
    mutationFn: async () => (await api.post('/line/staff/link-code')).data as LinkCode,
    onSuccess: (d) => setCode(d),
    onError: (e: any) => toast.error(apiErrorMessage(e)),
  })
  const unlink = useMutation({
    mutationFn: async () => (await api.delete('/line/staff/link')).data,
    onSuccess: () => { setCode(null); qc.invalidateQueries({ queryKey: ['line-staff-status'] }); toast.success('ยกเลิกการแจ้งเตือนทาง LINE แล้ว') },
  })

  // Linked from LINE while the code was showing: done
  useEffect(() => {
    if (linked && code) { setCode(null); toast.success('เชื่อม LINE แล้ว') }
  }, [linked, code])

  return (
    <div className="rounded-2xl bg-white shadow-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#06C755]/15">
          <BellRing className="h-4.5 w-4.5 text-[#06C755]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">แจ้งเตือนงานซ่อมทาง LINE</p>
          <p className="text-xs text-slate-500">เด้งเข้า LINE แม้ล็อกจอ เมื่อมีงานใหม่ให้คุณ</p>
        </div>
        {linked && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" />เชื่อมแล้ว</span>}
      </div>

      {linked ? (
        <button onClick={() => unlink.mutate()} disabled={unlink.isPending}
          className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600">
          ยกเลิกการเชื่อม LINE
        </button>
      ) : !code ? (
        <button onClick={() => create.mutate()} disabled={create.isPending}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-[#06C755] py-3 text-sm font-bold text-white disabled:opacity-60">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          เชื่อม LINE
        </button>
      ) : !code.shopReady ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          ร้านยังไม่ได้ตั้งค่า LINE OA — ให้เจ้าของร้านตั้งค่าที่ ตั้งค่า → LINE ก่อน แล้วกลับมากดเชื่อมอีกครั้ง
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <ol className="text-xs text-slate-600 list-decimal pl-4 space-y-1">
            <li>เพิ่มเพื่อน LINE ของร้าน{code.oaId ? ` (${code.oaId})` : ''}</li>
            <li>ส่งรหัสนี้ในแชทของร้าน (ใช้ได้ 15 นาที)</li>
          </ol>
          <div className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
            <span className="text-2xl font-extrabold tracking-wider text-slate-900">{code.code}</span>
            <button onClick={() => { navigator.clipboard?.writeText(code.code ?? '').catch(() => {}); toast.success('คัดลอกรหัสแล้ว') }}
              className="p-2 text-slate-500" aria-label="คัดลอก"><Copy className="h-5 w-5" /></button>
          </div>
          {code.addFriendUrl && (
            <a href={code.addFriendUrl} target="_blank" rel="noreferrer"
              className="block w-full rounded-xl bg-[#06C755] py-3 text-center text-sm font-bold text-white">
              เปิด LINE ของร้าน
            </a>
          )}
          <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> รอการยืนยันจาก LINE…
          </p>
        </div>
      )}
    </div>
  )
}
