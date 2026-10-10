import { describe, it, expect } from 'vitest'
import { togglePricedJob, type RepairPrice } from '@/lib/repair-prices'

const screen: RepairPrice = { id: 'a', brand: 'Apple', model: 'iPhone 13', service: 'เปลี่ยนจอ', price: 3500, warrantyDays: 90 }
const battery: RepairPrice = { id: 'b', brand: 'Apple', model: '', service: 'เปลี่ยนแบต', price: 900, warrantyDays: null }

describe('togglePricedJob', () => {
  it('adds the job to the issue and its price to the estimate, and takes them back out', () => {
    let s = togglePricedJob([], screen, 'จอแตก', 0)
    expect(s).toMatchObject({ issue: 'จอแตก, เปลี่ยนจอ', estimate: 3500 })
    s = togglePricedJob(s.picked, battery, s.issue, s.estimate)
    expect(s).toMatchObject({ issue: 'จอแตก, เปลี่ยนจอ, เปลี่ยนแบต', estimate: 4400 })
    s = togglePricedJob(s.picked, screen, s.issue, s.estimate)
    expect(s).toMatchObject({ issue: 'จอแตก, เปลี่ยนแบต', estimate: 900 })
    expect(s.picked.map((p) => p.id)).toEqual(['b'])
  })

  it('never takes the estimate below zero when it was changed by hand', () => {
    const s = togglePricedJob([screen], screen, 'เปลี่ยนจอ', 1000)
    expect(s).toMatchObject({ issue: '', estimate: 0 })
  })
})
