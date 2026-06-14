import { describe, it, expect } from 'vitest'
import { getTenantExpiryState } from '@/lib/tenant-expiry'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

describe('getTenantExpiryState', () => {
  it('returns active when expiryDate is null', () => {
    const result = getTenantExpiryState(null)
    expect(result.state).toBe('active')
    expect(result.graceDaysRemaining).toBeNull()
  })

  it('returns active when expiryDate is undefined', () => {
    const result = getTenantExpiryState(undefined)
    expect(result.state).toBe('active')
    expect(result.graceDaysRemaining).toBeNull()
  })

  it('returns active when expiry is in the future', () => {
    const result = getTenantExpiryState(daysFromNow(15))
    expect(result.state).toBe('active')
    expect(result.graceDaysRemaining).toBeNull()
  })

  it('returns grace when expired within 7 days (3 days ago)', () => {
    const result = getTenantExpiryState(daysFromNow(-3))
    expect(result.state).toBe('grace')
    expect(result.graceDaysRemaining).toBeGreaterThan(0)
    expect(result.graceDaysRemaining).toBeLessThanOrEqual(7)
  })

  it('returns grace on the last day of grace period (6 days ago)', () => {
    const result = getTenantExpiryState(daysFromNow(-6))
    expect(result.state).toBe('grace')
    expect(result.graceDaysRemaining).toBeGreaterThanOrEqual(1)
  })

  it('returns expired when expired more than 7 days ago', () => {
    const result = getTenantExpiryState(daysFromNow(-10))
    expect(result.state).toBe('expired')
    expect(result.graceDaysRemaining).toBe(0)
  })

  it('returns expired when expired 30 days ago', () => {
    const result = getTenantExpiryState(daysFromNow(-30))
    expect(result.state).toBe('expired')
    expect(result.graceDaysRemaining).toBe(0)
  })
})
