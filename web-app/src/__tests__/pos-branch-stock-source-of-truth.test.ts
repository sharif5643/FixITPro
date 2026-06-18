/**
 * POS + Repair Parts — BranchStock Source-of-Truth Tests
 *
 * Verifies that POS and repair-parts picker NEVER use product.stock (shadow sum)
 * as a substitute for BranchStock.qty when making availability decisions.
 *
 * Key invariant: branchQuantity ?? 0 — strict fallback to 0, NOT product.stock.
 *
 * Mirrors:
 *   web-app/src/store/cart.store.ts              — addItem / updateQuantity
 *   web-app/src/components/pos/product-search.tsx — stockOf, handleCardClick
 *   web-app/src/components/pos/cart-panel.tsx     — stockOf (+ button disable)
 *   web-app/src/app/sunmi/sales/page.tsx          — ProductCard, CartRow, handlePickProduct
 *   web-app/src/components/repairs/repair-detail-dialog.tsx — parts picker stockQty
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Type mirrors
// ─────────────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  stock: number            // shadow sum = SUM(all BranchStock.quantity), may be stale
  branchQuantity?: number  // BranchStock.quantity for the current branch; undefined when no branch context
  price: string
}

interface CartItem {
  product: Product
  quantity: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Mirrored pure logic from source files
// ─────────────────────────────────────────────────────────────────────────────

/** cart.store.ts — addItem */
function cartAddItem(
  items: CartItem[],
  product: Product,
): { items: CartItem[]; added: boolean } {
  const available = product.branchQuantity ?? 0   // ← strict fallback
  const existing  = items.find((i) => i.product.id === product.id)
  if (existing) {
    const newQty = existing.quantity + 1
    if (newQty > available) return { items, added: false }
    return {
      items: items.map((i) => i.product.id === product.id ? { ...i, quantity: newQty } : i),
      added: true,
    }
  }
  if (available < 1) return { items, added: false }
  return { items: [...items, { product, quantity: 1 }], added: true }
}

/** cart.store.ts — updateQuantity */
function cartUpdateQuantity(
  items: CartItem[],
  productId: string,
  quantity: number,
): CartItem[] {
  if (quantity < 1) return items.filter((i) => i.product.id !== productId)
  const item = items.find((i) => i.product.id === productId)
  if (!item) return items
  const available = item.product.branchQuantity ?? 0   // ← strict fallback
  if (quantity > available) return items               // silently clamp
  return items.map((i) => i.product.id === productId ? { ...i, quantity } : i)
}

/** product-search.tsx — stockOf */
const stockOf = (p: Product) => p.branchQuantity ?? 0   // ← strict fallback

/** product-search.tsx — handleCardClick pre-check (qty check before addItem) */
function canAddToCart(
  product: Product,
  currentInCart: number,
): { allowed: boolean; reason?: string } {
  const qty = stockOf(product)
  if (qty === 0) return { allowed: false, reason: 'หมดสต็อก' }
  if (currentInCart >= qty) return { allowed: false, reason: `สต็อกไม่พอ คงเหลือ ${qty} ชิ้น` }
  return { allowed: true }
}

