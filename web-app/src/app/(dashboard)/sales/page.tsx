'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Clock, Globe, Keyboard, PauseCircle, Play } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useCartStore } from '@/store/cart.store'
import { ProductSearch, type ProductSearchHandle } from '@/components/pos/product-search'
import { CartPanel } from '@/components/pos/cart-panel'
import { PaymentPanel, type PaymentPanelHandle } from '@/components/pos/payment-panel'
import { CheckoutDialog } from '@/components/pos/checkout-dialog'
import { ReceiptDialog } from '@/components/pos/receipt-dialog'
import { CustomerSearchDialog } from '@/components/pos/customer-search-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { usePOSShortcuts } from '@/hooks/usePOSShortcuts'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'
import type { Sale, PaymentMethod } from '@/types'
import type { CartItem } from '@/store/cart.store'

// ── Held Bills ────────────────────────────────────────────────────────────────

const HELD_BILLS_KEY = 'fixitpro-held-bills'

interface HeldBill {
  id: string
  heldAt: string
  items: CartItem[]
  discount: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [checkoutOpen,      setCheckoutOpen]      = useState(false)
  const [receipt,           setReceipt]           = useState<Sale | null>(null)
  const [mobileTab,         setMobileTab]         = useState<'products' | 'cart'>('products')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedCategory,  setSelectedCategory]  = useState('ALL')
  const [preSelectedPayment, setPreSelectedPayment] = useState<{
    paymentMethod: PaymentMethod
    amountPaid: number
  } | null>(null)
  const [isLgLayout, setIsLgLayout] = useState(false)

  // Customer search
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [selectedCustomer,   setSelectedCustomer]   = useState<{ name: string; phone?: string } | null>(null)

  // Hold bills
  const [heldBills,     setHeldBills]     = useState<HeldBill[]>([])
  const [heldBillsOpen, setHeldBillsOpen] = useState(false)

  // Refs
  const searchRef       = useRef<ProductSearchHandle>(null)
  const paymentPanelRef = useRef<PaymentPanelHandle>(null)
  const cartDiscountRef = useRef<HTMLInputElement>(null)

  const items          = useCartStore((s) => s.items)
  const discount       = useCartStore((s) => s.discount)
  const clearCart      = useCartStore((s) => s.clearCart)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const addItem        = useCartStore((s) => s.addItem)
  const setDiscount    = useCartStore((s) => s.setDiscount)

  const { branchId: effectiveBranch, isGlobalMode, isSunmi } = useBranchContext()

  const { data: currentShift, isLoading: shiftLoading } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsLgLayout(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsLgLayout(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    try { setHeldBills(JSON.parse(localStorage.getItem(HELD_BILLS_KEY) ?? '[]')) } catch {}
  }, [])

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.product.price) - (i.itemDiscount ?? 0)) * i.quantity, 0),
    [items],
  )
  const total            = Math.max(0, subtotal - discount)
  const hasZeroPriceItem = useMemo(() => items.some((i) => Number(i.product.price) === 0), [items])

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

  const handleFocusCustomerSearch = useCallback(() => {
    setCustomerSearchOpen(true)
  }, [])

  const handleFocusDiscount = useCallback(() => {
    if (isLgLayout) {
      paymentPanelRef.current?.focusDiscount()
    } else {
      setMobileTab('cart')
      requestAnimationFrame(() => cartDiscountRef.current?.focus())
    }
  }, [isLgLayout])

  const handleSelectQR = useCallback(() => {
    if (isLgLayout) {
      paymentPanelRef.current?.selectMethod('TRANSFER')
    } else {
      setPreSelectedPayment({ paymentMethod: 'TRANSFER', amountPaid: total })
      if (items.length > 0 && !hasZeroPriceItem) setCheckoutOpen(true)
    }
  }, [isLgLayout, total, items.length, hasZeroPriceItem])

  const handleSelectCash = useCallback(() => {
    if (isLgLayout) {
      paymentPanelRef.current?.focusCashInput()
    } else {
      setPreSelectedPayment({ paymentMethod: 'CASH', amountPaid: 0 })
      if (items.length > 0 && !hasZeroPriceItem) setCheckoutOpen(true)
    }
  }, [isLgLayout, items.length, hasZeroPriceItem])

  const handleSelectTransfer = useCallback(() => {
    if (isLgLayout) {
      paymentPanelRef.current?.selectMethod('TRANSFER')
    } else {
      setPreSelectedPayment({ paymentMethod: 'TRANSFER', amountPaid: total })
      if (items.length > 0 && !hasZeroPriceItem) setCheckoutOpen(true)
    }
  }, [isLgLayout, total, items.length, hasZeroPriceItem])

  const handleEscape = useCallback(() => {
    if (checkoutOpen) { setCheckoutOpen(false); return }
    if (receipt)      { setReceipt(null);        return }
    if (customerSearchOpen) { setCustomerSearchOpen(false); return }
    searchRef.current?.clearAndFocus()
  }, [checkoutOpen, receipt, customerSearchOpen])

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

  // ── Hold Bill handlers ────────────────────────────────────────────────────

  const handleHold = useCallback(() => {
    if (items.length === 0) return
    const bill: HeldBill = {
      id:       Date.now().toString(),
      heldAt:   new Date().toISOString(),
      items:    [...items],
      discount,
    }
    const updated = [...heldBills, bill]
    setHeldBills(updated)
    localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(updated))
    clearCart()
    toast.success('พักบิลแล้ว', { duration: 1500 })
    searchRef.current?.focusSearch()
  }, [items, discount, heldBills, clearCart])

  const handleResume = useCallback((bill: HeldBill) => {
    if (items.length > 0) {
      const currentBill: HeldBill = {
        id:     Date.now().toString(),
        heldAt: new Date().toISOString(),
        items:  [...items],
        discount,
      }
      const withCurrent = [...heldBills.filter((b) => b.id !== bill.id), currentBill]
      setHeldBills(withCurrent)
      localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(withCurrent))
    } else {
      const remaining = heldBills.filter((b) => b.id !== bill.id)
      setHeldBills(remaining)
      localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(remaining))
    }
    clearCart()
    setDiscount(bill.discount)
    bill.items.forEach((i) => addItem(i.product, i.serialIds))
    setHeldBillsOpen(false)
    toast.success('กลับมาแล้ว', { duration: 1000 })
  }, [items, discount, heldBills, clearCart, setDiscount, addItem])

  const handleDeleteHeld = useCallback((id: string) => {
    const updated = heldBills.filter((b) => b.id !== id)
    setHeldBills(updated)
    localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(updated))
  }, [heldBills])

  const hasModule = useAuthStore((s) => s.hasModule)

  usePOSShortcuts({
    onFocusSearch:         handleFocusSearch,
    onFocusCustomerSearch: handleFocusCustomerSearch,
    onFocusDiscount:       handleFocusDiscount,
    onSelectQR:            handleSelectQR,
    onSelectCash:          handleSelectCash,
    onSelectTransfer:      handleSelectTransfer,
    onCheckout:            handleOpenCheckout,
    onClearCart:           handleClearCart,
    onEscape:              handleEscape,
    onIncreaseQty:         handleIncreaseQty,
    onDecreaseQty:         handleDecreaseQty,
    enabled: !shiftLoading && !isGlobalMode,
  })

  // ── Checkout success ───────────────────────────────────────────────────────

  const handleSuccess = useCallback((sale: Sale) => {
    setCheckoutOpen(false)
    setPreSelectedPayment(null)
    setSelectedCustomer(null)
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
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-6 text-center px-4">
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_8px_24px_rgba(16,185,129,0.35)]">
            <Clock className="h-12 w-12 text-white" />
          </div>
        </div>
        <div className="max-w-xs">
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">ต้องเปิดกะก่อน</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            กรอกเงินสดเริ่มต้นในลิ้นชักก่อน จึงจะสามารถรับชำระเงินได้
          </p>
        </div>
        <Link href="/shifts">
          <Button size="lg" className="gap-2 h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-[0_4px_14px_rgba(16,185,129,0.35)]">
            <Clock className="h-5 w-5" />
            เปิดกะเดี๋ยวนี้
          </Button>
        </Link>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          หรือ <Link href="/dashboard" className="text-blue-600 hover:underline dark:text-blue-400">กลับหน้าแรก</Link>
        </p>
      </div>
    )
  }

  const showHints    = !isSunmi && !Platform.isNative()
  const totalQtyCart = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]">

      {/* ── Mobile tab bar (hidden on lg) ───────────────────────────────── */}
      <div className="flex lg:hidden mb-3 rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] overflow-hidden shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => setMobileTab('products')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors',
            mobileTab === 'products'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/40',
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
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/40',
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
        {heldBills.length > 0 && (
          <button
            type="button"
            onClick={() => setHeldBillsOpen(true)}
            className="relative flex items-center justify-center px-3 py-3 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            <PauseCircle className="h-5 w-5" />
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white px-0.5">
              {heldBills.length}
            </span>
          </button>
        )}
      </div>

      {/* ── Panel grid ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-3 sm:gap-4 min-h-0">

        {/* Left — Product Search */}
        <div className={cn(
          'flex flex-col bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)]',
          mobileTab === 'products' ? 'flex flex-1 min-w-0' : 'hidden',
          'lg:flex lg:w-[380px] lg:shrink-0 lg:flex-none',
        )}>
          <ProductSearch
            ref={searchRef}
            category={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        {/* Middle — Cart Items */}
        <div className={cn(
          'flex flex-col bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)]',
          mobileTab === 'cart' ? 'flex flex-1 min-w-0' : 'hidden',
          'lg:flex lg:flex-1 lg:min-w-0',
        )}>
          <CartPanel
            onCheckout={() => { setPreSelectedPayment(null); setCheckoutOpen(true) }}
            onHold={handleHold}
            selectedProductId={selectedProductId}
            onSelectRow={setSelectedProductId}
            showPaymentPanel={!isLgLayout}
            discountRef={cartDiscountRef}
          />
        </div>

        {/* Right — Payment Summary (desktop only) */}
        <div className="hidden lg:flex flex-col bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] w-72 shrink-0">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-700/60 shrink-0 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              สรุปและชำระเงิน
            </p>
            {heldBills.length > 0 && (
              <button
                type="button"
                onClick={() => setHeldBillsOpen(true)}
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                พักบิล ({heldBills.length})
              </button>
            )}
          </div>
          <PaymentPanel ref={paymentPanelRef} onCheckout={handlePaymentPanelCheckout} />
        </div>
      </div>

      {/* Desktop shortcut hints */}
      {showHints && (
        <div className="hidden lg:flex items-center gap-4 pt-2 pb-0.5 px-1 shrink-0">
          <Keyboard className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          {[
            { key: 'F2', label: 'ค้นหา' },
            { key: 'F3', label: 'ลูกค้า' },
            { key: 'F4', label: 'ส่วนลด' },
            { key: 'F5', label: 'QR' },
            { key: 'F6', label: 'เงินสด' },
            { key: 'F7', label: 'โอน' },
            { key: 'F8', label: 'คิดเงิน' },
            { key: 'ESC', label: 'ยกเลิก' },
          ].map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 select-none">
              <kbd className="inline-flex items-center rounded border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* ── Held Bills Sheet ──────────────────────────────────────────────── */}
      {heldBillsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setHeldBillsOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white dark:bg-[#1E293B] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[70vh] overflow-hidden flex flex-col shadow-2xl dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b dark:border-slate-700/60 shrink-0">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-amber-500" />
                บิลที่พักไว้ ({heldBills.length})
              </h3>
              <button
                onClick={() => setHeldBillsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm px-2 py-1"
              >
                ปิด
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {heldBills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {(() => {
                        try { return format(new Date(bill.heldAt), 'HH:mm น.', { locale: th }) } catch { return '' }
                      })()}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {bill.items.length} รายการ
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {bill.items.map((i) => i.product.name).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResume(bill)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                    >
                      <Play className="h-3 w-3" />
                      เรียกคืน
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHeld(bill.id)}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60 text-slate-400 hover:text-red-500 dark:hover:text-red-400 text-xs transition-colors"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
        initialCustomerName={selectedCustomer?.name}
        initialCustomerPhone={selectedCustomer?.phone}
      />

      <ReceiptDialog
        open={!!receipt}
        sale={receipt}
        onClose={handleReceiptClose}
      />

      <CustomerSearchDialog
        open={customerSearchOpen}
        onSelect={(c) => {
          setSelectedCustomer(c)
          toast.success(`เลือกลูกค้า: ${c.name}`, { duration: 1500 })
        }}
        onClose={() => setCustomerSearchOpen(false)}
      />
    </div>
  )
}
