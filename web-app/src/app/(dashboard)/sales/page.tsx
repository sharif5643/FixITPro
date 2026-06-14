'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Lock, Clock, Loader2, Globe, Keyboard,
  LayoutGrid, Smartphone, Wifi, Headphones, Wrench, Star,
} from 'lucide-react'
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
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'
import type { Sale } from '@/types'

const CATEGORIES = [
  { value: 'ALL',       label: 'ทั้งหมด',    Icon: LayoutGrid,  emoji: '📦' },
  { value: 'PHONE',     label: 'มือถือ',     Icon: Smartphone,  emoji: '📱' },
  { value: 'SIM',       label: 'ซิม',        Icon: Wifi,        emoji: '📶' },
  { value: 'ACCESSORY', label: 'อุปกรณ์',    Icon: Headphones,  emoji: '🎧' },
  { value: 'PART',      label: 'อะไหล่',     Icon: Wrench,      emoji: '🔧' },
  { value: 'FAVORITES', label: 'รายการโปรด', Icon: Star,        emoji: '⭐' },
]

export default function SalesPage() {
  const [checkoutOpen, setCheckoutOpen]     = useState(false)
  const [receipt, setReceipt]               = useState<Sale | null>(null)
  const [mobileTab, setMobileTab]           = useState<'products' | 'cart'>('products')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory]   = useState('ALL')

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
  const total            = Math.max(0, subtotal - discount)
  const hasZeroPriceItem = useMemo(() => items.some((i) => Number(i.product.price) === 0), [items])

  // Auto-select last added item for +/- shortcuts
  useEffect(() => {
    if (items.length > 0) setSelectedProductId(items[items.length - 1].product.id)
    else setSelectedProductId(null)
  }, [items.length])

  // ── Shortcut handlers ───────────────────────────────────────────────────────

  const handleOpenCheckout = useCallback(() => {
    if (items.length === 0 || hasZeroPriceItem) return
    setCheckoutOpen(true)
  }, [items.length, hasZeroPriceItem])

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
          <h2 className="text-xl font-bold text-slate-900">กรุณาเลือกสาขาก่อนขายสินค้า</h2>
          <p className="text-sm text-slate-500 mt-1">ไม่สามารถขายสินค้าในโหมดทุกสาขา</p>
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
          <h2 className="text-xl font-bold text-slate-900">ยังไม่ได้เปิดกะ</h2>
          <p className="text-sm text-slate-500 mt-1">กรุณาเปิดกะก่อนทำรายการขาย</p>
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
      <div className="flex md:hidden mb-3 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 overflow-hidden shrink-0 shadow-sm">
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
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors relative',
            mobileTab === 'cart'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
          )}
        >
          <span>🛒</span>
          ตะกร้า
          {items.length > 0 && (
            <span className={cn(
              'ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
              mobileTab === 'cart' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white',
            )}>
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Main panels */}
      <div className="flex flex-1 gap-4 sm:gap-5 min-h-0">

        {/* Categories sidebar — desktop lg+ only */}
        <div className="hidden lg:flex flex-col w-48 shrink-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-3 pt-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
              หมวดหมู่
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {CATEGORIES.map(({ value, label, emoji }) => {
              const isActive = selectedCategory === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedCategory(value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px]',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white',
                  )}
                >
                  <span className="text-base leading-none shrink-0">{emoji}</span>
                  <span className="flex-1 text-left">{label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Product search panel */}
        <div className={cn(
          'flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden',
          'md:flex-1 md:min-w-0',
          mobileTab === 'products' ? 'flex flex-1 min-w-0' : 'hidden md:flex md:flex-1 md:min-w-0',
        )}>
          {/* Mobile category chips — scrollable strip */}
          <div className="flex md:hidden gap-1.5 px-2.5 py-2 overflow-x-auto scrollbar-none border-b border-slate-100 shrink-0">
            {CATEGORIES.map(({ value, label, emoji }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedCategory(value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all shrink-0',
                  selectedCategory === value
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600',
                )}
              >
                <span>{emoji}</span>
                {label}
              </button>
            ))}
          </div>

          <ProductSearch
            ref={searchRef}
            category={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        {/* Cart panel */}
        <div className={cn(
          'flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden',
          'md:w-[34%] md:min-w-[300px] md:max-w-[420px] md:shrink-0',
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
