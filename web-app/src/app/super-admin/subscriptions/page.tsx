'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CreditCard, Plus, CheckCircle, XCircle, Zap, Loader2,
  Search, Clock, User, Calendar, Hash, Banknote,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import {
  Tenant, TenantPayment, TenantPlan, PaymentStatus,
  TENANT_PLAN_LABEL, PAYMENT_STATUS_LABEL,
} from '@/types'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

type Filter = 'all' | 'pending' | 'verified' | 'rejected' | 'activated'

interface Stats {
  total: number
  pending: number
  verified: number
  rejected: number
  activated: number
}

// ── Helpers ───────────────────────────────────────────────────

const STATUS_STYLE: Record<PaymentStatus, string> = {
  PENDING:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  VERIFIED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const PLAN_STYLE: Record<TenantPlan, string> = {
  TRIAL:      'bg-slate-700 text-slate-300',
  BASIC:      'bg-blue-900 text-blue-300',
  PRO:        'bg-violet-900 text-violet-300',
  ENTERPRISE: 'bg-amber-900 text-amber-300',
}

const DURATION_OPTIONS = [
  { label: '30 วัน', value: 30 },
  { label: '90 วัน', value: 90 },
  { label: '365 วัน (1 ปี)', value: 365 },
]

function fmt(d?: string | null) {
  if (!d) return '—'
  return format(new Date(d), 'd MMM yyyy', { locale: th })
}

function fmtAmount(n?: number | null) {
  if (n == null) return '—'
  return `฿${Number(n).toLocaleString()}`
}

// ── Stat Card ─────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </div>
  )
}

// ── Field helper ──────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = 'text', required = false,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-300 text-xs">
        {label} {required && <span className="text-red-400">*</span>}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
      />
    </div>
  )
}

