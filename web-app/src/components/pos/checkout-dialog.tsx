'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Banknote, CreditCard, Smartphone, ShieldCheck, CheckCircle2, Circle, SplitSquareHorizontal } from 'lucide-react'
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
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import { formatThaiMoney, cn, apiErrorMessage } from '@/lib/utils'
import api from '@/lib/api'
import type { Sale, SerialNumber, PaymentMethod, ShopSettings } from '@/types'
import type { CartItem } from '@/store/cart.store'

const checkoutSchema = z.object({
  customerName:  z.string().optional(),
  customerPhone: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD']),
  amountPaid:    z.coerce.number().min(0, 'กรุณากรอกจำนวนเงิน').default(0),
  note:          z.string().optional(),
})

type CheckoutFormData = z.infer<typeof checkoutSchema>

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
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
    <div className="rounded-xl border dark:border-slate-700/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">{item.product.name}</p>
          <p className="text-xs text-muted-foreground">{item.product.sku}</p>
        </div>
        <Badge
          variant={selected.length === item.quantity ? 'default' : 'outline'}
          className="shrink-0 dark:border-slate-700/60"
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
                      ? 'bg-slate-50 dark:bg-slate-800/60 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-700/60 cursor-not-allowed'
                      : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
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

// ─── Payment Method Picker (mini) ─────────────────────────────────────────────

