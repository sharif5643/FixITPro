import { describe, it, expect } from 'vitest'
import { averageCost, billLoss, knownCost, lineLoss } from './below-cost'

describe('below cost', () => {
  it('ignores a cost that is unknown or zero', () => {
    expect(knownCost(undefined)).toBeNull()
    expect(knownCost('0')).toBeNull()
    expect(lineLoss({ unitNet: 50, quantity: 2 })).toBe(0)
    expect(billLoss([{ unitNet: 50, quantity: 1 }], 40)).toBe(0)
  })

  it('flags a line sold under its cost', () => {
    expect(lineLoss({ unitNet: 80, quantity: 2, costPrice: '100' })).toBe(40)
    expect(lineLoss({ unitNet: 120, quantity: 2, costPrice: 100 })).toBe(0)
  })

  it('counts the bill discount against the lines with a known cost', () => {
    // 2 lines of 100 each, cost 90 on the first only; bill discount 40 → first line pays 80
    expect(billLoss([
      { unitNet: 100, quantity: 1, costPrice: 90 },
      { unitNet: 100, quantity: 1 },
    ], 40)).toBe(10)
    expect(billLoss([{ unitNet: 100, quantity: 1, costPrice: 90 }], 5)).toBe(0)
  })

  it('averages a new buying price into the cost', () => {
    expect(averageCost(10, 600, 10, 700)).toBe(650)
    expect(averageCost(0, 600, 5, 700)).toBe(700)
    expect(averageCost(-2, 600, 5, 700)).toBe(700)
    expect(averageCost(3, 0, 2, 100)).toBe(100)
  })
})
