import { describe, it, expect } from 'vitest'
import { batchRow, pickBatch, summarizeBatch, localDay, type BatchRepair } from '@/lib/repair-batch'
import { buildRepairBatchThermalHtml } from '@/lib/printer'

const at = (d: string) => new Date(`${d}T10:00:00`).toISOString()
const base = (over: Partial<BatchRepair>): BatchRepair => ({
  id: over.ticketNumber ?? 'x', ticketNumber: 'R-1', status: 'RECEIVED', receivedAt: at('2026-10-06'), deposit: 0, ...over,
})

describe('dealer combined slip', () => {
  const jobs: BatchRepair[] = [
    base({ ticketNumber: 'R-1', status: 'IN_PROGRESS', estimatedTotal: 800, deposit: 200 }),
    base({ ticketNumber: 'R-2', status: 'DELIVERED', finalCost: 1500, paymentStatus: 'PAID', paidAmount: 2000 }),
    base({ ticketNumber: 'R-3', status: 'DELIVERED', finalCost: 1000, deposit: 100, paymentStatus: 'PARTIAL', paidAmount: 300, additionalPayments: [{ amount: 100 }] }),
    base({ ticketNumber: 'R-4', status: 'CANCELLED', estimatedTotal: 500, deposit: 0 }),
    base({ ticketNumber: 'R-5', status: 'RECEIVED' }),
    base({ ticketNumber: 'R-6', status: 'DELIVERED', finalCost: 400, paymentStatus: 'PAID', receivedAt: at('2026-10-01') }),
  ]

  it('works out each device on its own', () => {
    expect(batchRow(jobs[0])).toMatchObject({ price: 800, paid: 200, owed: 600 })
    expect(batchRow(jobs[1])).toMatchObject({ price: 1500, paid: 1500, owed: 0 })   // change handed back is not "paid"
    expect(batchRow(jobs[2])).toMatchObject({ price: 1000, paid: 500, owed: 500 })  // deposit + part paid + later payment
    expect(batchRow(jobs[3])).toMatchObject({ cancelled: true, paid: 0, owed: 0 })
    expect(batchRow(jobs[4])).toMatchObject({ price: null, owed: 0 })
  })

  it('picks the devices received that day, or every open job', () => {
    expect(pickBatch(jobs, { kind: 'date', date: '2026-10-06' }).map((r) => r.ticketNumber)).toEqual(['R-1', 'R-2', 'R-3', 'R-4', 'R-5'])
    expect(pickBatch(jobs, { kind: 'open' }).map((r) => r.ticketNumber)).toEqual(['R-1', 'R-3', 'R-5'])
    expect(localDay(at('2026-10-06'))).toBe('2026-10-06')
  })

  it('totals leave out cancelled jobs', () => {
    const s = summarizeBatch(pickBatch(jobs, { kind: 'date', date: '2026-10-06' }))
    expect(s).toMatchObject({ count: 5, returned: 2, atShop: 2, cancelled: 1, total: 3300, paid: 2200, owed: 1100, unpriced: 1 })
  })

  it('prints every device with its status and the balance', () => {
    const scope = { kind: 'date', date: '2026-10-06' } as const
    const html = buildRepairBatchThermalHtml(summarizeBatch(pickBatch(jobs, scope)), scope, { name: 'ร้านส่ง A', phone: '0812345678' }, { shopName: 'Shop' })
    expect(html).toContain('ใบรับเครื่องรวม')
    expect(html).toContain('ร้านส่ง A')
    expect(html).toContain('จำนวน: 5 เครื่อง')
    expect(html).toContain('R-3')
    expect(html).toContain('ค้าง ฿500')
    expect(html).toContain('รอประเมิน')
    expect(html).toContain('ค้างชำระ</span><span class="v">฿1,100')
  })
})
