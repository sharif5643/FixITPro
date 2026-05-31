'use client'

import { useEffect } from 'react'
import { Platform } from '@/lib/platform'

/**
 * Adds `data-platform="android"` to <html> when running as an APK.
 * This lets global CSS rules target the native environment without
 * needing inline style changes across every component.
 */
export function PlatformBody() {
  useEffect(() => {
    if (Platform.isNative()) {
      document.documentElement.setAttribute('data-platform', Platform.get())
    }
  }, [])

  return null
}