// ── Create Payment Dialog ─────────────────────────────────────

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [tenantId, setTenantId] = useState('')
  const [plan, setPlan] = useState<TenantPlan>('BASIC')
  const [durationType, setDurationType] = useState<'preset' | 'custom'>('preset')
  const [duration, setDuration] = useState(30)
  const [customDate, setCustomDate] = useState('')
  const [ref, setRef] = useState('')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const reset = () => {
    setTenantId(''); setPlan('BASIC'); setDurationType('preset'); setDuration(30)
    setCustomDate(''); setRef(''); setDate(''); setAmount(''); setNote('')
  }

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ['sa-tenants-list'],
    queryFn: () => api.get('/super-admin/tenants').then((r) => r.data.data ?? r.data),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/super-admin/payments', {
        tenantId,
        plan,
        ...(durationType === 'preset' ? { duration } : { customExpiryDate: customDate }),
        paymentReference: ref || undefined,
        paymentDate: date || undefined,
        paymentAmount: amount ? Number(amount) : undefined,
        paymentNote: note || undefined,
      }),
    onSuccess: () => {
      toast.success('สร้างรายการชำระเงินสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-payments'] })
      qc.invalidateQueries({ queryKey: ['sa-payment-stats'] })
      onClose(); reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset() } }}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>สร้างรายการชำระเงิน</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          {/* Tenant */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">ร้านค้า <span className="text-red-400">*</span></Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="เลือกร้านค้า..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="focus:bg-slate-700 focus:text-white">
                    {t.shopName} <span className="text-slate-400 text-xs ml-1">({t.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Plan */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">แพ็กเกจ <span className="text-red-400">*</span></Label>
            <Select value={plan} onValueChange={(v: string) => setPlan(v as TenantPlan)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-white">
                {(['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE'] as TenantPlan[]).map((p) => (
                  <SelectItem key={p} value={p} className="focus:bg-slate-700 focus:text-white">
                    {TENANT_PLAN_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">ระยะเวลา <span className="text-red-400">*</span></Label>
            <div className="flex gap-2 mb-2">
              {(['preset', 'custom'] as const).map((t) => (
                <Button
                  key={t}
                  type="button" size="sm"
                  variant={durationType === t ? 'default' : 'outline'}
                  className={durationType === t ? 'bg-violet-600 hover:bg-violet-700' : 'border-slate-700 text-slate-300'}
                  onClick={() => setDurationType(t)}
                >
                  {t === 'preset' ? 'เลือกจากรายการ' : 'กำหนดเอง'}
                </Button>
              ))}
            </div>
            {durationType === 'preset' ? (
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDuration(opt.value)}
                    className={cn(
                      'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                      duration === opt.value
                        ? 'border-violet-500 bg-violet-600 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="bg-slate-800 border-slate-700 text-white"
              />
            )}
          </div>

          <div className="border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-500 mb-3">ข้อมูลการโอนเงิน (กรอกได้ทีหลังตอนตรวจสอบ)</p>
            <div className="space-y-3">
              <Field label="เลขอ้างอิง / เลขที่สลิป" value={ref} onChange={setRef} placeholder="20240508XXXXXXXX" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="วันที่โอน" value={date} onChange={setDate} type="date" />
                <Field label="จำนวนเงิน (บาท)" value={amount} onChange={setAmount} type="number" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300 text-xs">หมายเหตุการโอน</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม..."
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 resize-none h-16 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !tenantId || (durationType === 'custom' && !customDate)}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            สร้างรายการ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Verify Dialog ─────────────────────────────────────────────

function VerifyDialog({
  payment, open, onClose,
}: { payment: TenantPayment | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [ref, setRef] = useState(payment?.paymentReference ?? '')
  const [date, setDate] = useState(
    payment?.paymentDate ? payment.paymentDate.split('T')[0] : ''
  )
  const [amount, setAmount] = useState(payment?.paymentAmount?.toString() ?? '')
  const [payNote, setPayNote] = useState(payment?.paymentNote ?? '')
  const [adminNote, setAdminNote] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/super-admin/payments/${payment?.id}/verify`, {
        paymentReference: ref || undefined,
        paymentDate: date || undefined,
        paymentAmount: amount ? Number(amount) : undefined,
        paymentNote: payNote || undefined,
        adminNote: adminNote || undefined,
      }),
    onSuccess: () => {
      toast.success('ตรวจสอบการชำระเงินสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-payments'] })
      qc.invalidateQueries({ queryKey: ['sa-payment-stats'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  if (!payment) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            ตรวจสอบการชำระเงิน
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="bg-slate-800 rounded-lg p-3 text-sm space-y-1">
          <p className="text-white font-medium">{payment.tenant.shopName}</p>
          <p className="text-slate-400 text-xs">{payment.tenant.email}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-300">
            <span className={cn('px-1.5 py-0.5 rounded text-xs', PLAN_STYLE[payment.plan])}>
              {TENANT_PLAN_LABEL[payment.plan]}
            </span>
            <span>{payment.customExpiryDate ? `ถึง ${fmt(payment.customExpiryDate)}` : `${payment.duration} วัน`}</span>
          </div>
        </div>

        <div className="space-y-3 py-1">
          <Field label="เลขอ้างอิง / เลขที่สลิป" value={ref} onChange={setRef} placeholder="20240508XXXXXXXX" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันที่โอน" value={date} onChange={setDate} type="date" />
            <Field label="จำนวนเงิน (บาท)" value={amount} onChange={setAmount} type="number" placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">หมายเหตุการโอน</Label>
            <Input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">บันทึก Admin</Label>
            <Input
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="บันทึกสำหรับ admin..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ยืนยันการชำระเงิน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Reject Dialog ─────────────────────────────────────────────

function RejectDialog({
  payment, open, onClose,
}: { payment: TenantPayment | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [adminNote, setAdminNote] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/super-admin/payments/${payment?.id}/reject`, { adminNote: adminNote || undefined }),
    onSuccess: () => {
      toast.success('ปฏิเสธรายการสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-payments'] })
      qc.invalidateQueries({ queryKey: ['sa-payment-stats'] })
      onClose(); setAdminNote('')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  if (!payment) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-400" />
            ปฏิเสธรายการชำระเงิน
          </DialogTitle>
        </DialogHeader>
        <p className="text-slate-400 text-sm">
          ปฏิเสธรายการชำระเงินของ <span className="text-white font-medium">{payment.tenant.shopName}</span>
        </p>
        <div className="space-y-1">
          <Label className="text-slate-300 text-xs">เหตุผล / บันทึก Admin</Label>
          <Textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="เช่น ไม่พบการโอนเงิน, ยอดไม่ตรง..."
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 resize-none h-20 text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ปฏิเสธ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Payment Row ───────────────────────────────────────────────

function PaymentRow({
  payment,
  onVerify, onReject, onActivate,
}: {
  payment: TenantPayment
  onVerify: (p: TenantPayment) => void
  onReject: (p: TenantPayment) => void
  onActivate: (p: TenantPayment) => void
}) {
  const activated = !!payment.activatedAt
  const canVerify   = payment.status === 'PENDING'
  const canReject   = payment.status !== 'REJECTED' && !activated
  const canActivate = payment.status === 'VERIFIED' && !activated

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
      {/* Shop */}
      <td className="py-3 px-4">
        <p className="text-white font-medium text-sm">{payment.tenant.shopName}</p>
        <p className="text-slate-500 text-xs">{payment.tenant.email}</p>
      </td>

      {/* Plan + Duration */}
      <td className="py-3 px-4">
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', PLAN_STYLE[payment.plan])}>
          {TENANT_PLAN_LABEL[payment.plan]}
        </span>
        <p className="text-slate-500 text-xs mt-1">
          {payment.customExpiryDate ? `ถึง ${fmt(payment.customExpiryDate)}` : `${payment.duration} วัน`}
        </p>
      </td>

      {/* Payment info */}
      <td className="py-3 px-4 space-y-0.5">
        {payment.paymentReference ? (
          <div className="flex items-center gap-1 text-slate-300 text-xs">
            <Hash className="h-3 w-3 text-slate-500" />
            {payment.paymentReference}
          </div>
        ) : (
          <span className="text-slate-600 text-xs">ยังไม่มีข้อมูล</span>
        )}
        {payment.paymentAmount != null && (
          <div className="flex items-center gap-1 text-emerald-400 text-xs">
            <Banknote className="h-3 w-3" />
            {fmtAmount(payment.paymentAmount)}
          </div>
        )}
        {payment.paymentDate && (
          <div className="flex items-center gap-1 text-slate-400 text-xs">
            <Calendar className="h-3 w-3" />
            {fmt(payment.paymentDate)}
          </div>
        )}
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        <span className={cn('px-2 py-0.5 rounded border text-xs font-medium', STATUS_STYLE[payment.status])}>
          {PAYMENT_STATUS_LABEL[payment.status]}
        </span>
        {activated && (
          <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1">
            <Zap className="h-3 w-3" /> เปิดใช้งานแล้ว
          </p>
        )}
      </td>

      {/* Verified by */}
      <td className="py-3 px-4">
        {payment.verifiedBy ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-slate-300 text-xs">
              <User className="h-3 w-3 text-slate-500" />
              {payment.verifiedBy.name}
            </div>
            <p className="text-slate-600 text-xs">{fmt(payment.verifiedAt)}</p>
          </div>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>

      {/* Created */}
      <td className="py-3 px-4">
        <span className="text-slate-500 text-xs">{fmt(payment.createdAt)}</span>
      </td>

      {/* Actions */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          {canVerify && (
            <Button
              size="sm"
              onClick={() => onVerify(payment)}
              className="h-7 px-2.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              ตรวจสอบ
            </Button>
          )}
          {canActivate && (
            <Button
              size="sm"
              onClick={() => onActivate(payment)}
              className="h-7 px-2.5 text-xs bg-violet-700 hover:bg-violet-600 text-white"
            >
              <Zap className="h-3 w-3 mr-1" />
              เปิดใช้งาน
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onReject(payment)}
              className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950"
            >
              <XCircle className="h-3 w-3 mr-1" />
              ปฏิเสธ
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<TenantPayment | null>(null)
  const [rejectTarget, setRejectTarget] = useState<TenantPayment | null>(null)

  const { data: stats } = useQuery<Stats>({
    queryKey: ['sa-payment-stats'],
    queryFn: () => api.get('/super-admin/payments/stats').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: payments = [], isLoading } = useQuery<TenantPayment[]>({
    queryKey: ['sa-payments', filter],
    queryFn: () =>
      api.get('/super-admin/payments', { params: filter !== 'all' ? { filter } : {} })
         .then((r) => r.data),
    refetchInterval: 30_000,
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/super-admin/payments/${id}/activate`),
    onSuccess: () => {
      toast.success('เปิดใช้งานแพ็กเกจสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-payments'] })
      qc.invalidateQueries({ queryKey: ['sa-payment-stats'] })
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const filtered = payments.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.tenant.shopName.toLowerCase().includes(q) ||
      p.tenant.email.toLowerCase().includes(q) ||
      (p.paymentReference ?? '').toLowerCase().includes(q)
    )
  })

  const FILTER_TABS: { value: Filter; label: string; count?: number; active: string }[] = [
    { value: 'all',       label: 'ทั้งหมด',        count: stats?.total,     active: 'bg-slate-700 text-white' },
    { value: 'pending',   label: 'รอตรวจสอบ',      count: stats?.pending,   active: 'bg-amber-900 text-amber-200' },
    { value: 'verified',  label: 'ตรวจสอบแล้ว',   count: stats?.verified,  active: 'bg-emerald-900 text-emerald-200' },
    { value: 'activated', label: 'เปิดใช้งานแล้ว', count: stats?.activated, active: 'bg-violet-900 text-violet-200' },
    { value: 'rejected',  label: 'ปฏิเสธ',         count: stats?.rejected,  active: 'bg-red-900 text-red-200' },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ตรวจสอบการชำระเงิน</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            รับสลิป → ตรวจสอบ → เปิดใช้งานแพ็กเกจ
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700">
          <Plus className="h-4 w-4 mr-2" />
          สร้างรายการชำระเงิน
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="ทั้งหมด"        value={stats.total}     color="text-white" />
          <StatCard label="รอตรวจสอบ"      value={stats.pending}   color="text-amber-400" />
          <StatCard label="ตรวจสอบแล้ว"   value={stats.verified}  color="text-emerald-400" />
          <StatCard label="เปิดใช้งานแล้ว" value={stats.activated} color="text-violet-400" />
          <StatCard label="ปฏิเสธ"         value={stats.rejected}  color="text-red-400" />
        </div>
      )}

      {/* Pending alert */}
      {(stats?.pending ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-lg px-4 py-3">
          <Clock className="h-5 w-5 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm">
            มี <span className="font-bold">{stats!.pending}</span> รายการรอการตรวจสอบ
          </p>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 flex-wrap">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                filter === tab.value ? tab.active : 'text-slate-400 hover:text-slate-300',
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs',
                  filter === tab.value ? 'bg-white/20' : 'bg-slate-800 text-slate-500',
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาร้าน, อีเมล, เลขอ้างอิง..."
            className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <CreditCard className="h-10 w-10 mb-3 opacity-30" />
            <p>ไม่พบรายการชำระเงิน</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">ร้านค้า</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">แพ็กเกจ</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">การโอนเงิน</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">สถานะ</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">ตรวจสอบโดย</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">สร้างเมื่อ</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  onVerify={setVerifyTarget}
                  onReject={setRejectTarget}
                  onActivate={(pay) => activateMutation.mutate(pay.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialogs */}
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <VerifyDialog
        payment={verifyTarget}
        open={!!verifyTarget}
        onClose={() => setVerifyTarget(null)}
      />
      <RejectDialog
        payment={rejectTarget}
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
      />
    </div>
  )
}
