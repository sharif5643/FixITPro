'use client'

import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User, X, Shuffle, Wrench, ShoppingCart, Printer, FileText, CheckCircle2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
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
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { Customer, RepairStatus } from '@/types'

// Simple debounce hook
function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Minimal customer type from search results
interface CustomerSearchResult {
  id: string
  name: string
  phone?: string
  points: number
  _count: { sales: number; repairs: number }
}

// Full customer detail (from GET /customers/:id)
interface CustomerDetail extends Customer {
  totalSpending: number
  _count: { sales: number; repairs: number }
  repairs: {
    id: string
    ticketNumber: string
    deviceBrand: string
    deviceModel: string
    deviceImei?: string
    issue: string
    status: RepairStatus
    receivedAt: string
  }[]
  sales: {
    id: string
    receiptNumber: string
    total: number
    status: string
    createdAt: string
  }[]
}

const REPAIR_STATUS_LABEL: Partial<Record<RepairStatus, string>> = {
  RECEIVED: 'รับงาน',
  DIAGNOSING: 'ตรวจสอบ',
  WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  WAITING_PARTS: 'รออะไหล่',
  IN_PROGRESS: 'กำลังซ่อม',
  COMPLETED: 'ซ่อมเสร็จ',
  DELIVERED: 'ส่งคืนแล้ว',
  CANCELLED: 'ยกเลิก',
}

const repairSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  deviceBrand: z.string().min(1, 'กรุณากรอกยี่ห้อ'),
  deviceModel: z.string().min(1, 'กรุณากรอกรุ่น'),
  deviceImei: z.string().optional(),
  issue: z.string().min(1, 'กรุณากรอกอาการเสีย'),
  note: z.string().optional(),
  deposit: z.coerce.number().min(0).optional(),
  estimateCost: z.coerce.number().min(0).optional(),
})

type RepairFormData = z.infer<typeof repairSchema>

interface RepairFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function generateImei(): string {
  return Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('')
}

