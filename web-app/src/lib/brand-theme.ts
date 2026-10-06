/**
 * The shop's main colour applied to the app: CSS variables read by the menu, headers and main
 * buttons (app/globals.css), plus shadcn's --primary. null brings back the product's own look.
 */
const VARS = ['--brand', '--brand-fg', '--brand-accent', '--brand-accent-fg', '--brand-header', '--brand-header-fg', '--primary', '--primary-foreground', '--ring']
export const BRAND_CACHE_KEY = 'fixitpro-brand'

export const BRAND_PRESETS: { value: string; label: string }[] = [
  { value: '#2563eb', label: 'น้ำเงิน' },
  { value: '#7c3aed', label: 'ม่วง' },
  { value: '#059669', label: 'เขียว' },
  { value: '#dc2626', label: 'แดง' },
  { value: '#d97706', label: 'ส้ม' },
  { value: '#0891b2', label: 'ฟ้า' },
]

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Text colour on the brand colour. White unless the colour is light (WCAG contrast with white
 * under 2.6 — bold menu and button text), so mid tones like green or orange keep white text.
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

export function applyBrandColor(hex: string | null | undefined, root: HTMLElement = document.documentElement) {
  if (!isHexColor(hex)) {
    VARS.forEach((v) => root.style.removeProperty(v))
    return
  }
  const rgb = hexToRgb(hex).join(' ')
  const fg  = readableOn(hex)
  const fgRgb = fg.join(' ')
  for (const v of ['--brand', '--brand-accent', '--brand-header']) root.style.setProperty(v, rgb)
  for (const v of ['--brand-fg', '--brand-accent-fg', '--brand-header-fg']) root.style.setProperty(v, fgRgb)
  root.style.setProperty('--primary', hexToHsl(hex))
  root.style.setProperty('--primary-foreground', fg[0] > 100 ? '0 0% 100%' : '0 0% 7%')
  root.style.setProperty('--ring', hexToHsl(hex))
}