/** repair-detail-dialog.tsx — parts picker availability */
function repairPartAvailable(p: Product): { canUse: boolean; qty: number } {
  const stockQty = p.branchQuantity ?? 0   // ← strict fallback
  return { canUse: stockQty > 0, qty: stockQty }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: product.stock = 5 (other branches have stock), branchQuantity = 0
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario A — product.stock=5, branchQuantity=0 (current branch empty)', () => {
  const product: Product = {
    id: 'prod-1',
    stock: 5,           // shadow total across all branches
    branchQuantity: 0,  // this branch has none
    price: '100',
  }

  it('POS stockOf returns 0 (branch quantity), not 5 (shadow total)', () => {
    expect(stockOf(product)).toBe(0)
  })

  it('canAddToCart returns allowed=false', () => {
    expect(canAddToCart(product, 0).allowed).toBe(false)
  })

  it('canAddToCart reason is หมดสต็อก', () => {
    expect(canAddToCart(product, 0).reason).toMatch(/หมดสต็อก/)
  })

  it('cartAddItem is rejected (added=false, items unchanged)', () => {
    const { items, added } = cartAddItem([], product)
    expect(added).toBe(false)
    expect(items).toHaveLength(0)
  })

  it('repair part picker: canUse=false, qty=0', () => {
    const { canUse, qty } = repairPartAvailable(product)
    expect(canUse).toBe(false)
    expect(qty).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: product.stock = 5, branchQuantity = undefined (no branch context)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario B — product.stock=5, branchQuantity=undefined (no branch context)', () => {
  const product: Product = {
    id: 'prod-2',
    stock: 5,
    branchQuantity: undefined,  // API did not include branchId param → no branch stock returned
    price: '100',
  }

  it('stockOf returns 0 (NOT 5) because no branch context', () => {
    expect(stockOf(product)).toBe(0)
  })

  it('POS blocks add when branchQuantity is undefined', () => {
    expect(canAddToCart(product, 0).allowed).toBe(false)
  })

  it('cartAddItem is blocked when branchQuantity is undefined', () => {
    const { added } = cartAddItem([], product)
    expect(added).toBe(false)
  })

  it('repair part picker: blocked when branchQuantity is undefined', () => {
    expect(repairPartAvailable(product).canUse).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: product.stock = 5, branchQuantity = 1 (this branch has exactly 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario C — product.stock=5, branchQuantity=1 (exactly one unit available)', () => {
  const product: Product = {
    id: 'prod-3',
    stock: 5,
    branchQuantity: 1,
    price: '100',
  }

  it('stockOf returns 1 (branch qty)', () => {
    expect(stockOf(product)).toBe(1)
  })

  it('first add is allowed (cart=0, available=1)', () => {
    expect(canAddToCart(product, 0).allowed).toBe(true)
  })

  it('second add is blocked (cart=1, available=1)', () => {
    const result = canAddToCart(product, 1)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/สต็อกไม่พอ/)
  })

  it('cartAddItem: first add succeeds (qty=1 in cart)', () => {
    const { items, added } = cartAddItem([], product)
    expect(added).toBe(true)
    expect(items[0].quantity).toBe(1)
  })

  it('cartAddItem: second add fails (stock exhausted)', () => {
    const { items: after1 } = cartAddItem([], product)
    const { items: after2, added } = cartAddItem(after1, product)
    expect(added).toBe(false)
    expect(after2[0].quantity).toBe(1)  // unchanged
  })

  it('cartUpdateQuantity: set to 1 succeeds', () => {
    const start: CartItem[] = [{ product, quantity: 1 }]
    const result = cartUpdateQuantity(start, product.id, 1)
    expect(result[0].quantity).toBe(1)
  })

  it('cartUpdateQuantity: set to 2 is silently rejected (no overflow)', () => {
    const start: CartItem[] = [{ product, quantity: 1 }]
    const result = cartUpdateQuantity(start, product.id, 2)
    expect(result[0].quantity).toBe(1)  // unchanged — no overflow
  })

  it('repair part picker: canUse=true, qty=1', () => {
    const { canUse, qty } = repairPartAvailable(product)
    expect(canUse).toBe(true)
    expect(qty).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: product.stock=0, branchQuantity=3 (stock shadow drifted low)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario D — product.stock=0 (drifted), branchQuantity=3 (actual)', () => {
  const product: Product = {
    id: 'prod-4',
    stock: 0,          // drifted / stale shadow — should be ignored for decisions
    branchQuantity: 3, // BranchStock is the truth
    price: '100',
  }

  it('stockOf returns 3 (branchQuantity), not 0 (shadow)', () => {
    expect(stockOf(product)).toBe(3)
  })

  it('POS allows adding (branchQuantity=3, cart=0)', () => {
    expect(canAddToCart(product, 0).allowed).toBe(true)
  })

  it('cartAddItem succeeds even though product.stock=0', () => {
    const { added } = cartAddItem([], product)
    expect(added).toBe(true)
  })

  it('repair part picker: canUse=true', () => {
    expect(repairPartAvailable(product).canUse).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// cart-panel + button disable mirror
// ─────────────────────────────────────────────────────────────────────────────

describe('Cart panel + button disabled state', () => {
  /** Mirrors cart-panel.tsx: disabled={item.quantity >= stockOf(item)} */
  function isPlusDisabled(item: CartItem): boolean {
    const available = item.product.branchQuantity ?? 0
    return item.quantity >= available
  }

  it('branchQty=1, cart=1 → + disabled', () => {
    const item: CartItem = { product: { id: 'p1', stock: 10, branchQuantity: 1, price: '1' }, quantity: 1 }
    expect(isPlusDisabled(item)).toBe(true)
  })

  it('branchQty=1, cart=0 → + enabled', () => {
    const item: CartItem = { product: { id: 'p1', stock: 10, branchQuantity: 1, price: '1' }, quantity: 0 }
    expect(isPlusDisabled(item)).toBe(false)
  })

  it('branchQty=0, cart=0 → + disabled (never allow adding out-of-stock)', () => {
    const item: CartItem = { product: { id: 'p1', stock: 10, branchQuantity: 0, price: '1' }, quantity: 0 }
    expect(isPlusDisabled(item)).toBe(true)
  })

  it('branchQty=undefined (no context), cart=0 → + disabled (strict)', () => {
    const item: CartItem = { product: { id: 'p1', stock: 10, branchQuantity: undefined, price: '1' }, quantity: 0 }
    expect(isPlusDisabled(item)).toBe(true)
  })

  it('shadow stock=10 does NOT override branchQty=2 cap', () => {
    const item: CartItem = { product: { id: 'p1', stock: 10, branchQuantity: 2, price: '1' }, quantity: 2 }
    expect(isPlusDisabled(item)).toBe(true)  // capped at 2, not 10
  })
})
