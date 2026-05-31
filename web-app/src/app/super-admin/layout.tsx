'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Smartphone, LogOut, Building2, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/super-admin/tenants',       label: 'จัดการร้านค้า',       icon: Building2  },
  { href: '/super-admin/subscriptions', label: 'ตรวจสอบการชำระเงิน', icon: CreditCard },
]

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        <p className="text-sm text-slate-400">กำลังโหลด...</p>
      </div>
    </div>
  )
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const hasHydrated = useAuthStore((state) => state._hasHydrated)
  const { user, accessToken, clearAuth } = useAuthStore()

  useEffect(() => {
    if (!hasHydrated) return
    console.log('[SuperAdminLayout] hydrated — token:', accessToken ? 'present' : 'missing', '| role:', user?.role ?? 'none')
    if (!accessToken || !user) {
      console.log('[SuperAdminLayout] No auth → /login')
      router.replace('/login')
      return
    }
    if (user.role !== 'SUPER_ADMIN') {
      console.log('[SuperAdminLayout] Role not SUPER_ADMIN (got:', user.role, ') → /')
      router.replace('/')
    }
  }, [hasHydrated, accessToken, user, router])

  // Wait for localStorage rehydration before making any auth decision
  if (!hasHydrated) return <LoadingScreen />

  // Not authenticated — useEffect is redirecting
  if (!accessToken || !user) return <LoadingScreen />

  // Wrong role — useEffect is redirecting
  if (user.role !== 'SUPER_ADMIN') return <LoadingScreen />

  const handleLogout = () => {
    clearAuth()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-900 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 shrink-0">
            <Smartphone className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-sm">FixITPro</span>
            <span className="ml-2 text-xs bg-violet-600 text-white px-1.5 py-0.5 rounded font-medium">
              Super Admin
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'text-slate-400 hover:text-white hover:bg-slate-800',
                    active && 'bg-slate-800 text-white',
                  )}
                >
                  <Icon className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-slate-400 text-xs hidden sm:inline">{user.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  )
}
