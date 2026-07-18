'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Banknote, CreditCard, Smartphone, ShieldCheck, CheckCircle2, Circle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatThaiMoney, cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Sale, SerialNumber } from '@/types'
import type { CartItem } from '@/store/cart.store'

const checkoutSchema = z.object({
  customerName:  z.string().optional(),
  customerPhone: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD']),
  amountPaid:    z.coerce.number().min(0, 'กรุณากรอกจำนวนเงิน'),
  note:          z.string().optional(),
})

type CheckoutFormData = z.infer<typeof checkoutSchema>

const PAYMENT_OPTIONS = [
  { value: 'CASH',     label: 'เงินสด',     icon: Banknote   },
  { value: 'TRANSFER', label: 'โอนเงิน',    icon: Smartphone },
  { value: 'CARD',     label: 'บัตรเครดิต', icon: CreditCard },
]

interface CheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cartItems: CartItem[]
  subtotal: number
  discount: number
  total: number
  shiftId?: string | null
  /** The branch selected in the POS UI. OWNER's JWT has branchId=null so the
   *  frontend must forward the selected branch explicitly. */
  branchId?: string | null
  onSuccess: (sale: Sale) => void
  initialPaymentMethod?: 'CASH' | 'TRANSFER' | 'CARD'
  initialAmountPaid?: number
  initialCustomerName?: string
  initialCustomerPhone?: string
}

// ─── Serial Selection Step ────────────────────────────────────────────────────

function SerialSelectionStep({
  serialItems,
  assignments,
  onChange,
  onNext,
}: {
  serialItems: CartItem[]
  assignments: Record<string, string[]>
  onChange: (productId: string, ids: string[]) => void
  onNext: () => void
}) {
  const allAssigned = serialItems.every(
    (item) => (assignments[item.product.id]?.length ?? 0) === item.quantity,
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 border border-blue-100 dark:border-blue-800">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        เลือก Serial / IMEI สำหรับสินค้าที่ติดตาม Serial
      </div>

      {serialItems.map((item) => (
        <SerialPicker
          key={item.product.id}
          item={item}
          selected={assignments[item.product.id] ?? []}
          onSelect={(ids) => onChange(item.product.id, ids)}
        />
      ))}

      <Button className="w-full" disabled={!allAssigned} onClick={onNext}>
        ถัดไป → ชำระเงิน
      </Button>
    </div>
  )
}

