import { describe, it, expect } from 'vitest'
import { effectiveLineDiscounts } from './line-discounts'

describe('effectiveLineDiscounts (SUNMI cart)', () => {
  const A = { product: { id: 'a', price: 100 }, quantity: 1 }
  const B = { product: { id: 'b', price: 500 }, quantity: 1 }

  it('a line removed with "-" no longer lowers the total (was: screen 480, bill 500, 20 change handed out)', () => {
    const typed = new Map([['a', 20]])
    expect(Array.from(effectiveLineDiscounts([A, B], typed).values()).reduce((s, d) => s + d, 0)).toBe(20)
    expect(Array.from(effectiveLineDiscounts([B], typed).values()).reduce((s, d) => s + d, 0)).toBe(0)
  })

  it('a discount is never more than its line (quantity lowered after typing it)', () => {
    const typed = new Map([['a', 250]])
    expect(effectiveLineDiscounts([{ ...A, quantity: 3 }], typed).get('a')).toBe(250)
    expect(effectiveLineDiscounts([{ ...A, quantity: 2 }], typed).get('a')).toBe(200)
  })
})
