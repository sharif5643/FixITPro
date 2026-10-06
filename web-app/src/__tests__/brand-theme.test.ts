import { describe, it, expect } from 'vitest'
import { applyThemeSet, hexToHsl, isHexColor, readableOn, shadeScale } from '@/lib/brand-theme'
import { THEME_CHOICES, THEME_SETS } from '@/lib/theme-sets'

describe('shop theme sets', () => {
  it('reads hex colours and picks readable text', () => {
    expect(isHexColor('#7c3aed')).toBe(true)
    expect(isHexColor('none')).toBe(false)
    expect(readableOn('#7c3aed')).toEqual([255, 255, 255]) // purple → white text
    expect(readableOn('#FFC107')).toEqual([17, 17, 17])    // yellow → dark text
    expect(readableOn('#a3e635')).toEqual([17, 17, 17])    // lime → dark text
  })

  it('converts to the HSL shadcn uses and builds a 50…950 scale', () => {
    expect(hexToHsl('#2563eb')).toBe('221.2 83.2% 53.3%')
    const s = shadeScale('#7c3aed')
    expect(s[600]).toEqual([124, 58, 237])
    expect(s[50][0]).toBeGreaterThan(240)
    expect(s[900][0]).toBeLessThan(124)
  })

  it('a theme set replaces the variables; original removes every one', () => {
    const el = document.createElement('div')
    applyThemeSet('royal', el)
    expect(el.getAttribute('data-theme-set')).toBe('royal')
    expect(el.style.getPropertyValue('--blue-600')).toBe('124 58 237')
    expect(el.style.getPropertyValue('--brand-accent')).toBe('245 158 11')
    expect(el.style.getPropertyValue('--side-bg')).toBe('46 16 101')
    applyThemeSet('original', el)
    expect(el.getAttribute('data-theme-set')).toBeNull()
    expect(el.getAttribute('style') ?? '').toBe('')
  })

  it('offers Original first, then the eight sets', () => {
    expect(THEME_CHOICES[0].key).toBe('original')
    expect(THEME_SETS).toHaveLength(8)
    expect(new Set(THEME_CHOICES.map((t) => t.key)).size).toBe(9)
  })
})
