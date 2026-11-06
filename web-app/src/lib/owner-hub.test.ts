import { describe, expect, it } from 'vitest'
import { actionsOf, thaiDayLabel, type ActionItems } from './owner-hub'

const calm = (): ActionItems => ({
  longShifts: [], overdueRepairs: { count: 0, items: [] }, waitingPickup: { count: 0, items: [] },
  customerDebt: { count: 0, total: 0 }, supplierDue: { count: 0, total: 0, overdue: 0, items: [] },
  stock: { outOfStock: 0, lowStock: 0 },
})

describe('owner hub', () => {
  it('names the day', () => expect(thaiDayLabel('2026-11-06')).toBe('ศ. 6 พ.ย.'))

  it('nothing waiting → empty list', () => expect(actionsOf(calm())).toEqual([]))

  it('lists what waits, each with the page it is dealt with on', () => {
    const a = calm()
    a.longShifts = [{ id: 's1', userName: 'ต้น', branchName: 'ในเมือง', hours: 30 }]
    a.supplierDue = { count: 2, total: 9000, overdue: 1, items: [{ id: 'p', poNumber: 'PO-1', supplier: 'ร้านอะไหล่', dueDate: '2026-11-01T00:00:00Z', remaining: 5000, overdue: true }] }
    a.overdueRepairs = { count: 1, items: [{ id: 'r1', ticketNumber: 'RP-1', customer: 'นาย ก', device: 'iPhone 13', dueDate: '2026-11-02T00:00:00Z' }] }
    a.customerDebt = { count: 3, total: 1500 }
    a.stock = { outOfStock: 2, lowStock: 0 }
    const list = actionsOf(a)
    expect(list.map((x) => x.key)).toEqual(['shifts', 'po', 'overdue', 'debt', 'stock'])
    expect(list[0].urgent).toBe(true)
    expect(list[1].title).toBe('ใบสั่งซื้อเลยกำหนดจ่าย 1 ใบ · ใกล้ครบกำหนด 1 ใบ')
    expect(list[1].urgent).toBe(true)
    expect(list[2].rows?.[0].href).toBe('/repairs/r1')
    expect(list[3].href).toBe('/debt')
    expect(list[4].title).toBe('สินค้าหมด 2 รายการ')
  })
})