function MethodPicker({
  value,
  onChange,
  exclude,
}: {
  value: PaymentMethod
  onChange: (m: PaymentMethod) => void
  exclude?: PaymentMethod
}) {
  return (
    <div className="flex gap-1.5">
      {PAYMENT_OPTIONS.filter((o) => o.value !== exclude).map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 min-w-[56px] transition-all text-xs font-medium',
            value === opt.value
              ? 'border-blue-500 bg-blue-600 text-white'
              : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-400 hover:border-blue-300',
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {opt.label}
        </button>
      ))}
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

  // ── Shop settings (for PromptPay QR) ────────────────────────────────────
  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 5 * 60_000,
  })

  // ── Split payment state ───────────────────────────────────────────────────
  const [splitMode, setSplitMode]     = useState(false)
  const [leg1Method, setLeg1Method]   = useState<PaymentMethod>('CASH')
  const [leg1Input, setLeg1Input]     = useState('')
  const [leg2Method, setLeg2Method]   = useState<PaymentMethod>('TRANSFER')

  const leg1Amount  = Number(leg1Input) || 0
  const leg2Amount  = Math.max(0, total - leg1Amount)
  const splitChange = leg1Amount > total ? leg1Amount - total : 0
  // ─────────────────────────────────────────────────────────────────────────

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

      // Reset single-mode form
      reset({
        paymentMethod: initialPaymentMethod ?? 'CASH',
        amountPaid:    initialAmountPaid    ?? total,
        customerName:  initialCustomerName  ?? '',
        customerPhone: initialCustomerPhone ?? '',
        note:          '',
      })

      // Reset split-mode state
      setSplitMode(false)
      setLeg1Method(initialPaymentMethod ?? 'CASH')
      setLeg1Input('')
      setLeg2Method(initialPaymentMethod === 'TRANSFER' ? 'CASH' : 'TRANSFER')
    }
  }, [open, total, reset, hasSerialItems, initialPaymentMethod, initialAmountPaid, initialCustomerName, initialCustomerPhone])

  useEffect(() => {
    if (!splitMode && paymentMethod !== 'CASH') setValue('amountPaid', total)
  }, [paymentMethod, total, setValue, splitMode])

  // When leg1 method changes, auto-pick a different leg2 method
  useEffect(() => {
    if (leg2Method === leg1Method) {
      const others = (['CASH', 'TRANSFER', 'CARD'] as PaymentMethod[]).filter((m) => m !== leg1Method)
      setLeg2Method(others[0])
    }
  }, [leg1Method, leg2Method])

  const createSaleMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      const baseBody = {
        customerName:  data.customerName?.trim() || undefined,
        customerPhone: data.customerPhone?.trim() || undefined,
        discount,
        note:          data.note?.trim() || undefined,
        shiftId:       shiftId ?? undefined,
        branchId:      branchId ?? undefined,
        items: cartItems.map((i) => ({
          productId: i.product.id,
          quantity:  i.quantity,
          price:     Number(i.product.price) - (i.itemDiscount ?? 0),
          serialIds: i.product.hasSerial ? (serialAssignments[i.product.id] ?? []) : undefined,
        })),
      }

      if (splitMode) {
        if (leg1Amount <= 0) throw new Error('กรุณากรอกยอดชำระวิธีแรก')

        const payments = [
          { paymentMethod: leg1Method, amount: leg1Amount },
          ...(leg2Amount > 0 ? [{ paymentMethod: leg2Method, amount: leg2Amount }] : []),
        ]
        const res = await api.post<Sale>('/sales', { ...baseBody, payments })
        return res.data
      } else {
        if (data.paymentMethod === 'CASH' && data.amountPaid < total) {
          throw new Error('จำนวนเงินที่รับน้อยกว่ายอดสุทธิ')
        }
        if (process.env.NODE_ENV === 'development') {
          console.log('[CHECKOUT] branchId sent in body:', branchId ?? 'undefined (no-branch path)')
        }
        const res = await api.post<Sale>('/sales', {
          ...baseBody,
          paymentMethod: data.paymentMethod,
          amountPaid:    data.amountPaid,
        })
        return res.data
      }
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
      toast.error(apiErrorMessage(err))
    },
  })

  const isCash    = !splitMode && paymentMethod === 'CASH'
  const canSubmit = !createSaleMutation.isPending && (
    splitMode ? leg1Amount > 0 : (!isCash || change >= 0)
  )

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
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 space-y-2 text-sm">
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
              <div className="flex justify-between font-bold text-base border-t dark:border-slate-700/60 pt-2 mt-1">
                <span>ยอดสุทธิ</span>
                <span className="text-blue-700 dark:text-blue-400 tabular-nums">{formatThaiMoney(total)}</span>
              </div>
            </div>

            {/* Split / Single mode toggle */}
            <div className="flex items-center justify-between">
              <Label>ช่องทางชำระเงิน <span className="text-red-500">*</span></Label>
              <button
                type="button"
                onClick={() => setSplitMode(!splitMode)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all',
                  splitMode
                    ? 'border-purple-500 bg-purple-600 text-white'
                    : 'border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-slate-300',
                )}
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                แยกชำระ
              </button>
            </div>

            {splitMode ? (
              /* ── Split payment UI ─────────────────────────────────────── */
              <div className="space-y-3">
                {/* Leg 1 */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">วิธีที่ 1</p>
                  <div className="flex gap-2 items-center">
                    <MethodPicker value={leg1Method} onChange={setLeg1Method} exclude={leg2Method} />
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">฿</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={leg1Input}
                        onChange={(e) => setLeg1Input(e.target.value)}
                        placeholder="0"
                        autoFocus
                        className="pl-7 h-10 text-sm text-right tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* Leg 2 (auto-fill remainder) */}
                <div className={cn(
                  'rounded-xl border p-3 space-y-2',
                  leg2Amount > 0
                    ? 'border-slate-200 dark:border-slate-700/60'
                    : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10',
                )}>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">วิธีที่ 2</p>
                  <div className="flex gap-2 items-center">
                    <MethodPicker value={leg2Method} onChange={setLeg2Method} exclude={leg1Method} />
                    <div className="flex-1 text-right">
                      {leg2Amount > 0 ? (
                        <span className="text-base font-bold tabular-nums text-slate-700 dark:text-slate-200">
                          {formatThaiMoney(leg2Amount)}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                          ชำระครบแล้ว
                        </span>
                      )}
                    </div>
                  </div>
                  {/* QR for transfer leg 2 */}
                  {leg2Method === 'TRANSFER' && leg2Amount > 0 && settings?.promptpayId && (
                    <div className="flex flex-col items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <div className="bg-white p-2 rounded-lg shadow-sm">
                        <QRCodeSVG value={generatePayload(settings.promptpayId, { amount: leg2Amount })} size={140} level="M" />
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400">สแกนโอน {formatThaiMoney(leg2Amount)}</p>
                    </div>
                  )}
                </div>

                {/* QR for transfer leg 1 */}
                {leg1Method === 'TRANSFER' && leg1Amount > 0 && settings?.promptpayId && (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">สแกนโอนวิธีที่ 1</p>
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <QRCodeSVG value={generatePayload(settings.promptpayId, { amount: leg1Amount })} size={140} level="M" />
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">สแกนโอน {formatThaiMoney(leg1Amount)}</p>
                  </div>
                )}

                {/* Change (if leg1 overpays) */}
                {splitChange > 0 && (
                  <div className="flex justify-between items-center rounded-xl px-4 py-3 border bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                    <span className="font-semibold text-green-800 dark:text-green-300">เงินทอน ({leg1Method === 'CASH' ? 'เงินสด' : leg1Method === 'TRANSFER' ? 'โอนเงิน' : 'บัตร'})</span>
                    <span className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">
                      {formatThaiMoney(splitChange)}
                    </span>
                  </div>
                )}

                {/* Summary */}
                <div className="text-xs text-center text-slate-400 dark:text-slate-500">
                  รวม {formatThaiMoney(leg1Amount + leg2Amount)} / ยอดสุทธิ {formatThaiMoney(total)}
                </div>
              </div>
            ) : (
              /* ── Single payment UI ────────────────────────────────────── */
              <>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue('paymentMethod', opt.value)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 min-h-[68px] transition-all',
                        paymentMethod === opt.value
                          ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-500',
                      )}
                    >
                      <opt.icon className="h-5 w-5" />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  ))}
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

                {/* PromptPay QR — shown when TRANSFER selected and promptpayId configured */}
                {paymentMethod === 'TRANSFER' && settings?.promptpayId && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">สแกน QR ชำระเงิน</p>
                    <div className="bg-white p-3 rounded-xl shadow-sm">
                      <QRCodeSVG
                        value={generatePayload(settings.promptpayId, { amount: total })}
                        size={180}
                        level="M"
                      />
                    </div>
                    <p className="text-sm font-bold tabular-nums text-blue-800 dark:text-blue-200">
                      {formatThaiMoney(total)}
                    </p>
                    <p className="text-xs text-blue-500 dark:text-blue-400 text-center">
                      ลูกค้าสแกนแล้วยอดขึ้นอัตโนมัติ — กด &quot;ยืนยันชำระเงิน&quot; หลังลูกค้าโอนเสร็จ
                    </p>
                  </div>
                )}

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
              </>
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
