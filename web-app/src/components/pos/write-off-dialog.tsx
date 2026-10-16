'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

export type WriteOffItem = { productId: string; name: string; quantity: number; serialIds?: string[] }

export const WRITE_OFF_REASONS = [
  { key: 'FREEBIE',      label: 'แถม' },
  { key: 'CLAIM',        label: 'เคลม' },
  { key: 'SWAP',         label: 'เปลี่ยนให้ลูกค้า' },
  { key: 'INTERNAL_USE', label: 'ใช้ในร้าน/ช่างใช้' },
  { key: 'DAMAGED',      label: 'เสีย/ชำรุด' },
  { key: 'OTHER',        label: 'อื่นๆ' },
] as const

/**
 * Goods leaving without money (free gift, claim, swap, used in the shop, damaged): taken out of
 * stock with the reason instead of being rung up as a 0-baht sale, so sales and profit stay true.
 */
export function WriteOffDialog({
  open, onOpenChange, items, branchId, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: WriteOffItem[]
  branchId?: string | null
  onDone?: () => void
}) {
  const qc = useQueryClient()
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: () => api.post('/stock/write-off', {
      reason, note: note.trim() || undefined,
      ...(branchId ? { branchId } : {}),
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, ...(i.serialIds?.length ? { serialIds: i.serialIds } : {}) })),
    }),
    onSuccess: () => {
      toast.success('ตัดสต๊อกแล้ว — ไม่นับเป็นยอดขาย')
      qc.invalidateQueries({ queryKey: ['products'] })
      setReason(''); setNote('')
      onOpenChange(false)
      onDone?.()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'ตัดสต๊อกไม่สำเร็จ'))
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ตัดสต๊อก (ไม่ใช่การขาย)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
            {items.map((i) => (
              <div key={i.productId} className="flex justify-between gap-2">
                <span className="truncate">{i.name}</span>
                <span className="shrink-0 font-semibold">×{i.quantity}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">เหตุผล</p>
            <div className="grid grid-cols-3 gap-1.5">
              {WRITE_OFF_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={cn('rounded-lg border px-2 py-2 text-xs font-semibold',
                    reason === r.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Input placeholder="หมายเหตุ เช่น แถมกับ iPhone 13 ลูกค้าคุณเอ" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <Button className="w-full" disabled={!reason || items.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ตัดสต๊อก {items.reduce((s, i) => s + i.quantity, 0)} ชิ้น
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Late entry: when (Bangkok local time on this device) the sale really happened */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
