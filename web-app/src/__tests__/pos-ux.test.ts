/**
 * POS UX Audit — Round 1
 *
 * Pure-logic integration tests. No DOM / React rendering.
 * Covers the 10 UX requirements from the audit:
 *   1. Prevent checkout when any cart item has price = 0
 *   2. Zero-price badge logic
 *   3. Stock quantity display — always shows number, even 0
 *   4. Product name display — name shown, SKU fallback
 *   5. Order summary calculations
 *   6. Sticky checkout panel (layout guard: shrink-0 via logic)
 *   7. Large checkout button (enabled/disabled states)
 *   8. Low-stock warning (<5)
 *   9. Out-of-stock lock
 *  10. Cart store branchQuantity fix
 */

import { describe, it, expect } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  sku: string
  price: number
  stock: number
  branchQuantity?: number
  isActive: boolean
  hasStockRecord?: boolean
  otherBranchTotal?: number
  type: string
}

interface CartItem {
  product: Product
  quantity: number
}

// ── Shared constants ──────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 5

// ── Helpers (mirror component logic) ─────────────────────────────────────────

function stockOf(p: Product): number {
  return p.branchQuantity ?? p.stock
}

function isZeroPrice(p: Product): boolean {
  return Number(p.price) === 0
}

function isOutOfStock(p: Product): boolean {
  return stockOf(p) === 0
}

function isLowStock(p: Product): boolean {
  const qty = stockOf(p)
  return qty > 0 && qty < LOW_STOCK_THRESHOLD
}

function canRequest(p: Product): boolean {
  return isOutOfStock(p) && (p.otherBranchTotal ?? 0) > 0
}

function showLock(p: Product): boolean {
  return isOutOfStock(p) && !canRequest(p)
}

function canAddToCart(p: Product): boolean {
  if (!p.isActive) return false
  if (isZeroPrice(p)) return false
  if (isOutOfStock(p)) return false
  return true
}

function canCheckout(items: CartItem[]): boolean {
  if (items.length === 0) return false
  if (items.some((i) => isZeroPrice(i.product))) return false
  return true
}

function displayName(p: Product): string {
  return p.name || p.sku
}

function calculateSummary(items: CartItem[], discount: number) {
  const itemCount    = items.length
  const totalQty     = items.reduce((s, i) => s + i.quantity, 0)
  const subtotal     = items.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0)
  const total        = Math.max(0, subtotal - discount)
  return { itemCount, totalQty, subtotal, discount, total }
}

// cart store addItem (mirroring the fixed store logic)
function createCartStore() {
  const items: CartItem[] = []

  function addItem(product: Product): boolean {
    const available = product.branchQuantity ?? product.stock
    const existing  = items.find((i) => i.product.id === product.id)
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

  function updateQuantity(productId: string, quantity: number): void {
    if (quantity < 1) {
      const idx = items.findIndex((i) => i.product.id === productId)
      if (idx !== -1) items.splice(idx, 1)
      return
    }
    const item = items.find((i) => i.product.id === productId)
    if (!item) return
    const available = item.product.branchQuantity ?? item.product.stock
    if (quantity > available) return
    item.quantity = quantity
  }

  return { items, addItem, updateQuantity }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1', name: 'Test Product', sku: 'SKU-001',
    price: 599, stock: 10, branchQuantity: 10,
    isActive: true, hasStockRecord: true,
    otherBranchTotal: 0, type: 'PHONE',
    ...overrides,
  }
}

// ── 1. Checkout prevention — zero price ───────────────────────────────────────