function SerialPicker({
  item,
  selected,
  onSelect,
}: {
  item: CartItem
  selected: string[]
  onSelect: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ items: SerialNumber[] }>({
    queryKey: ['serials', 'available', item.product.id],
    queryFn: async () =>
      (await api.get('/serials', { params: { productId: item.product.id, status: 'IN_STOCK', limit: 100 } }))
        .data,
    staleTime: 0,
  })

  const serials  = data?.items ?? []
  const filtered = search
    ? serials.filter((s) => s.serial.toLowerCase().includes(search.toLowerCase()))
    : serials

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onSelect(selected.filter((x) => x !== id))
    } else if (selected.length < item.quantity) {
      onSelect([...selected, id])
    }
  }

  const needed = item.quantity - selected.length

  return (
    <div className="rounded-xl border dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">{item.product.name}</p>
          <p className="text-xs text-muted-foreground">{item.product.sku}</p>
        </div>
        <Badge
          variant={selected.length === item.quantity ? 'default' : 'outline'}
          className="shrink-0 dark:border-slate-700"
        >
          {selected.length}/{item.quantity} serial
        </Badge>
      </div>

      {needed > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">เลือกอีก {needed} serial</p>
      )}

      <Input
        placeholder="ค้นหา IMEI / Serial..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : serials.length === 0 ? (
        <p className="text-sm text-center text-red-500 dark:text-red-400 py-2">
          ไม่มี Serial ที่พร้อมขาย — กรุณาเพิ่มก่อนขาย
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {filtered.map((s) => {
            const isSelected = selected.includes(s.id)
            const disabled   = !isSelected && selected.length >= item.quantity
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(s.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all',
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : disabled
                      ? 'bg-gray-50 dark:bg-slate-800 text-gray-300 dark:text-slate-600 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                )}
              >
                {isSelected
                  ? <CheckCircle2 className="h-3 w-3" />
                  : <Circle className="h-3 w-3" />}
                {s.serial}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function CheckoutDialog({
  open,
  onOpenChange,
  cartItems,
  subtotal,
  discount,
  total,
  shiftId,
  branchId,
  onSuccess,
  initialPaymentMethod,
  initialAmountPaid,
  initialCustomerName,
  initialCustomerPhone,
}: CheckoutDialogProps) {
  const queryClient = useQueryClient()

  const serialItems    = cartItems.filter((i) => i.product.hasSerial)
  const hasSerialItems = serialItems.length > 0

  // step: 'serials' → 'payment'
  const [step, setStep]                   = useState<'serials' | 'payment'>('payment')
  const [serialAssignments, setSerialAssignments] = useState<Record<string, string[]>>({})

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: 'CASH', amountPaid: 0 },
  })

  const paymentMethod = watch('paymentMethod')
  const amountPaid    = Number(watch('amountPaid')) || 0
  const change        = amountPaid - total

  useEffect(() => {
    if (open) {
      // Pre-populate from cart's pre-selected serialIds
      const preAssigned: Record<string, string[]> = {}
      serialItems.forEach((item) => {
        if (item.serialIds?.length) preAssigned[item.product.id] = item.serialIds
      })
      setSerialAssignments(preAssigned)

      const allPreAssigned = serialItems.every(
        (item) => (preAssigned[item.product.id]?.length ?? 0) >= item.quantity,
      )
      setStep(hasSerialItems && !allPreAssigned ? 'serials' : 'payment')
      reset({
        paymentMethod: initialPaymentMethod ?? 'CASH',
        amountPaid:    initialAmountPaid    ?? total,
        customerName:  initialCustomerName  ?? '',
        customerPhone: initialCustomerPhone ?? '',
        note:          '',
      })
    }
  }, [open, total, reset, hasSerialItems, initialPaymentMethod, initialAmountPaid, initialCustomerName, initialCustomerPhone])

  useEffect(() => {
    if (paymentMethod !== 'CASH') setValue('amountPaid', total)
  }, [paymentMethod, total, setValue])

  const createSaleMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      if (data.paymentMethod === 'CASH' && data.amountPaid < total) {
        throw new Error('จำนวนเงินที่รับน้อยกว่ายอดสุทธิ')
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[CHECKOUT] branchId sent in body:', branchId ?? 'undefined (no-branch path)')
      }
      const res = await api.post<Sale>('/sales', {
        customerName:  data.customerName?.trim() || undefined,
        customerPhone: data.customerPhone?.trim() || undefined,
        paymentMethod: data.paymentMethod,
        amountPaid:    data.amountPaid,
        discount,
        note:          data.note?.trim() || undefined,
        shiftId:       shiftId ?? undefined,
        // Forward the POS selected branch so OWNER checkout validates the correct
        // BranchStock row. STAFF branchId is overridden by JWT on the backend.
        branchId:      branchId ?? undefined,
        items: cartItems.map((i) => ({
          productId: i.product.id,
          quantity:  i.quantity,
          price:     Number(i.product.price) - (i.itemDiscount ?? 0),
          serialIds: i.product.hasSerial ? (serialAssignments[i.product.id] ?? []) : undefined,
        })),
      })
      return res.data
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      queryClient.invalidateQueries({ queryKey: ['serials'] })
      onSuccess(sale)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const isCash    = paymentMethod === 'CASH'
  const canSubmit = !createSaleMutation.isPending && (!isCash || change >= 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'serials' ? 'เลือก Serial / IMEI' : 'ยืนยันการชำระเงิน'}
          </DialogTitle>
        </DialogHeader>

        {step === 'serials' ? (
          <SerialSelectionStep
            serialItems={serialItems}
            assignments={serialAssignments}
            onChange={(pid, ids) => setSerialAssignments((prev) => ({ ...prev, [pid]: ids }))}
            onNext={() => setStep('payment')}
          />
        ) : (
          <form
            onSubmit={handleSubmit((data) => createSaleMutation.mutateAsync(data))}
            className="space-y-4 pt-1"
          >
            {/* Order Summary */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>สินค้า {cartItems.length} รายการ ({cartItems.reduce((s, i) => s + i.quantity, 0)} ชิ้น)</span>
                <span className="tabular-nums">{formatThaiMoney(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>ส่วนลด</span>
                  <span className="tabular-nums">- {formatThaiMoney(discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t dark:border-slate-700 pt-2 mt-1">
                <span>ยอดสุทธิ</span>
                <span className="text-blue-700 dark:text-blue-400 tabular-nums">{formatThaiMoney(total)}</span>
              </div>
            </div>

            {/* Payment Method — large tap buttons */}
            <div className="space-y-1.5">
              <Label>ช่องทางชำระเงิน <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValue('paymentMethod', opt.value as CheckoutFormData['paymentMethod'])}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 min-h-[68px] transition-all',
                      paymentMethod === opt.value
                        ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-500',
                    )}
                  >
                    <opt.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Paid */}
            <div className="space-y-1.5">
              <Label>
                {isCash ? 'รับเงินมา (บาท)' : 'ยอดชำระ (บาท)'}
                <span className="text-red-500"> *</span>
              </Label>
              <Input
                type="number" min={0} step={1}
                readOnly={!isCash}
                autoFocus={isCash}
                className={cn('h-12 text-base text-right', !isCash ? 'bg-slate-50 dark:bg-slate-800/50 text-muted-foreground' : '')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit && !createSaleMutation.isPending) {
                    e.preventDefault()
                    handleSubmit((data) => createSaleMutation.mutateAsync(data))()
                  }
                }}
                {...register('amountPaid')}
              />
              {errors.amountPaid && (
                <p className="text-xs text-red-500">{errors.amountPaid.message}</p>
              )}
            </div>

            {/* Change */}
            {isCash && (
              <div className={cn(
                'flex justify-between items-center rounded-xl px-4 py-3.5 border',
                change < 0
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                  : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
              )}>
                <span className={cn('font-semibold', change < 0 ? 'text-red-700 dark:text-red-400' : 'text-green-800 dark:text-green-300')}>
                  เงินทอน
                </span>
                <span className={cn('text-2xl font-bold tabular-nums', change < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-300')}>
                  {change < 0 ? `ขาดอีก ${formatThaiMoney(Math.abs(change))}` : formatThaiMoney(change)}
                </span>
              </div>
            )}

            {/* Customer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ชื่อลูกค้า</Label>
                <Input placeholder="ไม่ระบุ" {...register('customerName')} />
              </div>
              <div className="space-y-1.5">
                <Label>เบอร์โทร</Label>
                <Input placeholder="0XX-XXX-XXXX" {...register('customerPhone')} />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input placeholder="บันทึกเพิ่มเติม..." {...register('note')} />
            </div>

            <DialogFooter className="pt-1">
              {hasSerialItems && (
                <Button type="button" variant="outline" onClick={() => setStep('serials')} disabled={createSaleMutation.isPending}>
                  ← ย้อนกลับ
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createSaleMutation.isPending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={!canSubmit} className="min-w-[140px] h-12 text-base font-bold">
                {createSaleMutation.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังบันทึก...</>
                  : 'ยืนยันชำระเงิน'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
