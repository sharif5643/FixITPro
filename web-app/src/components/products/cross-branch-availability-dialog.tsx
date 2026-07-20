'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRightLeft, Loader2, AlertCircle, CheckCircle2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Product, BranchAvailability } from '@/types'

interface ProductAvailability {
  productId: string
  branches: BranchAvailability[]
}

interface Props {
  open: boolean
  onClose: () => void
  product: Product | null
  currentBranchId: string | undefined
  currentBranchName?: string
  onRequested?: () => void
}

export function CrossBranchAvailabilityDialog({
  open, onClose, product, currentBranchId, currentBranchName, onRequested,
}: Props) {
  const qc = useQueryClient()
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')

  const reset = () => { setSelectedBranchId(''); setQty(''); setNote('') }

  useEffect(() => { if (!open) reset() }, [open])
  useEffect(() => { setQty('') }, [selectedBranchId])

  const { data: avail, isLoading } = useQuery<ProductAvailability>({
    queryKey: ['product-availability', product?.id],
    queryFn:  () => api.get(`/products/${product!.id}/availability`).then((r) => r.data),
    enabled:  open && !!product,
    staleTime: 30_000,
  })

  const sourceBranches = (avail?.branches ?? []).filter(
    (b) => b.quantity > 0 && b.branchId !== currentBranchId,
  )

  const selected = sourceBranches.find((b) => b.branchId === selectedBranchId)
  const maxQty   = selected?.quantity ?? 0
  const qtyNum   = Number(qty)
  const isValid  = !!selectedBranchId && !!qty && qtyNum > 0 && Number.isInteger(qtyNum) && qtyNum <= maxQty

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/branches/transfers', {
        fromBranchId: selectedBranchId,
        toBranchId:   currentBranchId,
        productId:    product!.id,
        quantity:     qtyNum,
        note:         note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('ส่งคำขอโอนสินค้าแล้ว รอสาขาต้นทางอนุมัติ')
      onClose()
      onRequested?.()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-5 w-5 text-blue-600 shrink-0" />
            ขอโอนสินค้าจากสาขาอื่น
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Product info */}
          <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{product?.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{product?.sku}</p>
            <p className="text-xs text-red-500 mt-1">ไม่มีสินค้าในสาขานี้</p>
          </div>

          {/* Source branch cards */}
          <div>
            <Label className="text-sm font-medium">เลือกสาขาที่มีสินค้า</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลด...
              </div>
            ) : sourceBranches.length === 0 ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                ไม่มีสาขาอื่นที่มีสินค้านี้อยู่ในขณะนี้
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {sourceBranches.map((b) => {
                  const isSelected = b.branchId === selectedBranchId
                  return (
                    <button
                      key={b.branchId}
                      type="button"
                      onClick={() => setSelectedBranchId(b.branchId)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-slate-200 dark:border-slate-700/60 bg-white hover:bg-slate-50',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {isSelected ? (
                          <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                        ) : (
                          <Package className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                        )}
                        <span className={cn('text-sm font-medium', isSelected ? 'text-blue-900' : 'text-slate-800 dark:text-slate-100')}>
                          {b.branchName}
                        </span>
                      </div>
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        isSelected ? 'bg-blue-200 text-blue-800' : 'bg-green-100 text-green-700',
                      )}>
                        มี {b.quantity} ชิ้น
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Destination */}
          <div>
            <Label className="text-sm font-medium">ส่งมายัง</Label>
            <div className="mt-1 rounded-md border bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {currentBranchName ?? currentBranchId ?? 'สาขาปัจจุบัน'}
            </div>
          </div>

          {/* Quantity */}
          {selectedBranchId && (
            <div>
              <Label htmlFor="cross-qty" className="text-sm font-medium">
                จำนวนที่ต้องการ
                <span className="ml-1 font-normal text-muted-foreground text-xs">
                  (สูงสุด {maxQty} ชิ้น)
                </span>
              </Label>
              <Input
                id="cross-qty"
                type="number"
                inputMode="numeric"
                min="1"
                max={maxQty}
                step="1"
                placeholder="ระบุจำนวน..."
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 text-base h-11"
              />
              {!!qty && qtyNum > maxQty && (
                <p className="mt-1 text-xs text-red-500">จำนวนเกินสต็อกที่มี ({maxQty} ชิ้น)</p>
              )}
            </div>
          )}

          {/* Note */}
          <div>
            <Label htmlFor="cross-note" className="text-sm font-medium">
              หมายเหตุ{' '}
              <span className="font-normal text-muted-foreground text-xs">(ไม่บังคับ)</span>
            </Label>
            <Input
              id="cross-note"
              placeholder="เหตุผลหรือรายละเอียด..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending} className="flex-1">
            ยกเลิก
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending || sourceBranches.length === 0}
            className="flex-1 gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4" />
                ส่งคำขอโอน
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
