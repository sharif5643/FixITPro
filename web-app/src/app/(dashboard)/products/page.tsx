'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Package, AlertTriangle, Loader2, Barcode,
  ChevronDown, ChevronUp, PackagePlus, ArrowRightLeft, Layers, Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { StockAlertBadge } from '@/components/ui/status-badge'
import {
  ProductFormDialog, type ProductFormData,
} from '@/components/products/product-form-dialog'
import { ProductCatalogEnrollDialog } from '@/components/products/product-catalog-enroll-dialog'
import { AddStockDialog } from '@/components/products/add-stock-dialog'
import { CrossBranchAvailabilityDialog } from '@/components/products/cross-branch-availability-dialog'
import { TopSellingWidget } from '@/components/inventory/top-selling-widget'
import { formatThaiMoney } from '@/lib/utils'
import { ModuleGate } from '@/components/auth/module-gate'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import api from '@/lib/api'
import type { Product, BranchAvailability } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  PHONE:     { label: 'มือถือ',        cls: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/60' },
  SIM:       { label: 'ซิมการ์ด',     cls: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/60' },
  ACCESSORY: { label: 'อุปกรณ์เสริม', cls: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/60' },
  PART:      { label: 'อะไหล่',        cls: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/60' },
}

const PAGE_SIZE = 50

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const queryClient = useQueryClient()

  const user             = useAuthStore((s) => s.user)
  const hasPerm          = useAuthStore((s) => s.hasPermission)
  const hasModule        = useAuthStore((s) => s.hasModule)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)

  const isOwner         = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const effectiveBranch = isOwner ? (selectedBranchId ?? undefined) : (user?.branchId ?? undefined)
  const isViewAll       = isOwner && !effectiveBranch

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

  const [availMap, setAvailMap]           = useState<Map<string, BranchAvailability[]>>(new Map())
  const [availLoading, setAvailLoading]   = useState<Set<string>>(new Set())
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
    total:      products.length,
    lowStock:   products.filter((p) => { const q = stockOf(p); return q > 0 && q <= p.minStock }).length,
    outStock:   products.filter((p) => stockOf(p) === 0).length,
    stockValue: products.reduce((sum, p) => sum + stockOf(p) * Number(p.costPrice), 0),
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
  const canRequestTransfer = hasPerm('stock.transfer') || user?.role === 'MANAGER' || user?.role === 'STOCK_STAFF'

  const openAddStockDialog = (product: Product | null) => {
    if (isOwner && isViewAll) {
      toast.error('กรุณาเลือกสาขาก่อนเพิ่มสต็อก เลือกสาขาจากตัวกรองด้านบนก่อน')
      return
    }
    setAddStockProduct(product)
    setAddStockOpen(true)
  }

  if (!hasModule('stock')) return <ModuleGate module="stock">{null}</ModuleGate>

  return (
    <div className="space-y-5">

      {/* Header */}
      <PageHeader
        title="จัดการสินค้า"
        icon={Package}
        subtitle={
          isLoading ? '' : (
            isViewAll
              ? `${products.length} รายการ · ทุกสาขา`
              : `${products.length} รายการ${effectiveBranchName ? ` · ${effectiveBranchName}` : ''}`
          )
        }
        secondaryActions={
          isOwner ? (
            <Button
              variant="outline"
              onClick={() => { setEditProduct(null); setFormOpen(true) }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">สร้างสินค้าใหม่</span>
            </Button>
          ) : undefined
        }
        primaryAction={
          <Button onClick={() => setCatalogEnrollOpen(true)} className="gap-2">
            <PackagePlus className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่มสินค้าเข้าสาขา</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="สินค้าทั้งหมด"
          value={isLoading ? '—' : stats.total}
          icon={Package}
          color="blue"
        />
        <StatCard
          label="มูลค่าสต็อก"
          value={isLoading ? '—' : formatThaiMoney(stats.stockValue)}
          icon={Wallet}
          color="emerald"
        />
        <StatCard
          label="สต็อกใกล้หมด"
          value={isLoading ? '—' : stats.lowStock}
          icon={AlertTriangle}
          color={stats.lowStock > 0 ? 'amber' : 'slate'}
          urgent={stats.lowStock > 0}
        />
        <StatCard
          label={isViewAll ? 'หมดทุกสาขา' : 'หมดสต็อก'}
          value={isLoading ? '—' : stats.outStock}
          icon={AlertTriangle}
          color={stats.outStock > 0 ? 'red' : 'slate'}
          urgent={stats.outStock > 0}
        />
      </div>

      <TopSellingWidget branchId={effectiveBranch} />

      {/* Global-mode stock warning */}
      {isViewAll && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">กำลังดูสต็อกรวมทุกสาขา</span> — คอลัมน์ "รวมทุกสาขา" แสดงยอดรวมจากทุกสาขา
            ไม่ใช่สต็อกของสาขาใดสาขาหนึ่ง POS จะตัดสต็อกตามสาขาที่เลือกเท่านั้น
            หากต้องการดูสต็อกแต่ละสาขาให้เลือกสาขาจาก Sidebar ก่อน
          </p>
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อสินค้า, SKU, Barcode..."
      >
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9 text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
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
      </FilterBar>

      {/* Table */}
      <SectionCard noPadding>
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell className="w-10">#</DataTableHeadCell>
            <DataTableHeadCell>ชื่อสินค้า</DataTableHeadCell>
            <DataTableHeadCell hidden>SKU / รหัส</DataTableHeadCell>
            <DataTableHeadCell hidden>ประเภท</DataTableHeadCell>
            <DataTableHeadCell right hidden>ราคาขาย</DataTableHeadCell>
            <DataTableHeadCell right hidden>ต้นทุน</DataTableHeadCell>
            <DataTableHeadCell className="text-center">{isViewAll ? 'รวมทุกสาขา' : 'สต็อก'}</DataTableHeadCell>
            <DataTableHeadCell className="text-center">สถานะ</DataTableHeadCell>
            <DataTableHeadCell className="text-center">จัดการ</DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={8} cols={9} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-0">
                  <EmptyState preset={search || typeFilter !== 'ALL' ? 'search' : 'products'} size="md" />
                </td>
              </tr>
            ) : (
              paginated.flatMap((p, idx) => {
                const rowIdx       = (currentPage - 1) * PAGE_SIZE + idx
                const typeLabel    = p.category?.categoryType?.name ?? TYPE_CONFIG[p.type]?.label ?? p.type
                const typeInfo     = TYPE_CONFIG[p.type] ?? { label: typeLabel, cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' }
                const q            = stockOf(p)
                const isOut        = q === 0
                const isLow        = !isOut && q <= p.minStock
                const neverStocked = isOut && p.hasStockRecord === false
                const hasBreakdown = isViewAll && (p.branchBreakdown?.length ?? 0) > 0
                const isExpanded   = expanded.has(p.id)
                const isAvailExpanded = availExpanded.has(p.id)
                const isAvailLoading  = availLoading.has(p.id)
                const availData       = availMap.get(p.id) ?? []
                const otherHaveStock  = (p.otherBranchTotal ?? 0) > 0 ||
                  availData.some((b) => b.branchId !== effectiveBranch && b.quantity > 0)

                return [
                  <DataTableRow key={p.id}>
                    {/* # */}
                    <DataTableCell muted className="tabular-nums w-10">
                      {rowIdx + 1}
                    </DataTableCell>

                    {/* Name */}
                    <DataTableCell className="max-w-[200px]">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{p.description}</p>
                      )}
                    </DataTableCell>

                    {/* SKU */}
                    <DataTableCell hidden className="min-w-[120px]">
                      <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:text-slate-300">
                        {p.sku}
                      </code>
                      {!isViewAll && p.stockCode && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 rounded border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 text-xs font-mono text-blue-700 dark:text-blue-400">
                            {p.stockCode}
                          </span>
                        </div>
                      )}
                      {p.barcode && (
                        <div className="flex items-center gap-1 mt-1">
                          <Barcode className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                          <span className="text-xs text-slate-400 dark:text-slate-500">{p.barcode}</span>
                        </div>
                      )}
                    </DataTableCell>

                    {/* Type */}
                    <DataTableCell hidden>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeInfo.cls}`}>
                        {typeInfo.label}
                      </span>
                    </DataTableCell>

                    {/* Price */}
                    <DataTableCell right hidden>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatThaiMoney(Number(p.price))}
                      </span>
                    </DataTableCell>

                    {/* Cost */}
                    <DataTableCell right hidden muted>
                      <span className="tabular-nums">{formatThaiMoney(Number(p.costPrice))}</span>
                    </DataTableCell>

                    {/* Stock */}
                    <DataTableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-lg font-bold leading-none ${
                            isOut ? 'text-red-500 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
                          }`}>
                            {q}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">/{p.minStock}</span>
                          {hasBreakdown && (
                            <button
                              onClick={() => toggleExpand(p.id)}
                              className="ml-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                              title={isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดสาขา'}
                            >
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        {!isViewAll && isOut && (
                          <button
                            onClick={() => toggleAvailability(p.id)}
                            className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors mt-0.5"
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
                    </DataTableCell>

                    {/* Status */}
                    <DataTableCell className="text-center">
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
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">มีสต็อกสาขาอื่น</p>
                      )}
                    </DataTableCell>

                    {/* Actions */}
                    <DataTableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400"
                          onClick={() => openEdit(p)}
                          title="แก้ไข"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canAdjust && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-400"
                            onClick={() => openAddStockDialog(p)}
                            title="เพิ่มสต็อก"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!isViewAll && effectiveBranch && isOut && otherHaveStock && canRequestTransfer && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400"
                            onClick={() => setTransferProduct(p)}
                            title="ขอโอนสินค้า"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
                          onClick={() => setDeleteProduct(p)}
                          title="ลบ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </DataTableCell>
                  </DataTableRow>,

                  // ── All-branches stock breakdown row ──────────────────────
                  ...(hasBreakdown && isExpanded ? [
                    <tr key={`${p.id}-breakdown`} className="bg-blue-50/40 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-800/40">
                      <td colSpan={9} className="px-8 py-3">
                        <div className="flex flex-wrap gap-2">
                          {p.branchBreakdown!.map((b) => (
                            <span
                              key={b.branchId}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                b.quantity === 0
                                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400'
                                  : b.quantity <= b.minStock
                                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400'
                                    : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400'
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

                  // ── Single-branch availability mini-breakdown row ──────────
                  ...(!isViewAll && isAvailExpanded ? [
                    <tr key={`${p.id}-avail`} className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800">
                      <td colSpan={9} className="px-8 py-2.5">
                        {availData.filter((b) => b.branchId !== effectiveBranch).length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500">ไม่มีสาขาอื่นที่มีสต็อกสินค้านี้</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {availData
                              .filter((b) => b.branchId !== effectiveBranch)
                              .map((b) => (
                                <span
                                  key={b.branchId}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                    b.quantity === 0
                                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                                      : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
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
          </DataTableBody>
        </DataTable>

        {/* Pagination footer */}
        {filtered.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              แสดง{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}
              </span>{' '}
              จาก <span className="font-medium text-slate-700 dark:text-slate-300">{filtered.length}</span> รายการ
              {isFetching && !isLoading && <span className="ml-2 opacity-50">(กำลังอัปเดต...)</span>}
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
      </SectionCard>

      {/* Dialogs */}
      <ProductCatalogEnrollDialog
        open={catalogEnrollOpen}
        onOpenChange={setCatalogEnrollOpen}
        effectiveBranchId={effectiveBranch}
        effectiveBranchName={effectiveBranchName}
        isOwnerGlobalMode={isViewAll}
        onCreateNew={() => { setEditProduct(null); setFormOpen(true) }}
      />

      <ProductFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditProduct(null) }}
        product={editProduct}
        onSubmit={handleFormSubmit}
        isLoading={isFormLoading}
        effectiveBranchName={editProduct ? undefined : effectiveBranchName}
        isOwnerGlobalMode={!editProduct && isViewAll}
      />

      <AddStockDialog
        open={addStockOpen}
        onOpenChange={(v) => { setAddStockOpen(v); if (!v) setAddStockProduct(null) }}
        product={addStockProduct}
        allProducts={products}
        branchId={effectiveBranch}
        branchName={effectiveBranchName}
      />

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

      <Dialog open={!!deleteProduct} onOpenChange={(v) => { if (!v) setDeleteProduct(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
              ยืนยันการลบสินค้า
            </DialogTitle>
            <DialogDescription>
              คุณต้องการลบสินค้า{' '}
              <span className="font-semibold text-slate-900 dark:text-white">&ldquo;{deleteProduct?.name}&rdquo;</span>{' '}
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
