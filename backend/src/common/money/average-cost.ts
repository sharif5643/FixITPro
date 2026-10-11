/**
 * Moving average cost when stock comes in.
 *
 * The product's cost is what sales and repair parts copy as COGS, so it has to follow what the
 * shop actually pays. Before this, receiving goods at a new price left the first cost in place
 * and profit was overstated whenever a supplier raised prices.
 *
 *   new cost = (stock on hand × current cost + qty in × unit cost) / (stock on hand + qty in)
 *
 * With no stock on hand (or no cost yet) the new unit cost is taken as is. Goods that came in
 * free (unit cost 0 or unknown) leave the cost alone. Call this BEFORE the stock is increased.
 */
export function averageCost(stockOnHand: number, currentCost: number, qtyIn: number, unitCost: number): number {
  const onHand = Math.max(0, stockOnHand);
  if (onHand === 0 || !(currentCost > 0)) return round2(unitCost);
  return round2((onHand * currentCost + qtyIn * unitCost) / (onHand + qtyIn));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type Tx = {
  product: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
};

export interface CostChange {
  productId: string;
  before: number;
  after: number;
}

/** Updates Product.costPrice for stock coming in; returns the change, or null when nothing changed. */
export async function applyAverageCost(
  tx: Tx,
  productId: string,
  qtyIn: number,
  unitCost: number | null | undefined,
): Promise<CostChange | null> {
  if (unitCost == null || !(unitCost > 0) || !(qtyIn > 0)) return null;
  const p = await tx.product.findUnique({ where: { id: productId }, select: { stock: true, costPrice: true } });
  if (!p) return null;
  const before = Number(p.costPrice ?? 0);
  const after = averageCost(Number(p.stock ?? 0), before, qtyIn, unitCost);
  if (after === before) return null;
  await tx.product.update({ where: { id: productId }, data: { costPrice: after } });
  return { productId, before, after };
}
