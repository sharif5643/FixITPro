'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Search, Printer, Plus, Minus, X, Barcode as BarcodeIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { Product } from '@/types'

// react-barcode uses browser APIs — load client-side only
const Barcode = dynamic(() => import('react-barcode'), { ssr: false })

// Simple debounce hook
function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

interface LabelItem {
  product: Product
  quantity: number
}

type LabelSize = '40x20' | '58x30' | '80x50'

const LABEL_SIZE_CONFIG: Record<LabelSize, { label: string; widthPx: number; heightPx: number; widthMm: number; heightMm: number }> = {
  '40x20': { label: '40×20 มม. (เล็ก)',  widthPx: 151, heightPx: 76,  widthMm: 40, heightMm: 20 },
  '58x30': { label: '58×30 มม. (กลาง)', widthPx: 219, heightPx: 113, widthMm: 58, heightMm: 30 },
  '80x50': { label: '80×50 มม. (ใหญ่)', widthPx: 302, heightPx: 189, widthMm: 80, heightMm: 50 },
}

function ProductLabel({ product, size }: { product: Product; size: LabelSize }) {
  const cfg = LABEL_SIZE_CONFIG[size]
  const barcodeValue = product.barcode || product.sku

  const isSmall  = size === '40x20'
  const isMedium = size === '58x30'

  return (
    <div
      className="label-item border border-dashed border-slate-300 dark:border-slate-600/60 flex flex-col items-center justify-center overflow-hidden bg-white dark:bg-[#1E293B]"
      style={{ width: cfg.widthPx, height: cfg.heightPx, padding: isSmall ? 2 : isMedium ? 4 : 6 }}
    >
      <p
        className="font-bold text-center leading-tight text-slate-900 dark:text-white w-full truncate"
        style={{ fontSize: isSmall ? 7 : isMedium ? 9 : 11 }}
      >
        {product.name}
      </p>
      <p
        className="font-bold text-slate-900 dark:text-white tabular-nums"
        style={{ fontSize: isSmall ? 8 : isMedium ? 10 : 13 }}
      >
        {formatThaiMoney(Number(product.price))}
      </p>
      <Barcode
        value={barcodeValue}
        width={isSmall ? 0.8 : isMedium ? 1 : 1.5}
        height={isSmall ? 18 : isMedium ? 28 : 38}
        fontSize={isSmall ? 6 : isMedium ? 7 : 8}
        margin={0}
        displayValue={true}
      />
      <p
        className="text-slate-500 dark:text-slate-400 font-mono"
        style={{ fontSize: isSmall ? 5 : isMedium ? 6 : 8 }}
      >
        {product.sku}
      </p>
    </div>
  )
}

export default function BarcodePrintPage() {
  const [search, setSearch]     = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [items, setItems]       = useState<LabelItem[]>([])
  const [labelSize, setLabelSize] = useState<LabelSize>('58x30')
  const searchRef               = useRef<HTMLDivElement>(null)
  const debouncedSearch         = useDebounce(search, 300)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', 'search', debouncedSearch],
    queryFn: async () => (await api.get('/products', { params: { search: debouncedSearch } })).data,
    enabled: searchOpen && debouncedSearch.length >= 1,
    staleTime: 10_000,
  })

  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { product, quantity: 1 }]
    })
    setSearch('')
    setSearchOpen(false)
  }

  function setQty(productId: string, qty: number) {
    if (qty < 1) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId))
    } else {
      setItems((prev) => prev.map((i) => i.product.id === productId ? { ...i, quantity: qty } : i))
    }
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.product.id !== productId))
  }

  // Expand items into flat label array
  const allLabels = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => item.product),
  )

  function handlePrint() {
    window.print()
  }

  return (
    <>
      {/* Print-only style injected globally */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .print-area {
            display: flex !important;
            flex-wrap: wrap;
            gap: 4px;
            padding: 4mm;
          }
          .label-item { border: 1px solid #999 !important; }
          body { background: white !important; }
        }
        @media screen {
          .print-area { display: none; }
        }
      `}</style>

      <div className="space-y-5 no-print">
        <PageHeader
          title="พิมพ์ Barcode"
          icon={Printer}
          subtitle="เลือกสินค้าและพิมพ์ label"
          primaryAction={
            <Button onClick={handlePrint} disabled={allLabels.length === 0} className="gap-2 shrink-0">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">พิมพ์ ({allLabels.length} ดวง)</span>
              <span className="sm:hidden">พิมพ์</span>
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: controls */}
          <div className="space-y-5">
            {/* Search */}
            <div className="space-y-2">
              <Label>ค้นหาสินค้า</Label>
              <div ref={searchRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="พิมพ์ชื่อสินค้า, SKU, Barcode..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }}
                  onFocus={() => setSearchOpen(true)}
                  className="pl-9"
                />
                {searchOpen && debouncedSearch.length >= 1 && (
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded-lg shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] max-h-56 overflow-y-auto">
                    {products.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground text-center">ไม่พบสินค้า</div>
                    ) : (
                      products.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-slate-100 dark:border-slate-700/40 last:border-0"
                          onClick={() => addProduct(p)}
                        >
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {p.sku} · {p.barcode ?? 'ไม่มี barcode'}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Label size */}
            <div className="space-y-1.5">
              <Label>ขนาด Label</Label>
              <Select value={labelSize} onValueChange={(v) => setLabelSize(v as LabelSize)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LABEL_SIZE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item list */}
            <div className="space-y-2">
              <Label>รายการสินค้า</Label>
              {items.length === 0 ? (
                <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center h-28 gap-2 text-slate-400 dark:text-slate-500">
                  <BarcodeIcon className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm">ยังไม่ได้เลือกสินค้า</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map(({ product, quantity }) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setQty(product.id, quantity - 1)}
                          className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700/60 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-600 dark:text-slate-400"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-semibold w-8 text-center tabular-nums">{quantity}</span>
                        <button
                          onClick={() => setQty(product.id, quantity + 1)}
                          className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700/60 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-600 dark:text-slate-400"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeItem(product.id)}
                          className="ml-1 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground text-right">รวม {allLabels.length} ดวง</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: preview */}
          <div className="space-y-2">
            <Label>ตัวอย่าง (Preview)</Label>
            {allLabels.length === 0 ? (
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center h-48 gap-2 text-slate-400 dark:text-slate-500">
                <p className="text-sm">เลือกสินค้าเพื่อดูตัวอย่าง</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-4 overflow-auto max-h-[60vh]">
                <div className="flex flex-wrap gap-2">
                  {allLabels.map((product, idx) => (
                    <ProductLabel key={`${product.id}-${idx}`} product={product} size={labelSize} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print area (hidden on screen, shown on print) */}
      <div className="print-area">
        {allLabels.map((product, idx) => (
          <ProductLabel key={`print-${product.id}-${idx}`} product={product} size={labelSize} />
        ))}
      </div>
    </>
  )
}
