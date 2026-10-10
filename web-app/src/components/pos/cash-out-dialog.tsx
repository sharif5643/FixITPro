'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowUpCircle, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatThaiMoney, apiErrorMessage } from '@/lib/utils'
import { openCashDrawer } from '@/lib/cash-drawer'
import api from '@/lib/api'

const DEFAULT_REASON = 'เบิกเงินสด'

/**
 * F9 on the POS: take cash out of the drawer. Amount, Enter → recorded as cash taken out of
 * the shift (the owner is told) and the drawer opens.
 */
export function CashOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setReason('')
    requestAnimationFrame(() => amountRef.current?.focus())
  }, [open])

  const value = Number(amount)
  const save = useMutation({
    mutationFn: () => api.post('/shifts/cash-movements', {
      direction: 'OUT', amount: value, reason: reason.trim() || DEFAULT_REASON,
    }),
    onSuccess: () => {
      openCashDrawer().catch(() => {})
      toast.success(`เบิกเงิน ${formatThaiMoney(value)} — เปิดลิ้นชักแล้ว`)
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      onClose()
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err)),
  })

  const canSave = value > 0 && !save.isPending
  const submit = () => { if (canSave) save.mutate() }
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ArrowUpCircle className="h-5 w-5" />
            เบิกเงินจากลิ้นชัก
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">฿</span>
            <Input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="ใส่ยอด แล้วกด Enter"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={onEnter}
              className="h-14 pl-8 text-2xl font-bold text-right tabular-nums"
            />
          </div>
          <Input
            placeholder={`เหตุผล (ไม่ใส่ก็ได้ — "${DEFAULT_REASON}")`}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={onEnter}
          />
          <p className="text-xs text-muted-foreground">
            บันทึกเป็น “นำเงินออก” ในกะนี้ ยอดปิดกะจะได้ตรง · เจ้าของร้านได้รับแจ้งเตือน
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>ยกเลิก (Esc)</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5" disabled={!canSave} onClick={submit}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              เบิก {value > 0 ? formatThaiMoney(value) : ''} (Enter)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
