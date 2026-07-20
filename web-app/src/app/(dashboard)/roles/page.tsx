'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldCheck, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import api from '@/lib/api'
import { AppRole, ROLE_LABEL, Permission, PERMISSION_LABEL, PERMISSION_GROUPS } from '@/types'
import { useAuthStore } from '@/store/auth.store'

interface RolePerms {
  role: AppRole
  permissions: string[]
  isOwner: boolean
}

const ROLE_COLOR: Record<AppRole, string> = {
  SUPER_ADMIN: 'border-violet-200 bg-violet-50',
  OWNER:       'border-purple-200 bg-purple-50',
  MANAGER:     'border-blue-200 bg-blue-50',
  CASHIER:     'border-green-200 bg-green-50',
  TECHNICIAN:  'border-orange-200 bg-orange-50',
  STOCK_STAFF: 'border-slate-200 bg-slate-50',
}

const ROLE_BADGE: Record<AppRole, string> = {
  SUPER_ADMIN: 'bg-violet-100 text-violet-700',
  OWNER:       'bg-purple-100 text-purple-700',
  MANAGER:     'bg-blue-100 text-blue-700',
  CASHIER:     'bg-green-100 text-green-700',
  TECHNICIAN:  'bg-orange-100 text-orange-700',
  STOCK_STAFF: 'bg-slate-100 text-slate-600',
}

function ToggleSwitch({
  checked, onChange, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none',
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0',
      )} />
    </button>
  )
}

function RoleCard({ rolePerms }: { rolePerms: RolePerms }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)

  const toggleMutation = useMutation({
    mutationFn: ({ permission, enabled }: { permission: string; enabled: boolean }) =>
      api.put(`/permissions/roles/${rolePerms.role}/toggle`, { permission, enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
    onSettled: () => setPending(null),
  })

  function handleToggle(permission: string, enabled: boolean) {
    setPending(permission)
    toggleMutation.mutate({ permission, enabled })
  }

  const has = (p: string) => rolePerms.permissions.includes(p)

  return (
    <div className={cn('rounded-xl border-2 overflow-hidden', ROLE_COLOR[rolePerms.role])}>
      {/* Role header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-current/10">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-bold px-2.5 py-1 rounded-full', ROLE_BADGE[rolePerms.role])}>
            {ROLE_LABEL[rolePerms.role]}
          </span>
          {rolePerms.isOwner && (
            <span className="flex items-center gap-1 text-xs text-purple-600 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />มีทุกสิทธิ์เสมอ
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {rolePerms.isOwner ? 'ทั้งหมด' : `${rolePerms.permissions.length} สิทธิ์`}
        </span>
      </div>

      {/* Permission groups */}
      <div className="p-4 space-y-4 bg-white">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.perms.map((perm) => (
                <div key={perm} className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {PERMISSION_LABEL[perm as Permission]}
                  </span>
                  <ToggleSwitch
                    checked={has(perm)}
                    disabled={rolePerms.isOwner || pending === perm}
                    onChange={(v) => handleToggle(perm, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RolesPage() {
  const router = useRouter()
  const currentUser = useAuthStore((s) => s.user)

  useEffect(() => {
    if (currentUser?.role === 'SUPER_ADMIN') {
      router.replace('/super-admin/tenants')
    }
  }, [currentUser, router])

  const { data: rolePerms = [], isLoading } = useQuery<RolePerms[]>({
    queryKey: ['role-permissions'],
    queryFn: async () => (await api.get('/permissions/roles')).data,
    staleTime: 10_000,
    enabled: currentUser?.role !== 'SUPER_ADMIN',
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="จัดการสิทธิ์"
        icon={ShieldCheck}
        subtitle="กำหนดสิทธิ์การใช้งานในแต่ละตำแหน่ง"
      />

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg border bg-blue-50 border-blue-200 p-3 text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          <span className="font-semibold">OWNER</span> มีสิทธิ์ทุกอย่างโดยอัตโนมัติและไม่สามารถเปลี่ยนแปลงได้
          การเปลี่ยนสิทธิ์มีผลกับ API ทันที — UI ของผู้ใช้จะอัปเดตอัตโนมัติเมื่อกลับมาใช้งานหน้าต่าง หรือเมื่อถูกปฏิเสธสิทธิ์ครั้งแรก
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> <span>กำลังโหลด...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {rolePerms.map((rp) => (
            <RoleCard key={rp.role} rolePerms={rp} />
          ))}
        </div>
      )}
    </div>
  )
}
