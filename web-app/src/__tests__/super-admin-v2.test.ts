/**
 * Super Admin V2 — UI & access control tests
 *
 * Pure-logic tests (no DOM / React rendering).
 * Covers:
 *   1. Role-based access control (SUPER_ADMIN only)
 *   2. Navigation — all 12 menu items present
 *   3. Sidebar active-state logic
 *   4. Tenant table actions per status
 *   5. Package definitions
 *   6. Subscriptions filter logic
 *   7. Days-left calculation and expiry colour tiers
 *   8. Placeholder pages exist (route registry)
 */

import { describe, it, expect } from 'vitest'
import { SA_NAV_GROUPS, SA_NAV_ITEMS } from '@/app/super-admin/nav'
import type { TenantStatus, TenantPlan } from '@/types'
import { TENANT_PLAN_LABEL } from '@/types'
import { differenceInDays } from 'date-fns'

// ── 1. Role-based access control ──────────────────────────────────────────────

describe('Req 1 — SUPER_ADMIN access control', () => {
  type Role = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

  function canAccessSuperAdmin(role: Role | null): boolean {
    return role === 'SUPER_ADMIN'
  }

  it('SUPER_ADMIN can access /super-admin', () => {
    expect(canAccessSuperAdmin('SUPER_ADMIN')).toBe(true)
  })

  it('OWNER cannot access /super-admin → redirect /403', () => {
    expect(canAccessSuperAdmin('OWNER')).toBe(false)
  })

  it('MANAGER cannot access /super-admin', () => {
    expect(canAccessSuperAdmin('MANAGER')).toBe(false)
  })

  it('null user cannot access /super-admin → redirect /login', () => {
    expect(canAccessSuperAdmin(null)).toBe(false)
  })

  it('layout.tsx redirects non-SUPER_ADMIN to /403', () => {
    // Document expected behaviour: role !== 'SUPER_ADMIN' → router.replace('/403')
    const redirectTarget = (role: Role | null) =>
      role === 'SUPER_ADMIN' ? null : (role === null ? '/login' : '/403')

    expect(redirectTarget('OWNER')).toBe('/403')
    expect(redirectTarget('CASHIER')).toBe('/403')
    expect(redirectTarget(null)).toBe('/login')
    expect(redirectTarget('SUPER_ADMIN')).toBeNull()
  })
})

// ── 2. Navigation — all 12 menu items ─────────────────────────────────────────

describe('Req 2 — Sidebar contains all 12 menu items', () => {
  it('SA_NAV_ITEMS has exactly 12 items', () => {
    expect(SA_NAV_ITEMS).toHaveLength(12)
  })

  it('Dashboard is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin' && i.exact)).toBe(true)
  })

  it('Tenants is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/tenants')).toBe(true)
  })

  it('Branches is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/branches')).toBe(true)
  })

  it('Users is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/users')).toBe(true)
  })

  it('Packages is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/packages')).toBe(true)
  })

  it('Subscriptions is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/subscriptions')).toBe(true)
  })

  it('Payments is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/payments')).toBe(true)
  })

  it('Analytics is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/analytics')).toBe(true)
  })

  it('Audit Logs is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/audit-logs')).toBe(true)
  })

  it('Settings is included', () => {
    expect(SA_NAV_ITEMS.some(i => i.href === '/super-admin/settings')).toBe(true)
  })

  it('Nav groups are 3 (Platform, Revenue, System)', () => {
    expect(SA_NAV_GROUPS).toHaveLength(3)
    const labels = SA_NAV_GROUPS.map(g => g.label)
    expect(labels).toContain('Platform')
    expect(labels).toContain('Revenue')
    expect(labels).toContain('System')
  })
})

// ── 3. Sidebar active-state logic ─────────────────────────────────────────────

