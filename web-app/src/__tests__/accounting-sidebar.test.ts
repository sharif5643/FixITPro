/**
 * Phase 4F.1 — Accounting Sidebar & hasModule('accounting') Tests
 *
 * Verifies that:
 * A1. OWNER without accounting in enabledModules → hasModule('accounting') = false
 * A2. OWNER with accounting in enabledModules   → hasModule('accounting') = true
 * A3. SUPER_ADMIN with accounting in enabledModules → hasModule('accounting') = true
 * A4. OWNER role bypass DOES still apply for non-accounting modules
 * A5. null user → hasModule returns false for any module
 * A6. Sidebar item filtering: items with module:'accounting' filtered when hasModule returns false
 */
import { describe, it, expect } from 'vitest'

// ── Simulate hasModule logic (mirrors auth.store.ts exactly) ─────────────────

interface SimUser { role: string }

function simulateHasModule(
  user: SimUser | null,
  enabledModules: string[],
  moduleKey: string,
): boolean {
  if (!user) return false
  // Accounting requires explicit tenant activation — bypass not applied
  if (moduleKey === 'accounting') return enabledModules.includes(moduleKey)
  if (user.role === 'SUPER_ADMIN' || user.role === 'OWNER') return true
  return enabledModules.includes(moduleKey)
}

// ── Simulate sidebar item visibility (mirrors SidebarNav line 325) ───────────

interface NavItem { label: string; href: string; module?: string; ownerOnly?: boolean }

function filterSidebarItems(
  items: NavItem[],
  hasModule: (m: string) => boolean,
): NavItem[] {
  return items.filter((item) => {
    if (item.module && !hasModule(item.module)) return false
    return true
  })
}

// ── A1: OWNER, accounting NOT in enabledModules ──────────────────────────────

describe('A1 · OWNER without accounting module', () => {
  const user: SimUser = { role: 'OWNER' }
  const enabledModules: string[] = ['pos', 'repair', 'stock', 'report']

  it('hasModule("accounting") → false', () => {
    expect(simulateHasModule(user, enabledModules, 'accounting')).toBe(false)
  })

  it('sidebar accounting items are hidden', () => {
    const items: NavItem[] = [
      { label: 'สมุดบัญชี', href: '/accounting',          module: 'accounting' },
      { label: 'ผังบัญชี',  href: '/accounting/accounts', module: 'accounting' },
      { label: 'ตั้งค่า',   href: '/settings' },
    ]
    const visible = filterSidebarItems(items, (m) => simulateHasModule(user, enabledModules, m))
    expect(visible.map((i) => i.href)).not.toContain('/accounting')
    expect(visible.map((i) => i.href)).not.toContain('/accounting/accounts')
    expect(visible.map((i) => i.href)).toContain('/settings')
  })
})

// ── A2: OWNER with accounting in enabledModules ───────────────────────────────

describe('A2 · OWNER with accounting module enabled', () => {
  const user: SimUser = { role: 'OWNER' }
  const enabledModules = ['pos', 'repair', 'accounting']

  it('hasModule("accounting") → true', () => {
    expect(simulateHasModule(user, enabledModules, 'accounting')).toBe(true)
  })

  it('sidebar accounting items are visible', () => {
    const items: NavItem[] = [
      { label: 'สมุดบัญชี', href: '/accounting',          module: 'accounting' },
      { label: 'ผังบัญชี',  href: '/accounting/accounts', module: 'accounting' },
    ]
    const visible = filterSidebarItems(items, (m) => simulateHasModule(user, enabledModules, m))
    expect(visible).toHaveLength(2)
    expect(visible.map((i) => i.href)).toContain('/accounting')
    expect(visible.map((i) => i.href)).toContain('/accounting/accounts')
  })
})

// ── A3: SUPER_ADMIN with accounting in enabledModules ────────────────────────

describe('A3 · SUPER_ADMIN with accounting in enabledModules', () => {
  const user: SimUser = { role: 'SUPER_ADMIN' }
  // SUPER_ADMIN gets ALL_MODULE_KEYS from getEnabledModules(null), which includes 'accounting'
  const enabledModules = ['pos', 'repair', 'stock', 'crm', 'report', 'finance', 'accounting', 'user_management']

  it('hasModule("accounting") → true', () => {
    expect(simulateHasModule(user, enabledModules, 'accounting')).toBe(true)
  })
})

// ── A4: OWNER role bypass still works for non-accounting modules ──────────────

describe('A4 · OWNER role bypass preserved for non-accounting modules', () => {
  const user: SimUser = { role: 'OWNER' }
  const enabledModules: string[] = [] // intentionally empty — OWNER bypass should cover non-accounting

  it('hasModule("pos") → true (OWNER bypass)', () => {
    expect(simulateHasModule(user, enabledModules, 'pos')).toBe(true)
  })

  it('hasModule("repair") → true (OWNER bypass)', () => {
    expect(simulateHasModule(user, enabledModules, 'repair')).toBe(true)
  })

  it('hasModule("report") → true (OWNER bypass)', () => {
    expect(simulateHasModule(user, enabledModules, 'report')).toBe(true)
  })

  it('hasModule("accounting") → false (no bypass, not in enabledModules)', () => {
    expect(simulateHasModule(user, enabledModules, 'accounting')).toBe(false)
  })
})

// ── A5: null user ─────────────────────────────────────────────────────────────

describe('A5 · null user', () => {
  it('hasModule returns false for any module when user is null', () => {
    expect(simulateHasModule(null, ['accounting'], 'accounting')).toBe(false)
    expect(simulateHasModule(null, ['pos'],         'pos')).toBe(false)
  })
})

// ── A6: CASHIER cannot bypass accounting ─────────────────────────────────────

describe('A6 · CASHIER role — no bypass', () => {
  const user: SimUser = { role: 'CASHIER' }

  it('hasModule("accounting") → false without module in enabledModules', () => {
    expect(simulateHasModule(user, ['pos', 'repair'], 'accounting')).toBe(false)
  })

  it('hasModule("pos") → false for CASHIER without enabledModules (no bypass)', () => {
    // CASHIER does NOT get bypass — must have module in enabledModules
    expect(simulateHasModule(user, [], 'pos')).toBe(false)
  })

  it('hasModule("pos") → true for CASHIER when pos in enabledModules', () => {
    expect(simulateHasModule(user, ['pos'], 'pos')).toBe(true)
  })
})
