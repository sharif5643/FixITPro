'use client'

import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, User, X, Wrench, ShoppingCart, Printer, FileText, CheckCircle2,
  Smartphone, Tablet, Laptop, Watch, HelpCircle, Tag, UserCog, Camera, ImagePlus,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatThaiMoney, cn } from '@/lib/utils'
import api from '@/lib/api'
import { TechnicianAvatar } from '@/components/ui/technician-avatar'
import type { Customer, RepairStatus } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

interface CustomerSearchResult {
  id: string; name: string; phone?: string; points: number
  _count: { sales: number; repairs: number }
}

interface CustomerDetail extends Customer {
  totalSpending: number
  _count: { sales: number; repairs: number }
  repairs: { id: string; ticketNumber: string; deviceBrand: string; deviceModel: string; deviceImei?: string; issue: string; status: RepairStatus; receivedAt: string }[]
  sales: { id: string; receiptNumber: string; total: number; status: string; createdAt: string }[]
}

const REPAIR_STATUS_LABEL: Partial<Record<RepairStatus, string>> = {
  RECEIVED: 'รับงาน', DIAGNOSING: 'ตรวจสอบ', WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว', WAITING_PARTS: 'รออะไหล่', IN_PROGRESS: 'กำลังซ่อม',
  COMPLETED: 'ซ่อมเสร็จ', DELIVERED: 'ส่งคืนแล้ว', CANCELLED: 'ยกเลิก',
}

// ── Config data ────────────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  { value: 'มือถือ',   icon: Smartphone },
  { value: 'แท็บเล็ต', icon: Tablet },
  { value: 'แล็ปท็อป', icon: Laptop },
  { value: 'Smart Watch', icon: Watch },
  { value: 'อื่นๆ',    icon: HelpCircle },
]

const ACCESSORIES_OPTIONS = ['ซองใส่', 'สาย USB', 'หัวชาร์จ', 'หูฟัง', 'ฟิล์มกระจก', 'กล่องเดิม', 'ปากกา', 'อื่นๆ']

const CONDITION_OPTIONS = [
  { value: 'หน้าจอแตก',   color: 'bg-red-50 border-red-200 text-red-700 data-[active=true]:bg-red-500 data-[active=true]:text-white data-[active=true]:border-red-500' },
  { value: 'ฝาหลังแตก',   color: 'bg-orange-50 border-orange-200 text-orange-700 data-[active=true]:bg-orange-500 data-[active=true]:text-white data-[active=true]:border-orange-500' },
  { value: 'ขอบมีรอย',    color: 'bg-yellow-50 border-yellow-200 text-yellow-700 data-[active=true]:bg-yellow-500 data-[active=true]:text-white data-[active=true]:border-yellow-500' },
  { value: 'มีรอยขีดข่วน', color: 'bg-amber-50 border-amber-200 text-amber-700 data-[active=true]:bg-amber-500 data-[active=true]:text-white data-[active=true]:border-amber-500' },
  { value: 'ปกติ',         color: 'bg-green-50 border-green-200 text-green-700 data-[active=true]:bg-green-500 data-[active=true]:text-white data-[active=true]:border-green-500' },
  { value: 'เปียกน้ำ',    color: 'bg-blue-50 border-blue-200 text-blue-700 data-[active=true]:bg-blue-500 data-[active=true]:text-white data-[active=true]:border-blue-500' },
]

const ISSUE_TAG_OPTIONS = [
  'หน้าจอ', 'แบตเตอรี่', 'กล้อง', 'ชาร์จไม่เข้า', 'เสียง', 'ปุ่มเสีย',
  'WiFi', 'Bluetooth', 'ไม่ติด', 'ค้าง/รีสตาร์ท', 'ตก/หล่น', 'น้ำเข้า', 'สัมผัสไม่ได้', 'อื่นๆ',
]

// ── Schema ────────────────────────────────────────────────────────────────────

