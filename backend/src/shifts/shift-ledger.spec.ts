import { buildShiftLedger, staffMoneyOf } from './shift-ledger';

const t = (h: number) => new Date(`2026-10-07T0${h}:00:00Z`);
function prisma() {
  return {
    sale: { findMany: jest.fn(async () => [
      { receiptNumber: 'R1', createdAt: t(1), total: 500, paymentMethod: 'CASH', userId: 'a', payments: [] },
      { receiptNumber: 'R2', createdAt: t(2), total: 800, paymentMethod: 'SPLIT', userId: 'b',
        payments: [{ paymentMethod: 'CASH', amount: 300 }, { paymentMethod: 'TRANSFER', amount: 500 }] },
    ]) },
    saleRefund: { findMany: jest.fn(async () => [{ refundNumber: 'F1', createdAt: t(3), totalRefund: 100, paymentMethod: 'CASH', createdById: 'a' }]) },
    repair: { findMany: jest.fn(async ({ where }: any) => where.paymentShiftId
      ? [{ id: 'r1', ticketNumber: 'T1', paidAt: t(4), paidAmount: 1000, paymentMethod: 'CASH' }]
      : [{ id: 'r2', ticketNumber: 'T2', receivedAt: t(1), deposit: 200, depositPaymentMethod: 'TRANSFER' }]) },
    repairAdditionalPayment: { findMany: jest.fn(async () => [{ createdAt: t(5), amount: 150, paymentMethod: 'CASH', createdById: 'b', repair: { ticketNumber: 'T3' } }]) },
    packageSale: { findMany: jest.fn(async () => [{ receiptNumber: 'P1', createdAt: t(2), packageAmount: 100, creditAmount: 0, paymentMethod: 'CASH', createdById: 'b' }]) },
    packageSaleDebtPayment: { findMany: jest.fn(async () => []) },
    expense: { findMany: jest.fn(async () => [{ description: 'ค่าน้ำแข็ง', createdAt: t(6), amount: 50, paymentMethod: 'CASH', createdById: 'b' }]) },
    supplierPayment: { findMany: jest.fn(async () => []) },
    auditLog: { findMany: jest.fn(async () => [
      { action: 'REPAIR_PAYMENT', entityId: 'r1', actorId: 'a', createdAt: t(4) },
      { action: 'REPAIR_CREATED', entityId: 'r2', actorId: 'b', createdAt: t(1) },
    ]) },
    user: { findMany: jest.fn(async () => [{ id: 'a', name: 'เอ' }, { id: 'b', name: 'บี' }]) },
  };
}

describe('who took the money in a shift', () => {
  const shift = { id: 's1', openedAt: t(0), closedAt: t(7), user: { tenantId: 't1' } };

  it('lists every movement in time order with the person, method and sign', async () => {
    const e = await buildShiftLedger(prisma(), shift);
    expect(e.map((x) => [x.kind, x.name, x.method, x.amount])).toEqual([
      ['SALE', 'เอ', 'CASH', 500],
      ['REPAIR_DEPOSIT', 'บี', 'TRANSFER', 200],
      ['SALE', 'บี', 'CASH', 300],
      ['SALE', 'บี', 'TRANSFER', 500],
      ['PACKAGE_SALE', 'บี', 'CASH', 100],
      ['REFUND', 'เอ', 'CASH', -100],
      ['REPAIR_PAYMENT', 'เอ', 'CASH', 1000],
      ['REPAIR_DEBT_PAYMENT', 'บี', 'CASH', 150],
      ['EXPENSE', 'บี', 'CASH', -50],
    ]);
  });

  it("per person: cash in, other money, cash out, and each one's net cash adds up to the drawer", async () => {
    const staff = staffMoneyOf(await buildShiftLedger(prisma(), shift));
    const a = staff.find((x) => x.name === 'เอ')!;
    const b = staff.find((x) => x.name === 'บี')!;
    expect(a).toMatchObject({ cashIn: 1500, cashOut: 100, otherIn: 0, netCash: 1400 });
    expect(b).toMatchObject({ cashIn: 550, cashOut: 50, otherIn: 700, netCash: 500 });
    // opening 1000 + net cash of everyone = cash the drawer should hold
    expect(1000 + staff.reduce((s, x) => s + x.netCash, 0)).toBe(2900);
  });
});
