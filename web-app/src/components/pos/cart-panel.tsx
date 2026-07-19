'use client'

import { useMemo, useState } from 'react'
import { Minus, Plus, Trash2, ShoppingCart, AlertCircle, AlertTriangle, ScanBarcode, Tag, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCartStore } from '@/store/cart.store'
import { formatThaiMoney, cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 5

// ── Props ─────────────────────────────────────────────────────────────────────

interface CartPanelProps {
  onCheckout: () => void
  onHold?: () => void
  selectedProductId?: string | null
  onSelectRow?: (productId: string) => void
  showPaymentPanel?: boolean  // false = hide checkout section (used in 3-col desktop layout)
  discountRef?: React.RefObject<HTMLInputElement>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CartPanel({
  onCheckout,
  onHold,
  selectedProductId,
  onSelectRow,
  showPaymentPanel = true,
  discountRef,
}: CartPanelProps) {
  const { items, discount, removeItem, updateQuantity, setDiscount, setItemDiscount, clearCart } = useCartStore()

  const [editingQtyId, setEditingQtyId]   = useState<string | null>(null)
  const [editingQtyVal, setEditingQtyVal] = useState('')

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.product.price) - (i.itemDiscount ?? 0)) * i.quantity, 0),
    [items],
  )
  const total    = Math.max(0, subtotal - discount)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)

  const hasZeroPriceItem = items.some((i) => Number(i.product.price) === 0)
  const canCheckout      = items.length > 0 && !hasZeroPriceItem

  const stockOf = (i: typeof items[0]) => i.product.branchQuantity ?? 0

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-700/60 px-4 py-3 shrink-0">
        <div className="relative">
          <ShoppingCart className="h-5 w-5 text-blue-600" />
          {items.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white leading-none px-0.5">
              {totalQty}
            </span>
          )}
        </div>
        <h3 className="font-semibold text-slate-900 dark:text-white flex-1">ตะกร้าสินค้า</h3>
        {items.length > 0 && onHold && (
          <button
            onClick={onHold}
            className="text-slate-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors min-h-[32px] px-1 flex items-center gap-1 text-xs"
            title="พักบิลนี้ไว้ก่อน"
          >
            <PauseCircle className="h-3.5 w-3.5" />
            พัก
          </button>
        )}
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors text-xs min-h-[32px] px-1"
            title="ล้างตะกร้า (Ctrl+Backspace)"
          >
            ล้าง
          </button>
        )}
      </div>

      {/* ── Items ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {items.length === 0 ? (

          /* ── Empty state ─────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center h-full gap-4 py-10 px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 ring-4 ring-slate-50 dark:ring-slate-900">
              <ShoppingCart className="h-9 w-9 text-slate-300 dark:text-slate-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">ยังไม่มีสินค้า</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">แตะสินค้าด้านซ้ายเพื่อเพิ่ม</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/60">
              <ScanBarcode className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">หรือสแกนบาร์โค้ด</span>
            </div>
          </div>

        ) : (
          items.map((item) => {
            const isSelected  = selectedProductId === item.product.id
            const isZeroPrice = Number(item.product.price) === 0
            const available   = stockOf(item)
            const isLowStock  = available > 0 && available < LOW_STOCK_THRESHOLD
            const effectivePrice = Number(item.product.price) - (item.itemDiscount ?? 0)

            return (
              <div
                key={item.product.id}
                onClick={() => onSelectRow?.(item.product.id)}
                className={cn(
                  'flex gap-2.5 rounded-xl border p-3 transition-colors cursor-default',
                  isZeroPrice
                    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                    : isSelected
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/10 shadow-sm ring-1 ring-blue-300 dark:ring-blue-700'
                      : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <p
                      className="text-sm font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2"
                      title={item.product.name}
                    >
                      {item.product.name || item.product.sku}
                    </p>
                    {isZeroPrice && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400 leading-none">
                        ไม่มีราคา
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                    {item.product.sku}
                  </p>

                  <p className={cn('text-xs mt-0.5', isZeroPrice ? 'text-red-400 dark:text-red-500' : 'text-slate-500 dark:text-slate-400')}>
                    {isZeroPrice ? '฿ — ' : `${formatThaiMoney(effectivePrice)} × `}{item.quantity}
                  </p>

                  {/* Per-item discount input */}
                  {!isZeroPrice && !item.serialIds && (
                    <div className="flex items-center gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <Tag className="h-3 w-3 text-slate-300 dark:text-slate-600 shrink-0" />
                      <input
                        type="number"
                        min={0}
                        max={Number(item.product.price)}
                        value={item.itemDiscount || ''}
                        onChange={(e) => setItemDiscount(item.product.id, Number(e.target.value) || 0)}
                        placeholder="ส่วนลด/ชิ้น"
                        className="w-24 h-6 text-xs text-right px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      {(item.itemDiscount ?? 0) > 0 && (
                        <span className="text-[10px] text-red-500 dark:text-red-400 font-medium whitespace-nowrap">
                          -{formatThaiMoney(item.itemDiscount! * item.quantity)}
                        </span>
                      )}
                    </div>
                  )}

                  {isLowStock && (
                    <span className="inline-flex items-center gap-0.5 mt-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      สต็อกเหลือ {available} ชิ้น
                    </span>
                  )}

                  {/* Serial IDs chips — show pre-selected serials */}
                  {item.serialIds && item.serialIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.serialIds.map((s) => (
                        <span
                          key={s}
                          className="inline-block font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                        >
                          {s.slice(-8)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end justify-between gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.product.id) }}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="ลบ"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  {/* Qty controls — 44px SUNMI targets; serialIds items: qty is locked */}
                  {item.serialIds ? (
                    <div className="flex items-center justify-center h-11 min-w-[88px] rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3">
                      <span className="text-sm font-bold tabular-nums text-blue-700 dark:text-blue-400">
                        {item.quantity} serial
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.product.id, item.quantity - 1) }}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
                        aria-label="ลด"
                      >
                        <Minus className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      </button>

                      {editingQtyId === item.product.id ? (
                        <input
                          type="number"
                          autoFocus
                          value={editingQtyVal}
                          onChange={(e) => setEditingQtyVal(e.target.value)}
                          onBlur={() => {
                            const n = parseInt(editingQtyVal)
                            if (!isNaN(n) && n > 0) updateQuantity(item.product.id, Math.min(n, available))
                            setEditingQtyId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const n = parseInt(editingQtyVal)
                              if (!isNaN(n) && n > 0) updateQuantity(item.product.id, Math.min(n, available))
                              setEditingQtyId(null)
                            }
                            if (e.key === 'Escape') setEditingQtyId(null)
                          }}
                          className="w-11 h-11 text-center text-sm font-bold border border-blue-400 dark:border-blue-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingQtyId(item.product.id)
                            setEditingQtyVal(String(item.quantity))
                          }}
                          className="w-11 h-11 text-center text-sm font-bold tabular-nums text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                          title="แตะเพื่อแก้ไขจำนวน"
                        >
                          {item.quantity}
                        </button>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.product.id, item.quantity + 1) }}
                        disabled={item.quantity >= available}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="เพิ่ม"
                      >
                        <Plus className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      </button>
                    </div>
                  )}

                  <p className={cn('text-sm font-bold tabular-nums', isZeroPrice ? 'text-red-400 dark:text-red-500' : 'text-blue-700 dark:text-blue-400')}>
                    {isZeroPrice ? '฿ —' : formatThaiMoney(effectivePrice * item.quantity)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Checkout panel ─────────────────────────────────────────────── */}
      {showPaymentPanel && <div className="border-t border-slate-100 dark:border-slate-700/60 pt-3 mt-2 px-3 pb-3 space-y-3 shrink-0">

        {/* Zero-price warning */}
        {hasZeroPriceItem && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">มีสินค้าที่ยังไม่ได้กำหนดราคา</p>
          </div>
        )}

        {/* Order summary */}
        {items.length > 0 && (
          <div className="space-y-1 px-0.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{items.length} รายการ ({totalQty} ชิ้น)</span>
              <span className="font-medium text-slate-900 dark:text-white tabular-nums">{formatThaiMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                <span>ส่วนลด</span>
                <span className="tabular-nums">− {formatThaiMoney(discount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Discount input */}
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">ส่วนลด</span>
          <Input
            ref={discountRef}
            type="number"
            min={0}
            max={subtotal}
            value={discount || ''}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-9 text-sm text-right dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">บาท</span>
        </div>

        {/* Total — V3: very prominent */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-900/10 border border-blue-200/80 dark:border-blue-800/60 px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">ยอดสุทธิ</span>
            {items.length > 0 && totalQty > 1 && (
              <span className="text-xs text-blue-500/70 dark:text-blue-500/50 tabular-nums">{totalQty} ชิ้น</span>
            )}
          </div>
          <p className="text-4xl font-black text-blue-700 dark:text-blue-300 tabular-nums leading-tight mt-1">
            {formatThaiMoney(total)}
          </p>
        </div>

        {/* Checkout — dominant CTA */}
        <Button
          className={cn(
            'w-full h-16 text-xl font-black gap-2 border-0 shadow-lg transition-all rounded-2xl',
            canCheckout
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/30 active:scale-[0.98]'
              : '',
          )}
          onClick={onCheckout}
          disabled={!canCheckout}
          title="F8 — ชำระเงิน"
        >
          {canCheckout ? (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-base font-bold opacity-80">ชำระเงิน</span>
              <span className="text-2xl font-black tabular-nums leading-none">{formatThaiMoney(total)}</span>
            </span>
          ) : (
            <>
              <ShoppingCart className="h-5 w-5" />
              ชำระเงิน
            </>
          )}
        </Button>
      </div>}
    </div>
  )
}
