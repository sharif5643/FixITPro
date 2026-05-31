'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2, Plus, RefreshCw, Ban, CheckCircle, Zap,
  Users, Calendar, KeyRound, Copy, Check,
  ChevronDown, Loader2, Search,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
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
import { Tenant, TenantPlan, TenantStatus, TENANT_PLAN_LABEL, TENANT_STATUS_LABEL } from '@/types'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

type Filter = 'all' | 'expiring_soon' | 'expired' | 'suspended' | 'pending'

interface Stats {
  total: number
  active: number
  expiring: number
  expired: number
  suspended: number
  pending: number
}

// ── Helpers ───────────────────────────────────────────────────

const STATUS_COLOR: Record<TenantStatus, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SUSPENDED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  EXPIRED: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const PLAN_COLOR: Record<TenantPlan, string> = {
  TRIAL: 'bg-slate-700 text-slate-300',
  BASIC: 'bg-blue-900 text-blue-300',
  PRO: 'bg-violet-900 text-violet-300',
  ENTERPRISE: 'bg-amber-900 text-amber-300',
}

const DURATION_OPTIONS = [
  { label: '30 วัน', value: 30 },
  { label: '90 วัน', value: 90 },
  { label: '365 วัน (1 ปี)', value: 365 },
]

function daysLeft(expiryDate?: string | null): number | null {
  if (!expiryDate) return null
  return differenceInDays(new Date(expiryDate), new Date())
}

function ExpiryBadge({ expiryDate, status }: { expiryDate?: string | null; status: TenantStatus }) {
  if (status === 'PENDING') return <span className="text-slate-500 text-xs">ยังไม่เปิดใช้</span>
  if (!expiryDate) return <span className="text-slate-500 text-xs">—</span>

  const days = daysLeft(expiryDate)
  const dateStr = format(new Date(expiryDate), 'd MMM yyyy', { locale: th })

  if (days === null) return null
  if (days < 0) return <span className="text-red-400 text-xs">หมดอายุแล้ว ({dateStr})</span>
  if (days <= 7) return <span className="text-amber-400 text-xs font-medium">เหลือ {days} วัน ({dateStr})</span>
  return <span className="text-slate-400 text-xs">{dateStr} (เหลือ {days} วัน)</span>
}

