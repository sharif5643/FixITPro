/**
 * What a sale receipt says beyond the lines and totals — the same on the web receipt and the
 * thermal receipt the apps print.
 */

type Leg = { paymentMethod: string; amount: number | string }
type SaleLike = {
  paymentMethod: string
  amountPaid: number | string
  change: number | string
  total: number | string
  status?: string | null
  voidReason?: string | null
  voidedAt?: string | null
  payments?: Leg[] | null
  refunds?: Array<{
    refundNumber: string
    createdAt: string
    totalRefund: number | string
    items?: Array<{ quantity: number; total: number | string; product?: { name?: string | null } | null }> | null
  }> | null
}

/**
 * Each payment as the customer handed it over. The legs are stored net of the change (they add up
 * to the bill), so the change goes back on the cash leg it was given from — then the legs add up
 * to "รับเงินรวม" and the slip reads 20,000 + 7,000 = 27,000, change 1,020.
 */
export function receiptPaymentLegs(sale: SaleLike): { paymentMethod: string; amount: number }[] {
  const legs = (sale.payments ?? []).map((l) => ({ paymentMethod: l.paymentMethod, amount: Number(l.amount) }))
  const change = Number(sale.change ?? 0)
  if (change <= 0) return legs
  const cash = legs.find((l) => l.paymentMethod === 'CASH')
  if (cash) cash.amount = Math.round((cash.amount + change) * 100) / 100
  return legs
}

/** A sold IMEI on a line and when its warranty ends, if the product has one. */
export function soldSerials(item: { serialNumbers?: Array<{ serial: string; warrantyExpiresAt?: string | null }> | null }) {
  return (item.serialNumbers ?? []).map((s) => ({ serial: s.serial, warrantyUntil: s.warrantyExpiresAt ?? null }))
}

/** Voided, or goods taken back: printed on every reprint so an old receipt cannot pass for a live one. */
export function saleAfterSale(sale: SaleLike) {
  const voided = sale.status === 'VOIDED'
  const refunds = (sale.refunds ?? []).map((r) => ({
    number: r.refundNumber,
    at: r.createdAt,
    total: Number(r.totalRefund),
    items: (r.items ?? []).map((i) => ({ name: i.product?.name ?? 'สินค้า', quantity: i.quantity, total: Number(i.total) })),
  }))
  const refunded = refunds.reduce((s, r) => s + r.total, 0)
  return {
    voided,
    voidReason: sale.voidReason ?? null,
    voidedAt: sale.voidedAt ?? null,
    refunds,
    refunded,
    netAfterRefunds: Math.max(0, Number(sale.total) - refunded),
  }
}
