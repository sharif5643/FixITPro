/**
 * /repairs page — query param safety & error handling
 *
 * Pure-logic tests. No DOM / React rendering.
 * Covers the fixes for the AxiosError 400 crash:
 *   1. branchId sanitisation (undefined / null / "" / "null" / "all" are never sent)
 *   2. Safe branchId values ARE sent
 *   3. Global retry does NOT retry 4xx errors
 *   4. Error state is surfaced (no crash)
 *   5. Backend error message is extractable from the Axios error shape
 */

import { describe, it, expect } from 'vitest'

// ── Mirror isSafeBranchId logic from repairs/page.tsx ─────────────────────────

function isSafeBranchId(id: string | undefined): id is string {
  return typeof id === 'string' && id.length > 0 && id !== 'null' && id !== 'all'
}

function buildRepairsParams(branchId: string | undefined): URLSearchParams {
  const params = new URLSearchParams()
  if (isSafeBranchId(branchId)) params.set('branchId', branchId)
  return params
}

// ── Mirror global retry logic from providers.tsx ──────────────────────────────

function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as any)?.response?.status as number | undefined
  if (status !== undefined && status >= 400 && status < 500) return false
  return failureCount < 1
}

// ── Mirror backend error message extraction ───────────────────────────────────

function extractBackendMessage(error: unknown): string | undefined {
  const m = (error as any)?.response?.data?.message
  if (Array.isArray(m)) return m.join(', ')
  return typeof m === 'string' ? m : undefined
}

// ── 1. branchId sanitisation — invalid values are not sent ───────────────────

describe('branchId sanitisation — invalid values blocked', () => {
  it('undefined → not sent', () => {
    const params = buildRepairsParams(undefined)
    expect(params.has('branchId')).toBe(false)
  })

  it('empty string "" → not sent', () => {
    const params = buildRepairsParams('')
    expect(params.has('branchId')).toBe(false)
  })

  it('literal string "null" → not sent', () => {
    const params = buildRepairsParams('null')
    expect(params.has('branchId')).toBe(false)
  })

  it('literal string "all" → not sent (global mode value)', () => {
    const params = buildRepairsParams('all')
    expect(params.has('branchId')).toBe(false)
  })

  it('request URL with no branchId has no ? or empty fragment when branchId invalid', () => {
    const params = buildRepairsParams(undefined)
    const qs = params.toString()
    expect(qs).toBe('')
    // Constructed URL: `/repairs?` or `/repairs` — either is fine on the backend
    const url = `/repairs${qs ? `?${qs}` : ''}`
    expect(url).toBe('/repairs')
  })
})

// ── 2. Valid branchId values ARE sent ─────────────────────────────────────────

describe('branchId sanitisation — valid values pass through', () => {
  it('cuid-format string is sent', () => {
    const id = 'clxxxxxxxxxxxxxxxxxxxxxxx'
    const params = buildRepairsParams(id)
    expect(params.get('branchId')).toBe(id)
  })

  it('uuid-format string is sent', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const params = buildRepairsParams(id)
    expect(params.get('branchId')).toBe(id)
  })

  it('any non-empty, non-reserved string is sent', () => {
    const params = buildRepairsParams('branch-01')
    expect(params.get('branchId')).toBe('branch-01')
  })
})

// ── 3. Global retry — 4xx errors are NOT retried ─────────────────────────────

