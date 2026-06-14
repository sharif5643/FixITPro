'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Smartphone, LogOut, Bell, Search, Menu, X, ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const AUTH_TIMEOUT_MS = 10_000

// ── Navigation ─────────────────────────────────────────────────────────────────

import { SA_NAV_GROUPS } from '@/app/super-admin/nav'
import type { SANavItem as NavItem } from '@/app/super-admin/nav'

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      </div>
    </div>
  )
}

function AuthErrorScreen({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <p className="text-sm text-slate-400">ไม่สามารถตรวจสอบสถานะล็อกอินได้</p>
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            ลองใหม่
          </button>
          <button
            onClick={onBack}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            กลับไปเข้าสู่ระบบ
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  pathname,
  user,
  onLogout,
  onClose,
}: {
  pathname: string
  user: { email: string; name: string }
  onLogout: () => void
  onClose?: () => void
}) {
  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800/60 w-60">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 shrink-0">
            <Smartphone className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">FixITPro</p>
            <p className="text-violet-400 text-[10px] font-semibold tracking-widest uppercase mt-0.5">
              Super Admin
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {SA_NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-2 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item)
                return (
                  <Link key={item.href} href={item.href} onClick={onClose}>
                    <div className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      active
                        ? 'bg-violet-600/20 text-violet-300 border border-violet-600/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
                    )}>
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-violet-400' : 'text-slate-500')} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                      {active && <ChevronRight className="h-3 w-3 text-violet-400 opacity-60" />}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile + logout */}
      <div className="px-3 py-4 border-t border-slate-800/60">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/50 mb-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-bold">
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-medium truncate">{user.name}</p>
            <p className="text-slate-500 text-[10px] truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors text-sm"
        >
          <LogOut className="h-4 w-4" />
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ onMenuOpen }: { onMenuOpen: () => void }) {
  const pathname = usePathname()

  // Build breadcrumb from pathname
  const segments = pathname.replace('/super-admin', '').split('/').filter(Boolean)
  const breadcrumb = segments.map((seg, i) => {
    const label = seg
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    const href = '/super-admin/' + segments.slice(0, i + 1).join('/')
    return { label, href }
  })

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur sticky top-0 z-10 shrink-0">
      {/* Mobile menu button + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuOpen}
          className="lg:hidden text-slate-400 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Super Admin</span>
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-2">
              <ChevronRight className="h-3 w-3 text-slate-700" />
              {i === breadcrumb.length - 1 ? (
                <span className="text-slate-200 font-medium">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="text-slate-400 hover:text-slate-200">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="ค้นหา..."
            className="bg-transparent text-sm text-slate-300 placeholder:text-slate-600 outline-none w-36"
            readOnly
          />
          <kbd className="text-[10px] text-slate-600 font-mono">⌘K</kbd>
        </div>

        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-violet-500" />
        </button>
      </div>
    </header>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const user      = useAuthStore((s) => s.user)
  const setAuth   = useAuthStore((s) => s.setAuth)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const [meStatus, setMeStatus] = useState<'pending' | 'done' | 'error'>('pending')
  const [retryKey, setRetryKey] = useState(0)

  // Session recovery: same pattern as dashboard layout — rebuilds store from cookie
  // when localStorage is empty but access_token cookie is still valid.
  // AbortController fixes the React StrictMode double-invoke bug where the cleanup
  // clears the timeout but meCalledRef blocks re-setting it.
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
        if (userData?.id) setAuth(userData, permissions, enabledModules)
        setMeStatus('done')
      })
      .catch((err) => {
        clearTimeout(timeout)
        if (err?.code === 'ERR_CANCELED') return
        const status = err?.response?.status
        if (status === 401 || status === 403) {
          router.replace('/login')
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
    if (!hasHydrated || meStatus !== 'done') return
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'SUPER_ADMIN') router.replace('/403')
  }, [hasHydrated, meStatus, user, router])

  if (!hasHydrated || meStatus === 'pending') return <LoadingScreen />
  if (meStatus === 'error') return (
    <AuthErrorScreen
      onRetry={() => { setMeStatus('pending'); setRetryKey((k) => k + 1) }}
      onBack={() => router.replace('/login')}
    />
  )
  if (!user || user.role !== 'SUPER_ADMIN') return <LoadingScreen />

  const handleLogout = async () => {
    try { await import('@/lib/api').then((m) => m.default.post('/auth/logout')) } catch { /* best-effort */ }
    clearAuth()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar pathname={pathname} user={user} onLogout={handleLogout} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 flex">
            <Sidebar pathname={pathname} user={user} onLogout={handleLogout} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header onMenuOpen={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
