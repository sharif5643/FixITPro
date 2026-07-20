'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PackagePlus, Loader2, Search, AlertCircle } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { Product } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pre-filled product. When null the dialog shows a product search picker. */
  product: Product | null
  /** All active products — used as picker placeholder while loading. */
  allProducts?: Product[]
  /** Pre-filled branch (OWNER when viewing a specific branch). */
  branchId?: string
  branchName?: string
}

export function AddStockDialog({
  open, onOpenChange, product: propProduct,
  allProducts = [], branchId: propBranchId, branchName: propBranchName,
}: Props) {
  const qc = useQueryClient()

  // Authoritative branch context — staff/SUNMI always use JWT branchId
  const { branchId: contextBranchId, branchName: contextBranchName, isOwner, isBranchLocked, isGlobalMode } = useBranchContext()
  const user = useAuthStore((s) => s.user)

  const [pickedProduct, setPickedProduct] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [qty, setQty]   = useState('')
  const [note, setNote] = useState('')

  const reset = () => {
    setPickedProduct(null)
    setProductSearch('')
    setSelectedBranchId('')
    setQty('')
    setNote('')
  }

  // Active product being added — propProduct takes precedence
  const activeProduct = propProduct ?? pickedProduct

  // Branches for OWNER selector (only needed when OWNER has no pre-filled branch)
  const { data: branches = [] } = useQuery<{ id: string; name: string; isActive: boolean; status: string }[]>({
    queryKey: ['branches-simple'],
    queryFn:  () => api.get('/branches').then((r) => r.data),
    enabled:  isOwner && open && !propBranchId,
    staleTime: 5 * 60_000,
  })
  const activeBranches = branches.filter((b) => b.isActive && (b as any).status === 'ACTIVE')

  // Effective branch:
  //   staff/SUNMI → always JWT branchId from context (isBranchLocked = true)
  //   OWNER       → propBranchId (from selected branch in parent) or dialog-local selection
  const effectiveBranchId = isBranchLocked
    ? contextBranchId
    : (propBranchId ?? (selectedBranchId || undefined))

  const effectiveBranchName = isBranchLocked
    ? (contextBranchName || 'สาขาปัจจุบัน')
    : (propBranchId
        ? (propBranchName ?? propBranchId)
        : (branches.find((b) => b.id === selectedBranchId)?.name ?? ''))

  // Fetch ALL products for the picker (not branch-filtered) so staff can add
  // stock to a product not yet assigned to their branch
  const { data: allProductsForPicker = allProducts } = useQuery<Product[]>({
    queryKey: ['products', 'stock-picker-all'],
    queryFn:  () => api.get('/products').then((r) => r.data),
    enabled:  open && !propProduct,
    staleTime: 60_000,
  })

  // Product picker filtering
  const filteredProducts = useMemo(() => {
    const list = propProduct ? [] : allProductsForPicker
    if (!productSearch.trim()) return list.slice(0, 50)
    const q = productSearch.toLowerCase()
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode?.toLowerCase().includes(q) ?? false),
    ).slice(0, 50)
  }, [allProductsForPicker, propProduct, productSearch])

  const mutation = useMutation({
    mutationFn: () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddStockDialog][submit]', {
          productId:        activeProduct!.id,
          effectiveBranchId,
          contextBranchId,
          propBranchId,
          userRole:         user?.role ?? null,
          userBranchId:     user?.branchId ?? null,
          branchName:       effectiveBranchName,
        })
      }
      return api.post('/stock/adjust', {
        productId: activeProduct!.id,
        type:      'IN',
        quantity:  Number(qty),
        branchId:  effectiveBranchId,
        note:      note.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['low-stock'] })
      toast.success(`เพิ่มสต็อก "${activeProduct?.name}" เข้า${effectiveBranchName || 'สาขา'} เรียบร้อย`)
      onOpenChange(false)
      reset()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const qtyNum  = Number(qty)
  // effectiveBranchId being falsy already blocks submit; no separate ownerGlobalModeBlocked needed.
  // The products page prevents OWNER from opening the dialog in global mode entirely.
  const isValid = !!activeProduct && !!qty && qtyNum > 0 && Number.isInteger(qtyNum) && !!effectiveBranchId
  const noBranchWarning = isBranchLocked && !effectiveBranchId

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-green-600" />
            เพิ่มสต็อกเข้าสาขา{effectiveBranchName ? `: ${effectiveBranchName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Product: pre-filled OR picker ── */}
          {propProduct ? (
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{propProduct.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{propProduct.sku}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                สต็อกปัจจุบัน:{' '}
                <span className="font-medium">
                  {propProduct.branchQuantity ?? propProduct.stock} ชิ้น
                </span>
              </p>
            </div>
          ) : (
            <div>
              <Label>สินค้า <span className="text-red-500">*</span></Label>
              {!pickedProduct ? (
                <div className="mt-1 space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="ค้นหาชื่อสินค้า, SKU..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-8 text-sm h-9"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg border bg-white">
                    {filteredProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">ไม่พบสินค้า</p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPickedProduct(p); setProductSearch('') }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0 transition-colors"
                        >
                          <p className="font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 rounded-lg border bg-green-50 border-green-200 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{pickedProduct.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{pickedProduct.sku}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickedProduct(null)}
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                  >
                    เปลี่ยน
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Branch: OWNER selects / staff read-only (JWT-locked) ── */}
          {isOwner && !isBranchLocked && !propBranchId ? (
            <div>
              <Label>
                สาขาที่รับสต็อก <span className="text-red-500">*</span>
              </Label>
              {activeBranches.length === 0 ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  ไม่พบสาขาที่ใช้งานได้
                </div>
              ) : (
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="เลือกสาขา..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">สาขาที่รับสต็อก</p>
              <p className="text-sm font-medium">{effectiveBranchName}</p>
            </div>
          )}

          {/* ── No-branch warning: staff with no branch assignment ── */}
          {noBranchWarning && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              ไม่พบสาขาปัจจุบัน กรุณาเข้าสู่ระบบใหม่
            </div>
          )}

          {/* ── Quantity ── */}
          {activeProduct && (
            <div>
              <Label htmlFor="add-qty">จำนวนที่รับเข้า</Label>
              <Input
                id="add-qty"
                type="number"
                min="1"
                step="1"
                placeholder="ระบุจำนวน..."
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1"
                autoFocus={!!propProduct}
              />
            </div>
          )}

          {/* ── Note ── */}
          {activeProduct && (
            <div>
              <Label htmlFor="add-note">
                หมายเหตุ{' '}
                <span className="text-muted-foreground font-normal text-xs">(ไม่บังคับ)</span>
              </Label>
              <Input
                id="add-note"
                placeholder="เช่น รับสินค้าจากซัพพลายเออร์..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="gap-2 bg-green-600 hover:bg-green-700 min-w-[100px]"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <PackagePlus className="h-4 w-4" />
                เพิ่มสต็อก
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
