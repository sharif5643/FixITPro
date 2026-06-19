'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowLeft, Wrench, User, Smartphone, ClipboardList, Printer,
  Plus, Trash2, Package, CheckCircle2, Clock, DollarSign, X,
  Banknote, CreditCard as CardIcon, Smartphone as TransferIcon, Lock,
  Camera, ChevronLeft, ChevronRight, Edit2, Save, UserCog,
  FileText, CalendarDays, AlertTriangle, RotateCcw, Shield,
  Loader2,
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatThaiMoney, getAssetUrl } from '@/lib/utils'
import { RepairReceiptPreviewDialog } from '@/components/receipt/receipt-preview-dialog'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import type { Repair, RepairStatus, Product } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED:         'รับงาน',
  DIAGNOSING:       'ตรวจสอบ',
  WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  COMPLETED:        'ซ่อมเสร็จ',
  DELIVERED:        'ส่งคืนแล้ว',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<RepairStatus, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700 border-blue-200',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700 border-yellow-200',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED:         'bg-teal-100 text-teal-700 border-teal-200',
  WAITING_PARTS:    'bg-orange-100 text-orange-700 border-orange-200',
  IN_PROGRESS:      'bg-purple-100 text-purple-700 border-purple-200',
  COMPLETED:        'bg-green-100 text-green-700 border-green-200',
  DELIVERED:        'bg-gray-100 text-gray-700 border-gray-200',
  CANCELLED:        'bg-red-100 text-red-700 border-red-200',
}

const STATUS_FLOW: RepairStatus[] = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
  'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED',
]

const CHANGEABLE_STATUSES: RepairStatus[] = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
  'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]

const PAYMENT_OPTIONS = [
  { value: 'CASH',     label: 'เงินสด',     Icon: Banknote },
  { value: 'TRANSFER', label: 'โอนเงิน',    Icon: TransferIcon },
  { value: 'CARD',     label: 'บัตรเครดิต', Icon: CardIcon },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  try { return format(new Date(dateStr), 'dd MMM yyyy HH:mm', { locale: th }) }
  catch { return dateStr }
}

function fmtDateShort(dateStr?: string | null) {
  if (!dateStr) return null
  try { return format(new Date(dateStr), 'dd MMM yy HH:mm', { locale: th }) }
  catch { return dateStr }
}

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border p-4 space-y-3 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </div>
  )
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

// ─── Status Progress Bar ───────────────────────────────────────────────────────

