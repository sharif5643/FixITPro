/**
 * Quick money at the counter (optional module "รับ-จ่ายเงินด่วน"). The category says what the money
 * was for; the server decides what it means for the books:
 *  - INCOME_*      revenue ("รายรับไม่มีบิล") and cash in the drawer
 *  - SHOP_EXPENSE  an expense of the shop, paid from the drawer
 *  - the rest      cash moved in or out of the drawer only
 */
export type CashDirection = 'IN' | 'OUT'

export const CASH_CATEGORIES: Record<CashDirection, { key: string; label: string; hint: string }[]> = {
  IN: [
    { key: 'INCOME_PRODUCT', label: 'ขายของ (ไม่ได้ยิงบิล)', hint: 'นับเป็นยอดขาย' },
    { key: 'INCOME_SERVICE', label: 'ค่าบริการ', hint: 'ลงโปรแกรม ติดฟิล์ม ฯลฯ — นับเป็นยอดขาย' },
    { key: 'FLOAT_IN',       label: 'เติมเงินทอน / เจ้าของใส่เงิน', hint: 'ไม่นับเป็นยอดขาย' },
    { key: 'OTHER_IN',       label: 'อื่นๆ', hint: 'ไม่นับเป็นยอดขาย' },
  ],
  OUT: [
    { key: 'SHOP_EXPENSE',    label: 'ค่าใช้จ่ายร้าน', hint: 'ค่ากิน ค่าส่งของ ฯลฯ — ลงเป็นค่าใช้จ่าย' },
    { key: 'PURCHASE',        label: 'ซื้ออะไหล่ / ของเข้าร้าน', hint: 'อย่าลืมเพิ่มสต๊อกพร้อมราคาที่ซื้อ' },
    { key: 'OWNER_DRAW',      label: 'เจ้าของเบิก', hint: 'ไม่ใช่ค่าใช้จ่าย' },
    { key: 'CUSTOMER_REFUND', label: 'คืนเงินลูกค้า', hint: '' },
    { key: 'FLOAT_OUT',       label: 'ฝากธนาคาร / แลกเงิน', hint: 'ไม่ใช่ค่าใช้จ่าย' },
    { key: 'OTHER_OUT',       label: 'อื่นๆ', hint: '' },
  ],
}

export const categoryLabel = (key?: string | null) =>
  [...CASH_CATEGORIES.IN, ...CASH_CATEGORIES.OUT].find((c) => c.key === key)?.label ?? null

/** The reason saved with the money: what was typed, else the category name */
export function cashReason(category: string, note: string): string {
  const n = note.trim()
  const label = categoryLabel(category) ?? ''
  return n ? (label ? `${label} — ${n}` : n) : label
}
