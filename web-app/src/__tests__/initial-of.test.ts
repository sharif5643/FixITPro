import { describe, it, expect } from 'vitest'
import { initialOf } from '@/lib/utils'

describe('initialOf: the letter shown on a placeholder', () => {
  it('skips Thai vowels written before the consonant', () => {
    expect(initialOf('เคสใส')).toBe('ค')
    expect(initialOf('แบตเตอรี่')).toBe('บ')
    expect(initialOf('ไอโฟน')).toBe('อ')
    expect(initialOf('โทรศัพท์')).toBe('ท')
  })
  it('keeps the first letter of other names, upper-cased', () => {
    expect(initialOf('iPhone 15')).toBe('I')
    expect(initialOf('  samsung')).toBe('S')
    expect(initialOf('9mm cable')).toBe('9')
  })
  it('falls back when there is no letter', () => {
    expect(initialOf('')).toBe('?')
    expect(initialOf(null, 'U')).toBe('U')
    expect(initialOf('---')).toBe('?')
  })
})
