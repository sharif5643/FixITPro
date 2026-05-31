import { describe, it, expect } from 'vitest'
import {
  buildExpenseSlipHtml,
  buildExpenseSlipPreviewData,
  buildDailyClosingHtml,
  buildDailyClosingPreviewData,
  type PrintExpenseSlipOptions,
  type PrintDailyClosingOptions,
} from '@/lib/printer'

// ── Expense slip ───────────────────────────────────────────────────────────────

const expenseOpts: PrintExpenseSlipOptions = {
  shopName:      'FixITPro',
  shopPhone:     '0812345678',
  slipNumber:    'ABCD1234',
  date:          '29/05/2026 10:30',
  cashierName:   'สมชาย',
  description:   'ค่าน้ำมัน',
  categoryName:  'การจัดส่ง',
  amount:        250,
  paymentMethod: 'CASH',
  note:          'เติมรถ',
  footer:        'ขอบคุณที่ใช้บริการ',
}

describe('buildExpenseSlipHtml', () => {
  it('contains shop name', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('FixITPro')
  })

  it('contains slip number', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('ABCD1234')
  })

  it('contains amount formatted', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('250')
  })

  it('contains cashier name', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('สมชาย')
  })

  it('contains category name', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('การจัดส่ง')
  })

  it('contains description', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('ค่าน้ำมัน')
  })

  it('contains note when provided', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toContain('เติมรถ')
  })

  it('omits note section when note is absent', () => {
    const opts = { ...expenseOpts, note: undefined }
    const html = buildExpenseSlipHtml(opts)
    expect(html).not.toContain('เติมรถ')
  })

  it('is valid HTML with doctype', () => {
    const html = buildExpenseSlipHtml(expenseOpts)
    expect(html).toMatch(/^<!DOCTYPE html>/)
  })
})

describe('buildExpenseSlipPreviewData', () => {
  it('returns correct title', () => {
    const data = buildExpenseSlipPreviewData(expenseOpts)
    expect(data.title).toBe('ใบบันทึกค่าใช้จ่าย')
  })

  it('returns slip number as number field', () => {
    const data = buildExpenseSlipPreviewData(expenseOpts)
    expect(data.number).toBe('ABCD1234')
  })

  it('returns shopName and shopPhone', () => {
    const data = buildExpenseSlipPreviewData(expenseOpts)
    expect(data.shopName).toBe('FixITPro')
    expect(data.shopPhone).toBe('0812345678')
  })

  it('contains category and amount rows', () => {
    const data = buildExpenseSlipPreviewData(expenseOpts)
    const categoryRow = data.lines.find(
      (l) => l.type === 'row' && (l as any).label === 'หมวดหมู่',
    )
    expect(categoryRow).toBeDefined()
    const amountRow = data.lines.find(
      (l) => l.type === 'row' && (l as any).label === 'ยอดรวม',
    )
    expect(amountRow).toBeDefined()
  })

  it('includes note as center line when present', () => {
    const data = buildExpenseSlipPreviewData(expenseOpts)
    const noteLine = data.lines.find(
      (l) => l.type === 'center' && (l as any).text === 'เติมรถ',
    )
    expect(noteLine).toBeDefined()
  })

  it('excludes note line when absent', () => {
    const opts = { ...expenseOpts, note: undefined }
    const data = buildExpenseSlipPreviewData(opts)
    const noteLine = data.lines.find(
      (l) => l.type === 'center' && (l as any).text === 'เติมรถ',
    )
    expect(noteLine).toBeUndefined()
  })
})

// ── Daily closing slip ─────────────────────────────────────────────────────────

const closingOpts: PrintDailyClosingOptions = {
  shopName:          'FixITPro',
  shopPhone:         '0812345678',
  cashierName:       'สมชาย',
  openedAt:          '29/05/2026 08:00',
  closedAt:          '29/05/2026 18:00',
  salesCount:        12,
  totalSales:        5400,
  repairCount:       3,
  repairTotal:       1200,
  packageSaleCount:  5,
  packageSaleTotal:  1500,
  packageSaleProfit: 45,
  expectedBalance:   8100,
  actualBalance:     8050,
  difference:        -50,
  footer:            'ขอบคุณที่ใช้บริการ',
}

describe('buildDailyClosingHtml', () => {
  it('contains shop name', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toContain('FixITPro')
  })

  it('contains cashier name', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toContain('สมชาย')
  })

  it('contains opened and closed times', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toContain('08:00')
    expect(html).toContain('18:00')
  })

  it('contains sales count and total', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toContain('12')
    expect(html).toContain('5,400')
  })

  it('contains package sale section when count > 0', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toContain('SIM/แพ็กเกจ')
  })

  it('omits package sale section when count is 0', () => {
    const opts = { ...closingOpts, packageSaleCount: 0 }
    const html = buildDailyClosingHtml(opts)
    expect(html).not.toContain('SIM/แพ็กเกจ')
  })

  it('includes expected and actual balance', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toContain('8,100')
    expect(html).toContain('8,050')
  })

  it('is valid HTML with doctype', () => {
    const html = buildDailyClosingHtml(closingOpts)
    expect(html).toMatch(/^<!DOCTYPE html>/)
  })
})

describe('buildDailyClosingPreviewData', () => {
  it('returns correct title', () => {
    const data = buildDailyClosingPreviewData(closingOpts)
    expect(data.title).toBe('สรุปปิดกะ')
  })

  it('returns shopName', () => {
    const data = buildDailyClosingPreviewData(closingOpts)
    expect(data.shopName).toBe('FixITPro')
  })

  it('contains sales row', () => {
    const data = buildDailyClosingPreviewData(closingOpts)
    const row = data.lines.find(
      (l) => l.type === 'row' && (l as any).label?.startsWith('ยอดขาย'),
    )
    expect(row).toBeDefined()
  })

  it('contains package sale row when count > 0', () => {
    const data = buildDailyClosingPreviewData(closingOpts)
    const row = data.lines.find(
      (l) => l.type === 'row' && (l as any).label?.startsWith('SIM/แพ็กเกจ'),
    )
    expect(row).toBeDefined()
  })

  it('omits package sale row when count is 0', () => {
    const opts = { ...closingOpts, packageSaleCount: 0 }
    const data = buildDailyClosingPreviewData(opts)
    const row = data.lines.find(
      (l) => l.type === 'row' && (l as any).label?.startsWith('SIM/แพ็กเกจ'),
    )
    expect(row).toBeUndefined()
  })

  it('contains difference row as bold', () => {
    const data = buildDailyClosingPreviewData(closingOpts)
    const row = data.lines.find(
      (l) => l.type === 'row' && (l as any).label === 'ส่วนต่าง',
    ) as any
    expect(row).toBeDefined()
    expect(row.bold).toBe(true)
  })

  it('shows negative difference with minus sign', () => {
    const data = buildDailyClosingPreviewData(closingOpts)
    const row = data.lines.find(
      (l) => l.type === 'row' && (l as any).label === 'ส่วนต่าง',
    ) as any
    expect(row.value).toContain('-')
  })

  it('shows positive difference with + sign', () => {
    const opts = { ...closingOpts, difference: 100 }
    const data = buildDailyClosingPreviewData(opts)
    const row = data.lines.find(
      (l) => l.type === 'row' && (l as any).label === 'ส่วนต่าง',
    ) as any
    expect(row.value).toContain('+')
  })
})
