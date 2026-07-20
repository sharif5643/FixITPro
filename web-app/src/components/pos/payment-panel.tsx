'use client'

import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Smartphone, CreditCard, QrCode, ShoppingCart, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatThaiMoney, cn } from '@/lib/utils'
import { useCartStore } from '@/store/cart.store'
import api from '@/lib/api'
import type { ShopSettings, PaymentMethod } from '@/types'

interface PaymentPanelProps {
  onCheckout: (opts: { paymentMethod: PaymentMethod; amountPaid: number }) => void
}

export interface PaymentPanelHandle {
  /** Switch the active payment method (F5/F6/F7 shortcuts) */
  selectMethod: (method: PaymentMethod) => void
  /** Switch to CASH and focus the cash-received input (F6) */
  focusCashInput: () => void
  /** Focus the order-level discount input (F4) */
  focusDiscount: () => void
}

const METHODS: { value: PaymentMethod; label: string; Icon: React.ElementType }[] = [
  { value: 'CASH',     label: 'เงินสด',  Icon: Banknote  },
  { value: 'TRANSFER', label: 'QR/โอน',  Icon: Smartphone },
  { value: 'CARD',     label: 'บัตร',    Icon: CreditCard },
]

const QUICK_AMOUNTS = [100, 500, 1000, 2000]

export const PaymentPanel = forwardRef<PaymentPanelHandle, PaymentPanelProps>(
  ({ onCheckout }, ref) => {
    const { items, discount, setDiscount } = useCartStore()

    const [method,    setMethod]    = useState<PaymentMethod>('CASH')
    const [cashInput, setCashInput] = useState('')

    const cashInputRef    = useRef<HTMLInputElement>(null)
    const discountInputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      selectMethod: (m) => {
        setMethod(m)
        if (m === 'CASH') requestAnimationFrame(() => cashInputRef.current?.focus())
      },
      focusCashInput: () => {
        setMethod('CASH')
        requestAnimationFrame(() => cashInputRef.current?.focus())
      },
      focusDiscount: () => {
        requestAnimationFrame(() => discountInputRef.current?.focus())
      },
    }), [])

    const { data: settings } = useQuery<ShopSettings>({
      queryKey: ['settings'],
      queryFn: async () => (await api.get('/settings')).data,
      staleTime: 60_000,
    })

    const subtotal = useMemo(
      () => items.reduce((s, i) => s + (Number(i.product.price) - (i.itemDiscount ?? 0)) * i.quantity, 0),
      [items],
    )
    const total    = Math.max(0, subtotal - discount)
    const totalQty = items.reduce((s, i) => s + i.quantity, 0)

    const amountPaid     = method === 'CASH' ? (Number(cashInput) || 0) : total
    const change         = amountPaid - total
    const hasZeroPrice   = items.some((i) => Number(i.product.price) === 0)
    const canCheckout    = items.length > 0 && !hasZeroPrice && (method !== 'CASH' || change >= 0)
    const cashInputFloat = Number(cashInput)

    // Reset cash input when switching method or when total changes
    useEffect(() => { setCashInput('') }, [method, total])

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
          <ShoppingCart className="h-12 w-12 text-slate-200 dark:text-slate-700" />
          <p className="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีสินค้าในตะกร้า</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">แตะสินค้าจากรายการด้านซ้ายเพื่อเพิ่ม</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex-1 space-y-4 px-4 py-4">

          {/* Order summary */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-3.5 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{items.length} รายการ ({totalQty} ชิ้น)</span>
              <span className="tabular-nums">{formatThaiMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>ส่วนลด</span>
                <span className="tabular-nums">- {formatThaiMoney(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-lg border-t dark:border-slate-700/60 pt-2">
              <span className="text-slate-700 dark:text-slate-200">ยอดสุทธิ</span>
              <span className="text-blue-700 dark:text-blue-400 tabular-nums">{formatThaiMoney(total)}</span>
            </div>
          </div>

          {/* Discount input */}
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">ส่วนลด</span>
            <Input
              ref={discountInputRef}
              type="number"
              min={0}
              max={subtotal}
              value={discount || ''}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              placeholder="0"
              className="h-9 text-sm text-right dark:bg-[#1E293B] dark:border-slate-700/60"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">บาท</span>
          </div>

          {/* Payment method selector */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              ช่องทางชำระเงิน
            </p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMethod(value)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 min-h-[66px] transition-all',
                    method === value
                      ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                      : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-600',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* QR code display for TRANSFER */}
          {method === 'TRANSFER' && settings?.paymentQrUrl && (
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-blue-100 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-900/10 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                <QrCode className="h-3.5 w-3.5" />
                สแกน QR เพื่อชำระเงิน
              </div>
              <img
                src={settings.paymentQrUrl}
                alt="QR ชำระเงิน"
                className="w-44 h-44 object-contain rounded-xl border border-blue-200/60"
              />
              <p className="text-sm font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                {formatThaiMoney(total)}
              </p>
            </div>
          )}

          {/* Cash received + change */}
          {method === 'CASH' && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                รับเงินมา (บาท)
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">฿</span>
                <Input
                  ref={cashInputRef}
                  type="number"
                  min={0}
                  step={1}
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canCheckout) handleCheckout() }}
                  placeholder={String(total)}
                  className="h-12 pl-8 text-lg font-bold text-right tabular-nums"
                />
              </div>

              {/* Quick-fill amount buttons */}
              <div className="grid grid-cols-5 gap-1.5">
                {QUICK_AMOUNTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCashInput(String(v))}
                    className="py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors tabular-nums"
                  >
                    {v >= 1000 ? `${v / 1000}K` : v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCashInput(String(total))}
                  className="py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                >
                  พอดี
                </button>
              </div>

              {/* Change display */}
              {cashInput && (
                <div className={cn(
                  'flex items-center justify-between rounded-xl px-4 py-3 border',
                  change < 0
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                    : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800',
                )}>
                  <span className={cn(
                    'text-sm font-semibold',
                    change < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400',
                  )}>
                    เงินทอน
                  </span>
                  <span className={cn(
                    'text-xl font-black tabular-nums',
                    change < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                  )}>
                    {change < 0
                      ? `ขาดอีก ${formatThaiMoney(Math.abs(change))}`
                      : formatThaiMoney(change)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Checkout button — pinned to bottom */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <Button
            size="lg"
            className={cn(
              'w-full h-14 text-base font-black gap-2 rounded-2xl border-0',
              canCheckout
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/20 active:scale-[0.98]'
                : '',
            )}
            onClick={handleCheckout}
            disabled={!canCheckout}
          >
            {canCheckout ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="text-sm opacity-80">ยืนยันชำระเงิน</span>
                <span className="text-xl tabular-nums">{formatThaiMoney(total)}</span>
              </span>
            ) : (
              hasZeroPrice ? 'มีสินค้าไม่มีราคา' : 'ชำระเงิน'
            )}
          </Button>
        </div>
      </div>
    )

    function handleCheckout() {
      if (!canCheckout) return
      onCheckout({ paymentMethod: method, amountPaid: method === 'CASH' ? cashInputFloat : total })
    }
  }
)

PaymentPanel.displayName = 'PaymentPanel'