function StatusProgress({ status }: { status: RepairStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="bg-white rounded-xl border px-4 py-3">
        <div className="flex items-center gap-2 text-red-600">
          <X className="h-4 w-4" />
          <span className="text-sm font-semibold">งานซ่อมถูกยกเลิก</span>
        </div>
      </div>
    )
  }

  const currentIdx = STATUS_FLOW.indexOf(status)

  return (
    <div className="bg-white rounded-xl border px-4 py-3">
      <div className="flex items-center gap-0 overflow-x-auto">
        {STATUS_FLOW.map((s, i) => {
          const done = i < currentIdx
          const active = i === currentIdx
          const future = i > currentIdx
          return (
            <div key={s} className="flex items-center min-w-0 shrink-0">
              <div className="flex flex-col items-center gap-1">
                <div className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                  done    ? 'bg-blue-600 border-blue-600 text-white' :
                  active  ? 'bg-white border-blue-600 text-blue-600' :
                            'bg-gray-100 border-gray-200 text-gray-400',
                ].join(' ')}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={[
                  'text-[9px] font-medium whitespace-nowrap leading-tight',
                  active ? 'text-blue-700' : done ? 'text-blue-500' : 'text-gray-400',
                ].join(' ')}>
                  {STATUS_LABEL[s]}
                </span>
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <div className={[
                  'h-0.5 w-4 sm:w-6 shrink-0 mx-0.5 mt-[-10px]',
                  i < currentIdx ? 'bg-blue-500' : 'bg-gray-200',
                ].join(' ')} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function TimelineCard({ repair }: { repair: Repair }) {
  const events: { label: string; date: string | null | undefined; icon: React.ElementType; color: string }[] = [
    { label: 'รับงาน',         date: repair.receivedAt,      icon: ClipboardList, color: 'text-blue-500' },
    { label: 'อนุมัติแล้ว',    date: repair.approvedAt,      icon: CheckCircle2,  color: 'text-teal-500' },
    { label: 'ซ่อมเสร็จ',     date: repair.completedAt,     icon: Wrench,        color: 'text-green-500' },
    { label: 'ชำระเงิน',       date: repair.paidAt,          icon: DollarSign,    color: 'text-emerald-500' },
    { label: 'ส่งคืนลูกค้า',   date: repair.deliveredAt,     icon: CheckCircle2,  color: 'text-gray-500' },
  ].filter((e) => e.date)

  if (repair.additionalPayments) {
    repair.additionalPayments.forEach((ap) => {
      events.push({ label: `รับเพิ่ม +${formatThaiMoney(Number(ap.amount))}`, date: ap.createdAt, icon: DollarSign, color: 'text-blue-500' })
    })
  }

  if (repair.paymentReversals) {
    repair.paymentReversals.forEach((pr) => {
      events.push({ label: `ยกเลิกชำระ: ${pr.reason}`, date: pr.createdAt, icon: RotateCcw, color: 'text-red-400' })
    })
  }

  events.sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())

  return (
    <SectionCard>
      <SectionTitle icon={CalendarDays} title="ไทม์ไลน์" />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีเหตุการณ์</p>
      ) : (
        <div className="space-y-2.5">
          {events.map((e, i) => (
            <div key={i} className="flex gap-2.5">
              <div className={`mt-0.5 shrink-0 ${e.color}`}>
                <e.icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 leading-snug">{e.label}</p>
                <p className="text-[10px] text-muted-foreground">{fmtDate(e.date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RepairWorkspacePage() {
  const params = useParams()
  const router = useRouter()
  const repairId = params.id as string
  const queryClient = useQueryClient()
  const { hasPermission, user } = useAuthStore()

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

  type TechUser = { id: string; name: string; email: string; isActive: boolean }
  const { data: techUsers = [] } = useQuery<TechUser[]>({
    queryKey: ['technicians', 'list'],
    queryFn: async () => {
      const res = await api.get('/technicians')
      return res.data.map((t: TechUser) => ({ id: t.id, name: t.name, email: t.email, isActive: t.isActive }))
    },
    staleTime: 60_000,
  })

  // ── Local state ──────────────────────────────────────────────────────────────
  const [localStatus, setLocalStatus] = useState<RepairStatus>('RECEIVED')
  const [laborCost, setLaborCost] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [selectedTechId, setSelectedTechId] = useState<string>('')
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteValue, setNoteValue] = useState('')
  const [printOpen, setPrintOpen] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Parts
  const [partSearch, setPartSearch] = useState('')
  const [addingPart, setAddingPart] = useState<Product | null>(null)
  const [partQty, setPartQty] = useState(1)
  const [partPrice, setPartPrice] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debouncedSearch = useDebounce(partSearch, 300)

  // Payment dialogs
  const [payOpen, setPayOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [payAmount, setPayAmount] = useState('')
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [addPayOpen, setAddPayOpen] = useState(false)
  const [addPayAmount, setAddPayAmount] = useState('')
  const [addPayMethod, setAddPayMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [addPayNote, setAddPayNote] = useState('')

  const isLocked = repair?.status === 'COMPLETED' || repair?.status === 'DELIVERED'

  useEffect(() => {
    if (repair) {
      setLocalStatus(repair.status)
      setLaborCost(repair.estimatedLaborCost != null ? String(repair.estimatedLaborCost) : '')
      setApprovalNote(repair.approvalNote ?? '')
      setSelectedTechId(repair.technicianId ?? '')
      setNoteValue(repair.note ?? '')
    }
  }, [repair])

  useEffect(() => {
    if (payOpen && repair) {
      const total = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
      const deposit = Number(repair.deposit ?? 0)
      setPayMethod('CASH')
      setPayAmount(String(Math.max(0, total - deposit)))
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

  // Use repair.branchId as branch scope — mirrors POS source-of-truth logic.
  // No type filter: accessories/phones/sims can all be used as repair parts.
  const repairBranchId = repair?.branchId ?? undefined
  const { data: allPartProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', 'repair-parts', repairBranchId ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (repairBranchId) params.set('branchId', repairBranchId)
      if (process.env.NODE_ENV === 'development') {
        console.log('[REPAIR PARTS] query params:', params.toString(), '| repair.branchId:', repairBranchId)
      }
      return (await api.get(`/products?${params}`)).data
    },
    enabled: !!repair,
    staleTime: 30_000,
  })
  // BranchStock.qty is source of truth — only show products with stock in this branch
  const partProducts = allPartProducts.filter((p) => (p.branchQuantity ?? 0) > 0 || !repairBranchId)
  const filteredPartProducts = debouncedSearch
    ? partProducts.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (p.barcode ?? '').toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : partProducts
  if (process.env.NODE_ENV === 'development' && searchOpen) {
    console.log('[REPAIR PARTS] total products:', allPartProducts.length, '| in-stock:', partProducts.length, '| filtered:', filteredPartProducts.length, '| search:', debouncedSearch)
  }

  // sellPrice = snapshot of product.price at time of adding (what customer is charged)
  // costPrice = snapshot of product.costPrice (COGS — used in profit reports only)
  const computedPartsCost = repair
    ? repair.parts.reduce((sum, p) => sum + Number(p.sellPrice ?? p.price) * p.quantity, 0)
    : 0
  const computedTotal = (Number(laborCost) || 0) + computedPartsCost

  const repairTotal = repair ? Number(repair.estimatedTotal ?? repair.estimateCost ?? 0) : 0
  const repairDeposit = repair ? Number(repair.deposit ?? 0) : 0
  const repairBalance = Math.max(0, repairTotal - repairDeposit)
  const payAmountNum = Number(payAmount) || 0
  const payChange = payAmountNum - repairBalance

  // ── Mutations ────────────────────────────────────────────────────────────────

  const invalidateRepair = () => {
    queryClient.invalidateQueries({ queryKey: ['repairs', repairId] })
    queryClient.invalidateQueries({ queryKey: ['repairs'] })
  }

  const addPartMutation = useMutation({
    mutationFn: (data: { productId: string; quantity: number; price?: number }) =>
      api.post(`/repairs/${repairId}/parts`, data),
    onSuccess: () => {
      invalidateRepair()
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
    onSuccess: () => { invalidateRepair(); toast.success('ลบอะไหล่แล้ว') },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/repairs/${repairId}`, data),
    onSuccess: () => invalidateRepair(),
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const paymentMutation = useMutation({
    mutationFn: (data: { paymentMethod: string; amountPaid: number }) =>
      api.post(`/repairs/${repairId}/payment`, data),
    onSuccess: () => {
      invalidateRepair()
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      queryClient.invalidateQueries({ queryKey: ['shifts', 'current'] })
      setPayOpen(false)
      toast.success('รับเงินสำเร็จ — งานซ่อมส่งคืนแล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const reverseMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${repairId}/reverse-payment`, { reason: reverseReason }),
    onSuccess: () => {
      invalidateRepair()
      setReverseOpen(false)
      setReverseReason('')
      toast.success('ยกเลิกการชำระเงินแล้ว — สถานะกลับเป็น "ซ่อมเสร็จ"')
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
      invalidateRepair()
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

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleStatusSave = () => {
    updateMutation.mutate({ status: localStatus }, {
      onSuccess: () => toast.success('อัปเดตสถานะสำเร็จ'),
    })
  }

  const handleTechnicianSave = () => {
    updateMutation.mutate(
      { technicianId: selectedTechId || null },
      { onSuccess: () => toast.success('มอบหมายช่างแล้ว') },
    )
  }

  const handleNoteSave = () => {
    updateMutation.mutate({ note: noteValue }, {
      onSuccess: () => { setNoteEditing(false); toast.success('บันทึกหมายเหตุแล้ว') },
    })
  }

  const handleSendEstimate = () => {
    updateMutation.mutate({
      estimatedLaborCost: Number(laborCost) || 0,
      estimatedPartsCost: computedPartsCost,
      estimatedTotal: computedTotal,
      status: 'WAITING_APPROVAL',
    }, { onSuccess: () => toast.success('ส่งประมาณราคาให้ลูกค้าแล้ว') })
  }

  const handleApprove = () => {
    updateMutation.mutate({
      status: 'APPROVED',
      approvalNote: approvalNote || undefined,
    }, { onSuccess: () => toast.success('บันทึกการอนุมัติแล้ว') })
  }

  const handleAddPart = () => {
    if (!addingPart) return
    const payload = {
      productId: addingPart.id,
      quantity: partQty,
      price: partPrice ? Number(partPrice) : undefined,
    }
    console.log('[AddPart] payload →', payload, '| repair.branchId →', repair?.branchId, '| product.branchQty →', addingPart.branchQuantity)
    addPartMutation.mutate(payload)
  }

  const handlePayment = () => {
    const amount = Number(payAmount)
    if (!amount || amount < 0) { toast.error('กรุณาระบุจำนวนเงิน'); return }
    paymentMutation.mutate({ paymentMethod: payMethod, amountPaid: amount })
  }

  // ── Mobile primary action ─────────────────────────────────────────────────────

  const mobileAction = useMemo(() => {
    if (!repair) return null
    if (repair.status === 'COMPLETED' && repair.paymentStatus === 'PENDING') {
      return { label: 'ส่งมอบ / รับเงิน', color: 'bg-green-600 hover:bg-green-700', action: () => setPayOpen(true) }
    }
    if (repair.status === 'WAITING_APPROVAL') {
      return { label: 'ลูกค้าอนุมัติแล้ว', color: 'bg-teal-600 hover:bg-teal-700', action: handleApprove }
    }
    if (repair.status === 'DELIVERED') {
      return { label: 'พิมพ์ใบส่งมอบ', color: 'bg-blue-600 hover:bg-blue-700', action: () => setPrintOpen(true) }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repair])

  // ── Loading & Error states ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-6 w-40 bg-gray-100 animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border p-4 h-32 animate-pulse" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border p-4 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!repair) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Wrench className="h-10 w-10 text-gray-200" />
        <p>ไม่พบงานซ่อม</p>
        <Button variant="outline" onClick={() => router.push('/repairs')}>กลับไปรายการซ่อม</Button>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-4 pb-24 lg:pb-4">

        {/* ─── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push('/repairs')}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-blue-700 text-base sm:text-lg">{repair.ticketNumber}</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${STATUS_COLOR[repair.status]}`}>
                  {STATUS_LABEL[repair.status]}
                </span>
                {repair.paymentStatus === 'PAID' && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    ชำระแล้ว
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {repair.deviceBrand} {repair.deviceModel}
                {repair.customer && ` · ${repair.customer.name}`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => setPrintOpen(true)}
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">พิมพ์</span>
          </Button>
        </div>

        {/* ─── Status Progress ─────────────────────────────────────────────────── */}
        <StatusProgress status={repair.status} />

        {/* ─── Main Grid ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT: Main Content */}
          <div className="lg:col-span-2 space-y-4">

            {/* Customer & Device */}
            <SectionCard>
              <SectionTitle icon={User} title="ลูกค้า & อุปกรณ์" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {repair.customer ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ลูกค้า</p>
                    <InfoRow label="ชื่อ" value={repair.customer.name} />
                    <InfoRow label="เบอร์โทร" value={repair.customer.phone} />
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">ไม่ระบุลูกค้า</div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">อุปกรณ์</p>
                  <InfoRow label="ยี่ห้อ / รุ่น" value={`${repair.deviceBrand} ${repair.deviceModel}`} />
                  {repair.deviceColor && <InfoRow label="สี" value={repair.deviceColor} />}
                  {repair.deviceImei && <InfoRow label="IMEI" value={<span className="font-mono text-xs">{repair.deviceImei}</span>} />}
                  {repair.accessories && <InfoRow label="อุปกรณ์มาด้วย" value={repair.accessories} />}
                  {repair.dueDate && <InfoRow label="กำหนดส่ง" value={fmtDateShort(repair.dueDate)} />}
                </div>
              </div>
            </SectionCard>

            {/* Technician Assignment */}
            <SectionCard>
              <div className="flex items-center justify-between">
                <SectionTitle icon={UserCog} title="ช่างผู้รับผิดชอบ" />
              </div>
              {repair.technician && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                    {repair.technician.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-900">{repair.technician.name}</span>
                </div>
              )}
              {!isLocked && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select
                      value={selectedTechId}
                      onValueChange={setSelectedTechId}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="เลือกช่าง..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">ไม่ระบุช่าง</SelectItem>
                        {techUsers.filter((t) => t.isActive).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5"
                    onClick={handleTechnicianSave}
                    disabled={updateMutation.isPending || selectedTechId === (repair.technicianId ?? '')}
                  >
                    {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    บันทึก
                  </Button>
                </div>
              )}
            </SectionCard>

            {/* Issue & Notes */}
            <SectionCard>
              <SectionTitle icon={ClipboardList} title="อาการและหมายเหตุ" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">อาการ</p>
                <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">{repair.issue}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">หมายเหตุ</p>
                  {!isLocked && !noteEditing && (
                    <button
                      onClick={() => setNoteEditing(true)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Edit2 className="h-3 w-3" />
                      แก้ไข
                    </button>
                  )}
                </div>
                {noteEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={noteValue}
                      onChange={(e) => setNoteValue(e.target.value)}
                      rows={3}
                      className="text-sm"
                      placeholder="หมายเหตุ..."
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setNoteEditing(false); setNoteValue(repair.note ?? '') }}>
                        ยกเลิก
                      </Button>
                      <Button size="sm" onClick={handleNoteSave} disabled={updateMutation.isPending} className="gap-1.5">
                        {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        บันทึก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2 min-h-[40px]">
                    {noteValue || <span className="text-muted-foreground italic">ยังไม่มีหมายเหตุ</span>}
                  </p>
                )}
              </div>
            </SectionCard>

            {/* Parts Management */}
            <SectionCard>
              <div className="flex items-center justify-between">
                <SectionTitle icon={Package} title="อะไหล่ที่ใช้ซ่อม" />
                {isLocked && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    <Lock className="h-3 w-3" />
                    ล็อก
                  </span>
                )}
              </div>

              {repair.parts.length > 0 ? (
                <div className="space-y-1.5">
                  {repair.parts.map((part) => {
                    const sell = Number(part.sellPrice ?? part.price)
                    const cost = Number(part.costPrice ?? part.price)
                    return (
                      <div key={part.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{part.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            ×{part.quantity} · {formatThaiMoney(sell)}/ชิ้น
                            {cost !== sell && (
                              <span className="ml-1.5 text-slate-400">(ทุน {formatThaiMoney(cost)})</span>
                            )}
                            <span className="ml-1.5 text-green-600 font-medium">ตัดสต็อกแล้ว</span>
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {formatThaiMoney(sell * part.quantity)}
                        </span>
                        {!isLocked && (
                          <button
                            onClick={() => removePartMutation.mutate(part.id)}
                            disabled={removePartMutation.isPending}
                            className="text-red-400 hover:text-red-600 shrink-0 disabled:opacity-40"
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
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">ยังไม่มีอะไหล่</p>
              )}

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
                      SKU: {addingPart.sku} · สต็อก: {addingPart.branchQuantity ?? 0} ชิ้น · ราคาทุน: {formatThaiMoney(Number(addingPart.costPrice))}
                    </p>
                    <div className="flex gap-2">
                      <div className="space-y-1 flex-1">
                        <label className="text-xs text-muted-foreground">จำนวน</label>
                        <Input type="number" min={1} max={addingPart.branchQuantity ?? undefined} value={partQty}
                          onChange={(e) => setPartQty(Number(e.target.value))} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1 flex-1">
                        <label className="text-xs text-muted-foreground">ราคา/ชิ้น (ว่าง=ราคาทุน)</label>
                        <Input type="number" min={0} placeholder={String(addingPart.costPrice)} value={partPrice}
                          onChange={(e) => setPartPrice(e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                    <Button size="sm" className="w-full gap-1.5" onClick={handleAddPart}
                      disabled={partQty < 1 || (addingPart.branchQuantity != null && partQty > addingPart.branchQuantity) || addPartMutation.isPending}>
                      {addPartMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      เพิ่มอะไหล่
                    </Button>
                  </div>
                ) : (
                  <div ref={searchRef} className="relative">
                    <Input
                      placeholder="ค้นหาอะไหล่เพื่อเพิ่ม..."
                      value={partSearch}
                      onChange={(e) => { setPartSearch(e.target.value); setSearchOpen(true) }}
                      onFocus={() => setSearchOpen(true)}
                      className="text-sm h-9"
                    />
                    {searchOpen && filteredPartProducts.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredPartProducts.map((p) => {
                          const qty = p.branchQuantity ?? 0
                          return (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-0"
                              onClick={() => {
                                setAddingPart(p)
                                setPartSearch('')
                                setSearchOpen(false)
                                setPartQty(1)
                                setPartPrice('')
                              }}
                            >
                              <p className="text-sm font-medium text-gray-900">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                SKU: {p.sku} · สต็อก: {qty} ชิ้น · ราคาทุน: {formatThaiMoney(Number(p.costPrice))}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {searchOpen && debouncedSearch && filteredPartProducts.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-muted-foreground text-center">
                        ไม่พบอะไหล่
                      </div>
                    )}
                  </div>
                )
              )}
            </SectionCard>

            {/* Estimate */}
            {!isLocked && (
              <SectionCard className="border-blue-100 bg-blue-50/30">
                <SectionTitle icon={DollarSign} title="ประมาณราคาซ่อม" />
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-700 w-28 shrink-0">ค่าแรง (บาท)</label>
                    <Input
                      type="number" min={0} placeholder="0" value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)} className="h-8 text-sm flex-1 bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-28 shrink-0">ค่าอะไหล่</span>
                    <span className="text-sm font-medium tabular-nums">{formatThaiMoney(computedPartsCost)}</span>
                  </div>
                  <div className="flex items-center gap-3 border-t pt-2">
                    <span className="text-sm font-bold text-gray-900 w-28 shrink-0">รวมประมาณ</span>
                    <span className="text-base font-bold text-blue-700 tabular-nums">{formatThaiMoney(computedTotal)}</span>
                  </div>
                </div>
                {repair.estimatedTotal != null && (
                  <div className="text-xs text-muted-foreground bg-white rounded-lg border px-3 py-2 space-y-0.5">
                    <p>ประมาณล่าสุด: <span className="font-semibold text-gray-900">{formatThaiMoney(Number(repair.estimatedTotal))}</span></p>
                    {repair.approvedAt && <p className="text-green-600">อนุมัติเมื่อ {fmtDateShort(repair.approvedAt)}</p>}
                    {repair.approvalNote && <p>หมายเหตุ: {repair.approvalNote}</p>}
                  </div>
                )}
                {repair.status !== 'APPROVED' && repair.status !== 'WAITING_APPROVAL' && (
                  <Button
                    size="sm" variant="outline"
                    className="w-full gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={handleSendEstimate} disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    ส่งประมาณราคา (รอลูกค้าอนุมัติ)
                  </Button>
                )}
              </SectionCard>
            )}

            {/* Approval */}
            {repair.status === 'WAITING_APPROVAL' && (
              <SectionCard className="border-amber-200 bg-amber-50">
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
                  rows={2} className="text-sm bg-white"
                />
                <Button
                  className="w-full gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleApprove} disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  ลูกค้าอนุมัติแล้ว
                </Button>
              </SectionCard>
            )}

            {/* Photos */}
            <SectionCard>
              <SectionTitle icon={Camera} title={`รูปถ่ายเครื่อง${repair.images?.length ? ` (${repair.images.length} รูป)` : ''}`} />
              {repair.images && repair.images.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
            </SectionCard>

            {/* Status Change */}
            {repair.status !== 'DELIVERED' && (
              <SectionCard className="border-blue-100 bg-blue-50/40">
                <p className="text-sm font-semibold text-gray-900">เปลี่ยนสถานะงานซ่อม</p>
                <div className="flex gap-2">
                  <Select value={localStatus} onValueChange={(v) => setLocalStatus(v as RepairStatus)}>
                    <SelectTrigger className="flex-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANGEABLE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleStatusSave}
                    disabled={localStatus === repair.status || updateMutation.isPending}
                    className="shrink-0"
                  >
                    {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
                  </Button>
                </div>
              </SectionCard>
            )}
          </div>

          {/* RIGHT: Sidebar */}
          <div className="space-y-4">

            {/* Quick Actions */}
            <SectionCard>
              <SectionTitle icon={FileText} title="การดำเนินการ" />
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start" onClick={() => setPrintOpen(true)}>
                  <Printer className="h-3.5 w-3.5" />
                  พิมพ์ใบรับงาน
                </Button>

                {repair.status === 'COMPLETED' && repair.paymentStatus === 'PENDING' && (
                  <Button
                    size="sm"
                    className="w-full gap-1.5 justify-start bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setPayOpen(true)}
                    disabled={!currentShift}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    ส่งมอบ / รับเงิน
                  </Button>
                )}

                {repair.paymentStatus === 'PAID' && (
                  <>
                    <Button size="sm" variant="outline" className="w-full gap-1.5 justify-start text-blue-700 border-blue-200"
                      onClick={() => setAddPayOpen(true)}>
                      <DollarSign className="h-3.5 w-3.5" />
                      รับชำระเพิ่มเติม
                    </Button>
                    {hasPermission('repair.close') && (
                      <Button size="sm" variant="ghost" className="w-full gap-1.5 justify-start text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setReverseOpen(true)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        ยกเลิกการชำระเงิน
                      </Button>
                    )}
                  </>
                )}

                {!currentShift && repair.status === 'COMPLETED' && repair.paymentStatus === 'PENDING' && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    กรุณาเปิดกะก่อนรับเงิน
                  </p>
                )}
              </div>
            </SectionCard>

            {/* Cost Summary */}
            <SectionCard>
              <SectionTitle icon={DollarSign} title="ค่าใช้จ่าย" />
              <div className="space-y-1.5 text-sm">
                {Number(repair.deposit) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ค่ามัดจำ</span>
                    <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.deposit))}</span>
                  </div>
                )}
                {repair.estimatedTotal != null && Number(repair.estimatedTotal) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ยอดประมาณ</span>
                    <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.estimatedTotal))}</span>
                  </div>
                )}
                {repair.estimatedLaborCost != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ค่าแรง</span>
                    <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.estimatedLaborCost))}</span>
                  </div>
                )}
                {repair.estimatedPartsCost != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ค่าอะไหล่</span>
                    <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.estimatedPartsCost))}</span>
                  </div>
                )}
                {repair.finalCost != null && (
                  <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                    <span>ค่าซ่อมสุดท้าย</span>
                    <span className="text-blue-700 tabular-nums">{formatThaiMoney(Number(repair.finalCost))}</span>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Payment Status */}
            {(repair.status === 'COMPLETED' || repair.status === 'DELIVERED') && (
              <SectionCard>
                <SectionTitle icon={CheckCircle2} title="สถานะการชำระเงิน" />
                {repair.paymentStatus === 'PAID' ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-green-700 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      ชำระเงินแล้ว
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ยอดรับ</span>
                      <span className="font-medium tabular-nums">{formatThaiMoney(Number(repair.paidAmount ?? 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ช่องทาง</span>
                      <span className="font-medium">
                        {repair.paymentMethod === 'CASH' ? 'เงินสด' : repair.paymentMethod === 'TRANSFER' ? 'โอนเงิน' : 'บัตรเครดิต'}
                      </span>
                    </div>
                    {repair.paidAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">วันที่ชำระ</span>
                        <span className="text-xs">{fmtDateShort(repair.paidAt)}</span>
                      </div>
                    )}
                    {repair.additionalPayments && repair.additionalPayments.length > 0 && (
                      <div className="border-t pt-2 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">ชำระเพิ่มเติม</p>
                        {repair.additionalPayments.map((ap) => (
                          <div key={ap.id} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{fmtDateShort(ap.createdAt)}</span>
                            <span className="font-medium tabular-nums">+{formatThaiMoney(Number(ap.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ยอดค้างชำระ</span>
                      <span className="font-bold text-blue-700 tabular-nums">{formatThaiMoney(repairBalance)}</span>
                    </div>
                    {repairDeposit > 0 && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>ชำระมัดจำแล้ว</span>
                        <span>{formatThaiMoney(repairDeposit)}</span>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            {/* Warranty */}
            {repair.warrantyExpiresAt && (
              <SectionCard className="border-green-200 bg-green-50">
                <SectionTitle icon={Shield} title="การรับประกัน" />
                <div className="text-sm space-y-1">
                  <p className="font-medium text-green-800">หมดประกัน: {fmtDateShort(repair.warrantyExpiresAt)}</p>
                  {repair.warrantyNote && <p className="text-xs text-green-600">{repair.warrantyNote}</p>}
                </div>
              </SectionCard>
            )}

            {/* Timeline */}
            <TimelineCard repair={repair} />

          </div>
        </div>
      </div>

      {/* ─── Mobile Sticky Bottom Bar ─────────────────────────────────────────── */}
      {mobileAction && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-40">
          <Button
            className={`w-full gap-2 text-white ${mobileAction.color}`}
            onClick={mobileAction.action}
            disabled={
              (repair.status === 'COMPLETED' && repair.paymentStatus === 'PENDING' && !currentShift) ||
              updateMutation.isPending ||
              paymentMutation.isPending
            }
          >
            {paymentMutation.isPending || updateMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : null
            }
            {mobileAction.label}
          </Button>
        </div>
      )}

      {/* ─── Payment Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={(v) => { if (!v) setPayOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              รับเงิน / ส่งมอบงานซ่อม
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
            <div className="space-y-1.5">
              <Label>ช่องทางชำระเงิน</Label>
              <Select value={payMethod} onValueChange={(v) => { setPayMethod(v as typeof payMethod); setPayAmount(String(repairBalance)) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2"><opt.Icon className="h-4 w-4" />{opt.label}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{payMethod === 'CASH' ? 'รับเงินมา (บาท)' : 'ยอดชำระ (บาท)'}</Label>
              <Input
                type="number" min={0} step={1} value={payAmount}
                readOnly={payMethod !== 'CASH'}
                className={payMethod !== 'CASH' ? 'bg-gray-50 text-muted-foreground' : ''}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            {payMethod === 'CASH' && (
              <div className={`flex justify-between items-center rounded-xl px-4 py-3 border ${payChange < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <span className={`font-medium ${payChange < 0 ? 'text-red-700' : 'text-green-800'}`}>เงินทอน</span>
                <span className={`text-xl font-bold tabular-nums ${payChange < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {payChange < 0 ? `ขาดอีก ${formatThaiMoney(Math.abs(payChange))}` : formatThaiMoney(payChange)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="pt-1">
            <Button variant="outline" onClick={() => setPayOpen(false)} disabled={paymentMutation.isPending}>ยกเลิก</Button>
            <Button
              onClick={handlePayment}
              disabled={paymentMutation.isPending || (payMethod === 'CASH' && payChange < 0)}
              className="gap-2 bg-green-600 hover:bg-green-700 min-w-[120px]"
            >
              {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" />ยืนยันรับเงิน</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reverse Payment Dialog ───────────────────────────────────────────── */}
      <Dialog open={reverseOpen} onOpenChange={(v) => { if (!v) setReverseOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">ยกเลิกการชำระเงิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">งานซ่อมจะกลับไปสถานะ &quot;ซ่อมเสร็จ&quot; และต้องรับชำระเงินใหม่</p>
            <div className="space-y-1.5">
              <Label>เหตุผล</Label>
              <Input value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="เช่น กดผิด / ลูกค้าขอยกเลิก" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)} disabled={reverseMutation.isPending}>ยกเลิก</Button>
            <Button variant="destructive" disabled={!reverseReason.trim() || reverseMutation.isPending} onClick={() => reverseMutation.mutate()}>
              {reverseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Additional Payment Dialog ────────────────────────────────────────── */}
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
              <Input type="number" min={0} value={addPayAmount} onChange={(e) => setAddPayAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>ช่องทางชำระ</Label>
              <Select value={addPayMethod} onValueChange={(v) => setAddPayMethod(v as typeof addPayMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2"><opt.Icon className="h-4 w-4" />{opt.label}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={addPayNote} onChange={(e) => setAddPayNote(e.target.value)} placeholder="ไม่บังคับ" />
            </div>
          </div>
          <DialogFooter className="pt-1">
            <Button variant="outline" onClick={() => setAddPayOpen(false)} disabled={addPaymentMutation.isPending}>ยกเลิก</Button>
            <Button
              disabled={!Number(addPayAmount) || Number(addPayAmount) <= 0 || addPaymentMutation.isPending}
              onClick={() => addPaymentMutation.mutate()} className="gap-2"
            >
              {addPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Photo Lightbox ───────────────────────────────────────────────────── */}
      {lightboxIdx !== null && repair.images && repair.images.length > 0 && (
        <Dialog open onOpenChange={() => setLightboxIdx(null)}>
          <DialogContent className="max-w-2xl p-0 bg-black border-0 overflow-hidden">
            <div className="relative flex flex-col items-center">
              <button
                onClick={() => setLightboxIdx(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setLightboxIdx((p) => p !== null ? (p + 1) % repair.images!.length : 0)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="flex gap-1.5 py-3">
                    {repair.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIdx(i)}
                        className={`w-2 h-2 rounded-full ${i === lightboxIdx ? 'bg-white' : 'bg-white/30'}`}
                      />
                    ))}
                  </div>
                </>
              )}
              <p className="text-white/60 text-xs pb-3">{lightboxIdx + 1} / {repair.images.length}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Print Receipt Dialog ─────────────────────────────────────────────── */}
      <RepairReceiptPreviewDialog
        open={printOpen}
        repairId={repairId}
        initialData={repair}
        onClose={() => setPrintOpen(false)}
      />
    </>
  )
}
