import { describe, it, expect } from 'vitest'
import { applyBrandColor, hexToHsl, isHexColor, readableOn } from '@/lib/brand-theme'

describe('shop brand colour', () => {
  it('reads hex colours', () => {
    expect(isHexColor('#7c3aed')).toBe(true)
    expect(isHexColor('none')).toBe(false)
    expect(isHexColor('#fff')).toBe(false)
  })
  it('picks readable text on the colour', () => {
    expect(readableOn('#7c3aed')).toEqual([255, 255, 255]) // purple → white text
    expect(readableOn('#FFC107')).toEqual([17, 17, 17])    // yellow → dark text
  })
  it('converts to the HSL shadcn uses', () => {
    expect(hexToHsl('#2563eb')).toBe('221.2 83.2% 53.3%')
  })
  it('sets and clears the CSS variables', () => {
    const el = document.createElement('div')
    applyBrandColor('#059669', el)
    expect(el.style.getPropertyValue('--brand')).toBe('5 150 105')
    expect(el.style.getPropertyValue('--brand-accent')).toBe('5 150 105')
    expect(el.style.getPropertyValue('--brand-header-fg')).toBe('255 255 255')
    applyBrandColor(null, el)
    expect(el.style.getPropertyValue('--brand')).toBe('')
  })
})