const repairSchema = z.object({
  customerName:  z.string().optional(),
  customerPhone: z.string().optional(),
  deviceBrand:   z.string().min(1, 'กรุณากรอกยี่ห้อ'),
  deviceModel:   z.string().min(1, 'กรุณากรอกรุ่น'),
  deviceColor:   z.string().optional(),
  deviceImei:    z.string().optional(),
  issue:         z.string().min(1, 'กรุณากรอกอาการเสีย'),
  note:          z.string().optional(),
  deposit:       z.coerce.number().min(0).optional(),
  estimateCost:  z.coerce.number().min(0).optional(),
  discount:      z.coerce.number().min(0).optional(),
  dueDate:       z.string().optional(),
})

type RepairFormData = z.infer<typeof repairSchema>

interface RepairFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  branchId?: string
}

// ── Section header helper ──────────────────────────────────────────────────────

function SectionLabel({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">{num}</span>
      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{label}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RepairFormDialog({ open, onOpenChange, onSuccess, branchId }: RepairFormDialogProps) {
  const queryClient = useQueryClient()

  const {
    register, handleSubmit, watch, reset, setValue,
    formState: { errors },
  } = useForm<RepairFormData>({
    resolver: zodResolver(repairSchema),
    defaultValues: { deposit: 0, estimateCost: 0, discount: 0 },
  })

  const deposit      = Number(watch('deposit'))      || 0
  const estimateCost = Number(watch('estimateCost')) || 0
  const discount     = Number(watch('discount'))     || 0

  // New multi-value state
  const [deviceType,      setDeviceType]      = useState<string>('')
  const [accessories,     setAccessories]     = useState<string[]>([])
  const [deviceConditions, setDeviceConditions] = useState<string[]>([])
  const [issueTags,       setIssueTags]       = useState<string[]>([])
  const [selectedTechId,  setSelectedTechId]  = useState<string | null>(null)
  const [photos,          setPhotos]          = useState<File[]>([])

  const { data: techUsers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['technicians-simple'],
    queryFn: () => api.get('/technicians').then((r) => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
  })

  // Receipt state after creation
  const [createdRepair, setCreatedRepair] = useState<{ id: string; ticketNumber: string } | null>(null)

  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [customerSearch,   setCustomerSearch]   = useState('')
  const [searchOpen,       setSearchOpen]       = useState(false)
  const searchRef                               = useRef<HTMLDivElement>(null)
  const debouncedSearch                         = useDebounce(customerSearch, 300)

  useEffect(() => {
    if (open) {
      reset({ deposit: 0, estimateCost: 0, discount: 0 })
      setSelectedCustomer(null)
      setCustomerSearch('')
      setSearchOpen(false)
      setCreatedRepair(null)
      setDeviceType('')
      setAccessories([])
      setDeviceConditions([])
      setIssueTags([])
      setSelectedTechId(null)
      setPhotos([])
    }
  }, [open, reset])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: searchResults = [] } = useQuery<CustomerSearchResult[]>({
    queryKey: ['customers', 'search', debouncedSearch],
    queryFn: async () => (await api.get('/customers', { params: { search: debouncedSearch } })).data,
    enabled: searchOpen && debouncedSearch.length >= 1,
    staleTime: 10_000,
  })

  const { data: customerDetail } = useQuery<CustomerDetail>({
    queryKey: ['customers', selectedCustomer?.id],
    queryFn: async () => (await api.get(`/customers/${selectedCustomer!.id}`)).data,
    enabled: !!selectedCustomer,
    staleTime: 30_000,
  })

  function selectCustomer(c: CustomerSearchResult) {
    setSelectedCustomer(c)
    setCustomerSearch('')
    setSearchOpen(false)
    setValue('customerName',  c.name)
    setValue('customerPhone', c.phone ?? '')
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setValue('customerName', '')
    setValue('customerPhone', '')
  }

  function toggleArr(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val])
  }

  const createMutation = useMutation({
    mutationFn: async (data: RepairFormData) => {
      const res = await api.post('/repairs', {
        branchId,
        customerId:        selectedCustomer?.id,
        customerName:      !selectedCustomer ? (data.customerName?.trim() || undefined) : undefined,
        customerPhone:     !selectedCustomer ? (data.customerPhone?.trim() || undefined) : undefined,
        deviceBrand:       data.deviceBrand.trim(),
        deviceModel:       data.deviceModel.trim(),
        deviceColor:       data.deviceColor?.trim() || undefined,
        deviceImei:        data.deviceImei?.trim() || undefined,
        deviceType:        deviceType || undefined,
        accessories:       accessories.length > 0 ? accessories.join(', ') : undefined,
        deviceConditions:  deviceConditions.length > 0 ? deviceConditions : undefined,
        issueTags:         issueTags.length > 0 ? issueTags : undefined,
        issue:             data.issue.trim(),
        note:              data.note?.trim() || undefined,
        deposit:           data.deposit || 0,
        estimateCost:      data.estimateCost || undefined,
        discount:          data.discount || undefined,
        dueDate:           data.dueDate || undefined,
        technicianId:      selectedTechId || undefined,
      })
      const repair = res.data
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach((f) => fd.append('files', f))
        await api.post(`/repairs/${repair.id}/images`, fd)
      }
      return repair
    },
    onSuccess: (repair) => {
      toast.success(`สร้างงานซ่อม ${repair.ticketNumber} สำเร็จ`)
      setCreatedRepair({ id: repair.id, ticketNumber: repair.ticketNumber })
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  function handleClose() {
    setCreatedRepair(null)
    onOpenChange(false)
    onSuccess()
  }

  const netEstimate = Math.max(0, estimateCost - discount)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-blue-600" />
            {createdRepair ? 'สร้างงานซ่อมสำเร็จ' : 'สร้างงานซ่อมใหม่'}
          </DialogTitle>
        </DialogHeader>

        {/* ─── Receipt panel ─── */}
        {createdRepair && (
          <div className="py-4 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-semibold text-gray-900">เลขงาน: {createdRepair.ticketNumber}</p>
              <p className="text-sm text-muted-foreground">เลือกรูปแบบพิมพ์ใบรับงานซ่อม</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => window.open(`/print/repair/${createdRepair.id}?paper=58mm&copy=shop`, '_blank')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                <Printer className="h-5 w-5" />58mm<br />(ใบร้าน)
              </button>
              <button type="button" onClick={() => window.open(`/print/repair/${createdRepair.id}?paper=58mm`, '_blank')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                <Printer className="h-5 w-5" />58mm<br />(ใบลูกค้า)
              </button>
              <button type="button" onClick={() => window.open(`/print/repair/${createdRepair.id}?paper=A4`, '_blank')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                <FileText className="h-5 w-5" />A4<br />(เอกสาร)
              </button>
            </div>
            <Button className="w-full" onClick={handleClose}>ปิด</Button>
          </div>
        )}

        {/* ─── Form ─── */}
        {!createdRepair && (
          <form onSubmit={handleSubmit((data) => createMutation.mutateAsync(data))} className="space-y-5 pt-1">

            {/* ── Section 1: ลูกค้า ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <SectionLabel num={1} label="ข้อมูลลูกค้า" />
              {selectedCustomer ? (
                <div className="rounded-xl border bg-blue-50/40 border-blue-100 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{selectedCustomer.name}</p>
                        {selectedCustomer.phone && <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] bg-white border rounded-full px-2 py-0.5 text-gray-500">
                        ซ่อม {selectedCustomer._count.repairs} · ซื้อ {selectedCustomer._count.sales}
                      </span>
                      <button type="button" onClick={clearCustomer} className="text-muted-foreground hover:text-red-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {customerDetail && (
                    <div className="space-y-2 border-t pt-2">
                      {customerDetail.repairs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                            <Wrench className="h-2.5 w-2.5" />ประวัติซ่อมล่าสุด
                          </div>
                          <div className="space-y-1">
                            {customerDetail.repairs.slice(0, 2).map((r) => (
                              <div key={r.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-2 py-1.5 border">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{r.deviceBrand} {r.deviceModel}</span>
                                  <p className="text-muted-foreground truncate">{r.issue}</p>
                                </div>
                                <span className="shrink-0 text-[10px] bg-blue-50 text-blue-700 rounded-full px-1.5 py-0.5">
                                  {REPAIR_STATUS_LABEL[r.status] ?? r.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {customerDetail.sales.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                            <ShoppingCart className="h-2.5 w-2.5" />ซื้อล่าสุด
                          </div>
                          <div className="space-y-1">
                            {customerDetail.sales.slice(0, 2).map((s) => (
                              <div key={s.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1.5 border">
                                <span className="font-mono text-blue-700">{s.receiptNumber}</span>
                                <span className="font-medium tabular-nums">{formatThaiMoney(Number(s.total))}</span>
                                <span className="text-muted-foreground">{format(new Date(s.createdAt), 'dd MMM yy', { locale: th })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div ref={searchRef} className="relative">
                    <Label className="mb-1.5 block">ค้นหาลูกค้าเก่า</Label>
                    <Input placeholder="พิมพ์ชื่อหรือเบอร์โทร..." value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setSearchOpen(true) }}
                      onFocus={() => setSearchOpen(true)} className="text-sm" />
                    {searchOpen && customerSearch.length >= 1 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-44 overflow-y-auto">
                        {searchResults.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-muted-foreground text-center">ไม่พบลูกค้า</div>
                        ) : searchResults.map((c) => (
                          <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b last:border-0">
                            <p className="text-sm font-semibold">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone ?? 'ไม่มีเบอร์'} · ซ่อม {c._count.repairs}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>ชื่อลูกค้าใหม่</Label>
                      <Input placeholder="ถ้าไม่เลือกจากด้านบน" {...register('customerName')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>เบอร์โทร</Label>
                      <Input placeholder="0XX-XXX-XXXX" {...register('customerPhone')} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Section 2: อุปกรณ์ ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <SectionLabel num={2} label="ข้อมูลอุปกรณ์" />
              <div className="space-y-4">
                {/* Device type */}
                <div>
                  <Label className="mb-2 block">ประเภทอุปกรณ์</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEVICE_TYPES.map(({ value, icon: Icon }) => (
                      <button key={value} type="button"
                        onClick={() => setDeviceType(deviceType === value ? '' : value)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all',
                          deviceType === value
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300',
                        )}>
                        <Icon className="h-3.5 w-3.5" />
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brand / Model */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>ยี่ห้อ <span className="text-red-500">*</span></Label>
                    <Input placeholder="เช่น Samsung, Apple" {...register('deviceBrand')} />
                    {errors.deviceBrand && <p className="text-xs text-red-500">{errors.deviceBrand.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>รุ่น <span className="text-red-500">*</span></Label>
                    <Input placeholder="เช่น Galaxy S24" {...register('deviceModel')} />
                    {errors.deviceModel && <p className="text-xs text-red-500">{errors.deviceModel.message}</p>}
                  </div>
                </div>

                {/* IMEI / Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>IMEI / Serial</Label>
                    <Input placeholder="ถ้าไม่รู้ทิ้งไว้ก่อน" {...register('deviceImei')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>สี</Label>
                    <Input placeholder="เช่น ดำ, ขาว, ทอง" {...register('deviceColor')} />
                  </div>
                </div>

                {/* Accessories */}
                <div>
                  <Label className="mb-2 block">อุปกรณ์ที่รับมาด้วย</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCESSORIES_OPTIONS.map((opt) => (
                      <button key={opt} type="button"
                        onClick={() => toggleArr(accessories, setAccessories, opt)}
                        className={cn(
                          'px-3 py-1 rounded-full border text-xs font-medium transition-all',
                          accessories.includes(opt)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
                        )}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Device condition */}
                <div>
                  <Label className="mb-2 block">สภาพอุปกรณ์ (เลือกได้หลายข้อ)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CONDITION_OPTIONS.map(({ value, color }) => (
                      <button key={value} type="button" data-active={deviceConditions.includes(value)}
                        onClick={() => toggleArr(deviceConditions, setDeviceConditions, value)}
                        className={cn('px-3 py-1 rounded-full border text-xs font-medium transition-all', color)}>
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 3: อาการ ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <SectionLabel num={3} label="อาการและปัญหา" />
              <div className="space-y-3">
                {/* Issue tags */}
                <div>
                  <Label className="mb-2 flex items-center gap-1.5 block">
                    <Tag className="h-3.5 w-3.5" />หมวดหมู่ปัญหา
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ISSUE_TAG_OPTIONS.map((tag) => (
                      <button key={tag} type="button"
                        onClick={() => toggleArr(issueTags, setIssueTags, tag)}
                        className={cn(
                          'px-3 py-1 rounded-full border text-xs font-medium transition-all',
                          issueTags.includes(tag)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
                        )}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Issue text */}
                <div className="space-y-1.5">
                  <Label>รายละเอียดอาการ <span className="text-red-500">*</span></Label>
                  <textarea rows={3} placeholder="ระบุอาการที่พบโดยละเอียด..."
                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    {...register('issue')} />
                  {errors.issue && <p className="text-xs text-red-500">{errors.issue.message}</p>}
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <Label>หมายเหตุ</Label>
                  <Input placeholder="บันทึกเพิ่มเติม..." {...register('note')} />
                </div>
              </div>
            </div>

            {/* ── Section 4: ราคา ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <SectionLabel num={4} label="ค่าใช้จ่าย (ประมาณเบื้องต้น)" />
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>ราคาประเมิน (฿)</Label>
                    <Input type="number" min={0} step={1} placeholder="0" {...register('estimateCost')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ส่วนลด (฿)</Label>
                    <Input type="number" min={0} step={1} placeholder="0" {...register('discount')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ค่ามัดจำ (฿)</Label>
                    <Input type="number" min={0} step={1} placeholder="0" {...register('deposit')} />
                  </div>
                </div>
                {estimateCost > 0 && (
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">สุทธิหลังส่วนลด</span>
                    <span className="font-bold text-green-700">{formatThaiMoney(netEstimate)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 5: กำหนดการ ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <SectionLabel num={5} label="กำหนดการ" />
              <div className="space-y-1.5">
                <Label>วันที่นัดรับ</Label>
                <Input type="date" {...register('dueDate')} />
              </div>
            </div>

            {/* ── Section 6: ถ่ายรูปเครื่อง ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <SectionLabel num={6} label="ถ่ายรูปเครื่อง (ไม่บังคับ)" />
              <div className="space-y-3">
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((f, i) => (
                      <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                        <img
                          src={URL.createObjectURL(f)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {photos.length < 6 && (
                      <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors shrink-0">
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-[10px] mt-1">เพิ่ม</span>
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? [])
                            setPhotos((prev) => [...prev, ...files].slice(0, 6))
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
                {photos.length === 0 && (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 p-4 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                    <Camera className="h-6 w-6 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-600">แนบรูปสภาพเครื่อง</p>
                      <p className="text-xs">รองรับสูงสุด 6 รูป · JPG, PNG, WEBP</p>
                    </div>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? [])
                        setPhotos(files.slice(0, 6))
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* ── Section 7: มอบหมายช่าง ── */}
            {techUsers.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <SectionLabel num={7} label="มอบหมายช่าง (ไม่บังคับ)" />
                <div className="flex flex-wrap gap-2">
                  {techUsers.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTechId(selectedTechId === t.id ? null : t.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all',
                        selectedTechId === t.id
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300',
                      )}
                    >
                      <TechnicianAvatar name={t.name} size="sm" />
                      {t.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {selectedTechId
                    ? <span className="text-purple-700 font-medium flex items-center gap-1"><UserCog className="h-3 w-3" />ช่างคนอื่นจะไม่เห็นงานนี้ใน Kanban</span>
                    : 'ถ้าไม่เลือก ช่างทุกคนจะเห็นงานนี้'}
                </p>
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="min-w-[130px]">
                {createMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังบันทึก...</>
                ) : 'สร้างงานซ่อม'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
