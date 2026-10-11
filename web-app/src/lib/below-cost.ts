/**
 * Selling below cost at the POS. The cost only reaches the screen for people allowed to see it
 * (owner, or the view-cost permission); for everyone else costPrice is missing and nothing is
 * flagged, so staff never learn the cost from a warning.
 */
export interface CostLine {
  /** Price per unit after the line discount */
  unitNet: number
  quantity: number
  costPrice?: number | string | null
}

/** Cost per unit when known (> 0), else null */
export function knownCost(costPrice: number | string | null | undefined): number | null {
  if (costPrice == null || costPrice === '') return null
  const n = Number(costPrice)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Loss on one line (0 when at or above cost, or cost unknown) */
export function lineLoss(line: CostLine): number {
  const cost = knownCost(line.costPrice)
  if (cost == null) return 0
  return Math.max(0, (cost - line.unitNet) * line.quantity)
}

/**
 * Loss on the whole bill after the bill discount: total cost of the lines whose cost is known
 * minus what the customer pays for those lines. 0 when there is no loss or no cost is known.
 */
export function billLoss(lines: CostLine[], billDiscount: number): number {
  let cost = 0
  let net = 0
  let gross = 0
  for (const l of lines) {
    gross += l.unitNet * l.quantity
    const c = knownCost(l.costPrice)
    if (c == null) continue
    cost += c * l.quantity
    net += l.unitNet * l.quantity
  }
  if (cost === 0) return 0
  // Spread the bill discount over the lines in proportion to their price
  const share = gross > 0 ? (net / gross) * billDiscount : 0
  return Math.max(0, Math.round((cost - (net - share)) * 100) / 100)
}

/** Same moving average the server applies when stock comes in at a price (see backend average-cost.ts) */
export function averageCost(stockOnHand: number, currentCost: number, qtyIn: number, unitCost: number): number {
  const onHand = Math.max(0, stockOnHand)
  const r2 = (n: number) => Math.round(n * 100) / 100
  if (onHand === 0 || !(currentCost > 0)) return r2(unitCost)
  return r2((onHand * currentCost + qtyIn * unitCost) / (onHand + qtyIn))
}
