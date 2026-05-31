'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  AlertTriangle,
  X,
  Loader2,
  Barcode,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  ArrowRightLeft,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ProductFormDialog,
  type ProductFormData,
} from '@/components/products/product-form-dialog'
import { ProductCatalogEnrollDialog } from '@/components/products/product-catalog-enroll-dialog'
import { AddStockDialog } from '@/components/products/add-stock-dialog'
import { CrossBranchAvailabilityDialog } from '@/components/products/cross-branch-availability-dialog'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import api from '@/lib/api'
import type { Product, BranchAvailability } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  PHONE:     { label: 'มือถือ',        cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  SIM:       { label: 'ซิมการ์ด',     cls: 'bg-green-100 text-green-700 border-green-200' },
  ACCESSORY: { label: 'อุปกรณ์เสริม', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  PART:      { label: 'อะไหล่',        cls: 'bg-orange-100 text-orange-700 border-orange-200' },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function ProductsPage() {
  const queryClient = useQueryClient()

  const user             = useAuthStore((s) => s.user)
  const hasPerm          = useAuthStore((s) => s.hasPermission)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)

  const isOwner         = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const effectiveBranch = isOwner ? (selectedBranchId ?? undefined) : (user?.branchId ?? undefined)
  const isViewAll       = isOwner && !effectiveBranch

  // ── Fetch branch name for dialogs ─────────────────────────────────────────
  const { data: branches = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['branches-simple'],
    queryFn:  () => api.get('/branches').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
  const effectiveBranchName = effectiveBranch
    ? (branches.find((b) => b.id === effectiveBranch)?.name ?? effectiveBranch)
    : undefined

  // UI state
  const [search, setSearch]               = useState('')
  const [typeFilter, setTypeFilter]       = useState('ALL')
  const [page, setPage]                   = useState(1)
  const [catalogEnrollOpen, setCatalogEnrollOpen] = useState(false)
  const [formOpen, setFormOpen]           = useState(false)
  const [editProduct, setEditProduct]     = useState<Product | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [addStockOpen, setAddStockOpen]           = useState(false)
  const [addStockProduct, setAddStockProduct]     = useState<Product | null>(null)
  const [transferProduct, setTransferProduct]     = useState<Product | null>(null)
  const [expanded, setExpanded]           = useState<Set<string>>(new Set())

  // Lazy-loaded availability mini-breakdowns for 0-stock rows (single-branch view)
  const [availMap, setAvailMap]       = useState<Map<string, BranchAvailability[]>>(new Map())
  const [availLoading, setAvailLoading] = useState<Set<string>>(new Set())
  const [availExpanded, setAvailExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAvailability = async (productId: string) => {
    if (availExpanded.has(productId)) {
      setAvailExpanded((prev) => { const n = new Set(prev); n.delete(productId); return n })
      return
    }
    if (availMap.has(productId)) {
      setAvailExpanded((prev) => new Set(Array.from(prev).concat(productId)))
      return
    }
    setAvailLoading((prev) => new Set(Array.from(prev).concat(productId)))
    try {
      const res = await api.get(`/products/${productId}/availability`)
      setAvailMap((prev) => new Map(prev).set(productId, res.data.branches))
      setAvailExpanded((prev) => new Set(Array.from(prev).concat(productId)))
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลสต็อกสาขาอื่นได้')
    } finally {
      setAvailLoading((prev) => { const n = new Set(prev); n.delete(productId); return n })
    }
  }

  // ── Fetch products ─────────────────────────────────────────────────────────
  const { data: products = [], isLoading, isFetching } = useQuery<Product[]>({
    queryKey: ['products', effectiveBranch ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (effectiveBranch) params.set('branchId', effectiveBranch)
      return (await api.get(`/products?${params}`)).data
    },
    placeholderData: keepPreviousData,
  })

  const stockOf = (p: Product) => p.branchQuantity ?? p.stock

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: ProductFormData) =>
      api.post('/products', { ...data, ...(effectiveBranch ? { branchId: effectiveBranch } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      setFormOpen(false)
      toast.success('เพิ่มสินค้าเรียบร้อย')
    },
    onError: (err: any) => {
      if (process.env.NODE_ENV === 'development') console.error('[products] create error', err)
      const status = err.response?.status
      if (status === 409) {
        const backendMsg: string = err.response?.data?.message ?? ''
        const isBranchStock = /branch|stock|สาขา|สต็อก/i.test(backendMsg)
        toast.error(isBranchStock ? 'สินค้านี้มีสต๊อกในสาขานี้แล้ว' : 'สินค้านี้มีอยู่แล้ว หรือ SKU/Barcode ซ้ำ')
        return
      }
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductFormData }) =>
      api.patch(`/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      setFormOpen(false)
      setEditProduct(null)
      toast.success('แก้ไขสินค้าเรียบร้อย')
    },
    onError: (err: any) => {
      if (process.env.NODE_ENV === 'development') console.error('[products] update error', err)
      const status = err.response?.status
      if (status === 409) {
        const backendMsg: string = err.response?.data?.message ?? ''
        const isBranchStock = /branch|stock|สาขา|สต็อก/i.test(backendMsg)
        toast.error(isBranchStock ? 'สินค้านี้มีสต๊อกในสาขานี้แล้ว' : 'สินค้านี้มีอยู่แล้ว หรือ SKU/Barcode ซ้ำ')
        return
      }
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      setDeleteProduct(null)
      toast.success('ลบสินค้าเรียบร้อย')
    },
    onError: () => toast.error('ลบสินค้าไม่สำเร็จ'),
  })

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode?.toLowerCase().includes(q) ?? false)
      const matchType = typeFilter === 'ALL' || p.type === typeFilter
      return matchSearch && matchType
    })
  }, [products, search, typeFilter])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useMemo(() => { setPage(1) }, [search, typeFilter]) // eslint-disable-line

  const stats = {
    total:    products.length,
    lowStock: products.filter((p) => { const q = stockOf(p); return q > 0 && q <= p.minStock }).length,
    outStock: products.filter((p) => stockOf(p) === 0).length,
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleFormSubmit = async (data: ProductFormData) => {
    try {
      if (editProduct) {
        await updateMutation.mutateAsync({ id: editProduct.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
    } catch {
      // onError handles the toast
    }
  }

  const openEdit = (p: Product) => { setEditProduct(p); setFormOpen(true) }
  const isFormLoading = createMutation.isPending || updateMutation.isPending

  const canAdjust = hasPerm('stock.adjust')
  // Allow stock.transfer permission OR the roles whose preset includes it, as a DB-seeding fallback
  const canRequestTransfer = hasPerm('stock.transfer') || user?.role === 'MANAGER' || user?.role === 'STOCK_STAFF'

  // OWNER in global mode (no branch selected) must not open add-stock dialog.
  // They must first pick a branch from the branch selector so there is an explicit target.
  const openAddStockDialog = (product: Product | null) => {
    if (isOwner && isViewAll) {
      toast.error('กรุณาเลือกสาขาก่อนเพิ่มสต็อก เลือกสาขาจากตัวกรองด้านบนก่อน')
      return
    }
    setAddStockProduct(product)
    setAddStockOpen(true)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">จัดการสินค้า</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length} รายการในระบบ
            {isViewAll && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                <Layers className="h-3 w-3" />
                ทุกสาขา
              </span>
            )}
            {!isViewAll && effectiveBranchName && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                {effectiveBranchName}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwner && (
            <Button
              variant="outline"
              onClick={() => { setEditProduct(null); setFormOpen(true) }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">สร้างสินค้าใหม่</span>
            </Button>
          )}
          <Button
            onClick={() => setCatalogEnrollOpen(true)}
            className="gap-2"
          >
            <PackagePlus className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่มสินค้าเข้าสาขา</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-blue-50 p-2.5">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">สินค้าทั้งหมด</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.lowStock ? 'border-yellow-200' : ''}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-yellow-50 p-2.5">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">สต็อกใกล้หมด</p>
              <p className={`text-2xl font-bold ${stats.lowStock ? 'text-yellow-600' : ''}`}>
                {stats.lowStock}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.outStock ? 'border-red-200' : ''}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-red-50 p-2.5">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {isViewAll ? 'หมดทุกสาขา' : 'หมดสต็อก'}
              </p>
              <p className={`text-2xl font-bold ${stats.outStock ? 'text-red-600' : ''}`}>
                {stats.outStock}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ค้นหาชื่อสินค้า, SKU, Barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ทุกประเภท</SelectItem>
            <SelectItem value="PHONE">มือถือ</SelectItem>
            <SelectItem value="SIM">ซิมการ์ด</SelectItem>
            <SelectItem value="ACCESSORY">อุปกรณ์เสริม</SelectItem>
            <SelectItem value="PART">อะไหล่</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-10">#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ชื่อสินค้า</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU / รหัสสต็อก</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ประเภท</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">ราคาขาย</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">ต้นทุน</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {isViewAll ? 'รวมทุกสาขา' : 'สต็อกสาขานี้'}
                </th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">จัดการ</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-6 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-40 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-100 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-10 bg-gray-100 rounded mx-auto" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-100 rounded-full mx-auto" /></td>
                    <td className="px-4 py-3"><div className="h-7 w-20 bg-gray-100 rounded mx-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Package className="h-12 w-12 text-gray-200" />
                      <p className="font-medium">
                        {search || typeFilter !== 'ALL' ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าในระบบ'}
                      </p>
                      {!search && typeFilter === 'ALL' && (
                        <Button size="sm" onClick={() => { setEditProduct(null); setFormOpen(true) }} className="mt-1">
                          <Plus className="mr-1.5 h-4 w-4" />
                          เพิ่มสินค้าแรก
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.flatMap((p, idx) => {
                  const idx_     = (currentPage - 1) * PAGE_SIZE + idx
                  const typeInfo = TYPE_CONFIG[p.type] ?? { label: p.type, cls: '' }
                  const q        = stockOf(p)
                  const isOut    = q === 0
                  const isLow    = !isOut && q <= p.minStock
                  // Differentiate: never had stock vs ran out
                  const neverStocked = isOut && p.hasStockRecord === false
                  const hasBreakdown = isViewAll && (p.branchBreakdown?.length ?? 0) > 0
                  const isExpanded   = expanded.has(p.id)
                  const isAvailExpanded = availExpanded.has(p.id)
                  const isAvailLoading  = availLoading.has(p.id)
                  const availData       = availMap.get(p.id) ?? []
                  // otherBranchTotal comes directly from the API response (no lazy load required).
                  // availData is populated only after the user expands the availability dropdown.
                  const otherHaveStock  = (p.otherBranchTotal ?? 0) > 0 ||
                    availData.some((b) => b.branchId !== effectiveBranch && b.quantity > 0)

                  return [
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">

                      {/* # */}
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{idx_ + 1}</td>

                      {/* Name */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>
                        )}
                      </td>

                      {/* SKU / Stock Code */}
                      <td className="px-4 py-3 min-w-[120px]">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">
                          {p.sku}
                        </code>
                        {!isViewAll && p.stockCode && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-mono text-blue-700">
                              {p.stockCode}
                            </span>
                          </div>
                        )}
                        {p.barcode && (
                          <div className="flex items-center gap-1 mt-1">
                            <Barcode className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{p.barcode}</span>
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeInfo.cls}`}>
                          {typeInfo.label}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatThaiMoney(Number(p.price))}
                      </td>

                      {/* Cost */}
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                        {formatThaiMoney(Number(p.costPrice))}
                      </td>

                      {/* Stock */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className={`text-lg font-bold leading-none ${
                              isOut ? 'text-red-500' : isLow ? 'text-yellow-600' : 'text-gray-900'
                            }`}>
                              {q}
                            </span>
                            <span className="text-xs text-muted-foreground">/{p.minStock}</span>
                            {hasBreakdown && (
                              <button
                                onClick={() => toggleExpand(p.id)}
                                className="ml-0.5 text-muted-foreground hover:text-gray-700 transition-colors"
                                title={isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดสาขา'}
                              >
                                {isExpanded
                                  ? <ChevronUp className="h-3.5 w-3.5" />
                                  : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                          {/* Mini breakdown expand for single-branch view */}
                          {!isViewAll && isOut && (
                            <button
                              onClick={() => toggleAvailability(p.id)}
                              className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 transition-colors mt-0.5"
                            >
                              {isAvailLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <span>สาขาอื่น</span>
                                  {isAvailExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {isOut ? (
                          <Badge variant="destructive" className="text-xs whitespace-nowrap">
                            {neverStocked ? 'ยังไม่มีสต็อก' : 'หมดสต็อก'}
                          </Badge>
                        ) : isLow ? (
                          <Badge variant="warning" className="text-xs">ใกล้หมด</Badge>
                        ) : (
                          <Badge variant="success" className="text-xs">ปกติ</Badge>
                        )}
                        {!isViewAll && isOut && !isAvailLoading && isAvailExpanded && otherHaveStock && (
                          <p className="text-[10px] text-green-600 mt-0.5 font-medium">มีสต็อกในสาขาอื่น</p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                            onClick={() => openEdit(p)}
                            title="แก้ไข"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canAdjust && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 hover:bg-green-50 hover:text-green-700"
                              onClick={() => openAddStockDialog(p)}
                              title="เพิ่มสต็อก"
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isViewAll && effectiveBranch && isOut && otherHaveStock && canRequestTransfer && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 hover:bg-amber-50 hover:text-amber-600"
                              onClick={() => setTransferProduct(p)}
                              title="ขอโอนสินค้า"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                            onClick={() => setDeleteProduct(p)}
                            title="ลบ"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>,

                    // ── All-branches stock breakdown row ────────────────────
                    ...(hasBreakdown && isExpanded ? [
                      <tr key={`${p.id}-breakdown`} className="bg-blue-50/30 border-t border-blue-100">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="flex flex-wrap gap-2">
                            {p.branchBreakdown!.map((b) => (
                              <span
                                key={b.branchId}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                  b.quantity === 0
                                    ? 'bg-red-50 border-red-200 text-red-600'
                                    : b.quantity <= b.minStock
                                      ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                                      : 'bg-green-50 border-green-200 text-green-700'
                                }`}
                              >
                                <span>{b.branchName}</span>
                                <span className="font-bold">{b.quantity}</span>
                                {b.stockCode && (
                                  <span className="opacity-60 text-[10px]">{b.stockCode}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>,
                    ] : []),

                    // ── Single-branch availability mini-breakdown row ────────
                    ...(!isViewAll && isAvailExpanded ? [
                      <tr key={`${p.id}-avail`} className="bg-slate-50 border-t border-slate-100">
                        <td colSpan={9} className="px-8 py-2.5">
                          {availData.filter((b) => b.branchId !== effectiveBranch).length === 0 ? (
                            <p className="text-xs text-muted-foreground">ไม่มีสาขาอื่นที่มีสต็อกสินค้านี้</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {availData
                                .filter((b) => b.branchId !== effectiveBranch)
                                .map((b) => (
                                  <span
                                    key={b.branchId}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                      b.quantity === 0
                                        ? 'border-gray-200 bg-gray-50 text-gray-400'
                                        : 'border-green-200 bg-green-50 text-green-700'
                                    }`}
                                  >
                                    <span>{b.branchName}</span>
                                    <span className="font-bold">{b.quantity}</span>
                                  </span>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>,
                    ] : []),
                  ]
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        {filtered.length > 0 && (
          <div className="border-t bg-slate-50/60 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              แสดง{' '}
              <span className="font-medium text-gray-700">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}
              </span>{' '}
              จาก <span className="font-medium text-gray-700">{filtered.length}</span> รายการ
              {isFetching && !isLoading && <span className="ml-2 opacity-60">(กำลังอัปเดต...)</span>}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>
                  ก่อนหน้า
                </Button>
                <span className="px-2">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                  disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}>
                  ถัดไป
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Catalog Enroll Dialog ── */}
      <ProductCatalogEnrollDialog
        open={catalogEnrollOpen}
        onOpenChange={setCatalogEnrollOpen}
        effectiveBranchId={effectiveBranch}
        effectiveBranchName={effectiveBranchName}
        isOwnerGlobalMode={isViewAll}
        onCreateNew={() => { setEditProduct(null); setFormOpen(true) }}
      />

      {/* ── Add / Edit Product Dialog ── */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditProduct(null) }}
        product={editProduct}
        onSubmit={handleFormSubmit}
        isLoading={isFormLoading}
        effectiveBranchName={editProduct ? undefined : effectiveBranchName}
        isOwnerGlobalMode={!editProduct && isViewAll}
      />

      {/* ── Add Stock Dialog ── */}
      <AddStockDialog
        open={addStockOpen}
        onOpenChange={(v) => { setAddStockOpen(v); if (!v) setAddStockProduct(null) }}
        product={addStockProduct}
        allProducts={products}
        branchId={effectiveBranch}
        branchName={effectiveBranchName}
      />

      {/* ── Cross-Branch Transfer Dialog ── */}
      <CrossBranchAvailabilityDialog
        open={!!transferProduct}
        onClose={() => setTransferProduct(null)}
        product={transferProduct}
        currentBranchId={effectiveBranch}
        currentBranchName={effectiveBranchName}
        onRequested={() => {
          setTransferProduct(null)
          queryClient.invalidateQueries({ queryKey: ['products'] })
        }}
      />

      {/* ── Delete Confirm Dialog ── */}
      <Dialog
        open={!!deleteProduct}
        onOpenChange={(v) => { if (!v) setDeleteProduct(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              ยืนยันการลบสินค้า
            </DialogTitle>
            <DialogDescription>
              คุณต้องการลบสินค้า{' '}
              <span className="font-semibold text-gray-900">&ldquo;{deleteProduct?.name}&rdquo;</span>{' '}
              ใช่หรือไม่?
              <br />
              <span className="text-xs mt-1 inline-block">สินค้าจะถูกซ่อนออกจากระบบ (ไม่ได้ลบถาวร)</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteProduct(null)} disabled={deleteMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteProduct && deleteMutation.mutate(deleteProduct.id)}
              disabled={deleteMutation.isPending}
              className="min-w-[90px]"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ลบสินค้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