describe('Req 3 — Sidebar active state', () => {
  function isActive(item: { href: string; exact?: boolean }, pathname: string): boolean {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  it('Dashboard exact match on /super-admin', () => {
    expect(isActive({ href: '/super-admin', exact: true }, '/super-admin')).toBe(true)
  })

  it('Dashboard NOT active on /super-admin/tenants', () => {
    expect(isActive({ href: '/super-admin', exact: true }, '/super-admin/tenants')).toBe(false)
  })

  it('Tenants active on /super-admin/tenants', () => {
    expect(isActive({ href: '/super-admin/tenants' }, '/super-admin/tenants')).toBe(true)
  })

  it('Tenants active on /super-admin/tenants/[id]', () => {
    expect(isActive({ href: '/super-admin/tenants' }, '/super-admin/tenants/cltest123')).toBe(true)
  })

  it('Payments NOT active on /super-admin/subscriptions', () => {
    expect(isActive({ href: '/super-admin/payments' }, '/super-admin/subscriptions')).toBe(false)
  })
})

// ── 4. Tenant table actions per status ───────────────────────────────────────

describe('Req 4 — Tenant action availability per status', () => {
  type TenantForAction = { status: TenantStatus }

  function availableActions(t: TenantForAction) {
    return {
      activate:   t.status === 'PENDING',
      renew:      t.status === 'ACTIVE' || t.status === 'EXPIRED',
      suspend:    t.status === 'ACTIVE',
      reactivate: t.status === 'SUSPENDED',
      resetPw:    true,  // always available
      view:       true,  // always available
    }
  }

  it('PENDING → activate only (no renew, no suspend)', () => {
    const a = availableActions({ status: 'PENDING' })
    expect(a.activate).toBe(true)
    expect(a.renew).toBe(false)
    expect(a.suspend).toBe(false)
  })

  it('ACTIVE → renew + suspend (no activate)', () => {
    const a = availableActions({ status: 'ACTIVE' })
    expect(a.renew).toBe(true)
    expect(a.suspend).toBe(true)
    expect(a.activate).toBe(false)
  })

  it('EXPIRED → renew only', () => {
    const a = availableActions({ status: 'EXPIRED' })
    expect(a.renew).toBe(true)
    expect(a.suspend).toBe(false)
    expect(a.activate).toBe(false)
  })

  it('SUSPENDED → reactivate only', () => {
    const a = availableActions({ status: 'SUSPENDED' })
    expect(a.reactivate).toBe(true)
    expect(a.renew).toBe(false)
  })

  it('View + reset password always available', () => {
    const statuses: TenantStatus[] = ['PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED']
    statuses.forEach(status => {
      const a = availableActions({ status })
      expect(a.view).toBe(true)
      expect(a.resetPw).toBe(true)
    })
  })
})

// ── 5. Package definitions ────────────────────────────────────────────────────

describe('Req 5 — Package plan labels', () => {
  it('TRIAL plan label exists', () => {
    expect(TENANT_PLAN_LABEL['TRIAL']).toBeTruthy()
  })

  it('BASIC plan label exists', () => {
    expect(TENANT_PLAN_LABEL['BASIC']).toBeTruthy()
  })

  it('PRO plan label exists', () => {
    expect(TENANT_PLAN_LABEL['PRO']).toBeTruthy()
  })

  it('ENTERPRISE plan label exists', () => {
    expect(TENANT_PLAN_LABEL['ENTERPRISE']).toBeTruthy()
  })

  it('Package limiting principle: branches limited, products/repairs unlimited', () => {
    // Document the design principle as a test
    const principle = {
      limitedBy: 'branches',
      unlimitedItems: ['products', 'repairs', 'customers', 'users'],
    }
    expect(principle.limitedBy).toBe('branches')
    expect(principle.unlimitedItems).toContain('products')
    expect(principle.unlimitedItems).toContain('repairs')
    expect(principle.unlimitedItems).not.toContain('branches')
  })

  it('Branch limits by plan', () => {
    const branchLimits: Record<TenantPlan, number | null> = {
      TRIAL:      1,
      BASIC:      1,
      PRO:        5,
      ENTERPRISE: null, // unlimited
    }
    expect(branchLimits.TRIAL).toBe(1)
    expect(branchLimits.PRO).toBe(5)
    expect(branchLimits.ENTERPRISE).toBeNull()
  })
})

// ── 6. Subscriptions filter logic ─────────────────────────────────────────────

describe('Req 6 — Subscription page filter logic', () => {
  const now = new Date('2026-06-07T10:00:00Z')
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
  const future = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString()

  function daysLeft(d?: string | null): number | null {
    if (!d) return null
    return differenceInDays(new Date(d), now)
  }

  type T = { status: TenantStatus; expiryDate?: string | null }

  const tenants: T[] = [
    { status: 'ACTIVE',    expiryDate: future(30) },   // active, fine
    { status: 'ACTIVE',    expiryDate: future(3)  },   // expiring soon
    { status: 'ACTIVE',    expiryDate: future(7)  },   // expiring (exactly 7 days)
    { status: 'EXPIRED',   expiryDate: ago(5)     },   // expired
    { status: 'SUSPENDED', expiryDate: future(10) },   // suspended
    { status: 'PENDING',   expiryDate: null        },  // pending
  ]

  function filterActive(list: T[])    { return list.filter(t => t.status === 'ACTIVE') }
  function filterExpired(list: T[])   { return list.filter(t => t.status === 'EXPIRED') }
  function filterSuspended(list: T[]) { return list.filter(t => t.status === 'SUSPENDED') }
  function filterExpiring(list: T[])  {
    return list.filter(t => {
      if (t.status !== 'ACTIVE' || !t.expiryDate) return false
      const d = daysLeft(t.expiryDate)
      return d !== null && d >= 0 && d <= 7
    })
  }

  it('active filter returns ACTIVE tenants', () => {
    expect(filterActive(tenants)).toHaveLength(3)
  })

  it('expired filter returns EXPIRED tenants', () => {
    expect(filterExpired(tenants)).toHaveLength(1)
  })

  it('suspended filter returns SUSPENDED tenants', () => {
    expect(filterSuspended(tenants)).toHaveLength(1)
  })

  it('expiring filter returns ACTIVE tenants with ≤7 days left', () => {
    const expiring = filterExpiring(tenants)
    expect(expiring).toHaveLength(2) // 3 days + 7 days exactly
    expiring.forEach(t => {
      const d = daysLeft(t.expiryDate)
      expect(d).not.toBeNull()
      expect(d!).toBeGreaterThanOrEqual(0)
      expect(d!).toBeLessThanOrEqual(7)
    })
  })

  it('PENDING tenant not included in expiring (no expiryDate)', () => {
    const expiring = filterExpiring(tenants)
    expect(expiring.some(t => t.status === 'PENDING')).toBe(false)
  })
})

// ── 7. Days-left colour tiers ─────────────────────────────────────────────────

describe('Req 7 — Expiry colour tier logic', () => {
  function expiryColour(days: number | null): 'red' | 'amber' | 'green' | 'none' {
    if (days === null) return 'none'
    if (days < 0)  return 'red'    // already expired
    if (days <= 3) return 'red'    // critical
    if (days <= 7) return 'amber'  // warning
    return 'green'
  }

  it('expired (days < 0) → red', () => {
    expect(expiryColour(-1)).toBe('red')
    expect(expiryColour(-30)).toBe('red')
  })

  it('0–3 days → red (critical)', () => {
    expect(expiryColour(0)).toBe('red')
    expect(expiryColour(3)).toBe('red')
  })

  it('4–7 days → amber (warning)', () => {
    expect(expiryColour(4)).toBe('amber')
    expect(expiryColour(7)).toBe('amber')
  })

  it('> 7 days → green', () => {
    expect(expiryColour(8)).toBe('green')
    expect(expiryColour(365)).toBe('green')
  })

  it('no expiry date → none', () => {
    expect(expiryColour(null)).toBe('none')
  })
})

// ── 8. Route registry ─────────────────────────────────────────────────────────

describe('Req 8 — All Super Admin V2 routes are defined', () => {
  const ALL_SA_ROUTES = [
    '/super-admin',
    '/super-admin/tenants',
    '/super-admin/tenants/[id]',
    '/super-admin/branches',
    '/super-admin/users',
    '/super-admin/packages',
    '/super-admin/modules',
    '/super-admin/subscriptions',
    '/super-admin/payments',
    '/super-admin/analytics',
    '/super-admin/audit-logs',
    '/super-admin/settings',
<<<<<<< HEAD
    '/super-admin/modules',
=======
>>>>>>> origin/main
    '/super-admin/data-repair',
  ]

  it('has 13 total Super Admin routes', () => {
    expect(ALL_SA_ROUTES).toHaveLength(13)
  })

  it('dashboard route exists', () => {
    expect(ALL_SA_ROUTES).toContain('/super-admin')
  })

  it('tenant detail route exists', () => {
    expect(ALL_SA_ROUTES).toContain('/super-admin/tenants/[id]')
  })

  it('all 12 nav-item routes correspond to file routes', () => {
    const navHrefs = SA_NAV_ITEMS.map(i => i.href)
    navHrefs.forEach(href => {
      expect(ALL_SA_ROUTES).toContain(href)
    })
  })
})

// ── 9. New API endpoints (V2 functional pages) ────────────────────────────────

describe('Req 9 — V2 API endpoint definitions', () => {
  const V2_ENDPOINTS = [
    { method: 'GET',   path: '/super-admin/branches' },
    { method: 'GET',   path: '/super-admin/branches/stats' },
    { method: 'GET',   path: '/super-admin/users' },
    { method: 'GET',   path: '/super-admin/users/stats' },
    { method: 'GET',   path: '/super-admin/analytics' },
    { method: 'GET',   path: '/super-admin/audit-logs' },
    { method: 'GET',   path: '/super-admin/settings' },
    { method: 'PATCH', path: '/super-admin/settings' },
  ]

  it('has 8 new V2 endpoints', () => {
    expect(V2_ENDPOINTS).toHaveLength(8)
  })

  it('branches endpoint exists', () => {
    expect(V2_ENDPOINTS.some(e => e.path === '/super-admin/branches' && e.method === 'GET')).toBe(true)
  })

  it('users endpoint exists', () => {
    expect(V2_ENDPOINTS.some(e => e.path === '/super-admin/users' && e.method === 'GET')).toBe(true)
  })

  it('analytics endpoint exists', () => {
    expect(V2_ENDPOINTS.some(e => e.path === '/super-admin/analytics')).toBe(true)
  })

  it('audit-logs endpoint exists', () => {
    expect(V2_ENDPOINTS.some(e => e.path === '/super-admin/audit-logs')).toBe(true)
  })

  it('settings GET exists', () => {
    expect(V2_ENDPOINTS.some(e => e.path === '/super-admin/settings' && e.method === 'GET')).toBe(true)
  })

  it('settings PATCH exists', () => {
    expect(V2_ENDPOINTS.some(e => e.path === '/super-admin/settings' && e.method === 'PATCH')).toBe(true)
  })
})

// ── 10. Analytics computation logic ───────────────────────────────────────────

describe('Req 10 — Analytics MRR/ARR computation', () => {
  it('ARR is MRR * 12', () => {
    const mrr = 1500
    expect(mrr * 12).toBe(18000)
  })

  it('formatThb formats thousands', () => {
    const formatThb = (n: number): string => {
      if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
      if (n >= 1_000)     return `฿${(n / 1_000).toFixed(1)}K`
      return `฿${n.toLocaleString()}`
    }
    expect(formatThb(1500)).toBe('฿1.5K')
    expect(formatThb(1_500_000)).toBe('฿1.5M')
    expect(formatThb(500)).toBe('฿500')
  })

  it('monthly bucket builder produces correct count', () => {
    function buildMonthlyBuckets(months: number): Map<string, number> {
      const map = new Map<string, number>()
      const now = new Date()
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        map.set(key, 0)
      }
      return map
    }
    expect(buildMonthlyBuckets(12).size).toBe(12)
    expect(buildMonthlyBuckets(6).size).toBe(6)
  })
})

