/**
 * QuotationPanel frontend tests (Phase 4C.5)
 *
 * QPANEL-01: renders propose button for Shop B when transfer is DEVICE_RECEIVED and no active quotation
 * QPANEL-02: Shop A does NOT see propose button (only Shop B can propose)
 * QPANEL-03: third party sees nothing
 * QPANEL-04: propose form appears after clicking propose
 * QPANEL-05: propose form validates amount > 0
 * QPANEL-06: active quotation card shows amount and status label
 * QPANEL-07: accept/counter/reject buttons shown for responder only
 * QPANEL-08: proposer does NOT see accept/counter/reject buttons for their own quotation
 * QPANEL-09: accepted price banner shown when a quotation is ACCEPTED
 * QPANEL-10: no customer-identifying data in rendered output
 * QPANEL-11: QUOTATION_STATUS_LABEL covers all 6 statuses
 * QPANEL-12: isQuotationTerminal — ACCEPTED/REJECTED/EXPIRED/CANCELLED are terminal; PENDING/COUNTER_OFFER are not
 * QPANEL-13: no accounting-related exports in partner-repair-quotations lib
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery:       vi.fn(),
    useMutation:    vi.fn(),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  }
})

vi.mock('@/store/auth.store', () => ({ useAuthStore: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import { QuotationPanel } from '@/components/partner-repair/QuotationPanel'
import {
  QUOTATION_STATUS_LABEL,
  QUOTATION_TERMINAL_STATUSES,
  isQuotationTerminal,
  type QuotationStatus,
} from '@/lib/partner-repair-quotations'

// ── Helpers ───────────────────────────────────────────────────────────────────

const OWNER_TENANT   = 'tenant-a'
const PARTNER_TENANT = 'tenant-b'
const THIRD_TENANT   = 'tenant-c'
const TRANSFER_ID    = 'transfer-001'

const BASE_PROPS = {
  transferId:      TRANSFER_ID,
  ownerTenantId:   OWNER_TENANT,
  partnerTenantId: PARTNER_TENANT,
  transferStatus:  'DEVICE_RECEIVED' as string,
}

function makeQuotation(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:                 'q1',
    version:            1,
    status:             'PENDING',
    proposedAmount:     800,
    currency:           'THB',
    note:               null,
    respondedAt:        null,
    expiresAt:          null,
    createdAt:          new Date().toISOString(),
    updatedAt:          new Date().toISOString(),
    transferId:         TRANSFER_ID,
    proposedByTenantId: PARTNER_TENANT,
    proposedByUserId:   'user-b',
    respondedByUserId:  null,
    ...overrides,
  }
}

function stubAuth(tenantId: string) {
  vi.mocked(useAuthStore).mockReturnValue({
    user: { id: 'u1', role: 'OWNER', tenantId, name: 'Test User', email: 't@t.com' },
    hasPermission: vi.fn().mockReturnValue(true),
  } as any)
}

function stubQuery(active: any, all: any[] = []) {
  vi.mocked(useQuery).mockImplementation((opts: any) => {
    const key = opts?.queryKey?.[0]
    if (key === 'quotation-active') return { data: active, isLoading: false } as any
    if (key === 'quotations-history') return { data: all,    isLoading: false } as any
    return { data: undefined, isLoading: false } as any
  })
}

function stubMutations() {
  vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMutations()
})

// ── QPANEL-01: Shop B sees propose button ─────────────────────────────────────

it('QPANEL-01: Shop B sees "เสนอราคา" button when no active quotation', () => {
  stubAuth(PARTNER_TENANT)
  stubQuery(null, [])
  render(<QuotationPanel {...BASE_PROPS} />)
  expect(screen.getByTestId('propose-quotation-btn')).toBeInTheDocument()
})

// ── QPANEL-02: Shop A does NOT see propose button ─────────────────────────────

it('QPANEL-02: Shop A (owner) does not see propose button', () => {
  stubAuth(OWNER_TENANT)
  stubQuery(null, [])
  render(<QuotationPanel {...BASE_PROPS} />)
  expect(screen.queryByTestId('propose-quotation-btn')).toBeNull()
})

// ── QPANEL-03: Third party sees nothing ──────────────────────────────────────

it('QPANEL-03: third-party tenant sees nothing (component returns null)', () => {
  stubAuth(THIRD_TENANT)
  stubQuery(null, [])
  const { container } = render(<QuotationPanel {...BASE_PROPS} />)
  expect(container.firstChild).toBeNull()
})

// ── QPANEL-04: Propose form appears ──────────────────────────────────────────

it('QPANEL-04: clicking propose button shows the amount input form', () => {
  stubAuth(PARTNER_TENANT)
  stubQuery(null, [])
  render(<QuotationPanel {...BASE_PROPS} />)
  fireEvent.click(screen.getByTestId('propose-quotation-btn'))
  expect(screen.getByTestId('quotation-amount-input')).toBeInTheDocument()
})

// ── QPANEL-05: Amount > 0 validation ─────────────────────────────────────────

it('QPANEL-05: submitting propose with amount 0 does NOT call the mutation (validation blocks it)', () => {
  const mutateFn = vi.fn()
  vi.mocked(useMutation).mockReturnValue({ mutate: mutateFn, isPending: false } as any)
  stubAuth(PARTNER_TENANT)
  stubQuery(null, [])
  render(<QuotationPanel {...BASE_PROPS} />)
  fireEvent.click(screen.getByTestId('propose-quotation-btn'))
  const input = screen.getByTestId('quotation-amount-input')
  fireEvent.change(input, { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: /ส่งใบเสนอราคา/ }))
  // Validation should prevent mutate from being called
  expect(mutateFn).not.toHaveBeenCalled()
})

// ── QPANEL-06: Active quotation card ─────────────────────────────────────────

it('QPANEL-06: active quotation card shows amount and Thai status label', () => {
  stubAuth(OWNER_TENANT)
  const q = makeQuotation({ proposedAmount: 750 })
  stubQuery(q, [q])  // same q in active + history = "750" appears twice; use getAllByText
  render(<QuotationPanel {...BASE_PROPS} />)
  expect(screen.getAllByText(/750/).length).toBeGreaterThan(0)
  expect(screen.getAllByText('รอการตอบรับ').length).toBeGreaterThan(0)
})

// ── QPANEL-07: Responder sees action buttons ──────────────────────────────────

it('QPANEL-07: responder (Shop A) sees accept/counter/reject buttons for Shop B quotation', () => {
  stubAuth(OWNER_TENANT)  // Shop A is the responder
  const q = makeQuotation({ proposedByTenantId: PARTNER_TENANT })  // B proposed
  stubQuery(q, [q])
  render(<QuotationPanel {...BASE_PROPS} />)
  expect(screen.getByTestId('accept-quotation-btn')).toBeInTheDocument()
  expect(screen.getByTestId('counter-quotation-btn')).toBeInTheDocument()
  expect(screen.getByTestId('reject-quotation-btn')).toBeInTheDocument()
})

// ── QPANEL-08: Proposer does NOT see accept buttons ──────────────────────────

it('QPANEL-08: proposer (Shop B) does not see accept/counter/reject on their own quotation', () => {
  stubAuth(PARTNER_TENANT)  // B is the proposer
  const q = makeQuotation({ proposedByTenantId: PARTNER_TENANT })
  stubQuery(q, [q])
  render(<QuotationPanel {...BASE_PROPS} />)
  expect(screen.queryByTestId('accept-quotation-btn')).toBeNull()
  expect(screen.queryByTestId('counter-quotation-btn')).toBeNull()
  expect(screen.queryByTestId('reject-quotation-btn')).toBeNull()
})

// ── QPANEL-09: Accepted price banner ─────────────────────────────────────────

it('QPANEL-09: accepted quotation shows agreed price banner', () => {
  stubAuth(OWNER_TENANT)
  const q = makeQuotation({ status: 'ACCEPTED', proposedAmount: 650 })
  stubQuery(null, [q])  // no active, but history has accepted one
  render(<QuotationPanel {...BASE_PROPS} />)
  // Banner must contain the agreed price text
  expect(screen.getByText(/ราคาที่ตกลงกัน/)).toBeInTheDocument()
  // "650" may appear in multiple places (banner + history); just verify it exists at least once
  expect(screen.getAllByText(/650/).length).toBeGreaterThan(0)
})

// ── QPANEL-10: No customer data in output ────────────────────────────────────

it('QPANEL-10: no customer-identifying data rendered in panel', () => {
  stubAuth(PARTNER_TENANT)
  stubQuery(null, [])
  const { container } = render(<QuotationPanel {...BASE_PROPS} />)
  const text = container.textContent ?? ''
  const FORBIDDEN = ['ชื่อลูกค้า', 'เบอร์โทร', 'customerId', 'ราคาขาย', 'กำไร', 'finalCost']
  for (const f of FORBIDDEN) {
    expect(text).not.toContain(f)
  }
})

// ── QPANEL-11: Status labels ──────────────────────────────────────────────────

describe('QPANEL-11: QUOTATION_STATUS_LABEL covers all 6 statuses', () => {
  const ALL_STATUSES: QuotationStatus[] = [
    'PENDING', 'ACCEPTED', 'REJECTED', 'COUNTER_OFFER', 'EXPIRED', 'CANCELLED',
  ]

  it.each(ALL_STATUSES)('status %s has a Thai label', (status) => {
    expect(QUOTATION_STATUS_LABEL[status]).toBeTruthy()
    expect(typeof QUOTATION_STATUS_LABEL[status]).toBe('string')
    expect(QUOTATION_STATUS_LABEL[status].length).toBeGreaterThan(0)
  })
})

// ── QPANEL-12: Terminal status logic ──────────────────────────────────────────

describe('QPANEL-12: isQuotationTerminal', () => {
  it.each([
    ['ACCEPTED',     true],
    ['REJECTED',     true],
    ['EXPIRED',      true],
    ['CANCELLED',    true],
    ['PENDING',      false],
    ['COUNTER_OFFER', false],
  ] as [QuotationStatus, boolean][])('%s → %s', (status, expected) => {
    expect(isQuotationTerminal(status)).toBe(expected)
  })

  it('QUOTATION_TERMINAL_STATUSES has exactly 4 entries', () => {
    expect(QUOTATION_TERMINAL_STATUSES).toHaveLength(4)
  })
})

// ── QPANEL-13: No accounting exports ──────────────────────────────────────────

it('QPANEL-13: partner-repair-quotations lib has no accounting function exports', async () => {
  const lib = await import('@/lib/partner-repair-quotations')
  const ACCOUNTING_EXPORTS = [
    'createJournalEntry', 'createJournalLine', 'openCashDrawer',
    'closeCashDrawer', 'recordCashDrawerTransaction', 'postAccounting',
  ]
  for (const name of ACCOUNTING_EXPORTS) {
    expect(lib).not.toHaveProperty(name)
  }
})
