'use client'

import {
  useState, useMemo, useRef, useCallback,
  forwardRef, useImperativeHandle, useEffect,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, X, Package, Loader2, ScanBarcode,
  ArrowRightLeft, Star, Clock, Smartphone, Wifi, Headphones, Wrench, LayoutGrid,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useCartStore } from '@/store/cart.store'
import { useNativeScanner } from '@/hooks/useNativeScanner'
import { Platform } from '@/lib/platform'
import { beepSuccess, beepError, haptic } from '@/lib/beep'
import { formatThaiMoney, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { CrossBranchAvailabilityDialog } from '@/components/products/cross-branch-availability-dialog'
import api from '@/lib/api'
import type { Product } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 5
const FAVS_KEY            = 'pos_favorites'
const RECENT_KEY          = 'pos_recent_searches'
const SCANNER_MS          = 120

const TYPE_LABEL: Record<string, string> = {
  PHONE:     'มือถือ',
  SIM:       'ซิม',
  ACCESSORY: 'อุปกรณ์',
  PART:      'อะไหล่',
}

const TYPE_COLOR: Record<string, string> = {
  PHONE:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SIM:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ACCESSORY: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  PART:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

const TYPE_BG: Record<string, string> = {
  PHONE:     'bg-blue-50 dark:bg-blue-900/20',
  SIM:       'bg-green-50 dark:bg-green-900/20',
  ACCESSORY: 'bg-purple-50 dark:bg-purple-900/20',
  PART:      'bg-orange-50 dark:bg-orange-900/20',
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'มือถือ',  emoji: '📱', category: 'PHONE',     href: undefined },
  { label: 'ซิม',     emoji: '📶', category: 'SIM',       href: undefined },
  { label: 'เติมเงิน', emoji: '💰', category: 'SIM',      href: undefined },
  { label: 'งานซ่อม', emoji: '🔧', category: undefined,   href: '/repairs' },
  { label: 'อุปกรณ์', emoji: '🎧', category: 'ACCESSORY', href: undefined },
  { label: 'ขายด่วน', emoji: '⭐', category: 'FAVORITES', href: undefined },
] as const

// ── Handle ────────────────────────────────────────────────────────────────────

export interface ProductSearchHandle {
  focusSearch: () => void
  clearAndFocus: () => void
}

// ── ProductCard V3 ────────────────────────────────────────────────────────────

function ProductCard({
  product,
  cartQty,
  stockOf,
  isFavorite,
  onToggleFavorite,
  onClick,
}: {
  product: Product
  cartQty: number
  stockOf: (p: Product) => number
  isFavorite: boolean
  onToggleFavorite: (e: React.MouseEvent, id: string) => void
  onClick: (p: Product) => void
}) {
  const qty         = stockOf(product)
  const isOut       = qty === 0
  const isZeroPrice = Number(product.price) === 0
  const isLowStock  = qty > 0 && qty < LOW_STOCK_THRESHOLD
  const hasOther    = (product.otherBranchTotal ?? 0) > 0
  const canRequest  = isOut && hasOther
  const isBlocked   = isZeroPrice || (isOut && !canRequest)
  const typeColor   = TYPE_COLOR[product.type] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  const typeBg      = TYPE_BG[product.type] ?? 'bg-slate-50 dark:bg-slate-800/50'

  return (
    <div
      role="button"
      tabIndex={isBlocked ? -1 : 0}
      onClick={() => !isBlocked && onClick(product)}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isBlocked) onClick(product) }}
      className={cn(
        'relative text-left rounded-xl border transition-all duration-150 flex flex-col overflow-hidden select-none',
        isBlocked ? 'cursor-not-allowed' : 'cursor-pointer',
        isZeroPrice
          ? 'opacity-60 border-red-200 dark:border-red-800/50'
          : isOut && !canRequest
            ? 'opacity-50 border-slate-200 dark:border-slate-700'
            : canRequest
              ? 'border-orange-300 dark:border-orange-700/60'
              : cartQty > 0
                ? 'border-blue-400 dark:border-blue-600/60 shadow-md ring-1 ring-blue-300/60'
                : isLowStock
                  ? 'border-amber-200 dark:border-amber-700/40'
                  : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600/50 hover:shadow-md active:scale-[0.98]',
      )}
    >
      {/* ── Image / color tile ───────────────────────────────────────────── */}
      <div className={cn(
        'relative h-20 flex items-center justify-center overflow-hidden shrink-0',
        product.imageUrl ? 'bg-slate-100 dark:bg-slate-800' : typeBg,
      )}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className={cn('h-full w-full object-cover', isBlocked && 'opacity-50')}
            draggable={false}
          />
        ) : (
          <span className="text-4xl font-black text-slate-300 dark:text-slate-600 select-none leading-none">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}

        {/* Out-of-stock overlay */}
        {isOut && (
          <div className="absolute inset-0 bg-slate-900/30 dark:bg-slate-900/50 flex items-center justify-center">
            {canRequest ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-white bg-orange-500 px-2.5 py-1 rounded-full shadow-sm">
                <ArrowRightLeft className="h-3 w-3" />
                ขอโอน
              </span>
            ) : (
              <span className="text-[11px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-full shadow-sm">
                หมดสต็อก
              </span>
            )}
          </div>
        )}

        {/* Zero-price overlay */}
        {isZeroPrice && (
          <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-900/40 flex items-center justify-center">
            <span className="text-[11px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-full shadow-sm">
              ไม่มีราคา
            </span>
          </div>
        )}

        {/* Cart qty badge */}
        {cartQty > 0 && !isZeroPrice && (
          <span className="absolute top-1.5 right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white leading-none px-1.5 shadow-sm">
            {cartQty}
          </span>
        )}

        {/* Favorite star */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(e, product.id) }}
          className={cn(
            'absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full transition-colors z-10',
            isFavorite
              ? 'bg-amber-500/20 text-amber-500'
              : 'bg-white/80 dark:bg-slate-900/80 text-slate-400 dark:text-slate-500 hover:text-amber-400',
          )}
          tabIndex={-1}
          aria-label={isFavorite ? 'ยกเลิกรายการโปรด' : 'เพิ่มรายการโปรด'}
        >
          <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-amber-500')} />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-2.5 gap-1.5 min-h-0">
        <p className="font-semibold text-sm leading-tight line-clamp-2 text-slate-900 dark:text-white">
          {product.name}
        </p>

        <div className="flex items-center justify-between mt-auto gap-1">
          <span className={cn(
            'text-base font-bold leading-none tabular-nums',
            isZeroPrice ? 'text-red-500' : 'text-blue-700 dark:text-blue-400',
          )}>
            {isZeroPrice ? '฿ —' : formatThaiMoney(Number(product.price))}
          </span>

          {!isOut && (
            <span className={cn(
              'text-[11px] font-medium px-1.5 py-0.5 rounded-md leading-none shrink-0',
              isLowStock
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
            )}>
              {isLowStock ? `⚠ ${qty}` : qty}
            </span>
          )}
        </div>

        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none w-fit ${typeColor}`}>
          {TYPE_LABEL[product.type] ?? product.type}
        </span>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductSearchProps {
  category?: string
  onCategoryChange?: (cat: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ProductSearch = forwardRef<ProductSearchHandle, ProductSearchProps>(
  ({ category = 'ALL', onCategoryChange }, ref) => {
    const [search, setSearch]                 = useState('')
    const [transferProduct, setTransferProduct] = useState<Product | null>(null)
    const [favorites, setFavorites]           = useState<string[]>([])
    const [recentSearches, setRecentSearches] = useState<string[]>([])

    const inputRef   = useRef<HTMLInputElement>(null)
    const burstStart = useRef<number | null>(null)

    const addItem   = useCartStore((s) => s.addItem)
    const cartItems = useCartStore((s) => s.items)
    const isNative  = Platform.isNative()

    const user             = useAuthStore((s) => s.user)
    const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
    const isOwner          = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
    const effectiveBranch  = isOwner ? (selectedBranchId ?? undefined) : (user?.branchId ?? undefined)

    const { branchName } = useBranchContext()

    useEffect(() => {
      try { setFavorites(JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]')) } catch {}
    }, [])
    useEffect(() => {
      try { setRecentSearches(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')) } catch {}
    }, [])

    useImperativeHandle(ref, () => ({
      focusSearch: () => { requestAnimationFrame(() => inputRef.current?.focus()) },
      clearAndFocus: () => { setSearch(''); requestAnimationFrame(() => inputRef.current?.focus()) },
    }))

    // ── Products query ──────────────────────────────────────────────────────

    const { data: products = [], isLoading } = useQuery<Product[]>({
      queryKey: ['products', effectiveBranch ?? 'all'],
      queryFn: async () => {
        const params = new URLSearchParams()
        if (effectiveBranch) params.set('branchId', effectiveBranch)
        return (await api.get(`/products?${params}`)).data
      },
      staleTime: 30_000,
    })

    // BranchStock is the single source of truth for branch inventory.
    // Fallback to 0 (not product.stock) — product.stock is a shadow sum that
    // can lag or include other branches, causing false "in-stock" reads.
    const stockOf = useCallback((p: Product) => p.branchQuantity ?? 0, [])

    // ── Native barcode scanner ──────────────────────────────────────────────

    useNativeScanner(useCallback((barcode: string) => {
      const active = products.filter((p) => p.isActive)
      const match  = active.find(
        (p) => p.barcode === barcode || p.sku.toUpperCase() === barcode.toUpperCase(),
      )
      if (!match) {
        toast.error('ไม่พบสินค้าในสาขานี้', { duration: 2000 })
        beepError(); haptic(60)
        setSearch(barcode)
        requestAnimationFrame(() => inputRef.current?.focus())
        return
      }
      if (Number(match.price) === 0) {
        toast.error(`${match.name} — ยังไม่ได้กำหนดราคา`, { duration: 2500 })
        beepError(); haptic(60)
        return
      }
      if (stockOf(match) === 0) {
        const msg = match.hasStockRecord === false ? 'ยังไม่มีสต็อกในสาขานี้' : 'สินค้าในสาขานี้หมด'
        toast.error(`${match.name} — ${msg}`, { duration: 2000 })
        beepError(); haptic(80)
        return
      }
      addItem(match)
      toast.success(`เพิ่มสินค้าแล้ว — ${match.name}`, { duration: 1200 })
      beepSuccess(); haptic(40)
    }, [products, stockOf, addItem]))

    // ── Category + filtered lists ───────────────────────────────────────────

    const categoryFiltered = useMemo(() => {
      const active = products.filter((p) => p.isActive)
      if (!category || category === 'ALL') return active
      if (category === 'FAVORITES') return active.filter((p) => favorites.includes(p.id))
      return active.filter((p) => p.type === category)
    }, [products, category, favorites])

    const filtered = useMemo(() => {
      if (!search.trim()) return categoryFiltered
      const q = search.toLowerCase()
      return categoryFiltered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode?.toLowerCase().includes(q) ?? false),
      )
    }, [categoryFiltered, search])

    const favoriteProducts = useMemo(
      () => products.filter((p) => p.isActive && favorites.includes(p.id)),
      [products, favorites],
    )

    // ── Helpers ─────────────────────────────────────────────────────────────

    function toggleFavorite(e: React.MouseEvent, productId: string) {
      e.stopPropagation()
      const updated = favorites.includes(productId)
        ? favorites.filter((id) => id !== productId)
        : [...favorites, productId]
      setFavorites(updated)
      localStorage.setItem(FAVS_KEY, JSON.stringify(updated))
    }

    const tryAddFromSearch = useCallback((value: string, isScannerBurst: boolean) => {
      const q      = value.trim()
      const active = products.filter((p) => p.isActive)

      const exact  = active.find(
        (p) => p.barcode === q || p.sku.toUpperCase() === q.toUpperCase(),
      )
      const target = exact ?? (filtered.length === 1 && !isScannerBurst ? filtered[0] : null)

      if (!target) {
        if (isScannerBurst) { toast.error('ไม่พบสินค้าในสาขานี้', { duration: 2000 }); beepError(); haptic(60) }
        return
      }
      if (Number(target.price) === 0) {
        toast.error(`${target.name} — ยังไม่ได้กำหนดราคา กรุณากำหนดราคาก่อนขาย`, { duration: 2500 })
        beepError(); haptic(60)
        return
      }
      const qty = stockOf(target)
      if (qty === 0) {
        toast.error(
          `${target.name} — ${target.hasStockRecord === false ? 'ยังไม่มีสต็อกในสาขานี้' : 'สินค้าในสาขานี้หมด'}`,
          { duration: 2000 },
        )
        beepError(); haptic(80)
        return
      }
      const currentInCart = cartItems.find((i) => i.product.id === target.id)?.quantity ?? 0
      if (currentInCart >= qty) {
        toast.error(`${target.name} — สต็อกไม่พอ คงเหลือ ${qty} ชิ้น`, { duration: 2000 })
        beepError(); haptic(60)
        return
      }
      addItem(target)
      toast.success(`เพิ่มสินค้าแล้ว — ${target.name}`, { duration: 1200 })
      beepSuccess(); haptic(40)

      if (q.length >= 2) {
        const updatedRecent = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5)
        setRecentSearches(updatedRecent)
        localStorage.setItem(RECENT_KEY, JSON.stringify(updatedRecent))
      }
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }, [products, filtered, stockOf, addItem, recentSearches])

    function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
      const val = e.target.value
      if (!search && val) burstStart.current = Date.now()
      if (!val) burstStart.current = null
      setSearch(val)
    }

    function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Escape') { e.preventDefault(); setSearch(''); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!search.trim()) return
        const elapsed      = burstStart.current ? Date.now() - burstStart.current : Infinity
        const isScanBurst  = elapsed < SCANNER_MS && search.length >= 3
        burstStart.current = null
        tryAddFromSearch(search, isScanBurst)
      }
    }

    function handleCardClick(product: Product) {
      if (Number(product.price) === 0) {
        toast.error(`${product.name} — ยังไม่ได้กำหนดราคา`, { duration: 2500 })
        beepError()
        return
      }
      const qty      = stockOf(product)
      const hasOther = (product.otherBranchTotal ?? 0) > 0
      if (qty === 0) {
        if (hasOther) { setTransferProduct(product); return }
        return
      }
      // Check if adding one more would exceed the branch stock
      const currentInCart = getCartQty(product.id)
      if (currentInCart >= qty) {
        toast.error(`${product.name} — สต็อกไม่พอ คงเหลือ ${qty} ชิ้น`, { duration: 2000 })
        beepError(); haptic(60)
        return
      }
      addItem(product)
      toast.success(`เพิ่มสินค้าแล้ว — ${product.name}`, { duration: 1000 })
      beepSuccess(); haptic(40)
      if (search) { setSearch(''); requestAnimationFrame(() => inputRef.current?.focus()) }
    }

    const getCartQty = (productId: string) =>
      cartItems.find((i) => i.product.id === productId)?.quantity ?? 0

    function handleQuickAction(qa: typeof QUICK_ACTIONS[number]) {
      if (!qa.category) return
      onCategoryChange?.(qa.category)
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }

    // ── Render ──────────────────────────────────────────────────────────────

    return (
      <div className="flex flex-col h-full">

        {/* ── Search bar V3 ────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              id="pos-search"
              type="text"
              placeholder={isNative ? 'ค้นหา / สแกนบาร์โค้ด...' : 'ค้นหา / สแกนบาร์โค้ด (Enter เพื่อเพิ่ม)'}
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-14 pl-12 pr-28 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
              autoFocus
              autoComplete="off"
              data-pos-search
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {search && (
                <button
                  onClick={() => { setSearch(''); inputRef.current?.focus() }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  tabIndex={-1}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => inputRef.current?.focus()}
                className={cn(
                  'flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                  isNative
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400',
                )}
                tabIndex={-1}
              >
                <ScanBarcode className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">สแกน</span>
              </button>
            </div>
          </div>

          {/* Quick actions */}
          {!search && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              {QUICK_ACTIONS.map((qa) => (
                qa.href ? (
                  <Link key={qa.label} href={qa.href}>
                    <button
                      type="button"
                      className={cn(
                        'flex flex-col items-center gap-1 min-w-[60px] px-3 py-2 rounded-xl border text-center transition-all shrink-0',
                        'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
                        'hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:shadow-sm',
                      )}
                    >
                      <span className="text-lg leading-none">{qa.emoji}</span>
                      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{qa.label}</span>
                    </button>
                  </Link>
                ) : (
                  <button
                    key={qa.label}
                    type="button"
                    onClick={() => handleQuickAction(qa)}
                    className={cn(
                      'flex flex-col items-center gap-1 min-w-[60px] px-3 py-2 rounded-xl border text-center transition-all shrink-0',
                      category === qa.category
                        ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:shadow-sm',
                    )}
                  >
                    <span className="text-lg leading-none">{qa.emoji}</span>
                    <span className={cn(
                      'text-[10px] font-medium whitespace-nowrap',
                      category === qa.category ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400',
                    )}>{qa.label}</span>
                  </button>
                )
              ))}
            </div>
          )}

          {/* Recent searches */}
          {!search && recentSearches.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
              {recentSearches.map((s) => (
                <button
                  key={s}
                  onClick={() => setSearch(s)}
                  className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-full px-2.5 py-1 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Count row */}
          {!isLoading && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {search ? (
                  <>พบ <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span> รายการ</>
                ) : category === 'FAVORITES' ? (
                  <>รายการโปรด <span className="font-semibold text-slate-700 dark:text-slate-200">{categoryFiltered.length}</span> รายการ</>
                ) : (
                  <>สินค้า <span className="font-semibold text-slate-700 dark:text-slate-200">{categoryFiltered.length}</span> รายการ</>
                )}
              </p>
              {isNative && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <ScanBarcode className="h-3.5 w-3.5" />
                  พร้อมสแกน
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Scrollable product grid ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="text-sm">กำลังโหลดสินค้า...</span>
            </div>
          ) : (
            <div className="px-4 pb-4 pt-3 space-y-4">

              {/* ── Favorites section (when not in FAVORITES category) ─── */}
              {!search && category !== 'FAVORITES' && favoriteProducts.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide select-none">
                      รายการโปรด
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                    {favoriteProducts.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        cartQty={getCartQty(p.id)}
                        stockOf={stockOf}
                        isFavorite={true}
                        onToggleFavorite={toggleFavorite}
                        onClick={handleCardClick}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── All / filtered products ─────────────────────────────── */}
              {filtered.length === 0 ? (
                <EmptyState
                  search={search}
                  category={category}
                  favorites={favoriteProducts}
                  onCategoryChange={onCategoryChange}
                />
              ) : (
                <>
                  {!search && category !== 'FAVORITES' && favoriteProducts.length > 0 && (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide select-none -mb-1">
                      {category === 'ALL' ? 'สินค้าทั้งหมด' : TYPE_LABEL[category] ?? category}
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                    {filtered.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        cartQty={getCartQty(p.id)}
                        stockOf={stockOf}
                        isFavorite={favorites.includes(p.id)}
                        onToggleFavorite={toggleFavorite}
                        onClick={handleCardClick}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <CrossBranchAvailabilityDialog
          open={!!transferProduct}
          onClose={() => setTransferProduct(null)}
          product={transferProduct}
          currentBranchId={effectiveBranch}
          currentBranchName={branchName}
        />
      </div>
    )
  },
)

ProductSearch.displayName = 'ProductSearch'

// ── Empty state V3 ────────────────────────────────────────────────────────────

function EmptyState({
  search,
  category,
  favorites,
  onCategoryChange,
}: {
  search: string
  category: string
  favorites: Product[]
  onCategoryChange?: (cat: string) => void
}) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Search className="h-7 w-7 text-slate-300 dark:text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">ไม่พบสินค้า</p>
          <p className="text-xs text-slate-400 mt-0.5">ลองค้นหาด้วยชื่อ, บาร์โค้ด หรือ SKU</p>
        </div>
      </div>
    )
  }

  if (category === 'FAVORITES') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="h-14 w-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
          <Star className="h-7 w-7 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">ยังไม่มีรายการโปรด</p>
          <p className="text-xs text-slate-400 mt-0.5">แตะ ⭐ บนการ์ดสินค้าเพื่อเพิ่ม</p>
        </div>
        {onCategoryChange && (
          <button
            onClick={() => onCategoryChange('ALL')}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            ดูสินค้าทั้งหมด
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-8 gap-6 text-center">
      {/* Main empty prompt */}
      <div className="space-y-2">
        <div className="text-4xl">📦</div>
        <p className="text-base font-bold text-slate-700 dark:text-slate-200">พร้อมเริ่มขาย</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">ค้นหาสินค้าด้านบน หรือสแกนบาร์โค้ด</p>
      </div>

      <div className="w-full max-w-xs space-y-2">
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/60 px-4 py-3">
          <Search className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-xs text-blue-700 dark:text-blue-300">🔍 ค้นหาชื่อสินค้า, บาร์โค้ด หรือ SKU</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-4 py-3">
          <ScanBarcode className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-600 dark:text-slate-400">📷 หรือสแกนบาร์โค้ด</span>
        </div>
        {favorites.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/60 px-4 py-3">
            <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-400">
              ⭐ รายการโปรดของคุณ {favorites.length} รายการ
            </span>
            {onCategoryChange && (
              <button
                onClick={() => onCategoryChange('FAVORITES')}
                className="ml-auto text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline shrink-0"
              >
                ดู
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category shortcuts */}
      {category !== 'ALL' && onCategoryChange && (
        <button
          onClick={() => onCategoryChange('ALL')}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          ดูสินค้าทั้งหมด →
        </button>
      )}
    </div>
  )
}
