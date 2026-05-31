'use client'

import { useMemo } from 'react'
import { Minus, Plus, Trash2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCartStore } from '@/store/cart.store'
import { formatThaiMoney, cn } from '@/lib/utils'

interface CartPanelProps {
  onCheckout: () => void
  /** Product ID of the keyboard-selected row (for +/- shortcuts). */
  selectedProductId?: string | null
  /** Called when the user clicks a row to change selection. */
  onSelectRow?: (productId: string) => void
}

export function CartPanel({ onCheckout, selectedProductId, onSelectRow }: CartPanelProps) {
  const { items, discount, removeItem, updateQuantity, setDiscount, clearCart } = useCartStore()

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0),
    [items],
  )
  const total = Math.max(0, subtotal - discount)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b mb-3">
        <ShoppingCart className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">ตะกร้าสินค้า</h3>
        {items.length > 0 && (
          <>
            <span className="ml-auto text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-medium">
              {items.reduce((s, i) => s + i.quantity, 0)} ชิ้น
            </span>
            <button
              onClick={clearCart}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
              title="ล้างตะกร้า (Ctrl+Backspace)"
            >
              ล้าง
            </button>
          </>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-10">
            <ShoppingCart className="h-12 w-12 text-gray-200" />
            <p className="text-sm font-medium">ตะกร้าว่างเปล่า</p>
            <p className="text-xs text-center">คลิกสินค้าเพื่อเพิ่ม<br/>หรือสแกนบาร์โค้ด</p>
          </div>
        ) : (
          items.map((item) => {
            const isSelected = selectedProductId === item.product.id
            return (
              <div
                key={item.product.id}
                onClick={() => onSelectRow?.(item.product.id)}
                className={cn(
                  'flex gap-2.5 rounded-xl border p-3 transition-colors cursor-default',
                  isSelected
                    ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-300'
                    : 'bg-white hover:border-blue-200',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatThaiMoney(Number(item.product.price))} × {item.quantity}
                  </p>
                </div>

                <div className="flex flex-col items-end justify-between gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.product.id) }}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    title="ลบ"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  {/* Larger qty controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.product.id, item.quantity - 1) }}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                      aria-label="ลด"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.product.id, item.quantity + 1) }}
                      disabled={item.quantity >= item.product.stock}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="เพิ่ม"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="text-sm font-bold text-blue-700 tabular-nums">
                    {formatThaiMoney(Number(item.product.price) * item.quantity)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Summary */}
      <div className="border-t pt-3 mt-3 space-y-2.5">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>ยอดรวม ({items.length} รายการ)</span>
          <span className="font-medium text-gray-900 tabular-nums">
            {formatThaiMoney(subtotal)}
          </span>
        </div>

        {/* Discount */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">ส่วนลด</span>
          <Input
            type="number"
            min={0}
            max={subtotal}
            value={discount || ''}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-sm text-right"
          />
          <span className="text-sm text-muted-foreground shrink-0">บาท</span>
        </div>

        {/* Total */}
        <div className="flex justify-between items-center rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
          <span className="font-bold text-gray-900">ยอดสุทธิ</span>
          <span className="text-xl font-bold text-blue-700 tabular-nums">
            {formatThaiMoney(total)}
          </span>
        </div>

        {/* Checkout button — h-12, hint for F2 */}
        <Button
          className="w-full h-12 text-base font-semibold gap-2"
          onClick={onCheckout}
          disabled={items.length === 0}
          title="F2"
        >
          <ShoppingCart className="h-5 w-5" />
          ชำระเงิน
        </Button>
      </div>
    </div>
  )
}
