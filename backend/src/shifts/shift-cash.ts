/**
 * Money of a shift that is not a sale, repair payment or expense (ShiftCashMovement), and the
 * rules that put refunds and supplier payments in the right shift. Shared by the shift totals
 * (shifts.service) and the per-person ledger (shift-ledger), so both always agree.
 */
export const SHIFT_CASH_KIND = {
  /** cash put into the drawer by hand (change float, money from the owner, …) */
  MANUAL_IN: 'MANUAL_IN',
  /** cash taken out of the drawer by hand (owner takes money, bank deposit, …) */
  MANUAL_OUT: 'MANUAL_OUT',
  /** repair money given back to the customer, in the shift that paid it out */
  REPAIR_REFUND: 'REPAIR_REFUND',
  /** repair money a shift received and that was given back later: keeps that shift's figures */
  REPAIR_PAYMENT_KEPT: 'REPAIR_PAYMENT_KEPT',
} as const;

/** What a repair movement refers to (referenceType): the final payment, the deposit, a debt payment */
export const REPAIR_MONEY = {
  FINAL: 'REPAIR_FINAL',
  DEPOSIT: 'REPAIR_DEPOSIT',
  ADDITIONAL: 'REPAIR_ADDITIONAL',
} as const;

/** Refunds paid out in this shift; older refunds (no shift recorded) count against the sale's shift. */
export function refundsOfShiftWhere(shiftId: string) {
  return { OR: [{ shiftId }, { shiftId: null, sale: { shiftId } }] };
}

/**
 * Supplier payments made while the shift was open. They carry no shift, so they are matched by
 * time, and by the branch of the purchase order: a shop with several branches must not take one
 * branch's payment out of every other branch's drawer.
 */
export function supplierPaymentsOfShiftWhere(shift: { openedAt: Date; closedAt: Date | null; branchId?: string | null; user?: { tenantId: string | null } | null }) {
  const purchaseOrder: Record<string, unknown> = {};
  if (shift.user?.tenantId) purchaseOrder.supplier = { tenantId: shift.user.tenantId };
  if (shift.branchId) purchaseOrder.branchId = shift.branchId;
  return {
    paidAt: { gte: shift.openedAt, lt: shift.closedAt ?? new Date() },
    ...(Object.keys(purchaseOrder).length ? { purchaseOrder } : {}),
  };
}

export interface ShiftCashMovementRow {
  kind: string
  direction: string
  amount: unknown
  paymentMethod: string
  referenceType?: string | null
}

export function movementTotals(rows: ShiftCashMovementRow[]) {
  const t = {
    manualIn: 0, manualOut: 0, manualCount: 0,
    /** cash given back to customers for repairs in this shift */
    repairRefundCash: 0, repairRefundTotal: 0,
    /** repair money this shift received before it was given back later, per payment method */
    keptFinal: {} as Record<string, number>, keptFinalCount: 0,
    keptDepositCash: 0, keptAdditionalCash: 0,
  };
  for (const r of rows) {
    const amount = Number(r.amount ?? 0);
    const cash = r.paymentMethod === 'CASH';
    switch (r.kind) {
      case SHIFT_CASH_KIND.MANUAL_IN:
        t.manualIn += amount; t.manualCount += 1; break;
      case SHIFT_CASH_KIND.MANUAL_OUT:
        t.manualOut += amount; t.manualCount += 1; break;
      case SHIFT_CASH_KIND.REPAIR_REFUND:
        t.repairRefundTotal += amount;
        if (cash) t.repairRefundCash += amount;
        break;
      case SHIFT_CASH_KIND.REPAIR_PAYMENT_KEPT:
        if (r.referenceType === REPAIR_MONEY.DEPOSIT) { if (cash) t.keptDepositCash += amount; }
        else if (r.referenceType === REPAIR_MONEY.ADDITIONAL) { if (cash) t.keptAdditionalCash += amount; }
        else { t.keptFinal[r.paymentMethod] = (t.keptFinal[r.paymentMethod] ?? 0) + amount; t.keptFinalCount += 1; }
        break;
    }
  }
  return t;
}
