import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The first letter of a name for an avatar or a product without a picture. Thai words can start
 * with a vowel written before the consonant (เ แ โ ใ ไ): "เคส" gives "ค", not a lone "เ".
 */
export function initialOf(name?: string | null, fallback = '?'): string {
  const ch = (name ?? '').trim().split('').find((c) => {
    const code = c.charCodeAt(0)
    if (code >= 0x0E01 && code <= 0x0E2E) return true          // Thai consonant
    if (code >= 0x0E00 && code <= 0x0E7F) return false         // Thai vowel / tone mark
    return /[A-Za-z0-9]/.test(c) || c.toLowerCase() !== c.toUpperCase()
  })
  return ch ? ch.toUpperCase() : fallback
}

export function formatThaiMoney(amount: number): string {
  const num = new Intl.NumberFormat('th-TH', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
  return `฿${num}`
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num)
}

/**
 * Extract a display-safe message from an Axios error response.
 * Translates internal backend constants that must never reach the cashier UI.
 * Callers should use this for every onError toast/setError in payment flows.
 */
export function apiErrorMessage(err: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  const raw = (err as any)?.response?.data?.message ?? (err as any)?.message
  const text: string = Array.isArray(raw) ? (raw[0] ?? fallback) : (raw ?? fallback)
  if (typeof text === 'string' && text.includes('CASH_DRAWER')) {
    console.warn('[CashDrawer] error suppressed in UI:', text)
    return 'ไม่พบการเชื่อมต่อกับลิ้นชักเก็บเงิน — ตรวจสอบที่ Settings > Hardware'
  }
  return text || fallback
}

export function getAssetUrl(path: string): string {
  if (!path || path.startsWith('http')) return path
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')
  // /uploads/repairs/xxx.jpg  →  {apiBase}/files/repairs/xxx.jpg
  // The backend serves this at GET /api/v1/files/* behind JwtAuthGuard.
  const relative = path.replace(/^\/uploads\//, '')
  return `${apiBase}/files/${relative}`
}