// ── Create Dialog ─────────────────────────────────────────────

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    shopName: '', ownerName: '', phone: '', email: '', ownerPassword: '', notes: '',
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => api.post('/super-admin/tenants', form),
    onSuccess: () => {
      toast.success('เพิ่มร้านค้าสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      qc.invalidateQueries({ queryKey: ['sa-stats'] })
      onClose()
      setForm({ shopName: '', ownerName: '', phone: '', email: '', ownerPassword: '', notes: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มร้านค้าใหม่</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Field label="ชื่อร้าน *" value={form.shopName} onChange={set('shopName')} placeholder="ร้านมือถือ..." />
          <Field label="ชื่อเจ้าของร้าน *" value={form.ownerName} onChange={set('ownerName')} placeholder="นายสมชาย..." />
          <Field label="เบอร์โทร" value={form.phone} onChange={set('phone')} placeholder="08x-xxx-xxxx" />
          <Field label="อีเมล *" value={form.email} onChange={set('email')} type="email" placeholder="owner@shop.com" />
          <Field label="รหัสผ่าน Owner *" value={form.ownerPassword} onChange={set('ownerPassword')} type="password" placeholder="อย่างน้อย 6 ตัวอักษร" />
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">หมายเหตุ</Label>
            <Textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="หมายเหตุเพิ่มเติม..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 resize-none h-16 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.shopName || !form.email || !form.ownerPassword}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            เพิ่มร้านค้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Activate / Renew Dialog ───────────────────────────────────

type PlanAction = 'activate' | 'renew'

function PlanDialog({
  open, onClose, tenant, action,
}: {
  open: boolean; onClose: () => void; tenant: Tenant | null; action: PlanAction
}) {
  const qc = useQueryClient()
  const [plan, setPlan] = useState<TenantPlan>('BASIC')
  const [durationType, setDurationType] = useState<'preset' | 'custom'>('preset')
  const [duration, setDuration] = useState(30)
  const [customDate, setCustomDate] = useState('')
  const [note, setNote] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/super-admin/tenants/${tenant?.id}/${action}`, {
        plan,
        ...(durationType === 'preset' ? { duration } : { customExpiryDate: customDate }),
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success(action === 'activate' ? 'เปิดใช้งานร้านสำเร็จ' : 'ต่ออายุสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      qc.invalidateQueries({ queryKey: ['sa-stats'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  if (!tenant) return null

  const title = action === 'activate' ? `เปิดใช้งาน — ${tenant.shopName}` : `ต่ออายุ — ${tenant.shopName}`

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Plan */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">แพ็กเกจ</Label>
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

          {/* Duration type */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">ระยะเวลา</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={durationType === 'preset' ? 'default' : 'outline'}
                className={durationType === 'preset' ? 'bg-violet-600 hover:bg-violet-700' : 'border-slate-700 text-slate-300'}
                onClick={() => setDurationType('preset')}
              >
                เลือกจากรายการ
              </Button>
              <Button
                type="button"
                size="sm"
                variant={durationType === 'custom' ? 'default' : 'outline'}
                className={durationType === 'custom' ? 'bg-violet-600 hover:bg-violet-700' : 'border-slate-700 text-slate-300'}
                onClick={() => setDurationType('custom')}
              >
                กำหนดเอง
              </Button>
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

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">หมายเหตุ (ไม่บังคับ)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ชำระผ่านโอนเงิน..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (durationType === 'custom' && !customDate)}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action === 'activate' ? 'เปิดใช้งาน' : 'ต่ออายุ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Field helper ──────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: any; placeholder?: string; type?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-300 text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
      />
    </div>
  )
}

// ── Reset Owner Password Result Dialog ────────────────────────

function ResetOwnerPasswordResultDialog({
  result, onClose,
}: {
  result: { tempPassword: string; userName: string; shopName: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (result?.tempPassword) {
      navigator.clipboard.writeText(result.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!result) return null

  return (
    <Dialog open={!!result} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>รีเซ็ตรหัสผ่าน — {result.shopName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-amber-950/30 border border-amber-700/50 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-400">รหัสผ่านชั่วคราวของ {result.userName}</p>
            <p className="text-xs text-slate-400">แสดงเพียงครั้งเดียว — บันทึกก่อนปิด</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-base font-mono font-bold text-amber-300 tracking-wider">
                {result.tempPassword}
              </code>
              <Button size="sm" variant="outline" className="shrink-0 h-9 border-slate-700 text-slate-300 hover:text-white" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            เจ้าของร้านจะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full bg-violet-600 hover:bg-violet-700">รับทราบแล้ว</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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

// ── Main Page ─────────────────────────────────────────────────

export default function TenantsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [planDialog, setPlanDialog] = useState<{ open: boolean; tenant: Tenant | null; action: PlanAction }>({
    open: false, tenant: null, action: 'activate',
  })
  const [resetOwnerResult, setResetOwnerResult] = useState<{ tempPassword: string; userName: string; shopName: string } | null>(null)

  const { data: statsData } = useQuery<Stats>({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/super-admin/tenants/stats').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data, isLoading } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ['sa-tenants', filter],
    queryFn: () =>
      api.get('/super-admin/tenants', { params: filter !== 'all' ? { filter } : {} }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/super-admin/tenants/${id}/suspend`),
    onSuccess: () => {
      toast.success('ระงับร้านค้าสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      qc.invalidateQueries({ queryKey: ['sa-stats'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/super-admin/tenants/${id}/reactivate`),
    onSuccess: () => {
      toast.success('เปิดใช้งานร้านสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      qc.invalidateQueries({ queryKey: ['sa-stats'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const resetOwnerPasswordMutation = useMutation({
    mutationFn: ({ tenantId, shopName }: { tenantId: string; shopName: string }) =>
      api.post(`/super-admin/tenants/${tenantId}/reset-owner-password`).then((r) => ({ ...r.data, shopName })),
    onSuccess: (data) => setResetOwnerResult(data),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const tenants = (data?.data ?? []).filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.shopName.toLowerCase().includes(q) ||
      t.ownerName.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      (t.phone ?? '').includes(q)
    )
  })

  const stats = statsData

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">จัดการร้านค้า</h1>
          <p className="text-slate-400 text-sm mt-0.5">ลงทะเบียน เปิดแพ็กเกจ และจัดการร้านค้าทั้งหมด</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700">
          <Plus className="h-4 w-4 mr-2" />
          เพิ่มร้านค้าใหม่
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <StatCard label="ทั้งหมด" value={stats.total} color="text-white" />
          <StatCard label="ใช้งานอยู่" value={stats.active} color="text-emerald-400" />
          <StatCard label="ใกล้หมดอายุ" value={stats.expiring} color="text-amber-400" />
          <StatCard label="หมดอายุ" value={stats.expired} color="text-red-400" />
          <StatCard label="ถูกระงับ" value={stats.suspended} color="text-orange-400" />
          <StatCard label="รอเปิดใช้" value={stats.pending} color="text-slate-400" />
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {(
            [
              { value: 'all',           label: 'ทั้งหมด',      active: 'bg-slate-700 text-white' },
              { value: 'expiring_soon', label: 'ใกล้หมดอายุ', active: 'bg-amber-900 text-amber-200' },
              { value: 'expired',       label: 'หมดอายุ',      active: 'bg-red-900 text-red-200' },
              { value: 'suspended',     label: 'ถูกระงับ',     active: 'bg-orange-900 text-orange-200' },
              { value: 'pending',       label: 'รอเปิด',       active: 'bg-slate-700 text-white' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                filter === tab.value ? tab.active : 'text-slate-400 hover:text-slate-300',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาร้าน, เจ้าของ, อีเมล..."
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
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Building2 className="h-10 w-10 mb-3 opacity-30" />
            <p>ไม่พบข้อมูลร้านค้า</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">ร้านค้า</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">แพ็กเกจ</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">สถานะ</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">วันหมดอายุ</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">ผู้ใช้งาน</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">สมัครเมื่อ</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const days = daysLeft(tenant.expiryDate)
                const isExpiringSoon = tenant.status === 'ACTIVE' && days !== null && days >= 0 && days <= 7
                return (
                  <tr
                    key={tenant.id}
                    className={cn(
                      'border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors',
                      isExpiringSoon && 'bg-amber-950/10',
                    )}
                  >
                    {/* Shop info */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{tenant.shopName}</div>
                      <div className="text-slate-500 text-xs">{tenant.ownerName} · {tenant.email}</div>
                      {tenant.phone && <div className="text-slate-600 text-xs">{tenant.phone}</div>}
                    </td>

                    {/* Plan */}
                    <td className="py-3 px-4">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', PLAN_COLOR[tenant.plan])}>
                        {TENANT_PLAN_LABEL[tenant.plan]}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className={cn('px-2 py-0.5 rounded border text-xs font-medium', STATUS_COLOR[tenant.status])}>
                        {TENANT_STATUS_LABEL[tenant.status]}
                      </span>
                    </td>

                    {/* Expiry */}
                    <td className="py-3 px-4">
                      <ExpiryBadge expiryDate={tenant.expiryDate} status={tenant.status} />
                    </td>

                    {/* Users */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-slate-400 text-xs">
                        <Users className="h-3 w-3" />
                        {tenant._count?.users ?? 0}
                      </div>
                    </td>

                    {/* Created at */}
                    <td className="py-3 px-4">
                      <span className="text-slate-500 text-xs">
                        {format(new Date(tenant.createdAt), 'd MMM yyyy', { locale: th })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800 h-7 px-2">
                            จัดการ <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-slate-800 border-slate-700 text-white min-w-40">
                          {tenant.status === 'PENDING' && (
                            <DropdownMenuItem
                              className="focus:bg-slate-700 cursor-pointer text-emerald-400 focus:text-emerald-400"
                              onClick={() => setPlanDialog({ open: true, tenant, action: 'activate' })}
                            >
                              <Zap className="h-4 w-4 mr-2" />
                              เปิดใช้งาน
                            </DropdownMenuItem>
                          )}

                          {(tenant.status === 'ACTIVE' || tenant.status === 'EXPIRED') && (
                            <DropdownMenuItem
                              className="focus:bg-slate-700 cursor-pointer"
                              onClick={() => setPlanDialog({ open: true, tenant, action: 'renew' })}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              ต่ออายุ
                            </DropdownMenuItem>
                          )}

                          {tenant.status === 'ACTIVE' && (
                            <DropdownMenuItem
                              className="focus:bg-slate-700 cursor-pointer"
                              onClick={() => setPlanDialog({ open: true, tenant, action: 'activate' })}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              เปลี่ยนแพ็กเกจ
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator className="bg-slate-700" />

                          <DropdownMenuItem
                            className="focus:bg-slate-700 cursor-pointer text-amber-400 focus:text-amber-400"
                            onClick={() => resetOwnerPasswordMutation.mutate({ tenantId: tenant.id, shopName: tenant.shopName })}
                            disabled={resetOwnerPasswordMutation.isPending}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            รีเซ็ตรหัสผ่าน Owner
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-slate-700" />

                          {tenant.status === 'SUSPENDED' ? (
                            <DropdownMenuItem
                              className="focus:bg-slate-700 cursor-pointer text-emerald-400 focus:text-emerald-400"
                              onClick={() => reactivateMutation.mutate(tenant.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              เปิดกลับมาใช้งาน
                            </DropdownMenuItem>
                          ) : (
                            tenant.status !== 'PENDING' && (
                              <DropdownMenuItem
                                className="focus:bg-slate-700 cursor-pointer text-orange-400 focus:text-orange-400"
                                onClick={() => suspendMutation.mutate(tenant.id)}
                              >
                                <Ban className="h-4 w-4 mr-2" />
                                ระงับร้าน
                              </DropdownMenuItem>
                            )
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialogs */}
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <PlanDialog
        open={planDialog.open}
        onClose={() => setPlanDialog((d) => ({ ...d, open: false }))}
        tenant={planDialog.tenant}
        action={planDialog.action}
      />
      <ResetOwnerPasswordResultDialog
        result={resetOwnerResult}
        onClose={() => setResetOwnerResult(null)}
      />
    </div>
  )
}
