import { describe, expect, it } from 'vitest'
import { closeDifference } from './open-shifts-admin'

describe('closeDifference', () => {
  it('is counted minus what the drawer should hold, to the satang', () => {
    expect(closeDifference(1500, 1500)).toBe(0)
    expect(closeDifference(1450, 1500)).toBe(-50)
    expect(closeDifference(1500.1, 1500)).toBe(0.1)
  })
  it('is 0 when the person closing may not see the expected amount', () => {
    expect(closeDifference(800, null)).toBe(0)
  })
})
