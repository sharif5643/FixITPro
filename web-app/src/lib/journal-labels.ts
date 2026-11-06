/**
 * Plain-Thai names for the books (สมุดบัญชี): what kind of entry it is, and its description.
 * Older entries were written in English by the system ("COGS — Sale RCP-…"); they are shown
 * in Thai here, so every entry reads the same.
 */

export const JOURNAL_SOURCE_LABEL: Record<string, string> = {
  SALE_PAYMENT:            'รับเงินขาย',
  SALE_REVENUE:            'รายได้ขาย',
  SALE_COGS:               'ต้นทุนขาย',
  SALE_REFUND:             'คืนเงินลูกค้า',
  SALE_REFUND_COGS:        'คืนของเข้าสต็อก',
  SALE_EXCHANGE:           'แลกสินค้า',
  REPAIR_DEPOSIT:          'มัดจำซ่อม',
  REPAIR_FINAL_PAYMENT:    'รับเงินซ่อม',
  REPAIR_ADDITIONAL_PAYMENT: 'รับเงินซ่อมเพิ่ม',
  REPAIR_DEPOSIT_SETTLE:   'หักมัดจำ',
  REPAIR_DEPOSIT_REFUND:   'คืนมัดจำ',
  REPAIR_COGS:             'ต้นทุนอะไหล่ซ่อม',
  REPAIR_EXTRA_COST:       'ค่ารถส่งอะไหล่',
  REPAIR_PAYMENT_REVERSAL: 'ยกเลิกรับเงินซ่อม',
  REPAIR_COGS_REVERSAL:    'ยกเลิกต้นทุนซ่อม',
  REPAIR_DEPOSIT_SETTLE_REVERSAL: 'ยกเลิกหักมัดจำ',
  REPAIR_ADDITIONAL_PAYMENT_REVERSAL: 'ยกเลิกรับเงินซ่อมเพิ่ม',
  EXPENSE_PAYMENT:         'ค่าใช้จ่าย',
  EXPENSE_REVERSAL:        'ยกเลิกค่าใช้จ่าย',
  PO_RECEIVE:              'รับสินค้าเข้า (PO)',
  PO_PAYMENT:              'จ่ายซัพพลายเออร์',
  PACKAGE_SALE:            'ขายซิม/แพ็กเกจ',
  PACKAGE_DEBT_PAYMENT:    'รับชำระค้างซิม',
  WALLET_TOPUP:            'เติมเงินกระเป๋าค่าย',
  SHIFT_CASH_IN:           'เงินเข้าลิ้นชัก',
  SHIFT_CASH_OUT:          'เงินออกจากลิ้นชัก',
  DRAWER_WITHDRAWAL:       'เบิกเงินลิ้นชัก',
  DRAWER_DEPOSIT:          'เติมเงินลิ้นชัก',
  DRAWER_REVERSAL:         'ยกเลิกรายการลิ้นชัก',
  JOURNAL_MANUAL:          'บันทึกเอง',
  JOURNAL_REVERSAL:        'กลับรายการ',
}

export function journalSourceLabel(type?: string | null) {
  if (!type) return '—'
  return JOURNAL_SOURCE_LABEL[type] ?? type
}

const METHOD: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร', QR: 'QR', CREDIT: 'ค้างจ่าย', BANK: 'โอน' }

/** English system descriptions → Thai; anything else is shown as written */
const RULES: [RegExp, (...m: string[]) => string][] = [
  [/^Sale (\S+) — (\w+)$/, (_, r, m) => `ขาย บิล ${r} — ${METHOD[m] ?? m}`],
  [/^COGS — Sale (\S+)$/, (_, r) => `ต้นทุนสินค้า บิล ${r}`],
  [/^Refund — Sale (\S+)$/, (_, r) => `คืนเงิน บิล ${r}`],
  [/^Void sale (\S+)$/i, (_, r) => `ยกเลิกบิล ${r}`],
  [/^Void COGS — sale (\S+)$/i, (_, r) => `ยกเลิกต้นทุน บิล ${r}`],
  [/^COGS Reversal — Refund (\S+)$/, () => `คืนของเข้าสต็อก (คืนเงินลูกค้า)`],
  [/^Deposit — Repair (\S+)$/, (_, t) => `มัดจำ งานซ่อม ${t}`],
  [/^Final Payment — Repair (\S+)$/, (_, t) => `รับเงินค่าซ่อม งาน ${t}`],
  [/^Deposit Settlement — Repair (\S+)$/, (_, t) => `หักมัดจำ งาน ${t}`],
  [/^Parts COGS — Repair (\S+)$/, (_, t) => `ต้นทุนอะไหล่ งาน ${t}`],
  [/^Payment Reversal — Repair (\S+)$/, (_, t) => `ยกเลิกรับเงิน งาน ${t}`],
  [/^Deposit Settle Reversal — Repair (\S+)$/, (_, t) => `ยกเลิกหักมัดจำ งาน ${t}`],
  [/^Additional Payment — Repair (\S+)$/, (_, t) => `รับเงินเพิ่ม งาน ${t}`],
  [/^Deposit Refund — Repair (\S+)$/, (_, t) => `คืนมัดจำ งาน ${t}`],
  [/^COGS Reversal — Repair (\S+)$/, (_, t) => `ยกเลิกต้นทุน งาน ${t}`],
  [/^Additional Payment Reversal — Repair (\S+)$/, (_, t) => `ยกเลิกรับเงินเพิ่ม งาน ${t}`],
  [/^Void — (.+)$/, (_, d) => `ยกเลิก — ${d}`],
]

export function journalDescription(text?: string | null) {
  if (!text) return '—'
  for (const [re, to] of RULES) {
    const m = text.match(re)
    if (m) return to(...m)
  }
  return text
}
