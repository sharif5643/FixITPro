import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TrailList } from '@/components/money/trail'

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: null, isLoading: false, isError: false }) }))

describe('what a number is made of', () => {
  it('lists each row with its document and says when they add up', () => {
    render(<TrailList trail={{ title: 'ค่ารถ', expect: -160, rows: [
      { time: '2026-11-05T03:00:00Z', doc: { kind: 'REPAIR', id: 'r1', label: 'REP-1' }, amount: -80 },
      { time: '2026-11-05T04:00:00Z', doc: { kind: 'EXPENSE', id: 'e1', label: 'ค่ารถรอบบ่าย' }, amount: -80 },
    ] }} />)
    expect(screen.getByText('REP-1')).toBeTruthy()
    expect(screen.getByText(/ค่ารถรอบบ่าย/)).toBeTruthy()
    expect(screen.getByText(/รวม 2 รายการ = ตรงกับยอด/)).toBeTruthy()
  })

  it('warns when the rows do not add up to the number', () => {
    render(<TrailList trail={{ title: 'x', expect: 500, rows: [{ amount: 300, label: 'a' }] }} />)
    expect(screen.getByText(/ยอดที่แสดง ฿500/)).toBeTruthy()
  })
})
