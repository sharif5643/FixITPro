'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { SideNav, TopBar, BottomTabBar } from '@/components/shell'
import { SubscriptionBanner } from '@/components/layout/subscription-banner'
import { CapacitorBridge } from '@/components/apk/capacitor-bridge'
import { useAuthStore } from '@/store/auth.store'
import { Platform } from '@/lib/platform'
import { getTenantExpiryState } from '@/lib/tenant-expiry'
import { OperationalAlertCenter } from '@/components/alerts/operational-alert-center'
import { ReminderPopup } from '@/components/alerts/reminder-popup'
import api from '@/lib/api'

const AUTH_TIMEOUT_MS = 10_000

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

function AuthErrorScreen({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <p className="text-sm text-slate-500">ไม่สามารถตรวจสอบสถานะล็อกอินได้</p>
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ลองใหม่
          </button>
          <button
            onClick={onBack}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            กลับไปเข้าสู่ระบบ
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  // _hasHydrated becomes true only after zustand finishes reading from localStorage.
  const hasHydrated = useAuthStore((state) => state._hasHydrated)
  const user = useAuthStore((state) => state.user)
  const setAuth = useAuthStore((state) => state.setAuth)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isOwnerOrManager = user?.role === 'OWNER' || user?.role === 'MANAGER'
  // 'pending' while /auth/me is in-flight; 'done' when resolved; 'error' on timeout/failure
  const [meStatus, setMeStatus] = useState<'pending' | 'done' | 'error'>('pending')
  // Incrementing this triggers a fresh auth check (used by the retry button)
  const [retryKey, setRetryKey] = useState(0)

  // Session recovery: if localStorage is empty after hydration but a valid cookie
  // exists, call /auth/me to rebuild the store so we never enter a redirect loop.
  // AbortController ensures React StrictMode's double-invoke doesn't leave an
  // orphaned timeout: cleanup cancels both the in-flight request and the timer.
  useEffect(() => {
    if (!hasHydrated) return
    if (user) {
      setMeStatus('done')
      return
    }

    const controller = new AbortController()

    const timeout = setTimeout(() => {
      controller.abort()
      setMeStatus('error')
    }, AUTH_TIMEOUT_MS)

    api.get('/auth/me', { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout)
        const { permissions = [], enabledModules = [], ...userData } = res.data
        if (userData?.id) {
          setAuth(userData, permissions, enabledModules)
        }
        setMeStatus('done')
      })
      .catch(async (err) => {
        clearTimeout(timeout)
        // Ignore cancellation — either cleanup fired or the timeout already set 'error'
        if (err?.code === 'ERR_CANCELED') return
        const status = err?.response?.status
        // 401/403 = no valid session.
        // Must clear the HttpOnly cookie server-side BEFORE navigating to /login,
        // otherwise the Next.js middleware sees the stale cookie and redirects
        // /login → /dashboard, creating an infinite loading loop.
        if (status === 401 || status === 403) {
          useAuthStore.getState().clearAuth()
          try { await api.post('/auth/logout') } catch { /* best-effort */ }
          window.location.href = '/login'
        } else {
          setMeStatus('error')
        }
      })

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, user, retryKey])

  useEffect(() => {
    if (!hasHydrated) return
    if (meStatus !== 'done') return
    if (!user) return

    if (Platform.isSunmiShell()) {
      router.replace('/sunmi')
      return
    }
    // SUPER_ADMIN must use /super-admin — owner portal is for OWNER/STAFF only
    if (user.role === 'SUPER_ADMIN') {
      router.replace('/super-admin')
      return
    }
    if (user.forcePasswordChange && pathname !== '/change-password') {
      router.replace('/change-password')
      return
    }
    if (user.role !== 'SUPER_ADMIN' && user.tenantExpiryDate) {
      const { state } = getTenantExpiryState(user.tenantExpiryDate)
      if (state === 'expired') {
        router.replace('/billing')
      }
    }
  }, [hasHydrated, meStatus, user, pathname, router])

  // Close mobile drawer whenever route changes
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // Custom event from executive mobile dashboard hamburger button
  useEffect(() => {
    const handler = () => setSidebarOpen((o) => !o)
    window.addEventListener('toggle-sidebar', handler)
    return () => window.removeEventListener('toggle-sidebar', handler)
  }, [])

  // Waiting for zustand to read localStorage
  if (!hasHydrated) {
    return <LoadingScreen />
  }

  // Auth check in progress (/auth/me in-flight or user just arrived from hydration)
  if (meStatus === 'pending') {
    return <LoadingScreen message="กำลังตรวจสอบสถานะล็อกอิน..." />
  }

  // Timeout or unexpected error — show escape hatch instead of infinite spinner
  if (meStatus === 'error') {
    return (
      <AuthErrorScreen
        onRetry={() => { setMeStatus('pending'); setRetryKey((k) => k + 1) }}
        onBack={() => router.replace('/login')}
      />
    )
  }

  // Fully authenticated checks after /auth/me resolved
  if (!user) {
    // useEffect above already navigating to /login
    return <LoadingScreen message="กำลังนำคุณไปยังหน้าเข้าสู่ระบบ..." />
  }

  if (user.forcePasswordChange) {
    return <LoadingScreen message="กำลังนำคุณไปยังหน้าเปลี่ยนรหัสผ่าน..." />
  }

  if (user.role === 'SUPER_ADMIN') {
    return <LoadingScreen message="กำลังนำคุณไปยังหน้า Super Admin..." />
  }

  if (user.role !== 'SUPER_ADMIN' && user.tenantExpiryDate) {
    const { state } = getTenantExpiryState(user.tenantExpiryDate)
    if (state === 'expired') {
      return <LoadingScreen message="กำลังนำคุณไปยังหน้าต่ออายุ..." />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-[#0F172A] transition-colors">
      <CapacitorBridge />
      <SideNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <SubscriptionBanner />
        <div className={isOwnerOrManager && pathname === '/dashboard' ? 'hidden md:block' : undefined}>
          <TopBar onMenuToggle={() => setSidebarOpen((o) => !o)} />
        </div>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>
      <OperationalAlertCenter variant="desktop" />
      <ReminderPopup variant="desktop" />
      {(user?.role === 'OWNER' || user?.role === 'MANAGER') && <BottomTabBar />}
    </div>
  )
}
