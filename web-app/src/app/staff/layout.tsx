'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { StaffBottomNav } from '@/components/staff/staff-bottom-nav'
import api from '@/lib/api'

const AUTH_PAGES = ['/staff/login', '/staff/register', '/staff/splash', '/staff/change-password']
const AUTH_TIMEOUT_MS = 10_000

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [meStatus, setMeStatus] = useState<'pending' | 'done' | 'error'>('pending')
  const [retryKey, setRetryKey] = useState(0)

  const isAuthPage = AUTH_PAGES.includes(pathname)

  useEffect(() => {
    if (!hasHydrated) return
    if (user) { setMeStatus('done'); return }
    // On auth pages (login/splash/etc.) skip /auth/me — no token yet
    if (isAuthPage) { setMeStatus('done'); return }

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      setMeStatus('error')
    }, AUTH_TIMEOUT_MS)

    api.get('/auth/me', { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout)
        const { permissions = [], enabledModules = [], ...userData } = res.data
        if (userData?.id) setAuth(userData, permissions, enabledModules)
        setMeStatus('done')
      })
      .catch(async (err) => {
        clearTimeout(timeout)
        if (err?.code === 'ERR_CANCELED') return
        const status = err?.response?.status
        if (status === 401 || status === 403) {
          useAuthStore.getState().clearAuth()
          try { await api.post('/auth/logout') } catch { /* best-effort */ }
          router.replace('/staff/login')
        } else {
          setMeStatus('error')
        }
      })

    return () => { clearTimeout(timeout); controller.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, user, retryKey])

  useEffect(() => {
    if (!hasHydrated || meStatus !== 'done') return
    if (!user && !isAuthPage) {
      router.replace('/staff/login')
    }
    if (user && isAuthPage) {
      router.replace('/staff/home')
    }
  }, [hasHydrated, meStatus, user, isAuthPage, router])

  // Auth pages render immediately without guards
  if (isAuthPage) return <>{children}</>

  // Loading states for protected pages
  if (!hasHydrated || meStatus === 'pending') {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-light">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-yellow border-t-transparent" />
          <p className="text-sm text-slate-400">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  if (meStatus === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-slate-500">ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setMeStatus('pending'); setRetryKey((k) => k + 1) }}
              className="rounded-xl bg-brand-yellow px-5 py-2.5 text-sm font-semibold text-brand-black"
            >
              ลองใหม่
            </button>
            <button
              onClick={() => router.replace('/staff/login')}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600"
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-brand-light">
      <main>{children}</main>
      <StaffBottomNav />
    </div>
  )
}
