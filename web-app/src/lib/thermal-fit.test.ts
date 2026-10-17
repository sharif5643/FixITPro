import { describe, expect, it } from 'vitest'
import { fitHtmlToAppPrinter } from './thermal-fit'
import { buildRepairDeliveryReceiptThermalHtml, buildRepairReceiptThermalHtml, buildSaleReceiptThermalHtml } from './printer'

const sale = {
  receiptNumber: 'RCP-1', createdAt: '2026-10-17T04:42:00Z', items: [{ quantity: 1, price: 100, total: 100, product: { name: 'Case' } }],
  subtotal: 100, discount: 0, total: 100, paymentMethod: 'CASH', amountPaid: 100, change: 0,
}

describe('fitHtmlToAppPrinter (the app prints 384 dots wide)', () => {
  it('shrinks a receipt built for 80mm paper so its amounts are not cut off', () => {
    const html = buildSaleReceiptThermalHtml(sale as any, { shopName: 'Shop' } as any, { paperWidth: '80mm' })
    expect(fitHtmlToAppPrinter(html)).toContain('<style>html{zoom:0.6667}</style></head>')
  })
  it('leaves a 58mm receipt and a page captured from the web as they are', () => {
    const html = buildSaleReceiptThermalHtml(sale as any, { shopName: 'Shop' } as any, { paperWidth: '58mm' })
    expect(fitHtmlToAppPrinter(html)).toBe(html)
    const web = '<html><head><style>body{margin:0}#repair-receipt{width:200px}</style></head><body></body></html>'
    expect(fitHtmlToAppPrinter(web)).toBe(web)
  })
})

describe('thermal receipts printed from a browser', () => {
  it('scale the dots-wide layout to the roll instead of running off its right edge', () => {
    const html = buildSaleReceiptThermalHtml(sale as any, { shopName: 'Shop' } as any, { paperWidth: '58mm' })
    expect(html).toContain('@media print { html { zoom: 0.4729; } }')
  })
})

const repair = {
  ticketNumber: 'REP-1', receivedAt: '2026-10-17T04:42:00Z', customer: { name: 'คุณสมศักดิ์ ชื่อยาวมากนามสกุลยาวมาก', phone: '0812345678' },
  deviceBrand: 'Apple', deviceModel: 'iPhone 15 Pro Max 256GB สีไทเทเนียมธรรมชาติ', issue: 'จอแตก', deposit: 3000, estimateCost: 12500,
}

describe('repair slips', () => {
  it('intake slip shows the colour, the condition the device came in with and the pickup day', () => {
    const html = buildRepairReceiptThermalHtml(
      { ...repair, deviceColor: 'Natural Titanium', deviceConditions: ['รอยร้าวที่ฝาหลัง', 'ปุ่มหลวม'], dueDate: '2026-10-20T00:00:00Z' },
      { shopName: 'Shop' }, { copyType: 'customer' },
    )
    expect(html).toContain('สี: Natural Titanium')
    expect(html).toContain('สภาพเครื่องตอนรับ')
    expect(html).toContain('รอยร้าวที่ฝาหลัง, ปุ่มหลวม')
    expect(html).toContain('นัดรับ')
    // Nothing extra when they were not given
    const plain = buildRepairReceiptThermalHtml(repair, { shopName: 'Shop' }, { copyType: 'customer' })
    expect(plain).not.toContain('สภาพเครื่องตอนรับ')
    expect(plain).not.toContain('นัดรับ')
  })
  it('delivery slip lets a long customer name and model wrap instead of running off the paper', () => {
    const html = buildRepairDeliveryReceiptThermalHtml({ ...repair, finalCost: 12500, paidAmount: 9500, paymentMethod: 'CASH' }, { shopName: 'Shop' }, { copyType: 'customer' })
    expect(html).toContain(`<span class="v wrap">${repair.customer.name}</span>`)
    expect(html).toContain('<span class="v wrap">Apple iPhone 15 Pro Max')
  })
})

describe('combined slip (ใบรับเครื่องรวม)', () => {
  it('lists, per device, the colour, the condition it came in with and what came with it', async () => {
    const { buildRepairBatchThermalHtml } = await import('./printer')
    const { summarizeBatch } = await import('./repair-batch')
    const dev = (over: object) => ({
      id: 'r', ticketNumber: 'REP-1', status: 'RECEIVED', deviceBrand: 'Apple', deviceModel: 'iPhone 13', issue: 'จอแตก',
      receivedAt: '2026-10-17T04:00:00Z', estimateCost: 1000, deposit: 0, paymentStatus: 'PENDING', ...over,
    })
    const html = buildRepairBatchThermalHtml(
      summarizeBatch([
        dev({ deviceColor: 'ดำ', deviceConditions: ['ฝาหลังร้าว'], accessories: 'ซิม, เคส' }),
        dev({ ticketNumber: 'REP-2' }),
      ] as any),
      { kind: 'date', date: '2026-10-17' }, { name: 'ร้านส่ง' }, { shopName: 'Shop' },
    )
    expect(html).toContain('Apple iPhone 13 (ดำ)')
    expect(html).toContain('สภาพ: ฝาหลังร้าว')
    expect(html).toContain('อุปกรณ์ที่รับมา: ซิม, เคส')
    // A device with none of them gets no empty lines
    expect(html.match(/สภาพ:/g)).toHaveLength(1)
  })
})
