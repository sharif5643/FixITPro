import { format } from 'date-fns'
import { REPAIR_LABEL } from '@/components/ui/status-badge'

/**
 * A dealer (ร้านส่ง) brings several devices at once. Each device is its own repair job, so it is
 * quoted, approved, paid and handed back on its own. This picks the jobs of one customer that
 * belong on a combined slip and works out each one's price, what was paid and what is still owed —
 * the same sums the web's delivery receipt and the debt page use.
 */

export interface BatchRepair {
  id: string
  ticketNumber: string
  status: string
  deviceBrand?: string | null
  deviceModel?: string | null
  deviceImei?: string | null
  issue?: string | null
  receivedAt: string
  deliveredAt?: string | null
  finalCost?: number | string | null
  estimatedTotal?: number | string | null
  estimateCost?: number | string | null
  deposit?: number | string | null
  paidAmount?: number | string | null
  paymentStatus?: string | null
  additionalPayments?: { amount: number | string }[] | null
  customer?: { id: string; name?: string | null; phone?: string | null } | null
}

/** `date` — devices received that day (yyyy-MM-dd, shop's local time); `open` — every job not finished or not fully paid. */
export type BatchScope = { kind: 'date'; date: string } | { kind: 'open' }

export interface BatchRow {
  repair: BatchRepair
  statusLabel: string
  cancelled: boolean
  /** null while the job has no price yet */
  price: number | null
  paid: number
  owed: number
}

export interface BatchSummary {
  rows: BatchRow[]
  count: number
  returned: number
  atShop: number
  cancelled: number
  total: number
  paid: number
  owed: number
  unpriced: number
}

export function localDay(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  return format(Number.isNaN(d.getTime()) ? new Date() : d, 'yyyy-MM-dd')
}

export function isOpenRepair(r: BatchRepair): boolean {
  if (r.status === 'CANCELLED') return false
  if (r.status !== 'DELIVERED') return true
  return r.paymentStatus === 'PENDING' || r.paymentStatus === 'PARTIAL'
}

export function pickBatch(repairs: BatchRepair[], scope: BatchScope): BatchRepair[] {
  const picked = scope.kind === 'date'
    ? repairs.filter((r) => localDay(r.receivedAt) === scope.date)
    : repairs.filter(isOpenRepair)
  return [...picked].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.ticketNumber.localeCompare(b.ticketNumber))
}

export function batchRow(r: BatchRepair): BatchRow {
  const cancelled = r.status === 'CANCELLED'
  const raw   = r.finalCost ?? r.estimatedTotal ?? r.estimateCost
  const price = raw == null || Number(raw) <= 0 ? null : Number(raw)
  const extra = (r.additionalPayments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const deposit = Number(r.deposit ?? 0)

  let paid: number
  let owed: number
  if (cancelled) {
    paid = 0
    owed = 0
  } else if (r.paymentStatus === 'PAID') {
    // paidAmount can hold the cash handed over (change included), so a paid job counts at its price
    paid = price ?? deposit + Number(r.paidAmount ?? 0) + extra
    owed = 0
  } else {
    paid = deposit + (r.paymentStatus === 'PARTIAL' ? Number(r.paidAmount ?? 0) : 0) + extra
    owed = Math.max(0, (price ?? 0) - paid)
  }
  return { repair: r, statusLabel: REPAIR_LABEL[r.status] ?? r.status, cancelled, price, paid, owed }
}

export function summarizeBatch(repairs: BatchRepair[]): BatchSummary {
  const rows = repairs.map(batchRow)
  const live = rows.filter((x) => !x.cancelled)
  return {
    rows,
    count:     rows.length,
    returned:  live.filter((x) => x.repair.status === 'DELIVERED').length,
    atShop:    live.filter((x) => x.repair.status !== 'DELIVERED').length,
    cancelled: rows.length - live.length,
    total:     live.reduce((s, x) => s + (x.price ?? 0), 0),
    paid:      live.reduce((s, x) => s + x.paid, 0),
    owed:      live.reduce((s, x) => s + x.owed, 0),
    unpriced:  live.filter((x) => x.price == null).length,
  }
}
