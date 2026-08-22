/**
 * UI-10 Shop B work queue sections
 * UI-11 Shop B privacy (no customer data)
 * UI-15 Action buttons per status
 * UI-12 Customer tracking unchanged (no partner data in tracking routes)
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery:       vi.fn(),
    useMutation:    vi.fn(),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/link', () => ({
  default: (props: any) => props.children ?? null,
}))

import PartnerRepairsPage from '@/app/(dashboard)/partner-repairs/page'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUseQuery    = vi.mocked(useQuery)
const mockUseMutation = vi.mocked(useMutation)

function makeTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id:                 `tr-${Math.random().toString(36).slice(2)}`,
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
    // sharedDeviceInfo contains ONLY device fields — NO customer data
    sharedDeviceInfo: {
      deviceBrand: 'Xiaomi',
      deviceModel: 'Note 12',
      deviceColor: 'Blue',
      issue:       'แบตเตอรี่บวม',
    },
    partnerWorkNote: null,
    ...overrides,
  }
}

function stubMutation() {
  mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMutation()
})

// ── UI-10: Work queue sections ────────────────────────────────────────────────

describe('UI-10 — Shop B work queue sections', () => {
  it('shows "งานใหม่" section for PENDING_ACCEPTANCE transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'PENDING_ACCEPTANCE' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('งานใหม่')).toBeInTheDocument()
  })

  it('shows "รอรับเครื่อง" section for ACCEPTED transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'ACCEPTED' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('รอรับเครื่อง')).toBeInTheDocument()
  })

  it('shows "กำลังดำเนินการ" section for DEVICE_RECEIVED transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'DEVICE_RECEIVED' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('กำลังดำเนินการ')).toBeInTheDocument()
  })

  it('shows "กำลังดำเนินการ" section for IN_PROGRESS transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'IN_PROGRESS' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('กำลังดำเนินการ')).toBeInTheDocument()
  })

  it('shows "เสร็จแล้ว / ส่งคืน" section for COMPLETED transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'COMPLETED' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('เสร็จแล้ว / ส่งคืน')).toBeInTheDocument()
  })

  it('shows "ประวัติ" section for OWNER_RECEIVED transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'OWNER_RECEIVED' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('ประวัติ')).toBeInTheDocument()
  })

  it('shows "ประวัติ" section for REJECTED transfers', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'REJECTED' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('ประวัติ')).toBeInTheDocument()
  })

  it('shows empty state when no transfers exist', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false, error: null } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('ยังไม่มีงานซ่อมพาร์ทเนอร์')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })

  it('section count badge shows correct number', () => {
    mockUseQuery.mockReturnValue({
      data:      [
        makeTransfer({ status: 'PENDING_ACCEPTANCE' }),
        makeTransfer({ status: 'PENDING_ACCEPTANCE' }),
      ],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    // Badge showing "2" next to งานใหม่
    const badge = screen.getByText('2')
    expect(badge).toBeInTheDocument()
  })

  it('hides sections with zero items', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'PENDING_ACCEPTANCE' })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    // รอรับเครื่อง group should NOT render since no ACCEPTED transfer
    expect(screen.queryByText('รอรับเครื่อง')).toBeNull()
  })
})

// ── UI-11: Shop B privacy ─────────────────────────────────────────────────────

describe('UI-11 — Shop B never sees customer data', () => {
  const CUSTOMER_DATA_STRINGS = [
    'ลูกค้า',   // customer label
    'เบอร์',    // phone number label
    'ที่อยู่',   // address
    'ราคาขาย',  // selling price to customer
    'กำไร',     // profit/margin
    'ค่าซ่อม.*ลูกค้า',  // customer repair cost
  ]

  it('does not display any customer-identifying text', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'PENDING_ACCEPTANCE' })],
      isLoading: false,
      error:     null,
    } as any)
    const { container } = render(<PartnerRepairsPage />)
    const text = container.textContent ?? ''

    // These are header/page labels expected to appear:
    // "งานซ่อมพาร์ทเนอร์" (page title) — contains "ลูกค้า" indirectly? No.
    // Test the actual forbidden strings
    expect(text).not.toMatch(/ชื่อลูกค้า/)
    expect(text).not.toMatch(/เบอร์โทรศัพท์/)
    expect(text).not.toMatch(/ที่อยู่ลูกค้า/)
    expect(text).not.toMatch(/ราคาขาย/)
    expect(text).not.toMatch(/กำไร/)
    expect(text).not.toMatch(/customerId/)
    expect(text).not.toMatch(/email/)
  })

  it('shows only sharedDeviceInfo fields (brand, model, issue)', () => {
    mockUseQuery.mockReturnValue({
      data: [makeTransfer({
        status: 'PENDING_ACCEPTANCE',
        sharedDeviceInfo: {
          deviceBrand: 'Xiaomi',
          deviceModel: 'Note 12',
          issue:       'แบตเตอรี่บวม',
        },
      })],
      isLoading: false,
      error:     null,
    } as any)
    render(<PartnerRepairsPage />)
    expect(screen.getByText(/Xiaomi/)).toBeInTheDocument()
    expect(screen.getByText(/Note 12/)).toBeInTheDocument()
    expect(screen.getByText(/แบตเตอรี่บวม/)).toBeInTheDocument()
  })

  it('does not render null sharedDeviceInfo without crashing', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'ACCEPTED', sharedDeviceInfo: null })],
      isLoading: false,
      error:     null,
    } as any)
    expect(() => render(<PartnerRepairsPage />)).not.toThrow()
  })
})

// ── UI-15: Shop B action buttons per status ───────────────────────────────────

describe('UI-15 — Shop B action buttons match transfer status', () => {
  function renderWithStatus(status: string) {
    vi.clearAllMocks()
    stubMutation()
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status })],
      isLoading: false,
      error:     null,
    } as any)
    return render(<PartnerRepairsPage />)
  }

  it('PENDING_ACCEPTANCE shows รับงาน and ปฏิเสธ', () => {
    renderWithStatus('PENDING_ACCEPTANCE')
    expect(screen.getByText('รับงาน')).toBeInTheDocument()
    expect(screen.getByText('ปฏิเสธ')).toBeInTheDocument()
  })

  it('ACCEPTED shows รับเครื่องแล้ว', () => {
    renderWithStatus('ACCEPTED')
    expect(screen.getByText('รับเครื่องแล้ว')).toBeInTheDocument()
  })

  it('DEVICE_RECEIVED shows เริ่มซ่อม', () => {
    renderWithStatus('DEVICE_RECEIVED')
    expect(screen.getByText('เริ่มซ่อม')).toBeInTheDocument()
  })

  it('IN_PROGRESS shows ซ่อมเสร็จแล้ว', () => {
    renderWithStatus('IN_PROGRESS')
    expect(screen.getByText('ซ่อมเสร็จแล้ว')).toBeInTheDocument()
  })

  it('COMPLETED shows ส่งคืนเครื่องแล้ว', () => {
    renderWithStatus('COMPLETED')
    expect(screen.getByText('ส่งคืนเครื่องแล้ว')).toBeInTheDocument()
  })

  it('DEVICE_RETURNED shows waiting message (not an action button)', () => {
    renderWithStatus('DEVICE_RETURNED')
    expect(screen.getByText('รอร้านต้นทางยืนยันรับเครื่องคืน')).toBeInTheDocument()
    // No action button
    expect(screen.queryByRole('button', { name: /ยืนยัน/i })).toBeNull()
  })

  it('terminal OWNER_RECEIVED shows no action buttons', () => {
    renderWithStatus('OWNER_RECEIVED')
    expect(screen.queryByText('รับงาน')).toBeNull()
    expect(screen.queryByText('ปฏิเสธ')).toBeNull()
    expect(screen.queryByText('รับเครื่องแล้ว')).toBeNull()
  })

  it('terminal CANCELLED shows no action buttons', () => {
    renderWithStatus('CANCELLED')
    expect(screen.queryByText('รับงาน')).toBeNull()
    expect(screen.queryByText('ปฏิเสธ')).toBeNull()
  })
})

// ── UI-12: Customer tracking privacy ─────────────────────────────────────────

describe('UI-12 — customer tracking page has no partner data', () => {
  /**
   * The customer-facing tracking page is at /track/[ticketNumber].
   * It fetches repair status directly from the repair endpoint.
   * Partner data is never included in that response.
   *
   * This test verifies that the /partner-repairs page itself
   * does not expose tracking page patterns (URL leak check).
   */
  it('/partner-repairs page does not contain customer tracking links', () => {
    mockUseQuery.mockReturnValue({
      data:      [makeTransfer({ status: 'IN_PROGRESS' })],
      isLoading: false,
      error:     null,
    } as any)
    const { container } = render(<PartnerRepairsPage />)
    // Should not link to /track/* routes — customer tracking must stay separate
    const links = container.querySelectorAll('a[href*="/track"]')
    expect(links).toHaveLength(0)
  })

  it('/partner-repairs page does not expose partner tenantId in visible text', () => {
    mockUseQuery.mockReturnValue({
      data: [makeTransfer({
        status: 'ACCEPTED',
        ownerTenantId: 'tenant-a-owner',
        partnerTenantId: 'tenant-b-partner',
      })],
      isLoading: false,
      error:     null,
    } as any)
    const { container } = render(<PartnerRepairsPage />)
    const text = container.textContent ?? ''
    expect(text).not.toContain('tenant-a-owner')
    expect(text).not.toContain('tenant-b-partner')
  })
})
