'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ScanBarcode, Camera, Plus, Minus, CheckCircle2, AlertTriangle,
  ChevronRight, X, Edit2, History, ChevronDown, ChevronUp,
  Wand2, Package, ArrowUp, ArrowDown, RotateCcw, Barcode,
  ShoppingCart, Wrench,
} from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { BarcodeScannerDialog } from '@/components/sunmi/barcode-scanner-dialog'
import { nativeScan } from '@/lib/native-barcode-scanner'
import { Platform } from '@/lib/platform'
import { pushBackHandler } from '@/lib/back-stack'
import { formatThaiMoney, cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Product, Category } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const CLS = {
  input:      'w-full h-12 px-4 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-purple-500',
  btnPrimary: 'h-12 w-full rounded-2xl bg-purple-600 text-white font-bold active:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2',
  btnGreen:   'h-12 w-full rounded-2xl bg-green-600 text-white font-bold active:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2',
  btnRed:     'h-12 w-full rounded-2xl bg-red-500 text-white font-bold active:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2',
  btnOutline: 'h-12 w-full rounded-2xl border-2 border-slate-200 text-slate-600 font-medium active:bg-slate-50 flex items-center justify-center gap-2',
  card:       'bg-white rounded-2xl p-4',
  label:      'block text-xs text-slate-500 mb-1 font-medium',
}

const TYPE_LABEL: Record<string, string> = {
  PHONE: 'มือถือ', SIM: 'ซิม', ACCESSORY: 'อุปกรณ์เสริม', PART: 'อะไหล่',
}
const TYPE_CLS: Record<string, string> = {
  PHONE:     'bg-blue-100 text-blue-700',
  SIM:       'bg-green-100 text-green-700',
  ACCESSORY: 'bg-purple-100 text-purple-700',
  PART:      'bg-orange-100 text-orange-700',
}

// ── Types ──────────────────────────────────────────────────────────────────────

type BranchLowStockItem = {
  id:         string   // == productId, used for detail navigation
  productId:  string
  name:       string
  sku:        string
  stock:      number   // branch-specific quantity
  minStock:   number
  branchId:   string
  branchName: string
  stockCode:  string | null
  severity:   'OUT_OF_STOCK' | 'LOW_STOCK'
}

type StockMovement = {
  id: string
  type: 'IN' | 'OUT' | 'ADJUST' | 'SALE' | 'REPAIR_USE'
  quantity: number
  note?: string | null
  createdAt: string
}

type Screen =
  | { id: 'home' }
  | { id: 'browse' }
  | { id: 'detail';     product: Product }
  | { id: 'adjust';     product: Product; mode: 'IN' | 'OUT' }
  | { id: 'form';       product?: Product; prefillBarcode?: string }
  | { id: 'not-found';  barcode: string }
  | { id: 'created';    product: Product }

// ── Schemas ────────────────────────────────────────────────────────────────────

const adjustSchema = z.object({
  qty:  z.coerce.number().min(1, 'กรุณากรอกจำนวน'),
  note: z.string().optional(),
})
type AdjustData = z.infer<typeof adjustSchema>

const productFormSchema = z.object({
  name:        z.string().min(1, 'กรุณากรอกชื่อสินค้า'),
  sku:         z.string().min(1, 'กรุณากรอก SKU'),
  barcode:     z.string().optional(),
  type:        z.enum(['PHONE', 'SIM', 'ACCESSORY', 'PART']),
  categoryId:  z.string().optional(),
  price:       z.coerce.number().min(0),
  costPrice:   z.coerce.number().min(0).default(0),
  stock:       z.coerce.number().min(0).default(0),
  minStock:    z.coerce.number().min(0).default(0),
  description: z.string().optional(),
})
type ProductFormData = z.infer<typeof productFormSchema>

// ── Small helpers ──────────────────────────────────────────────────────────────

