'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Package,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import type { Product } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  PHONE:     'มือถือ',
  SIM:       'ซิมการ์ด',
  ACCESSORY: 'อุปกรณ์เสริม',
  PART:      'อะไหล่',
}

const enrollSchema = z.object({
  quantity: z.coerce.number().int().min(0, 'จำนวนต้องไม่ติดลบ'),
  minStock: z.coerce.number().int().min(0).default(0),
})

type EnrollFormData = z.infer<typeof enrollSchema>

interface ProductCatalogEnrollDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  effectiveBranchId?: string
  effectiveBranchName?: string
  isOwnerGlobalMode?: boolean
  onCreateNew: () => void
}

export function ProductCatalogEnrollDialog({
  open,
  onOpenChange,
  effectiveBranchId,
  effectiveBranchName,
  isOwnerGlobalMode = false,
  onCreateNew,
}: ProductCatalogEnrollDialogProps) {
  const queryClient = useQueryClient()

  const [step, setStep] = useState<'search' | 'enroll'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EnrollFormData>({
    resolver: zodResolver(enrollSchema),
    defaultValues: { quantity: 0, minStock: 0 },
  })

  // Debounce search query 300 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: searchResults = [], isFetching: isSearching } = useQuery<Product[]>({
    queryKey: ['catalog-search', debouncedQuery],
    queryFn: async () => {
      const q = debouncedQuery.trim()
      if (!q) return []
      const r = await api.get('/products/catalog/search', { params: { search: q } })
      return r.data
    },
    staleTime: 30_000,
    enabled: debouncedQuery.trim().length >= 2,
  })

  const enrollMutation = useMutation({
    mutationFn: (data: EnrollFormData) =>
      api.post(`/products/${selectedProduct!.id}/enroll-branch`, {
        ...data,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      toast.success(`เพิ่ม "${selectedProduct?.name}" เข้าสาขาสำเร็จ`)
      handleClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const handleClose = () => {
    setStep('search')
    setSearchQuery('')
    setDebouncedQuery('')
    setSelectedProduct(null)
    reset()
    onOpenChange(false)
  }

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p)
    setStep('enroll')
    reset({ quantity: 0, minStock: 0 })
  }

  const handleBack = () => {
    setStep('search')
    setSelectedProduct(null)
    reset()
  }

  const handleCreateNew = () => {
    handleClose()
    onCreateNew()
  }

  const showEmptyState =
    debouncedQuery.trim().length >= 2 && !isSearching && searchResults.length === 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'search' ? 'เพิ่มสินค้าเข้าสาขา' : 'กำหนดจำนวนสต็อก'}
          </DialogTitle>

          {isOwnerGlobalMode && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>คุณอยู่ในโหมด "ทุกสาขา" กรุณาเลือกสาขาก่อนเพิ่มสินค้า</span>
            </div>
          )}
          {!isOwnerGlobalMode && effectiveBranchName && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-1">
              สาขา: <span className="font-semibold">{effectiveBranchName}</span>
            </p>
          )}
        </DialogHeader>

        {/* ── Step 1: Search ──────────────────────────────────────────────────── */}
        {step === 'search' && (
          <div className="space-y-3 py-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="ค้นหาชื่อ, SKU, Barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
                autoFocus
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="min-h-[180px] max-h-72 overflow-y-auto space-y-1.5">
              {/* Prompt before first search */}
              {debouncedQuery.trim().length < 2 && (
                <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground gap-2">
                  <Search className="h-8 w-8 text-gray-200" />
                  <p className="text-sm">พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</p>
                </div>
              )}

              {/* No results */}
              {showEmptyState && (
                <div className="flex flex-col items-center justify-center h-[180px] gap-3">
                  <Package className="h-10 w-10 text-gray-200" />
                  <p className="text-sm text-muted-foreground font-medium">
                    ไม่พบสินค้าในฐานข้อมูลกลาง
                  </p>
                  <Button variant="outline" size="sm" onClick={handleCreateNew} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    สร้างสินค้าใหม่
                  </Button>
                </div>
              )}

              {/* Results */}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectProduct(p)}
                  className="w-full text-left rounded-lg border border-gray-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <code className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{p.sku}</code>
                        {p.barcode && (
                          <span className="text-xs text-muted-foreground">{p.barcode}</span>
                        )}
                        <span className="text-xs text-slate-500">
                          ฿{Number(p.price).toLocaleString('th-TH')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[p.type] ?? p.type}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Enroll ──────────────────────────────────────────────────── */}
        {step === 'enroll' && selectedProduct && (
          <div className="space-y-4 py-1">
            {/* Selected product card */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5">
              <p className="font-semibold text-gray-900 text-sm">{selectedProduct.name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <code className="text-xs bg-white rounded border px-1.5 py-0.5">{selectedProduct.sku}</code>
                {selectedProduct.barcode && (
                  <span className="text-xs text-muted-foreground">{selectedProduct.barcode}</span>
                )}
                <span className="text-xs font-medium text-blue-700">
                  ราคาขาย ฿{Number(selectedProduct.price).toLocaleString('th-TH')}
                </span>
              </div>
            </div>

            {/* Found in central catalog banner */}
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span>พบสินค้าในฐานข้อมูลกลาง — กำหนดจำนวนสต็อกสำหรับสาขานี้</span>
            </div>

            <form
              id="enroll-form"
              onSubmit={handleSubmit((d) => enrollMutation.mutate(d))}
              className="grid grid-cols-2 gap-4"
            >
              <div className="space-y-1.5">
                <Label>จำนวนเริ่มต้น (ชิ้น)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  disabled={enrollMutation.isPending}
                  {...register('quantity')}
                  className={errors.quantity ? 'border-red-400' : ''}
                />
                {errors.quantity && (
                  <p className="text-xs text-red-500">{errors.quantity.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>สต็อกขั้นต่ำ</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  disabled={enrollMutation.isPending}
                  {...register('minStock')}
                />
              </div>
            </form>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
          {step === 'enroll' && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={enrollMutation.isPending}
              className="mr-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              กลับ
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={enrollMutation.isPending}
          >
            ยกเลิก
          </Button>

          {step === 'search' && (
            <Button type="button" variant="outline" onClick={handleCreateNew} className="gap-1.5">
              <Plus className="h-4 w-4" />
              สร้างสินค้าใหม่
            </Button>
          )}

          {step === 'enroll' && (
            <Button
              type="submit"
              form="enroll-form"
              disabled={enrollMutation.isPending || isOwnerGlobalMode}
              className="min-w-[130px]"
            >
              {enrollMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังเพิ่ม...</>
              ) : (
                'เพิ่มเข้าสาขานี้'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
