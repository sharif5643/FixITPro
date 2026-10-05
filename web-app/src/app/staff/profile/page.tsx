'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, MapPin, History, CreditCard, Settings, ChevronRight,
  LogOut, Loader2, Wrench
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { toast } from 'sonner'

const MENU_ITEMS = [
  { icon: User,        label: 'ข้อมูลส่วนตัว',  href: '/staff/profile/edit'    },
  { icon: MapPin,      label: 'ที่อยู่ของฉัน',    href: '/staff/profile/address'  },
  { icon: History,     label: 'ประวัติงาน',        href: '/staff/repairs'          },
  { icon: CreditCard,  label: 'การชำระเงิน',       href: '/staff/profile/payment'  },
  { icon: Settings,    label: 'ตั้งค่า',           href: '/staff/profile/settings' },
]

const ROLE_LABEL: Record<string, string> = {
  OWNER:    'เจ้าของร้าน',
  MANAGER:  'ผู้จัดการ',
  STAFF:    'พนักงาน',
  TECHNICIAN: 'ช่าง',
}

export default function StaffProfilePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [loggingOut, setLoggingOut] = useState(false)

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
    } catch { /* best-effort */ }
    clearAuth()
    router.replace('/staff/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-6 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <h1 className="text-xl font-bold text-brand-black mb-5">โปรไฟล์</h1>

        {/* User card */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow shadow-md">
            <span className="text-xl font-extrabold text-brand-black">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-brand-black truncate">{user?.name || '—'}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email || '—'}</p>
            <span className="mt-1 inline-block rounded-full bg-brand-yellow/20 px-2.5 py-0.5 text-[10px] font-semibold text-brand-black">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role ?? '—'}
            </span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <Wrench className="h-5 w-5 text-slate-500" />
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="px-5 py-4">
        <div className="rounded-2xl bg-white shadow-card overflow-hidden">
          {MENU_ITEMS.map((item, idx) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className={`flex w-full items-center gap-3 px-4 py-4 text-left active:bg-slate-50 ${
                  idx < MENU_ITEMS.length - 1 ? 'border-b border-slate-50' : ''
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow/15">
                  <Icon className="h-4.5 w-4.5 text-brand-black" strokeWidth={1.8} />
                </div>
                <span className="flex-1 text-sm font-medium text-brand-black">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            )
          })}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-4 text-sm font-semibold text-red-500 active:bg-red-100 disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          ออกจากระบบ
        </button>

        {/* App version */}
        <p className="text-center text-xs text-slate-300 mt-6">FixITPro v1.2.0 (Staff)</p>
      </div>
    </div>
  )
}
