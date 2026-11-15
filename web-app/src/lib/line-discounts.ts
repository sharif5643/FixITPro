/**
 * Per-item discounts that still apply to the cart: only lines still in it, each no more than the
 * line itself. A discount left behind by a removed line (or a quantity lowered after the discount
 * was typed) made the screen ask for less than the bill.
 */
export function effectiveLineDiscounts(
  items: { product: { id: string; price: number | string }; quantity: number }[],
  typed: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const i of items) {
    const d = Math.min(typed.get(i.product.id) ?? 0, Number(i.product.price) * i.quantity)
    if (d > 0) out.set(i.product.id, d)
  }
  return out
}
