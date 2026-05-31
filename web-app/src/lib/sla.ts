/** SLA thresholds */
export const SLA_GREEN_H  = 24   // < 24 h → green
export const SLA_YELLOW_H = 72   // 24–72 h → yellow, > 72 h → red

export type SLATier = 'green' | 'yellow' | 'red'

export function getSLATier(receivedAt: string, now = Date.now()): SLATier {
  const hours = (now - new Date(receivedAt).getTime()) / 3_600_000
  if (hours < SLA_GREEN_H)  return 'green'
  if (hours < SLA_YELLOW_H) return 'yellow'
  return 'red'
}

export function formatSLAAge(receivedAt: string, now = Date.now()): string {
  const ms   = now - new Date(receivedAt).getTime()
  const hrs  = Math.floor(ms / 3_600_000)
  const days = Math.floor(hrs / 24)
  if (days >= 2)  return `ค้าง ${days} วัน`
  if (hrs >= 24)  return `ค้าง 1 วัน`
  if (hrs >= 1)   return `ค้าง ${hrs} ชม.`
  const mins = Math.floor(ms / 60_000)
  if (mins >= 1)  return `${mins} นาที`
  return 'เพิ่งรับ'
}

export const SLA_CLS: Record<SLATier, string> = {
  green:  'text-green-600 bg-green-50',
  yellow: 'text-amber-600 bg-amber-50',
  red:    'text-red-600 bg-red-50 animate-pulse',
}

export const SLA_DOT: Record<SLATier, string> = {
  green:  'bg-green-400',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
}
