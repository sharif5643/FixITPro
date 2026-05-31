import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatThaiMoney(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num)
}

export function getAssetUrl(path: string): string {
  if (!path || path.startsWith('http')) return path
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
  return apiBase.replace(/\/api\/v1\/?$/, '') + path
}
