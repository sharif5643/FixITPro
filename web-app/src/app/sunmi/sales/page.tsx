'use client'

import Link from 'next/link'
import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ScanBarcode, Camera, Trash2, Plus, Minus,
  Banknote, Smartphone, CreditCard, X, Tag, Search, User,
  ShoppingCart, ChevronRight, History, Printer,
} from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { BarcodeScannerDialog } from '@/components/sunmi/barcode-scanner-dialog'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { useAuthStore } from '@/store/auth.store'
import { useCartStore } from '@/store/cart.store'
import {
  buildReceiptHtml, buildReceiptPreviewData, shareReceipt, openCashDrawer,
  type PrintReceiptOptions,
} from '@/lib/printer'
import { pushBackHandler } from '@/lib/back-stack'
import { nativeScan } from '@/lib/native-barcode-scanner'
import { Platform } from '@/lib/platform'
import { formatThaiMoney, apiErrorMessage } from '@/lib/utils'
import api from '@/lib/api'
import type { Customer, Product, Sale, ShopSettings, PaymentMethod } from '@/types'

// ── Payment options ───────────────────────────────────────────────────────────

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { value: 'CASH',     label: 'เงินสด',  icon: Banknote },
  { value: 'TRANSFER', label: 'โอนเงิน', icon: Smartphone },
  { value: 'CARD',     label: 'บัตร',     icon: CreditCard },
]

// ── Product card (search results) ─────────────────────────────────────────────

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const availableQty = product.branchQuantity ?? 0
  const outOfStock = availableQty < 1
  const lowStock   = !outOfStock && availableQty < 5
  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={() => onAdd(product)}
      className={`w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-4 text-left shadow-sm active:scale-[0.98] transition-transform ${
        outOfStock ? 'opacity-40' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900 text-base leading-tight truncate">{product.name}</p>
        <p className="text-sm text-slate-400 mt-0.5">
          {product.sku}
          {product.barcode ? ` · ${product.barcode}` : ''}
        </p>
        <span className={`text-xs font-semibold mt-0.5 inline-block ${
          lowStock ? 'text-orange-500' : 'text-slate-400'
        }`}>
          คงเหลือ {availableQty} {lowStock ? '⚠ ใกล้หมด' : ''}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="font-bold text-base text-slate-800 tabular-nums">
          {formatThaiMoney(Number(product.price))}
        </span>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${
          outOfStock ? 'bg-slate-100' : 'bg-blue-600'
        }`}>
          <Plus className={`h-6 w-6 ${outOfStock ? 'text-slate-300' : 'text-white'}`} />
        </div>
      </div>
    </button>
  )
}

// ── Cart row ──────────────────────────────────────────────────────────────────

function CartRow({
  product, quantity, itemDiscount,
  onInc, onDec, onRemove, onSetDiscount,
}: {
  product: Product; quantity: number; itemDiscount: number
  onInc: () => void; onDec: () => void; onRemove: () => void
  onSetDiscount: (d: number) => void
}) {
  const [showDiscount, setShowDiscount] = useState(itemDiscount > 0)
  const [discStr, setDiscStr]           = useState(itemDiscount > 0 ? String(itemDiscount) : '')
  const atMax = quantity >= (product.branchQuantity ?? 0)

  function commitDiscount() {
    const d = Math.max(0, Math.min(Number(discStr) || 0, Number(product.price) * quantity))
    onSetDiscount(d)
    if (d === 0) setShowDiscount(false)
  }

  const lineTotal = Number(product.price) * quantity - itemDiscount

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Name + price-per-unit */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 text-sm leading-tight truncate">{product.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatThaiMoney(Number(product.price))} · สต็อก {quantity}/{product.branchQuantity ?? 0}
          </p>
        </div>

        {/* Qty controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onDec}
            className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center active:bg-slate-200 text-slate-700"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center font-bold text-base tabular-nums">{quantity}</span>
          <button
            onClick={onInc}
            disabled={atMax}
            className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center active:bg-slate-200 text-slate-700 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Line total */}
        <span className="w-16 text-right font-bold text-sm text-slate-900 tabular-nums">
          {formatThaiMoney(lineTotal)}
        </span>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="h-9 w-9 rounded-xl flex items-center justify-center text-red-400 active:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Per-item discount row */}
      <div className="flex items-center gap-2 px-3 pb-2.5">
        {showDiscount ? (
          <>
            <Tag className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span className="text-xs text-slate-400">ส่วนลดรายการ</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={discStr}
              onChange={(e) => setDiscStr(e.target.value)}
              onBlur={commitDiscount}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitDiscount(); (e.target as HTMLElement).blur() } }}
              placeholder="0"
              className="w-20 h-7 px-2 border border-slate-200 rounded-lg text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              autoFocus
            />
            <span className="text-xs text-slate-400">บาท</span>
            {itemDiscount > 0 && (
              <span className="text-xs text-red-500 font-semibold">-{formatThaiMoney(itemDiscount)}</span>
            )}
          </>
        ) : (
          <button
            onClick={() => setShowDiscount(true)}
            className="flex items-center gap-1 text-xs text-slate-400 active:text-blue-600"
          >
            <Tag className="h-3 w-3" />
            เพิ่มส่วนลดรายการ
          </button>
        )}
      </div>
    </div>
  )
}

