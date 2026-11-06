import { PrismaService } from '../../database/prisma.service';
import { INCOME_CATEGORIES } from '../../shifts/shift-cash';

/**
 * One definition of "money for a period", shared by the dashboard, the profit report and the
 * daily closing report so they show the same numbers.
 *
 *  - POS sales: the bill total (after line and bill discounts) of non-voided sales made in the
 *    period, minus refunds paid out in the period. The cost of items is reduced by the cost of
 *    items that came back in a refund.
 *  - Repairs: money actually received in the period — deposits taken at intake (repair not cancelled),
 *    payments at pickup (fully or partly paid) and later debt payments. Repair costs (parts +
 *    labour + extra costs such as the parts' delivery fee) count when the device is paid for.
 *  - Money taken at the counter without a bill (quick money in for goods or a service): revenue,
 *    shown on its own as otherIncome.
 *  - SIM / packages: revenue is the shop's profit (commission); the face value is reported
 *    separately as packageAmount.
 *  - byMethod: money received per payment method, net of refunds paid out. Split-payment sales
 *    use their payment legs (already net of change).
 *
 * Before this, refunds were never subtracted, the profit report ignored bill discounts, and
 * repair deposits / partial payments / debt payments were never counted as revenue.
 */
export interface MoneyRow {
  date: Date;
  branchId: string | null;
  /** what this money is: the document it links to (a bill, a repair job, a SIM sale, a shift) */
  ref?: MoneyRef;
}

export interface MoneyRef {
  kind: 'SALE' | 'REPAIR' | 'PACKAGE' | 'SHIFT';
  id: string;
  label: string;
}

export interface PeriodMoneyRows {
  sales: (MoneyRow & {
    total: number;
    cost: number;
    legs: { method: string; amount: number }[];
  })[];
  refunds: (MoneyRow & { amount: number; cost: number; method: string })[];
  deposits: (MoneyRow & { amount: number; method: string })[];
  pickups: (MoneyRow & { amount: number; method: string; cost: number })[];
  debtPayments: (MoneyRow & { amount: number; method: string })[];
  /** paid: what was paid at the counter (a credit sale brings in only part), by method */
  packages: (MoneyRow & { profit: number; amount: number; paid: number; method: string })[];
  otherIncome: (MoneyRow & { amount: number; method: string })[];
}

export interface MoneyTotals {
  salesCount: number;
  posGross: number;
  posRefunds: number;
  posRevenue: number;
  posCOGS: number;
  repairDeposits: number;
  repairPickup: number;
  repairDebtPayments: number;
  repairRevenue: number;
  repairPaymentCount: number;
  repairCOGS: number;
  packageCount: number;
  packageProfit: number;
  packageAmount: number;
  otherIncome: number;
  otherIncomeCount: number;
  totalRevenue: number;
  grossProfit: number;
  byMethod: Record<string, number>;
}

/**
 * branchWhere: the same filter used for models with a branchId (`{ branchId }` or the tenant's
 * branch scope). tenantId scopes package sales, which have no branch relation.
 */