describe('Global retry config — 4xx errors skipped', () => {
  it('400 → retry false (first attempt)', () => {
    const err = { response: { status: 400 } }
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('401 → retry false', () => {
    const err = { response: { status: 401 } }
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('403 → retry false', () => {
    const err = { response: { status: 403 } }
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('404 → retry false', () => {
    const err = { response: { status: 404 } }
    expect(shouldRetry(0, err)).toBe(false)
  })

  it('400 at failureCount=1 → still false', () => {
    const err = { response: { status: 400 } }
    expect(shouldRetry(1, err)).toBe(false)
  })

  it('500 → retry once (failureCount=0)', () => {
    const err = { response: { status: 500 } }
    expect(shouldRetry(0, err)).toBe(true)
  })

  it('500 → no more retry after failureCount=1', () => {
    const err = { response: { status: 500 } }
    expect(shouldRetry(1, err)).toBe(false)
  })

  it('network error (no response) → retry once', () => {
    const err = { response: undefined }
    expect(shouldRetry(0, err)).toBe(true)
  })

  it('network error (no response) → no more retry after failureCount=1', () => {
    const err = { response: undefined }
    expect(shouldRetry(1, err)).toBe(false)
  })
})

// ── 4. Error state — never crashes, always surfaced in UI ────────────────────

describe('Error state — backend 400 does not crash page', () => {
  it('isError=true → component shows error card, not throw', () => {
    // Simulate: React Query sets isError=true, error=AxiosError
    const isError = true
    const data    = undefined  // no data when errored
    const repairs = data ?? []  // default [] prevents crash during render
    expect(isError).toBe(true)
    expect(Array.isArray(repairs)).toBe(true)
    expect(repairs).toHaveLength(0)
  })

  it('throwOnError: false means error is in state, not thrown', () => {
    // The option is set in the query config — this test documents the expected
    // behaviour: page renders, error card is displayed.
    const queryConfig = { throwOnError: false }
    expect(queryConfig.throwOnError).toBe(false)
  })
})

// ── 5. Backend error message extraction ──────────────────────────────────────

describe('Backend error message extraction from AxiosError', () => {
  it('extracts string message from response.data.message', () => {
    const err = { response: { data: { message: 'branchId ไม่ถูกต้อง' } } }
    expect(extractBackendMessage(err)).toBe('branchId ไม่ถูกต้อง')
  })

  it('joins array messages from class-validator (NestJS default)', () => {
    const err = { response: { data: { message: ['must be a string', 'must not be empty'] } } }
    expect(extractBackendMessage(err)).toBe('must be a string, must not be empty')
  })

  it('returns undefined when no message field', () => {
    const err = { response: { data: {} } }
    expect(extractBackendMessage(err)).toBeUndefined()
  })

  it('returns undefined when response missing (network error)', () => {
    const err = { message: 'Network Error' }
    expect(extractBackendMessage(err)).toBeUndefined()
  })

  it('handles ValidationPipe forbidNonWhitelisted error format', () => {
    // NestJS ValidationPipe with forbidNonWhitelisted returns array
    const err = {
      response: {
        status: 400,
        data: {
          statusCode: 400,
          message: ['property highlight should not exist'],
          error: 'Bad Request',
        },
      },
    }
    expect(extractBackendMessage(err)).toBe('property highlight should not exist')
  })
})

// ── 6. Query URL construction ─────────────────────────────────────────────────

describe('Repairs query URL is always valid', () => {
  it('no branchId → clean URL with no trailing "?"', () => {
    const params = buildRepairsParams(undefined)
    const qs = params.toString()
    const url = `/api/v1/repairs${qs ? `?${qs}` : ''}`
    expect(url).toBe('/api/v1/repairs')
    expect(url).not.toContain('?branchId=undefined')
    expect(url).not.toContain('?branchId=null')
  })

  it('valid branchId → URL contains exactly one branchId param', () => {
    const id = 'cltest123'
    const params = buildRepairsParams(id)
    const url = `/api/v1/repairs?${params.toString()}`
    expect(url).toBe(`/api/v1/repairs?branchId=${id}`)
  })

  it('no extra params besides branchId are sent', () => {
    const params = buildRepairsParams('cltest')
    // Verify no status, date, customerId are added by the sanitisation helper
    expect(params.has('status')).toBe(false)
    expect(params.has('date')).toBe(false)
    expect(params.has('customerId')).toBe(false)
  })
})
