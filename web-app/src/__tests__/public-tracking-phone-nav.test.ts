/**
 * public-tracking-phone-nav.test.ts
 * Verifies P1-5: phone query param is preserved when navigating from phone
 * search results to the repair detail page (/track/[ticketNumber]).
 *
 * Pure logic tests — mirrors the functions in track/page.tsx exactly.
 */

import { describe, it, expect } from 'vitest'

// ── Types ──────────────────────────────────────────────────────────────────────

type InputType = 'ticket' | 'phone' | 'unknown'

// ── Functions mirrored from track/page.tsx (kept in sync) ─────────────────────

function detectType(value: string): InputType {
  const v = value.trim().replace(/\s/g, '')
  if (!v) return 'unknown'
  if (/[A-Za-z]/.test(v) || v.includes('-')) return 'ticket'
  if (/^\d+$/.test(v)) return 'phone'
  return 'unknown'
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-]/g, '')
}

function buildDetailUrl(ticketNumber: string, rawQuery: string, inputType: InputType): string {
  const base = `/track/${encodeURIComponent(ticketNumber)}`
  if (inputType === 'phone') {
    return `${base}?phone=${encodeURIComponent(normalizePhone(rawQuery))}`
  }
  return base
}

// ── detectType ─────────────────────────────────────────────────────────────────

describe('detectType — input classification', () => {
  it('detects ticket from REP- prefix', () => {
    expect(detectType('REP-20240101-A1B2')).toBe('ticket')
  })

  it('detects ticket when input contains letters', () => {
    expect(detectType('ABC123')).toBe('ticket')
  })

  it('detects phone from all-digit input', () => {
    expect(detectType('0812345678')).toBe('phone')
  })

  it('detects phone when input has spaces (stripped before check)', () => {
    expect(detectType('081 234 5678')).toBe('phone')
  })

  it('returns unknown for empty input', () => {
    expect(detectType('')).toBe('unknown')
  })

  it('returns unknown for whitespace-only input', () => {
    expect(detectType('   ')).toBe('unknown')
  })
})

// ── normalizePhone ─────────────────────────────────────────────────────────────

describe('normalizePhone — strip formatting before URL encoding', () => {
  it('strips spaces from phone', () => {
    expect(normalizePhone('081 234 5678')).toBe('0812345678')
  })

  it('strips dashes from phone', () => {
    expect(normalizePhone('081-234-5678')).toBe('0812345678')
  })

  it('strips mixed spaces and dashes', () => {
    expect(normalizePhone('081 - 234 - 5678')).toBe('0812345678')
  })

  it('trims leading/trailing whitespace', () => {
    expect(normalizePhone('  0812345678  ')).toBe('0812345678')
  })

  it('leaves plain digits unchanged', () => {
    expect(normalizePhone('0812345678')).toBe('0812345678')
  })
})

// ── buildDetailUrl — navigation URL construction ───────────────────────────────

describe('buildDetailUrl — phone search result navigation (P1-5)', () => {
  it('includes ?phone= when inputType is phone', () => {
    const url = buildDetailUrl('REP-001', '0812345678', 'phone')
    expect(url).toBe('/track/REP-001?phone=0812345678')
  })

  it('normalizes phone with dashes before encoding', () => {
    const url = buildDetailUrl('REP-001', '081-234-5678', 'phone')
    expect(url).toBe('/track/REP-001?phone=0812345678')
  })

  it('normalizes phone with spaces before encoding', () => {
    const url = buildDetailUrl('REP-001', '081 234 5678', 'phone')
    expect(url).toBe('/track/REP-001?phone=0812345678')
  })

  it('does NOT include ?phone= when inputType is ticket', () => {
    const url = buildDetailUrl('REP-001', '', 'ticket')
    expect(url).toBe('/track/REP-001')
    expect(url).not.toContain('phone')
  })

  it('does NOT include ?phone= when inputType is unknown', () => {
    const url = buildDetailUrl('REP-001', '', 'unknown')
    expect(url).toBe('/track/REP-001')
    expect(url).not.toContain('phone')
  })

  it('encodes ticketNumber with encodeURIComponent', () => {
    const ticket = 'REP-20240101-A1B2'
    const url = buildDetailUrl(ticket, '0812345678', 'phone')
    expect(url).toContain(encodeURIComponent(ticket))
  })

  it('phone param in URL is readable by URLSearchParams (round-trip)', () => {
    const url = buildDetailUrl('REP-001', '081 234 5678', 'phone')
    const qs = new URLSearchParams(url.split('?')[1])
    expect(qs.get('phone')).toBe('0812345678')
  })

  it('direct ticket search navigation does not leak phone param', () => {
    // When user types a ticket number (not phone), navigates directly
    // — no phone should ever appear in the URL
    const url = buildDetailUrl('REP-20240101-ABCD', 'REP-20240101-ABCD', 'ticket')
    expect(url).not.toContain('phone')
  })
})
