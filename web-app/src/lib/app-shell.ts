'use client'

import { usePathname } from 'next/navigation'

/** SUNMI screens that the staff app shows too, and where they live there. */
const STAFF_PATHS: Record<string, string> = {
  '/sunmi':               '/staff/home',
  '/sunmi/sales':         '/staff/pos',
  '/sunmi/sales/history': '/staff/pos/history',
  '/sunmi/shifts':        '/staff/shift',
  '/sunmi/sim-sales':     '/staff/sim',
  '/sunmi/debt':          '/staff/debt',
  '/sunmi/expenses':      '/staff/expenses',
}

/**
 * The SUNMI screens are also used inside the staff app (/staff/...). Links on such a screen go to
 * the matching place in whichever app it is shown in.
 */
export function useAppShell() {
  const inStaff = (usePathname() ?? '').startsWith('/staff')
  const to = (sunmiPath: string) => (inStaff ? STAFF_PATHS[sunmiPath] ?? sunmiPath : sunmiPath)
  return { inStaff, to, home: to('/sunmi'), pos: to('/sunmi/sales') }
}

// ── Full web menu from inside an app ─────────────────────────────────────────
// The SUNMI and staff screens hold the day-to-day work; settings, reports, accounting and staff
// management live in the web menu. An owner or manager can open it from the app and come back.

const FROM_APP_KEY = 'fixitpro:from-app'

/** Remember where to come back to, then the caller navigates to the web page. */
export function markOpenedFromApp(returnTo: string) {
  try { sessionStorage.setItem(FROM_APP_KEY, returnTo) } catch { /* storage blocked */ }
}

/** The app screen the web menu was opened from (this tab only), or null. */
export function openedFromApp(): string | null {
  try { return sessionStorage.getItem(FROM_APP_KEY) } catch { return null }
}

export function clearOpenedFromApp() {
  try { sessionStorage.removeItem(FROM_APP_KEY) } catch { /* storage blocked */ }
}
