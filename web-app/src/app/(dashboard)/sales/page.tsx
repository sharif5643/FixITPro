'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Clock, Globe, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import { useCartStore } from '@/store/cart.store'
import { ProductSearch, type ProductSearchHandle } from '@/components/pos/product-search'
import { CartPanel } from '@/components/pos/cart-panel'
import { PaymentPanel } from '@/components/pos/payment-panel'
import { CheckoutDialog } from '@/components/pos/checkout-dialog'
import { ReceiptDialog } from '@/components/pos/receipt-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { usePOSShortcuts } from '@/hooks/usePOSShortcuts'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'
import type { Sale, PaymentMethod } from '@/types'

export default function SalesPage() {
  const [checkoutOpen,      setCheckoutOpen]      = useState(false)
  const [receipt,           setReceipt]           = useState<Sale | null>(null)
  const [mobileTab,         setMobileTab]         = useState<'products' | 'cart'>('products')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedCategory,  setSelectedCategory]  = useState('ALL')
  // Pre-selected payment method/amount from PaymentPanel (desktop 3-col)
  const [preSelectedPayment, setPreSelectedPayment] = useState<{
    paymentMethod: PaymentMethod
    amountPaid: number
  } | null>(null)
  // Responsive: true when viewport >= lg (1024px)
  const [isLgLayout, setIsLgLayout] = useState(false)

  const searchRef = useRef<ProductSearchHandle>(null)

  const items          = useCartStore((s) => s.items)
  const discount       = useCartStore((s) => s.discount)
  const clearCart      = useCartStore((s) => s.clearCart)
  const updateQuantity = useCartStore((s) => s.updateQuantity)

  const { branchId: effectiveBranch, isGlobalMode, isSunmi } = useBranchContext()

  const { data: currentShift, isLoading: shiftLoading } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  // Track lg breakpoint for 3-col layout
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsLgLayout(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsLgLayout(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.product.price) * i.quantity, 0),
    [items],
  )
  const total            = Math.max(0, subtotal - discount)
  const hasZeroPriceItem = useMemo(() => items.some((i) => Number(i.product.price) === 0), [items])

  // Auto-select last added item for +/- shortcuts
  useEffect(() => {
    if (items.length > 0) setSelectedProductId(items[items.length - 1].product.id)
    else setSelectedProductId(null)
  }, [items.length])

  // ── Shortcut handlers ─────────────────────────────────────────────────────

  const handleOpenCheckout = useCallback(() => {
    if (items.length === 0 || hasZeroPriceItem) return
    setPreSelectedPayment(null)
    setCheckoutOpen(true)
  }, [items.length, hasZeroPriceItem])

  const handlePaymentPanelCheckout = useCallback((opts: { paymentMethod: PaymentMethod; amountPaid: number }) => {
    setPreSelectedPayment(opts)
    setCheckoutOpen(true)
  }, [])

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
    if (!item || item.serialIds) return
    updateQuantity(item.product.id, item.quantity + 1)
  }, [selectedProductId, items, updateQuantity])

  const handleDecreaseQty = useCallback(() => {
    if (!selectedProductId) return
    const item = items.find((i) => i.product.id === selectedProductId)
    if (!item || item.serialIds) return
    updateQuantity(item.product.id, item.quantity - 1)
  }, [selectedProductId, items, updateQuantity])

  const hasModule = useAuthStore((s) => s.hasModule)

  usePOSShortcuts({
    onCheckout:    handleOpenCheckout,
    onFocusSearch: handleFocusSearch,
    onClearCart:   handleClearCart,
    onEscape:      handleEscape,
    onIncreaseQty: handleIncreaseQty,
    onDecreaseQty: handleDecreaseQty,
    enabled: !shiftLoading && !isGlobalMode,
  })

  // ── Checkout success ───────────────────────────────────────────────────────

  const handleSuccess = useCallback((sale: Sale) => {
    setCheckoutOpen(false)
    setPreSelectedPayment(null)
    clearCart()
    setReceipt(sale)
  }, [clearCart])

  const handleReceiptClose = useCallback(() => {
    setReceipt(null)
    searchRef.current?.focusSearch()
  }, [])

  // ── Guard screens ─────────────────────────────────────────────────────────

  if (!hasModule('pos')) return <ModuleGate module="pos">{null}</ModuleGate>

  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)] gap-3 text-slate-500">
        <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-sm">กำลังโหลด...</span>
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">กรุณาเลือกสาขาก่อนขายสินค้า</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ไม่สามารถขายสินค้าในโหมดทุกสาขา</p>
        </div>
      </div>
    )
  }

  if (!currentShift) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-5 text-center px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 border-2 border-emerald-200 shadow-sm">
          <Clock className="h-10 w-10 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">ต้องเปิดกะก่อนจะขายสินค้าได้</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto">
            เปิดกะและกรอกเงินสดเริ่มต้นในลิ้นชักก่อน จึงจะสามารถรับชำระเงินได้
          </p>
        </div>
        <Link href="/shifts">
          <Button size="lg" className="gap-2 h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            <Clock className="h-5 w-5" />
            เปิดกะเดี๋ยวนี้
          </Button>
        </Link>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          หรือ <Link href="/dashboard" className="underline hover:text-slate-600">กลับหน้าแรก</Link>
        </p>
      </div>
    )
  }

  const showHints    = !isSunmi && !Platform.isNative()
  const totalQtyCart = items.reduce((s, i) => s + i.quantity, 0)

  // ── Layout ────────────────────────────────────────────────────────────────
  //
  // Mobile / tablet (< lg): tab bar + 2 panels (products | cart+payment)
  // Desktop (lg+):          3-column — Left: Search | Middle: Cart | Right: Payment
  //
  // ProductSearch is rendered ONCE in both layouts (inside a shared wrapper)
  // to avoid double data fetching and double autoFocus.

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]">

      {/* ── Mobile tab bar (hidden on lg) ───────────────────────────────── */}
      <div className="flex lg:hidden mb-3 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 overflow-hidden shrink-0 shadow-sm">
        <button
          type="button"
          onClick={() => setMobileTab('products')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors',
            mobileTab === 'products'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
          )}
        >
          <span>🛍</span>
          สินค้า
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors',
            mobileTab === 'cart'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
          )}
        >
          <span>🛒</span>
          ตะกร้า + ชำระ
          {totalQtyCart > 0 && (
            <span className={cn(
              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
              mobileTab === 'cart' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white',
            )}>
              {totalQtyCart}
            </span>
          )}
        </button>
      </div>

      {/* ── Panel grid ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-3 sm:gap-4 min-h-0">

        {/* Left — Product Search
            Mobile:  shown on products tab / hidden on cart tab
            Tablet (md): always shown, flex-1
            Desktop (lg): fixed 380px width */}
        <div className={cn(
          'flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden',
          mobileTab === 'products' ? 'flex flex-1 min-w-0' : 'hidden',
          'lg:flex lg:w-[380px] lg:shrink-0 lg:flex-none',
        )}>
          <ProductSearch
            ref={searchRef}
            category={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        {/* Middle — Cart Items
            Mobile:  shown on cart tab / hidden on products tab
            Tablet:  shown, w-[340px]
            Desktop: flex-1 (fills remaining space between Search and Payment) */}
        <div className={cn(
          'flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden',
          mobileTab === 'cart' ? 'flex flex-1 min-w-0' : 'hidden',
          'lg:flex lg:flex-1 lg:min-w-0',
        )}>
          <CartPanel
            onCheckout={() => { setPreSelectedPayment(null); setCheckoutOpen(true) }}
            selectedProductId={selectedProductId}
            onSelectRow={setSelectedProductId}
            showPaymentPanel={!isLgLayout}
          />
        </div>

        {/* Right — Payment Summary (desktop only) */}
        <div className="hidden lg:flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden w-72 shrink-0">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              สรุปและชำระเงิน
            </p>
          </div>
          <PaymentPanel onCheckout={handlePaymentPanelCheckout} />
        </div>
      </div>

      {/* Desktop shortcut hints (hidden on SUNMI/native) */}
      {showHints && (
        <div className="hidden lg:flex items-center gap-4 pt-2 pb-0.5 px-1 shrink-0">
          <Keyboard className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          {[
            { key: 'F2',     label: 'ชำระเงิน' },
            { key: 'F4',     label: 'ค้นหา' },
            { key: 'ESC',    label: 'ยกเลิก' },
            { key: 'Ctrl+⌫', label: 'ล้างตะกร้า' },
            { key: '+/−',    label: 'ปรับจำนวน' },
          ].map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 select-none">
              <kbd className="inline-flex items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      )}

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={(v) => { if (!v) setPreSelectedPayment(null); setCheckoutOpen(v) }}
        cartItems={items}
        subtotal={subtotal}
        discount={discount}
        total={total}
        shiftId={currentShift?.id}
        branchId={effectiveBranch}
        onSuccess={handleSuccess}
        initialPaymentMethod={preSelectedPayment?.paymentMethod}
        initialAmountPaid={preSelectedPayment?.amountPaid}
      />

      <ReceiptDialog
        open={!!receipt}
        sale={receipt}
        onClose={handleReceiptClose}
      />
    </div>
  )
}
