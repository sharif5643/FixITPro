import { describe, expect, it } from 'vitest'
import { intakeEstimateIfChanged, quoteSplit, repairPrice, repairQuote } from './repair-price'

describe('repair price', () => {
  // Taken in at 1,500 (labour 1,000 + parts 500), re-quoted at 2,300 after diagnosis
  const requoted = { estimateCost: '1500', estimatedTotal: '2300', estimatedLaborCost: '1000', estimatedPartsCost: '500', finalCost: null }

  it('shows and charges the latest quote, not the intake estimate', () => {
    expect(repairQuote(requoted)).toBe(2300)
    expect(repairPrice(requoted)).toBe(2300)
    expect(repairPrice({ ...requoted, finalCost: '2000' })).toBe(2000)
    expect(repairQuote({ estimateCost: 800 })).toBe(800)
    expect(repairQuote({})).toBe(0)
  })

  it('names the intake estimate only when the price has changed since', () => {
    expect(intakeEstimateIfChanged(requoted)).toBe(1500)
    expect(intakeEstimateIfChanged({ estimateCost: 1500, estimatedTotal: 1500 })).toBeNull()
    expect(intakeEstimateIfChanged({ estimatedTotal: 900 })).toBeNull()
  })

  it('drops the labour / parts split once it no longer adds up to the price', () => {
    expect(quoteSplit(requoted)).toBeNull()
    expect(quoteSplit({ ...requoted, estimatedTotal: '1500' })).toEqual({ labor: 1000, parts: 500 })
    expect(quoteSplit({ estimatedTotal: 500 })).toBeNull()
  })
})
