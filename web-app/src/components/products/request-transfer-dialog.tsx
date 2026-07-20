'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import type { Product, BranchAvailability } from '@/types'

interface ProductAvailability {
  productId: string
  branches: BranchAvailability[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: Product | null
  toBranchId: string | undefined
  toBranchName?: string
}

export function RequestTransferDialog({
  open, onOpenChange, product, toBranchId, toBranchName,
}: Props) {
  const qc = useQueryClient()
  const [fromBranchId, setFromBranchId] = useState('')
  const [qty, setQty]   = useState('')
  const [note, setNote] = useState('')

  const reset = () => { setFromBranchId(''); setQty(''); setNote('') }

  const { data: avail, isLoading: loadingAvail } = useQuery<ProductAvailability>({
    queryKey: ['product-availability', product?.id],
    queryFn:  () => api.get(`/products/${product!.id}/availability`).then((r) => r.data),
    enabled:  open && !!product,
    staleTime: 30_000,
  })

  const sourceBranches = (avail?.branches ?? []).filter(
    (b) => b.quantity > 0 && b.branchId !== toBranchId,
  )

  useEffect(() => { reset() }, [product?.id]) // eslint-disable-line

  const selectedSource = sourceBranches.find((b) => b.branchId === fromBranchId)
  const maxQty  = selectedSource?.quantity ?? 0
  const qtyNum  = Number(qty)
  const isValid = !!fromBranchId && !!qty && qtyNum > 0 && Number.isInteger(qtyNum) && qtyNum <= maxQty

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/branches/transfers', {
        fromBranchId,
        toBranchId,
        productId: product!.id,
        quantity:  qtyNum,
        note:      note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('สร้างคำขอโอนสต็อกเรียบร้อย')
      onOpenChange(false)
      reset()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            ขอโอนสินค้าระหว่างสาขา
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Product */}
          <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{product?.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{product?.sku}</p>
          </div>

          {/* Source branch */}
          <div>
            <Label>สาขาต้นทาง (มีสต็อก)</Label>
            {loadingAvail ? (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดข้อมูลสต็อก...
              </div>
            ) : sourceBranches.length === 0 ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                ไม่มีสาขาอื่นที่มีสินค้านี้อยู่ในขณะนี้
              </div>
            ) : (
              <Select value={fromBranchId} onValueChange={(v) => { setFromBranchId(v); setQty('') }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="เลือกสาขาต้นทาง..." />
                </SelectTrigger>
                <SelectContent>
                  {sourceBranches.map((b) => (
                    <SelectItem key={b.branchId} value={b.branchId}>
                      <span className="flex items-center gap-2">
                        <span>{b.branchName}</span>
                        <span className="text-muted-foreground text-xs">(มี {b.quantity} ชิ้น)</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Destination branch */}
          <div>
            <Label>สาขาปลายทาง</Label>
            <div className="mt-1 rounded-md border bg-slate-100 px-3 py-2 text-sm font-medium">
              {toBranchName ?? toBranchId ?? 'สาขาปัจจุบัน'}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label htmlFor="transfer-qty">
              จำนวนที่โอน
              {selectedSource && (
                <span className="ml-1 font-normal text-muted-foreground text-xs">
                  (สูงสุด {selectedSource.quantity} ชิ้น)
                </span>
              )}
            </Label>
            <Input
              id="transfer-qty"
              type="number"
              min="1"
              max={maxQty || undefined}
              step="1"
              placeholder="ระบุจำนวน..."
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1"
              disabled={!fromBranchId}
            />
            {!!qty && qtyNum > maxQty && (
              <p className="mt-1 text-xs text-red-500">จำนวนเกินกว่าที่มีในสาขาต้นทาง ({maxQty} ชิ้น)</p>
            )}
          </div>

          {/* Note */}
          <div>
            <Label htmlFor="transfer-note">
              หมายเหตุ{' '}
              <span className="font-normal text-muted-foreground text-xs">(ไม่บังคับ)</span>
            </Label>
            <Input
              id="transfer-note"
              placeholder="เหตุผลหรือรายละเอียด..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending || sourceBranches.length === 0}
            className="gap-2 min-w-[120px]"
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
