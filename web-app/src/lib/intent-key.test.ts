import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { newIntentKey, useIntentKey } from './intent-key'

describe('intent key (one money action = one key)', () => {
  it('keys are accepted by the server (8–100 of A-Z a-z 0-9 _ . : -) and never repeat', () => {
    const keys = Array.from({ length: 200 }, newIntentKey)
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_.:-]{8,100}$/)
    expect(new Set(keys).size).toBe(200)
  })

  it('a second tap sends the same key; after success the next sale gets a new one', () => {
    const { result } = renderHook(() => useIntentKey())
    const first = result.current.headers()['Idempotency-Key']
    expect(result.current.headers()['Idempotency-Key']).toBe(first)   // tapped again after an error
    result.current.renew()                                              // it went through
    expect(result.current.headers()['Idempotency-Key']).not.toBe(first)
  })
})