export function RepairFormDialog({ open, onOpenChange, onSuccess }: RepairFormDialogProps) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<RepairFormData>({
    resolver: zodResolver(repairSchema),
    defaultValues: { deposit: 0, estimateCost: 0 },
  })

  const deposit      = Number(watch('deposit')) || 0
  const estimateCost = Number(watch('estimateCost')) || 0

  // Receipt state after successful creation
  const [createdRepair, setCreatedRepair] = useState<{ id: string; ticketNumber: string } | null>(null)

  // Customer selection state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [customerSearch, setCustomerSearch]     = useState('')
  const [searchOpen, setSearchOpen]             = useState(false)
  const searchRef                               = useRef<HTMLDivElement>(null)
  const debouncedSearch                         = useDebounce(customerSearch, 300)

  useEffect(() => {
    if (open) {
      reset({ deposit: 0, estimateCost: 0 })
      setSelectedCustomer(null)
      setCustomerSearch('')
      setSearchOpen(false)
      setCreatedRepair(null)
    }
  }, [open, reset])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Customer search query
  const { data: searchResults = [] } = useQuery<CustomerSearchResult[]>({
    queryKey: ['customers', 'search', debouncedSearch],
    queryFn: async () => (await api.get('/customers', { params: { search: debouncedSearch } })).data,
    enabled: searchOpen && debouncedSearch.length >= 1,
    staleTime: 10_000,
  })

  // Fetch full customer detail for history display
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
    setValue('customerName', c.name)
    setValue('customerPhone', c.phone ?? '')
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setValue('customerName', '')
    setValue('customerPhone', '')
  }

  const createMutation = useMutation({
    mutationFn: async (data: RepairFormData) => {
      const res = await api.post('/repairs', {
        customerId:    selectedCustomer?.id,
        customerName:  !selectedCustomer ? (data.customerName?.trim() || undefined) : undefined,
        customerPhone: !selectedCustomer ? (data.customerPhone?.trim() || undefined) : undefined,
        deviceBrand:   data.deviceBrand.trim(),
        deviceModel:   data.deviceModel.trim(),
        deviceImei:    data.deviceImei?.trim() || undefined,
        issue:         data.issue.trim(),
        note:          data.note?.trim() || undefined,
        deposit:       data.deposit || 0,
        estimateCost:  data.estimateCost || undefined,
      })
      return res.data
    },
    onSuccess: (repair) => {
      toast.success(`สร้างงานซ่อม ${repair.ticketNumber} สำเร็จ`)
      setCreatedRepair({ id: repair.id, ticketNumber: repair.ticketNumber })
      // Refresh the list in the background — do NOT call onSuccess() yet
      // (calling it would close the dialog before user sees the receipt panel)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{createdRepair ? 'สร้างงานซ่อมสำเร็จ' : 'สร้างงานซ่อมใหม่'}</DialogTitle>
        </DialogHeader>

        {/* ─── Receipt options panel (shown after creation) ─── */}
        {createdRepair && (
          <div className="py-4 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-semibold text-gray-900">เลขงาน: {createdRepair.ticketNumber}</p>
              <p className="text-sm text-muted-foreground">เลือกรูปแบบพิมพ์ใบรับงานซ่อม</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => window.open(`/print/repair/${createdRepair.id}?paper=58mm`, '_blank')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <Printer className="h-5 w-5" />
                58mm<br />(ใบร้าน)
              </button>
              <button
                type="button"
                onClick={() => window.open(`/print/repair/${createdRepair.id}?paper=58mm`, '_blank')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <Printer className="h-5 w-5" />
                58mm<br />(ใบลูกค้า)
              </button>
              <button
                type="button"
                onClick={() => window.open(`/print/repair/${createdRepair.id}?paper=A4`, '_blank')}
                className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <FileText className="h-5 w-5" />
                A4<br />(เอกสาร)
              </button>
            </div>
            <Button className="w-full" onClick={handleClose}>
              ปิด
            </Button>
          </div>
        )}

        {/* ─── Repair form ─── */}
        {!createdRepair && <form
          onSubmit={handleSubmit((data) => createMutation.mutateAsync(data))}
          className="space-y-4 pt-1"
        >
          {/* ─── Customer ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              ข้อมูลลูกค้า
            </p>

            {selectedCustomer ? (
              /* Selected customer card */
              <div className="rounded-xl border bg-blue-50/40 border-blue-100 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{selectedCustomer.name}</p>
                      {selectedCustomer.phone && (
                        <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] bg-white border rounded-full px-2 py-0.5 text-gray-500">
                      ซ่อม {selectedCustomer._count.repairs} · ซื้อ {selectedCustomer._count.sales}
                    </span>
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Customer history */}
                {customerDetail && (
                  <div className="space-y-2 border-t pt-2">
                    {customerDetail.repairs.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                          <Wrench className="h-2.5 w-2.5" />
                          ประวัติซ่อมล่าสุด
                        </div>
                        <div className="space-y-1">
                          {customerDetail.repairs.slice(0, 3).map((r) => (
                            <div key={r.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-2 py-1.5 border">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-gray-900">{r.deviceBrand} {r.deviceModel}</span>
                                {r.deviceImei && (
                                  <span className="text-muted-foreground ml-1 font-mono">#{r.deviceImei.slice(-6)}</span>
                                )}
                                <p className="text-muted-foreground truncate">{r.issue}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="text-[10px] bg-blue-50 text-blue-700 rounded-full px-1.5 py-0.5">
                                  {REPAIR_STATUS_LABEL[r.status] ?? r.status}
                                </span>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {format(new Date(r.receivedAt), 'dd MMM yy', { locale: th })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {customerDetail.sales.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                          <ShoppingCart className="h-2.5 w-2.5" />
                          ซื้อล่าสุด
                        </div>
                        <div className="space-y-1">
                          {customerDetail.sales.slice(0, 2).map((s) => (
                            <div key={s.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1.5 border">
                              <span className="font-mono text-blue-700">{s.receiptNumber}</span>
                              <span className="font-medium tabular-nums">{formatThaiMoney(Number(s.total))}</span>
                              <span className="text-muted-foreground">
                                {format(new Date(s.createdAt), 'dd MMM yy', { locale: th })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {customerDetail.repairs.length === 0 && customerDetail.sales.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">ยังไม่มีประวัติ</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Customer search + manual input */
              <div className="space-y-3">
                {/* Search autocomplete */}
                <div ref={searchRef} className="relative">
                  <Label className="mb-1.5 block">ค้นหาลูกค้าเก่า</Label>
                  <Input
                    placeholder="พิมพ์ชื่อหรือเบอร์โทร..."
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setSearchOpen(true) }}
                    onFocus={() => setSearchOpen(true)}
                    className="text-sm"
                  />
                  {searchOpen && customerSearch.length >= 1 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {searchResults.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground text-center">ไม่พบลูกค้า</div>
                      ) : (
                        searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b last:border-0"
                            onClick={() => selectCustomer(c)}
                          >
                            <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.phone ?? 'ไม่มีเบอร์'} · ซ่อม {c._count.repairs} · ซื้อ {c._count.sales}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Manual input for new customer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>ชื่อลูกค้าใหม่</Label>
                    <Input placeholder="ถ้าไม่เลือกจากด้านบน" {...register('customerName')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>เบอร์โทร</Label>
                    <Input placeholder="0XX-XXX-XXXX" {...register('customerPhone')} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">ระบุเบอร์โทรเพื่อป้องกันการสร้างซ้ำ</p>
              </div>
            )}
          </div>

          {/* ─── Device ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              ข้อมูลอุปกรณ์
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ยี่ห้อ <span className="text-red-500">*</span></Label>
                  <Input placeholder="เช่น Samsung, Apple" {...register('deviceBrand')} />
                  {errors.deviceBrand && (
                    <p className="text-xs text-red-500">{errors.deviceBrand.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>รุ่น <span className="text-red-500">*</span></Label>
                  <Input placeholder="เช่น Galaxy S24" {...register('deviceModel')} />
                  {errors.deviceModel && (
                    <p className="text-xs text-red-500">{errors.deviceModel.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <Label>IMEI / Serial Number</Label>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    onClick={() => setValue('deviceImei', generateImei())}
                  >
                    <Shuffle className="h-3 w-3" />
                    สร้างอัตโนมัติ
                  </button>
                </div>
                <Input placeholder="15-17 หลัก" {...register('deviceImei')} />
              </div>
            </div>
          </div>

          {/* ─── Issue ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              อาการและหมายเหตุ
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>อาการเสีย <span className="text-red-500">*</span></Label>
                <textarea
                  rows={3}
                  placeholder="ระบุอาการที่พบ..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  {...register('issue')}
                />
                {errors.issue && (
                  <p className="text-xs text-red-500">{errors.issue.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input placeholder="บันทึกเพิ่มเติม..." {...register('note')} />
              </div>
            </div>
          </div>

          {/* ─── Costs ─── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              ค่าใช้จ่าย (ประมาณเบื้องต้น)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ค่ามัดจำ (฿)</Label>
                <Input type="number" min={0} step={1} placeholder="0" {...register('deposit')} />
              </div>
              <div className="space-y-1.5">
                <Label>ราคาประเมิน (฿)</Label>
                <Input type="number" min={0} step={1} placeholder="0" {...register('estimateCost')} />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-[120px]">
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                'สร้างงานซ่อม'
              )}
            </Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  )
}
