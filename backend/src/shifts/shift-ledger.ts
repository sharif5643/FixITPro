/**
 * Every money movement of a shift, with who did it: the "who took the money" view for a shared
 * drawer. Same sources as the shift's expected cash (shifts.service computeShiftTotals), so the
 * opening cash plus everyone's net cash equals the cash the drawer should hold.
 */
import { REPAIR_MONEY, SHIFT_CASH_KIND, refundsOfShiftWhere, supplierPaymentsOfShiftWhere } from './shift-cash';

export type LedgerKind =
  | 'SALE' | 'REFUND' | 'REPAIR_PAYMENT' | 'REPAIR_DEPOSIT' | 'REPAIR_DEBT_PAYMENT'
  | 'PACKAGE_SALE' | 'PACKAGE_DEBT_PAYMENT' | 'EXPENSE' | 'SUPPLIER_PAYMENT'
  | 'CASH_IN' | 'CASH_OUT' | 'REPAIR_REFUND';

export interface LedgerEntry {
  at: Date
  kind: LedgerKind
  ref: string
  method: string
  /** money in is positive, money out negative */
  amount: number
  userId: string | null
  name: string
}

export interface StaffMoney {
  userId: string | null
  name: string
  cashIn: number
  otherIn: number
  cashOut: number
  otherOut: number
  /** cash this person put into (or took out of) the drawer */
  netCash: number
  count: number
}

type Db = any;

