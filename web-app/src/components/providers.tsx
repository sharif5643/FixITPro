'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { PlatformBody } from '@/components/apk/platform-body'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { useAuthStore } from '@/store/auth.store'

function PermissionRefresher() {
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) return
    const onFocus = () => refreshPermissions()
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus()
    })
    return () => window.removeEventListener('visibilitychange', onFocus)
  }, [user, refreshPermissions])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            // Don't retry 4xx client errors — they'll fail again with identical params.
            // Retrying 400/401/403/404 also causes double-rejection noise in the
            // Next.js dev overlay.  Only retry network failures and 5xx.
            retry: (failureCount: number, error: unknown) => {
              const status = (error as any)?.response?.status as number | undefined
              if (status !== undefined && status >= 400 && status < 500) return false
              return failureCount < 1
            },
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      }),
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <PermissionRefresher />
        <PlatformBody />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
