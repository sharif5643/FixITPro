import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function getAssetUrl(path: string): string {
  if (!path || path.startsWith('http')) return path
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')
  // /uploads/repairs/xxx.jpg  →  {apiBase}/files/repairs/xxx.jpg
  // The backend serves this at GET /api/v1/files/* behind JwtAuthGuard.
  const relative = path.replace(/^\/uploads\//, '')
  return `${apiBase}/files/${relative}`
}
