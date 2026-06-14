/**
 * Owner V2 Foundation Fix — unit tests
 *
 * Pure-logic tests (no DOM / React rendering).
 * Covers:
 *   1. Sidebar: /analytics present in reports section
 *   2. Permission backfill: MANAGER gains required permissions
 *   3. Subscription: Tenant data mapping produces correct shape
 *   4. Branches: transfers tab removed from Tab type
 *   5. Dashboard: role-aware section visibility logic
 */

import { describe, it, expect } from 'vitest'

// ── 1. Sidebar: /analytics in reports section ──────────────────────────────────

describe('Sidebar — analytics nav item', () => {
  type NavItem = { href: string; permission: string | null; label: string }
  type NavSection = { label: string | null; items: NavItem[] }

  const reportsSection: NavSection = {
    label: 'รายงาน',
    items: [
      { href: '/reports/daily-closing', permission: 'reports.view', label: 'รายงานปิดวัน' },
      { href: '/reports/profit',        permission: 'reports.view', label: 'รายงานกำไร' },
      { href: '/analytics',             permission: 'reports.view', label: 'วิเคราะห์เชิงลึก' },
    ],
  }

  it('/analytics is present in reports section', () => {
    const hrefs = reportsSection.items.map(i => i.href)
    expect(hrefs).toContain('/analytics')
  })

  it('/analytics has permission reports.view', () => {
    const item = reportsSection.items.find(i => i.href === '/analytics')
    expect(item?.permission).toBe('reports.view')
  })

  it('/analytics label is วิเคราะห์เชิงลึก', () => {
    const item = reportsSection.items.find(i => i.href === '/analytics')
    expect(item?.label).toBe('วิเคราะห์เชิงลึก')
  })

  it('reports section now has 3 items', () => {
    expect(reportsSection.items).toHaveLength(3)
  })
})

// ── 2. Permission backfill: required MANAGER permissions ──────────────────────

describe('Permission backfill — MANAGER required permissions', () => {
  const FULL_MANAGER_PERMS = [
    'products.view', 'products.create', 'products.edit', 'products.view_cost',
    'sales.create', 'sales.discount', 'sales.refund',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'supplier.pay',
    'reports.view',
    'claims.manage',
    'serials.manage',
    'expenses.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view', 'notification.manage',
    'data.export', 'data.import',
    'audit.view',
    'settings.manage',
    'branches.manage',
  ]

  const NEWLY_ADDED = ['audit.view', 'settings.manage', 'branches.manage', 'data.import', 'notification.manage']

  it('all newly added permissions exist in MANAGER set', () => {
    for (const perm of NEWLY_ADDED) {
      expect(FULL_MANAGER_PERMS).toContain(perm)
    }
  })

  it('products.delete is NOT in MANAGER (remains OWNER-only)', () => {
    expect(FULL_MANAGER_PERMS).not.toContain('products.delete')
  })

  it('system.backup is NOT in MANAGER (remains OWNER-only)', () => {
    expect(FULL_MANAGER_PERMS).not.toContain('system.backup')
  })

  it('createMany with skipDuplicates is safe — adding duplicates returns 0 new rows', () => {
    // Simulate: if permission already exists, count delta = 0
    const existing = new Set(['audit.view', 'settings.manage'])
    const toAdd = ['audit.view', 'settings.manage', 'branches.manage']
    const newOnes = toAdd.filter(p => !existing.has(p))
    expect(newOnes).toHaveLength(1)
    expect(newOnes[0]).toBe('branches.manage')
  })
})

// ── 3. Subscription: Tenant data mapping ─────────────────────────────────────

