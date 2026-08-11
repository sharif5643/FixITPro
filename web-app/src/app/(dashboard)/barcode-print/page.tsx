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

// react-barcode and qrcode.react use browser APIs — load client-side only
const Barcode = dynamic(() => import('react-barcode'), { ssr: false })
const QRCode = dynamic(() => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })), { ssr: false })

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

type LabelSize = '20x10' | '40x20' | '40x30' | '50x30' | '58x30' | '60x40' | '80x50' | '100x200'

const LABEL_SIZE_CONFIG: Record<LabelSize, { label: string; widthPx: number; heightPx: number; widthMm: number; heightMm: number }> = {
  '20x10':   { label: '20×10 มม. (สติ๊กเกอร์เล็ก)',    widthPx: 227, heightPx: 114, widthMm: 20,  heightMm: 10  },
  '40x20':   { label: '40×20 มม.',                    widthPx: 151, heightPx: 76,  widthMm: 40,  heightMm: 20  },
  '40x30':   { label: '40×30 มม. (Niimbot B1)',        widthPx: 151, heightPx: 113, widthMm: 40,  heightMm: 30  },
  '50x30':   { label: '50×30 มม. (Niimbot B1)',        widthPx: 189, heightPx: 113, widthMm: 50,  heightMm: 30  },
  '58x30':   { label: '58×30 มม.',                    widthPx: 219, heightPx: 113, widthMm: 58,  heightMm: 30  },
  '60x40':   { label: '60×40 มม. (Niimbot B1)',        widthPx: 227, heightPx: 151, widthMm: 60,  heightMm: 40  },
  '80x50':   { label: '80×50 มม.',                    widthPx: 302, heightPx: 189, widthMm: 80,  heightMm: 50  },
  '100x200': { label: '10×20 ซม. (การ์ดสินค้า)',       widthPx: 378, heightPx: 756, widthMm: 100, heightMm: 200 },
}

type CardCodeType = 'barcode' | 'qr' | 'both'

// Per-size typographic + spacing constants
const SP: Record<LabelSize, { pad: number; nameFs: number; priceFs: number; bcFs: number; bcW: number; maxBcW: number; skuFs: number; gap: number; baseH: number }> = {
  '20x10':   { pad: 4,  nameFs: 9,  priceFs: 9,  bcFs: 7,  bcW: 1.4, maxBcW: 2.5, skuFs: 0,  gap: 2, baseH: 38 },
  '40x20':   { pad: 2,  nameFs: 7,  priceFs: 8,  bcFs: 6,  bcW: 0.8, maxBcW: 1.5, skuFs: 5,  gap: 1, baseH: 18 },
  '40x30':   { pad: 4,  nameFs: 9,  priceFs: 10, bcFs: 7,  bcW: 1.0, maxBcW: 2.0, skuFs: 6,  gap: 2, baseH: 28 },
  '50x30':   { pad: 4,  nameFs: 9,  priceFs: 10, bcFs: 7,  bcW: 1.0, maxBcW: 2.5, skuFs: 6,  gap: 2, baseH: 28 },
  '58x30':   { pad: 4,  nameFs: 9,  priceFs: 10, bcFs: 7,  bcW: 1.0, maxBcW: 2.8, skuFs: 6,  gap: 2, baseH: 28 },
  '60x40':   { pad: 6,  nameFs: 11, priceFs: 13, bcFs: 8,  bcW: 1.5, maxBcW: 3.0, skuFs: 8,  gap: 3, baseH: 38 },
  '80x50':   { pad: 6,  nameFs: 11, priceFs: 13, bcFs: 8,  bcW: 1.5, maxBcW: 3.5, skuFs: 8,  gap: 3, baseH: 38 },
  '100x200': { pad: 14, nameFs: 18, priceFs: 24, bcFs: 11, bcW: 2.2, maxBcW: 4.0, skuFs: 10, gap: 8, baseH: 72 },
}

