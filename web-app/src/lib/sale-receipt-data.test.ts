import { describe, expect, it } from 'vitest'
import { receiptPaymentLegs, saleAfterSale, soldSerials } from './sale-receipt-data'
import { buildSaleReceiptThermalHtml } from './printer'

const base = {
  receiptNumber: 'RCP-1', createdAt: '2026-10-17T07:47:00Z', subtotal: 25980, discount: 0, total: 25980,
  paymentMethod: 'TRANSFER', amountPaid: 27000, change: 1020,
  // stored net of the change: they add up to the bill
  payments: [{ paymentMethod: 'TRANSFER', amount: 20000 }, { paymentMethod: 'CASH', amount: 5980 }],
  items: [{ quantity: 1, price: 25900, total: 25900, product: { name: 'iPhone 15' }, serialNumbers: [{ serial: '356111222333444', warrantyExpiresAt: '2027-10-17T07:47:00Z' }] }],
}

describe('sale receipt', () => {
  it('shows each payment as handed over, so the legs add up to the money received', () => {
    expect(receiptPaymentLegs(base)).toEqual([{ paymentMethod: 'TRANSFER', amount: 20000 }, { paymentMethod: 'CASH', amount: 7000 }])
    expect(receiptPaymentLegs({ ...base, change: 0 })[1].amount).toBe(5980)
  })
  it('prints the IMEI sold and when its warranty ends', () => {
    expect(soldSerials(base.items[0])).toEqual([{ serial: '356111222333444', warrantyUntil: '2027-10-17T07:47:00Z' }])
    const html = buildSaleReceiptThermalHtml(base as any, { shopName: 'Shop' })
    expect(html).toContain('IMEI: 356111222333444 · ประกันถึง 17 ต.ค. 2027')
    expect(html).toContain('฿7,000')
  })
  it('a voided bill says so on every reprint', () => {
    const html = buildSaleReceiptThermalHtml({ ...base, status: 'VOIDED', voidReason: 'ลูกค้าเปลี่ยนใจ', voidedAt: '2026-10-17T08:00:00Z' } as any, { shopName: 'Shop' })
    expect(html).toContain('*** บิลนี้ยกเลิกแล้ว ***')
    expect(html).toContain('เหตุผล: ลูกค้าเปลี่ยนใจ')
    expect(buildSaleReceiptThermalHtml(base as any, { shopName: 'Shop' })).not.toContain('ยกเลิกแล้ว')
  })
  it('goods taken back are listed with what the bill comes to after them', () => {
    const sale = { ...base, refunds: [{ refundNumber: 'REF-1', createdAt: '2026-10-17T07:52:00Z', totalRefund: 80, items: [{ quantity: 1, total: 80, product: { name: 'เคส' } }] }] }
    expect(saleAfterSale(sale)).toMatchObject({ voided: false, refunded: 80, netAfterRefunds: 25900 })
    const html = buildSaleReceiptThermalHtml(sale as any, { shopName: 'Shop' })
    expect(html).toContain('*** มีการคืนสินค้า ***')
    expect(html).toContain('ยอดหลังคืนสินค้า')
  })
})
