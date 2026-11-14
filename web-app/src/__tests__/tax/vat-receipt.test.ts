/**
 * A shop that charges VAT prints its bill as an abbreviated tax invoice (Revenue Code s.86/6):
 * the words, the running number, the tax id and branch, "VAT included" with the base and the tax.
 * A shop without VAT prints exactly the receipt it printed before.
 */
import { describe, it, expect } from 'vitest'
import { buildSaleReceiptThermalHtml } from '@/lib/printer'

const sale = (extra: object = {}) => ({
  receiptNumber: 'RCP-20261114-ABC123', createdAt: '2026-11-14T05:00:00Z',
  items: [{ quantity: 1, price: 1070, total: 1070, product: { name: 'เคส' } }],
  subtotal: 1070, discount: 0, total: 1070, paymentMethod: 'CASH', amountPaid: 1070, change: 0,
  ...extra,
})
const settings = { shopName: 'ร้านทดสอบ', taxId: '0105561234567', taxBranch: 'สำนักงานใหญ่' }

describe('VAT receipt', () => {
  it('VR-01: a VAT bill shows the tax invoice title, number, tax id + branch and the VAT split', () => {
    const html = buildSaleReceiptThermalHtml(sale({
      taxInvoice: { number: 'ABB01-2569-000042', vatBase: 1000, vatAmount: 70, vatPercent: 7 },
      creditNotes: [],
    }) as any, settings)
    expect(html).toContain('ใบกำกับภาษีอย่างย่อ')
    expect(html).toContain('ABB01-2569-000042')
    expect(html).toContain('เลขประจำตัวผู้เสียภาษี 0105561234567 (สำนักงานใหญ่)')
    expect(html).toContain('ราคานี้รวมภาษีมูลค่าเพิ่มแล้ว')
    expect(html).toMatch(/ภาษีมูลค่าเพิ่ม 7%<\/span><span class="v">฿70\.00/)
    expect(html).toMatch(/มูลค่าก่อนภาษี<\/span><span class="v">฿1,000\.00/)
  })

  it('VR-02: a shop without VAT prints the receipt as before (no tax invoice wording)', () => {
    const html = buildSaleReceiptThermalHtml(sale() as any, settings)
    expect(html).not.toContain('ใบกำกับภาษี')
    expect(html).not.toContain('ภาษีมูลค่าเพิ่ม')
    expect(html).toContain('เลขที่ผู้เสียภาษี: 0105561234567')
  })
})
