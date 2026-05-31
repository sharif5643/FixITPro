'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { SubscriptionBanner } from '@/components/layout/subscription-banner'
import { CapacitorBridge } from '@/components/apk/capacitor-bridge'
import { useAuthStore } from '@/store/auth.store'
import { Platform } from '@/lib/platform'
import { OperationalAlertCenter } from '@/components/alerts/operational-alert-center'
import { ReminderPopup } from '@/components/alerts/reminder-popup'

function LoadingScreen({ message = 'กำลังโหลด...' }: { message?: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  // _hasHydrated becomes true only after zustand finishes reading from localStorage.
  // This prevents false redirects caused by reading null before rehydration completes.
  const hasHydrated = useAuthStore((state) => state._hasHydrated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    if (!hasHydrated) return
    if (!accessToken) {
      router.replace('/login')
      return
    }
    if (Platform.isSunmiShell()) {
      router.replace('/sunmi')
      return
    }
    if (user?.forcePasswordChange && pathname !== '/change-password') {
      router.replace('/change-password')
    }
  }, [hasHydrated, accessToken, user, pathname, router])

  // Close mobile drawer whenever route changes
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // Waiting for zustand to read localStorage — render nothing meaningful yet
  if (!hasHydrated) {
    return <LoadingScreen />
  }

  // Hydrated but no token — useEffect above is already redirecting
  if (!accessToken) {
    return <LoadingScreen message="กำลังนำคุณไปยังหน้าเข้าสู่ระบบ..." />
  }

  // Force password change required — block dashboard until changed
  if (user?.forcePasswordChange) {
    return <LoadingScreen message="กำลังนำคุณไปยังหน้าเปลี่ยนรหัสผ่าน..." />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
      <CapacitorBridge />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <SubscriptionBanner />
        <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
      <OperationalAlertCenter variant="desktop" />
      <ReminderPopup variant="desktop" />
    </div>
  )
}
