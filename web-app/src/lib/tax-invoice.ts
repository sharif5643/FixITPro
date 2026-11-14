/** An abbreviated tax invoice / credit note / full tax invoice as the API returns it (shops that charge VAT) */
export interface TaxInvoiceInfo {
  id: string
  kind: 'ABB' | 'CN' | 'FULL'
  number: string
  issuedAt: string
  sourceType: string
  sourceId: string
  total: number | string
  vatBase: number | string
  vatAmount: number | string
  vatPercent: number | string
  cancelledAt?: string | null
  cancelReason?: string | null
}

/** The tax invoice to print on a repair receipt: the newest of a kind of money that still stands */
export function repairTaxInvoice(list: TaxInvoiceInfo[] | null | undefined, sourceType: 'REPAIR_DEPOSIT' | 'REPAIR_PAYMENT'): TaxInvoiceInfo | null {
  const of = (list ?? []).filter((t) => t.kind === 'ABB' && t.sourceType === sourceType)
  return of.length ? of[of.length - 1] : null
}

/** "สำนักงานใหญ่" / "สาขาที่ 00001" next to the tax id on a tax invoice */
export function taxIdLine(taxId: string, taxBranch?: string | null): string {
  return `เลขประจำตัวผู้เสียภาษี ${taxId}${taxBranch ? ` (${taxBranch})` : ''}`
}

/** Money on a tax document: always with satang (฿140.19) */
export function vatMoney(n: number | string): string {
  return `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
