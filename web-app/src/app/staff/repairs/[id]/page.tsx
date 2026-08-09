'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Phone, Printer, Loader2,
  Package, DollarSign, CheckCircle2, Clock,
  User, Wrench, AlertTriangle, Shield,
  Search, Pencil, Check, X, Trash2, Plus,
  CreditCard, Banknote, RotateCcw, Camera, Info, Lock,
  ArrowRightLeft, History, ChevronDown,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import api from '@/lib/api'
import { printRepairReceipt } from '@/lib/print'
import { isInWebViewApp, bridgePrintRepairIntake } from '@/lib/webview-bridge'
import { Platform } from '@/lib/platform'
import { getAssetUrl } from '@/lib/utils'
import type { PrintRepairIntakeOptions } from '@/lib/printer'
import { RepairReceiptPrintFlow } from '@/components/sunmi/repair-receipt-print'
import { RepairDeliveryPrintFlow } from '@/components/sunmi/repair-delivery-print'
import { CrossBranchAvailabilityDialog } from '@/components/products/cross-branch-availability-dialog'
import { useAuthStore } from '@/store/auth.store'
import type { Repair, Product, ShopSettings } from '@/types'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RECEIVED:         'รับงานใหม่',
  DIAGNOSING:       'ตรวจวินิจฉัย',
  WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  QC_PENDING:       'รอ QC',
  COMPLETED:        'ซ่อมเสร็จ',
  READY_PICKUP:     'รอรับเครื่อง',
  DELIVERED:        'ส่งมอบแล้ว',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  QC_PENDING:       'bg-indigo-100 text-indigo-700',
  COMPLETED:        'bg-green-100 text-green-700',
  READY_PICKUP:     'bg-emerald-100 text-emerald-700',
  DELIVERED:        'bg-slate-100 text-slate-600',
  CANCELLED:        'bg-red-100 text-red-600',
}

const STATUS_FLOW = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
  'WAITING_PARTS', 'IN_PROGRESS', 'QC_PENDING', 'COMPLETED',
  'READY_PICKUP', 'DELIVERED',
]

const CHANGEABLE_STATUSES = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'WAITING_PARTS',
  'IN_PROGRESS', 'COMPLETED', 'READY_PICKUP', 'CANCELLED',
]

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  PHONE: 'มือถือ', SIM: 'ซิม', ACCESSORY: 'อุปกรณ์เสริม', PART: 'อะไหล่',
}

const PRODUCT_TYPE_COLOR: Record<string, string> = {
  PHONE: 'bg-blue-100 text-blue-700',
  SIM: 'bg-green-100 text-green-700',
  ACCESSORY: 'bg-purple-100 text-purple-700',
  PART: 'bg-orange-100 text-orange-700',
}

type Tab = 'info' | 'parts' | 'payment'
type PayMethod = 'CASH' | 'TRANSFER' | 'CARD'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n?: number | null) {
  if (n == null || n === 0) return null
  return Number(n).toLocaleString('th-TH') + ' ฿'
}

function fmtDate(s?: string | null) {
  if (!s) return null
  try { return format(new Date(s), 'd MMM yyyy HH:mm', { locale: th }) }
  catch { return s }
}

function pmLabel(pm?: string | null) {
  if (pm === 'CASH') return 'เงินสด'
  if (pm === 'TRANSFER') return 'โอนเงิน'
  if (pm === 'CARD') return 'บัตรเครดิต'
  return pm ?? ''
}

function errMsg(err: unknown) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message
  return Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด'
}

