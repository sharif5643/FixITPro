'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Loader2, Wrench, User, Smartphone, ClipboardList, Printer,
  Plus, Trash2, Package, CheckCircle2, Clock, DollarSign, X,
  Banknote, CreditCard as CardIcon, Smartphone as TransferIcon, Lock,
  Camera, ChevronLeft, ChevronRight, ArrowRightLeft,
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatThaiMoney, getAssetUrl } from '@/lib/utils'
import { RepairReceiptPreviewDialog } from '@/components/receipt/receipt-preview-dialog'
import { CrossBranchAvailabilityDialog } from '@/components/products/cross-branch-availability-dialog'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import type { Repair, RepairStatus, Product } from '@/types'

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED:         'รับงาน',
  DIAGNOSING:       'ตรวจสอบ',
  WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  QC_PENDING:       'รอ QC',
  COMPLETED:        'ซ่อมเสร็จ',
  READY_PICKUP:     'พร้อมรับเครื่อง',
  DELIVERED:        'ส่งคืนแล้ว',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<RepairStatus, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  QC_PENDING:       'bg-indigo-100 text-indigo-700',
  COMPLETED:        'bg-green-100 text-green-700',
  READY_PICKUP:     'bg-emerald-100 text-emerald-700',
  DELIVERED:        'bg-gray-100 text-gray-700',
  CANCELLED:        'bg-red-100 text-red-700',
}

// DELIVERED is set via payment only, not via status dropdown
const CHANGEABLE_STATUSES: RepairStatus[] = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
  'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]

const PAYMENT_OPTIONS = [
  { value: 'CASH',     label: 'เงินสด',    Icon: Banknote },
  { value: 'TRANSFER', label: 'โอนเงิน',   Icon: TransferIcon },
  { value: 'CARD',     label: 'บัตรเครดิต', Icon: CardIcon },
] as const

interface RepairDetailDialogProps {
  repairId: string | null
  onClose: () => void
  onStatusChange?: () => void
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="font-medium text-gray-900 break-all">{value}</span>
    </div>
  )
}