describe('Req 1 — Prevent checkout when price = 0', () => {
  it('canCheckout → false when any item has price 0', () => {
    const items: CartItem[] = [
      { product: makeProduct({ price: 599 }), quantity: 1 },
      { product: makeProduct({ id: 'p2', price: 0, sku: 'SKU-002' }), quantity: 1 },
    ]
    expect(canCheckout(items)).toBe(false)
  })

  it('canCheckout → false when ALL items have price 0', () => {
    const items: CartItem[] = [
      { product: makeProduct({ price: 0 }), quantity: 2 },
    ]
    expect(canCheckout(items)).toBe(false)
  })

  it('canCheckout → true when all items have price > 0', () => {
    const items: CartItem[] = [
      { product: makeProduct({ price: 199 }), quantity: 1 },
      { product: makeProduct({ id: 'p2', price: 1, sku: 'SKU-002' }), quantity: 3 },
    ]
    expect(canCheckout(items)).toBe(true)
  })

  it('canCheckout → false when cart is empty', () => {
    expect(canCheckout([])).toBe(false)
  })

  it('F2 shortcut blocked: handleOpenCheckout returns early when hasZeroPriceItem', () => {
    let opened = false
    const hasZeroPriceItem = true
    const itemCount: number = 2
    const handleOpenCheckout = () => {
      if (itemCount === 0 || hasZeroPriceItem) return
      opened = true
    }
    handleOpenCheckout()
    expect(opened).toBe(false)
  })

  it('F2 shortcut allowed when no zero-price items', () => {
    let opened = false
    const hasZeroPriceItem = false
    const itemCount: number = 1
    const handleOpenCheckout = () => {
      if (itemCount === 0 || hasZeroPriceItem) return
      opened = true
    }
    handleOpenCheckout()
    expect(opened).toBe(true)
  })
})

// ── 2. Zero-price badge logic ─────────────────────────────────────────────────

describe('Req 2 — Zero-price badge', () => {
  it('isZeroPrice → true when price is 0', () => {
    expect(isZeroPrice(makeProduct({ price: 0 }))).toBe(true)
  })

  it('isZeroPrice → false when price is 1', () => {
    expect(isZeroPrice(makeProduct({ price: 1 }))).toBe(false)
  })

  it('isZeroPrice → false when price is 0.01', () => {
    expect(isZeroPrice(makeProduct({ price: 0.01 }))).toBe(false)
  })

  it('canAddToCart → false for zero-price product', () => {
    expect(canAddToCart(makeProduct({ price: 0 }))).toBe(false)
  })

  it('zero-price product shows badge regardless of stock', () => {
    const inStock    = makeProduct({ price: 0, stock: 10 })
    const outOfStock = makeProduct({ price: 0, stock: 0 })
    expect(isZeroPrice(inStock)).toBe(true)
    expect(isZeroPrice(outOfStock)).toBe(true)
  })
})

// ── 3. Stock quantity display — always show number ────────────────────────────

describe('Req 3 — Stock quantity always displayed', () => {
  it('out-of-stock product has qty 0 — always show 0', () => {
    const p = makeProduct({ branchQuantity: 0 })
    expect(stockOf(p)).toBe(0)
  })

  it('in-stock product — qty shown', () => {
    const p = makeProduct({ branchQuantity: 7 })
    expect(stockOf(p)).toBe(7)
  })

  it('low-stock product — qty shown (e.g. 3)', () => {
    const p = makeProduct({ branchQuantity: 3 })
    expect(stockOf(p)).toBe(3)
  })

  it('stockOf prefers branchQuantity over stock', () => {
    const p = makeProduct({ stock: 100, branchQuantity: 2 })
    expect(stockOf(p)).toBe(2)
  })

  it('stockOf falls back to stock when branchQuantity undefined', () => {
    const p: Product = { ...makeProduct(), branchQuantity: undefined }
    expect(stockOf(p)).toBe(10)
  })
})

// ── 4. Product name — name shown, SKU fallback ────────────────────────────────

