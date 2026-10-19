/**
 * A repair carries two estimates: estimateCost is what was written at intake, estimatedTotal is
 * the latest price sent to the customer (every re-quote updates only this one). Everything shown
 * or charged uses the latest — the same order the API uses when taking payment.
 */
type Priced = {
  estimatedTotal?: number | string | null
  estimateCost?: number | string | null
  finalCost?: number | string | null
  estimatedLaborCost?: number | string | null
  estimatedPartsCost?: number | string | null
}

const n = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))

/** The latest quote: the price sent to the customer, else the intake estimate (0 = none). */
export function repairQuote(r: Priced): number {
  return n(r.estimatedTotal) ?? n(r.estimateCost) ?? 0
}

/** What the job costs the customer: the final price once set, else the latest quote. */
export function repairPrice(r: Priced): number {
  return n(r.finalCost) ?? repairQuote(r)
}

/** The intake estimate, when the job has since been quoted at a different price. */
export function intakeEstimateIfChanged(r: Priced): number | null {
  const intake = n(r.estimateCost)
  const latest = n(r.estimatedTotal)
  return intake != null && latest != null && intake !== latest ? intake : null
}

/** Labour / parts split from intake — only while it still adds up to the price being charged. */
export function quoteSplit(r: Priced, price = repairQuote(r)): { labor: number; parts: number } | null {
  const labor = n(r.estimatedLaborCost) ?? 0
  const parts = n(r.estimatedPartsCost) ?? 0
  if (labor <= 0 && parts <= 0) return null
  return Math.round((labor + parts) * 100) === Math.round(price * 100) ? { labor, parts } : null
}
