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
