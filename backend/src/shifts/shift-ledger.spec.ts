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
    shiftCashMovement: { findMany: jest.fn(async () => [] as any[]) },
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

describe('cash put in / taken out by hand, and repair money given back', () => {
  const shift = { id: 's1', openedAt: t(0), closedAt: t(7), user: { tenantId: 't1' } };

  it('shows them with the right sign and person; the original taker keeps a repair given back later', async () => {
    const db = prisma();
    db.shiftCashMovement.findMany = jest.fn(async () => [
      { createdAt: t(5), kind: 'MANUAL_OUT', amount: 1000, paymentMethod: 'CASH', reason: 'เจ้าของเบิก', referenceType: null, referenceId: null, createdById: 'a' },
      { createdAt: t(5), kind: 'MANUAL_IN', amount: 200, paymentMethod: 'CASH', reason: 'เงินทอนเพิ่ม', referenceType: null, referenceId: null, createdById: 'b' },
      { createdAt: t(6), kind: 'REPAIR_REFUND', amount: 300, paymentMethod: 'CASH', reason: 'คืนเงินงานซ่อม T9', referenceType: 'REPAIR_FINAL', referenceId: 'r9', createdById: 'b' },
      { createdAt: t(4), kind: 'REPAIR_PAYMENT_KEPT', amount: 700, paymentMethod: 'CASH', reason: 'T8', referenceType: 'REPAIR_FINAL', referenceId: 'r1', createdById: 'b' },
    ]);
    const e = await buildShiftLedger(db, shift);
    const pick = (k: string) => e.filter((x) => x.kind === k).map((x) => [x.name, x.amount]);
    expect(pick('CASH_OUT')).toEqual([['เอ', -1000]]);
    expect(pick('CASH_IN')).toEqual([['บี', 200]]);
    expect(pick('REPAIR_REFUND')).toEqual([['บี', -300]]);
    // r1 was paid to 'เอ' (audit log), so the kept payment is theirs
    expect(pick('REPAIR_PAYMENT')).toEqual([['เอ', 1000], ['เอ', 700]]);
  });
});

