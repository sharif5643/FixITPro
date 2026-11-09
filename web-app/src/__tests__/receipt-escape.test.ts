/**
 * Text typed by a shop or its staff never becomes markup in a receipt: the old receipt builders
 * pasted product, customer and shop names in as is, and the preview runs in the app's origin.
 */
import { describe, it, expect } from 'vitest'
import { buildReceiptHtml, buildRepairIntakeHtml, buildExpenseSlipHtml } from '@/lib/printer'

const evil = '<img src=x onerror=alert(1)>'

describe('receipt HTML escapes typed text', () => {
  it('sale receipt: product, cashier and shop name', () => {
    const html = buildReceiptHtml({
      shopName: evil, receiptNumber: 'R1', date: '9/11/69', cashierName: evil,
      items: [{ name: evil, qty: 1, price: 100, total: 100 }],
      subtotal: 100, discount: 0, total: 100, paymentMethod: 'CASH', amountPaid: 100, change: 0,
    } as any)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('repair intake slip (58mm and A4): customer name and issue, escaped once', () => {
    const opts = {
      shopName: 'ร้าน A&B', ticketNumber: 'REP-1', date: '9/11/69', customerName: evil, customerPhone: '0812345678',
      deviceBrand: 'Apple', deviceModel: 'iPhone', issue: evil, estimateCost: 1000, deposit: 0,
    } as any
    for (const copy of ['customer', 'a4'] as const) {
      const html = buildRepairIntakeHtml(opts, copy)
      expect(html).not.toContain('<img src=x')
      expect(html).toContain('ร้าน A&amp;B')
      expect(html).not.toContain('&amp;amp;')
    }
  })

  it('expense slip: description', () => {
    const html = buildExpenseSlipHtml({ shopName: 'S', description: evil, amount: 50, category: evil, date: '9/11/69' } as any)
    expect(html).not.toContain('<img src=x')
  })
})
