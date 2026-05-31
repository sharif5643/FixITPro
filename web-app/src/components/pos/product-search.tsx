'use client'

import {
  useState, useMemo, useRef, useCallback,
  forwardRef, useImperativeHandle,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Package, Loader2, Plus, ScanBarcode, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { useCartStore } from '@/store/cart.store'
import { useNativeScanner } from '@/hooks/useNativeScanner'
import { Platform } from '@/lib/platform'
import { beepSuccess, beepError, haptic } from '@/lib/beep'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { CrossBranchAvailabilityDialog } from '@/components/products/cross-branch-availability-dialog'
import api from '@/lib/api'
import type { Product } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  PHONE: 'มือถือ',
  SIM: 'ซิม',
  ACCESSORY: 'อุปกรณ์',
  PART: 'อะไหล่',
}

const TYPE_COLOR: Record<string, string> = {
  PHONE: 'bg-blue-100 text-blue-700',
  SIM: 'bg-green-100 text-green-700',
  ACCESSORY: 'bg-purple-100 text-purple-700',
  PART: 'bg-orange-100 text-orange-700',
}

// ── Barcode scanner speed detection ───────────────────────────────────────────
// A HID scanner sends all chars in < SCANNER_MS total then fires Enter.
// We track the timestamp of the FIRST keystroke in the current burst.
const SCANNER_MS = 120 // ms — bursts faster than this = scanner

// ── Handle exposed to parent via ref ─────────────────────────────────────────

