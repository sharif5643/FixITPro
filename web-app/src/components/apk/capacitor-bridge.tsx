'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Platform } from '@/lib/platform'
import { useAuthStore } from '@/store/auth.store'
import { useCapacitorApp } from '@/hooks/useCapacitorApp'

/**
 * Renders nothing but wires up APK-specific behaviour:
 * 1. Registers back-button handler and status bar config.
 * 2. When the APK launches and the user is already logged in,
 *    redirects straight to the POS page instead of the dashboard home.
 *
 * Mount inside the dashboard layout so it has access to the router.
 * On web (browser) this component is a pure no-op.
 */
export function CapacitorBridge() {
  const router      = useRouter()
  const pathname    = usePathname()
  const user        = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  // Native app lifecycle (back button, status bar, etc.)
  useCapacitorApp()

  useEffect(() => {
    if (!Platform.isSunmiShell()) return
    if (!hasHydrated) return
    // CHB-01: guard on user presence — cookie carries the JWT
    if (!user) return
    if (user.forcePasswordChange) return

    // APK or NEXT_PUBLIC_APP_MODE=sunmi: land on SUNMI POS home instead of the admin dashboard
    if (pathname === '/' || pathname === '') {
      router.replace('/sunmi')
    }
  }, [hasHydrated, user, pathname, router])

  return null
}
