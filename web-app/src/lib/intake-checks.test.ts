import { describe, expect, it } from 'vitest'
import { issueTextOf, intakeWarnings } from './intake-checks'

describe('intakeWarnings', () => {
  it('accepts a 10-digit mobile and a 9-digit landline, with or without dashes', () => {
    expect(intakeWarnings({ phone: '081-234-5678' })).toEqual([])
    expect(intakeWarnings({ phone: '02 123 4567' })).toEqual([])
  })

  it('flags a phone number that is too short or too long', () => {
    expect(intakeWarnings({ phone: '12' })).toHaveLength(1)
    expect(intakeWarnings({ phone: '08123456789' })).toHaveLength(1)
  })

  it('says nothing about a phone that was left empty', () => {
    expect(intakeWarnings({ phone: '' })).toEqual([])
    expect(intakeWarnings({ phone: null })).toEqual([])
  })

  it('flags a deposit above the estimate only when there is an estimate', () => {
    expect(intakeWarnings({ deposit: 5000, estimate: 1000 })[0]).toContain('มากกว่าราคาประเมิน')
    expect(intakeWarnings({ deposit: 1000, estimate: 1000 })).toEqual([])
    expect(intakeWarnings({ deposit: 500, estimate: 0 })).toEqual([])
  })
})

describe('issueTextOf', () => {
  it('uses what was typed, else the picked problem chips (not ด่วน / เคลม)', () => {
    expect(issueTextOf('จอเป็นเส้น', ['หน้าจอ'])).toBe('จอเป็นเส้น')
    expect(issueTextOf('', ['ด่วน', 'แบตเตอรี่', 'กล้อง'])).toBe('แบตเตอรี่, กล้อง')
    expect(issueTextOf('  ', ['เคลม'])).toBe('')
  })
})
