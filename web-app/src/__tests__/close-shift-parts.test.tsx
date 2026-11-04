import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DiffBadge, NOTE_REQUIRED_DIFF, nextOpeningOf, noteRequiredFor } from '@/components/shifts/close-shift-parts'
import { openFor } from '@/components/shift/long-shift-banner'

describe('closing a shift: the simple rules', () => {
  it('asks for a note only when over or short by more than ฿50', () => {
    expect(NOTE_REQUIRED_DIFF).toBe(50)
    expect(noteRequiredFor(null)).toBe(false)
    expect(noteRequiredFor(0)).toBe(false)
    expect(noteRequiredFor(-50)).toBe(false)
    expect(noteRequiredFor(50)).toBe(false)
    expect(noteRequiredFor(-50.5)).toBe(true)
    expect(noteRequiredFor(153)).toBe(true)
  })

  it('opens the next shift with the change left, or else everything counted', () => {
    expect(nextOpeningOf(10853, '')).toBe(10853)
    expect(nextOpeningOf(10853, null)).toBe(10853)
    expect(nextOpeningOf(10853, '1000')).toBe(1000)
    expect(nextOpeningOf(10853, '0')).toBe(0)
  })

  it('shows at a glance whether the count matches', () => {
    const { rerender } = render(<DiffBadge diff={0} />)
    expect(screen.getByText('ยอดตรง')).toBeTruthy()
    rerender(<DiffBadge diff={-153} />)
    expect(screen.getByText(/ขาด/).textContent).toMatch(/153/)
    rerender(<DiffBadge diff={20} />)
    expect(screen.getByText(/เกิน/).textContent).toMatch(/20/)
  })

  it('says how long a shift has been open in hours, then days', () => {
    expect(openFor(20)).toBe('20 ชั่วโมง')
    expect(openFor(47)).toBe('47 ชั่วโมง')
    expect(openFor(9 * 24 + 3)).toBe('9 วัน')
  })
})