export interface ProductSearchHandle {
  /** Focus the search input. */
  focusSearch: () => void
  /** Clear search text and focus the input. */
  clearAndFocus: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ProductSearch = forwardRef<ProductSearchHandle, {}>((_, ref) => {
  const [search, setSearch] = useState('')
  const [transferProduct, setTransferProduct] = useState<Product | null>(null)

  const inputRef   = useRef<HTMLInputElement>(null)
  const burstStart = useRef<number | null>(null) // timestamp of first keystroke in current burst

  const addItem   = useCartStore((s) => s.addItem)
  const cartItems = useCartStore((s) => s.items)
  const isNative  = Platform.isNative()

  const user             = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const isOwner          = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const effectiveBranch  = isOwner ? (selectedBranchId ?? undefined) : (user?.branchId ?? undefined)

  const { branchName } = useBranchContext()

  // ── Expose handle ──────────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      // rAF avoids fighting with dialog close animations
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    clearAndFocus: () => {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    },
  }))

  // ── Products query ─────────────────────────────────────────────────────────

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', effectiveBranch ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (effectiveBranch) params.set('branchId', effectiveBranch)
      return (await api.get(`/products?${params}`)).data
    },
    staleTime: 30_000,
  })

  const stockOf = useCallback((p: Product) => p.branchQuantity ?? p.stock, [])

  // ── Native barcode scanner (global — fires when NO input focused) ──────────

  useNativeScanner(useCallback((barcode: string) => {
    const active = products.filter((p) => p.isActive)
    const match  = active.find(
      (p) =>
        p.barcode === barcode ||
        p.sku.toUpperCase() === barcode.toUpperCase(),
    )
    if (!match) {
      toast.error('ไม่พบสินค้าในสาขานี้', { duration: 2000 })
      beepError()
      haptic(60)
      // Fall back to text search so user sees the attempted scan
      setSearch(barcode)
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }
    if (stockOf(match) === 0) {
      const msg = match.hasStockRecord === false
        ? 'ยังไม่มีสต็อกในสาขานี้'
        : 'สินค้าในสาขานี้หมด'
      toast.error(`${match.name} — ${msg}`, { duration: 2000 })
      beepError()
      haptic(80)
      return
    }
    addItem(match)
    toast.success(`เพิ่มสินค้าแล้ว — ${match.name}`, { duration: 1200 })
    beepSuccess()
    haptic(40)
  }, [products, stockOf, addItem]))

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const active = products.filter((p) => p.isActive)
    if (!search.trim()) return active
    const q = search.toLowerCase()
    return active.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode?.toLowerCase().includes(q) ?? false),
    )
  }, [products, search])

  // ── Search input helpers ───────────────────────────────────────────────────

  /** Try to add a product by exact barcode/SKU, or the sole filtered result. */
  const tryAddFromSearch = useCallback((value: string, isScannerBurst: boolean) => {
    const q      = value.trim()
    const active = products.filter((p) => p.isActive)

    // 1. Exact barcode / SKU match (scanner or typed)
    const exact = active.find(
      (p) =>
        p.barcode === q ||
        p.sku.toUpperCase() === q.toUpperCase(),
    )

    const target = exact ?? (filtered.length === 1 && !isScannerBurst ? filtered[0] : null)

    if (!target) {
      if (isScannerBurst) {
        toast.error('ไม่พบสินค้าในสาขานี้', { duration: 2000 })
        beepError()
        haptic(60)
      }
      return
    }

    const qty = stockOf(target)
    if (qty === 0) {
      toast.error(
        `${target.name} — ${target.hasStockRecord === false ? 'ยังไม่มีสต็อกในสาขานี้' : 'สินค้าในสาขานี้หมด'}`,
        { duration: 2000 },
      )
      beepError()
      haptic(80)
      return
    }

    addItem(target)
    toast.success(`เพิ่มสินค้าแล้ว — ${target.name}`, { duration: 1200 })
    beepSuccess()
    haptic(40)
    setSearch('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [products, filtered, stockOf, addItem])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    // Record burst start time on first char after a cleared input
    if (!search && val) burstStart.current = Date.now()
    if (!val) burstStart.current = null
    setSearch(val)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setSearch('')
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (!search.trim()) return
      const elapsed     = burstStart.current ? Date.now() - burstStart.current : Infinity
      const isScanBurst = elapsed < SCANNER_MS && search.length >= 3
      burstStart.current = null
      tryAddFromSearch(search, isScanBurst)
    }
  }

  // ── Cart qty helper ───────────────────────────────────────────────────────

  const getCartQty = (productId: string) =>
    cartItems.find((i) => i.product.id === productId)?.quantity ?? 0

  // ── Card click handler ────────────────────────────────────────────────────

  function handleCardClick(product: Product) {
    const isOut    = stockOf(product) === 0
    const hasOther = (product.otherBranchTotal ?? 0) > 0

    if (isOut && hasOther) { setTransferProduct(product); return }
    if (isOut) return

    addItem(product)
    toast.success(`เพิ่มสินค้าแล้ว — ${product.name}`, { duration: 1000 })
    beepSuccess()
    haptic(40)
    // Clear search and return focus so user is ready for next scan/entry
    if (search) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          id="pos-search"
          placeholder={isNative ? 'ค้นหา หรือสแกน Barcode...' : 'ค้นหา / สแกน (Enter เพื่อเพิ่ม)...'}
          value={search}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          className="pl-9 pr-9 h-11"
          autoFocus
          autoComplete="off"
          data-pos-search
        />
        {search && (
          <button
            onClick={() => { setSearch(''); inputRef.current?.focus() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Count / scanner hint */}
      {!isLoading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            แสดง <span className="font-medium text-gray-700">{filtered.length}</span> รายการ
          </p>
          {isNative && (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <ScanBarcode className="h-3.5 w-3.5" />
              พร้อมสแกน
            </span>
          )}
        </div>
      )}

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลดสินค้า...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Package className="h-10 w-10 text-gray-200" />
            <p className="text-sm">ไม่พบสินค้า</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 pb-2">
            {filtered.map((product) => {
              const inCart    = getCartQty(product.id)
              const qty       = stockOf(product)
              const isOut     = qty === 0
              const hasOther  = (product.otherBranchTotal ?? 0) > 0
              const canRequest = isOut && hasOther
              const typeColor = TYPE_COLOR[product.type] ?? 'bg-gray-100 text-gray-700'

              return (
                <button
                  key={product.id}
                  onClick={() => handleCardClick(product)}
                  disabled={isOut && !canRequest}
                  className={[
                    'relative text-left rounded-xl border p-3.5 transition-all duration-150',
                    isOut && !canRequest
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200'
                      : canRequest
                        ? 'border-orange-300 bg-orange-50/40 cursor-pointer hover:bg-orange-50 hover:border-orange-400'
                        : inCart > 0
                          ? 'border-blue-400 bg-blue-50/40 shadow-sm cursor-pointer hover:bg-blue-50'
                          : 'border-gray-200 bg-white cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-sm active:scale-[0.98]',
                  ].join(' ')}
                >
                  {/* Cart badge */}
                  {inCart > 0 && (
                    <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white leading-none">
                      {inCart}
                    </span>
                  )}

                  {/* Transfer badge */}
                  {canRequest && (
                    <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white">
                      <ArrowRightLeft className="h-3 w-3" />
                    </span>
                  )}

                  {/* Add indicator */}
                  {!isOut && inCart === 0 && (
                    <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-gray-400 opacity-0 group-hover:opacity-100">
                      <Plus className="h-3 w-3" />
                    </span>
                  )}

                  <p className="font-semibold text-sm leading-tight line-clamp-2 text-gray-900 pr-7">
                    {product.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{product.sku}</p>

                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-base font-bold text-blue-700">
                      {formatThaiMoney(Number(product.price))}
                    </span>
                    <span className="text-right">
                      {isOut ? (
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-red-500 font-medium">หมดในสาขานี้</span>
                          {canRequest && (
                            <span className="text-[10px] text-orange-600 font-semibold">กดขอโอนสินค้า</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">เหลือ {qty}</span>
                      )}
                    </span>
                  </div>

                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${typeColor}`}>
                    {TYPE_LABEL[product.type] ?? product.type}
                  </span>
                </button>
              )
            })}
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
})

ProductSearch.displayName = 'ProductSearch'