export async function loadPeriodMoney(
  prisma: PrismaService,
  params: { start: Date; end: Date; branchWhere: Record<string, any>; branchId?: string; tenantId?: string | null },
): Promise<PeriodMoneyRows> {
  const { start, end, branchWhere } = params;
  const inRange = { gte: start, lt: end };

  const [sales, refunds, deposits, pickups, debtPayments, packages, otherIncome] = await Promise.all([
    prisma.sale.findMany({
      where: { createdAt: inRange, status: { not: 'VOIDED' }, ...branchWhere },
      select: {
        id: true, receiptNumber: true, createdAt: true, branchId: true, total: true, paymentMethod: true,
        items: { select: { costPrice: true, quantity: true } },
        payments: { select: { paymentMethod: true, amount: true } },
      },
    }),
    prisma.saleRefund.findMany({
      where: { createdAt: inRange, sale: { status: { not: 'VOIDED' }, ...branchWhere } },
      select: {
        createdAt: true, totalRefund: true, paymentMethod: true,
        sale: { select: { id: true, receiptNumber: true, branchId: true } },
        items: { select: { quantity: true, saleItem: { select: { costPrice: true } } } },
      },
    }),
    prisma.repair.findMany({
      where: { receivedAt: inRange, deposit: { gt: 0 }, status: { not: 'CANCELLED' }, ...branchWhere },
      select: { id: true, ticketNumber: true, receivedAt: true, branchId: true, deposit: true, depositPaymentMethod: true },
    }),
    prisma.repair.findMany({
      where: { paidAt: inRange, paymentStatus: { in: ['PAID', 'PARTIAL'] }, ...branchWhere },
      select: {
        id: true, ticketNumber: true, paidAt: true, branchId: true, paidAmount: true, paymentMethod: true, actualLaborCost: true,
        parts: { where: { isVoided: false }, select: { costPrice: true, price: true, quantity: true } },
        extraCosts: { select: { amount: true } },
      },
    }),
    prisma.repairAdditionalPayment.findMany({
      where: { createdAt: inRange, repair: branchWhere },
      select: { createdAt: true, amount: true, paymentMethod: true, repair: { select: { id: true, ticketNumber: true, branchId: true } } },
    }),
    prisma.packageSale.findMany({
      where: {
        createdAt: inRange,
        ...(params.tenantId ? { createdBy: { tenantId: params.tenantId } } : {}),
      },
      select: { id: true, receiptNumber: true, createdAt: true, profit: true, packageAmount: true, creditAmount: true, paymentMethod: true, shiftId: true },
    }),
    prisma.shiftCashMovement.findMany({
      where: {
        createdAt: inRange, kind: 'MANUAL_IN', category: { in: [...INCOME_CATEGORIES] },
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        ...(params.branchId ? { branchId: params.branchId } : {}),
      },
      select: { id: true, shiftId: true, reason: true, createdAt: true, branchId: true, amount: true, paymentMethod: true },
    }),
  ]);

  // PackageSale has no branch column; its shift says where it was sold.
  const shiftIds = [...new Set(packages.map((p) => p.shiftId).filter((id): id is string => !!id))];
  const shiftBranch = new Map(
    shiftIds.length
      ? (await prisma.shift.findMany({ where: { id: { in: shiftIds } }, select: { id: true, branchId: true } }))
          .map((sh) => [sh.id, sh.branchId] as const)
      : [],
  );
  const packageRows = packages
    .map((p) => ({ ...p, branchId: p.shiftId ? shiftBranch.get(p.shiftId) ?? null : null }))
    .filter((p) => !params.branchId || p.branchId === params.branchId);

  return {
    sales: sales.map((s) => ({
      date: s.createdAt,
      branchId: s.branchId,
      ref: { kind: 'SALE' as const, id: s.id, label: s.receiptNumber },
      total: Number(s.total),
      cost: s.items.reduce((sum, i) => sum + Number(i.costPrice ?? 0) * i.quantity, 0),
      legs: s.payments.length > 0
        ? s.payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) }))
        : [{ method: s.paymentMethod, amount: Number(s.total) }],
    })),
    refunds: refunds.map((r) => ({
      date: r.createdAt,
      branchId: r.sale.branchId,
      ref: { kind: 'SALE' as const, id: r.sale.id, label: r.sale.receiptNumber },
      amount: Number(r.totalRefund),
      method: r.paymentMethod,
      cost: r.items.reduce((sum, i) => sum + Number(i.saleItem.costPrice ?? 0) * i.quantity, 0),
    })),
    deposits: deposits.map((r) => ({
      date: r.receivedAt,
      branchId: r.branchId,
      ref: { kind: 'REPAIR' as const, id: r.id, label: r.ticketNumber },
      amount: Number(r.deposit ?? 0),
      method: r.depositPaymentMethod ?? 'CASH',
    })),
    pickups: pickups.map((r) => ({
      date: r.paidAt as Date,
      branchId: r.branchId,
      ref: { kind: 'REPAIR' as const, id: r.id, label: r.ticketNumber },
      amount: Number(r.paidAmount ?? 0),
      method: r.paymentMethod ?? 'CASH',
      cost: Number(r.actualLaborCost ?? 0)
        + r.parts.reduce((sum, p) => sum + Number(p.costPrice ?? p.price) * p.quantity, 0)
        // e.g. the delivery fee for the parts ordered for this job
        + r.extraCosts.reduce((sum, c) => sum + Number(c.amount), 0),
    })),
    debtPayments: debtPayments.map((p) => ({
      date: p.createdAt,
      branchId: p.repair.branchId,
      ref: { kind: 'REPAIR' as const, id: p.repair.id, label: p.repair.ticketNumber },
      amount: Number(p.amount),
      method: p.paymentMethod,
    })),
    packages: packageRows.map((p) => ({
      date: p.createdAt,
      branchId: p.branchId,
      ref: { kind: 'PACKAGE' as const, id: p.id, label: p.receiptNumber },
      profit: Number(p.profit),
      amount: Number(p.packageAmount),
      paid: Number(p.packageAmount) - Number(p.creditAmount ?? 0),
      method: p.paymentMethod as string,
    })),
    otherIncome: otherIncome.map((m) => ({
      date: m.createdAt,
      branchId: m.branchId,
      ref: { kind: 'SHIFT' as const, id: m.shiftId, label: m.reason || 'รับเงินไม่มีบิล' },
      amount: Number(m.amount),
      method: m.paymentMethod,
    })),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Totals over the rows, optionally only those matching `keep` (e.g. one day or one branch). */
