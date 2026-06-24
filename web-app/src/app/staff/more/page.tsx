'use client'

import { useRouter } from 'next/navigation'
import {
  ChevronRight, Settings, Users, Building2, BarChart3,
  Bell, Shield, HelpCircle, LogOut, Wrench,
  UserCircle, CreditCard, History,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { toast } from 'sonner'

interface MenuItem {
  icon:    React.ReactNode
  label:   string
  sub?:    string
  to?:     string
  action?: () => void
  danger?: boolean
}

export default function MorePage() {
  const router   = useRouter()
  const user     = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  async function logout() {
    await api.post('/auth/logout').catch(() => {})
    clearAuth()
    router.replace('/staff/login')
  }

  const isOwner    = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const isManager  = user?.role === 'MANAGER' || isOwner

  const ACCOUNT_ITEMS: MenuItem[] = [
    { icon: <UserCircle className="h-5 w-5 text-brand-info" />,     label: 'ข้อมูลส่วนตัว',  to: '/staff/profile' },
    { icon: <History className="h-5 w-5 text-brand-warning" />,     label: 'ประวัติงาน',      to: '/staff/repairs' },
    { icon: <CreditCard className="h-5 w-5 text-brand-success" />,  label: 'การชำระเงิน',     to: '/staff/pos' },
  ]

  const MANAGEMENT_ITEMS: MenuItem[] = [
    { icon: <Users className="h-5 w-5 text-purple-500" />,   label: 'ลูกค้า',       to: '/staff/customers' },
    { icon: <BarChart3 className="h-5 w-5 text-brand-info" />, label: 'รายงาน',     to: '/staff/reports' },
    { icon: <Bell className="h-5 w-5 text-brand-warning" />, label: 'การแจ้งเตือน', to: '/staff/notifications' },
  ]

  const ADMIN_ITEMS: MenuItem[] = [
    ...(isOwner ? [{ icon: <Building2 className="h-5 w-5 text-brand-yellow" />, label: 'จัดการสาขา', to: '/branches' }] : []),
    ...(isManager ? [{ icon: <Users className="h-5 w-5 text-slate-500" />, label: 'พนักงาน', to: '/employees' }] : []),
    { icon: <Shield className="h-5 w-5 text-brand-success" />,   label: 'ความปลอดภัย',    to: '/staff/profile' },
    { icon: <Settings className="h-5 w-5 text-slate-500" />,     label: 'การตั้งค่า',     to: '/settings' },
    { icon: <HelpCircle className="h-5 w-5 text-brand-info" />,  label: 'ช่วยเหลือ',      to: '/help' },
  ]

  function Section({ title, items }: { title: string; items: MenuItem[] }) {
    return (
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
        <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden">
          {items.map((item, i) => (
            <button
              key={item.label}
              onClick={item.action ?? (() => item.to && router.push(item.to))}
              className={`flex w-full items-center gap-3 px-4 py-3.5 active:bg-slate-50 ${
                i > 0 ? 'border-t border-slate-50' : ''
              } ${item.danger ? 'text-brand-danger' : ''}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-light">
                {item.icon}
              </div>
              <div className="flex-1 text-left">
                <p className={`text-sm font-medium ${item.danger ? 'text-brand-danger' : 'text-brand-black'}`}>
                  {item.label}
                </p>
                {item.sub && <p className="text-xs text-slate-400">{item.sub}</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-5 pt-14 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow text-lg font-bold text-brand-black">
            {initials}
          </div>
          <div>
            <p className="font-bold text-brand-black">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <span className="mt-1 inline-block rounded-full bg-brand-yellow/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-yellow-dark">
              {user?.role === 'OWNER' ? 'เจ้าของร้าน' :
               user?.role === 'MANAGER' ? 'ผู้จัดการ' :
               user?.role === 'TECHNICIAN' ? 'ช่าง' : 'พนักงาน'}
            </span>
          </div>
          <button
            onClick={() => router.push('/staff/profile')}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light"
          >
            <Settings className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <Section title="บัญชีของฉัน"  items={ACCOUNT_ITEMS}    />
        <Section title="จัดการข้อมูล" items={MANAGEMENT_ITEMS} />
        <Section title="ระบบ"         items={ADMIN_ITEMS}       />

        {/* Logout */}
        <button
          onClick={logout}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[20px] border-2 border-brand-danger/20 bg-white text-sm font-semibold text-brand-danger active:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          ออกจากระบบ
        </button>

        <p className="text-center text-xs text-slate-300 pb-2">FixITPro v2.0.0</p>
      </div>
    </div>
  )
}
