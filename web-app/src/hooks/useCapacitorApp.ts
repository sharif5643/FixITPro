'use client'

import { useEffect } from 'react'
import { Platform } from '@/lib/platform'
import { handleAndroidBack } from '@/lib/back-stack'

/**
 * Initialises Capacitor native features when running as an APK:
 * - Android hardware back button — checks back-handler stack first, then history.back() / exitApp()
 * - Status bar style and colour
 *
 * Safe to call on web — all code is guarded by Platform.isNative().
 */
export function useCapacitorApp(): void {
  useEffect(() => {
    if (!Platform.isNative()) return

    let cleanup: (() => void) | undefined

    async function setup() {
      const { App }              = await import('@capacitor/app')
      const { StatusBar, Style } = await import('@capacitor/status-bar')

      // Android back button — let registered handlers intercept first
      const backHandle = await App.addListener('backButton', ({ canGoBack }) => {
        if (handleAndroidBack()) return   // dialog / scanner consumed it
        if (canGoBack) {
          window.history.back()
        } else {
          App.exitApp()
        }
      })

      // Status bar — dark text on dark background
      try {
        await StatusBar.setStyle({ style: Style.Dark })
        await StatusBar.setBackgroundColor({ color: '#0f172a' })
        await StatusBar.show()
      } catch {
        // Ignore — not supported on all devices / OS versions
      }

      return () => {
        backHandle.remove()
      }
    }

    setup().then((fn) => {
      cleanup = fn
    })

    return () => {
      cleanup?.()
    }
  }, [])
}
