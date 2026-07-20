'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus, Search, Loader2, ClipboardList, Eye, Ban,
  CheckCircle2, AlertTriangle, Package, X, CalendarDays, Percent,
  PackageCheck, History, ChevronRight, Banknote, CreditCard, ArrowUpFromLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import type { PurchaseOrder, Supplier, Product, SupplierPayment, POPaymentStatus } from '@/types'

// ─────────────────────── local types ───────────────────────
interface DraftItem {
  productId: string
  productName: string
  sku: string
  quantity: number
  unitCost: number
  discount: number
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  note: string | null
  createdAt: string
  product: { id: string; name: string; sku: string }
}

// ─────────────────────── config ───────────────────────
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  DRAFT:            { label: 'ร่าง',         cls: 'bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60' },
  ORDERED:          { label: 'สั่งซื้อแล้ว',  cls: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/60' },
  PARTIAL_RECEIVED: { label: 'รับบางส่วน',   cls: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/60' },
  RECEIVED:         { label: 'รับครบแล้ว',   cls: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/60' },
  CANCELLED:        { label: 'ยกเลิก',       cls: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60' },
}

const PAY_STATUS_CFG: Record<POPaymentStatus, { label: string; cls: string }> = {
  UNPAID:      { label: 'ยังไม่จ่าย',  cls: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/60' },
  PARTIAL_PAID:{ label: 'จ่ายบางส่วน', cls: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/60' },
  PAID:        { label: 'จ่ายครบแล้ว', cls: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/60' },
}

const PAY_METHOD_LABEL: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต',
}

const ALL_STATUSES = ['DRAFT', 'ORDERED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED']

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

// ═══════════════════════════════════════════════════════════
export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient()

  // ── filters ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // ── dialog open states ──
  const [formOpen, setFormOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [receiveId, setReceiveId] = useState<string | null>(null)
  const [payId, setPayId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: string; poNumber: string } | null>(null)

  // ── create-form state ──
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [vatPercent, setVatPercent] = useState(0)
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [note, setNote] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [productSearch, setProductSearch] = useState('')

  // ── receive-form state ──
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({})
  const [receiveNote, setReceiveNote] = useState('')

  // ── payment-form state ──
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [payNote, setPayNote] = useState('')

  // ─────────────────────── queries ───────────────────────
  const { data: pos = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', search, statusFilter],
    queryFn: async () =>
      (await api.get('/purchase-orders', {
        params: { search: search || undefined, status: statusFilter || undefined },
      })).data,
    staleTime: 30_000,
  })

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
    staleTime: 60_000,
  })

  const { data: productResults = [], isFetching: searchingProducts } = useQuery<Product[]>({
    queryKey: ['products-search-po', productSearch],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search: productSearch, limit: 10 } })
      return res.data?.data ?? res.data ?? []
    },
    enabled: productSearch.length >= 2,
    staleTime: 10_000,
  })

  const { data: detail, isLoading: loadingDetail } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', detailId],
    queryFn: async () => (await api.get(`/purchase-orders/${detailId}`)).data,
    enabled: !!detailId,
    staleTime: 0,
  })

  const { data: receiveDetail, isLoading: loadingReceiveDetail } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', receiveId],
    queryFn: async () => (await api.get(`/purchase-orders/${receiveId}`)).data,
    enabled: !!receiveId,
    staleTime: 0,
  })

  const { data: payDetail, isLoading: loadingPayDetail } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', payId],
    queryFn: async () => (await api.get(`/purchase-orders/${payId}`)).data,
    enabled: !!payId,
    staleTime: 0,
  })

  const { data: movements = [], isLoading: loadingMovements } = useQuery<StockMovement[]>({
    queryKey: ['po-movements', detailId],
    queryFn: async () => (await api.get(`/purchase-orders/${detailId}/movements`)).data,
    enabled: !!detailId,
    staleTime: 0,
  })

  // ─────────────────────── mutations ───────────────────────
  const createMutation = useMutation({
    mutationFn: async (status: 'DRAFT' | 'ORDERED') =>
      (await api.post('/purchase-orders', {
        supplierId,
        expectedDate: expectedDate || undefined,
        vatPercent,
        discount: orderDiscount,
        note: note || undefined,
        status,
        items: items.map(({ productId, quantity, unitCost, discount }) => ({
          productId, quantity, unitCost, discount,
        })),
      })).data,
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      setFormOpen(false)
      toast.success(status === 'ORDERED' ? 'สร้าง PO และสั่งซื้อแล้ว' : 'บันทึก PO ร่างแล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      (await api.patch(`/purchase-orders/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      setCancelTarget(null)
      if (detailId) queryClient.invalidateQueries({ queryKey: ['purchase-orders', detailId] })
      toast.success('อัปเดต PO แล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const receiveMutation = useMutation({
    mutationFn: async (poId: string) =>
      (await api.post(`/purchase-orders/${poId}/receive`, {
        note: receiveNote || undefined,
        items: Object.entries(receiveQtys)
          .map(([purchaseOrderItemId, quantity]) => ({ purchaseOrderItemId, quantity }))
          .filter((i) => i.quantity > 0),
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      if (receiveId) {
        queryClient.invalidateQueries({ queryKey: ['purchase-orders', receiveId] })
        queryClient.invalidateQueries({ queryKey: ['po-movements', receiveId] })
      }
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setReceiveId(null)
      toast.success('รับสินค้าเข้า Stock เรียบร้อย')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const payMutation = useMutation({
    mutationFn: async (poId: string) =>
      (await api.post(`/purchase-orders/${poId}/payments`, {
        amount: Number(payAmount),
        paymentMethod: payMethod,
        note: payNote || undefined,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      if (payId) queryClient.invalidateQueries({ queryKey: ['purchase-orders', payId] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      setPayId(null)
      toast.success('บันทึกการจ่ายเงินเรียบร้อย')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  // ─────────────────────── helpers ───────────────────────
  const openCreate = () => {
    setSupplierId(''); setExpectedDate(''); setVatPercent(0)
    setOrderDiscount(0); setNote(''); setItems([]); setProductSearch('')
    setFormOpen(true)
  }

  const addProduct = (p: Product) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.productId === p.id)
      if (exists) return prev.map((i) => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { productId: p.id, productName: p.name, sku: p.sku, quantity: 1, unitCost: p.costPrice, discount: 0 }]
    })
    setProductSearch('')
  }

  const updateItem = (idx: number, field: 'quantity' | 'unitCost' | 'discount', value: number) =>
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const openReceive = (po: PurchaseOrder) => {
    setReceiveId(po.id); setReceiveQtys({}); setReceiveNote('')
  }

  const openPay = (po: PurchaseOrder) => {
    setPayId(po.id); setPayAmount(''); setPayMethod('CASH'); setPayNote('')
  }

  useEffect(() => {
    if (receiveDetail) {
      const init: Record<string, number> = {}
      receiveDetail.items.forEach((item) => { init[item.id] = 0 })
      setReceiveQtys(init)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveDetail?.id])

  // ── totals ──
  const itemsSubtotal = items.reduce((s, i) => s + i.unitCost * i.quantity - i.discount, 0)
  const vatBase = itemsSubtotal - orderDiscount
  const vatAmount = (vatBase * vatPercent) / 100
  const grandTotal = vatBase + vatAmount
  const canSubmit = supplierId && items.length > 0
  const canReceiveSubmit = !!receiveId && Object.values(receiveQtys).some((q) => q > 0)

  const payRemaining = payDetail
    ? Math.max(0, Number(payDetail.total) - Number(payDetail.paidTotal))
    : 0
  const payAmountNum = Number(payAmount) || 0
  const canPaySubmit =
    payAmountNum > 0 && payAmountNum <= payRemaining + 0.001 && !payMutation.isPending

  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      <PageHeader
        title="ใบสั่งซื้อ (PO)"
        icon={ClipboardList}
        subtitle="จัดการใบสั่งซื้อและบัญชีเจ้าหนี้"
        primaryAction={
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">สร้าง PO ใหม่</span>
            <span className="sm:hidden">สร้าง</span>
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="ค้นหาเลข PO..."
          className="flex-1 min-w-[200px] py-0"
        />
        <div className="flex gap-2 flex-wrap items-center">
          {['', ...ALL_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              {s === '' ? 'ทั้งหมด' : STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <SectionCard noPadding className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>เลข PO</DataTableHeadCell>
            <DataTableHeadCell>ซัพพลายเออร์</DataTableHeadCell>
            <DataTableHeadCell className="text-center">สถานะรับ</DataTableHeadCell>
            <DataTableHeadCell className="text-center">สถานะจ่าย</DataTableHeadCell>
            <DataTableHeadCell right>ยอดรวม</DataTableHeadCell>
            <DataTableHeadCell right>คงเหลือ</DataTableHeadCell>
            <DataTableHeadCell className="text-center w-28">จัดการ</DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={5} cols={7} />
            ) : pos.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-0">
                  <EmptyState preset={search || statusFilter ? 'search' : 'default'} size="md" title={search || statusFilter ? 'ไม่พบ PO ที่ค้นหา' : 'ยังไม่มี PO'} />
                </td>
              </tr>
            ) : (
              pos.map((po) => {
                const cfg = STATUS_CFG[po.status]
                const pcfg = PAY_STATUS_CFG[po.paymentStatus ?? 'UNPAID']
                const canReceive = ['ORDERED', 'PARTIAL_RECEIVED'].includes(po.status)
                const canPay = !['CANCELLED', 'DRAFT'].includes(po.status) && po.paymentStatus !== 'PAID'
                const remaining = Number(po.total) - Number(po.paidTotal ?? 0)
                return (
                  <DataTableRow key={po.id}>
                    <DataTableCell>
                      <p className="font-mono font-semibold text-slate-900 dark:text-slate-50">{po.poNumber}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(po.createdAt).toLocaleDateString('th-TH')}</p>
                    </DataTableCell>
                    <DataTableCell>
                      <p className="font-medium text-slate-800">{po.supplier.name}</p>
                    </DataTableCell>
                    <DataTableCell className="text-center">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
                    </DataTableCell>
                    <DataTableCell className="text-center">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pcfg.cls}`}>{pcfg.label}</span>
                    </DataTableCell>
                    <DataTableCell right>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">฿{fmt(Number(po.total))}</span>
                    </DataTableCell>
                    <DataTableCell right>
                      <span className={remaining > 0 ? 'text-red-600 font-semibold tabular-nums' : 'text-slate-400'}>
                        {remaining > 0 ? `฿${fmt(remaining)}` : '—'}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="ดูรายละเอียด" onClick={() => setDetailId(po.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canReceive && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="รับสินค้าเข้า" onClick={() => openReceive(po)}>
                            <PackageCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canPay && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" title="บันทึกจ่ายเงิน" onClick={() => openPay(po)}>
                            <Banknote className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {['DRAFT', 'ORDERED'].includes(po.status) && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" title="ยกเลิก PO" onClick={() => setCancelTarget({ id: po.id, poNumber: po.poNumber })}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                )
              })
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <SectionCard><div className="h-32 flex items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div></SectionCard>
        ) : pos.length === 0 ? (
          <SectionCard noPadding><EmptyState preset="default" size="md" title={search || statusFilter ? 'ไม่พบ PO' : 'ยังไม่มี PO'} /></SectionCard>
        ) : (
          pos.map((po) => {
            const cfg = STATUS_CFG[po.status]
            const pcfg = PAY_STATUS_CFG[po.paymentStatus ?? 'UNPAID']
            const canReceive = ['ORDERED', 'PARTIAL_RECEIVED'].includes(po.status)
            const canPay = !['CANCELLED', 'DRAFT'].includes(po.status) && po.paymentStatus !== 'PAID'
            const remaining = Number(po.total) - Number(po.paidTotal ?? 0)
            return (
              <div key={po.id} className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono font-semibold text-slate-900 dark:text-slate-50">{po.poNumber}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{po.supplier.name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pcfg.cls}`}>{pcfg.label}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">ยอด: <strong className="text-slate-900 dark:text-slate-50">฿{fmt(Number(po.total))}</strong></span>
                  {remaining > 0 && <span className="text-red-600 font-semibold text-xs">ค้าง ฿{fmt(remaining)}</span>}
                </div>
                <div className="flex gap-2 pt-1 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setDetailId(po.id)}><Eye className="h-3 w-3" />ดู</Button>
                  {canReceive && <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => openReceive(po)}><PackageCheck className="h-3 w-3" />รับสินค้า</Button>}
                  {canPay && <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 flex-1" onClick={() => openPay(po)}><Banknote className="h-3 w-3" />จ่ายเงิน</Button>}
                  {['DRAFT', 'ORDERED'].includes(po.status) && <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50" onClick={() => setCancelTarget({ id: po.id, poNumber: po.poNumber })}><Ban className="h-3 w-3" />ยกเลิก</Button>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ═══════════════ CREATE DIALOG ═══════════════ */}
      <Dialog open={formOpen} onOpenChange={(v: boolean) => { if (!v) setFormOpen(false) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              สร้างใบสั่งซื้อ (PO) ใหม่
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ซัพพลายเออร์ <span className="text-red-500">*</span></Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="เลือกซัพพลายเออร์" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.filter((s) => s.isActive).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />วันที่คาดว่าจะรับสินค้า</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" />ภาษีมูลค่าเพิ่ม (VAT)</Label>
                <Select value={String(vatPercent)} onValueChange={(v) => setVatPercent(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">ไม่มี VAT (0%)</SelectItem>
                    <SelectItem value="7">VAT 7%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ส่วนลดรวม (บาท)</Label>
                <Input type="number" min={0} step={0.01} placeholder="0.00" value={orderDiscount || ''} onChange={(e) => setOrderDiscount(Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-semibold">รายการสินค้า <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="ค้นหาสินค้าเพื่อเพิ่ม (ชื่อ / SKU)..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9" />
                {productSearch.length >= 2 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-[#1E293B] border dark:border-slate-700/60 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searchingProducts ? (
                      <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />กำลังค้นหา...</div>
                    ) : productResults.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">ไม่พบสินค้า</div>
                    ) : productResults.map((p) => (
                      <button key={p.id} type="button" className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-sm border-b dark:border-slate-700/60 last:border-0" onClick={() => addProduct(p)}>
                        <span className="font-medium dark:text-slate-200">{p.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">({p.sku})</span>
                        <span className="float-right text-slate-500 dark:text-slate-400 text-xs">ราคาทุน: ฿{fmt(p.costPrice)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {items.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400">
                        <th className="text-left px-3 py-2 font-medium">สินค้า</th>
                        <th className="text-center px-3 py-2 font-medium w-20">จำนวน</th>
                        <th className="text-center px-3 py-2 font-medium w-28">ราคาทุน/ชิ้น</th>
                        <th className="text-center px-3 py-2 font-medium w-24">ส่วนลด</th>
                        <th className="text-right px-3 py-2 font-medium w-28">รวม</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const lineTotal = item.unitCost * item.quantity - item.discount
                        return (
                          <tr key={idx} className="border-b dark:border-slate-700/60 last:border-0">
                            <td className="px-3 py-2"><p className="font-medium text-slate-900 dark:text-slate-200 text-sm">{item.productName}</p><p className="text-xs text-muted-foreground">{item.sku}</p></td>
                            <td className="px-3 py-2"><Input type="number" min={1} className="h-8 text-center text-sm" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Math.max(1, Number(e.target.value) || 1))} /></td>
                            <td className="px-3 py-2"><Input type="number" min={0} step={0.01} className="h-8 text-right text-sm" value={item.unitCost} onChange={(e) => updateItem(idx, 'unitCost', Number(e.target.value) || 0)} /></td>
                            <td className="px-3 py-2"><Input type="number" min={0} step={0.01} className="h-8 text-right text-sm" placeholder="0" value={item.discount || ''} onChange={(e) => updateItem(idx, 'discount', Number(e.target.value) || 0)} /></td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-200">฿{fmt(lineTotal)}</td>
                            <td className="px-3 py-2 text-center"><button type="button" className="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors" onClick={() => removeItem(idx)}><X className="h-4 w-4" /></button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg py-8 text-center text-sm text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />ค้นหาและเพิ่มสินค้าด้านบน
                </div>
              )}
            </div>
            {items.length > 0 && (
              <div className="space-y-1.5 text-sm border-t dark:border-slate-700/60 pt-4">
                <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>ยอดรวมสินค้า</span><span>฿{fmt(itemsSubtotal)}</span></div>
                {orderDiscount > 0 && <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>ส่วนลดรวม</span><span className="text-red-600 dark:text-red-400">-฿{fmt(orderDiscount)}</span></div>}
                {vatPercent > 0 && <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>VAT {vatPercent}%</span><span>฿{fmt(vatAmount)}</span></div>}
                <div className="flex justify-between font-bold text-base text-slate-900 dark:text-slate-50 border-t dark:border-slate-700/60 pt-2 mt-1"><span>มูลค่ารวมทั้งสิ้น</span><span className="text-blue-700 dark:text-blue-400">฿{fmt(grandTotal)}</span></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Textarea rows={2} placeholder="หมายเหตุเพิ่มเติม..." value={note} onChange={(e) => setNote(e.target.value)} className="text-sm resize-none" />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={createMutation.isPending}>ยกเลิก</Button>
            <Button variant="outline" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate('DRAFT')} className="gap-2">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}บันทึก Draft
            </Button>
            <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate('ORDERED')} className="gap-2">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}สั่งซื้อเลย
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ DETAIL DIALOG ═══════════════ */}
      <Dialog open={!!detailId} onOpenChange={(v: boolean) => { if (!v) setDetailId(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {loadingDetail || !detail ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">กำลังโหลด...</span></div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-base">{detail.poNumber}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CFG[detail.status].cls}`}>{STATUS_CFG[detail.status].label}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PAY_STATUS_CFG[detail.paymentStatus ?? 'UNPAID'].cls}`}>{PAY_STATUS_CFG[detail.paymentStatus ?? 'UNPAID'].label}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div><p className="text-muted-foreground text-xs mb-0.5">ซัพพลายเออร์</p><p className="font-semibold">{detail.supplier.name}</p>{detail.supplier.phone && <p className="text-muted-foreground text-xs">{detail.supplier.phone}</p>}</div>
                  <div><p className="text-muted-foreground text-xs mb-0.5">ผู้สร้าง PO</p><p className="font-semibold">{detail.createdBy.name}</p><p className="text-muted-foreground text-xs">{new Date(detail.createdAt).toLocaleDateString('th-TH')}</p></div>
                  {detail.expectedDate && <div><p className="text-muted-foreground text-xs mb-0.5">วันที่คาดว่าจะรับ</p><p className="font-semibold">{new Date(detail.expectedDate).toLocaleDateString('th-TH')}</p></div>}
                  {detail.note && <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">หมายเหตุ</p><p>{detail.note}</p></div>}
                </div>

                {/* Items */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 dark:bg-slate-800/60 border-b dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400"><th className="text-left px-3 py-2 font-medium">สินค้า</th><th className="text-center px-3 py-2 font-medium">สั่ง</th><th className="text-center px-3 py-2 font-medium">รับแล้ว</th><th className="text-center px-3 py-2 font-medium">คงเหลือ</th><th className="text-right px-3 py-2 font-medium">ราคา/ชิ้น</th><th className="text-right px-3 py-2 font-medium">รวม</th></tr></thead>
                    <tbody>
                      {detail.items.map((item) => {
                        const remaining = item.quantity - item.receivedQty
                        return (
                          <tr key={item.id} className="border-b dark:border-slate-700/60 last:border-0">
                            <td className="px-3 py-2"><p className="font-medium text-slate-900 dark:text-slate-200">{item.product.name}</p><p className="text-xs text-muted-foreground">{item.product.sku}</p></td>
                            <td className="px-3 py-2 text-center">{item.quantity}</td>
                            <td className="px-3 py-2 text-center"><span className={item.receivedQty > 0 ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-slate-400 dark:text-slate-500 dark:text-slate-600'}>{item.receivedQty}</span></td>
                            <td className="px-3 py-2 text-center"><span className={remaining > 0 ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-slate-400 dark:text-slate-500 dark:text-slate-600'}>{remaining}</span></td>
                            <td className="px-3 py-2 text-right">฿{fmt(Number(item.unitCost))}</td>
                            <td className="px-3 py-2 text-right font-semibold">฿{fmt(Number(item.total))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totals + payment summary */}
                <div className="space-y-1.5 text-sm border-t dark:border-slate-700/60 pt-3">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>ยอดรวมสินค้า</span><span>฿{fmt(Number(detail.subtotal))}</span></div>
                  {Number(detail.discount) > 0 && <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>ส่วนลด</span><span className="text-red-600 dark:text-red-400">-฿{fmt(Number(detail.discount))}</span></div>}
                  {Number(detail.vatAmount) > 0 && <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>VAT {Number(detail.vatPercent)}%</span><span>฿{fmt(Number(detail.vatAmount))}</span></div>}
                  <div className="flex justify-between font-bold text-base border-t dark:border-slate-700/60 pt-2 mt-1"><span>มูลค่ารวมทั้งสิ้น</span><span className="text-blue-700 dark:text-blue-400">฿{fmt(Number(detail.total))}</span></div>
                  {Number(detail.paidTotal) > 0 && <>
                    <div className="flex justify-between text-green-700 dark:text-green-400"><span>จ่ายแล้ว</span><span>฿{fmt(Number(detail.paidTotal))}</span></div>
                    <div className="flex justify-between font-semibold text-red-600 dark:text-red-400"><span>ยอดค้างชำระ</span><span>฿{fmt(Math.max(0, Number(detail.total) - Number(detail.paidTotal)))}</span></div>
                  </>}
                </div>

                {/* Payment history */}
                {(detail.payments?.length ?? 0) > 0 && (
                  <div className="border dark:border-slate-700/60 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800/60 border-b dark:border-slate-700/60 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <History className="h-3.5 w-3.5" />ประวัติการจ่ายเงิน
                    </div>
                    {detail.payments!.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm border-b dark:border-slate-700/60 last:border-0">
                        <ArrowUpFromLine className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="font-medium text-slate-900 dark:text-slate-200">{PAY_METHOD_LABEL[p.paymentMethod]}</span>
                          {p.note && <span className="text-muted-foreground text-xs ml-2">({p.note})</span>}
                        </div>
                        <span className="text-red-600 dark:text-red-400 font-semibold">฿{fmt(Number(p.amount))}</span>
                        <span className="text-xs text-muted-foreground min-w-[110px] text-right">{fmtDate(p.paidAt)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Stock movement history */}
                <div className="border-t dark:border-slate-700/60 pt-4">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><History className="h-4 w-4" />ประวัติการรับสินค้า</p>
                  {loadingMovements ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2"><Loader2 className="h-4 w-4 animate-spin" />กำลังโหลด...</div>
                  ) : movements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการรับสินค้า</p>
                  ) : (
                    <div className="space-y-1.5">
                      {movements.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 text-sm py-1.5 border-b dark:border-slate-700/60 last:border-0">
                          <ChevronRight className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                          <div className="flex-1"><span className="font-medium text-slate-900 dark:text-slate-200">{m.product.name}</span><span className="text-muted-foreground ml-1.5 text-xs">({m.product.sku})</span></div>
                          <span className="text-green-700 dark:text-green-400 font-semibold">+{m.quantity} ชิ้น</span>
                          <span className="text-xs text-muted-foreground min-w-[120px] text-right">{fmtDate(m.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {['DRAFT', 'ORDERED', 'PARTIAL_RECEIVED'].includes(detail.status) && (
                  <div className="flex gap-2 pt-1 border-t flex-wrap">
                    {detail.status === 'DRAFT' && (
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: detail.id, data: { status: 'ORDERED' } })}>
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-blue-600" />}ยืนยันสั่งซื้อ
                      </Button>
                    )}
                    {['ORDERED', 'PARTIAL_RECEIVED'].includes(detail.status) && (
                      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => { setDetailId(null); openReceive(detail) }}>
                        <PackageCheck className="h-4 w-4" />รับสินค้าเข้า
                      </Button>
                    )}
                    {detail.paymentStatus !== 'PAID' && (
                      <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => { setDetailId(null); openPay(detail) }}>
                        <Banknote className="h-4 w-4" />บันทึกจ่ายเงิน
                      </Button>
                    )}
                    {['DRAFT', 'ORDERED'].includes(detail.status) && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50 ml-auto" disabled={updateMutation.isPending}
                        onClick={() => { setCancelTarget({ id: detail.id, poNumber: detail.poNumber }); setDetailId(null) }}>
                        <Ban className="h-4 w-4" />ยกเลิก PO
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════ RECEIVE GOODS DIALOG ═══════════════ */}
      <Dialog open={!!receiveId} onOpenChange={(v: boolean) => { if (!v) setReceiveId(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {loadingReceiveDetail || !receiveDetail ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">กำลังโหลด...</span></div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-green-600" />รับสินค้าเข้า Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/60 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-800 dark:text-blue-300 font-mono">{receiveDetail.poNumber}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CFG[receiveDetail.status].cls}`}>{STATUS_CFG[receiveDetail.status].label}</span>
                  </div>
                  <p className="text-blue-700 dark:text-blue-400 mt-0.5">{receiveDetail.supplier.name}</p>
                </div>
                <div className="border dark:border-slate-700/60 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 dark:bg-slate-800/60 border-b dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400"><th className="text-left px-3 py-2 font-medium">สินค้า</th><th className="text-center px-3 py-2 font-medium w-16">สั่ง</th><th className="text-center px-3 py-2 font-medium w-16">รับแล้ว</th><th className="text-center px-3 py-2 font-medium w-20">คงเหลือ</th><th className="text-center px-3 py-2 font-medium w-28">รับครั้งนี้</th></tr></thead>
                    <tbody>
                      {receiveDetail.items.map((item) => {
                        const remaining = item.quantity - item.receivedQty
                        const thisQty = receiveQtys[item.id] ?? 0
                        const isOver = thisQty > remaining
                        return (
                          <tr key={item.id} className="border-b dark:border-slate-700/60 last:border-0">
                            <td className="px-3 py-2.5"><p className="font-medium text-slate-900 dark:text-slate-200">{item.product.name}</p><p className="text-xs text-muted-foreground">{item.product.sku}</p></td>
                            <td className="px-3 py-2.5 text-center text-slate-700 dark:text-slate-300">{item.quantity}</td>
                            <td className="px-3 py-2.5 text-center"><span className={item.receivedQty > 0 ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-slate-400 dark:text-slate-500 dark:text-slate-600'}>{item.receivedQty}</span></td>
                            <td className="px-3 py-2.5 text-center">{remaining > 0 ? <span className="text-orange-600 dark:text-orange-400 font-medium">{remaining}</span> : <span className="text-slate-400 dark:text-slate-500 dark:text-slate-600">ครบแล้ว</span>}</td>
                            <td className="px-3 py-2.5">
                              {remaining > 0 ? (
                                <div>
                                  <Input type="number" min={0} max={remaining} className={`h-8 text-center text-sm ${isOver ? 'border-red-400' : ''}`} value={thisQty || ''} placeholder="0" onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setReceiveQtys((prev) => ({ ...prev, [item.id]: v })) }} />
                                  {isOver && <p className="text-red-500 text-[10px] mt-0.5 text-center">เกิน {remaining}</p>}
                                </div>
                              ) : <div className="text-center text-green-600 text-xs font-medium">✓ ครบ</div>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5" onClick={() => { const all: Record<string, number> = {}; receiveDetail.items.forEach((item) => { all[item.id] = item.quantity - item.receivedQty }); setReceiveQtys(all) }}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />รับครบทั้งหมด
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-8 text-muted-foreground" onClick={() => { const zero: Record<string, number> = {}; receiveDetail.items.forEach((item) => { zero[item.id] = 0 }); setReceiveQtys(zero) }}>รีเซ็ต</Button>
                </div>
                <div className="space-y-1.5">
                  <Label>หมายเหตุ (ไม่บังคับ)</Label>
                  <Textarea rows={2} placeholder="เช่น ตรวจสอบโดย... พัสดุมาถึง..." value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} className="text-sm resize-none" />
                </div>
                {Object.values(receiveQtys).some((q) => q > 0) && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/60 px-4 py-3 text-sm">
                    <p className="font-semibold text-green-800 dark:text-green-300 mb-1">สรุปการรับครั้งนี้</p>
                    {receiveDetail.items.filter((item) => (receiveQtys[item.id] ?? 0) > 0).map((item) => (
                      <div key={item.id} className="flex justify-between text-green-700 dark:text-green-400"><span>{item.product.name}</span><span className="font-semibold">+{receiveQtys[item.id]} ชิ้น</span></div>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setReceiveId(null)} disabled={receiveMutation.isPending}>ยกเลิก</Button>
                <Button disabled={!canReceiveSubmit || receiveMutation.isPending || receiveDetail.items.some((item) => (receiveQtys[item.id] ?? 0) > item.quantity - item.receivedQty)}
                  className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => receiveId && receiveMutation.mutate(receiveId)}>
                  {receiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}ยืนยันรับสินค้าเข้า Stock
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════ PAYMENT DIALOG ═══════════════ */}
      <Dialog open={!!payId} onOpenChange={(v: boolean) => { if (!v) setPayId(null) }}>
        <DialogContent className="max-w-md">
          {loadingPayDetail || !payDetail ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">กำลังโหลด...</span></div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-blue-600" />
                  บันทึกการจ่ายเงิน Supplier
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                {/* PO Info */}
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border dark:border-slate-700/60 px-4 py-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PO</span>
                    <span className="font-mono font-semibold">{payDetail.poNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ซัพพลายเออร์</span>
                    <span className="font-medium">{payDetail.supplier.name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-1">
                    <span className="text-muted-foreground">ยอดรวม</span>
                    <span className="font-semibold">฿{fmt(Number(payDetail.total))}</span>
                  </div>
                  {Number(payDetail.paidTotal) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">จ่ายแล้ว</span>
                      <span className="text-green-600 font-semibold">฿{fmt(Number(payDetail.paidTotal))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold">
                    <span>ยอดค้างชำระ</span>
                    <span className="text-red-600">฿{fmt(payRemaining)}</span>
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label>จำนวนเงินที่จ่าย <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0.01}
                      max={payRemaining}
                      step={0.01}
                      placeholder="0.00"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className={payAmountNum > payRemaining + 0.001 ? 'border-red-400' : ''}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap text-xs"
                      onClick={() => setPayAmount(payRemaining.toFixed(2))}
                    >
                      จ่ายครบ
                    </Button>
                  </div>
                  {payAmountNum > payRemaining + 0.001 && (
                    <p className="text-red-500 text-xs">ไม่สามารถจ่ายเกินยอดค้าง (฿{fmt(payRemaining)})</p>
                  )}
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <Label>วิธีชำระเงิน</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMethod(m)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all ${payMethod === m ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-slate-700/60 hover:border-slate-300 dark:border-slate-600/60 dark:hover:border-slate-600 dark:text-slate-300'}`}
                      >
                        {m === 'CASH' ? <Banknote className="h-5 w-5" /> : m === 'TRANSFER' ? <ArrowUpFromLine className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                        {PAY_METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <Label>หมายเหตุ (ไม่บังคับ)</Label>
                  <Textarea rows={2} placeholder="เช่น โอนเลขที่... วันที่..." value={payNote} onChange={(e) => setPayNote(e.target.value)} className="text-sm resize-none" />
                </div>

                {/* Preview */}
                {payAmountNum > 0 && payAmountNum <= payRemaining + 0.001 && (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${payAmountNum >= payRemaining - 0.001 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/60' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/60'}`}>
                    <p className={`font-semibold mb-1 ${payAmountNum >= payRemaining - 0.001 ? 'text-green-800 dark:text-green-300' : 'text-blue-800 dark:text-blue-300'}`}>
                      {payAmountNum >= payRemaining - 0.001 ? '✓ จ่ายครบ — PO จะเปลี่ยนเป็น "จ่ายครบแล้ว"' : 'จ่ายบางส่วน'}
                    </p>
                    <div className={`flex justify-between ${payAmountNum >= payRemaining - 0.001 ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}>
                      <span>จ่าย {PAY_METHOD_LABEL[payMethod]}</span>
                      <span className="font-bold">฿{fmt(payAmountNum)}</span>
                    </div>
                    {payAmountNum < payRemaining - 0.001 && (
                      <div className="flex justify-between text-blue-700 dark:text-blue-400 mt-0.5">
                        <span>คงเหลือหลังจ่าย</span>
                        <span className="font-semibold">฿{fmt(payRemaining - payAmountNum)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setPayId(null)} disabled={payMutation.isPending}>ยกเลิก</Button>
                <Button disabled={!canPaySubmit} className="gap-2" onClick={() => payId && payMutation.mutate(payId)}>
                  {payMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  บันทึกการจ่ายเงิน
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════ CANCEL CONFIRM ═══════════════ */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(v: boolean) => { if (!v) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />ยืนยันยกเลิก PO?</AlertDialogTitle>
            <AlertDialogDescription>PO <strong>{cancelTarget?.poNumber}</strong> จะถูกยกเลิกและไม่สามารถแก้ไขได้อีก</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ไม่ยกเลิก</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled={updateMutation.isPending}
              onClick={() => cancelTarget && updateMutation.mutate({ id: cancelTarget.id, data: { status: 'CANCELLED' } })}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}ยกเลิก PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
