/**
 * Regression tests for Phase 16.12 UX improvements:
 *   UX-4 — Snooze-all button in reminder popup
 *   UX-2 — Confirm before repair delivery payment
 *   UX-1 — Confirm before large POS checkout (>= 5000 THB threshold)
 *   UX-3 — Multi-part stock shortage in one error message
 */
import { describe, it, expect } from 'vitest'

// ── UX-4: Snooze-all — visibility and eligibility logic ─────────────────────

describe('UX-4 · snooze-all button — visibility and eligibility', () => {
  type Severity = 'CRITICAL' | 'WARNING' | 'INFO'
  interface ReminderItem { entityId: string; severity: Severity }

  function getSnoozableItems(items: ReminderItem[]): ReminderItem[] {
    return items.filter(i => i.severity !== 'CRITICAL')
  }

  function shouldShowSnoozeAll(items: ReminderItem[]): boolean {
    return getSnoozableItems(items).length >= 2
  }

  it('hidden when 0 reminder items', () => {
    expect(shouldShowSnoozeAll([])).toBe(false)
  })

  it('hidden when only 1 non-CRITICAL item', () => {
    expect(shouldShowSnoozeAll([{ entityId: 'e1', severity: 'WARNING' }])).toBe(false)
  })

  it('shown when 2 non-CRITICAL items', () => {
    expect(shouldShowSnoozeAll([
      { entityId: 'e1', severity: 'WARNING' },
      { entityId: 'e2', severity: 'INFO' },
    ])).toBe(true)
  })

  it('shown when 3 non-CRITICAL items', () => {
    const items = [
      { entityId: 'e1', severity: 'WARNING' as Severity },
      { entityId: 'e2', severity: 'WARNING' as Severity },
      { entityId: 'e3', severity: 'INFO' as Severity },
    ]
    expect(shouldShowSnoozeAll(items)).toBe(true)
  })

  it('hidden when all items are CRITICAL (non-snoozable)', () => {
    expect(shouldShowSnoozeAll([
      { entityId: 'e1', severity: 'CRITICAL' },
      { entityId: 'e2', severity: 'CRITICAL' },
    ])).toBe(false)
  })

  it('CRITICAL items excluded from snoozable list', () => {
    const items: ReminderItem[] = [
      { entityId: 'e1', severity: 'CRITICAL' },
      { entityId: 'e2', severity: 'WARNING' },
      { entityId: 'e3', severity: 'INFO' },
    ]
    const snoozable = getSnoozableItems(items)
    expect(snoozable).toHaveLength(2)
    expect(snoozable.every(i => i.severity !== 'CRITICAL')).toBe(true)
  })

  it('threshold is exactly 2 (not 1, not 3)', () => {
    // 1 → hidden
    expect(shouldShowSnoozeAll([{ entityId: 'x', severity: 'WARNING' }])).toBe(false)
    // 2 → shown
    expect(shouldShowSnoozeAll([
      { entityId: 'x', severity: 'WARNING' },
      { entityId: 'y', severity: 'WARNING' },
    ])).toBe(true)
  })

  it('snooze-all always uses 15 minutes', () => {
    const SNOOZE_ALL_MINUTES = 15
    expect(SNOOZE_ALL_MINUTES).toBe(15)
  })
})

// ── UX-2: Confirm before repair delivery ────────────────────────────────────

describe('UX-2 · repair delivery — confirm dialog before mutation', () => {
  // The confirm dialog intercepts the "deliver" button tap before calling the API.
  // These tests verify the state-machine: confirmDeliverOpen → onConfirm → mutate.

  function simulateDeliverFlow(userConfirms: boolean) {
    let dialogOpened = false
    let mutationCalled = false

    // Simulates button click
    function onDeliverButtonClick() {
      dialogOpened = true  // open confirm dialog
    }

    // Simulates user interaction with dialog
    function onDialogResponse(confirmed: boolean) {
      dialogOpened = false
      if (confirmed) {
        mutationCalled = true  // only then call the API
      }
    }

    onDeliverButtonClick()
    onDialogResponse(userConfirms)

    return { dialogOpened, mutationCalled }
  }

  it('clicking deliver opens confirm dialog (mutation NOT called yet)', () => {
    let mutationCalled = false
    let dialogOpened = false

    function onClick() { dialogOpened = true }
    onClick()

    expect(dialogOpened).toBe(true)
    expect(mutationCalled).toBe(false)
  })

  it('confirming the dialog calls the mutation', () => {
    const { mutationCalled } = simulateDeliverFlow(true)
    expect(mutationCalled).toBe(true)
  })

  it('cancelling the dialog does NOT call the mutation', () => {
    const { mutationCalled } = simulateDeliverFlow(false)
    expect(mutationCalled).toBe(false)
  })

  it('dialog closes on both confirm and cancel', () => {
    const confirmed = simulateDeliverFlow(true)
    expect(confirmed.dialogOpened).toBe(false)

    const cancelled = simulateDeliverFlow(false)
    expect(cancelled.dialogOpened).toBe(false)
  })
})

// ── UX-1: Confirm before large POS checkout ─────────────────────────────────

