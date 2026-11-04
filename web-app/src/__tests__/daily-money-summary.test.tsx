import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DailyMoneySummary, type DailyRevenue } from '@/components/reports/daily-money-summary'

// The day used to check the money screens: 4 bills, 2 refunds, repairs with deposits, one SIM sale
const day: DailyRevenue = {
  pos: { total: 2440, gross: 3530, count: 4 },
  repairs: { total: 3300, count: 3, deposits: 700, atPickup: 2600, debtPayments: 0 },
  packages: { total: 4, amount: 100, count: 1, byMethod: { CASH: 100 } },
  refunds: { total: 1090, count: 2 },
  voided: { total: 500, count: 1 },
  outstanding: { total: 200, count: 1 },
  cash: 3940, transfer: 1800, card: 0,
}

describe('daily money in plain Thai', () => {
  it('adds every part up to the cash and transfers, SIM money included', () => {
    render(<DailyMoneySummary r={day} dayLabel="วันนี้" />)
    expect(screen.getAllByText('฿5,840').length).toBeGreaterThan(0)   // money in
    expect(screen.getByText(/= เงินสด ฿4,040 \+ โอน ฿1,800/)).toBeTruthy()
    expect(screen.queryByText(/ต่าง/)).toBeNull()
    expect(screen.getByText(/บิลที่ยกเลิก 1 ใบ/)).toBeTruthy()
    expect(screen.getByText(/ค้างชำระอีก ฿200/)).toBeTruthy()
  })

  it('says so when the parts do not add up', () => {
    render(<DailyMoneySummary r={{ ...day, cash: 3900 }} dayLabel="วันนี้" />)
    expect(screen.getByText(/ต่าง ฿40/)).toBeTruthy()
  })
})
