'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Users, CreditCard, Calendar, Settings,
  ScrollText, GitBranch, RefreshCw, Ban, CheckCircle, KeyRound,
  Zap, Loader2, Copy, Check, Clock, Mail, Phone, Hash,
  CheckCircle2, XCircle, Puzzle, ToggleLeft, ToggleRight, Trash2,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TenantStatusBadge, PlanBadge } from '@/components/super-admin/status-badge'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import type {
  Tenant, TenantPlan, TenantRenewal, TenantPayment,
  SuperAdminBranch, SuperAdminUser, AuditLogEntry, TenantModuleStatus,
} from '@/types'
import { TENANT_PLAN_LABEL, PAYMENT_STATUS_LABEL } from '@/types'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'branches' | 'users' | 'subscription' | 'payments' | 'activity' | 'settings' | 'modules'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: Building2  },
  { id: 'branches',     label: 'Branches',      icon: GitBranch  },
  { id: 'users',        label: 'Users',          icon: Users      },
  { id: 'subscription', label: 'Subscription',  icon: CreditCard },
  { id: 'payments',     label: 'Payments',       icon: CreditCard },
  { id: 'activity',     label: 'Activity Logs', icon: ScrollText },
  { id: 'modules',      label: 'Modules',        icon: Puzzle     },
  { id: 'settings',     label: 'Settings',       icon: Settings   },
]

const DURATION_OPTIONS = [
  { label: '30 วัน',         value: 30  },
  { label: '90 วัน',         value: 90  },
  { label: '365 วัน (1 ปี)', value: 365 },
  { label: '730 วัน (2 ปี)', value: 730 },
]

// ── Renew / Activate Dialog ───────────────────────────────────────────────────