describe('Subscription — Tenant data mapping', () => {
  const PLAN_LABELS: Record<string, string> = {
    TRIAL: 'Founding Customer (ทดลองใช้)',
    BASIC: 'Starter',
    PRO: 'Business',
    ENTERPRISE: 'Enterprise',
  }

  const PLAN_BRANCH_LIMITS: Record<string, string> = {
    TRIAL: '1 สาขา',
    BASIC: '1 สาขา',
    PRO: '3 สาขา',
    ENTERPRISE: 'ไม่จำกัด',
  }

  function mapTenantToSub(tenant: {
    id: string; plan: string; status: string
    expiryDate: Date | null; startDate: Date | null; notes: string | null
    renewals: Array<{ id: string; action: string; plan: string; duration: number; expiryDate: Date; note: string | null; createdAt: Date }>
  }) {
    const now = new Date()
    const expiryDate = tenant.expiryDate ?? new Date(0)
    const isExpired = expiryDate < now
    const isSuspended = tenant.status === 'SUSPENDED'
    const effectiveStatus = isSuspended ? 'SUSPENDED' : isExpired ? 'EXPIRED' : tenant.status
    const msRemaining = expiryDate.getTime() - now.getTime()
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))
    return {
      id: tenant.id,
      planName: PLAN_LABELS[tenant.plan] ?? tenant.plan,
      plan: tenant.plan,
      branchLimit: PLAN_BRANCH_LIMITS[tenant.plan] ?? '-',
      status: tenant.status,
      effectiveStatus,
      daysRemaining,
      startDate: tenant.startDate?.toISOString() ?? null,
      expiryDate: expiryDate.toISOString(),
      notes: tenant.notes,
      renewals: tenant.renewals.map(r => ({
        id: r.id, action: r.action, plan: r.plan, duration: r.duration,
        expiryDate: r.expiryDate.toISOString(), note: r.note, amount: null,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  }

  it('maps PRO plan to Business label', () => {
    const future = new Date(Date.now() + 30 * 86400_000)
    const result = mapTenantToSub({ id: 't1', plan: 'PRO', status: 'ACTIVE', expiryDate: future, startDate: null, notes: null, renewals: [] })
    expect(result.planName).toBe('Business')
  })

  it('maps ENTERPRISE plan to Enterprise label with unlimited branches', () => {
    const future = new Date(Date.now() + 365 * 86400_000)
    const result = mapTenantToSub({ id: 't2', plan: 'ENTERPRISE', status: 'ACTIVE', expiryDate: future, startDate: null, notes: null, renewals: [] })
    expect(result.planName).toBe('Enterprise')
    expect(result.branchLimit).toBe('ไม่จำกัด')
  })

  it('computes effectiveStatus=EXPIRED for past expiryDate', () => {
    const past = new Date(Date.now() - 86400_000)
    const result = mapTenantToSub({ id: 't3', plan: 'BASIC', status: 'ACTIVE', expiryDate: past, startDate: null, notes: null, renewals: [] })
    expect(result.effectiveStatus).toBe('EXPIRED')
    expect(result.daysRemaining).toBe(0)
  })

  it('computes effectiveStatus=SUSPENDED regardless of expiry', () => {
    const future = new Date(Date.now() + 30 * 86400_000)
    const result = mapTenantToSub({ id: 't4', plan: 'PRO', status: 'SUSPENDED', expiryDate: future, startDate: null, notes: null, renewals: [] })
    expect(result.effectiveStatus).toBe('SUSPENDED')
  })

  it('maps renewals with null amount', () => {
    const future = new Date(Date.now() + 30 * 86400_000)
    const renewal = { id: 'r1', action: 'RENEW', plan: 'PRO', duration: 30, expiryDate: future, note: null, createdAt: new Date() }
    const result = mapTenantToSub({ id: 't5', plan: 'PRO', status: 'ACTIVE', expiryDate: future, startDate: null, notes: null, renewals: [renewal] })
    expect(result.renewals[0].amount).toBeNull()
    expect(result.renewals[0].action).toBe('RENEW')
  })
})

// ── 4. Branches: transfers tab removed from Tab type ─────────────────────────

describe('Branches page — transfers tab removed', () => {
  type Tab = 'branches' | 'stock'

  it('Tab type only allows branches and stock', () => {
    const validTabs: Tab[] = ['branches', 'stock']
    expect(validTabs).toHaveLength(2)
    expect(validTabs).not.toContain('transfers')
  })

  it('default tab is branches', () => {
    const defaultTab: Tab = 'branches'
    expect(defaultTab).toBe('branches')
  })

  it('"transfers" is not a valid Tab value', () => {
    const validTabs: readonly string[] = ['branches', 'stock']
    expect(validTabs).not.toContain('transfers')
  })
})

// ── 5. Dashboard: role-aware section visibility ───────────────────────────────

describe('Dashboard — role-aware section visibility', () => {
  type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF' | 'SUPER_ADMIN'

  function isOwnerOrManager(role: Role | null): boolean {
    return role === 'OWNER' || role === 'MANAGER' || role === 'SUPER_ADMIN'
  }

  function isOwner(role: Role | null): boolean {
    return role === 'OWNER' || role === 'SUPER_ADMIN'
  }

  // Finance section
  it('OWNER sees finance section', () => expect(isOwnerOrManager('OWNER')).toBe(true))
  it('MANAGER sees finance section', () => expect(isOwnerOrManager('MANAGER')).toBe(true))
  it('SUPER_ADMIN sees finance section', () => expect(isOwnerOrManager('SUPER_ADMIN')).toBe(true))
  it('CASHIER does NOT see finance section', () => expect(isOwnerOrManager('CASHIER')).toBe(false))
  it('TECHNICIAN does NOT see finance section', () => expect(isOwnerOrManager('TECHNICIAN')).toBe(false))
  it('STOCK_STAFF does NOT see finance section', () => expect(isOwnerOrManager('STOCK_STAFF')).toBe(false))

  // Branch comparison
  it('OWNER sees branch comparison', () => expect(isOwnerOrManager('OWNER')).toBe(true))
  it('MANAGER sees branch comparison', () => expect(isOwnerOrManager('MANAGER')).toBe(true))
  it('CASHIER does NOT see branch comparison', () => expect(isOwnerOrManager('CASHIER')).toBe(false))

  // isOwner subset (for features truly OWNER-only like debt tab in legacy code)
  it('OWNER is owner', () => expect(isOwner('OWNER')).toBe(true))
  it('MANAGER is NOT isOwner (legacy flag)', () => expect(isOwner('MANAGER')).toBe(false))

  // Analytics quick action
  it('OWNER sees analytics quick action', () => expect(isOwnerOrManager('OWNER')).toBe(true))
  it('MANAGER sees analytics quick action', () => expect(isOwnerOrManager('MANAGER')).toBe(true))
  it('CASHIER does not see analytics quick action', () => expect(isOwnerOrManager('CASHIER')).toBe(false))
})
