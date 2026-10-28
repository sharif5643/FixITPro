import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backFromAway, isUnlocked, lockApplies, lockFreePath, markAway, markUnlocked, RELOCK_AFTER_MS } from './app-lock'

describe('staff app lock timing', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('locked until unlocked, and only for the account that unlocked', () => {
    expect(isUnlocked('u1')).toBe(false)
    markUnlocked('u1')
    expect(isUnlocked('u1')).toBe(true)
    expect(isUnlocked('u2')).toBe(false)
  })

  it('a short trip away keeps it open; 5 minutes or more locks it again', () => {
    markUnlocked('u1')
    markAway()
    vi.advanceTimersByTime(RELOCK_AFTER_MS - 1000)
    expect(backFromAway('u1')).toBe(true)
    markAway()
    vi.advanceTimersByTime(RELOCK_AFTER_MS)
    expect(backFromAway('u1')).toBe(false)
    expect(isUnlocked('u1')).toBe(false)
  })

  it('sign-in pages are never locked; app pages are', () => {
    expect(lockFreePath('/staff/login')).toBe(true)
    expect(lockFreePath('/staff/splash')).toBe(true)
    expect(lockFreePath('/staff/home')).toBe(false)
    expect(lockFreePath('/staff/repairs/abc')).toBe(false)
  })

  it('applies in a browser only when turned on', async () => {
    expect(await lockApplies()).toBe(false)
    localStorage.setItem('fx-app-lock', 'on')
    expect(await lockApplies()).toBe(true)
  })
})
