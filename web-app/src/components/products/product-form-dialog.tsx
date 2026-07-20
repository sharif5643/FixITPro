'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Wand2, Barcode, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import api from '@/lib/api'
import type { Product, Category, CategoryType } from '@/types'

// ── Schema ────────────────────────────────────────────────────────────────────

export const productSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อสินค้า'),
  sku: z.string().min(1, 'กรุณากรอก SKU'),
  barcode: z.string().optional(),
  type: z.enum(['PHONE', 'SIM', 'ACCESSORY', 'PART']).default('PHONE'),
  categoryId: z.string().optional(),
  price: z.coerce.number().min(0, 'ราคาต้องไม่ติดลบ'),
  costPrice: z.coerce.number().min(0, 'ต้นทุนต้องไม่ติดลบ'),
  stock: z.coerce.number().min(0, 'สต็อกต้องไม่ติดลบ').default(0),
  minStock: z.coerce.number().min(0).default(0),
  description: z.string().optional(),
  warrantyType: z.enum(['NO_WARRANTY', 'SHOP_WARRANTY', 'BRAND_WARRANTY']).default('NO_WARRANTY'),
  warrantyDays: z.coerce.number().int().min(0).optional(),
  hasSerial: z.boolean().default(false),
})

export type ProductFormData = z.infer<typeof productSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferProductType(name: string): ProductFormData['type'] {
  const n = name.toLowerCase()
  if (n.includes('มือถือ') || n.includes('phone') || n.includes('mobile') || n.includes('smartphone')) return 'PHONE'
  if (n.includes('ซิม') || n.includes('sim')) return 'SIM'
  if (n.includes('อุปกรณ์เสริม') || n.includes('accessory') || n.includes('เสริม')) return 'ACCESSORY'
  if (n.includes('อะไหล่') || n.includes('part')) return 'PART'
  return 'PHONE'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WARRANTY_OPTIONS = [
  { value: 'NO_WARRANTY',    label: 'ไม่มีประกัน' },
  { value: 'SHOP_WARRANTY',  label: 'ประกันร้าน' },
  { value: 'BRAND_WARRANTY', label: 'ประกันศูนย์' },
]

const defaultValues: ProductFormData = {
  name: '',
  sku: '',
  barcode: '',
  type: 'PHONE',
  categoryId: '',
  price: 0,
  costPrice: 0,
  stock: 0,
  minStock: 0,
  description: '',
  warrantyType: 'NO_WARRANTY',
  warrantyDays: undefined,
  hasSerial: false,
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  onSubmit: (data: ProductFormData) => Promise<void>
  isLoading?: boolean
  effectiveBranchName?: string
  isOwnerGlobalMode?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSubmit,
  isLoading = false,
  effectiveBranchName,
  isOwnerGlobalMode = false,
}: ProductFormDialogProps) {
  const isEditing = !!product

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues,
  })

  // Local state for CategoryType filter (not stored in form data)
  const [selectedCategoryTypeId, setSelectedCategoryTypeId] = useState<string>('')

  const selectedType     = watch('type')
  const selectedCategory = watch('categoryId')
  const selectedWarranty = watch('warrantyType')
  const hasSerial        = watch('hasSerial')

  const [skuLoading,     setSkuLoading]     = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────

  // All category types (system-wide, no tenant scope needed)
  const { data: categoryTypes = [] } = useQuery<CategoryType[]>({
    queryKey: ['category-types'],
    queryFn: () => api.get('/categories/types').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: open,
  })

  // Categories filtered by selected CategoryType (+ tenant-scoped on backend)
  const { data: categories = [], isFetching: categoriesLoading } = useQuery<
    (Category & { categoryType?: Pick<CategoryType, 'id' | 'name'> | null })[]
  >({
    queryKey: ['categories', selectedCategoryTypeId],
    queryFn: () =>
      api.get('/categories', {
        params: selectedCategoryTypeId ? { categoryTypeId: selectedCategoryTypeId } : {},
      }).then((r) => r.data),
    staleTime: 30_000,
    enabled: open,
  })

  // ── Reset / pre-fill on open ───────────────────────────────────────────────

  useEffect(() => {
    if (!open) return

    if (product) {
      // Pre-fill CategoryType from existing product's category relation
      const existingCategoryTypeId = product.category?.categoryTypeId ?? ''
      setSelectedCategoryTypeId(existingCategoryTypeId)

      reset({
        name:         product.name,
        sku:          product.sku,
        barcode:      product.barcode ?? '',
        type:         product.type as ProductFormData['type'],
        categoryId:   product.categoryId ?? '',
        price:        Number(product.price),
        costPrice:    Number(product.costPrice),
        stock:        product.stock,
        minStock:     product.minStock,
        description:  product.description ?? '',
        warrantyType: (product.warrantyType ?? 'NO_WARRANTY') as ProductFormData['warrantyType'],
        warrantyDays: product.warrantyDays ?? undefined,
        hasSerial:    product.hasSerial ?? false,
      })
    } else {
      setSelectedCategoryTypeId('')
      reset(defaultValues)
    }
  }, [open, product, reset])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCategoryTypeChange(typeId: string) {
    setSelectedCategoryTypeId(typeId)
    // Clear category when type changes
    setValue('categoryId', '')
    // Auto-infer Product.type (internal enum) from CategoryType name
    const ct = categoryTypes.find((t) => t.id === typeId)
    if (ct) setValue('type', inferProductType(ct.name))
  }

  async function handleGenerateSku() {
    setSkuLoading(true)
    try {
      const res = await api.get('/products/generate-sku', { params: { type: selectedType } })
      setValue('sku', res.data.sku)
    } catch {
      toast.error('ไม่สามารถสร้าง SKU ได้')
    } finally {
      setSkuLoading(false)
    }
  }

  async function handleGenerateBarcode() {
    setBarcodeLoading(true)
    try {
      const res = await api.get('/products/generate-barcode')
      setValue('barcode', res.data.barcode)
    } catch {
      toast.error('ไม่สามารถสร้าง Barcode ได้')
    } finally {
      setBarcodeLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</DialogTitle>
          {!isEditing && isOwnerGlobalMode && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>คุณอยู่ในโหมด &ldquo;ทุกสาขา&rdquo; — สินค้าจะถูกสร้างเป็น Master แต่ยังไม่มีสต๊อกในสาขาใด กรุณาเพิ่มสต๊อกในสาขาหลังจากสร้างสินค้า</span>
            </div>
          )}
          {!isEditing && !isOwnerGlobalMode && effectiveBranchName && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-1">
              สต็อกเริ่มต้นจะเพิ่มในสาขา: <span className="font-semibold">{effectiveBranchName}</span>
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>ชื่อสินค้า <span className="text-red-500">*</span></Label>
            <Input
              placeholder="เช่น iPhone 15 Pro Max 256GB สีดำ"
              disabled={isLoading}
              {...register('name')}
              className={errors.name ? 'border-red-400' : ''}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* CategoryType → Category (linked) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ประเภทสินค้า</Label>
              <Select
                value={selectedCategoryTypeId}
                onValueChange={handleCategoryTypeChange}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือกประเภทสินค้า" />
                </SelectTrigger>
                <SelectContent>
                  {categoryTypes.length === 0 ? (
                    <SelectItem value="_none" disabled>ยังไม่มีประเภทสินค้า</SelectItem>
                  ) : (
                    categoryTypes.map((ct) => (
                      <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                สร้างประเภทได้ที่หน้า <span className="font-medium">ประเภท/หมวดหมู่</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>หมวดหมู่</Label>
              <Select
                value={selectedCategory ?? ''}
                onValueChange={(v) => setValue('categoryId', v === '_none' ? '' : v)}
                disabled={isLoading || !selectedCategoryTypeId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedCategoryTypeId
                        ? 'เลือกประเภทสินค้าก่อน'
                        : categoriesLoading
                        ? 'กำลังโหลด...'
                        : categories.length === 0
                        ? 'ยังไม่มีหมวดหมู่ในประเภทนี้'
                        : 'เลือกหมวดหมู่ (ไม่บังคับ)'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— ไม่ระบุ —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategoryTypeId && categories.length === 0 && !categoriesLoading && (
                <p className="text-xs text-amber-600">ยังไม่มีหมวดหมู่ สร้างได้ที่หน้าประเภท/หมวดหมู่</p>
              )}
            </div>
          </div>

          {/* SKU + Barcode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <Label>SKU <span className="text-red-500">*</span></Label>
                <button
                  type="button"
                  onClick={handleGenerateSku}
                  disabled={isLoading || skuLoading}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                >
                  {skuLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  สร้าง SKU
                </button>
              </div>
              <Input
                placeholder="เช่น PHONE-000001"
                disabled={isLoading}
                {...register('sku')}
                className={errors.sku ? 'border-red-400' : ''}
              />
              {errors.sku && <p className="text-xs text-red-500">{errors.sku.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <Label>Barcode</Label>
                <button
                  type="button"
                  onClick={handleGenerateBarcode}
                  disabled={isLoading || barcodeLoading}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                >
                  {barcodeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Barcode className="h-3 w-3" />}
                  สร้าง Barcode
                </button>
              </div>
              <Input
                placeholder="13 หลัก"
                disabled={isLoading}
                {...register('barcode')}
              />
            </div>
          </div>

          {/* Price + Cost Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ราคาขาย (บาท) <span className="text-red-500">*</span></Label>
              <Input
                type="number" step="1" min="0" placeholder="0"
                disabled={isLoading}
                {...register('price')}
                className={errors.price ? 'border-red-400' : ''}
              />
              {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>ราคาต้นทุน (บาท) <span className="text-red-500">*</span></Label>
              <Input
                type="number" step="1" min="0" placeholder="0"
                disabled={isLoading}
                {...register('costPrice')}
                className={errors.costPrice ? 'border-red-400' : ''}
              />
              {errors.costPrice && <p className="text-xs text-red-500">{errors.costPrice.message}</p>}
            </div>
          </div>

          {/* Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                {!isEditing && effectiveBranchName && !isOwnerGlobalMode
                  ? 'จำนวนเริ่มต้นในสาขานี้ (ชิ้น)'
                  : 'จำนวนสต็อก (ชิ้น)'}
              </Label>
              <Input
                type="number" min="0" placeholder="0"
                disabled={isLoading || (!isEditing && isOwnerGlobalMode)}
                {...register('stock')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {!isEditing && effectiveBranchName && !isOwnerGlobalMode
                  ? 'สต็อกขั้นต่ำของสาขานี้'
                  : 'สต็อกขั้นต่ำ'}
              </Label>
              <Input type="number" min="0" placeholder="0" disabled={isLoading} {...register('minStock')} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>คำอธิบาย</Label>
            <Input placeholder="รายละเอียดเพิ่มเติม..." disabled={isLoading} {...register('description')} />
          </div>

          {/* Warranty + Serial */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <ShieldCheck className="h-4 w-4" />
              ประกันและ Serial
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ประเภทประกัน</Label>
                <Select
                  value={selectedWarranty}
                  onValueChange={(v) => setValue('warrantyType', v as ProductFormData['warrantyType'])}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WARRANTY_OPTIONS.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>ระยะประกัน (วัน)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="เช่น 365"
                  disabled={isLoading || selectedWarranty === 'NO_WARRANTY'}
                  {...register('warrantyDays')}
                />
                <p className="text-xs text-muted-foreground">
                  {selectedWarranty === 'NO_WARRANTY' ? 'ไม่มีประกัน' : 'นับจากวันที่ขาย'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="hasSerial"
                disabled={isLoading}
                checked={hasSerial}
                onChange={(e) => setValue('hasSerial', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600/60 accent-blue-600"
              />
              <Label htmlFor="hasSerial" className="cursor-pointer font-normal">
                ติดตาม Serial / IMEI (ต้องเลือก serial ตอนขาย)
              </Label>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[120px]">
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังบันทึก...</>
              ) : isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
