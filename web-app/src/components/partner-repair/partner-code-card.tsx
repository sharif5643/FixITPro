'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, KeyRound, Link2, Loader2, RefreshCw } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiErrorMessage } from '@/lib/utils'
import api from '@/lib/api'

const inviteLink = (code: string) => `${window.location.origin}/settings/partners?code=${code}`

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`คัดลอก${what}แล้ว`)
  } catch {
    toast.error('คัดลอกไม่ได้ — กดค้างที่ข้อความเพื่อคัดลอกเอง')
  }
}

/**
 * Connect with another shop in one step: give them this shop's code (or the invite link), or type
 * theirs. A shared code is that shop's yes, so the two become partners straight away.
 */
export function PartnerCodeCard() {
  const qc = useQueryClient()
  const [typed, setTyped] = useState('')

  // Opened from an invite link: the code is already filled in
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code')
    if (c) setTyped(c.toUpperCase())
  }, [])

  const { data: mine } = useQuery<{ code: string }>({
    queryKey: ['partner-relationships', 'my-code'],
    queryFn: () => api.get('/partner-relationships/my-code').then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  const reset = useMutation({
    mutationFn: () => api.post('/partner-relationships/my-code/reset').then((r) => r.data as { code: string }),
    onSuccess: (d) => {
      qc.setQueryData(['partner-relationships', 'my-code'], d)
      toast.success('เปลี่ยนรหัสแล้ว — รหัสและลิงก์เดิมใช้ไม่ได้อีก')
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  })

  const connect = useMutation({
    mutationFn: () => api.post('/partner-relationships/by-code', { code: typed }).then((r) => r.data as { partnerShopName?: string }),
    onSuccess: (d) => {
      toast.success(`เชื่อมกับ ${d.partnerShopName ?? 'ร้านพาร์ทเนอร์'} แล้ว — ส่งงานซ่อมหากันได้เลย`)
      setTyped('')
      window.history.replaceState(null, '', window.location.pathname)
      qc.invalidateQueries({ queryKey: ['partner-relationships'] })
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  })

  const canConnect = typed.replace(/[^A-Za-z0-9]/g, '').length === 6 && !connect.isPending

  return (
    <SectionCard title="เชื่อมร้านด้วยรหัสร้าน" description="ให้รหัสหรือลิงก์กับร้านที่จะส่งงานหากัน หรือใส่รหัสของเขา — เชื่อมกันทันที ไม่ต้องรอตอบรับ" icon={KeyRound}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">รหัสร้านของคุณ</p>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em] text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              {mine?.code ?? '······'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!mine} onClick={() => mine && copy(mine.code, 'รหัส')}>
              <Copy className="h-3.5 w-3.5" /> คัดลอกรหัส
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!mine} onClick={() => mine && copy(inviteLink(mine.code), 'ลิงก์เชิญ')}>
              <Link2 className="h-3.5 w-3.5" /> คัดลอกลิงก์เชิญ
            </Button>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={reset.isPending}
              onClick={() => { if (confirm('เปลี่ยนรหัสร้าน? รหัสและลิงก์เดิมจะใช้ไม่ได้ (ร้านที่เชื่อมแล้วยังเชื่อมอยู่)')) reset.mutate() }}>
              <RefreshCw className="h-3.5 w-3.5" /> เปลี่ยนรหัส
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">ให้เฉพาะร้านที่ไว้ใจ: ใครมีรหัสนี้เชื่อมเป็นพาร์ทเนอร์ได้ทันที</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">ใส่รหัสร้านพาร์ทเนอร์</p>
          <div className="flex gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && canConnect) connect.mutate() }}
              placeholder="เช่น K7Q2MX"
              maxLength={8}
              className="font-mono text-lg tracking-widest uppercase"
            />
            <Button type="button" disabled={!canConnect} onClick={() => connect.mutate()} className="shrink-0 gap-1.5">
              {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              เชื่อมร้าน
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
