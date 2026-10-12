'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { CheckCircle2, Loader2, PackageMinus, Search, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { formatThaiMoney } from '@/lib/utils'
import type { Product } from '@/types'

export type PartsPendingJob = {
  id: string
  ticketNumber: string
  deviceBrand: string
  deviceModel: string
  issue: string
  finalCost: number | null
  deliveredAt: string | null
  branchId: string | null
  customer: { name: string; phone: string | null } | null
  parts: { id: string; productName: string | null; quantity: number; isFreebie: boolean }[]
}

export const partsPendingKey = (branchId?: string) => ['repairs', 'parts-pending', branchId ?? 'all']

export function usePartsPending(branchId?: string, enabled = true) {
  return useQuery<PartsPendingJob[]>({
    queryKey: partsPendingKey(branchId),
    queryFn: async () => (await api.get('/repairs/parts-pending', { params: branchId ? { branchId } : {} })).data,
    enabled,
    staleTime: 15_000,
  })
}

/** Name and phone, once: a customer saved from a phone number alone is named after it */
const customerText = (c: PartsPendingJob['customer']) => {
  if (!c) return 'ไม่ระบุลูกค้า'
  if (!c.phone || c.name.includes(c.phone)) return c.name
  return `${c.name} · ${c.phone}`
}

const errText = (err: any, fallback: string) => {
  const msg = err?.response?.data?.message
  return Array.isArray(msg) ? msg[0] : (msg ?? fallback)
}

/** One quick job: take the parts it really used (used or given free), then mark it done. */
function PendingJob({ job, onChanged }: { job: PartsPendingJob; onChanged: () => void }) {
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  const term = debounced || job.deviceModel

  const { data: products = [], isFetching } = useQuery<Product[]>({
    queryKey: ['products', 'parts-pending', term, job.branchId],
    queryFn: async () => (await api.get('/products', { params: { search: term, ...(job.branchId ? { branchId: job.branchId } : {}) } })).data,
    enabled: searching,
    staleTime: 30_000,
  })

  const add = useMutation({
    mutationFn: (p: { productId: string; freebie: boolean }) =>
      api.post(`/repairs/${job.id}/parts`, { productId: p.productId, quantity: 1, ...(p.freebie ? { freebie: true } : {}) }),
    onSuccess: () => { toast.success('เบิกอะไหล่แล้ว'); onChanged() },
    onError: (err) => toast.error(errText(err, 'เบิกไม่สำเร็จ')),
  })
  const remove = useMutation({
    mutationFn: (partId: string) => api.delete(`/repairs/${job.id}/parts/${partId}`),
    onSuccess: () => { toast.success('คืนอะไหล่เข้าสต๊อกแล้ว'); onChanged() },
    onError: (err) => toast.error(errText(err, 'คืนไม่สำเร็จ')),
  })
  const done = useMutation({
    mutationFn: () => api.patch(`/repairs/${job.id}/parts-done`, {}),
    onSuccess: () => { toast.success(`${job.ticketNumber} เบิกอะไหล่ครบแล้ว`); onChanged() },
    onError: (err) => toast.error(errText(err, 'บันทึกไม่สำเร็จ')),
  })

  return (
    <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{job.deviceBrand !== '-' ? `${job.deviceBrand} ` : ''}{job.deviceModel} · {job.issue}</p>
          <p className="truncate text-xs text-muted-foreground">
            {customerText(job.customer)}
            {job.deliveredAt ? ` · ${format(new Date(job.deliveredAt), 'd MMM HH:mm', { locale: th })}` : ''}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">{job.ticketNumber}</p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">{formatThaiMoney(job.finalCost ?? 0)}</span>
      </div>

      {job.parts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {job.parts.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">
              {p.productName} ×{p.quantity}{p.isFreebie ? ' (แถม)' : ''}
              <button type="button" title="คืนเข้าสต๊อก" disabled={remove.isPending} onClick={() => remove.mutate(p.id)} className="text-slate-400 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {searching ? (
        <div className="mt-2 space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input autoFocus className="pl-8" placeholder={`ค้นหาอะไหล่ (แสดงของ ${job.deviceModel})`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isFetching && <p className="text-xs text-muted-foreground">กำลังค้นหา…</p>}
          {!isFetching && products.length === 0 && <p className="text-xs text-muted-foreground">ไม่พบอะไหล่ — ลองพิมพ์ชื่ออื่น</p>}
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {products.slice(0, 20).map((p) => {
              const stock = p.branchQuantity ?? p.stock ?? 0
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.name}</p>
                    <p className={stock > 0 ? 'text-[11px] text-muted-foreground' : 'text-[11px] font-semibold text-red-500'}>
                      {stock > 0 ? `เหลือ ${stock}` : 'หมด'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8" disabled={stock <= 0 || add.isPending} onClick={() => add.mutate({ productId: p.id, freebie: false })}>ใช้ซ่อม</Button>
                  <Button size="sm" variant="outline" className="h-8 border-emerald-300 text-emerald-700" disabled={stock <= 0 || add.isPending} onClick={() => add.mutate({ productId: p.id, freebie: true })}>แถม</Button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setSearching((v) => !v)}>
          <PackageMinus className="mr-1 h-4 w-4" />{searching ? 'ปิดการค้นหา' : 'เบิกอะไหล่'}
        </Button>
        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={done.isPending} onClick={() => done.mutate()}>
          {done.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          {job.parts.length > 0 ? 'เบิกครบแล้ว' : 'ไม่ได้ใช้อะไหล่'}
        </Button>
      </div>
    </div>
  )
}

/** Quick jobs (paid without an intake ticket) still waiting for their parts to be taken from stock. */
export function PartsPendingDialog({
  open, onOpenChange, branchId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  branchId?: string
}) {
  const qc = useQueryClient()
  const { data: jobs = [], isLoading } = usePartsPending(branchId, open)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['repairs'] })
    qc.invalidateQueries({ queryKey: ['products'] })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📦 งานที่ยังไม่เบิกอะไหล่ ({jobs.length})</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          งานที่รับเงินไปแล้วแต่ยังไม่ได้ตัดสต๊อก — เบิกของที่ใช้จริง (จอ ฟิล์มแถม ฯลฯ) แล้วกด "เบิกครบแล้ว"
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีงานค้างเบิกอะไหล่ 🎉</p>
        ) : (
          <div className="space-y-2.5">
            {jobs.map((j) => <PendingJob key={j.id} job={j} onChanged={refresh} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