export async function buildShiftLedger(
  prisma: Db,
  shift: { id: string; openedAt: Date; closedAt: Date | null; branchId?: string | null; user?: { tenantId: string | null } | null },
): Promise<LedgerEntry[]> {
  const shiftId = shift.id;
  const until = shift.closedAt ?? new Date();
  const [sales, refunds, repairs, deposits, debts, packages, packageDebts, expenses, supplierPays, movements] = await Promise.all([
    prisma.sale.findMany({
      where: { shiftId, status: { not: 'VOIDED' } },
      select: { receiptNumber: true, createdAt: true, total: true, paymentMethod: true, userId: true, payments: { select: { paymentMethod: true, amount: true } } },
    }),
    prisma.saleRefund.findMany({
      where: refundsOfShiftWhere(shiftId),
      select: { refundNumber: true, createdAt: true, totalRefund: true, paymentMethod: true, createdById: true },
    }),
    prisma.repair.findMany({
      where: { paymentShiftId: shiftId },
      select: { id: true, ticketNumber: true, paidAt: true, paidAmount: true, paymentMethod: true },
    }),
    prisma.repair.findMany({
      where: { depositShiftId: shiftId },
      select: { id: true, ticketNumber: true, receivedAt: true, deposit: true, depositPaymentMethod: true },
    }),
    prisma.repairAdditionalPayment.findMany({
      where: { shiftId },
      select: { createdAt: true, amount: true, paymentMethod: true, createdById: true, repair: { select: { ticketNumber: true } } },
    }),
    prisma.packageSale.findMany({
      where: { shiftId },
      select: { receiptNumber: true, createdAt: true, packageAmount: true, creditAmount: true, paymentMethod: true, createdById: true },
    }),
    prisma.packageSaleDebtPayment.findMany({
      where: { shiftId },
      select: { receiptNumber: true, createdAt: true, amount: true, paymentMethod: true, createdById: true },
    }),
    prisma.expense.findMany({
      where: { shiftId, voidedAt: null },
      select: { description: true, createdAt: true, amount: true, paymentMethod: true, createdById: true },
    }),
    prisma.supplierPayment.findMany({
      where: supplierPaymentsOfShiftWhere(shift),
      select: { paidAt: true, amount: true, paymentMethod: true, purchaseOrderId: true, purchaseOrder: { select: { poNumber: true } } },
    }),
    prisma.shiftCashMovement.findMany({
      where: { shiftId },
      select: { createdAt: true, kind: true, amount: true, paymentMethod: true, reason: true, referenceType: true, referenceId: true, createdById: true },
    }),
  ]);

  // Who took a repair payment / deposit, and who paid a supplier: from the audit log
  const kept = movements.filter((m: any) => m.kind === SHIFT_CASH_KIND.REPAIR_PAYMENT_KEPT && m.referenceId);
  const repairIds = [...repairs.map((r: any) => r.id), ...deposits.map((r: any) => r.id), ...kept.map((m: any) => m.referenceId)];
  const poIds = supplierPays.map((p: any) => p.purchaseOrderId);
  const logs = repairIds.length || poIds.length
    ? await prisma.auditLog.findMany({
        where: {
          OR: [
            ...(repairIds.length ? [{ action: { in: ['REPAIR_PAYMENT', 'REPAIR_CREATED'] }, entityId: { in: repairIds } }] : []),
            ...(poIds.length ? [{ action: 'PO_PAYMENT', entityId: { in: poIds } }] : []),
          ],
        },
        select: { action: true, entityId: true, actorId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const actorOf = (action: string, entityId: string, near?: Date | null) => {
    const list = logs.filter((l: any) => l.action === action && l.entityId === entityId);
    if (!near || list.length <= 1) return list[0]?.actorId ?? null;
    return list.reduce((best: any, l: any) =>
      Math.abs(+l.createdAt - +near) < Math.abs(+best.createdAt - +near) ? l : best).actorId ?? null;
  };

  const entries: Omit<LedgerEntry, 'name'>[] = [];
  for (const s of sales) {
    const legs = s.payments?.length
      ? s.payments.map((p: any) => ({ method: p.paymentMethod, amount: Number(p.amount) }))
      : [{ method: s.paymentMethod, amount: Number(s.total) }];
    for (const leg of legs) entries.push({ at: s.createdAt, kind: 'SALE', ref: s.receiptNumber, method: leg.method, amount: leg.amount, userId: s.userId });
  }
  for (const r of refunds) entries.push({ at: r.createdAt, kind: 'REFUND', ref: r.refundNumber, method: r.paymentMethod, amount: -Number(r.totalRefund), userId: r.createdById });
  for (const r of repairs) entries.push({ at: r.paidAt ?? until, kind: 'REPAIR_PAYMENT', ref: r.ticketNumber, method: r.paymentMethod ?? 'CASH', amount: Number(r.paidAmount ?? 0), userId: actorOf('REPAIR_PAYMENT', r.id, r.paidAt) });
  for (const r of deposits) {
    if (!Number(r.deposit)) continue;
    entries.push({ at: r.receivedAt, kind: 'REPAIR_DEPOSIT', ref: r.ticketNumber, method: r.depositPaymentMethod ?? 'CASH', amount: Number(r.deposit), userId: actorOf('REPAIR_CREATED', r.id) });
  }
  for (const d of debts) entries.push({ at: d.createdAt, kind: 'REPAIR_DEBT_PAYMENT', ref: d.repair?.ticketNumber ?? '-', method: d.paymentMethod, amount: Number(d.amount), userId: d.createdById });
  for (const p of packages) {
    const received = Number(p.packageAmount) - Number(p.creditAmount ?? 0);
    if (received) entries.push({ at: p.createdAt, kind: 'PACKAGE_SALE', ref: p.receiptNumber, method: p.paymentMethod, amount: received, userId: p.createdById });
  }
  for (const p of packageDebts) entries.push({ at: p.createdAt, kind: 'PACKAGE_DEBT_PAYMENT', ref: p.receiptNumber, method: p.paymentMethod, amount: Number(p.amount), userId: p.createdById });
  for (const e of expenses) entries.push({ at: e.createdAt, kind: 'EXPENSE', ref: e.description, method: e.paymentMethod, amount: -Number(e.amount), userId: e.createdById });
  for (const m of movements) {
    const amount = Number(m.amount);
    if (m.kind === SHIFT_CASH_KIND.MANUAL_IN) entries.push({ at: m.createdAt, kind: 'CASH_IN', ref: m.reason ?? '-', method: m.paymentMethod, amount, userId: m.createdById });
    else if (m.kind === SHIFT_CASH_KIND.MANUAL_OUT) entries.push({ at: m.createdAt, kind: 'CASH_OUT', ref: m.reason ?? '-', method: m.paymentMethod, amount: -amount, userId: m.createdById });
    else if (m.kind === SHIFT_CASH_KIND.REPAIR_REFUND) entries.push({ at: m.createdAt, kind: 'REPAIR_REFUND', ref: m.reason ?? '-', method: m.paymentMethod, amount: -amount, userId: m.createdById });
    else if (m.kind === SHIFT_CASH_KIND.REPAIR_PAYMENT_KEPT) {
      // createdAt is when the money was taken; the person comes from the audit log like a live payment
      // (a debt payment row keeps the person who took it in createdById)
      const deposit = m.referenceType === REPAIR_MONEY.DEPOSIT;
      const additional = m.referenceType === REPAIR_MONEY.ADDITIONAL;
      const kind: LedgerKind = deposit ? 'REPAIR_DEPOSIT' : additional ? 'REPAIR_DEBT_PAYMENT' : 'REPAIR_PAYMENT';
      const userId = additional ? m.createdById
        : actorOf(deposit ? 'REPAIR_CREATED' : 'REPAIR_PAYMENT', m.referenceId, deposit ? undefined : m.createdAt) ?? m.createdById;
      entries.push({ at: m.createdAt, kind, ref: m.reason ?? '-', method: m.paymentMethod, amount, userId });
    }
  }
  for (const p of supplierPays) entries.push({ at: p.paidAt, kind: 'SUPPLIER_PAYMENT', ref: p.purchaseOrder?.poNumber ?? '-', method: p.paymentMethod, amount: -Number(p.amount), userId: actorOf('PO_PAYMENT', p.purchaseOrderId, p.paidAt) });

  const ids = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map<string, string>(users.map((u: any) => [u.id, u.name]));
  return entries
    .map((e) => ({ ...e, name: e.userId ? (nameOf.get(e.userId) ?? '-') : 'ไม่ระบุ' }))
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

/** Per person: cash and other money in and out, and the cash they put into the drawer. */
export function staffMoneyOf(entries: LedgerEntry[]): StaffMoney[] {
  const map = new Map<string, StaffMoney>();
  for (const e of entries) {
    const key = e.userId ?? '-';
    const row = map.get(key) ?? { userId: e.userId, name: e.name, cashIn: 0, otherIn: 0, cashOut: 0, otherOut: 0, netCash: 0, count: 0 };
    const cash = e.method === 'CASH';
    if (e.amount >= 0) cash ? (row.cashIn += e.amount) : (row.otherIn += e.amount);
    else cash ? (row.cashOut += -e.amount) : (row.otherOut += -e.amount);
    if (cash) row.netCash += e.amount;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.netCash - a.netCash);
}
