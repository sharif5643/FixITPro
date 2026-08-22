/**
 * UI-01 No partner → panel hidden
 * UI-02 Accepted partner → send button visible
 * UI-08 Existing transfer → correct status, no duplicate send
 * UI-09 Status labels correct
 * UI-15 Invalid-state actions hidden
 * UI-16 Accounting safety (no JE calls)
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
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

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Stub out child components — keeps panel tests focused on panel logic
vi.mock('@/components/partner-repair/SendToPartnerDialog', () => ({
  SendToPartnerDialog: () => null,
}))
vi.mock('@/components/partner-repair/QuotationPanel', () => ({
  QuotationPanel: () => null,
}))

import { PartnerTransferPanel } from '@/components/partner-repair/PartnerTransferPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUseQuery    = vi.mocked(useQuery)
const mockUseMutation = vi.mocked(useMutation)
const mockUseAuthStore = vi.mocked(useAuthStore)

const REPAIR_BASE = {
  id:           'r1',
  ticketNumber: 'TKT-001',
  deviceBrand:  'Apple',
  deviceModel:  'iPhone 15',
  deviceColor:  'Black',
  deviceImei:   '123456789012345',
  issue:        'แบตเตอรี่เสื่อม',
  note:         null,
  status:       'IN_PROGRESS',
}

function makeTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id:                 'tr1',
    status:             'PENDING_ACCEPTANCE',
    agreedPartnerPrice: null,
    pricingNote:        null,
    sentAt:             '2026-08-20T10:00:00Z',
    acceptedAt:         null,
    rejectedAt:         null,
    deviceReceivedAt:   null,
    partnerStartedAt:   null,
    completedAt:        null,
    returnedAt:         null,
    ownerReceivedAt:    null,
    cancelledAt:        null,
    recalledAt:         null,
    completionNote:     null,
    ...overrides,
  }
}

function stubMutation() {
  mockUseMutation.mockReturnValue({
    mutate:    vi.fn(),
    isPending: false,
  } as any)
}

function stubOwnerAuth() {
  mockUseAuthStore.mockReturnValue({
    user: { id: 'u1', role: 'OWNER', tenantId: 'tenant-a', name: 'Owner', email: 'o@test.com' },
    hasPermission: vi.fn().mockReturnValue(true),
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubOwnerAuth()
  stubMutation()
})

// ── UI-01: No partner + no transfer → nothing rendered ────────────────────────

describe('UI-01 — no accepted partner and no existing transfer', () => {
  beforeEach(() => {
    // First call = hasAcceptedPartner → false, second = getTransferByRepair → null
    mockUseQuery
      .mockReturnValueOnce({ data: false, isLoading: false } as any)
      .mockReturnValueOnce({ data: null,  isLoading: false } as any)
  })

  it('renders nothing when hasPartner=false and transfer=null', () => {
    const { container } = render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render the send button', () => {
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.queryByText('ส่งต่องานให้ Partner')).toBeNull()
  })

  it('does not render any partner workflow controls', () => {
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.queryByText('งานพาร์ทเนอร์')).toBeNull()
  })
})

// ── UI-01 loading state ───────────────────────────────────────────────────────

describe('UI-01 — loading state', () => {
  it('shows loading spinner while queries are in flight', () => {
    mockUseQuery
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any)
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any)
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.getByText('โหลดข้อมูลพาร์ทเนอร์...')).toBeInTheDocument()
  })
})

// ── UI-02: Has accepted partner + no transfer → shows send button ─────────────

describe('UI-02 — accepted partner, no existing transfer', () => {
  beforeEach(() => {
    mockUseQuery
      .mockReturnValueOnce({ data: true, isLoading: false } as any)
      .mockReturnValueOnce({ data: null, isLoading: false } as any)
  })

  it('renders the partner panel section', () => {
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.getByText('งานพาร์ทเนอร์')).toBeInTheDocument()
  })

  it('shows the "ส่งต่องานให้ Partner" button', () => {
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.getByText('ส่งต่องานให้ Partner')).toBeInTheDocument()
  })

  it('does NOT show status label when no transfer exists', () => {
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.queryByText('รอ Partner รับงาน')).toBeNull()
  })
})

// ── UI-02: DELIVERED repair → send button hidden ──────────────────────────────

describe('UI-02 — delivered repair cannot be sent to partner', () => {
  beforeEach(() => {
    mockUseQuery
      .mockReturnValueOnce({ data: true, isLoading: false } as any)
      .mockReturnValueOnce({ data: null, isLoading: false } as any)
  })

  it('hides send button when repair status is DELIVERED', () => {
    render(<PartnerTransferPanel repair={{ ...REPAIR_BASE, status: 'DELIVERED' }} />)
    expect(screen.queryByText('ส่งต่องานให้ Partner')).toBeNull()
  })

  it('hides send button when repair status is CANCELLED', () => {
    render(<PartnerTransferPanel repair={{ ...REPAIR_BASE, status: 'CANCELLED' }} />)
    expect(screen.queryByText('ส่งต่องานให้ Partner')).toBeNull()
  })
})

// ── UI-09: Existing transfer → correct status labels ──────────────────────────

describe('UI-09 — existing transfer status labels', () => {
  const LABEL_CASES: Array<[string, string]> = [
    ['PENDING_ACCEPTANCE', 'รอ Partner รับงาน'],
    ['ACCEPTED',           'รับงานแล้ว'],
    ['DEVICE_RECEIVED',    'รับเครื่องแล้ว'],
    ['IN_PROGRESS',        'กำลังซ่อม'],
    ['COMPLETED',          'ซ่อมเสร็จแล้ว'],
    ['DEVICE_RETURNED',    'ส่งคืนแล้ว'],
    ['OWNER_RECEIVED',     'ร้านรับเครื่องคืนแล้ว'],
    ['CANCELLED',          'ยกเลิกแล้ว'],
    ['RECALLED',           'เรียกคืนแล้ว'],
    ['REJECTED',           'ปฏิเสธ'],
  ]

  it.each(LABEL_CASES)('status %s shows Thai label "%s"', (status, expectedLabel) => {
    mockUseQuery
      .mockReturnValueOnce({ data: false, isLoading: false } as any)
      .mockReturnValueOnce({ data: makeTransfer({ status }), isLoading: false } as any)
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.getByText(expectedLabel)).toBeInTheDocument()
  })
})

// ── UI-08: Active transfer → no second "send" button ─────────────────────────

describe('UI-08 — active transfer prevents duplicate send', () => {
  it('does not show send button when active transfer exists', () => {
    mockUseQuery
      .mockReturnValueOnce({ data: true, isLoading: false } as any)
      .mockReturnValueOnce({ data: makeTransfer({ status: 'ACCEPTED' }), isLoading: false } as any)
    render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    expect(screen.queryByText('ส่งต่องานให้ Partner')).toBeNull()
  })
})

// ── UI-15: Actions per status ─────────────────────────────────────────────────

describe('UI-15 — Shop A action buttons per transfer status', () => {
  function renderWithStatus(status: string, repairStatus = 'IN_PROGRESS') {
    vi.clearAllMocks()
    stubOwnerAuth()
    stubMutation()
    mockUseQuery
      .mockReturnValueOnce({ data: false, isLoading: false } as any)
      .mockReturnValueOnce({ data: makeTransfer({ status }), isLoading: false } as any)
    return render(<PartnerTransferPanel repair={{ ...REPAIR_BASE, status: repairStatus }} />)
  }

  it('PENDING_ACCEPTANCE shows cancel button', () => {
    renderWithStatus('PENDING_ACCEPTANCE')
    expect(screen.getByText('ยกเลิกคำขอ')).toBeInTheDocument()
  })

  it('ACCEPTED shows recall button (owner)', () => {
    renderWithStatus('ACCEPTED')
    expect(screen.getByText('เรียกคืนงาน')).toBeInTheDocument()
  })

  it('DEVICE_RETURNED shows owner-received button', () => {
    renderWithStatus('DEVICE_RETURNED')
    expect(screen.getByText('รับเครื่องคืนแล้ว')).toBeInTheDocument()
  })

  it('terminal CANCELLED shows no action buttons', () => {
    renderWithStatus('CANCELLED')
    expect(screen.queryByText('ยกเลิกคำขอ')).toBeNull()
    expect(screen.queryByText('เรียกคืนงาน')).toBeNull()
    expect(screen.queryByText('รับเครื่องคืนแล้ว')).toBeNull()
  })

  it('terminal OWNER_RECEIVED shows no action buttons', () => {
    renderWithStatus('OWNER_RECEIVED')
    expect(screen.queryByText('ยกเลิกคำขอ')).toBeNull()
    expect(screen.queryByText('เรียกคืนงาน')).toBeNull()
    expect(screen.queryByText('รับเครื่องคืนแล้ว')).toBeNull()
  })

  it('IN_PROGRESS shows no shop-A-cancellable action (only cancel at PENDING stage)', () => {
    renderWithStatus('IN_PROGRESS')
    expect(screen.queryByText('ยกเลิกคำขอ')).toBeNull()
    expect(screen.queryByText('เรียกคืนงาน')).toBeNull()
  })
})

// ── UI-05 / UI-11: Partner panel shows NO customer data ───────────────────────

describe('UI-05 — partner panel never displays customer data', () => {
  it('does not render customer name in panel', () => {
    mockUseQuery
      .mockReturnValueOnce({ data: false, isLoading: false } as any)
      .mockReturnValueOnce({ data: makeTransfer(), isLoading: false } as any)
    const { container } = render(<PartnerTransferPanel repair={REPAIR_BASE} />)
    // Customer-identifying strings must not appear
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/ชื่อลูกค้า/)
    expect(text).not.toMatch(/เบอร์โทร/)
    expect(text).not.toMatch(/ค่าซ่อม.*ลูกค้า/)
  })
})