// Compute dynamic barcode bar-height and bar-width based on what text is shown
function calcBc(size: LabelSize, heightPx: number, showName: boolean, showPrice: boolean) {
  const p = SP[size]
  const LH = 1.35
  let textH = (p.skuFs > 0 ? p.skuFs * LH : 0)
  let gaps  = (p.skuFs > 0 ? 1 : 0)
  if (showName)  { textH += p.nameFs  * LH; gaps++ }
  if (showPrice) { textH += p.priceFs * LH; gaps++ }
  const bcH = Math.max(8, heightPx - 2 * p.pad - textH - gaps * p.gap - p.bcFs * LH)
  const ratio = bcH / p.baseH
  const bcW = Math.min(p.maxBcW, +(p.bcW * Math.sqrt(ratio)).toFixed(1))
  return { bcH: Math.round(bcH), bcW }
}

function ProductLabel({
  product, size, cardCodeType = 'both', showName = true, showPrice = true,
}: {
  product: Product; size: LabelSize; cardCodeType?: CardCodeType; showName?: boolean; showPrice?: boolean
}) {
  const cfg = LABEL_SIZE_CONFIG[size]
  const p   = SP[size]
  const barcodeValue = product.barcode || product.sku
  const isCard = size === '100x200'

  if (isCard) {
    const showBarcode = cardCodeType === 'barcode' || cardCodeType === 'both'
    const showQR      = cardCodeType === 'qr'      || cardCodeType === 'both'
    const soloBarcode = cardCodeType === 'barcode'
    const soloQR      = cardCodeType === 'qr'
    return (
      <div
        className="label-item border border-dashed border-slate-300 dark:border-slate-600/60 flex flex-col items-center overflow-hidden bg-white dark:bg-[#1E293B]"
        style={{ width: cfg.widthPx, height: cfg.heightPx, padding: p.pad, gap: p.gap, justifyContent: 'center' }}
      >
        {showName && (
          <p className="font-bold text-center leading-snug text-slate-900 dark:text-white w-full" style={{ fontSize: p.nameFs }}>
            {product.name}
          </p>
        )}
        {showPrice && (
          <p className="font-bold text-slate-900 dark:text-white tabular-nums" style={{ fontSize: p.priceFs }}>
            {formatThaiMoney(Number(product.price))}
          </p>
        )}
        {showBarcode && (
          <div className="flex-shrink-0">
            <Barcode value={barcodeValue} width={soloBarcode ? 2.8 : p.bcW} height={soloBarcode ? 110 : p.baseH} fontSize={p.bcFs} margin={0} displayValue />
          </div>
        )}
        {showQR && (
          <div className="flex-shrink-0">
            <QRCode value={barcodeValue} size={soloQR ? 170 : 110} level="M" />
          </div>
        )}
        <p className="text-slate-500 dark:text-slate-400 font-mono text-center" style={{ fontSize: p.skuFs }}>
          SKU: {product.sku}
        </p>
      </div>
    )
  }

  // Standard label: QR-only mode (only for 20x10 with code type selector)
  if (size === '20x10' && cardCodeType === 'qr') {
    return (
      <div
        className="label-item border border-dashed border-slate-300 dark:border-slate-600/60 flex flex-col items-center justify-center overflow-hidden bg-white dark:bg-[#1E293B]"
        style={{ width: cfg.widthPx, height: cfg.heightPx, padding: p.pad, gap: p.gap }}
      >
        <QRCode value={barcodeValue} size={70} level="M" />
        <p className="font-mono text-slate-500 dark:text-slate-400 text-center" style={{ fontSize: 7 }}>{barcodeValue}</p>
      </div>
    )
  }

  // Standard label: barcode (all sizes, with dynamic height/width)
  const { bcH, bcW } = calcBc(size, cfg.heightPx, showName, showPrice)
  return (
    <div
      className="label-item border border-dashed border-slate-300 dark:border-slate-600/60 flex flex-col items-center justify-center overflow-hidden bg-white dark:bg-[#1E293B]"
      style={{ width: cfg.widthPx, height: cfg.heightPx, padding: p.pad, gap: p.gap }}
    >
      {showName && (
        <p className="font-bold text-center leading-tight text-slate-900 dark:text-white w-full truncate" style={{ fontSize: p.nameFs }}>
          {product.name}
        </p>
      )}
      {showPrice && (
        <p className="font-bold text-slate-900 dark:text-white tabular-nums" style={{ fontSize: p.priceFs }}>
          {formatThaiMoney(Number(product.price))}
        </p>
      )}
      <Barcode value={barcodeValue} width={bcW} height={bcH} fontSize={p.bcFs} margin={0} displayValue />
      {p.skuFs > 0 && (
        <p className="text-slate-500 dark:text-slate-400 font-mono" style={{ fontSize: p.skuFs }}>
          {product.sku}
        </p>
      )}
    </div>
  )
}

