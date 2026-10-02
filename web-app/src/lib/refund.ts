// Default refund price per unit = what the customer actually paid for one unit:
// line total (after line discount) / quantity, scaled by the bill-level discount.
// Rounded down to the satang so a full refund never exceeds the bill total
// (the backend rejects refunds above the amount paid).
export function refundUnitPrice(
  sale: { subtotal: number | string; total: number | string },
  item: { quantity: number; price: number | string; total: number | string },
): number {
  const unit     = item.quantity > 0 ? Number(item.total) / item.quantity : Number(item.price)
  const subtotal = Number(sale.subtotal)
  const ratio    = subtotal > 0 ? Math.min(1, Number(sale.total) / subtotal) : 1
  return Math.floor(unit * ratio * 100 + 1e-6) / 100
}
