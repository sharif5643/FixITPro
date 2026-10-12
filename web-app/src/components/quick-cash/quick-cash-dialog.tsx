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
import { CASH_CATEGORIES, cashReason, type CashDirection } from '@/lib/quick-cash'

const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000]

/** Money in / out of the drawer at the counter: what for, how much, done. */
export function QuickCashDialog({
  direction, open, onOpenChange,
}: {
  direction: CashDirection
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const cats = CASH_CATEGORIES[direction]
  const picked = cats.find((c) => c.key === category)
  const amountNum = Number(amount)

  const reset = () => { setCategory(''); setAmount(''); setNote('') }

  const save = useMutation({
    mutationFn: () => api.post('/shifts/cash-movements', {
      direction, amount: amountNum, category, reason: cashReason(category, note),
    }),
    onSuccess: () => {
      toast.success(direction === 'IN' ? `รับเงินเข้า ${amountNum.toLocaleString('th-TH')} บาทแล้ว` : `เอาเงินออก ${amountNum.toLocaleString('th-TH')} บาทแล้ว`)
      qc.invalidateQueries({ queryKey: ['shifts'] })
      reset()
      onOpenChange(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'บันทึกไม่สำเร็จ'))
    },
  })

  const canSave = !!category && amountNum > 0 && !save.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{direction === 'IN' ? '💰 รับเงินเข้าลิ้นชัก' : '💸 เอาเงินออกจากลิ้นชัก'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold">{direction === 'IN' ? 'รับเงินค่าอะไร' : 'เอาไปทำอะไร'}</p>
            <div className="grid grid-cols-2 gap-2">
              {cats.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors active:scale-[0.98]',
                    category === c.key
                      ? direction === 'IN' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-rose-600 bg-rose-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {picked?.hint && <p className="mt-1.5 text-xs text-muted-foreground">{picked.hint}</p>}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">จำนวนเงิน (บาท)</p>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 text-right text-2xl font-bold tabular-nums"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(String(a))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold tabular-nums hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {a.toLocaleString('th-TH')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">หมายเหตุ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span></p>
            <Input placeholder="เช่น ลงโปรแกรม A10, ข้าวกลางวัน" value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} />
          </div>

          <Button
            className={cn('h-12 w-full text-base font-bold', direction === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700')}
            disabled={!canSave}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {direction === 'IN' ? 'บันทึกรับเงิน' : 'บันทึกเอาเงินออก'}
            {amountNum > 0 ? ` ${amountNum.toLocaleString('th-TH')} บาท` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