export default function BarcodePrintPage() {
  const [search, setSearch]     = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [items, setItems]       = useState<LabelItem[]>([])
  const [labelSize, setLabelSize] = useState<LabelSize>('40x30')
  const [printMode, setPrintMode] = useState<'label' | 'sheet'>('label')
  const [cardCodeType, setCardCodeType] = useState<CardCodeType>('both')
  const [showName,  setShowName]  = useState(true)
  const [showPrice, setShowPrice] = useState(true)
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
    const cfg = LABEL_SIZE_CONFIG[labelSize]
    const printArea = document.querySelector('.print-area')
    if (!printArea) return

    const pad = cfg.widthMm <= 40 ? 2 : labelSize === '100x200' ? 14 : 4
    const isCardSize = labelSize === '100x200'

    if (printMode === 'label' && !isCardSize) {
      // ── Label printer (Niimbot, thermal) ──────────────────────────────────────
      // Isolated popup: @page size = label size, one label per page
      const w = window.open('', '_blank', 'width=300,height=200,menubar=no,toolbar=no,scrollbars=no')
      if (!w) { window.print(); return }
      w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${cfg.widthMm}mm ${cfg.heightMm}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: white; }
  .label-item {
    width: ${cfg.widthMm}mm !important; height: ${cfg.heightMm}mm !important;
    page-break-after: always; break-after: page;
    display: flex !important; flex-direction: column;
    align-items: center; justify-content: center;
    overflow: hidden; background: white; padding: ${pad}px; border: none !important;
  }
  .label-item:last-child { page-break-after: avoid; break-after: avoid; }
  p { font-family: Arial, sans-serif; text-align: center; font-weight: bold; width: 100%; overflow: hidden; }
</style></head><body>${printArea.innerHTML}</body></html>`)
      w.document.close()
      setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 500) }, 600)

    } else {
      // ── A4 / sticker sheet (and card size 100x200) ────────────────────────────
      // For card size: 2 cards per A4 page (portrait); otherwise tile
      const cardGap = isCardSize ? '10mm' : '3mm'
      const pageMargin = isCardSize ? '10mm' : '6mm'
      const w = window.open('', '_blank', 'width=800,height=600,menubar=no,toolbar=no,scrollbars=no')
      if (!w) { window.print(); return }
      w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: ${pageMargin}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: white; }
  .print-area {
    display: flex; flex-wrap: wrap; gap: ${cardGap}; align-content: flex-start;
    justify-content: ${isCardSize ? 'center' : 'flex-start'};
  }
  .label-item {
    width: ${cfg.widthMm}mm !important; height: ${cfg.heightMm}mm !important;
    display: flex !important; flex-direction: column;
    align-items: center; ${isCardSize ? 'justify-content: flex-start;' : 'justify-content: center;'}
    overflow: hidden; background: white; padding: ${pad}px;
    border: ${isCardSize ? '0.5px solid #999' : '0.5px dashed #999'};
    ${isCardSize ? 'border-radius: 4px;' : ''}
    gap: ${isCardSize ? '6px' : '0'};
  }
  p { font-family: Arial, sans-serif; text-align: center; font-weight: bold; width: 100%; overflow: hidden; }
</style></head><body><div class="print-area">${printArea.innerHTML}</div></body></html>`)
      w.document.close()
      setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 500) }, 600)
    }
  }

  return (
    <>
      {/* Print-only style
          ไม่ใส่ @page size เพราะ Niimbot B1 driver ใน Windows มีขนาดกระดาษตั้งเองอยู่แล้ว
          ถ้าใส่ size CSS จะขัดกับ driver ทำให้ label ขึ้นเล็กมุมหน้า
          ให้ label ยืดเต็มหน้า (100%) ตาม paper ที่ driver กำหนดแทน             */}
      <style jsx global>{`
        @media print {
          @page { margin: 0; }
          .no-print { display: none !important; }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-area {
            display: block !important;
            margin: 0;
            padding: 0;
          }
          .label-item {
            width: 100% !important;
            height: 100vh !important;
            border: none !important;
            page-break-after: always;
            break-after: page;
            margin: 0;
            box-sizing: border-box;
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .label-item:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
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
              {labelSize === '100x200' ? (
                <p className="text-xs text-muted-foreground">
                  📄 พิมพ์บน <strong>กระดาษ A4</strong> — ได้ 2 การ์ดต่อหน้า (100×200 มม.)
                </p>
              ) : labelSize === '20x10' ? (
                <p className="text-xs text-muted-foreground">
                  🏷️ สติ๊กเกอร์ thermal 20×10 มม. — ตั้งขนาดกระดาษใน driver ให้ตรง
                </p>
              ) : printMode === 'label' ? (
                <p className="text-xs text-muted-foreground">
                  ⚠️ เลือกขนาดให้ตรงกับ roll ใน Niimbot แล้วกด พิมพ์ → เลือก <strong>NIIMBOT B1</strong>
                </p>
              ) : null}
            </div>

            {/* Code type — card and tiny label */}
            {(labelSize === '100x200' || labelSize === '20x10') && (
              <div className="space-y-1.5">
                <Label>ประเภท Code</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'barcode', label: '▌▌▌ Barcode', sub: 'สแกนด้วยเครื่อง' },
                    { value: 'qr',      label: '⬛ QR Code',   sub: 'สแกนด้วยมือถือ' },
                    { value: 'both',    label: 'ทั้งสองอย่าง', sub: 'Barcode + QR'    },
                  ] as const).map(({ value, label, sub }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCardCodeType(value)}
                      className={`rounded-lg border px-2 py-2.5 text-sm font-medium text-left transition-colors ${
                        cardCodeType === value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="font-semibold text-xs">{label}</div>
                      <div className="text-xs mt-0.5 opacity-75">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Show/hide fields */}
            <div className="space-y-1.5">
              <Label>แสดงบน Label</Label>
              <div className="flex gap-2">
                {([
                  { key: 'name',  label: 'ชื่อสินค้า', val: showName,  set: setShowName  },
                  { key: 'price', label: 'ราคา',       val: showPrice, set: setShowPrice },
                ] as const).map(({ key, label, val, set }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set(!val)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      val
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500 line-through'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!showName && !showPrice && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  ✓ Barcode จะขยายเต็มพื้นที่อัตโนมัติ
                </p>
              )}
            </div>

            {/* Print mode */}
            <div className="space-y-1.5">
              <Label>โหมดพิมพ์</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrintMode('label')}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                    printMode === 'label'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-semibold">🏷️ Label Printer</div>
                  <div className="text-xs mt-0.5 opacity-75">Niimbot, Dymo, Brother QL</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('sheet')}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                    printMode === 'sheet'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-semibold">📄 กระดาษ A4</div>
                  <div className="text-xs mt-0.5 opacity-75">สติ๊กเกอร์แผ่น, กระดาษทั่วไป</div>
                </button>
              </div>
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
                    <ProductLabel key={`${product.id}-${idx}`} product={product} size={labelSize} cardCodeType={cardCodeType} showName={showName} showPrice={showPrice} />
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
          <ProductLabel key={`print-${product.id}-${idx}`} product={product} size={labelSize} cardCodeType={cardCodeType} showName={showName} showPrice={showPrice} />
        ))}
      </div>
    </>
  )
}
