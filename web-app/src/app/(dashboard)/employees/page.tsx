'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Users, Plus, Pencil, KeyRound, ToggleLeft, ToggleRight, Loader2,
  Clock, Mail, Phone, Copy, Check, Building2, Wand2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import {
  User, AppRole, Branch,
  ROLE_LABEL, ROLE_DESCRIPTION, ROLES_REQUIRING_BRANCH, ROLE_PRESET_PERMISSIONS,
} from '@/types'
import { useAuthStore } from '@/store/auth.store'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

const ROLES: AppRole[] = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF']

const ROLE_COLOR: Record<AppRole, string> = {
  SUPER_ADMIN: 'bg-violet-100 text-violet-700 border-violet-200',
  OWNER:       'bg-purple-100 text-purple-700 border-purple-200',
  MANAGER:     'bg-blue-100 text-blue-700 border-blue-200',
  CASHIER:     'bg-green-100 text-green-700 border-green-200',
  TECHNICIAN:  'bg-orange-100 text-orange-700 border-orange-200',
  STOCK_STAFF: 'bg-slate-100 text-slate-700 border-slate-200',
}

// ── Shared branch selector ─────────────────────────────────────────────────────

function BranchField({
  value, onChange, required, error,
  branches, isLoading,
}: {
  value: string; onChange: (v: string) => void
  required: boolean; error?: string
  branches: Branch[]; isLoading: boolean
}) {
  return (
    <div className="col-span-2 space-y-1.5">
      <Label>
        สาขาที่ประจำ
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Select value={value || ''} onValueChange={onChange} disabled={isLoading}>
        <SelectTrigger className={error ? 'border-red-400' : ''}>
          <SelectValue placeholder={isLoading ? 'กำลังโหลด...' : 'เลือกสาขา'} />
        </SelectTrigger>
        <SelectContent>
          {!required && (
            <SelectItem value="__none__">— ไม่ระบุสาขา —</SelectItem>
          )}
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}{!b.isActive ? ' (ปิด)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Permission preset panel ────────────────────────────────────────────────────

interface RolePermRow { role: string; permissions: string[] }

function PermissionPresetPanel({
  role, isOwner,
}: { role: AppRole; isOwner: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: rolePerms = [] } = useQuery<RolePermRow[]>({
    queryKey: ['role-permissions'],
    queryFn: async () => (await api.get('/permissions/roles')).data,
    staleTime: 60_000,
    enabled: open,
  })

  const currentPerms = rolePerms.find((r) => r.role === role)?.permissions ?? []
  const presetPerms  = ROLE_PRESET_PERMISSIONS[role] ?? []

  const applyMutation = useMutation({
    mutationFn: () => api.post(`/permissions/roles/${role}/apply-preset`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
      toast.success(`ใช้สิทธิ์มาตรฐานสำหรับ ${ROLE_LABEL[role]} แล้ว`)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  if (role === 'OWNER') return null

  return (
    <div className="col-span-2 rounded-lg border border-dashed border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <span className="font-medium">สิทธิ์ของตำแหน่ง {ROLE_LABEL[role]}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-200">
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
            <span>สิทธิ์ปัจจุบัน: <strong className="text-slate-700">{currentPerms.length} รายการ</strong></span>
            <span>มาตรฐาน: <strong className="text-slate-700">{presetPerms.length} รายการ</strong></span>
          </div>

          {presetPerms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {presetPerms.slice(0, 8).map((p) => (
                <span key={p} className="text-[10px] bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded px-1.5 py-0.5 text-slate-600">
                  {p}
                </span>
              ))}
              {presetPerms.length > 8 && (
                <span className="text-[10px] text-slate-400">+{presetPerms.length - 8} อื่นๆ</span>
              )}
            </div>
          )}

          {isOwner && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Wand2 className="h-3 w-3" />
              }
              ใช้สิทธิ์มาตรฐาน (ทับค่าเดิม)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Create Dialog ────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:     z.string().min(1, 'กรุณากรอกชื่อ'),
  email:    z.string().email('อีเมลไม่ถูกต้อง'),
  phone:    z.string().optional(),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัว'),
  role:     z.enum(['OWNER','MANAGER','CASHIER','TECHNICIAN','STOCK_STAFF']),
  branchId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (ROLES_REQUIRING_BRANCH.includes(data.role as AppRole) && !data.branchId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ตำแหน่งนี้ต้องระบุสาขาที่ประจำ',
      path: ['branchId'],
    })
  }
})
type CreateForm = z.infer<typeof createSchema>

function CreateDialog({
  open, onOpenChange, branches, branchesLoading,
}: {
  open: boolean; onOpenChange: (v: boolean) => void
  branches: Branch[]; branchesLoading: boolean
}) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'CASHIER' },
  })
  const role     = watch('role')
  const branchId = watch('branchId')
  const needsBranch = ROLES_REQUIRING_BRANCH.includes(role as AppRole)

  const mutation = useMutation({
    mutationFn: (data: CreateForm) => api.post('/users', {
      ...data,
      branchId: data.branchId === '__none__' ? undefined : data.branchId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('เพิ่มพนักงานแล้ว')
      reset()
      onOpenChange(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>เพิ่มพนักงานใหม่</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
              <Input placeholder="ชื่อพนักงาน" {...register('name')} className={errors.name ? 'border-red-400' : ''} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>อีเมล <span className="text-red-500">*</span></Label>
              <Input type="email" placeholder="email@example.com" {...register('email')} className={errors.email ? 'border-red-400' : ''} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input placeholder="0812345678" {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label>ตำแหน่ง <span className="text-red-500">*</span></Label>
              <Select value={role} onValueChange={(v) => { setValue('role', v as CreateForm['role']); setValue('branchId', undefined) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      <div>
                        <span>{ROLE_LABEL[r]}</span>
                        {ROLE_DESCRIPTION[r] && (
                          <span className="ml-2 text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>รหัสผ่าน <span className="text-red-500">*</span></Label>
              <Input type="password" placeholder="อย่างน้อย 6 ตัวอักษร" {...register('password')} className={errors.password ? 'border-red-400' : ''} />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            {(needsBranch || role === 'OWNER') && role !== 'OWNER' && (
              <BranchField
                value={branchId ?? ''}
                onChange={(v) => setValue('branchId', v)}
                required={needsBranch}
                error={errors.branchId?.message}
                branches={branches}
                isLoading={branchesLoading}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>ยกเลิก</Button>
            <Button type="submit" disabled={mutation.isPending} className="min-w-[100px]">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'เพิ่มพนักงาน'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

const editSchema = z.object({
  name:     z.string().min(1, 'กรุณากรอกชื่อ'),
  email:    z.string().email('อีเมลไม่ถูกต้อง'),
  phone:    z.string().optional(),
  role:     z.enum(['OWNER','MANAGER','CASHIER','TECHNICIAN','STOCK_STAFF']),
  branchId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (ROLES_REQUIRING_BRANCH.includes(data.role as AppRole) && !data.branchId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ตำแหน่งนี้ต้องระบุสาขาที่ประจำ',
      path: ['branchId'],
    })
  }
})
type EditForm = z.infer<typeof editSchema>

function EditDialog({
  user, open, onOpenChange, branches, branchesLoading, currentUserRole,
}: {
  user: User; open: boolean; onOpenChange: (v: boolean) => void
  branches: Branch[]; branchesLoading: boolean
  currentUserRole: AppRole
}) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isMe = currentUser?.id === user.id
  const isOwnerViewer = currentUserRole === 'OWNER'

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    values: {
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role as EditForm['role'],
      branchId: user.branchId ?? undefined,
    },
  })
  const role     = watch('role')
  const branchId = watch('branchId')
  const needsBranch = ROLES_REQUIRING_BRANCH.includes(role as AppRole)

  const mutation = useMutation({
    mutationFn: (data: EditForm) => api.put(`/users/${user.id}`, {
      ...data,
      branchId: data.branchId === '__none__' ? null : (data.branchId ?? null),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('บันทึกข้อมูลแล้ว')
      onOpenChange(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>แก้ไขข้อมูลพนักงาน</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
              <Input {...register('name')} className={errors.name ? 'border-red-400' : ''} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>อีเมล <span className="text-red-500">*</span></Label>
              <Input type="email" {...register('email')} className={errors.email ? 'border-red-400' : ''} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label>ตำแหน่ง <span className="text-red-500">*</span></Label>
              <Select
                value={role}
                onValueChange={(v) => { setValue('role', v as EditForm['role']); if (v === 'OWNER') setValue('branchId', undefined) }}
                disabled={isMe}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              {isMe && <p className="text-xs text-muted-foreground">ไม่สามารถเปลี่ยนตำแหน่งตัวเองได้</p>}
            </div>

            {role !== 'OWNER' && (
              <BranchField
                value={branchId ?? ''}
                onChange={(v) => setValue('branchId', v === '__none__' ? undefined : v)}
                required={needsBranch}
                error={errors.branchId?.message}
                branches={branches}
                isLoading={branchesLoading}
              />
            )}

            <PermissionPresetPanel role={role as AppRole} isOwner={isOwnerViewer} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>ยกเลิก</Button>
            <Button type="submit" disabled={mutation.isPending} className="min-w-[80px]">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Reset Password Dialog ─────────────────────────────────────────────────────

function ResetPasswordDialog({
  user, open, onOpenChange,
}: { user: User; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/reset-password`),
    onSuccess: (res) => setTempPassword(res.data.tempPassword),
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  const handleClose = () => {
    setTempPassword(null)
    setCopied(false)
    onOpenChange(false)
  }

  const handleCopy = () => {
    if (!tempPassword) return
    navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>รีเซ็ตรหัสผ่าน — {user.name}</DialogTitle>
        </DialogHeader>
        {tempPassword ? (
          <div className="space-y-4 pt-1">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800">รหัสผ่านชั่วคราว (แสดงเพียงครั้งเดียว)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white dark:bg-[#1E293B] border border-amber-300 dark:border-amber-700/60 text-slate-900 dark:text-white px-3 py-2 text-base font-mono font-bold text-amber-900 tracking-wider">
                  {tempPassword}
                </code>
                <Button size="sm" variant="outline" className="shrink-0 h-9 border-amber-300" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              แจ้งรหัสผ่านนี้ให้พนักงาน — พวกเขาจะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
            </p>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full">รับทราบแล้ว</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              ระบบจะสร้างรหัสผ่านชั่วคราวให้อัตโนมัติ และพนักงานจะต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>ยกเลิก</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="min-w-[100px] bg-amber-500 hover:bg-amber-600">
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'สร้างรหัสผ่านใหม่'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!currentUser) return
    if (currentUser.role === 'SUPER_ADMIN') {
      router.replace('/super-admin/tenants')
    } else if (currentUser.role !== 'OWNER') {
      router.replace('/403')
    }
  }, [currentUser, router])

  const [createOpen, setCreateOpen]   = useState(false)
  const [editTarget, setEditTarget]   = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)

  const { data: rawUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
    staleTime: 30_000,
    enabled: currentUser?.role !== 'SUPER_ADMIN',
  })
  const users = rawUsers.filter((u) => u.role !== 'SUPER_ADMIN')

  const { data: branches = [], isLoading: branchesLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => (await api.get('/branches')).data,
    staleTime: 60_000,
    enabled: currentUser?.role !== 'SUPER_ADMIN',
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/toggle`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      const u = users.find((x) => x.id === id)
      toast.success(u?.isActive ? 'ปิดการใช้งานแล้ว' : 'เปิดการใช้งานแล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  const activeCount   = users.filter((u) => u.isActive).length
  const inactiveCount = users.length - activeCount

  return (
    <div className="space-y-5">
      <PageHeader
        title="จัดการพนักงาน"
        icon={Users}
        subtitle={`ทั้งหมด ${users.length} คน · ใช้งาน ${activeCount} · ปิด ${inactiveCount}`}
        primaryAction={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่มพนักงาน</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        }
      />

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-slate-400">
          <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <span className="text-sm">กำลังโหลด...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60">
          <EmptyState preset="default" title="ยังไม่มีพนักงาน" description="เพิ่มพนักงานเพื่อเริ่มต้นใช้งานระบบ" icon={Users} />
        </div>
      ) : (
        <div className="grid gap-3">
          {users.map((user) => {
            const isMe    = user.id === currentUser?.id
            const isOwner = user.role === 'OWNER'
            const needsBranch = ROLES_REQUIRING_BRANCH.includes(user.role)
            const missingBranch = needsBranch && !user.branchId
            return (
              <div
                key={user.id}
                className={cn(
                  'bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 flex items-center gap-4 transition-all',
                  !user.isActive && 'opacity-60',
                  missingBranch && 'border-amber-200',
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold shrink-0',
                  user.isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500 dark:text-slate-400',
                )}>
                  {user.name.slice(0, 1).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                    {isMe && <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">ฉัน</span>}
                    <span className={cn('text-xs border rounded-full px-2 py-0.5 font-medium', ROLE_COLOR[user.role])}>
                      {ROLE_LABEL[user.role]}
                    </span>
                    {!user.isActive && <Badge variant="secondary" className="text-xs">ปิดการใช้งาน</Badge>}
                  </div>
                  <div className="flex items-center gap-x-4 gap-y-1 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />{user.email}
                    </span>
                    {user.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />{user.phone}
                      </span>
                    )}
                    {/* Branch badge */}
                    {user.branch ? (
                      <span className="flex items-center gap-1 text-xs text-teal-600">
                        <Building2 className="h-3 w-3" />{user.branch.name}
                      </span>
                    ) : missingBranch ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <Building2 className="h-3 w-3" />ยังไม่ได้กำหนดสาขา
                      </span>
                    ) : null}
                    {user.lastLoginAt ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(user.lastLoginAt), 'd MMM yy HH:mm', { locale: th })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">ยังไม่เคย login</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditTarget(user)}
                    className="rounded-lg p-2 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="แก้ไข"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setResetTarget(user)}
                    className="rounded-lg p-2 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    title="รีเซ็ตรหัสผ่าน"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  {!isMe && !isOwner && (
                    <button
                      onClick={() => toggleMutation.mutate(user.id)}
                      disabled={toggleMutation.isPending}
                      className={cn(
                        'rounded-lg p-2 transition-colors',
                        user.isActive
                          ? 'text-muted-foreground hover:text-red-500 hover:bg-red-50'
                          : 'text-muted-foreground hover:text-green-600 hover:bg-green-50',
                      )}
                      title={user.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                    >
                      {user.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branches={branches}
        branchesLoading={branchesLoading}
      />
      {editTarget && (
        <EditDialog
          user={editTarget}
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null) }}
          branches={branches}
          branchesLoading={branchesLoading}
          currentUserRole={(currentUser?.role ?? 'CASHIER') as AppRole}
        />
      )}
      {resetTarget && (
        <ResetPasswordDialog
          user={resetTarget}
          open={!!resetTarget}
          onOpenChange={(v) => { if (!v) setResetTarget(null) }}
        />
      )}
    </div>
  )
}