function fmtDate(dateStr?: string | null) {
  if (!dateStr) return undefined
  try {
    return format(new Date(dateStr), 'dd MMM yyyy HH:mm', { locale: th })
  } catch {
    return dateStr
  }
}

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function RepairDetailDialog({ repairId, onClose, onStatusChange }: RepairDetailDialogProps) {
  const queryClient = useQueryClient()

  const { data: repair, isLoading } = useQuery<Repair>({
    queryKey: ['repairs', repairId],
    queryFn: async () => (await api.get(`/repairs/${repairId}`)).data,
    enabled: !!repairId,
  })

  const { data: currentShift } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  const [localStatus, setLocalStatus] = useState<RepairStatus>('RECEIVED')
  const [printOpen, setPrintOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Parts search
  const [partSearch, setPartSearch] = useState('')
  const [addingPart, setAddingPart] = useState<Product | null>(null)
  const [partQty, setPartQty] = useState(1)
  const [partPrice, setPartPrice] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const debouncedSearch = useDebounce(partSearch, 300)
  const [transferPart, setTransferPart] = useState<Product | null>(null)

  // Estimate
  const [laborCost, setLaborCost] = useState('')
  const [approvalNote, setApprovalNote] = useState('')

  // Payment dialog state
  const [payOpen, setPayOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [payAmount, setPayAmount] = useState('')
  // Reverse payment dialog
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  // Additional payment dialog
  const [addPayOpen, setAddPayOpen] = useState(false)
  const [addPayAmount, setAddPayAmount] = useState('')
  const [addPayMethod, setAddPayMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [addPayNote, setAddPayNote] = useState('')

  const { hasPermission, user: authUser } = useAuthStore()
  const repairBranchId = (repair?.branchId as string | null | undefined) ?? undefined
  const canViewCost = hasPermission('products.view_cost')
  const canReverse = hasPermission('repair.close') || repair?.paymentStatus === 'PAID'

  useEffect(() => {
    if (repair) {
      setLocalStatus(repair.status)
      setLaborCost(repair.estimatedLaborCost != null ? String(repair.estimatedLaborCost) : '')
      setApprovalNote(repair.approvalNote ?? '')
    }
  }, [repair])

  // Reset payment form when dialog opens
  useEffect(() => {
    if (payOpen && repair) {
      const total = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
      const deposit = Number(repair.deposit ?? 0)
      const balance = Math.max(0, total - deposit)
      setPayMethod('CASH')
      setPayAmount(String(balance))
    }
  }, [payOpen, repair])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: partProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'repair-stock', debouncedSearch, repairBranchId],
    queryFn: async () => {
      const products = (await api.get('/products', {
        params: {
          search: debouncedSearch || undefined,
          ...(repairBranchId ? { branchId: repairBranchId } : {}),
        },
      })).data
      return products
    },
    enabled: searchOpen,
    staleTime: 30_000,
  })

  const computedPartsCost = Array.isArray(repair?.parts)
    ? repair.parts.reduce(
        (sum, p) => sum + Number(p.price) * p.quantity,
        0
      )
    : 0
  const computedTotal = (Number(laborCost) || 0) + computedPartsCost

  // Locks: cannot modify parts when COMPLETED or DELIVERED
  const isLocked = repair?.status === 'COMPLETED' || repair?.status === 'DELIVERED'

  const addPartMutation = useMutation({
    mutationFn: ({ productId, quantity, price }: { productId: string; quantity: number; price?: number }) =>
      api.post(`/repairs/${repairId}/parts`, { productId, quantity, price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      setAddingPart(null)
      setPartSearch('')
      setPartQty(1)
      setPartPrice('')
      toast.success('เพิ่มอะไหล่แล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const removePartMutation = useMutation({
    mutationFn: (partId: string) => api.delete(`/repairs/${repairId}/parts/${partId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      toast.success('ลบอะไหล่แล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/repairs/${repairId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      onStatusChange?.()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const paymentMutation = useMutation({
    mutationFn: (data: { paymentMethod: string; amountPaid: number }) =>
      api.post(`/repairs/${repairId}/payment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      setPayOpen(false)
      toast.success('รับเงินสำเร็จ — งานซ่อมส่งคืนแล้ว')
      onStatusChange?.()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const reverseMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${repairId}/reverse-payment`, { reason: reverseReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      setReverseOpen(false)
      setReverseReason('')
      toast.success('ยกเลิกการชำระเงินสำเร็จ — งานซ่อมกลับสู่สถานะ "ซ่อมเสร็จ"')
      onStatusChange?.()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const addPaymentMutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${repairId}/additional-payment`, {
        amount: Number(addPayAmount),
        paymentMethod: addPayMethod,
        note: addPayNote || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      setAddPayOpen(false)
      setAddPayAmount('')
      setAddPayNote('')
      toast.success('บันทึกการรับเงินเพิ่มเติมสำเร็จ')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const handleStatusSave = () => {
    updateMutation.mutate({ status: localStatus }, {
      onSuccess: () => toast.success('อัปเดตสถานะสำเร็จ'),
    })
  }

  const handleSendEstimate = () => {
    updateMutation.mutate({
      estimatedLaborCost: Number(laborCost) || 0,
      estimatedPartsCost: computedPartsCost,
      estimatedTotal: computedTotal,
      status: 'WAITING_APPROVAL',
    }, {
      onSuccess: () => toast.success('ส่งประมาณราคาให้ลูกค้าแล้ว'),
    })
  }

  const handleApprove = () => {
    updateMutation.mutate({
      status: 'APPROVED',
      approvalNote: approvalNote || undefined,
    }, {
      onSuccess: () => toast.success('บันทึกการอนุมัติแล้ว'),
    })
  }

  const handleAddPart = () => {
    if (!addingPart) return
    addPartMutation.mutate({
      productId: addingPart.id,
      quantity: partQty,
      price: partPrice ? Number(partPrice) : undefined,
    })
  }

  const handlePayment = () => {
    const amount = Number(payAmount)
    if (!amount || amount < 0) {
      toast.error('กรุณาระบุจำนวนเงิน')
      return
    }
    paymentMutation.mutate({ paymentMethod: payMethod, amountPaid: amount })
  }

  if (!repairId) return null

  // Payment calculation
  const repairTotal = repair ? Number(repair.estimatedTotal ?? repair.estimateCost ?? 0) : 0
  const repairDeposit = repair ? Number(repair.deposit ?? 0) : 0
  const repairBalance = Math.max(0, repairTotal - repairDeposit)
  const payAmountNum = Number(payAmount) || 0
  const payChange = payAmountNum - repairBalance

  return (
    <>
      <Dialog open={!!repairId} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {isLoading || !repair ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังโหลด...
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <Wrench className="h-4.5 w-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
                    <span className="font-mono">{repair.ticketNumber}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => setPrintOpen(true)}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    พิมพ์ใบรับงาน
                  </Button>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>กำลังโหลด...</span>
            </div>
          )}

          {repair && (
            <div className="space-y-5">
              {/* Status badge + date */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_COLOR[repair.status]}`}>
                  {STATUS_LABEL[repair.status]}
                </span>
                <span className="text-xs text-muted-foreground">
                  รับงาน: {fmtDate(repair.receivedAt)}
                </span>
              </div>

              {/* Customer */}
              {repair.customer && (
                <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    <User className="h-3.5 w-3.5" />
                    ข้อมูลลูกค้า
                  </div>
                  <InfoRow label="ชื่อ" value={repair.customer.name} />
                  <InfoRow label="เบอร์โทร" value={repair.customer.phone} />
                </div>
              )}

              {/* Device */}
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  <Smartphone className="h-3.5 w-3.5" />
                  ข้อมูลอุปกรณ์
                </div>
                <InfoRow label="ยี่ห้อ / รุ่น" value={`${repair.deviceBrand} ${repair.deviceModel}`} />
                <InfoRow label="IMEI / Serial" value={repair.deviceImei} />
              </div>

              {/* Issue */}
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  <ClipboardList className="h-3.5 w-3.5" />
                  อาการและหมายเหตุ
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs mb-0.5">อาการ</p>
                  <p className="font-medium text-gray-900 whitespace-pre-wrap">{repair.issue}</p>
                </div>
                {repair.note && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs mb-0.5">หมายเหตุ</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{repair.note}</p>
                  </div>
                )}
              </div>

              {/* ─── Repair Photos ─── */}
              <div className="rounded-xl border bg-gray-50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  <Camera className="h-3.5 w-3.5" />
                  รูปถ่ายเครื่อง
                  {repair.images && repair.images.length > 0 && (
                    <span className="ml-1 text-blue-600">({repair.images.length} รูป)</span>
                  )}
                </div>
                {repair.images && repair.images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {repair.images.map((img, idx) => (
                      <button
                        key={img.id}
                        onClick={() => setLightboxIdx(idx)}
                        className="aspect-square overflow-hidden rounded-lg bg-gray-200 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <img
                          src={getAssetUrl(img.url)}
                          alt={`รูปที่ ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">ยังไม่มีรูปถ่าย</p>
                )}
              </div>

              {/* ─── Spare Parts Management ─── */}
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <Package className="h-3.5 w-3.5" />
                    อะไหล่ที่ใช้ซ่อม
                  </div>
                  {isLocked && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      <Lock className="h-3 w-3" />
                      ล็อกแล้ว
                    </span>
                  )}
                </div>

                {/* Current parts list */}
                {repair.parts.length > 0 && (
                  <div className="space-y-1.5">
                    {repair.parts.map((part) => {
                      const deducted = part.stockMovements.length > 0
                      return (
                        <div key={part.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{part.product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ×{part.quantity} · {formatThaiMoney(Number(part.price))} / ชิ้น
                              {deducted && (
                                <span className="ml-1.5 text-green-600 font-medium">ตัดสต็อกแล้ว</span>
                              )}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums shrink-0">
                            {formatThaiMoney(Number(part.price) * part.quantity)}
                          </span>
                          {!isLocked && (
                            <button
                              onClick={() => removePartMutation.mutate(part.id)}
                              disabled={removePartMutation.isPending}
                              className="text-red-400 hover:text-red-600 shrink-0 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                    <div className="flex justify-between text-sm font-semibold border-t pt-2">
                      <span>รวมค่าอะไหล่</span>
                      <span className="tabular-nums text-blue-700">{formatThaiMoney(computedPartsCost)}</span>
                    </div>
                    {repair.finalCost != null && Number(repair.finalCost) > 0 && (
                      <div className="flex justify-between text-sm border-t pt-2 mt-1">
                        <span className="text-muted-foreground">กำไรประมาณ</span>
                        <span className={`font-semibold tabular-nums ${Number(repair.finalCost) - computedPartsCost >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {formatThaiMoney(Number(repair.finalCost) - computedPartsCost)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Add part UI — hidden when locked */}
                {!isLocked && (
                  addingPart ? (
                    <div className="rounded-lg border bg-blue-50/40 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate flex-1">{addingPart.name}</p>
                        <button onClick={() => setAddingPart(null)} className="text-muted-foreground hover:text-foreground ml-2">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        SKU: {addingPart.sku} · สต็อก: {addingPart.branchQuantity ?? addingPart.stock} ชิ้น{canViewCost && ` · ราคาทุน: ${formatThaiMoney(Number(addingPart.costPrice))}`}
                      </p>
                      <div className="flex gap-2">
                        <div className="space-y-1 flex-1">
                          <label className="text-xs text-muted-foreground">จำนวน</label>
                          <Input
                            type="number"
                            min={1}
                            max={addingPart.branchQuantity ?? addingPart.stock}
                            value={partQty}
                            onChange={(e) => setPartQty(Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <label className="text-xs text-muted-foreground">ราคา/ชิ้น{canViewCost && ' (ปล่อยว่าง=ราคาทุน)'}</label>
                          <Input
                            type="number"
                            min={0}
                            placeholder={canViewCost ? String(addingPart.costPrice) : '0'}
                            value={partPrice}
                            onChange={(e) => setPartPrice(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={handleAddPart}
                        disabled={partQty < 1 || partQty > (addingPart.branchQuantity ?? addingPart.stock) || addPartMutation.isPending}
                      >
                        {addPartMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        เพิ่มอะไหล่
                      </Button>
                    </div>
                  ) : (
                    <div ref={searchRef} className="relative">
                      <Input
                        placeholder="ค้นหาสินค้า/อะไหล่..."
                        value={partSearch}
                        onChange={(e) => { setPartSearch(e.target.value); setSearchOpen(true) }}
                        onFocus={() => setSearchOpen(true)}
                        className="text-sm h-9"
                      />
                      {searchOpen && partProducts.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {partProducts.map((p) => {
                            // Parts must be drawn from the current branch's BranchStock only.
                            // Never fall back to product.stock — it's a cross-branch shadow sum.
                            const stockQty  = p.branchQuantity ?? 0
                            const isOut     = stockQty === 0
                            const hasOther  = (p.otherBranchTotal ?? 0) > 0
                            const canRequest = isOut && hasOther
                            return (
                              <div
                                key={p.id}
                                className={`flex items-center justify-between border-b last:border-0 ${isOut && !canRequest ? 'opacity-50' : ''}`}
                              >
                                <button
                                  className="flex-1 text-left px-3 py-2 hover:bg-blue-50 transition-colors disabled:cursor-not-allowed"
                                  disabled={isOut}
                                  onClick={() => {
                                    if (isOut) return
                                    setAddingPart(p)
                                    setPartSearch('')
                                    setSearchOpen(false)
                                    setPartQty(1)
                                    setPartPrice('')
                                  }}
                                >
                                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                                    {p.name}
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                      p.type === 'PHONE'     ? 'bg-blue-100 text-blue-700' :
                                      p.type === 'SIM'       ? 'bg-green-100 text-green-700' :
                                      p.type === 'ACCESSORY' ? 'bg-purple-100 text-purple-700' :
                                      'bg-orange-100 text-orange-700'
                                    }`}>
                                      {p.type === 'PHONE' ? 'มือถือ' : p.type === 'SIM' ? 'ซิม' : p.type === 'ACCESSORY' ? 'อุปกรณ์เสริม' : 'อะไหล่'}
                                    </span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    SKU: {p.sku} · สต็อก: {isOut ? <span className="text-red-500">หมด</span> : stockQty}{canViewCost && ` · ราคาทุน: ${formatThaiMoney(Number(p.costPrice))}`}
                                  </p>
                                </button>
                                {canRequest && (
                                  <button
                                    className="shrink-0 mr-2 flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSearchOpen(false)
                                      setTransferPart(p)
                                    }}
                                  >
                                    <ArrowRightLeft className="h-3 w-3" />
                                    ขอโอน
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {searchOpen && debouncedSearch && partProducts.length === 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-muted-foreground text-center">
                          ไม่พบสินค้า
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* ─── Estimate Section ─── */}
              {!isLocked && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <DollarSign className="h-3.5 w-3.5" />
                    ประมาณราคาซ่อม
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-700 w-32 shrink-0">ค่าแรง (บาท)</label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={laborCost}
                        onChange={(e) => setLaborCost(e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-32 shrink-0">ค่าอะไหล่</span>
                      <span className="text-sm font-medium tabular-nums">{formatThaiMoney(computedPartsCost)}</span>
                    </div>
                    <div className="flex items-center gap-3 border-t pt-2">
                      <span className="text-sm font-bold text-gray-900 w-32 shrink-0">รวมประมาณ</span>
                      <span className="text-base font-bold text-blue-700 tabular-nums">{formatThaiMoney(computedTotal)}</span>
                    </div>
                  </div>

                  {repair.estimatedTotal != null && (
                    <div className="text-xs text-muted-foreground bg-white rounded-lg border px-3 py-2 space-y-0.5">
                      <p>ประมาณล่าสุด: <span className="font-semibold text-gray-900">{formatThaiMoney(Number(repair.estimatedTotal))}</span></p>
                      {repair.approvedAt && (
                        <p className="text-green-600">อนุมัติเมื่อ {fmtDate(repair.approvedAt)}</p>
                      )}
                      {repair.approvalNote && (
                        <p>หมายเหตุ: {repair.approvalNote}</p>
                      )}
                    </div>
                  )}

                  {repair.status !== 'APPROVED' && repair.status !== 'WAITING_APPROVAL' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={handleSendEstimate}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      ส่งประมาณราคา (รอลูกค้าอนุมัติ)
                    </Button>
                  )}
                </div>
              )}

              {/* ─── Approval Section ─── */}
              {repair.status === 'WAITING_APPROVAL' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    <Clock className="h-3.5 w-3.5" />
                    รอลูกค้าอนุมัติราคา
                  </div>
                  <p className="text-sm text-amber-800">
                    ประมาณการ: <span className="font-bold">{formatThaiMoney(Number(repair.estimatedTotal))}</span>
                    {repair.estimatedLaborCost != null && (
                      <span className="text-xs ml-1 opacity-70">
                        (ค่าแรง {formatThaiMoney(Number(repair.estimatedLaborCost))} + อะไหล่ {formatThaiMoney(Number(repair.estimatedPartsCost))})
                      </span>
                    )}
                  </p>
                  <Textarea
                    placeholder="หมายเหตุการอนุมัติ (ไม่บังคับ)"
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    rows={2}
                    className="text-sm bg-white"
                  />
                  <Button
                    className="w-full gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={handleApprove}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    ลูกค้าอนุมัติแล้ว
                  </Button>
                </div>
              )}

              {/* ─── Payment / Delivery Section ─── */}
              {repair.status === 'COMPLETED' && repair.paymentStatus === 'PENDING' && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    ซ่อมเสร็จแล้ว — พร้อมส่งมอบ
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ยอดรวม</span>
                      <span className="font-semibold tabular-nums">{formatThaiMoney(repairTotal)}</span>
                    </div>
                    {repairDeposit > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">หักค่ามัดจำแล้ว</span>
                        <span className="tabular-nums text-red-600">- {formatThaiMoney(repairDeposit)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-bold">ยอดค้างชำระ</span>
                      <span className="font-bold text-blue-700 tabular-nums text-base">{formatThaiMoney(repairBalance)}</span>
                    </div>
                  </div>
                  {!currentShift && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      กรุณาเปิดกะก่อนรับเงิน
                    </p>
                  )}
                  <Button
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    onClick={() => setPayOpen(true)}
                    disabled={!currentShift}
                  >
                    <DollarSign className="h-4 w-4" />
                    ส่งมอบ / รับเงิน
                  </Button>
                </div>
              )}

              {/* Paid badge */}
              {repair.paymentStatus === 'PAID' && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ชำระเงินแล้ว
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setReverseOpen(true)}
                    >
                      ยกเลิกการชำระ
                    </Button>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ยอดรับ</span>
                    <span className="tabular-nums font-medium">{formatThaiMoney(Number(repair.paidAmount ?? 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ช่องทาง</span>
                    <span className="font-medium">
                      {repair.paymentMethod === 'CASH' ? 'เงินสด' : repair.paymentMethod === 'TRANSFER' ? 'โอนเงิน' : 'บัตรเครดิต'}
                    </span>
                  </div>
                  {repair.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">วันที่รับเงิน</span>
                      <span>{fmtDate(repair.paidAt)}</span>
                    </div>
                  )}
                  {/* Additional payments */}
                  {repair.additionalPayments && repair.additionalPayments.length > 0 && (
                    <div className="border-t pt-2 mt-2 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">ชำระเพิ่มเติม</p>
                      {repair.additionalPayments.map((ap) => (
                        <div key={ap.id} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{fmtDate(ap.createdAt)}</span>
                          <span className="font-medium tabular-nums">+{formatThaiMoney(Number(ap.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add additional payment button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                    onClick={() => setAddPayOpen(true)}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    รับชำระเพิ่มเติม
                  </Button>
                </div>
              )}

              {/* Warranty display */}
              {repair.warrantyExpiresAt && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm space-y-0.5">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">การรับประกัน</p>
                  <p className="font-medium text-green-800">หมดประกัน: {fmtDate(repair.warrantyExpiresAt)}</p>
                  {repair.warrantyNote && <p className="text-xs text-green-600">{repair.warrantyNote}</p>}
                </div>
              )}

              {/* Cost summary */}
              <div className="rounded-xl border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">ค่าใช้จ่าย</p>
                {Number(repair.deposit) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ค่ามัดจำ</span>
                    <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.deposit))}</span>
                  </div>
                )}
                {repair.estimatedTotal != null && Number(repair.estimatedTotal) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ยอดประมาณ</span>
                    <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.estimatedTotal))}</span>
                  </div>
                )}
                {repair.finalCost != null && (
                  <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                    <span>ค่าซ่อมสุดท้าย</span>
                    <span className="text-blue-700 tabular-nums">{formatThaiMoney(Number(repair.finalCost))}</span>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground space-y-0.5">
                {repair.completedAt && <p>ซ่อมเสร็จ: {fmtDate(repair.completedAt)}</p>}
                {repair.deliveredAt && <p>ส่งคืน: {fmtDate(repair.deliveredAt)}</p>}
              </div>

              {/* Status change — DELIVERED removed (must go through payment) */}
              {repair.status !== 'DELIVERED' && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-900">เปลี่ยนสถานะงานซ่อม</p>
                  <div className="flex gap-2">
                    <Select value={localStatus} onValueChange={(v) => setLocalStatus(v as RepairStatus)}>
                      <SelectTrigger className="flex-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANGEABLE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleStatusSave}
                      disabled={localStatus === repair.status || updateMutation.isPending}
                      className="shrink-0"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'บันทึก'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" onClick={onClose} className="w-full">ปิด</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Payment Dialog ─── */}
      <Dialog open={payOpen} onOpenChange={(v) => { if (!v) setPayOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              รับเงิน / ส่งมอบงานซ่อม
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cost breakdown */}
            <div className="rounded-xl bg-slate-50 border p-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>ค่าซ่อมรวม</span>
                <span className="tabular-nums">{formatThaiMoney(repairTotal)}</span>
              </div>
              {repairDeposit > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>ค่ามัดจำชำระแล้ว</span>
                  <span className="tabular-nums">- {formatThaiMoney(repairDeposit)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>ยอดค้างชำระ</span>
                <span className="text-blue-700 tabular-nums">{formatThaiMoney(repairBalance)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label>ช่องทางชำระเงิน</Label>
              <Select
                value={payMethod}
                onValueChange={(v) => {
                  setPayMethod(v as typeof payMethod)
                  setPayAmount(String(repairBalance))
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.Icon className="h-4 w-4" />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label>{payMethod === 'CASH' ? 'รับเงินมา (บาท)' : 'ยอดชำระ (บาท)'}</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={payAmount}
                readOnly={payMethod !== 'CASH'}
                className={payMethod !== 'CASH' ? 'bg-gray-50 text-muted-foreground' : ''}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>

            {/* Change for CASH */}
            {payMethod === 'CASH' && (
              <div className={`flex justify-between items-center rounded-xl px-4 py-3 border ${
                payChange < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
              }`}>
                <span className={`font-medium ${payChange < 0 ? 'text-red-700' : 'text-green-800'}`}>
                  เงินทอน
                </span>
                <span className={`text-xl font-bold tabular-nums ${payChange < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {payChange < 0
                    ? `ขาดอีก ${formatThaiMoney(Math.abs(payChange))}`
                    : formatThaiMoney(payChange)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="pt-1">
            <Button
              variant="outline"
              onClick={() => setPayOpen(false)}
              disabled={paymentMutation.isPending}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handlePayment}
              disabled={paymentMutation.isPending || (payMethod === 'CASH' && payChange < 0)}
              className="gap-2 bg-green-600 hover:bg-green-700 min-w-[120px]"
            >
              {paymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  ยืนยันรับเงิน
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Photo Lightbox ─── */}
      {lightboxIdx !== null && repair?.images && repair.images.length > 0 && (
        <Dialog open onOpenChange={() => setLightboxIdx(null)}>
          <DialogContent className="max-w-2xl p-0 bg-black border-0 overflow-hidden">
            <div className="relative flex flex-col items-center">
              <button
                onClick={() => setLightboxIdx(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={getAssetUrl(repair.images[lightboxIdx].url)}
                alt={`รูปที่ ${lightboxIdx + 1}`}
                className="w-full max-h-[80vh] object-contain"
              />
              {repair.images.length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIdx((p) => p !== null ? (p - 1 + repair.images!.length) % repair.images!.length : 0)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setLightboxIdx((p) => p !== null ? (p + 1) % repair.images!.length : 0)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="flex gap-1.5 py-3">
                    {repair.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIdx(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIdx ? 'bg-white' : 'bg-white/30'}`}
                      />
                    ))}
                  </div>
                </>
              )}
              <p className="text-white/60 text-xs pb-3">
                {lightboxIdx + 1} / {repair.images.length}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {repairId && (
        <RepairReceiptPreviewDialog
          open={printOpen}
          repairId={repairId}
          initialData={repair}
          onClose={() => setPrintOpen(false)}
        />
      )}

      {/* ─── Reverse Payment Dialog ─── */}
      <Dialog open={reverseOpen} onOpenChange={(v) => { if (!v) setReverseOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">ยกเลิกการชำระเงิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              งานซ่อมจะกลับไปสถานะ &quot;ซ่อมเสร็จ&quot; และต้องรับชำระเงินใหม่
            </p>
            <div className="space-y-1.5">
              <Label>เหตุผล</Label>
              <Input
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="เช่น กดผิด / ลูกค้าขอยกเลิก"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)} disabled={reverseMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={!reverseReason.trim() || reverseMutation.isPending}
              onClick={() => reverseMutation.mutate()}
            >
              {reverseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cross-Branch Part Transfer Dialog ─── */}
      <CrossBranchAvailabilityDialog
        open={!!transferPart}
        onClose={() => setTransferPart(null)}
        product={transferPart}
        currentBranchId={repairBranchId}
      />

      {/* ─── Additional Payment Dialog ─── */}
      <Dialog open={addPayOpen} onOpenChange={(v) => { if (!v) setAddPayOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-600" />
              รับชำระเพิ่มเติม
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>จำนวนเงิน (บาท)</Label>
              <Input
                type="number"
                min={0}
                value={addPayAmount}
                onChange={(e) => setAddPayAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ช่องทางชำระ</Label>
              <Select value={addPayMethod} onValueChange={(v) => setAddPayMethod(v as typeof addPayMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.Icon className="h-4 w-4" />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input
                value={addPayNote}
                onChange={(e) => setAddPayNote(e.target.value)}
                placeholder="ไม่บังคับ"
              />
            </div>
          </div>
          <DialogFooter className="pt-1">
            <Button variant="outline" onClick={() => setAddPayOpen(false)} disabled={addPaymentMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              disabled={!Number(addPayAmount) || Number(addPayAmount) <= 0 || addPaymentMutation.isPending}
              onClick={() => addPaymentMutation.mutate()}
              className="gap-2"
            >
              {addPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