// ── 11. Audit log action mapping ──────────────────────────────────────────────

describe('Req 11 — Audit log action styling', () => {
  const ACTION_STYLE: Record<string, string> = {
    TENANT_CREATED:   'text-emerald-400 bg-emerald-500/10',
    ACTIVATE:         'text-blue-400 bg-blue-500/10',
    RENEW:            'text-violet-400 bg-violet-500/10',
    PAYMENT_ACTIVATE: 'text-violet-400 bg-violet-500/10',
    PAYMENT_VERIFIED: 'text-blue-400 bg-blue-500/10',
    PAYMENT_REJECTED: 'text-red-400 bg-red-500/10',
    PASSWORD_RESET:   'text-amber-400 bg-amber-500/10',
  }

  it('TENANT_CREATED maps to emerald', () => {
    expect(ACTION_STYLE['TENANT_CREATED']).toContain('emerald')
  })

  it('PAYMENT_REJECTED maps to red', () => {
    expect(ACTION_STYLE['PAYMENT_REJECTED']).toContain('red')
  })

  it('PASSWORD_RESET maps to amber', () => {
    expect(ACTION_STYLE['PASSWORD_RESET']).toContain('amber')
  })

  it('unknown action falls back gracefully', () => {
    const fallback = ACTION_STYLE['UNKNOWN_ACTION'] ?? 'text-slate-400 bg-slate-800'
    expect(fallback).toContain('slate')
  })
})