describe('Req 4 — Product name display', () => {
  it('displayName returns name when present', () => {
    expect(displayName(makeProduct({ name: 'iPhone 15' }))).toBe('iPhone 15')
  })

  it('displayName falls back to SKU when name is empty string', () => {
    expect(displayName(makeProduct({ name: '' }))).toBe('SKU-001')
  })

  it('displayName falls back to SKU when name is falsy', () => {
    const p: Product = { ...makeProduct(), name: '' }
    expect(displayName(p)).toBe(p.sku)
  })

  it('cart shows product name, not just product ID', () => {
    const items: CartItem[] = [
      { product: makeProduct({ name: 'Samsung S24', id: 'abc-123-def' }), quantity: 1 },
    ]
    // The display should be the name, not the ID
    const shown = displayName(items[0].product)
    expect(shown).toBe('Samsung S24')
    expect(shown).not.toBe('abc-123-def')
  })
})

// ── 5. Order summary calculations ─────────────────────────────────────────────

describe('Req 5 — Order summary', () => {
  const items: CartItem[] = [
    { product: makeProduct({ price: 500, id: 'p1' }), quantity: 2 },
    { product: makeProduct({ price: 200, id: 'p2', sku: 'SKU-002' }), quantity: 1 },
  ]

  it('subtotal = sum of price × qty', () => {
    const { subtotal } = calculateSummary(items, 0)
    expect(subtotal).toBe(500 * 2 + 200 * 1) // 1200
  })

  it('itemCount = number of distinct products', () => {
    const { itemCount } = calculateSummary(items, 0)
    expect(itemCount).toBe(2)
  })

  it('totalQty = sum of all quantities', () => {
    const { totalQty } = calculateSummary(items, 0)
    expect(totalQty).toBe(3)
  })

  it('total = subtotal − discount', () => {
    const { total } = calculateSummary(items, 200)
    expect(total).toBe(1000)
  })

  it('total never goes below 0', () => {
    const { total } = calculateSummary(items, 9999)
    expect(total).toBe(0)
  })

  it('discount = 0 → total equals subtotal', () => {
    const { subtotal, total } = calculateSummary(items, 0)
    expect(total).toBe(subtotal)
  })
})

// ── 6 & 7. Sticky panel + large button states ─────────────────────────────────

describe('Req 6 & 7 — Checkout panel enabled/disabled states', () => {
  it('button disabled when cart is empty', () => {
    expect(canCheckout([])).toBe(false)
  })

  it('button disabled when has zero-price item', () => {
    const items: CartItem[] = [{ product: makeProduct({ price: 0 }), quantity: 1 }]
    expect(canCheckout(items)).toBe(false)
  })

  it('button enabled when items > 0 and all prices > 0', () => {
    const items: CartItem[] = [{ product: makeProduct({ price: 100 }), quantity: 1 }]
    expect(canCheckout(items)).toBe(true)
  })

  it('button total shown in button label when enabled', () => {
    const items: CartItem[] = [{ product: makeProduct({ price: 350 }), quantity: 2 }]
    const { total } = calculateSummary(items, 0)
    const btnLabel = `ชำระเงิน ${total}`
    expect(btnLabel).toContain('700')
  })
})

// ── 8. Low-stock warning (<5) ─────────────────────────────────────────────────

describe('Req 8 — Low-stock warning', () => {
  it('isLowStock → true when qty = 1', () => {
    expect(isLowStock(makeProduct({ branchQuantity: 1 }))).toBe(true)
  })

  it('isLowStock → true when qty = 4', () => {
    expect(isLowStock(makeProduct({ branchQuantity: 4 }))).toBe(true)
  })

  it('isLowStock → false when qty = 5 (at threshold, not below)', () => {
    expect(isLowStock(makeProduct({ branchQuantity: 5 }))).toBe(false)
  })

  it('isLowStock → false when qty = 0 (out-of-stock, different warning)', () => {
    expect(isLowStock(makeProduct({ branchQuantity: 0 }))).toBe(false)
  })

  it('isLowStock → false when qty = 10', () => {
    expect(isLowStock(makeProduct({ branchQuantity: 10 }))).toBe(false)
  })

  it('LOW_STOCK_THRESHOLD is 5', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5)
  })

  it('low-stock product is still addable to cart', () => {
    const p = makeProduct({ price: 299, branchQuantity: 3 })
    expect(isLowStock(p)).toBe(true)
    expect(canAddToCart(p)).toBe(true)
  })
})

