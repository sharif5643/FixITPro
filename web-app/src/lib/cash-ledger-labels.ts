/**
 * Names for the money ledger (finance pages): what each kind of money in / out is, and whether
 * it counts against profit. Money the owner takes out, or puts in as change, moves money but is
 * not income or a cost; the profit report is where profit is.
 */
export type LedgerKind = 'income' | 'cost' | 'refund' | 'owner'

export const LEDGER_SOURCE: Record<string, { label: string; icon: string; kind: LedgerKind }> = {
  SALE_PAYMENT:              { label: 'ขายของ', icon: '🛒', kind: 'income' },
  REPAIR_DEPOSIT:            { label: 'มัดจำงานซ่อม', icon: '🔧', kind: 'income' },
  REPAIR_FINAL_PAYMENT:      { label: 'ค่าซ่อม', icon: '🔧', kind: 'income' },
  REPAIR_ADDITIONAL_PAYMENT: { label: 'ค่าซ่อมเพิ่ม / จ่ายหนี้ค้าง', icon: '🔧', kind: 'income' },
  PACKAGE_SALE:              { label: 'ขายซิม / เติมเงิน', icon: '📶', kind: 'income' },
  PACKAGE_DEBT_PAYMENT:      { label: 'รับชำระค้างซิม', icon: '📶', kind: 'income' },
  OTHER_INCOME:              { label: 'รับเงินไม่มีบิล', icon: '💵', kind: 'income' },
  EXPENSE_PAYMENT:           { label: 'ค่าใช้จ่ายร้าน', icon: '🧾', kind: 'cost' },
  DELIVERY_FEE:              { label: 'ค่ารถส่งอะไหล่ (ของงานซ่อม)', icon: '🚐', kind: 'cost' },
  SUPPLIER_PAYMENT:          { label: 'จ่ายซัพพลายเออร์ (ซื้อของเข้า)', icon: '📦', kind: 'cost' },
  SALE_REFUND:               { label: 'คืนเงินลูกค้า', icon: '↩️', kind: 'refund' },
  REPAIR_DEPOSIT_REFUND:     { label: 'คืนมัดจำงานซ่อม', icon: '↩️', kind: 'refund' },
  REPAIR_FINAL_PAYMENT_REFUND: { label: 'คืนเงินค่าซ่อม', icon: '↩️', kind: 'refund' },
  REPAIR_ADDITIONAL_PAYMENT_REFUND: { label: 'คืนเงินค่าซ่อมเพิ่ม', icon: '↩️', kind: 'refund' },
  REVERSAL:                  { label: 'ยกเลิกรายการ', icon: '↩️', kind: 'refund' },
  OWNER_DRAW:                { label: 'เจ้าของเอาเงินออก', icon: '👤', kind: 'owner' },
  CASH_WITHDRAWAL:           { label: 'เงินออกจากลิ้นชัก (อื่นๆ)', icon: '↗️', kind: 'owner' },
  CASH_DEPOSIT:              { label: 'เงินใส่ลิ้นชัก (ทอน / เจ้าของเติม)', icon: '↘️', kind: 'owner' },
  BANK_DEPOSIT:              { label: 'ฝากเงินเข้าธนาคาร', icon: '🏦', kind: 'owner' },
  OPENING:                   { label: 'เงินทอนเปิดกะ', icon: '🪙', kind: 'owner' },
  MANUAL:                    { label: 'รายการอื่น', icon: '•', kind: 'owner' },
}

export function ledgerLabel(source?: string | null) {
  if (!source) return 'อื่นๆ'
  return LEDGER_SOURCE[source]?.label ?? source
}
