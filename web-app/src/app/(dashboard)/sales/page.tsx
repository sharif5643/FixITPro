'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Lock, Clock, Loader2, Globe, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import { useCartStore } from '@/store/cart.store'
import { ProductSearch, type ProductSearchHandle } from '@/components/pos/product-search'
import { CartPanel } from '@/components/pos/cart-panel'
import { CheckoutDialog } from '@/components/pos/checkout-dialog'
import { ReceiptDialog } from '@/components/pos/receipt-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { usePOSShortcuts } from '@/hooks/usePOSShortcuts'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'
import type { Sale } from '@/types'

export default function SalesPage() {
  const [checkoutOpen, setCheckoutOpen]     = useState(false)
  const [receipt, setReceipt]               = useState<Sale | null>(null)
  const [mobileTab, setMobileTab]           = useState<'products' | 'cart'>('products')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  const searchRef = useRef<ProductSearchHandle>(null)

  const items          = useCartStore((s) => s.items)
  const discount       = useCartStore((s) => s.discount)
  const clearCart      = useCartStore((s) => s.clearCart)
  const updateQuantity = useCartStore((s) => s.updateQuantity)

  const { isGlobalMode, isSunmi } = useBranchContext()

  const { data: currentShift, isLoading: shiftLoading } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0),
    [items],
  )
  const total = Math.max(0, subtotal - discount)

  // Auto-select last added item for +/- shortcuts
  useEffect(() => {
    if (items.length > 0) setSelectedProductId(items[items.length - 1].product.id)
    else setSelectedProductId(null)
  }, [items.length])

  // ── Shortcut handlers ───────────────────────────────────────────────────────

  const handleOpenCheckout = useCallback(() => {
    if (items.length === 0) return
    setCheckoutOpen(true)
  }, [items.length])

  const handleFocusSearch = useCallback(() => {
    searchRef.current?.focusSearch()
  }, [])

  const handleEscape = useCallback(() => {
    if (checkoutOpen) { setCheckoutOpen(false); return }
    if (receipt)      { setReceipt(null);        return }
    searchRef.current?.clearAndFocus()
  }, [checkoutOpen, receipt])

  const handleClearCart = useCallback(() => {
    if (items.length === 0) return
    clearCart()
    toast.success('ล้างตะกร้าแล้ว', { duration: 1500 })
    searchRef.current?.focusSearch()
  }, [items.length, clearCart])

  const handleIncreaseQty = useCallback(() => {
    if (!selectedProductId) return
    const item = items.find((i) => i.product.id === selectedProductId)
    if (!item) return
    updateQuantity(item.product.id, item.quantity + 1)
  }, [selectedProductId, items, updateQuantity])

  const handleDecreaseQty = useCallback(() => {
    if (!selectedProductId) return
    const item = items.find((i) => i.product.id === selectedProductId)
    if (!item) return
    updateQuantity(item.product.id, item.quantity - 1)
  }, [selectedProductId, items, updateQuantity])

  usePOSShortcuts({
    onCheckout:    handleOpenCheckout,
    onFocusSearch: handleFocusSearch,
    onClearCart:   handleClearCart,
    onEscape:      handleEscape,
    onIncreaseQty: handleIncreaseQty,
    onDecreaseQty: handleDecreaseQty,
    enabled: !shiftLoading && !isGlobalMode,
  })

  // ── Checkout success ────────────────────────────────────────────────────────

  const handleSuccess = useCallback((sale: Sale) => {
    setCheckoutOpen(false)
    clearCart()
    setReceipt(sale)
    // Refocus search after receipt is shown and closed, handled in ReceiptDialog onClose
  }, [clearCart])

  const handleReceiptClose = useCallback(() => {
    setReceipt(null)
    searchRef.current?.focusSearch()
  }, [])

  // ── Loading / guard screens ─────────────────────────────────────────────────

  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }

  if (isGlobalMode) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 border-2 border-blue-200">
          <Globe className="h-8 w-8 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">กรุณาเลือกสาขาก่อนขายสินค้า</h2>
          <p className="text-sm text-muted-foreground mt-1">ไม่สามารถขายสินค้าในโหมดทุกสาขา</p>
        </div>
      </div>
    )
  }

  if (!currentShift) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border-2 border-amber-200">
          <Lock className="h-8 w-8 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">ยังไม่ได้เปิดกะ</h2>
          <p className="text-sm text-muted-foreground mt-1">กรุณาเปิดกะก่อนทำรายการขาย</p>
        </div>
        <Link href="/shifts">
          <Button className="gap-2">
            <Clock className="h-4 w-4" />
            ไปเปิดกะ
          </Button>
        </Link>
      </div>
    )
  }

  const showHints = !isSunmi && !Platform.isNative()

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]">
      {/* Mobile tab bar */}
      <div className="flex md:hidden mb-3 rounded-lg border bg-white overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('products')}
          className={cn(
            'flex-1 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'products' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50',
          )}
        >
          สินค้า
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={cn(
            'flex-1 py-2.5 text-sm font-medium transition-colors relative',
            mobileTab === 'cart' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50',
          )}
        >
          ตะกร้า
          {items.length > 0 && (
            <span className={cn(
              'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
              mobileTab === 'cart' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white',
            )}>
              {items.length}
            </span>
          )}
        </button>
      </div>

      {/* Main panels */}
      <div className="flex flex-1 gap-4 sm:gap-5 min-h-0">
        {/* Product search panel */}
        <div className={cn(
          'flex flex-col bg-white rounded-xl border p-4 sm:p-5 overflow-hidden',
          'md:flex-1 md:min-w-0',
          mobileTab === 'products' ? 'flex flex-1 min-w-0' : 'hidden md:flex md:flex-1 md:min-w-0',
        )}>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">เลือกสินค้า</h2>
          <ProductSearch ref={searchRef} />
        </div>

        {/* Cart panel */}
        <div className={cn(
          'flex flex-col bg-white rounded-xl border p-4 sm:p-5 overflow-hidden',
          'md:w-80 md:shrink-0',
          mobileTab === 'cart' ? 'flex flex-1 min-w-0' : 'hidden md:flex',
        )}>
          <CartPanel
            onCheckout={() => setCheckoutOpen(true)}
            selectedProductId={selectedProductId}
            onSelectRow={setSelectedProductId}
          />
        </div>
      </div>

      {/* Desktop shortcut hints (hidden on SUNMI/native) */}
      {showHints && (
        <div className="hidden md:flex items-center gap-4 pt-2 pb-0.5 px-1 shrink-0">
          <Keyboard className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          {[
            { key: 'F2',  label: 'ชำระเงิน' },
            { key: 'F4',  label: 'ค้นหา' },
            { key: 'ESC', label: 'ยกเลิก' },
            { key: 'Ctrl+⌫', label: 'ล้างตะกร้า' },
            { key: '+/−', label: 'ปรับจำนวน' },
          ].map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1 text-xs text-gray-400 select-none">
              <kbd className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      )}

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cartItems={items}
        subtotal={subtotal}
        discount={discount}
        total={total}
        shiftId={currentShift?.id}
        onSuccess={handleSuccess}
      />

      <ReceiptDialog
        open={!!receipt}
        sale={receipt}
        onClose={handleReceiptClose}
      />
    </div>
  )
}