// ── Checkout sheet ────────────────────────────────────────────────────────────

interface CheckoutSheetProps {
  subtotal:      number
  totalDiscount: number
  total:         number
  itemDiscounts: Map<string, number>
  shiftId?:      string
  onClose:       () => void
  onSuccess:     (sale: Sale) => void
}

function CheckoutSheet({
  subtotal, totalDiscount, total, itemDiscounts, shiftId, onClose, onSuccess,
}: CheckoutSheetProps) {
  const items                       = useCartStore((s) => s.items)
  const discount                    = useCartStore((s) => s.discount)
  const [method, setMethod]         = useState<PaymentMethod>('CASH')
  const [amountPaid, setAmountPaid] = useState('')
  const [customerName, setCustomerName]   = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [searchQ, setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [searching, setSearching]   = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const paidNum   = Number(amountPaid) || 0
  const change    = method === 'CASH' ? Math.max(0, paidNum - total) : 0
  const canSubmit = !!shiftId && (method !== 'CASH' ? true : paidNum >= total)

  useEffect(() => pushBackHandler(onClose), [onClose])
  useEffect(() => { if (method !== 'CASH') setAmountPaid('') }, [method])

  async function searchCustomer() {
    if (!searchQ.trim()) return
    setSearching(true)
    try {
      const res = await api.get('/customers', { params: { search: searchQ.trim(), limit: 6 } })
      setSearchResults(Array.isArray(res.data) ? res.data : res.data?.items ?? [])
    } catch {
      toast.error('ค้นหาลูกค้าไม่สำเร็จ')
    } finally {
      setSearching(false)
    }
  }

  function pickCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustomerName(c.name)
    setCustomerPhone(c.phone ?? '')
    setSearchQ('')
    setSearchResults([])
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setCustomerName('')
    setCustomerPhone('')
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/sales', {
        shiftId,
        paymentMethod: method,
        amountPaid:    method === 'CASH' ? paidNum : total,
        discount,
        customerId:    selectedCustomer?.id || undefined,
        customerName:  !selectedCustomer && customerName.trim() ? customerName.trim() : undefined,
        customerPhone: !selectedCustomer && customerPhone.trim() ? customerPhone.trim() : undefined,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity:  i.quantity,
          price:     Number(i.product.price),
          discount:  itemDiscounts.get(i.product.id) ?? 0,
        })),
      }),
    onSuccess: (res) => onSuccess(res.data as Sale),
    onError: (err: any) => {
      toast.error(apiErrorMessage(err))
    },
  })

  // Quick-pay amounts
  const quickAmounts = useMemo(() => {
    const raw = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, 1000, 2000]
    return Array.from(new Set(raw)).filter((v) => v >= total).slice(0, 4)
  }, [total])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[94vh] flex flex-col">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <p className="font-bold text-xl text-slate-900 text-center">ชำระเงิน</p>

          {/* Order summary */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>ยอดรวม ({items.reduce((s, i) => s + i.quantity, 0)} รายการ)</span>
              <span>{formatThaiMoney(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>ส่วนลด</span>
                <span>-{formatThaiMoney(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-2xl pt-2 border-t border-slate-200 mt-1">
              <span className="text-slate-800">รวมทั้งสิ้น</span>
              <span className="text-blue-700">{formatThaiMoney(total)}</span>
            </div>
          </div>

          {/* Customer (optional) */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-500">ลูกค้า (ไม่บังคับ)</p>
            {selectedCustomer ? (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <User className="h-4 w-4 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-blue-900 text-sm truncate">{selectedCustomer.name}</p>
                  {selectedCustomer.phone && <p className="text-xs text-blue-600">{selectedCustomer.phone}</p>}
                </div>
                <button onClick={clearCustomer} className="text-slate-400 active:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { searchCustomer(); e.preventDefault() } }}
                      placeholder="ค้นหาลูกค้า..."
                      className="w-full h-10 pl-8 pr-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={searchCustomer}
                    disabled={searching || !searchQ.trim()}
                    className="h-10 px-4 rounded-xl bg-slate-700 text-white text-sm font-medium disabled:opacity-50 active:bg-slate-800"
                  >
                    {searching
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent inline-block" />
                      : 'ค้น'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-50 overflow-hidden">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => pickCustomer(c)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm active:bg-blue-50"
                      >
                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-900 truncate">{c.name}</span>
                        {c.phone && <span className="text-slate-400 text-xs ml-auto shrink-0">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="หรือพิมพ์ชื่อ..."
                    className="h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="เบอร์โทร"
                    type="tel"
                    inputMode="tel"
                    className="h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setMethod(value)}
                className={`flex flex-col items-center py-4 rounded-xl border-2 font-medium text-sm transition-colors ${
                  method === value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                <Icon className="h-6 w-6 mb-1" />
                {label}
              </button>
            ))}
          </div>

          {/* Cash input */}
          {method === 'CASH' && (
            <div className="space-y-2">
              <label className="text-sm text-slate-600 font-semibold">รับเงินมา (บาท)</label>
              <input
                type="number"
                inputMode="numeric"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder={String(total)}
                className="w-full h-16 px-4 border-2 border-slate-200 rounded-xl text-3xl font-bold bg-white focus:outline-none focus:border-blue-500 tabular-nums"
                autoFocus
              />
              {change > 0 && (
                <p className="text-xl font-bold text-green-700 text-right pr-1">
                  เงินทอน: {formatThaiMoney(change)}
                </p>
              )}
              {amountPaid !== '' && paidNum < total && (
                <p className="text-sm text-red-500 text-right pr-1">
                  ขาดอีก {formatThaiMoney(total - paidNum)}
                </p>
              )}

              {/* Quick-pay */}
              <div className="flex gap-2 flex-wrap">
                {quickAmounts.map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmountPaid(String(v))}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      paidNum === v
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                    }`}
                  >
                    {formatThaiMoney(v)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Confirm button */}
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="w-full h-16 rounded-2xl bg-blue-600 text-white text-xl font-bold active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
              : method !== 'CASH'
              ? `ยืนยัน — ${formatThaiMoney(total)}`
              : 'ยืนยันชำระเงิน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SunmiSalesPage() {
  const queryClient   = useQueryClient()
  const user          = useAuthStore((s) => s.user)
  const items         = useCartStore((s) => s.items)
  const discount      = useCartStore((s) => s.discount)
  const addItem       = useCartStore((s) => s.addItem)
  const removeItem    = useCartStore((s) => s.removeItem)
  const updateQty     = useCartStore((s) => s.updateQuantity)
  const setDiscount   = useCartStore((s) => s.setDiscount)
  const clearCart     = useCartStore((s) => s.clearCart)

  // Search state
  const [searchMode, setSearchMode]       = useState<'barcode' | 'name'>('barcode')
  const [barcodeInput, setBarcodeInput]   = useState('')
  const [nameQuery, setNameQuery]         = useState('')
  const [nameResults, setNameResults]     = useState<Product[]>([])
  const [nameLoading, setNameLoading]     = useState(false)
  const [notFoundCode, setNotFoundCode]   = useState<string | null>(null)
  const nameTimer                         = useRef<NodeJS.Timeout>()

  // Cart discount
  const [discountInput, setDiscountInput] = useState('')

  // Per-item discounts (local state, productId → amount)
  const [itemDiscounts, setItemDiscounts] = useState<Map<string, number>>(new Map())

  // UX-1: threshold (THB) above which a confirm dialog appears before checkout
  const LARGE_CHECKOUT_THRESHOLD = 5000

  // UI state
  const [checkoutOpen, setCheckoutOpen]                 = useState(false)
  const [confirmLargeCheckoutOpen, setConfirmLargeCheckoutOpen] = useState(false)
  const [scannerOpen, setScannerOpen]       = useState(false)
  const [nativeScanning, setNativeScanning] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<PrintReceiptOptions | null>(null)
  const [lastReceipt, setLastReceipt]       = useState<PrintReceiptOptions | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Totals
  const itemDiscountsTotal = useMemo(
    () => Array.from(itemDiscounts.values()).reduce((s, d) => s + d, 0),
    [itemDiscounts],
  )
  const subtotal = useMemo(
    () => items.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0),
    [items],
  )
  const totalDiscount = itemDiscountsTotal + discount
  const total = Math.max(0, subtotal - totalDiscount)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)

  const { data: currentShift } = useQuery<{ id: string } | null>({
    queryKey:  ['shifts', 'current'],
    queryFn:   async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey:  ['settings'],
    queryFn:   async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  // Auto-focus barcode input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150)
  }, [])

  // Name search debounce
  useEffect(() => {
    clearTimeout(nameTimer.current)
    if (!nameQuery.trim() || nameQuery.length < 1) { setNameResults([]); return }
    nameTimer.current = setTimeout(async () => {
      setNameLoading(true)
      try {
        const res = await api.get('/products', { params: { search: nameQuery.trim(), limit: 20 } })
        const list: Product[] = Array.isArray(res.data) ? res.data : res.data?.items ?? []
        setNameResults(list)
      } catch {} finally {
        setNameLoading(false)
      }
    }, 280)
  }, [nameQuery])

  function setItemDiscount(productId: string, d: number) {
    setItemDiscounts((prev) => {
      const next = new Map(prev)
      if (d === 0) next.delete(productId)
      else next.set(productId, d)
      return next
    })
  }

  function commitDiscount() {
    const d = Math.max(0, Number(discountInput) || 0)
    setDiscount(d)
    setDiscountInput(d > 0 ? String(d) : '')
  }

  const handleScan = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setNotFoundCode(null)
    try {
      const res = await api.get('/products', { params: { search: trimmed, limit: 10 } })
      const list: Product[] = Array.isArray(res.data) ? res.data : res.data?.items ?? []
      const exact = list.find((p) => p.barcode === trimmed || p.sku === trimmed) ?? list[0]
      if (exact) {
        if ((exact.branchQuantity ?? exact.stock) < 1) {
          toast.error(`${exact.name} — สต็อกหมด`)
        } else {
          addItem(exact)
          toast.success(`+ ${exact.name}`, { duration: 1500 })
        }
      } else {
        setNotFoundCode(trimmed)
      }
    } catch {
      toast.error('ค้นหาสินค้าไม่สำเร็จ')
    }
    setBarcodeInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [addItem])

  function handlePickProduct(product: Product) {
    if ((product.branchQuantity ?? 0) < 1) {
      toast.error(`${product.name} — สต็อกหมด`)
      return
    }
    addItem(product)
    toast.success(`+ ${product.name}`, { duration: 1500 })
    setNameQuery('')
    setNameResults([])
  }

  async function handleCameraClick() {
    if (Platform.isNative()) {
      setNativeScanning(true)
      try {
        const code = await nativeScan()
        if (code) await handleScan(code)
      } finally {
        setNativeScanning(false)
      }
    } else {
      setScannerOpen(true)
    }
  }

  function handleClearCart() {
    clearCart()
    setItemDiscounts(new Map())
    setDiscountInput('')
    setNotFoundCode(null)
    toast('ล้างตะกร้าแล้ว')
  }

  async function handleSuccess(sale: Sale) {
    setCheckoutOpen(false)
    clearCart()
    setItemDiscounts(new Map())
    setDiscountInput('')
    setNotFoundCode(null)
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['sales-today'] })
    queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    queryClient.invalidateQueries({ queryKey: ['serials'] })
    queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })

    const opts: PrintReceiptOptions = {
      shopName:      settings?.shopName ?? 'FixITPro',
      shopAddress:   settings?.shopAddress ?? undefined,
      shopPhone:     settings?.shopPhone ?? undefined,
      receiptNumber: sale.receiptNumber,
      date:          format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: th }),
      cashierName:   user?.name ?? '',
      items:         sale.items.map((i) => ({
        name:  i.product.name,
        qty:   i.quantity,
        price: Number(i.price),
        total: Number(i.total),
      })),
      subtotal:      Number(sale.subtotal),
      discount:      Number(sale.discount),
      total:         Number(sale.total),
      paymentMethod: sale.paymentMethod,
      amountPaid:    Number(sale.amountPaid),
      change:        Number(sale.change),
      customerName:  sale.customer?.name,
      footer:        settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
      taxId:         settings?.taxId ?? undefined,
      showTaxId:     settings?.showTaxId ?? true,
      paymentQrUrl:  settings?.paymentQrUrl ?? undefined,
      showLogo:      settings?.showLogo ?? true,
      logoUrl:       settings?.logoUrl ?? undefined,
    }

    if (sale.paymentMethod === 'CASH') {
      try { await openCashDrawer() } catch { /* non-critical */ }
    }

    setLastReceipt(opts)
    setReceiptPreview(opts)
  }

  // What to show in the scrollable content area
  const showProductCards = searchMode === 'name' && nameQuery.trim().length > 0

  return (
    <>
      <SunmiShell
        title="ขายสินค้า"
        showBack
        aboveScroll={
          <div className="bg-slate-100 px-3 pt-2.5 pb-2 space-y-2">

            {/* Shift warning */}
            {currentShift === null && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-2">
                <p className="text-sm text-amber-800 font-semibold">กรุณาเปิดกะก่อนขายสินค้า</p>
                <Link
                  href="/sunmi/shifts"
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold active:bg-amber-600"
                >
                  เปิดกะ
                </Link>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200">
              <button
                onClick={() => {
                  setSearchMode('barcode')
                  setNameQuery('')
                  setNameResults([])
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition-colors ${
                  searchMode === 'barcode' ? 'bg-slate-900 text-white' : 'text-slate-500 active:bg-slate-50'
                }`}
              >
                <ScanBarcode className="h-4 w-4" />
                บาร์โค้ด
              </button>
              <button
                onClick={() => setSearchMode('name')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition-colors ${
                  searchMode === 'name' ? 'bg-slate-900 text-white' : 'text-slate-500 active:bg-slate-50'
                }`}
              >
                <Search className="h-4 w-4" />
                ชื่อ / SKU
              </button>
            </div>

            {/* Input row */}
            <div className="flex gap-2">
              {searchMode === 'barcode' ? (
                <>
                  <div className="relative flex-1">
                    <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                    <input
                      ref={inputRef}
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleScan(barcodeInput); e.preventDefault() }
                      }}
                      placeholder="สแกน หรือพิมพ์บาร์โค้ด / SKU..."
                      className="w-full h-12 pl-10 pr-4 border border-slate-200 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    onClick={handleCameraClick}
                    disabled={nativeScanning}
                    className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:bg-slate-100 disabled:opacity-60 shrink-0"
                  >
                    {nativeScanning
                      ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                      : <Camera className="h-5 w-5" />}
                  </button>
                </>
              ) : (
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                  <input
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder="พิมพ์ชื่อสินค้า / SKU / บาร์โค้ด..."
                    className="w-full h-12 pl-10 pr-4 border border-slate-200 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="off"
                    autoFocus
                  />
                  {nameLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  )}
                  {nameQuery && (
                    <button
                      onClick={() => { setNameQuery(''); setNameResults([]) }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Not found banner */}
            {notFoundCode && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-800">ไม่พบสินค้า</p>
                  <p className="text-xs text-amber-600 font-mono truncate">{notFoundCode}</p>
                </div>
                <button
                  onClick={() => setNotFoundCode(null)}
                  className="h-7 w-7 flex items-center justify-center text-amber-500 active:bg-amber-100 rounded-lg shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        }
        belowScroll={
          items.length > 0 ? (
            <div className="bg-white border-t border-slate-200 px-3 pt-2.5 pb-3 space-y-2">
              {/* Discount row */}
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-500 shrink-0">ส่วนลดรวม</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  onBlur={commitDiscount}
                  onKeyDown={(e) => { if (e.key === 'Enter') { commitDiscount(); (e.target as HTMLElement).blur() } }}
                  placeholder="0"
                  className="flex-1 h-9 px-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-right tabular-nums"
                />
                <span className="text-sm text-slate-400 shrink-0">บาท</span>
              </div>

              {/* Total row */}
              <div className="flex items-end justify-between">
                <div className="text-xs text-slate-400 space-y-0.5">
                  <p>{totalQty} ชิ้น</p>
                  {totalDiscount > 0 && (
                    <p className="text-red-400 font-semibold">ส่วนลด -{formatThaiMoney(totalDiscount)}</p>
                  )}
                </div>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">{formatThaiMoney(total)}</p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleClearCart}
                  className="h-12 w-12 rounded-2xl border-2 border-slate-200 bg-white text-slate-400 active:bg-slate-50 flex items-center justify-center shrink-0"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => total >= LARGE_CHECKOUT_THRESHOLD
                    ? setConfirmLargeCheckoutOpen(true)
                    : setCheckoutOpen(true)}
                  disabled={currentShift === null}
                  className="flex-1 h-12 rounded-2xl bg-blue-600 text-white font-bold text-lg active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="h-5 w-5" />
                  คิดเงิน
                </button>
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="p-3 space-y-2 pb-4">
          {/* Product search result cards */}
          {showProductCards ? (
            nameResults.length === 0 && !nameLoading ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <Search className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">ไม่พบสินค้า</p>
                <p className="text-xs mt-0.5">ลองค้นหาด้วยคำอื่น</p>
              </div>
            ) : (
              <>
                {nameResults.length > 0 && (
                  <p className="text-xs text-slate-400 font-medium px-1">{nameResults.length} รายการ</p>
                )}
                {nameResults.map((p) => (
                  <ProductCard key={p.id} product={p} onAdd={handlePickProduct} />
                ))}
              </>
            )
          ) : (
            /* Cart items */
            items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
                <ScanBarcode className="h-14 w-14 opacity-20" />
                <div className="text-center">
                  <p className="font-semibold text-base">ยังไม่มีสินค้าในตะกร้า</p>
                  <p className="text-sm mt-0.5 opacity-70">สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า</p>
                </div>
                {/* Quick actions for empty cart */}
                <div className="flex gap-2 mt-2">
                  {lastReceipt && (
                    <button
                      onClick={() => setReceiptPreview(lastReceipt)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold active:bg-slate-600"
                    >
                      <Printer className="h-4 w-4" />
                      พิมพ์ใบเสร็จซ้ำ
                    </button>
                  )}
                  <Link
                    href="/sunmi/sales/history"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold active:bg-slate-200"
                  >
                    <History className="h-4 w-4" />
                    ประวัติการขาย
                  </Link>
                </div>
              </div>
            ) : (
              items.map((item) => (
                <CartRow
                  key={item.product.id}
                  product={item.product}
                  quantity={item.quantity}
                  itemDiscount={itemDiscounts.get(item.product.id) ?? 0}
                  onInc={() => updateQty(item.product.id, item.quantity + 1)}
                  onDec={() => updateQty(item.product.id, item.quantity - 1)}
                  onRemove={() => {
                    removeItem(item.product.id)
                    setItemDiscount(item.product.id, 0)
                  }}
                  onSetDiscount={(d) => setItemDiscount(item.product.id, d)}
                />
              ))
            )
          )}

          {/* Show cart summary when in name-search mode and cart has items */}
          {showProductCards && items.length > 0 && (
            <button
              onClick={() => { setNameQuery(''); setNameResults([]) }}
              className="w-full flex items-center justify-between bg-blue-600 text-white rounded-2xl px-4 py-3 mt-1 active:bg-blue-700"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                <span className="font-bold">ตะกร้า ({totalQty} ชิ้น)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold tabular-nums">{formatThaiMoney(total)}</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          )}
        </div>
      </SunmiShell>

      {scannerOpen && (
        <BarcodeScannerDialog
          onScanned={(code) => { setScannerOpen(false); handleScan(code) }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          total={total}
          itemDiscounts={itemDiscounts}
          shiftId={currentShift?.id}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* UX-1: confirm dialog for large checkout (>= 5000 THB) */}
      <ConfirmActionDialog
        open={confirmLargeCheckoutOpen}
        onClose={() => setConfirmLargeCheckoutOpen(false)}
        onConfirm={() => { setConfirmLargeCheckoutOpen(false); setCheckoutOpen(true) }}
        buttonSize="lg"
        variant="warning"
        title="ยืนยันรายการขนาดใหญ่"
        description={`ยอดรวม ${formatThaiMoney(total)} — กรุณาตรวจสอบสินค้าในตะกร้าก่อนดำเนินการ`}
        confirmLabel="ดำเนินการชำระเงิน"
      />

      {receiptPreview && (
        <PrinterFlowSheet
          receiptHtml={buildReceiptHtml(receiptPreview)}
          jobName={`ใบเสร็จ #${receiptPreview.receiptNumber}`}
          previewData={buildReceiptPreviewData(receiptPreview)}
          onShare={async () => shareReceipt(receiptPreview)}
          onClose={() => {
            setReceiptPreview(null)
            setTimeout(() => inputRef.current?.focus(), 100)
          }}
          successNavItems={[
            { label: 'ขายต่อ',         href: '/sunmi/sales' },
            { label: 'ประวัติการขาย',   href: '/sunmi/sales/history' },
            { label: 'กลับหน้าหลัก',   href: '/sunmi' },
          ]}
        />
      )}
    </>
  )
}
