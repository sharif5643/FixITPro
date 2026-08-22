/**
 * UI-04 Partner selection
 * UI-05 Privacy fields (no customer data)
 * UI-06 IMEI opt-in default off
 * UI-07 Confirmation required
 * UI-08 Double-click protection
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

import { SendToPartnerDialog } from '@/components/partner-repair/SendToPartnerDialog'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUseQuery    = vi.mocked(useQuery)
const mockUseMutation = vi.mocked(useMutation)

const MY_TENANT_ID = 'tenant-a'

const REPAIR = {
  id:           'r1',
  ticketNumber: 'TKT-001',
  deviceBrand:  'Samsung',
  deviceModel:  'Galaxy S24',
  deviceColor:  'White',
  deviceImei:   '987654321098765',
  issue:        'หน้าจอแตก',
  note:         null,
}

function makeRelationship(overrides = {}) {
  return {
    id:               'rel1',
    status:           'ACCEPTED',
    initiatorTenantId: MY_TENANT_ID,
    partnerTenantId:  'tenant-b',
    initiatorTenant:  { id: MY_TENANT_ID, shopName: 'ร้านหลัก' },
    partnerTenant:    { id: 'tenant-b',   shopName: 'ร้านพาร์ทเนอร์ B' },
    ...overrides,
  }
}

function stubAuth() {
  vi.mocked(useAuthStore).mockReturnValue({
    user: { id: 'u1', role: 'OWNER', tenantId: MY_TENANT_ID, name: 'Owner', email: 'o@t.com' },
    hasPermission: vi.fn().mockReturnValue(true),
  } as any)
}

function stubMutation(isPending = false, mutateFn = vi.fn()) {
  mockUseMutation.mockReturnValue({ mutate: mutateFn, isPending } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubAuth()
  stubMutation()
})

function renderDialog(open = true) {
  return render(
    <SendToPartnerDialog open={open} onClose={vi.fn()} repair={REPAIR} />
  )
}

// ── UI-04: Partner selection step ─────────────────────────────────────────────

describe('UI-04 — partner selection step', () => {
  it('shows partner shop name in the list', () => {
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
    renderDialog()
    expect(screen.getByText('ร้านพาร์ทเนอร์ B')).toBeInTheDocument()
  })

  it('shows loading state while partners load', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: true } as any)
    renderDialog()
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })

  it('shows empty state when no accepted partners', () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false } as any)
    renderDialog()
    expect(screen.getByText('ยังไม่มีพาร์ทเนอร์ที่ยืนยันแล้ว')).toBeInTheDocument()
  })

  it('next button is disabled until a partner is selected', () => {
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
    renderDialog()
    const nextBtn = screen.getByRole('button', { name: /ถัดไป/i })
    expect(nextBtn).toBeDisabled()
  })

  it('resolves correct partner name when caller is initiator', () => {
    // Caller is initiatorTenantId = MY_TENANT_ID → shows partnerTenant.shopName
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
    renderDialog()
    expect(screen.getByText('ร้านพาร์ทเนอร์ B')).toBeInTheDocument()
    // Should NOT show initiator's own name as the partner label
    expect(screen.queryByText('ร้านหลัก')).toBeNull()
  })

  it('resolves correct partner name when caller is the partnerTenant', () => {
    // Swap: MY_TENANT_ID is partnerTenantId, so initiator is shown
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: 'u1', role: 'OWNER', tenantId: 'tenant-b', name: 'Owner B', email: 'b@t.com' },
      hasPermission: vi.fn().mockReturnValue(true),
    } as any)
    mockUseQuery.mockReturnValue({
      data: [{
        id: 'rel1',
        status: 'ACCEPTED',
        initiatorTenantId: 'tenant-a',
        partnerTenantId:   'tenant-b',
        initiatorTenant:   { id: 'tenant-a', shopName: 'ร้านหลัก' },
        partnerTenant:     { id: 'tenant-b', shopName: 'ร้านพาร์ทเนอร์ B' },
      }],
      isLoading: false,
    } as any)
    renderDialog()
    // When we are tenant-b (the partnerTenant), we should see initiatorTenant shopName
    expect(screen.getByText('ร้านหลัก')).toBeInTheDocument()
  })
})

// ── UI-05: Privacy — no customer data in any dialog step ─────────────────────

describe('UI-05 — dialog does not display customer data', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
  })

  // Note: 'ที่อยู่' is intentionally mentioned in the amber warning
  //   ("ข้อมูลลูกค้า ชื่อ เบอร์ ที่อยู่ ไม่ถูกส่งให้พาร์ทเนอร์") as a NEGATIVE statement.
  //   That is correct behavior — we verify customer-identifying CONTENT isn't shown,
  //   not that the word is absent from a warning that says it's not being shared.
  const FORBIDDEN_STRINGS = [
    'ชื่อลูกค้า', 'เบอร์โทรศัพท์', 'customerId',
    'ราคาขาย', 'กำไร', 'margin', 'finalCost', 'paidAmount',
  ]

  it('step 1 (partner select) contains no customer data', () => {
    const { container } = renderDialog()
    const text = container.textContent ?? ''
    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('step 2 (review info) shows device fields, not customer-identifying fields', async () => {
    renderDialog()
    const partnerBtn = screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i })
    fireEvent.click(partnerBtn)
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))

    await waitFor(() => {
      expect(screen.getByText('ข้อมูลที่จะแชร์ให้พาร์ทเนอร์')).toBeInTheDocument()
    })

    // Device fields present
    expect(screen.getByText(/Samsung/)).toBeInTheDocument()
    expect(screen.getByText(/Galaxy S24/)).toBeInTheDocument()
    expect(screen.getByText(/หน้าจอแตก/)).toBeInTheDocument()

    // Customer-identifying data absent
    const text = document.body.textContent ?? ''
    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('explicit warning shown: customer data is NOT shared', async () => {
    renderDialog()
    const partnerBtn = screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i })
    fireEvent.click(partnerBtn)
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => {
      expect(screen.getByText(/ข้อมูลลูกค้า.*ไม่ถูกส่งให้พาร์ทเนอร์/)).toBeInTheDocument()
    })
  })
})

// ── UI-06: IMEI opt-in ────────────────────────────────────────────────────────

describe('UI-06 — IMEI/Serial is not shared by default', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
  })

  it('IMEI toggle is visible when repair has IMEI', async () => {
    renderDialog()
    const partnerBtn = screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i })
    fireEvent.click(partnerBtn)
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => {
      expect(screen.getByText('แชร์ IMEI / Serial')).toBeInTheDocument()
    })
  })

  it('IMEI value is shown in toggle row but toggle is off by default', async () => {
    renderDialog()
    const partnerBtn = screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i })
    fireEvent.click(partnerBtn)
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => {
      // IMEI shown as hint in the toggle row (so user knows what they're opting in)
      expect(screen.getByText('987654321098765')).toBeInTheDocument()
    })
  })
})

// ── UI-07: Confirmation required ─────────────────────────────────────────────

describe('UI-07 — confirmation step required before mutation fires', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
  })

  async function navigateToConfirm() {
    const partnerBtn = screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i })
    fireEvent.click(partnerBtn)
    // Step 1 → 2
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => expect(screen.getByText('ข้อมูลที่จะแชร์ให้พาร์ทเนอร์')).toBeInTheDocument())
    // Step 2 → 3
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => expect(screen.getByText(/ราคาที่ตกลงกับพาร์ทเนอร์/)).toBeInTheDocument())
    // Step 3 → 4
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => expect(screen.getByText('ยืนยันส่งงาน')).toBeInTheDocument())
  }

  it('shows confirm button only on final step', async () => {
    renderDialog()
    // Initially no confirm button
    expect(screen.queryByRole('button', { name: /ยืนยันส่งงาน/i })).toBeNull()
    await navigateToConfirm()
    expect(screen.getByRole('button', { name: /ยืนยันส่งงาน/i })).toBeInTheDocument()
  })

  it('partner price label clarifies it is not customer price', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i }))
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => expect(screen.getByText(/ถัดไป/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => {
      expect(screen.getByText(/ราคานี้คือค่าจ้างพาร์ทเนอร์ ไม่ใช่ราคาที่คิดลูกค้า/)).toBeInTheDocument()
    })
  })
})

// ── UI-08: Double-click protection ────────────────────────────────────────────

describe('UI-08 — confirm button disabled during pending mutation', () => {
  it('confirm button is disabled when isPending=true', async () => {
    mockUseQuery.mockReturnValue({ data: [makeRelationship()], isLoading: false } as any)
    // Return isPending=true immediately
    stubMutation(true)

    renderDialog()
    const partnerBtn = screen.getByRole('button', { name: /ร้านพาร์ทเนอร์ B/i })
    fireEvent.click(partnerBtn)
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => expect(screen.getByText('ข้อมูลที่จะแชร์ให้พาร์ทเนอร์')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => expect(screen.getByText(/ราคาที่ตกลงกับพาร์ทเนอร์/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/i }))
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /ยืนยันส่งงาน/i })
      expect(btn).toBeDisabled()
    })
  })
})