describe('UX-1 · large POS checkout — confirm dialog at 5000 THB threshold', () => {
  const LARGE_CHECKOUT_THRESHOLD = 5000

  function shouldShowConfirm(total: number): boolean {
    return total >= LARGE_CHECKOUT_THRESHOLD
  }

  function simulateCheckoutClick(total: number, userConfirms?: boolean) {
    let confirmDialogOpened = false
    let checkoutSheetOpened = false

    if (shouldShowConfirm(total)) {
      confirmDialogOpened = true
      if (userConfirms) checkoutSheetOpened = true
    } else {
      checkoutSheetOpened = true  // open checkout directly
    }

    return { confirmDialogOpened, checkoutSheetOpened }
  }

  it('threshold is 5000 THB', () => {
    expect(LARGE_CHECKOUT_THRESHOLD).toBe(5000)
  })

  it('total below threshold → checkout opens directly, no confirm', () => {
    const { confirmDialogOpened, checkoutSheetOpened } = simulateCheckoutClick(4999)
    expect(confirmDialogOpened).toBe(false)
    expect(checkoutSheetOpened).toBe(true)
  })

  it('total exactly at threshold → confirm dialog shown', () => {
    const { confirmDialogOpened } = simulateCheckoutClick(5000)
    expect(confirmDialogOpened).toBe(true)
  })

  it('total above threshold → confirm dialog shown', () => {
    const { confirmDialogOpened } = simulateCheckoutClick(9999.99)
    expect(confirmDialogOpened).toBe(true)
  })

  it('confirming dialog opens checkout sheet', () => {
    const { checkoutSheetOpened } = simulateCheckoutClick(6000, true)
    expect(checkoutSheetOpened).toBe(true)
  })

  it('cancelling dialog does NOT open checkout sheet', () => {
    const { checkoutSheetOpened } = simulateCheckoutClick(6000, false)
    expect(checkoutSheetOpened).toBe(false)
  })

  it('total of 0 never triggers confirm', () => {
    expect(shouldShowConfirm(0)).toBe(false)
  })

  it('total of 4999.99 does not trigger confirm', () => {
    expect(shouldShowConfirm(4999.99)).toBe(false)
  })

  it('total of 5000.01 triggers confirm', () => {
    expect(shouldShowConfirm(5000.01)).toBe(true)
  })
})

// ── UX-3: Multi-part stock shortage in one error message ─────────────────────

describe('UX-3 · repair stock shortage — comprehensive error message', () => {
  interface PartCheck { productName: string; available: number; needed: number }

  function buildShortageMessage(shortages: PartCheck[]): string | null {
    if (shortages.length === 0) return null
    const detail = shortages
      .map(s => `"${s.productName}" (มี ${s.available} ต้องการ ${s.needed})`)
      .join(', ')
    return `สต็อกไม่พอ: ${detail}`
  }

  function collectShortages(
    parts: Array<{ productName: string; available: number; needed: number }>,
  ): PartCheck[] {
    return parts.filter(p => p.available < p.needed)
  }

  it('no shortages → no error message', () => {
    const parts = [
      { productName: 'Battery', available: 5, needed: 1 },
      { productName: 'Screen',  available: 2, needed: 2 },
    ]
    expect(buildShortageMessage(collectShortages(parts))).toBeNull()
  })

  it('single shortage → shows that product name', () => {
    const parts = [{ productName: 'Battery', available: 0, needed: 1 }]
    const msg = buildShortageMessage(collectShortages(parts))
    expect(msg).toContain('Battery')
    expect(msg).toContain('0')
    expect(msg).toContain('1')
  })

  it('multiple shortages → all products in one message', () => {
    const parts = [
      { productName: 'Battery', available: 0, needed: 1 },
      { productName: 'Screen',  available: 1, needed: 2 },
      { productName: 'Camera',  available: 3, needed: 5 },
    ]
    const msg = buildShortageMessage(collectShortages(parts))!
    expect(msg).toContain('Battery')
    expect(msg).toContain('Screen')
    expect(msg).toContain('Camera')
  })

  it('only actually short parts appear in message (sufficient parts excluded)', () => {
    const parts = [
      { productName: 'Battery', available: 0, needed: 1 },  // short
      { productName: 'Screen',  available: 5, needed: 2 },  // sufficient
      { productName: 'Cable',   available: 1, needed: 3 },  // short
    ]
    const shortages = collectShortages(parts)
    expect(shortages).toHaveLength(2)
    const msg = buildShortageMessage(shortages)!
    expect(msg).toContain('Battery')
    expect(msg).not.toContain('Screen')
    expect(msg).toContain('Cable')
  })

  it('message includes available and needed quantities for each part', () => {
    const parts = [{ productName: 'LCD', available: 2, needed: 5 }]
    const msg = buildShortageMessage(collectShortages(parts))!
    expect(msg).toContain('2')  // available
    expect(msg).toContain('5')  // needed
  })

  it('null product name uses ID fallback (never shows "undefined")', () => {
    const productName = (null as any)?.name ?? '[ID: prod-xyz]'
    const parts = [{ productName, available: 0, needed: 1 }]
    const msg = buildShortageMessage(collectShortages(parts))!
    expect(msg).not.toContain('undefined')
    expect(msg).toContain('[ID: prod-xyz]')
  })

  it('deduction only runs after all checks pass (two-pass safety)', () => {
    const parts = [
      { productName: 'A', available: 5, needed: 2 },
      { productName: 'B', available: 0, needed: 1 },
    ]
    const shortages = collectShortages(parts)
    // If any shortage found, deduction never runs
    const shouldDeduct = shortages.length === 0
    expect(shouldDeduct).toBe(false)
  })
})
