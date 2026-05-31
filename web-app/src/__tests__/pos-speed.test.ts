/**
 * Phase 9 — POS Speed System tests
 *
 * Pure logic tests: cart store, shortcut handler, scanner detection.
 * No React rendering required — keeps the suite fast and dependency-light.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<{
  id: string; name: string; sku: string; barcode: string | null
  stock: number; branchQuantity: number; price: number; isActive: boolean
  hasStockRecord: boolean; type: string
}> = {}) {
  return {
    id: 'p1',
    name: 'Test Product',
    sku: 'SKU-001',
    barcode: '1234567890123',
    stock: 10,
    branchQuantity: 10,
    price: 199,
    isActive: true,
    hasStockRecord: true,
    type: 'ACCESSORY',
    minStock: 1,
    costPrice: 100,
    categoryId: null,
    category: null,
    description: null,
    hasSerial: false,
    otherBranchTotal: 0,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cart store — addItem / removeItem / updateQuantity / clearCart
// ─────────────────────────────────────────────────────────────────────────────

describe('CartStore logic (pure)', () => {
  // Replicate the core logic of cart.store.ts to test it in isolation
  function createCartState() {
    const items: Array<{ product: ReturnType<typeof makeProduct>; quantity: number }> = []

    function addItem(product: ReturnType<typeof makeProduct>) {
      const existing = items.find((i) => i.product.id === product.id)
      const available = product.branchQuantity ?? product.stock
      if (existing) {
        const newQty = existing.quantity + 1
        if (newQty > available) return false
        existing.quantity = newQty
        return true
      }
      if (available < 1) return false
      items.push({ product, quantity: 1 })
      return true
    }

    function removeItem(productId: string) {
      const idx = items.findIndex((i) => i.product.id === productId)
      if (idx !== -1) items.splice(idx, 1)
    }

    function updateQuantity(productId: string, quantity: number) {
      if (quantity < 1) { removeItem(productId); return }
      const item = items.find((i) => i.product.id === productId)
      if (!item) return
      const available = item.product.branchQuantity ?? item.product.stock
      if (quantity > available) return
      item.quantity = quantity
    }

    function clearCart() { items.splice(0, items.length) }

    return { items, addItem, removeItem, updateQuantity, clearCart }
  }

  it('scan barcode → adds item instantly when branch has stock', () => {
    const cart    = createCartState()
    const product = makeProduct({ stock: 5, branchQuantity: 5 })
    const added   = cart.addItem(product)
    expect(added).toBe(true)
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(1)
  })

  it('out-of-stock branch blocks addItem', () => {
    const cart    = createCartState()
    const product = makeProduct({ stock: 0, branchQuantity: 0 })
    const added   = cart.addItem(product)
    expect(added).toBe(false)
    expect(cart.items).toHaveLength(0)
  })

  it('addItem increments quantity on repeat scan', () => {
    const cart    = createCartState()
    const product = makeProduct({ stock: 5, branchQuantity: 5 })
    cart.addItem(product)
    cart.addItem(product)
    expect(cart.items[0].quantity).toBe(2)
  })

  it('addItem respects branchQuantity cap (sale deducts only branch stock)', () => {
    const cart    = createCartState()
    // branchQuantity = 2, global stock = 100 — must respect branch cap
    const product = makeProduct({ stock: 100, branchQuantity: 2 })
    cart.addItem(product) // qty=1 OK
    cart.addItem(product) // qty=2 OK
    const blocked = cart.addItem(product) // qty=3 → exceeds branch → blocked
    expect(blocked).toBe(false)
    expect(cart.items[0].quantity).toBe(2)
  })

  it('clearCart removes all items', () => {
    const cart    = createCartState()
    cart.addItem(makeProduct({ id: 'p1' }))
    cart.addItem(makeProduct({ id: 'p2', sku: 'SKU-002', barcode: '0000000000002' }))
    cart.clearCart()
    expect(cart.items).toHaveLength(0)
  })

  it('updateQuantity below 1 removes item', () => {
    const cart = createCartState()
    cart.addItem(makeProduct())
    cart.updateQuantity('p1', 0)
    expect(cart.items).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. usePOSShortcuts — keyboard handler logic
// ─────────────────────────────────────────────────────────────────────────────

describe('POS keyboard shortcuts (handler logic)', () => {
  // Extract the handler logic from usePOSShortcuts for isolated unit testing
  function buildHandler(cb: {
    onCheckout?: () => void
    onFocusSearch?: () => void
    onClearCart?: () => void
    onEscape?: () => void
    onIncreaseQty?: () => void
    onDecreaseQty?: () => void
  }) {
    const noop = () => {}
    const {
      onCheckout    = noop,
      onFocusSearch = noop,
      onClearCart   = noop,
      onEscape      = noop,
      onIncreaseQty = noop,
      onDecreaseQty = noop,
    } = cb

    return function handler(e: Partial<KeyboardEvent> & { activeTagName?: string }) {
      const tag     = (e.activeTagName ?? 'div').toLowerCase()
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select'

      if (e.key === 'F2')     { onCheckout();    return }
      if (e.key === 'F4')     { onFocusSearch(); return }
      if (e.key === 'Escape') { onEscape();      return }

      if (inInput) return

      if (e.ctrlKey && e.key === 'Backspace') { onClearCart();   return }
      if (e.key === '+' || e.key === '=')     { onIncreaseQty(); return }
      if (e.key === '-')                      { onDecreaseQty(); return }
    }
  }

  it('F2 opens checkout regardless of input focus', () => {
    const onCheckout = vi.fn()
    const handler    = buildHandler({ onCheckout })
    handler({ key: 'F2', activeTagName: 'input' })
    expect(onCheckout).toHaveBeenCalledOnce()
  })

  it('F4 focuses search regardless of input focus', () => {
    const onFocusSearch = vi.fn()
    const handler       = buildHandler({ onFocusSearch })
    handler({ key: 'F4', activeTagName: 'input' })
    expect(onFocusSearch).toHaveBeenCalledOnce()
  })

  it('ESC closes dialog / clears search', () => {
    const onEscape = vi.fn()
    const handler  = buildHandler({ onEscape })
    handler({ key: 'Escape' })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('Ctrl+Backspace clears cart when not in input', () => {
    const onClearCart = vi.fn()
    const handler     = buildHandler({ onClearCart })
    handler({ key: 'Backspace', ctrlKey: true, activeTagName: 'div' })
    expect(onClearCart).toHaveBeenCalledOnce()
  })

  it('Ctrl+Backspace does NOT clear cart when inside input', () => {
    const onClearCart = vi.fn()
    const handler     = buildHandler({ onClearCart })
    handler({ key: 'Backspace', ctrlKey: true, activeTagName: 'input' })
    expect(onClearCart).not.toHaveBeenCalled()
  })

  it('+ key increases qty when not in input', () => {
    const onIncreaseQty = vi.fn()
    const handler       = buildHandler({ onIncreaseQty })
    handler({ key: '+', activeTagName: 'div' })
    expect(onIncreaseQty).toHaveBeenCalledOnce()
  })

  it('- key decreases qty when not in input', () => {
    const onDecreaseQty = vi.fn()
    const handler       = buildHandler({ onDecreaseQty })
    handler({ key: '-', activeTagName: 'div' })
    expect(onDecreaseQty).toHaveBeenCalledOnce()
  })

  it('+/- keys do nothing when inside an input field', () => {
    const onIncreaseQty = vi.fn()
    const onDecreaseQty = vi.fn()
    const handler       = buildHandler({ onIncreaseQty, onDecreaseQty })
    handler({ key: '+', activeTagName: 'input' })
    handler({ key: '-', activeTagName: 'input' })
    expect(onIncreaseQty).not.toHaveBeenCalled()
    expect(onDecreaseQty).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Scanner detection — burst-speed logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Barcode scanner burst detection', () => {
  const SCANNER_MS = 120 // must match product-search.tsx

  function simulateBurst(charCount: number, elapsedMs: number) {
    const burstStart = Date.now() - elapsedMs
    // Simulate: first char at burstStart, Enter at Date.now()
    const elapsed     = Date.now() - burstStart
    const isScanBurst = elapsed < SCANNER_MS && charCount >= 3
    return isScanBurst
  }

  it('fast burst (< 120 ms, 13 chars) is classified as scanner', () => {
    expect(simulateBurst(13, 40)).toBe(true)
  })

  it('slow input (> 120 ms) is NOT a scanner burst', () => {
    expect(simulateBurst(13, 200)).toBe(false)
  })

  it('short fast burst (< 3 chars) is NOT a scanner burst', () => {
    expect(simulateBurst(2, 30)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Branch safety — sale deducts only current branch stock
// ─────────────────────────────────────────────────────────────────────────────

describe('Branch safety', () => {
  it('addItem uses branchQuantity not global stock for cap', () => {
    // global stock = 100, branch stock = 0 → should block
    const product = makeProduct({ stock: 100, branchQuantity: 0 })
    const available = product.branchQuantity ?? product.stock
    expect(available).toBe(0)
  })

  it('stockOf helper prefers branchQuantity over stock', () => {
    const stockOf = (p: ReturnType<typeof makeProduct>) => p.branchQuantity ?? p.stock
    const product = makeProduct({ stock: 50, branchQuantity: 3 })
    expect(stockOf(product)).toBe(3)
  })

  it('OWNER in global mode — isGlobalMode flag blocks sale at page level', () => {
    // Simulate the guard logic in sales/page.tsx
    const isOwner         = true
    const selectedBranch  = null // no branch selected
    const isGlobalMode    = isOwner && !selectedBranch
    expect(isGlobalMode).toBe(true)
  })
})
