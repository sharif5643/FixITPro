'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { OfflineBanner } from '@/components/offline-banner'
import { useSyncQueue } from '@/hooks/use-sync-queue'
import { SunmiErrorBoundary } from '@/components/sunmi/sunmi-error-boundary'
import { ReminderPopup } from '@/components/alerts/reminder-popup'

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(msg: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SunmiStartup] ${msg}`)
  }
}

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  )
}

// ── Inner layout (only mounts after auth hydration) ────────────────────────────
// Separated so useSyncQueue + OfflineBanner only run on the client,
// never during SSR/build — prevents any server-side indexedDB crash.

function SunmiLayoutInner({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    log('layout mounted')
    log(`online status: ${navigator.onLine}`)
    log(`indexedDB available: ${typeof indexedDB !== 'undefined'}`)
    log(`API url: ${process.env.NEXT_PUBLIC_API_URL ?? 'not set'}`)

    try {
      // Dynamic import to avoid SSR issues with Capacitor
      import('@/lib/platform').then(({ Platform }) => {
        log(`Capacitor platform: ${Platform.get()}`)
        log(`isNative: ${Platform.isNative()}`)
      })
    } catch {
      log('Capacitor platform: unavailable')
    }
  }, [])

  // Only activate sync queue once we're mounted on the client
  if (mounted) return <SunmiLayoutWithSync>{children}</SunmiLayoutWithSync>

  return <>{children}</>
}

function SunmiLayoutWithSync({ children }: { children: React.ReactNode }) {
  useSyncQueue()
  return (
    <>
      <OfflineBanner />
      <ReminderPopup variant="sunmi" />
      {children}
    </>
  )
}

// ── Root layout ────────────────────────────────────────────────────────────────

export default function SunmiLayout({ children }: { children: React.ReactNode }) {
  const router      = useRouter()
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const user        = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!hasHydrated) return
    // CHB-01: guard on user presence — middleware handles unauthenticated redirect
    if (!user) { router.replace('/login'); return }
    if (user.forcePasswordChange) router.replace('/change-password')
  }, [hasHydrated, user, router])

  if (!hasHydrated || !user) return <Spinner />

  return (
    <SunmiErrorBoundary>
      <SunmiLayoutInner>{children}</SunmiLayoutInner>
    </SunmiErrorBoundary>
  )
}
