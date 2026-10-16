import { describe, expect, it } from 'vitest'
import { LONG_SHIFT_HOURS, shiftHours } from './long-shift-banner'

describe('shiftHours', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  it('counts whole hours since the shift opened', () => {
    expect(shiftHours('2026-10-16T02:30:00Z', now)).toBe(9)
    expect(shiftHours('2026-10-15T12:00:00Z', now)).toBe(24)
  })
  it('is 0 without a shift', () => {
    expect(shiftHours(null, now)).toBe(0)
  })
  it('a night shift (19:00 → 06:00) is under the reminder; one left open to the next evening is over', () => {
    expect(shiftHours('2026-10-16T01:00:00Z', now)).toBeLessThan(LONG_SHIFT_HOURS)
    expect(shiftHours('2026-10-15T19:00:00Z', now)).toBeGreaterThanOrEqual(LONG_SHIFT_HOURS)
  })
})