function useDebounce<T>(value: T, delay: number) {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return d
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepairDetailPage() {
  const router      = useRouter()
  const { id }      = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const canViewCost = hasPermission('products.view_cost')

  // UI state
  const [activeTab, setActiveTab]                   = useState<Tab>('info')
  const [selectedStatus, setSelectedStatus]         = useState('')
  const [showPrintFlow, setShowPrintFlow]           = useState(false)
  const [showDeliveryPrint, setShowDeliveryPrint]   = useState(false)
  const [lightboxIdx, setLightboxIdx]               = useState<number | null>(null)
  const [deviceHistoryOpen, setDeviceHistoryOpen]   = useState(false)

  // IMEI edit
  const [imeiEditing, setImeiEditing]               = useState(false)
  const [imeiValue, setImeiValue]                   = useState('')

  // Parts
  const [partSearch, setPartSearch]                 = useState('')
  const debouncedSearch                             = useDebounce(partSearch, 300)
  const [searchOpen, setSearchOpen]                 = useState(false)
  const searchRef                                   = useRef<HTMLDivElement>(null)
  const [addingPart, setAddingPart]                 = useState<Product | null>(null)
  const [partQty, setPartQty]                       = useState(1)
  const [partPrice, setPartPrice]                   = useState('')
  const [chargeCustomer, setChargeCustomer]         = useState(false)
  const [transferPart, setTransferPart]             = useState<Product | null>(null)

  // Estimate
  const [laborCost, setLaborCost]                   = useState('')
  const [approvalNote, setApprovalNote]             = useState('')

  // Payment
  const [payOpen, setPayOpen]                       = useState(false)
  const [payMethod, setPayMethod]                   = useState<PayMethod>('CASH')
  const [payAmount, setPayAmount]                   = useState('')
  const [reverseOpen, setReverseOpen]               = useState(false)
  const [reverseReason, setReverseReason]           = useState('')
  const [addPayOpen, setAddPayOpen]                 = useState(false)
  const [addPayAmount, setAddPayAmount]             = useState('')
  const [addPayMethod, setAddPayMethod]             = useState<PayMethod>('CASH')
  const [addPayNote, setAddPayNote]                 = useState('')

  // ── Queries

  const { data: repair, isLoading } = useQuery<Repair>({
    queryKey: ['staff-repair', id],
    queryFn:  async () => (await api.get(`/repairs/${id}`)).data,
    enabled:  !!id,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const { data: currentShift } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn:  async () => {
      try { return (await api.get('/shifts/current')).data }
      catch { return null }
    },
    staleTime: 30_000,
  })

  const repairBranchId = (repair?.branchId as string | null | undefined) ?? undefined

  const { data: partProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'repair-stock', debouncedSearch, repairBranchId],
    queryFn:  async () =>
      (await api.get('/products', {
        params: {
          search: debouncedSearch || undefined,
          ...(repairBranchId ? { branchId: repairBranchId } : {}),
        },
      })).data,
    enabled:  searchOpen,
    staleTime: 30_000,
  })

  const { data: deviceHistory = [] } = useQuery<Repair[]>({
    queryKey: ['device-history', repair?.deviceImei],
    queryFn:  async () =>
      (await api.get('/repairs/device-history', { params: { imei: repair!.deviceImei } })).data,
    enabled:  !!repair?.deviceImei && deviceHistoryOpen,
    staleTime: 60_000,
  })

  // Close search dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sync from repair
  useEffect(() => {
    if (repair) {
      setSelectedStatus(repair.status)
      setImeiValue(repair.deviceImei ?? '')
      setLaborCost(repair.estimatedLaborCost != null ? String(repair.estimatedLaborCost) : '')
      setApprovalNote(repair.approvalNote ?? '')
    }
  }, [repair])

  // Pre-fill payment amount when form opens
  useEffect(() => {
    if (payOpen && repair) {
      const bal = Math.max(0, Number(repair.estimatedTotal ?? repair.estimateCost ?? 0) - Number(repair.deposit ?? 0))
      setPayMethod('CASH')
      setPayAmount(String(bal))
    }
  }, [payOpen, repair])

  // ── Mutations

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/repairs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      queryClient.invalidateQueries({ queryKey: ['staff-repairs'] })
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  })

  const addPartMutation = useMutation({
    mutationFn: (data: { productId: string; quantity: number; price?: number; chargeToCustomer?: boolean }) =>
      api.post(`/repairs/${id}/parts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      toast.success('เพิ่มอะไหล่แล้ว')
      setAddingPart(null)
      setPartSearch('')
      setPartQty(1)
      setPartPrice('')
      setChargeCustomer(false)
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  })

  const deletePartMutation = useMutation({
    mutationFn: (partId: string) => api.delete(`/repairs/${id}/parts/${partId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      toast.success('ลบอะไหล่แล้ว')
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  })

  const paymentMutation = useMutation({
    mutationFn: (data: { paymentMethod: string; amountPaid: number }) =>
      api.post(`/repairs/${id}/payment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      toast.success('รับเงินสำเร็จ — งานซ่อมส่งคืนแล้ว')
      setPayOpen(false)
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  })

  const reversePaymentMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${id}/reverse-payment`, { reason: reverseReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      toast.success('ยกเลิกการชำระเงินสำเร็จ')
      setReverseOpen(false)
      setReverseReason('')
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  })

  const additionalPaymentMutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${id}/additional-payment`, {
        amount: Number(addPayAmount),
        paymentMethod: addPayMethod,
        note: addPayNote || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      toast.success('บันทึกการรับเงินเพิ่มเติมสำเร็จ')
      setAddPayOpen(false)
      setAddPayAmount('')
      setAddPayNote('')
    },
    onError: (err: unknown) => toast.error(errMsg(err)),
  })

  // ── Handlers

  function handleStatusChange() {
    if (!selectedStatus || selectedStatus === repair?.status) return
    updateMutation.mutate(
      { status: selectedStatus },
      { onSuccess: () => toast.success(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[selectedStatus]}" แล้ว`) },
    )
  }

  function handleSaveImei() {
    updateMutation.mutate(
      { deviceImei: imeiValue.trim() || null },
      { onSuccess: () => { setImeiEditing(false); toast.success('บันทึก IMEI แล้ว') } },
    )
  }

  function handleSendEstimate() {
    if (!repair) return
    updateMutation.mutate(
      {
        estimatedLaborCost: Number(laborCost) || 0,
        estimatedPartsCost: computedCustomerPartsCost,
        estimatedTotal:     computedTotal,
        status:             'WAITING_APPROVAL',
      },
      { onSuccess: () => toast.success('ส่งใบประเมินแล้ว') },
    )
  }

  function handleApprove() {
    updateMutation.mutate(
      { status: 'APPROVED', approvalNote: approvalNote || undefined },
      { onSuccess: () => toast.success('บันทึกการอนุมัติแล้ว') },
    )
  }

  function handleAddPart() {
    if (!addingPart) return
    addPartMutation.mutate({
      productId:        addingPart.id,
      quantity:         partQty,
      chargeToCustomer: chargeCustomer || undefined,
      price:            partPrice ? Number(partPrice) : undefined,
    })
  }

  function handlePayment() {
    const amount = Number(payAmount)
    if (!amount || amount < 0) { toast.error('กรุณาระบุจำนวนเงิน'); return }
    paymentMutation.mutate({ paymentMethod: payMethod, amountPaid: amount })
  }

  // ── Loading

  if (isLoading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB]">
      <Loader2 className="h-8 w-8 animate-spin text-[#FFC107]" />
    </div>
  )
  if (!repair) return null

  // ── Computed

  const curIdx    = STATUS_FLOW.indexOf(repair.status)
  const isLocked  = repair.status === 'COMPLETED' || repair.status === 'DELIVERED'
  const isFullyPaid = repair.paymentStatus === 'PAID'
  const hasShift  = !!currentShift

  const repairTotal   = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
  const repairDeposit = Number(repair.deposit ?? 0)
  const repairBalance = Math.max(0, repairTotal - repairDeposit)
  const payAmountNum  = Number(payAmount) || 0
  const payChange     = payAmountNum - repairBalance

  const activeParts = repair.parts.filter((p) => !p.isVoided)

  const computedPartsCost = activeParts.reduce(
    (s, p) => s + Number(p.price) * p.quantity, 0,
  )
  const computedCustomerPartsCost = activeParts
    .filter((p) => p.chargeToCustomer)
    .reduce((s, p) => s + Number(p.sellPrice ?? 0) * p.quantity, 0)
  const computedTotal = (Number(laborCost) || 0) + computedCustomerPartsCost

  const canEstimate = !isLocked && !['CANCELLED', 'APPROVED', 'WAITING_APPROVAL'].includes(repair.status)

  function handlePrintIntake() {
    if (!repair) return
    if (Platform.isNative()) {
      setShowPrintFlow(true)
    } else if (isInWebViewApp()) {
      const opts: PrintRepairIntakeOptions = {
        shopName:       settings?.shopName    ?? 'FixITPro',
        shopPhone:      settings?.shopPhone   ?? undefined,
        ticketNumber:   repair.ticketNumber,
        date:           fmtDate(repair.receivedAt) ?? repair.receivedAt,
        customerName:   repair.customer?.name ?? '—',
        customerPhone:  (repair.customer as { phone?: string } | undefined)?.phone ?? undefined,
        deviceBrand:    repair.deviceBrand,
        deviceModel:    repair.deviceModel,
        deviceColor:    repair.deviceColor    ?? undefined,
        deviceImei:     repair.deviceImei     ?? undefined,
        issue:          repair.issue,
        accessories:    repair.accessories
          ? repair.accessories.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        deposit:        Number(repair.deposit ?? 0),
        estimateCost:   repair.estimateCost ? Number(repair.estimateCost) : undefined,
        technicianName: repair.technician?.name ?? undefined,
        footer:         settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
      }
      bridgePrintRepairIntake(opts)
    } else {
      printRepairReceipt(repair.id, { paperWidth: '80mm' })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-44">

        {/* Header */}
        <div className="bg-white px-5 pb-3 pt-14 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400">รายละเอียดงานซ่อม</p>
              <p className="font-bold text-[#111] font-mono">{repair.ticketNumber}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold shrink-0 ${STATUS_COLOR[repair.status] ?? 'bg-slate-100 text-slate-500'}`}>
              {STATUS_LABEL[repair.status] ?? repair.status}
            </span>
          </div>

          {/* Tabs */}
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-[#F8F9FB] p-1">
            {(['info', 'parts', 'payment'] as const).map((tab) => {
              const labels: Record<Tab, string> = { info: 'ข้อมูล', parts: 'อะไหล่', payment: 'ชำระ' }
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`h-9 rounded-xl text-sm font-semibold transition-colors ${
                    activeTab === tab ? 'bg-white text-[#111] shadow-sm' : 'text-slate-400'
                  }`}>
                  {labels[tab]}
                </button>
              )
            })}
          </div>
        </div>

        {/* ══ Tab: ข้อมูล ══════════════════════════════════════════════════════ */}

        {activeTab === 'info' && (
          <div className="flex flex-col gap-4 p-5">

            {/* Customer */}
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/10">
                    <User className="h-5 w-5 text-[#FFC107]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[#111] truncate">{repair.customer?.name ?? 'ไม่ระบุลูกค้า'}</p>
                    {repair.customer?.phone && (
                      <p className="text-sm text-slate-500">{repair.customer.phone}</p>
                    )}
                  </div>
                </div>
                {repair.customer?.phone && (
                  <a href={`tel:${repair.customer.phone}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]">
                    <Phone className="h-4 w-4 text-emerald-500" />
                  </a>
                )}
              </div>
            </div>

            {/* Device */}
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3 flex-1 min-w-0 rounded-xl bg-[#F8F9FB] p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/10">
                    <span className="text-xl">📱</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#111] truncate">
                      {repair.deviceBrand} {repair.deviceModel}
                      {repair.deviceColor ? ` (${repair.deviceColor})` : ''}
                    </p>

                    {/* IMEI inline edit */}
                    <div className="mt-0.5 flex items-center gap-1 min-w-0">
                      {imeiEditing ? (
                        <>
                          <input value={imeiValue} onChange={(e) => setImeiValue(e.target.value)}
                            placeholder="กรอก IMEI / Serial"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveImei()
                              if (e.key === 'Escape') setImeiEditing(false)
                            }}
                            className="flex-1 min-w-0 text-xs font-mono bg-white rounded-lg px-2 py-1 border border-blue-300 outline-none" autoFocus />
                          <button onClick={handleSaveImei} disabled={updateMutation.isPending}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
                            {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </button>
                          <button onClick={() => { setImeiEditing(false); setImeiValue(repair.deviceImei ?? '') }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-400 font-mono">IMEI: {repair.deviceImei ?? '—'}</span>
                          {repair.status !== 'DELIVERED' && repair.status !== 'CANCELLED' && (
                            <button onClick={() => setImeiEditing(true)}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-300">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-0.5 truncate">อาการ: {repair.issue}</p>
                  </div>
                </div>

                {/* Device history toggle */}
                {repair.deviceImei && !imeiEditing && (
                  <button onClick={() => setDeviceHistoryOpen(!deviceHistoryOpen)}
                    className="ml-2 flex shrink-0 items-center gap-1 text-xs text-blue-600 font-medium">
                    <History className="h-3.5 w-3.5" />
                    <ChevronDown className={`h-3 w-3 transition-transform ${deviceHistoryOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

              {/* Device history */}
              {deviceHistoryOpen && repair.deviceImei && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-400">ประวัติซ่อม IMEI นี้</p>
                  {deviceHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">ยังไม่มีประวัติการซ่อม</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {deviceHistory.filter((h) => h.id !== repair.id).map((h) => (
                        <div key={h.id} className="flex items-start justify-between gap-2 text-xs bg-[#F8F9FB] rounded-lg px-2.5 py-1.5">
                          <div className="min-w-0">
                            <p className="font-medium text-[#111] truncate">{h.issue}</p>
                            <p className="text-slate-400">{STATUS_LABEL[h.status] ?? h.status} · {h.technician?.name ?? 'ไม่ระบุช่าง'}</p>
                          </div>
                          <span className="text-slate-400 shrink-0 whitespace-nowrap">
                            {h.receivedAt ? format(new Date(h.receivedAt), 'dd/MM/yy', { locale: th }) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {repair.accessories && (
                <p className="mt-2 text-xs text-slate-500 px-1">อุปกรณ์ที่ฝาก: {repair.accessories}</p>
              )}
              {repair.technician && (
                <div className="mt-3 flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-400">ช่าง:</span>
                  <span className="text-xs font-semibold text-[#111]">{repair.technician.name}</span>
                </div>
              )}
              {repair.note && (
                <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2">
                  <p className="text-xs text-amber-700">หมายเหตุ: {repair.note}</p>
                </div>
              )}
            </div>

            {/* Photos */}
            {repair.images && repair.images.length > 0 && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 mb-3">
                  <Camera className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-bold text-[#111]">รูปภาพ ({repair.images.length})</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {repair.images.map((img, idx) => (
                    <button key={img.id} onClick={() => setLightboxIdx(idx)}
                      className="aspect-square rounded-xl overflow-hidden bg-slate-100">
                      <img src={getAssetUrl(img.url)} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-4 text-sm font-bold text-[#111]">ความคืบหน้า</p>
              {repair.status === 'CANCELLED' ? (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-600">งานซ่อมถูกยกเลิก</span>
                </div>
              ) : (
                <div className="flex flex-col gap-0">
                  {STATUS_FLOW.map((s, i) => {
                    const done = i < curIdx; const current = i === curIdx; const isLast = i === STATUS_FLOW.length - 1
                    return (
                      <div key={s} className="flex gap-3.5">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            current ? 'bg-[#FFC107] text-[#111] shadow-[0_4px_12px_rgba(255,193,7,0.4)]' :
                            done    ? 'bg-[#22C55E] text-white' : 'bg-slate-100 text-slate-300'
                          }`}>{done ? '✓' : i + 1}</div>
                          {!isLast && <div className={`my-1 w-0.5 h-6 ${done ? 'bg-[#22C55E]' : 'bg-slate-100'}`} />}
                        </div>
                        <div className={`pt-1.5 ${isLast ? '' : 'pb-2'}`}>
                          <p className={`text-sm font-semibold ${current ? 'text-[#111]' : done ? 'text-[#22C55E]' : 'text-slate-300'}`}>
                            {STATUS_LABEL[s]}
                          </p>
                          {current && <p className="text-[11px] text-slate-400">{fmtDate(repair.receivedAt)}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Warranty */}
            {repair.warrantyExpiresAt && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-emerald-100">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#111]">การรับประกัน</p>
                    <p className="text-xs text-emerald-600 mt-0.5">หมดอายุ {fmtDate(repair.warrantyExpiresAt)}</p>
                    {repair.warrantyNote && <p className="text-xs text-slate-400 mt-0.5">{repair.warrantyNote}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex flex-col gap-1 px-1">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-slate-300" />
                <p className="text-xs text-slate-400">รับงาน {fmtDate(repair.receivedAt)}</p>
              </div>
              {repair.completedAt && <p className="text-xs text-slate-400 pl-5">ซ่อมเสร็จ {fmtDate(repair.completedAt)}</p>}
              {repair.deliveredAt && <p className="text-xs text-slate-400 pl-5">ส่งมอบ {fmtDate(repair.deliveredAt)}</p>}
            </div>
          </div>
        )}

        {/* ══ Tab: อะไหล่ ══════════════════════════════════════════════════════ */}

        {activeTab === 'parts' && (
          <div className="flex flex-col gap-4 p-5">

            {/* Parts list */}
            <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-bold text-[#111]">อะไหล่ ({activeParts.length})</p>
                  {isLocked && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      <Lock className="h-3 w-3" /> ล็อกแล้ว
                    </span>
                  )}
                </div>
                {!isLocked && !addingPart && (
                  <button onClick={() => setSearchOpen(true)}
                    className="flex items-center gap-1 h-8 px-3 rounded-xl bg-[#FFC107] text-xs font-bold text-[#111]">
                    <Plus className="h-3.5 w-3.5" /> เพิ่ม
                  </button>
                )}
              </div>

              {activeParts.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 text-slate-300">
                  <Package className="h-8 w-8" />
                  <p className="text-xs">ยังไม่มีอะไหล่</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeParts.map((part) => {
                    const name    = part.productName ?? part.product.name
                    const cost    = Number(part.price) * part.quantity
                    const sell    = Number(part.sellPrice ?? 0) * part.quantity
                    const deducted = part.stockMovements.length > 0
                    return (
                      <div key={part.id} className="flex items-center gap-3 rounded-xl bg-[#F8F9FB] px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#111] truncate">{name}</p>
                          <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-1.5">
                            <span>×{part.quantity}</span>
                            {canViewCost && <span>· ต้นทุน {fmtMoney(Number(part.price))}/ชิ้น</span>}
                            {part.chargeToCustomer
                              ? <span className="text-blue-600 font-medium">· คิดลูกค้า {fmtMoney(Number(part.sellPrice ?? 0))}/ชิ้น</span>
                              : <span className="text-slate-400">· ไม่คิดลูกค้า</span>}
                            {deducted && <span className="text-green-600 font-medium">· ตัดสต็อกแล้ว</span>}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-[#111] tabular-nums shrink-0 mr-1">
                          {part.chargeToCustomer ? fmtMoney(sell) : fmtMoney(cost)}
                        </span>
                        {!isLocked && (
                          <button onClick={() => {
                            if (window.confirm(`ลบ "${name}"?`)) deletePartMutation.mutate(part.id)
                          }} disabled={deletePartMutation.isPending}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 active:bg-red-50 shrink-0 disabled:opacity-40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <div className="flex justify-between text-sm font-semibold border-t border-[#F8F9FB] pt-2">
                    <span className="text-slate-500">รวมค่าอะไหล่ (ลูกค้า)</span>
                    <span className="tabular-nums text-blue-700">{fmtMoney(computedCustomerPartsCost) ?? '0 ฿'}</span>
                  </div>
                  {canViewCost && computedPartsCost > 0 && (
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>ต้นทุนอะไหล่รวม</span>
                      <span className="tabular-nums">{fmtMoney(computedPartsCost)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Product search — shown inline when no part selected yet */}
              {!isLocked && !addingPart && (
                <div ref={searchRef} className="relative mt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                    <input value={partSearch}
                      onChange={(e) => { setPartSearch(e.target.value); setSearchOpen(true) }}
                      onFocus={() => setSearchOpen(true)}
                      placeholder="ค้นหาสินค้า/อะไหล่..."
                      className="w-full h-10 rounded-xl bg-[#F8F9FB] pl-9 pr-3 text-sm outline-none" />
                  </div>
                  {searchOpen && partProducts.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {partProducts.map((p) => {
                        const stockQty  = p.branchQuantity ?? 0
                        const isOut     = stockQty === 0
                        const hasOther  = (p.otherBranchTotal ?? 0) > 0
                        return (
                          <div key={p.id} className={`flex items-center border-b last:border-0 ${isOut && !hasOther ? 'opacity-50' : ''}`}>
                            <button
                              className="flex-1 text-left px-3 py-2.5 active:bg-blue-50 disabled:cursor-not-allowed"
                              disabled={isOut}
                              onClick={() => {
                                if (isOut) return
                                setAddingPart(p)
                                setPartSearch('')
                                setSearchOpen(false)
                                setPartQty(1)
                                setPartPrice('')
                                setChargeCustomer(false)
                              }}
                            >
                              <p className="text-sm font-semibold text-[#111] flex items-center gap-1.5 flex-wrap">
                                {p.name}
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRODUCT_TYPE_COLOR[p.type] ?? 'bg-slate-100 text-slate-500'}`}>
                                  {PRODUCT_TYPE_LABEL[p.type] ?? p.type}
                                </span>
                              </p>
                              <p className="text-xs text-slate-400">
                                SKU: {p.sku} · สต็อก: {isOut ? <span className="text-red-500 font-semibold">หมด</span> : stockQty}
                                {canViewCost && ` · ราคาทุน: ${fmtMoney(p.costPrice)}`}
                              </p>
                            </button>
                            {isOut && hasOther && (
                              <button onClick={(e) => { e.stopPropagation(); setSearchOpen(false); setTransferPart(p) }}
                                className="shrink-0 mr-2 flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 active:bg-orange-100">
                                <ArrowRightLeft className="h-3 w-3" /> ขอโอน
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {searchOpen && debouncedSearch && partProducts.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm text-slate-400 text-center">
                      ไม่พบสินค้า
                    </div>
                  )}
                </div>
              )}

              {/* Part detail form — after selecting a product */}
              {!isLocked && addingPart && (
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#111] truncate flex-1">{addingPart.name}</p>
                    <button onClick={() => { setAddingPart(null); setChargeCustomer(false); setPartPrice('') }}
                      className="text-slate-400 ml-2"><X className="h-4 w-4" /></button>
                  </div>
                  <p className="text-xs text-slate-400">
                    SKU: {addingPart.sku} · สต็อก: {addingPart.branchQuantity ?? addingPart.stock} ชิ้น
                    {canViewCost && ` · ราคาทุน: ${fmtMoney(addingPart.costPrice)}`}
                  </p>

                  {/* chargeToCustomer toggle */}
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-xs font-medium text-slate-700">คิดเงินลูกค้าเพิ่ม</span>
                    <button type="button" onClick={() => { setChargeCustomer((v) => !v); setPartPrice('') }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${chargeCustomer ? 'bg-blue-600' : 'bg-slate-300'}`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${chargeCustomer ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">จำนวน</label>
                      <input type="number" min={1} max={addingPart.branchQuantity ?? addingPart.stock}
                        value={partQty} onChange={(e) => setPartQty(Number(e.target.value))}
                        className="w-full h-10 rounded-xl bg-white border border-slate-200 px-3 text-sm font-semibold text-center outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">
                        {chargeCustomer ? 'ราคาคิดลูกค้า/ชิ้น' : `ราคา/ชิ้น${canViewCost ? ' (ว่าง=ราคาทุน)' : ''}`}
                      </label>
                      <input type="number" min={0}
                        placeholder={chargeCustomer ? String(addingPart.price) : (canViewCost ? String(addingPart.costPrice) : '0')}
                        value={partPrice} onChange={(e) => setPartPrice(e.target.value)}
                        className={`w-full h-10 rounded-xl bg-white px-3 text-sm outline-none border ${chargeCustomer ? 'border-blue-400' : 'border-slate-200'}`} />
                    </div>
                  </div>

                  {chargeCustomer && (
                    <p className="text-xs text-blue-600">ราคานี้จะบวกเพิ่มในบิลลูกค้า</p>
                  )}

                  <button onClick={handleAddPart}
                    disabled={partQty < 1 || addPartMutation.isPending}
                    className="w-full h-11 rounded-xl bg-[#FFC107] text-sm font-bold text-[#111] flex items-center justify-center gap-2 disabled:opacity-60">
                    {addPartMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> เพิ่มอะไหล่{chargeCustomer ? ' (คิดลูกค้า)' : ''}</>}
                  </button>
                </div>
              )}
            </div>

            {/* Estimate */}
            {!isLocked && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-blue-50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> ประมาณราคาซ่อม
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-600 w-28 shrink-0">ค่าแรง (฿)</label>
                    <input type="number" min={0} placeholder="0" value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)}
                      className="flex-1 h-10 rounded-xl bg-[#F8F9FB] px-3 text-sm outline-none" />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-28 shrink-0">ค่าอะไหล่ (ลูกค้า)</span>
                    <span className="text-sm font-medium tabular-nums text-[#111]">
                      {fmtMoney(computedCustomerPartsCost) ?? '0 ฿'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 border-t border-[#F8F9FB] pt-2">
                    <span className="text-sm font-bold text-[#111] w-28 shrink-0">รวมประมาณ</span>
                    <span className="text-base font-bold text-[#FFC107] tabular-nums">{computedTotal.toLocaleString('th-TH')} ฿</span>
                  </div>
                </div>

                {repair.estimatedTotal != null && (
                  <div className="mt-3 text-xs text-slate-400 bg-[#F8F9FB] rounded-xl px-3 py-2 space-y-0.5">
                    <p>ประมาณล่าสุด: <span className="font-semibold text-[#111]">{fmtMoney(Number(repair.estimatedTotal))}</span></p>
                    {repair.approvedAt && <p className="text-green-600">อนุมัติเมื่อ {fmtDate(repair.approvedAt)}</p>}
                    {repair.approvalNote && <p>หมายเหตุ: {repair.approvalNote}</p>}
                  </div>
                )}

                {canEstimate && (
                  <button onClick={handleSendEstimate} disabled={updateMutation.isPending}
                    className="mt-3 w-full h-12 rounded-2xl bg-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {updateMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Clock className="h-4 w-4" /> ส่งใบประเมิน (รอลูกค้าอนุมัติ)</>}
                  </button>
                )}
              </div>
            )}

            {/* Approve */}
            {repair.status === 'WAITING_APPROVAL' && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-amber-500" />
                  <p className="text-sm font-bold text-amber-700">รอลูกค้าอนุมัติราคา</p>
                </div>
                <p className="text-sm text-amber-800 mb-3">
                  ประมาณการ: <span className="font-bold">{fmtMoney(Number(repair.estimatedTotal))}</span>
                  {repair.estimatedLaborCost != null && (
                    <span className="text-xs ml-1 opacity-70">
                      (ค่าแรง {fmtMoney(Number(repair.estimatedLaborCost))} + อะไหล่ {fmtMoney(Number(repair.estimatedPartsCost))})
                    </span>
                  )}
                </p>
                <div className="space-y-3">
                  <input value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="หมายเหตุการอนุมัติ (ไม่บังคับ)"
                    className="w-full h-11 rounded-xl bg-[#F8F9FB] px-3 text-sm outline-none" />
                  <button onClick={handleApprove} disabled={updateMutation.isPending}
                    className="w-full h-12 rounded-2xl bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {updateMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><CheckCircle2 className="h-4 w-4" /> ลูกค้าอนุมัติแล้ว</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: ชำระ ════════════════════════════════════════════════════════ */}

        {activeTab === 'payment' && (
          <div className="flex flex-col gap-4 p-5">

            {/* Cost summary */}
            {repairTotal > 0 && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-bold text-[#111]">ค่าบริการ</p>
                </div>
                <div className="space-y-2 text-sm">
                  {Number(repair.estimatedLaborCost) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">ค่าแรง</span>
                      <span className="font-semibold tabular-nums">{fmtMoney(Number(repair.estimatedLaborCost))}</span>
                    </div>
                  )}
                  {Number(repair.estimatedPartsCost) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">ค่าอะไหล่</span>
                      <span className="font-semibold tabular-nums">{fmtMoney(Number(repair.estimatedPartsCost))}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base border-t border-[#F8F9FB] pt-2 mt-1">
                    <span className="text-[#111]">รวมทั้งหมด</span>
                    <span className="text-[#FFC107]">{fmtMoney(repairTotal)}</span>
                  </div>
                  {repairDeposit > 0 && (
                    <div className="flex justify-between text-emerald-600 text-xs">
                      <span>หักค่ามัดจำแล้ว</span>
                      <span className="tabular-nums">- {fmtMoney(repairDeposit)}</span>
                    </div>
                  )}
                  {!isFullyPaid && repairBalance > 0 && (
                    <div className="flex justify-between font-bold text-blue-700">
                      <span>ยอดค้างชำระ</span>
                      <span className="tabular-nums text-base">{fmtMoney(repairBalance)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment form — only when COMPLETED + PENDING */}
            {repair.status === 'COMPLETED' && repair.paymentStatus === 'PENDING' && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-green-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-3">
                  <CheckCircle2 className="h-3.5 w-3.5" /> ซ่อมเสร็จแล้ว — พร้อมส่งมอบ
                </div>
                {!hasShift && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                    <Lock className="h-3.5 w-3.5 shrink-0" /> กรุณาเปิดกะก่อนรับเงิน
                  </div>
                )}
                {!payOpen ? (
                  <button onClick={() => setPayOpen(true)} disabled={!hasShift}
                    className="w-full h-14 rounded-2xl bg-[#FFC107] text-base font-bold text-[#111] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,193,7,0.4)] disabled:opacity-50">
                    <DollarSign className="h-5 w-5" /> ส่งมอบ / รับเงิน
                  </button>
                ) : (
                  <div className="space-y-3">
                    {/* Payment method */}
                    <div className="grid grid-cols-3 gap-2">
                      {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => (
                        <button key={m} onClick={() => { setPayMethod(m); setPayAmount(String(repairBalance)) }}
                          className={`h-12 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors ${
                            payMethod === m ? 'bg-[#FFC107] text-[#111]' : 'bg-[#F8F9FB] text-slate-500'
                          }`}>
                          {m === 'CASH' ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                          {pmLabel(m)}
                        </button>
                      ))}
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">
                        {payMethod === 'CASH' ? 'รับเงินมา (฿)' : 'ยอดชำระ (฿)'}
                      </label>
                      <input type="number" min={0}
                        value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                        readOnly={payMethod !== 'CASH'}
                        className={`w-full h-12 rounded-xl px-3 text-lg font-bold text-center outline-none ${
                          payMethod !== 'CASH' ? 'bg-slate-100 text-slate-500' : 'bg-[#F8F9FB]'
                        }`} />
                    </div>

                    {/* Cash change */}
                    {payMethod === 'CASH' && (
                      <div className={`flex justify-between items-center rounded-xl px-4 py-3 border ${
                        payChange < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                      }`}>
                        <span className={`font-medium ${payChange < 0 ? 'text-red-700' : 'text-green-800'}`}>เงินทอน</span>
                        <span className={`text-xl font-bold tabular-nums ${payChange < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {payChange < 0
                            ? `ขาดอีก ${Math.abs(payChange).toLocaleString('th-TH')} ฿`
                            : `${payChange.toLocaleString('th-TH')} ฿`}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => setPayOpen(false)}
                        className="flex-1 h-12 rounded-xl border border-slate-200 text-sm text-slate-600">
                        ยกเลิก
                      </button>
                      <button onClick={handlePayment} disabled={paymentMutation.isPending || (payMethod === 'CASH' && payChange < 0)}
                        className="flex-1 h-12 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                        {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> ยืนยันรับเงิน</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paid badge */}
            {isFullyPaid && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-600">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> ชำระเงินแล้ว
                  </div>
                  <button onClick={() => setReverseOpen(true)}
                    className="text-xs text-red-500 font-semibold bg-red-50 px-3 py-1 rounded-lg">
                    ยกเลิก
                  </button>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">ยอดรับ</span>
                    <span className="font-medium tabular-nums">{fmtMoney(Number(repair.paidAmount ?? 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ช่องทาง</span>
                    <span className="font-medium">{pmLabel(repair.paymentMethod)}</span>
                  </div>
                  {repair.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">วันที่</span>
                      <span className="text-slate-600">{fmtDate(repair.paidAt)}</span>
                    </div>
                  )}
                </div>

                {/* Additional payments list */}
                {repair.additionalPayments && repair.additionalPayments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                    <p className="text-xs font-semibold text-slate-400">ชำระเพิ่มเติม</p>
                    {repair.additionalPayments.map((ap) => (
                      <div key={ap.id} className="flex justify-between text-xs">
                        <span className="text-slate-400">{fmtDate(ap.createdAt)} · {pmLabel(ap.paymentMethod)}</span>
                        <span className="font-medium tabular-nums">+{fmtMoney(Number(ap.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Additional payment button */}
                {!addPayOpen ? (
                  <button onClick={() => setAddPayOpen(true)}
                    className="mt-3 w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> รับชำระเพิ่มเติม
                  </button>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => (
                        <button key={m} onClick={() => setAddPayMethod(m)}
                          className={`h-11 rounded-xl text-xs font-semibold flex items-center justify-center transition-colors ${
                            addPayMethod === m ? 'bg-blue-100 text-blue-700' : 'bg-[#F8F9FB] text-slate-500'
                          }`}>{pmLabel(m)}</button>
                      ))}
                    </div>
                    <input type="number" value={addPayAmount} onChange={(e) => setAddPayAmount(e.target.value)}
                      placeholder="จำนวนเงิน (฿)" className="w-full h-11 rounded-xl bg-[#F8F9FB] px-3 text-sm outline-none" />
                    <input value={addPayNote} onChange={(e) => setAddPayNote(e.target.value)}
                      placeholder="หมายเหตุ (ไม่บังคับ)" className="w-full h-11 rounded-xl bg-[#F8F9FB] px-3 text-sm outline-none" />
                    <div className="flex gap-2">
                      <button onClick={() => { setAddPayOpen(false); setAddPayAmount(''); setAddPayNote('') }}
                        className="flex-1 h-11 rounded-xl border border-slate-200 text-sm text-slate-600">ยกเลิก</button>
                      <button onClick={() => additionalPaymentMutation.mutate()}
                        disabled={!Number(addPayAmount) || additionalPaymentMutation.isPending}
                        className="flex-1 h-11 rounded-xl bg-blue-500 text-white text-sm font-bold flex items-center justify-center disabled:opacity-60">
                        {additionalPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reverse payment */}
            {reverseOpen && (
              <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-red-100">
                <p className="text-sm font-bold text-red-600 mb-1">ยกเลิกการชำระเงิน</p>
                <p className="text-xs text-slate-400 mb-3">งานซ่อมจะกลับไปสถานะ "ซ่อมเสร็จ" และต้องรับชำระใหม่</p>
                <div className="space-y-2.5">
                  <input value={reverseReason} onChange={(e) => setReverseReason(e.target.value)}
                    placeholder="เหตุผล เช่น กดผิด / ลูกค้าขอยกเลิก"
                    className="w-full h-11 rounded-xl bg-[#F8F9FB] px-3 text-sm outline-none border border-red-100" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => { setReverseOpen(false); setReverseReason('') }}
                      className="flex-1 h-11 rounded-xl border border-slate-200 text-sm text-slate-600">ยกเลิก</button>
                    <button onClick={() => reversePaymentMutation.mutate()}
                      disabled={!reverseReason.trim() || reversePaymentMutation.isPending}
                      className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-bold flex items-center justify-center disabled:opacity-60">
                      {reversePaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยันยกเลิก'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom actions ──────────────────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 bg-[#F8F9FB] px-5 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{ bottom: 'calc(70px + env(safe-area-inset-bottom))', paddingBottom: '12px' }}>
        {repair.status !== 'DELIVERED' && repair.status !== 'CANCELLED' && (
          <div className="flex gap-2 mb-2">
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
              className="flex-1 h-10 rounded-xl bg-white border border-[#E5E7EB] px-3 text-sm font-medium text-[#111] outline-none">
              {CHANGEABLE_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button onClick={handleStatusChange}
              disabled={selectedStatus === repair.status || updateMutation.isPending}
              className="flex h-10 items-center justify-center px-4 rounded-xl bg-[#FFC107] text-sm font-bold text-[#111] disabled:opacity-40">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          {isFullyPaid && (
            <button onClick={() => { if (Platform.isNative()) setShowDeliveryPrint(true); else window.open(`/print/delivery/${id}?paper=80mm&copies=2`, '_blank') }}
              className="flex-1 h-11 rounded-2xl bg-emerald-600 text-xs font-bold text-white flex items-center justify-center gap-1.5">
              <Printer className="h-3.5 w-3.5" /> ใบเสร็จ
            </button>
          )}
          <button onClick={handlePrintIntake}
            className={`h-11 rounded-2xl bg-[#FFC107] text-xs font-bold text-[#111] flex items-center justify-center gap-1.5 ${isFullyPaid ? 'flex-1' : 'flex-[2]'}`}>
            <Printer className="h-3.5 w-3.5" /> ใบรับซ่อม
          </button>
          {repair.customer?.phone && (
            <a href={`tel:${repair.customer.phone}`}
              className="flex-1 h-11 rounded-2xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#111] flex items-center justify-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-emerald-500" /> โทร
            </a>
          )}
        </div>
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────────────── */}
      {lightboxIdx !== null && repair.images && repair.images.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}>
          <button className="absolute right-4 top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(null) }}>
            <X className="h-5 w-5" />
          </button>
          {lightboxIdx > 0 && (
            <button className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1) }}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {lightboxIdx < repair.images.length - 1 && (
            <button className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1) }}>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          <img src={getAssetUrl(repair.images[lightboxIdx].url)} alt=""
            className="max-w-[90vw] max-h-[80vh] object-contain"
            onClick={(e) => e.stopPropagation()} />
          {repair.images.length > 1 && (
            <div className="absolute bottom-8 flex gap-1.5">
              {repair.images.map((_, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); setLightboxIdx(i) }}
                  className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIdx ? 'bg-white' : 'bg-white/30'}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}
      <CrossBranchAvailabilityDialog
        open={!!transferPart}
        onClose={() => setTransferPart(null)}
        product={transferPart}
        currentBranchId={repairBranchId}
      />

      {showPrintFlow && (
        <RepairReceiptPrintFlow repairId={id} onClose={() => setShowPrintFlow(false)} />
      )}
      {showDeliveryPrint && (
        <RepairDeliveryPrintFlow repairId={id} onClose={() => setShowDeliveryPrint(false)} />
      )}
    </>
  )
}
