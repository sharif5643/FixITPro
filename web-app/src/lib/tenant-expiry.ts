// Must match TENANT_GRACE_DAYS in backend/src/common/tenant-access.ts (and middleware.ts):
// days after the expiry date a shop can still save; after that it is read-only.
export const GRACE_DAYS = 7

/** Fired by the API client when a save is refused because the shop is expired or suspended. */
export const TENANT_BLOCKED_EVENT = 'fixitpro:tenant-blocked'
export const TENANT_BLOCK_CODES = ['TENANT_EXPIRED', 'TENANT_SUSPENDED']

export type TenantExpiryState = 'active' | 'grace' | 'expired'

export function getTenantExpiryState(expiryDate: string | null | undefined): {
  state: TenantExpiryState
  graceDaysRemaining: number | null
} {
  if (!expiryDate) return { state: 'active', graceDaysRemaining: null }

  const now = new Date()
  const expiry = new Date(expiryDate)

  if (expiry >= now) return { state: 'active', graceDaysRemaining: null }

  const gracePeriodEnd = new Date(expiry)
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_DAYS)

  if (gracePeriodEnd > now) {
    const graceDays = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return { state: 'grace', graceDaysRemaining: graceDays }
  }

  return { state: 'expired', graceDaysRemaining: 0 }
}
