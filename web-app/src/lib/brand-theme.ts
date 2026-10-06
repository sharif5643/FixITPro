import { findThemeSet, type ThemeSet } from '@/lib/theme-sets'

/**
 * Applies a theme set by setting the CSS variables read across the app (app/globals.css).
 * null / unknown / "original" removes them all, so the product's own look comes back untouched.
 */
export const BRAND_CACHE_KEY = 'fixitpro-theme-set'
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const VARS = [
  ...SHADES.map((s) => `--blue-${s}`),
  '--brand', '--brand-fg', '--brand-accent', '--brand-accent-fg', '--brand-gradient', '--brand-header-bg', '--brand-header-fg',
  '--side-bg', '--side-fg', '--primary', '--primary-foreground', '--ring',
]

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Text colour on a colour. White unless the colour is light (WCAG contrast with white under
 * 2.6 — bold menu and button text), so mid tones like green or orange keep white text.
 */
export function readableOn(hex: string): [number, number, number] {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = hexToRgb(hex)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return 1.05 / (L + 0.05) >= 2.6 ? [255, 255, 255] : [17, 17, 17]
}

export function hexToHsl(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`
}

/** A Tailwind-like 50…950 scale around one colour (it is the 600 step). */
export function shadeScale(hex: string): Record<(typeof SHADES)[number], [number, number, number]> {
  const c = hexToRgb(hex)
  const mix = (t: number, to: number): [number, number, number] =>
    c.map((v) => Math.round(v * t + to * (1 - t))) as [number, number, number]
  return {
    50: mix(0.07, 255), 100: mix(0.14, 255), 200: mix(0.26, 255), 300: mix(0.42, 255), 400: mix(0.65, 255),
    500: mix(0.85, 255), 600: c, 700: mix(0.85, 0), 800: mix(0.7, 0), 900: mix(0.55, 0), 950: mix(0.38, 0),
  }
}

const rgb = (c: [number, number, number]) => c.join(' ')

export function applyThemeSet(key: string | null | undefined, root: HTMLElement = document.documentElement) {
  const t: ThemeSet | null = findThemeSet(key)
  if (!t) {
    VARS.forEach((v) => root.style.removeProperty(v))
    root.removeAttribute('data-theme-set')
    return
  }
  const scale = shadeScale(t.primary)
  SHADES.forEach((s) => root.style.setProperty(`--blue-${s}`, rgb(scale[s])))
  const set = (v: string, val: string) => root.style.setProperty(v, val)
  set('--brand', rgb(hexToRgb(t.sideActive)))
  set('--brand-fg', rgb(readableOn(t.sideActive)))
  set('--brand-accent', rgb(hexToRgb(t.accent)))
  set('--brand-accent-fg', rgb(readableOn(t.accent)))
  set('--brand-gradient', `linear-gradient(to right, ${t.primary}, ${t.second})`)
  set('--brand-header-bg', `linear-gradient(to right, ${t.primary}, ${t.second})`)
  set('--brand-header-fg', rgb(readableOn(t.primary)))
  set('--side-bg', rgb(hexToRgb(t.side)))
  set('--side-fg', rgb(hexToRgb(t.sideText)))
  set('--primary', hexToHsl(t.primary))
  set('--primary-foreground', readableOn(t.primary)[0] > 100 ? '0 0% 100%' : '0 0% 7%')
  set('--ring', hexToHsl(t.primary))
  root.setAttribute('data-theme-set', t.key)
}