function PlanDialog({
  open, onClose, tenant, action,
}: {
  open: boolean; onClose: () => void; tenant: Tenant; action: 'activate' | 'renew'
}) {
  const qc = useQueryClient()
  const [plan, setPlan] = useState<TenantPlan>(tenant.plan ?? 'BASIC')
  const [durationType, setDurationType] = useState<'preset' | 'custom'>('preset')
  const [duration, setDuration] = useState(365)
  const [customDate, setCustomDate] = useState('')
  const [note, setNote] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/super-admin/tenants/${tenant.id}/${action}`, {
        plan,
        ...(durationType === 'preset' ? { duration } : { customExpiryDate: customDate }),
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success(action === 'activate' ? 'เปิดใช้งานสำเร็จ' : 'ต่ออายุสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenant', tenant.id] })
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>{action === 'activate' ? 'เปิดใช้งาน' : 'ต่ออายุ'} — {tenant.shopName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">ระยะเวลา</Label>
            <div className="flex gap-2">
              {(['preset', 'custom'] as const).map((t) => (
                <Button key={t} type="button" size="sm"
                  className={durationType === t ? 'bg-violet-600 hover:bg-violet-700' : 'border-slate-700 text-slate-300'}
                  variant={durationType === t ? 'default' : 'outline'}
                  onClick={() => setDurationType(t)}
                >
                  {t === 'preset' ? 'เลือกจากรายการ' : 'กำหนดเอง'}
                </Button>
              ))}
            </div>
            {durationType === 'preset' ? (
              <div className="grid grid-cols-2 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setDuration(opt.value)}
                    className={cn(
                      'rounded-lg border py-2 text-xs font-medium transition-colors',
                      duration === opt.value
                        ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="bg-slate-800 border-slate-700 text-white" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">หมายเหตุ</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่บังคับ..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || (durationType === 'custom' && !customDate)}
            className="bg-violet-600 hover:bg-violet-700">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action === 'activate' ? 'เปิดใช้งาน' : 'ต่ออายุ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ tenant }: { tenant: Tenant }) {
  const days = tenant.expiryDate ? differenceInDays(new Date(tenant.expiryDate), new Date()) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">ข้อมูลร้านค้า</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'ชื่อร้าน',   value: tenant.shopName,         icon: Building2 },
              { label: 'เจ้าของ',    value: tenant.ownerName,        icon: Users },
              { label: 'อีเมล',      value: tenant.email,            icon: Mail },
              { label: 'เบอร์โทร',   value: tenant.phone ?? '—',     icon: Phone },
              { label: 'วันที่สมัคร', value: format(new Date(tenant.createdAt), 'd MMM yyyy', { locale: th }), icon: Calendar },
              { label: 'Tenant ID',  value: tenant.id,               icon: Hash, mono: true },
            ].map(({ label, value, icon: Icon, mono }) => (
              <div key={label}>
                <p className="text-slate-500 text-xs mb-0.5">{label}</p>
                <p className={cn('text-slate-200 text-sm', mono && 'font-mono text-xs text-slate-400')}>{value}</p>
              </div>
            ))}
          </div>
        </div>
        {tenant.notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">หมายเหตุ</p>
            <p className="text-slate-300 text-sm leading-relaxed">{tenant.notes}</p>
          </div>
        )}
      </div>
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">สถานะแพ็กเกจ</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">สถานะ</span>
              <TenantStatusBadge status={tenant.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">แพ็กเกจ</span>
              <PlanBadge plan={tenant.plan} />
            </div>
            {tenant.expiryDate && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">หมดอายุ</span>
                  <span className={cn('text-sm font-medium',
                    days !== null && days < 0 ? 'text-red-400' :
                    days !== null && days <= 7 ? 'text-amber-400' : 'text-slate-300',
                  )}>
                    {format(new Date(tenant.expiryDate), 'd MMM yyyy', { locale: th })}
                  </span>
                </div>
                {days !== null && days >= 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">เหลือ</span>
                    <span className={cn('text-sm font-bold',
                      days <= 3 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-emerald-400',
                    )}>
                      {days} วัน
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">ผู้ใช้</span>
              <span className="text-slate-300 text-sm font-medium">{tenant._count?.users ?? 0} คน</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Branches ─────────────────────────────────────────────────────────────

function BranchesTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery<{ data: SuperAdminBranch[]; total: number }>({
    queryKey: ['sa-tenant-branches', tenantId],
    queryFn: () => api.get('/super-admin/branches', { params: { tenantId } }).then((r) => r.data),
  })

  const branches = data?.data ?? []

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-400" />
          <p className="text-white font-semibold text-sm">Branches</p>
        </div>
        <span className="text-slate-500 text-xs">{data?.total ?? 0} สาขา</span>
      </div>
      {branches.length === 0 ? (
        <SuperAdminEmptyState icon={GitBranch} title="ยังไม่มีสาขา" description="ร้านนี้ยังไม่มีสาขาในระบบ" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">สาขา</th>
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">สถานะ</th>
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">Users</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-b border-slate-800/50">
                <td className="py-3.5 px-5">
                  <p className="text-white font-medium">{b.name}</p>
                  {b.address && <p className="text-slate-500 text-xs">{b.address}</p>}
                </td>
                <td className="py-3.5 px-5">
                  <span className={cn('text-xs font-medium',
                    b.isActive && b.status === 'ACTIVE' ? 'text-emerald-400' : 'text-orange-400',
                  )}>
                    {b.isActive && b.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-3.5 px-5">
                  <span className="text-slate-400 text-sm">{b._count.users}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Tab: Users ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  OWNER:       'text-violet-400 bg-violet-500/10',
  MANAGER:     'text-blue-400 bg-blue-500/10',
  CASHIER:     'text-slate-400 bg-slate-500/10',
  TECHNICIAN:  'text-emerald-400 bg-emerald-500/10',
  STOCK_STAFF: 'text-amber-400 bg-amber-500/10',
}

function UsersTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery<{ data: SuperAdminUser[]; total: number }>({
    queryKey: ['sa-tenant-users', tenantId],
    queryFn: () => api.get('/super-admin/users', { params: { tenantId } }).then((r) => r.data),
  })

  const users = data?.data ?? []

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-400" />
          <p className="text-white font-semibold text-sm">Users</p>
        </div>
        <span className="text-slate-500 text-xs">{data?.total ?? 0} users</span>
      </div>
      {users.length === 0 ? (
        <SuperAdminEmptyState icon={Users} title="ยังไม่มีผู้ใช้" description="ร้านนี้ยังไม่มีพนักงานในระบบ" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">ชื่อ / อีเมล</th>
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">Role</th>
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase hidden sm:table-cell">Branch</th>
              <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-800/50">
                <td className="py-3.5 px-5">
                  <p className="text-white font-medium">{u.name}</p>
                  <p className="text-slate-500 text-xs">{u.email}</p>
                </td>
                <td className="py-3.5 px-5">
                  <span className={cn('text-xs font-semibold px-2 py-1 rounded-lg', ROLE_COLORS[u.role] ?? 'text-slate-400 bg-slate-800')}>
                    {u.role}
                  </span>
                </td>
                <td className="py-3.5 px-5 hidden sm:table-cell">
                  <span className="text-slate-400 text-sm">{u.branch?.name ?? '—'}</span>
                </td>
                <td className="py-3.5 px-5">
                  {u.isActive
                    ? <div className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-400 text-xs">Active</span></div>
                    : <div className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-slate-600" /><span className="text-slate-500 text-xs">Inactive</span></div>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Tab: Subscription History ─────────────────────────────────────────────────

function SubscriptionTab({ tenant }: { tenant: Tenant }) {
  const renewals: TenantRenewal[] = tenant.renewals ?? []
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <p className="text-white font-semibold text-sm">ประวัติ Subscription</p>
      </div>
      {renewals.length === 0 ? (
        <SuperAdminEmptyState icon={CreditCard} title="ยังไม่มีประวัติ Subscription" description="ประวัติการเปิด/ต่ออายุจะปรากฏที่นี่" />
      ) : (
        <div className="divide-y divide-slate-800/60">
          {renewals.map((r) => (
            <div key={r.id} className="px-5 py-4 flex items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-sm font-medium">{r.action}</p>
                <p className="text-slate-500 text-xs">{r.note ?? '—'}</p>
              </div>
              <div className="text-right shrink-0">
                <PlanBadge plan={r.plan} />
                <p className="text-slate-500 text-xs mt-1">
                  {format(new Date(r.createdAt), 'd MMM yyyy', { locale: th })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Payments ─────────────────────────────────────────────────────────────

function PaymentsTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery<TenantPayment[]>({
    queryKey: ['sa-tenant-payments', tenantId],
    queryFn: () => api.get('/super-admin/payments', { params: { tenantId } }).then((r) => r.data),
  })

  const payments = data ?? []

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
  }

  const STATUS_STYLE: Record<string, string> = {
    PENDING:  'text-amber-400 bg-amber-500/10',
    VERIFIED: 'text-blue-400 bg-blue-500/10',
    REJECTED: 'text-red-400 bg-red-500/10',
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-violet-400" />
          <p className="text-white font-semibold text-sm">Payment History</p>
        </div>
        <span className="text-slate-500 text-xs">{payments.length} รายการ</span>
      </div>
      {payments.length === 0 ? (
        <SuperAdminEmptyState icon={CreditCard} title="ยังไม่มีการชำระเงิน" description="ประวัติการชำระเงินจะปรากฏที่นี่" />
      ) : (
        <div className="divide-y divide-slate-800/50">
          {payments.map((p) => (
            <div key={p.id} className="px-5 py-4 flex items-start gap-4">
              <span className={cn('text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 mt-0.5',
                STATUS_STYLE[p.status] ?? 'text-slate-400 bg-slate-800',
              )}>
                {p.activatedAt ? 'ACTIVATED' : p.status}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <PlanBadge plan={p.plan} />
                  <span className="text-slate-400 text-xs">{p.duration} วัน</span>
                </div>
                {p.paymentReference && (
                  <p className="text-slate-500 text-xs mt-0.5">Ref: {p.paymentReference}</p>
                )}
                {p.adminNote && (
                  <p className="text-slate-500 text-xs italic">{p.adminNote}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                {p.paymentAmount != null && (
                  <p className="text-slate-300 text-sm font-medium">
                    ฿{Number(p.paymentAmount).toLocaleString()}
                  </p>
                )}
                <p className="text-slate-600 text-xs mt-0.5">
                  {format(new Date(p.createdAt), 'd MMM yyyy', { locale: th })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Activity Logs ────────────────────────────────────────────────────────

const ACTIVITY_STYLE: Record<string, string> = {
  TENANT_CREATED:   'text-emerald-400 bg-emerald-500/10',
  ACTIVATE:         'text-blue-400 bg-blue-500/10',
  RENEW:            'text-violet-400 bg-violet-500/10',
  PAYMENT_ACTIVATE: 'text-violet-400 bg-violet-500/10',
  PAYMENT_VERIFIED: 'text-blue-400 bg-blue-500/10',
  PAYMENT_REJECTED: 'text-red-400 bg-red-500/10',
  PASSWORD_RESET:   'text-amber-400 bg-amber-500/10',
}

function ActivityTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery<{ data: AuditLogEntry[]; total: number }>({
    queryKey: ['sa-tenant-activity', tenantId],
    queryFn: () =>
      api.get('/super-admin/audit-logs', { params: { tenantId, limit: 50 } }).then((r) => r.data),
  })

  const events = data?.data ?? []

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-slate-400" />
          <p className="text-white font-semibold text-sm">Activity Logs</p>
        </div>
        <span className="text-slate-500 text-xs">{data?.total ?? 0} รายการ</span>
      </div>
      {events.length === 0 ? (
        <SuperAdminEmptyState icon={ScrollText} title="ยังไม่มีประวัติ" description="บันทึกการดำเนินการจะปรากฏที่นี่" />
      ) : (
        <div className="divide-y divide-slate-800/50">
          {events.map((e) => (
            <div key={e.id} className="px-5 py-4 flex items-start gap-4">
              <span className={cn(
                'text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 mt-0.5',
                ACTIVITY_STYLE[e.action] ?? 'text-slate-400 bg-slate-800',
              )}>
                {e.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-sm">{e.target}</p>
                {e.note && <p className="text-slate-500 text-xs italic">{e.note}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-slate-500 text-xs">{e.actor}</p>
                <p className="text-slate-600 text-xs mt-0.5">
                  {format(new Date(e.time), 'd MMM yyyy HH:mm', { locale: th })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Settings ─────────────────────────────────────────────────────────────

function TenantSettingsTab({ tenant }: { tenant: Tenant }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">ข้อมูล Tenant</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Tenant ID', value: tenant.id,        mono: true },
          { label: 'Email',     value: tenant.email },
          { label: 'Phone',     value: tenant.phone ?? '—' },
          { label: 'Plan',      value: TENANT_PLAN_LABEL[tenant.plan] },
          { label: 'Status',    value: tenant.status },
          { label: 'Created',   value: format(new Date(tenant.createdAt), 'd MMM yyyy HH:mm', { locale: th }) },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <p className="text-slate-500 text-xs mb-0.5">{label}</p>
            <p className={cn('text-slate-200 text-sm', mono && 'font-mono text-xs text-slate-400 break-all')}>{value}</p>
          </div>
        ))}
      </div>
      {tenant.notes && (
        <div>
          <p className="text-slate-500 text-xs mb-1">Notes</p>
          <p className="text-slate-300 text-sm">{tenant.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Tab: Modules ─────────────────────────────────────────────────────────────

const MODULE_LABEL: Record<string, string> = {
  pos:             'ขายสินค้า (POS)',
  repair:          'งานซ่อม',
  stock:           'คลังสินค้า',
  finance:         'การเงิน',
  crm:             'ลูกค้าสัมพันธ์ (CRM)',
  line_notify:     'แจ้งเตือน LINE',
  report:          'รายงาน',
  user_management: 'จัดการผู้ใช้',
}

function ModulesTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<TenantModuleStatus[]>({
    queryKey: ['sa-tenant-modules', tenantId],
    queryFn: () => api.get(`/super-admin/modules/tenants/${tenantId}`).then((r) => r.data),
  })

  const setOverride = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.put(`/super-admin/modules/tenants/${tenantId}/${key}`, { enabled }),
    onSuccess: () => {
      toast.success('บันทึก override สำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenant-modules', tenantId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const removeOverride = useMutation({
    mutationFn: (key: string) =>
      api.delete(`/super-admin/modules/tenants/${tenantId}/${key}`),
    onSuccess: () => {
      toast.success('ลบ override สำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-tenant-modules', tenantId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
  }

  const modules = data ?? []
  const enabledCount = modules.filter((m) => m.effectiveEnabled).length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-violet-400" />
          <p className="text-white font-semibold text-sm">Module Access</p>
        </div>
        <span className="text-slate-400 text-xs">
          {enabledCount} / {modules.length} เปิดใช้งาน
        </span>
      </div>

      {/* Module list */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="divide-y divide-slate-800/60">
          {modules.map((mod) => {
            const busy = setOverride.isPending || removeOverride.isPending
            return (
              <div key={mod.key} className="flex items-center gap-4 px-5 py-3.5">
                {/* Status indicator */}
                <div className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  mod.effectiveEnabled ? 'bg-emerald-500' : 'bg-slate-700',
                )} />

                {/* Name + source */}
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium">
                    {MODULE_LABEL[mod.key] ?? mod.key}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                      mod.fromPackage ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700 text-slate-400',
                    )}>
                      {mod.fromPackage ? 'Package' : 'ไม่รวมในแพ็กเกจ'}
                    </span>
                    {mod.override !== null && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
                        Override {mod.override ? 'ON' : 'OFF'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {mod.override !== null ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOverride.mutate({ key: mod.key, enabled: !mod.override })}
                        className="text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                        title={mod.override ? 'Override ON → กด OFF' : 'Override OFF → กด ON'}
                      >
                        {mod.override
                          ? <ToggleRight className="h-5 w-5 text-violet-400" />
                          : <ToggleLeft className="h-5 w-5 text-slate-500" />
                        }
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeOverride.mutate(mod.key)}
                        className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                        title="ลบ override (ใช้จากแพ็กเกจ)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOverride.mutate({ key: mod.key, enabled: true })}
                        className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-700/40 hover:border-emerald-600 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        เปิด
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOverride.mutate({ key: mod.key, enabled: false })}
                        className="text-xs text-orange-400 hover:text-orange-300 border border-orange-700/40 hover:border-orange-600 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        ปิด
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-slate-600 text-xs text-center">
        Override จะแทนที่การตั้งค่าจากแพ็กเกจ — ลบ override เพื่อกลับไปใช้แพ็กเกจ
      </p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [planDialog, setPlanDialog] = useState<{ open: boolean; action: 'activate' | 'renew' } | null>(null)
  const [resetResult, setResetResult] = useState<{ tempPassword: string; userName: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: tenant, isLoading, isError } = useQuery<Tenant>({
    queryKey: ['sa-tenant', id],
    queryFn: async () => {
      try {
        return (await api.get(`/super-admin/tenants/${id}`)).data
      } catch {
        const list = await api.get('/super-admin/tenants').then((r) => r.data.data ?? r.data)
        const found = (list as Tenant[]).find((t) => t.id === id)
        if (!found) throw new Error('ไม่พบข้อมูลร้านค้า')
        return found
      }
    },
    retry: false,
  })

  const suspendMutation = useMutation({
    mutationFn: () => api.patch(`/super-admin/tenants/${id}/suspend`),
    onSuccess: () => { toast.success('ระงับร้านสำเร็จ'); qc.invalidateQueries({ queryKey: ['sa-tenant', id] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const reactivateMutation = useMutation({
    mutationFn: () => api.patch(`/super-admin/tenants/${id}/reactivate`),
    onSuccess: () => { toast.success('เปิดใช้งานสำเร็จ'); qc.invalidateQueries({ queryKey: ['sa-tenant', id] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const resetPwMutation = useMutation({
    mutationFn: () => api.post(`/super-admin/tenants/${id}/reset-owner-password`).then((r) => r.data),
    onSuccess: (data) => setResetResult(data),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (isError || !tenant) {
    return (
      <div className="text-center py-20">
        <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 mb-4">ไม่พบข้อมูลร้านค้า</p>
        <Link href="/super-admin/tenants">
          <Button variant="outline" className="border-slate-700 text-slate-300 hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />
            กลับไปรายการ
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/super-admin/tenants">
            <button className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">{tenant.shopName}</h1>
              <TenantStatusBadge status={tenant.status} />
              <PlanBadge plan={tenant.plan} />
            </div>
            <p className="text-slate-400 text-sm mt-0.5">{tenant.ownerName} · {tenant.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tenant.status === 'PENDING' && (
            <Button size="sm" onClick={() => setPlanDialog({ open: true, action: 'activate' })}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Zap className="h-3.5 w-3.5 mr-1.5" />เปิดใช้งาน
            </Button>
          )}
          {(tenant.status === 'ACTIVE' || tenant.status === 'EXPIRED') && (
            <Button size="sm" onClick={() => setPlanDialog({ open: true, action: 'renew' })}
              className="bg-violet-600 hover:bg-violet-700 text-white">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />ต่ออายุ
            </Button>
          )}
          {tenant.status === 'SUSPENDED' ? (
            <Button size="sm" variant="outline" onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
              className="border-emerald-700/50 text-emerald-400 hover:bg-emerald-950">
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />เปิดกลับ
            </Button>
          ) : tenant.status !== 'PENDING' && (
            <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate()}
              disabled={suspendMutation.isPending}
              className="border-orange-700/50 text-orange-400 hover:bg-orange-950">
              <Ban className="h-3.5 w-3.5 mr-1.5" />ระงับ
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => resetPwMutation.mutate()}
            disabled={resetPwMutation.isPending}
            className="text-amber-400 hover:text-amber-300 hover:bg-amber-950/30">
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />Reset Password
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === tabId
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview'     && <OverviewTab tenant={tenant} />}
      {tab === 'branches'     && <BranchesTab tenantId={tenant.id} />}
      {tab === 'users'        && <UsersTab tenantId={tenant.id} />}
      {tab === 'subscription' && <SubscriptionTab tenant={tenant} />}
      {tab === 'payments'     && <PaymentsTab tenantId={tenant.id} />}
      {tab === 'activity'     && <ActivityTab tenantId={tenant.id} />}
      {tab === 'modules'      && <ModulesTab tenantId={tenant.id} />}
      {tab === 'settings'     && <TenantSettingsTab tenant={tenant} />}

      {/* Plan dialog */}
      {planDialog && (
        <PlanDialog
          open={planDialog.open}
          onClose={() => setPlanDialog(null)}
          tenant={tenant}
          action={planDialog.action}
        />
      )}

      {/* Reset password result */}
      <Dialog open={!!resetResult} onOpenChange={() => setResetResult(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>รหัสผ่านชั่วคราว</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-amber-950/30 border border-amber-700/50 p-4">
              <p className="text-amber-400 text-sm font-medium mb-1">แสดงเพียงครั้งเดียว</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 font-mono font-bold text-amber-300 text-base tracking-wider">
                  {resetResult?.tempPassword}
                </code>
                <Button size="sm" variant="outline" className="shrink-0 border-slate-700 text-slate-300"
                  onClick={() => {
                    navigator.clipboard.writeText(resetResult?.tempPassword ?? '')
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}>
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-slate-500 text-xs">เจ้าของร้านจะถูกบังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetResult(null)} className="w-full bg-violet-600 hover:bg-violet-700">รับทราบแล้ว</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