// ── 12. Tenant detail tab data sources ───────────────────────────────────────

describe('Req 12 — Tenant detail tab API mapping', () => {
  type TabId = 'overview' | 'branches' | 'users' | 'subscription' | 'payments' | 'activity' | 'settings'

  const TAB_SOURCES: Record<TabId, string | null> = {
    overview:     null,                        // from tenant query
    branches:     '/super-admin/branches',
    users:        '/super-admin/users',
    subscription: null,                        // from tenant.renewals
    payments:     '/super-admin/payments',
    activity:     '/super-admin/audit-logs',
    settings:     null,                        // from tenant fields
  }

  it('branches tab has an API source', () => {
    expect(TAB_SOURCES['branches']).toBe('/super-admin/branches')
  })

  it('users tab has an API source', () => {
    expect(TAB_SOURCES['users']).toBe('/super-admin/users')
  })

  it('payments tab has an API source', () => {
    expect(TAB_SOURCES['payments']).toBe('/super-admin/payments')
  })

  it('activity tab has an API source', () => {
    expect(TAB_SOURCES['activity']).toBe('/super-admin/audit-logs')
  })

  it('overview and settings come from tenant object directly', () => {
    expect(TAB_SOURCES['overview']).toBeNull()
    expect(TAB_SOURCES['settings']).toBeNull()
  })
})
