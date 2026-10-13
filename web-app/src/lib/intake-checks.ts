/**
 * Things worth a second look before a repair is saved — typos that are costly later: a deposit
 * above the estimate (500 typed as 5000 throws the shift cash off) and a phone number too short to
 * reach the customer or find them next time. They warn and ask; they never block.
 */
export function intakeWarnings({ phone, deposit, estimate }: {
  phone?: string | null
  deposit?: number | null
  estimate?: number | null
}): string[] {
  const out: string[] = []
  const digits = (phone ?? '').replace(/\D/g, '')
  if (phone?.trim() && digits.length !== 9 && digits.length !== 10) {
    out.push(`เบอร์โทร "${phone.trim()}" ไม่ครบ 9–10 หลัก — ติดต่อลูกค้าและค้นหาลูกค้าเดิมไม่ได้`)
  }
  const dep = Number(deposit) || 0
  const est = Number(estimate) || 0
  if (dep > 0 && est > 0 && dep > est) {
    out.push(`มัดจำ ${dep.toLocaleString('th-TH')} บาท มากกว่าราคาประเมิน ${est.toLocaleString('th-TH')} บาท`)
  }
  return out
}

/** Ask once about everything that looks off; true when there is nothing to ask or it is confirmed. */
export function confirmIntake(warnings: string[]): boolean {
  if (!warnings.length) return true
  return window.confirm(`ตรวจสอบก่อนบันทึก:\n\n• ${warnings.join('\n• ')}\n\nถูกต้องแล้ว บันทึกเลยไหม?`)
}