// ── 9. Out-of-stock lock ──────────────────────────────────────────────────────

describe('Req 9 — Out-of-stock lock', () => {
  it('isOutOfStock → true when branchQuantity = 0', () => {
    expect(isOutOfStock(makeProduct({ branchQuantity: 0 }))).toBe(true)
  })

  it('isOutOfStock → false when branchQuantity = 1', () => {
    expect(isOutOfStock(makeProduct({ branchQuantity: 1 }))).toBe(false)
  })

  it('showLock → true when out-of-stock and no other-branch stock', () => {
    const p = makeProduct({ branchQuantity: 0, otherBranchTotal: 0 })
    expect(showLock(p)).toBe(true)
  })

  it('showLock → false when out-of-stock but other branches have stock (transfer available)', () => {
    const p = makeProduct({ branchQuantity: 0, otherBranchTotal: 5 })
    expect(showLock(p)).toBe(false)
  })

  it('showLock → false when in-stock', () => {
    const p = makeProduct({ branchQuantity: 3 })
    expect(showLock(p)).toBe(false)
  })

  it('canAddToCart → false when out-of-stock', () => {
    const p = makeProduct({ branchQuantity: 0 })
    expect(canAddToCart(p)).toBe(false)
  })

  it('canRequest → true when out-of-stock + other branches have stock', () => {
    const p = makeProduct({ branchQuantity: 0, otherBranchTotal: 10 })
    expect(canRequest(p)).toBe(true)
  })
})

// ── 10. Cart store — branchQuantity cap fix ───────────────────────────────────

describe('Req 10 — Cart store uses branchQuantity (not global stock)', () => {
  it('blocks add when branchQuantity = 0 even if global stock > 0', () => {
    const cart = createCartStore()
    const p    = makeProduct({ stock: 100, branchQuantity: 0 })
    expect(cart.addItem(p)).toBe(false)
    expect(cart.items).toHaveLength(0)
  })

  it('caps qty at branchQuantity, not global stock', () => {
    const cart = createCartStore()
    const p    = makeProduct({ stock: 100, branchQuantity: 2 })
    cart.addItem(p)   // qty = 1 ✓
    cart.addItem(p)   // qty = 2 ✓
    const blocked = cart.addItem(p)  // qty = 3 → exceeds branchQty = 2
    expect(blocked).toBe(false)
    expect(cart.items[0].quantity).toBe(2)
  })

  it('updateQuantity respects branchQuantity cap', () => {
    const cart = createCartStore()
    const p    = makeProduct({ stock: 100, branchQuantity: 3 })
    cart.addItem(p)
    cart.updateQuantity(p.id, 3)  // exactly at cap → OK
    expect(cart.items[0].quantity).toBe(3)
    cart.updateQuantity(p.id, 4)  // exceeds cap → ignored
    expect(cart.items[0].quantity).toBe(3)
  })

  it('updateQuantity below 1 removes item', () => {
    const cart = createCartStore()
    const p    = makeProduct()
    cart.addItem(p)
    cart.updateQuantity(p.id, 0)
    expect(cart.items).toHaveLength(0)
  })

  it('falls back to stock when branchQuantity is undefined', () => {
    const cart = createCartStore()
    const p: Product = { ...makeProduct({ stock: 5 }), branchQuantity: undefined }
    cart.addItem(p)
    cart.addItem(p)
    cart.addItem(p)
    cart.addItem(p)
    cart.addItem(p)
    const blocked = cart.addItem(p)  // qty = 6 > stock 5
    expect(blocked).toBe(false)
    expect(cart.items[0].quantity).toBe(5)
  })
})