function Spin({ sm }: { sm?: boolean }) {
  return (
    <span className={cn(
      'animate-spin rounded-full border-[3px] border-white border-t-transparent inline-block',
      sm ? 'h-4 w-4' : 'h-5 w-5',
    )} />
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', TYPE_CLS[type] ?? 'bg-slate-100 text-slate-600')}>
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

// ── Movement History ───────────────────────────────────────────────────────────

function MovementHistory({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false)

  const { data = [], isLoading } = useQuery<StockMovement[]>({
    queryKey: ['stock-movements', productId],
    queryFn:  async () => (await api.get(`/stock/movements/${productId}`)).data,
    enabled:  open,
    staleTime: 30_000,
  })

  return (
    <div className={CLS.card + ' space-y-3'}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <History className="h-4 w-4 text-slate-400" />
          ประวัติการเคลื่อนไหว
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="space-y-1.5">
          {isLoading && (
            <div className="flex justify-center py-4">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-purple-500" />
            </div>
          )}
          {!isLoading && data.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-3">ยังไม่มีประวัติ</p>
          )}
          {data.map((m) => {
            const cfg = {
              IN:         { bg: 'bg-green-100',  icon: <ArrowUp      className="h-4 w-4 text-green-600"  />, color: 'text-green-700',  sign: '+',  label: 'รับเข้า'  },
              OUT:        { bg: 'bg-red-100',    icon: <ArrowDown    className="h-4 w-4 text-red-600"    />, color: 'text-red-600',   sign: '-',  label: 'ตัดออก'   },
              ADJUST:     { bg: 'bg-purple-100', icon: <RotateCcw    className="h-4 w-4 text-purple-600" />, color: 'text-purple-700', sign: '±',  label: 'ปรับ'     },
              SALE:       { bg: 'bg-blue-100',   icon: <ShoppingCart className="h-4 w-4 text-blue-600"   />, color: 'text-blue-600',   sign: '-',  label: 'ขายออก'  },
              REPAIR_USE: { bg: 'bg-orange-100', icon: <Wrench       className="h-4 w-4 text-orange-600" />, color: 'text-orange-600', sign: '-',  label: 'ใช้ซ่อม' },
            }[m.type] ?? { bg: 'bg-slate-100', icon: <RotateCcw className="h-4 w-4 text-slate-500" />, color: 'text-slate-600', sign: '±', label: m.type }
            return (
              <div key={m.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', cfg.bg)}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-bold', cfg.color)}>
                    {cfg.sign}{m.quantity} ชิ้น
                    <span className="ml-1.5 text-xs font-normal text-slate-400">{cfg.label}</span>
                  </p>
                  {m.note && <p className="text-xs text-slate-400 truncate">{m.note}</p>}
                </div>
                <p className="text-xs text-slate-400 shrink-0 text-right">
                  {new Date(m.createdAt).toLocaleDateString('th-TH', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Compact product card (browse list) ────────────────────────────────────────

function ProductMiniCard({ product, onTap }: { product: Product; onTap: () => void }) {
  const isOut = product.stock <= 0
  const isLow = !isOut && product.stock <= product.minStock

  return (
    <button
      onClick={onTap}
      className="w-full bg-white rounded-2xl p-3 text-left active:scale-[0.98] transition-transform flex items-center gap-3 shadow-sm border border-slate-100"
    >
      <div className={cn(
        'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
        isOut ? 'bg-red-100' : isLow ? 'bg-amber-100' : 'bg-slate-100',
      )}>
        <Package className={cn('h-5 w-5', isOut ? 'text-red-400' : isLow ? 'text-amber-500' : 'text-slate-400')} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 truncate text-sm leading-snug">{product.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <TypeBadge type={product.type} />
          {product.category && (
            <span className="text-xs text-slate-400 truncate">{product.category.name}</span>
          )}
          {isOut && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">หมด</span>}
          {isLow && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">ต่ำ</span>}
        </div>
      </div>

      <div className="text-right shrink-0 ml-1">
        <p className={cn('text-xl font-bold', isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-800')}>
          {product.stock}
        </p>
        <p className="text-xs text-slate-400">{formatThaiMoney(Number(product.price))}</p>
      </div>

      <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
    </button>
  )
}

// ── Product detail info card ──────────────────────────────────────────────────

function ProductDetailCard({ product }: { product: Product }) {
  const isOut = product.stock <= 0
  const isLow = !isOut && product.stock <= product.minStock

  return (
    <div className="space-y-3">
      {/* Info block */}
      <div className={CLS.card + ' space-y-2.5'}>
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={product.type} />
          {product.category && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {product.category.name}
            </span>
          )}
          {isOut && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">หมด</span>}
          {isLow && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">สต็อกต่ำ</span>}
        </div>

        <p className="font-bold text-slate-900 text-lg leading-snug">{product.name}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-xl p-2.5">
            <p className="text-xs text-slate-400">SKU</p>
            <p className="font-mono text-sm font-semibold text-slate-800 mt-0.5 break-all">{product.sku}</p>
          </div>
          {product.barcode ? (
            <div className="bg-slate-50 rounded-xl p-2.5">
              <p className="text-xs text-slate-400">บาร์โค้ด</p>
              <p className="font-mono text-sm font-semibold text-slate-800 mt-0.5 break-all">{product.barcode}</p>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-2.5 opacity-40">
              <p className="text-xs text-slate-400">บาร์โค้ด</p>
              <p className="text-sm text-slate-400 mt-0.5">—</p>
            </div>
          )}
        </div>

        {product.description && (
          <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-2.5">{product.description}</p>
        )}
      </div>

      {/* Stock level */}
      <div className={cn(
        'rounded-2xl p-4 flex items-center justify-between',
        isOut ? 'bg-red-50 border border-red-200'
              : isLow ? 'bg-amber-50 border border-amber-200'
              : 'bg-green-50 border border-green-200',
      )}>
        <div>
          <p className="text-sm font-semibold text-slate-700">สต็อกปัจจุบัน</p>
          <p className="text-xs text-slate-500 mt-0.5">ขั้นต่ำ {product.minStock} ชิ้น</p>
        </div>
        <p className={cn(
          'text-5xl font-bold',
          isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-700',
        )}>
          {product.stock}
        </p>
      </div>

      {/* Prices */}
      <div className={CLS.card}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-400">ราคาขาย</p>
            <p className="font-bold text-slate-900 text-xl mt-0.5">{formatThaiMoney(Number(product.price))}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">ต้นทุน</p>
            <p className="font-semibold text-slate-600 text-xl mt-0.5">{formatThaiMoney(Number(product.costPrice))}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Adjust form screen ────────────────────────────────────────────────────────

interface AdjustScreenProps {
  product: Product
  mode: 'IN' | 'OUT'
  onSuccess: (updated: Product) => void
  onCancel:  () => void
}

function AdjustScreen({ product, mode, onSuccess, onCancel }: AdjustScreenProps) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<AdjustData>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { qty: 1 },
  })

  const qty      = Number(watch('qty')) || 0
  const newStock = mode === 'IN' ? product.stock + qty : Math.max(0, product.stock - qty)

  const mutation = useMutation({
    mutationFn: (data: AdjustData) =>
      api.post('/stock/adjust', {
        productId: product.id,
        type:      mode,
        quantity:  data.qty,
        note:      data.note?.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success(mode === 'IN' ? 'รับสต็อกเข้าสำเร็จ' : 'ตัดสต็อกออกสำเร็จ')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-low'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements', product.id] })
      try {
        const res = await api.get(`/products/${product.id}`)
        onSuccess(res.data as Product)
      } catch {
        onSuccess({ ...product, stock: newStock })
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  return (
    <SunmiShell
      title={mode === 'IN' ? 'รับสต็อกเข้า' : 'ตัดสต็อกออก'}
      onBack={onCancel}
    >
      <div className="p-4 space-y-4 pb-8">
        {/* Product summary */}
        <div className={cn(CLS.card, 'flex items-center justify-between gap-3')}>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 truncate">{product.name}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{product.sku}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-400">สต็อกปัจจุบัน</p>
            <p className="text-3xl font-bold text-slate-800">{product.stock}</p>
          </div>
        </div>

        {/* Qty input */}
        <div className={CLS.card + ' space-y-3'}>
          <p className="font-semibold text-slate-700">
            {mode === 'IN' ? 'จำนวนที่รับเข้า' : 'จำนวนที่ตัดออก'}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setValue('qty', Math.max(1, qty - 1))}
              className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center active:bg-slate-200 shrink-0"
            >
              <Minus className="h-6 w-6" />
            </button>
            <input
              {...register('qty')}
              type="number"
              inputMode="numeric"
              min="1"
              className="flex-1 h-14 border border-slate-200 rounded-xl text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setValue('qty', qty + 1)}
              className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center active:bg-slate-200 shrink-0"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {errors.qty && <p className="text-xs text-red-500">{errors.qty.message}</p>}

          {/* Preview */}
          {qty > 0 && (
            <div className={cn(
              'rounded-xl p-3 text-center',
              mode === 'IN' ? 'bg-green-50' : 'bg-red-50',
            )}>
              <p className="text-sm text-slate-500">
                {product.stock}
                <span className={cn('mx-2 font-bold text-base', mode === 'IN' ? 'text-green-600' : 'text-red-500')}>
                  {mode === 'IN' ? `+${qty}` : `−${qty}`}
                </span>
                =
                <span className="ml-2 font-bold text-slate-800 text-lg"> {newStock} ชิ้น</span>
              </p>
            </div>
          )}
        </div>

        {/* Reason */}
        <div className={CLS.card + ' space-y-2'}>
          <label className={CLS.label}>สาเหตุ / หมายเหตุ (ไม่บังคับ)</label>
          <input
            {...register('note')}
            placeholder="เช่น รับของจากซัพพลายเออร์, ของหาย, ตรวจนับ..."
            className={CLS.input}
          />
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className={CLS.btnOutline}>ยกเลิก</button>
          <button
            onClick={handleSubmit((d) => mutation.mutate(d))}
            disabled={mutation.isPending || qty < 1}
            className={mode === 'IN' ? CLS.btnGreen : CLS.btnRed}
          >
            {mutation.isPending ? <Spin /> : mode === 'IN' ? 'รับเข้า' : 'ตัดออก'}
          </button>
        </div>
      </div>
    </SunmiShell>
  )
}

// ── Product form screen (create / edit) ───────────────────────────────────────

interface ProductFormScreenProps {
  product?:         Product
  prefillBarcode?:  string
  onSuccess:        (p: Product) => void
  onCancel:         () => void
}

function ProductFormScreen({ product, prefillBarcode, onSuccess, onCancel }: ProductFormScreenProps) {
  const isEditing  = !!product
  const queryClient = useQueryClient()

  const [skuLoading,     setSkuLoading]     = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? {
      name:        product.name,
      sku:         product.sku,
      barcode:     product.barcode ?? '',
      type:        product.type,
      categoryId:  product.categoryId ?? '',
      price:       Number(product.price),
      costPrice:   Number(product.costPrice),
      stock:       product.stock,
      minStock:    product.minStock,
      description: product.description ?? '',
    } : {
      name: '', sku: '', barcode: prefillBarcode ?? '',
      type: 'ACCESSORY', categoryId: '', price: 0, costPrice: 0, stock: 0, minStock: 0, description: '',
    },
  })

  const selectedType = watch('type')

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn:  async () => (await api.get('/categories')).data,
    staleTime: 60_000,
  })

  async function genSku() {
    setSkuLoading(true)
    try {
      const res = await api.get('/products/generate-sku', { params: { type: selectedType } })
      setValue('sku', res.data.sku)
    } catch { toast.error('สร้าง SKU ไม่สำเร็จ') }
    finally { setSkuLoading(false) }
  }

  async function genBarcode() {
    setBarcodeLoading(true)
    try {
      const res = await api.get('/products/generate-barcode')
      setValue('barcode', res.data.barcode)
    } catch { toast.error('สร้าง Barcode ไม่สำเร็จ') }
    finally { setBarcodeLoading(false) }
  }

  const mutation = useMutation({
    mutationFn: (data: ProductFormData) => {
      const { stock, ...editableFields } = data
      const base = isEditing ? editableFields : data   // never send stock on edit
      const payload = {
        ...base,
        barcode:     base.barcode?.trim()     || undefined,
        categoryId:  base.categoryId          || undefined,
        description: base.description?.trim() || undefined,
      }
      return isEditing
        ? api.patch(`/products/${product!.id}`, payload)
        : api.post('/products', payload)
    },
    onSuccess: (res) => {
      toast.success(isEditing ? 'แก้ไขสินค้าสำเร็จ' : 'สร้างสินค้าสำเร็จ')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-low'] })
      if (isEditing) queryClient.invalidateQueries({ queryKey: ['product', product!.id] })
      onSuccess(res.data as Product)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  return (
    <SunmiShell title={isEditing ? 'แก้ไขสินค้า' : 'สร้างสินค้าใหม่'} onBack={onCancel}>
      <div className="p-4 space-y-3 pb-8">

        {/* Name */}
        <div>
          <label className={CLS.label}>ชื่อสินค้า *</label>
          <input {...register('name')} placeholder="ชื่อสินค้า" className={CLS.input} autoFocus />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        {/* Type + Category */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={CLS.label}>ประเภท *</label>
            <select {...register('type')} className={CLS.input}>
              <option value="PHONE">มือถือ</option>
              <option value="SIM">ซิม</option>
              <option value="ACCESSORY">อุปกรณ์เสริม</option>
              <option value="PART">อะไหล่</option>
            </select>
          </div>
          <div>
            <label className={CLS.label}>หมวดหมู่</label>
            <select {...register('categoryId')} className={CLS.input}>
              <option value="">— ไม่ระบุ —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* SKU */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={CLS.label + ' mb-0'}>SKU *</label>
            <button type="button" onClick={genSku} disabled={skuLoading}
              className="text-xs text-purple-600 flex items-center gap-1 disabled:opacity-50 active:opacity-70">
              {skuLoading
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                : <Wand2 className="h-3 w-3" />}
              สร้าง SKU
            </button>
          </div>
          <input {...register('sku')} placeholder="เช่น ACC-000001" className={CLS.input} />
          {errors.sku && <p className="text-xs text-red-500 mt-1">{errors.sku.message}</p>}
        </div>

        {/* Barcode */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={CLS.label + ' mb-0'}>บาร์โค้ด</label>
            <button type="button" onClick={genBarcode} disabled={barcodeLoading}
              className="text-xs text-purple-600 flex items-center gap-1 disabled:opacity-50 active:opacity-70">
              {barcodeLoading
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                : <Barcode className="h-3 w-3" />}
              สร้าง Barcode
            </button>
          </div>
          <input {...register('barcode')} placeholder="13 หลัก (ไม่บังคับ)" className={CLS.input} />
        </div>

        {/* Price + Cost */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={CLS.label}>ราคาขาย (บาท) *</label>
            <input {...register('price')} type="number" inputMode="numeric" min="0" placeholder="0" className={CLS.input} />
            {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
          </div>
          <div>
            <label className={CLS.label}>ต้นทุน (บาท)</label>
            <input {...register('costPrice')} type="number" inputMode="numeric" min="0" placeholder="0" className={CLS.input} />
          </div>
        </div>

        {/* Stock + MinStock */}
        <div className="grid grid-cols-2 gap-3">
          {!isEditing && (
            <div>
              <label className={CLS.label}>สต็อกเริ่มต้น</label>
              <input {...register('stock')} type="number" inputMode="numeric" min="0" placeholder="0" className={CLS.input} />
            </div>
          )}
          <div className={isEditing ? 'col-span-2' : ''}>
            <label className={CLS.label}>สต็อกขั้นต่ำ (แจ้งเตือน)</label>
            <input {...register('minStock')} type="number" inputMode="numeric" min="0" placeholder="0" className={CLS.input} />
          </div>
        </div>

        {/* Description / Brand / Model */}
        <div>
          <label className={CLS.label}>รายละเอียด / ยี่ห้อ / รุ่น</label>
          <input {...register('description')} placeholder="ยี่ห้อ, รุ่น หรือรายละเอียดเพิ่มเติม" className={CLS.input} />
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button type="button" onClick={onCancel} className={CLS.btnOutline}>ยกเลิก</button>
          <button
            onClick={handleSubmit((d) => mutation.mutate(d))}
            disabled={mutation.isPending}
            className={CLS.btnPrimary}
          >
            {mutation.isPending ? <Spin /> : isEditing ? 'บันทึก' : 'สร้างสินค้า'}
          </button>
        </div>
      </div>
    </SunmiShell>
  )
}

// ── Browse screen (all products) ──────────────────────────────────────────────

interface BrowseScreenProps {
  onSelectProduct: (p: Product) => void
  onNewProduct:    () => void
}

function BrowseScreen({ onSelectProduct, onNewProduct }: BrowseScreenProps) {
  const [search,          setSearch]          = useState('')
  const [type,            setType]            = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function handleSearchChange(v: string) {
    setSearch(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300)
  }

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', 'browse', debouncedSearch, type],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (type)            params.type   = type
      return (await api.get('/products', { params })).data
    },
    staleTime: 30_000,
  })

  const typeFilters = [
    { val: '',          label: 'ทั้งหมด' },
    { val: 'PHONE',     label: 'มือถือ' },
    { val: 'SIM',       label: 'ซิม' },
    { val: 'ACCESSORY', label: 'อุปกรณ์เสริม' },
    { val: 'PART',      label: 'อะไหล่' },
  ]

  return (
    <>
      {/* Sticky sub-header: filter + search */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
        {/* Type filter */}
        <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {typeFilters.map((f) => (
            <button
              key={f.val}
              onClick={() => setType(f.val)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0',
                type === f.val ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="px-3 pb-2 flex gap-2">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อ, SKU, บาร์โค้ด..."
              className="w-full h-9 pl-3 pr-8 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            {search && (
              <button onClick={() => handleSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>
          <button
            onClick={onNewProduct}
            className="h-9 w-9 rounded-xl bg-purple-600 text-white flex items-center justify-center active:bg-purple-700 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Product list */}
      <div className="px-3 pt-2 space-y-2 pb-6">
        {isLoading && (
          <div className="flex justify-center py-10">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-purple-500" />
          </div>
        )}
        {!isLoading && products.length === 0 && (
          <div className="flex flex-col items-center py-12 text-slate-400">
            <Package className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">ไม่พบสินค้า</p>
          </div>
        )}
        {products.map((p) => (
          <ProductMiniCard key={p.id} product={p} onTap={() => onSelectProduct(p)} />
        ))}
        {!isLoading && products.length > 0 && (
          <p className="text-xs text-slate-400 text-center pt-2">{products.length} รายการ</p>
        )}
      </div>
    </>
  )
}

// ── Low stock section (home) ──────────────────────────────────────────────────

function LowStockSection({ onSelect }: { onSelect: (p: Product) => void }) {
  const { data: list = [], isLoading } = useQuery<BranchLowStockItem[]>({
    queryKey: ['stock-low'],
    queryFn:  async () => (await api.get('/stock/low-stock')).data,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-16 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <p className="text-sm text-green-700 font-medium">สินค้าทุกรายการมีสต็อกเพียงพอ</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider px-1">
        สต็อกต่ำ / หมด ({list.length} รายการ)
      </p>
      {list.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item as unknown as Product)}
          className="w-full bg-white rounded-2xl p-4 text-left flex items-center gap-3 active:scale-[0.98] transition-transform border border-red-100 shadow-sm"
        >
          <AlertTriangle className={cn('h-5 w-5 shrink-0', item.severity === 'OUT_OF_STOCK' ? 'text-red-500' : 'text-amber-400')} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate text-sm">{item.name}</p>
            <p className={cn('text-xs mt-0.5', item.severity === 'OUT_OF_STOCK' ? 'text-red-500' : 'text-amber-600')}>
              {item.severity === 'OUT_OF_STOCK' ? 'สต็อกหมด' : `สต็อก ${item.stock}`} · ขั้นต่ำ {item.minStock}
            </p>
          </div>
          <span className={cn(
            'text-2xl font-bold shrink-0',
            item.severity === 'OUT_OF_STOCK' ? 'text-red-600' : 'text-amber-600',
          )}>
            {item.stock}
          </span>
          <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
        </button>
      ))}
    </div>
  )
}

// ── Detail view ───────────────────────────────────────────────────────────────

interface DetailViewProps {
  initial:       Product
  onAddStock:    (p: Product) => void
  onReduceStock: (p: Product) => void
  onEdit:        (p: Product) => void
}

function DetailView({ initial, onAddStock, onReduceStock, onEdit }: DetailViewProps) {
  // Keep fresh data via query; use initial as the placeholder
  const { data: product = initial } = useQuery<Product>({
    queryKey:    ['product', initial.id],
    queryFn:     async () => (await api.get(`/products/${initial.id}`)).data,
    initialData: initial,
    staleTime:   15_000,
  })

  return (
    <div className="p-4 space-y-3 pb-8">
      <ProductDetailCard product={product} />

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onAddStock(product)} className={CLS.btnGreen}>
          <Plus className="h-5 w-5" />
          รับสต็อกเข้า
        </button>
        <button onClick={() => onReduceStock(product)} className={CLS.btnRed}>
          <Minus className="h-5 w-5" />
          ตัดสต็อกออก
        </button>
      </div>
      <button onClick={() => onEdit(product)} className={CLS.btnOutline}>
        <Edit2 className="h-4 w-4" />
        แก้ไขสินค้า
      </button>

      <MovementHistory productId={product.id} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SunmiStockPage() {
  const [screens,       setScreens]    = useState<Screen[]>([{ id: 'home' }])
  const [barcode,       setBarcode]    = useState('')
  const [searching,     setSearching]  = useState(false)
  const [scannerOpen,   setScannerOpen] = useState(false)
  const [nativeScanning, setNative]    = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = screens[screens.length - 1]

  function push(s: Screen) { setScreens((p) => [...p, s]) }
  function pop()           { setScreens((p) => p.length > 1 ? p.slice(0, -1) : p) }
  function goHome()        { setScreens([{ id: 'home' }]) }

  // Register Android back handler for any sub-screen
  useEffect(() => {
    if (current.id === 'home') return
    return pushBackHandler(pop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id])

  const handleScan = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setSearching(true)
    try {
      const res  = await api.get('/products', { params: { search: trimmed } })
      const list: Product[] = Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
      const exact = list.find((p) => p.barcode === trimmed || p.sku === trimmed) ?? list[0]
      if (exact) {
        push({ id: 'detail', product: exact })
      } else {
        push({ id: 'not-found', barcode: trimmed })
      }
    } catch {
      toast.error('ค้นหาสินค้าไม่สำเร็จ')
    } finally {
      setSearching(false)
      setBarcode('')
    }
  }, [])

  async function handleCameraClick() {
    if (Platform.isNative()) {
      setNative(true)
      try {
        const code = await nativeScan()
        if (code) await handleScan(code)
      } finally { setNative(false) }
    } else {
      setScannerOpen(true)
    }
  }

  // ── Screens that own their own full-screen shell ──
  if (current.id === 'adjust') {
    return (
      <AdjustScreen
        product={current.product}
        mode={current.mode}
        onSuccess={(updated) => {
          setScreens((prev) => {
            const withoutAdjust = prev.slice(0, -1)
            const last = withoutAdjust[withoutAdjust.length - 1]
            if (last?.id === 'detail') {
              return [...withoutAdjust.slice(0, -1), { id: 'detail', product: updated }]
            }
            return [...withoutAdjust, { id: 'detail', product: updated }]
          })
        }}
        onCancel={pop}
      />
    )
  }

  if (current.id === 'form') {
    return (
      <ProductFormScreen
        product={current.product}
        prefillBarcode={current.prefillBarcode}
        onSuccess={(p) => {
          if (current.product) {
            // Edit → return to detail with updated data
            setScreens((prev) => {
              const withoutForm = prev.slice(0, -1)
              const last = withoutForm[withoutForm.length - 1]
              if (last?.id === 'detail') {
                return [...withoutForm.slice(0, -1), { id: 'detail', product: p }]
              }
              return [...withoutForm, { id: 'detail', product: p }]
            })
          } else {
            // Create → show success screen
            setScreens((prev) => [...prev.slice(0, -1), { id: 'created', product: p }])
          }
        }}
        onCancel={pop}
      />
    )
  }

  // ── Shared scan bar + tab bar (home / browse only) ──
  const isHomeOrBrowse = current.id === 'home' || current.id === 'browse'

  const aboveScroll = isHomeOrBrowse ? (
    <>
      {/* Scan / barcode bar */}
      <div className="bg-white border-b border-slate-100 p-2.5 flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleScan(barcode); e.preventDefault() } }}
            placeholder="สแกนบาร์โค้ด / SKU / ชื่อสินค้า..."
            className="w-full h-10 pl-9 pr-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            autoComplete="off"
          />
        </div>
        <button
          onClick={handleCameraClick}
          disabled={nativeScanning}
          className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:bg-slate-200 disabled:opacity-60 shrink-0"
        >
          {nativeScanning
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            : <Camera className="h-4 w-4" />}
        </button>
        <button
          onClick={() => handleScan(barcode)}
          disabled={!barcode.trim() || searching}
          className="h-10 px-3 rounded-xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-40 active:bg-purple-700 shrink-0"
        >
          {searching
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            : 'ค้นหา'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-100 flex">
        <button
          onClick={() => setScreens([{ id: 'home' }])}
          className={cn(
            'flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            current.id === 'home'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-500 active:text-slate-700',
          )}
        >
          สต็อกต่ำ
        </button>
        <button
          onClick={() => setScreens([{ id: 'home' }, { id: 'browse' }])}
          className={cn(
            'flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            current.id === 'browse'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-500 active:text-slate-700',
          )}
        >
          ทั้งหมด
        </button>
      </div>
    </>
  ) : undefined

  const titleMap: Partial<Record<Screen['id'], string>> = {
    home:        'จัดการสต็อก',
    browse:      'สินค้าทั้งหมด',
    detail:      'ข้อมูลสินค้า',
    'not-found': 'ไม่พบสินค้า',
    created:     'สร้างสำเร็จ',
  }

  return (
    <>
      <SunmiShell
        title={titleMap[current.id] ?? 'จัดการสต็อก'}
        showBack={current.id !== 'home'}
        onBack={current.id !== 'home' ? pop : undefined}
        aboveScroll={aboveScroll}
        rightContent={
          isHomeOrBrowse ? (
            <button
              onClick={() => push({ id: 'form' })}
              className="h-10 w-10 flex items-center justify-center text-white active:text-slate-300"
              title="สร้างสินค้าใหม่"
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : (current.id === 'detail' || current.id === 'not-found' || current.id === 'created') ? (
            <button onClick={goHome} className="h-10 w-10 flex items-center justify-center text-slate-300 active:text-white">
              <X className="h-5 w-5" />
            </button>
          ) : undefined
        }
      >
        {/* ── Home: low stock list ── */}
        {current.id === 'home' && (
          <div className="p-3 space-y-3 pb-6">
            <LowStockSection onSelect={(p) => push({ id: 'detail', product: p })} />
          </div>
        )}

        {/* ── Browse: all products ── */}
        {current.id === 'browse' && (
          <BrowseScreen
            onSelectProduct={(p) => push({ id: 'detail', product: p })}
            onNewProduct={() => push({ id: 'form' })}
          />
        )}

        {/* ── Detail: product info + actions ── */}
        {current.id === 'detail' && (
          <DetailView
            initial={current.product}
            onAddStock={(p)    => push({ id: 'adjust', product: p, mode: 'IN' })}
            onReduceStock={(p) => push({ id: 'adjust', product: p, mode: 'OUT' })}
            onEdit={(p)        => push({ id: 'form', product: p })}
          />
        )}

        {/* ── Not found: unknown barcode ── */}
        {current.id === 'not-found' && (
          <div className="p-4 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1">
              <p className="font-bold text-amber-800">ไม่พบสินค้า</p>
              <p className="text-sm font-mono text-amber-700 break-all">{current.barcode}</p>
              <p className="text-sm text-amber-600">บาร์โค้ดนี้ยังไม่มีในระบบ</p>
            </div>
            <button
              onClick={() => push({ id: 'form', prefillBarcode: current.barcode })}
              className={CLS.btnPrimary}
            >
              <Plus className="h-5 w-5" />
              สร้างสินค้าใหม่ด้วยบาร์โค้ดนี้
            </button>
            <button onClick={pop} className={CLS.btnOutline}>
              กลับ
            </button>
          </div>
        )}

        {/* ── Created: success ── */}
        {current.id === 'created' && (
          <div className="p-4 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="font-bold text-green-800">สร้างสินค้าสำเร็จ</p>
                <p className="text-sm text-green-700 mt-0.5">{current.product.name}</p>
              </div>
            </div>

            <ProductDetailCard product={current.product} />

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setScreens([
                  { id: 'home' },
                  { id: 'detail', product: current.product },
                  { id: 'adjust', product: current.product, mode: 'IN' },
                ])}
                className={CLS.btnGreen}
              >
                <Plus className="h-5 w-5" />
                รับสต็อกเข้า
              </button>
              <button onClick={goHome} className={CLS.btnOutline}>
                สแกนถัดไป
              </button>
            </div>
          </div>
        )}
      </SunmiShell>

      {scannerOpen && (
        <BarcodeScannerDialog
          onScanned={(code) => { setScannerOpen(false); handleScan(code) }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </>
  )
}
