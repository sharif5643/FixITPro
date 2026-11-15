import { useMemo, useRef } from 'react'

/** A fresh key for one money action (one sale, one payment, one refund) */
export function newIntentKey(): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  return `ik_${Date.now().toString(36)}_${rnd}`.slice(0, 64)
}

/**
 * The same key for every attempt at one sale / payment / refund, until it succeeds. A second tap
 * after the answer was lost carries the same key, so the server records it once and gives the
 * first answer back (no second bill, no second payment). Call `renew()` once it succeeded.
 */
export function useIntentKey() {
  const ref = useRef<string>(newIntentKey())
  return useMemo(() => ({
    headers: () => ({ 'Idempotency-Key': ref.current }),
    renew:   () => { ref.current = newIntentKey() },
  }), [])
}