export function summarizeMoney(rows: PeriodMoneyRows, keep: (r: MoneyRow) => boolean = () => true): MoneyTotals {
  const sales = rows.sales.filter(keep);
  const refunds = rows.refunds.filter(keep);
  const deposits = rows.deposits.filter(keep);
  const pickups = rows.pickups.filter(keep);
  const debts = rows.debtPayments.filter(keep);
  const packages = rows.packages.filter(keep);
  const other = (rows.otherIncome ?? []).filter(keep);
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

  const byMethod: Record<string, number> = {};
  const add = (method: string, amount: number) => { byMethod[method] = round2((byMethod[method] ?? 0) + amount); };
  sales.forEach((s) => s.legs.forEach((l) => add(l.method, l.amount)));
  refunds.forEach((r) => add(r.method, -r.amount));
  deposits.forEach((d) => add(d.method, d.amount));
  pickups.forEach((p) => add(p.method, p.amount));
  debts.forEach((d) => add(d.method, d.amount));
  other.forEach((o) => add(o.method, o.amount));

  const posGross = sum(sales, (s) => s.total);
  const posRefunds = sum(refunds, (r) => r.amount);
  const posRevenue = posGross - posRefunds;
  const posCOGS = sum(sales, (s) => s.cost) - sum(refunds, (r) => r.cost);
  const repairDeposits = sum(deposits, (d) => d.amount);
  const repairPickup = sum(pickups, (p) => p.amount);
  const repairDebtPayments = sum(debts, (d) => d.amount);
  const repairRevenue = repairDeposits + repairPickup + repairDebtPayments;
  const repairCOGS = sum(pickups, (p) => p.cost);
  const packageProfit = sum(packages, (p) => p.profit);
  const packageAmount = sum(packages, (p) => p.amount);
  const otherIncome = sum(other, (o) => o.amount);

  return {
    salesCount: sales.length,
    posGross: round2(posGross),
    posRefunds: round2(posRefunds),
    posRevenue: round2(posRevenue),
    posCOGS: round2(posCOGS),
    repairDeposits: round2(repairDeposits),
    repairPickup: round2(repairPickup),
    repairDebtPayments: round2(repairDebtPayments),
    repairRevenue: round2(repairRevenue),
    repairPaymentCount: deposits.length + pickups.length + debts.length,
    repairCOGS: round2(repairCOGS),
    packageCount: packages.length,
    packageProfit: round2(packageProfit),
    packageAmount: round2(packageAmount),
    otherIncome: round2(otherIncome),
    otherIncomeCount: other.length,
    totalRevenue: round2(posRevenue + repairRevenue + packageProfit + otherIncome),
    grossProfit: round2(posRevenue - posCOGS + repairRevenue - repairCOGS + packageProfit + otherIncome),
    byMethod,
  };
}

/** Bangkok calendar date (YYYY-MM-DD) of an instant. */
export const bangkokDay = (d: Date) => new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
