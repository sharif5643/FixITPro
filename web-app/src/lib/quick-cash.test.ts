import { describe, it, expect } from 'vitest'
import { CASH_CATEGORIES, cashReason, categoryLabel } from './quick-cash'

describe('quick cash', () => {
  it('names each category and builds the saved reason', () => {
    expect(categoryLabel('OWNER_DRAW')).toBe('เจ้าของเบิก')
    expect(categoryLabel('nope')).toBeNull()
    expect(cashReason('INCOME_SERVICE', '')).toBe('ค่าบริการ')
    expect(cashReason('SHOP_EXPENSE', ' ข้าวกลางวัน ')).toBe('ค่าใช้จ่ายร้าน — ข้าวกลางวัน')
  })

  it('keeps money in and money out apart', () => {
    const ins = CASH_CATEGORIES.IN.map((c) => c.key)
    const outs = CASH_CATEGORIES.OUT.map((c) => c.key)
    expect(ins.some((k) => outs.includes(k))).toBe(false)
    expect(outs).toContain('SHOP_EXPENSE')
  })
})
