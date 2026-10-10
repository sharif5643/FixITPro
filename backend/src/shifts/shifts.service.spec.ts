import { ShiftsService } from './shifts.service';
import { mockPrisma } from '../test/prisma-mock';
import { supplierPaymentsOfShiftWhere } from './shift-cash';

const MOCK_SHIFT = {
  id: 'shift1', userId: 'u1', isActive: true, openBalance: 1000,
  openedAt: new Date('2026-07-14T08:00:00Z'), closedAt: null,
  user: { id: 'u1', name: 'Test User', tenantId: 't1' },
};

describe('ShiftsService.closeShift — P0-3', () => {
  let service: ShiftsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    const auditLog = { log: jest.fn(), logWithTx: jest.fn() };
    const notif = { notify: jest.fn().mockResolvedValue(undefined) };
    const carrierWallet = { getShiftCarrierSummary: jest.fn().mockResolvedValue([]) };
    service = new (ShiftsService as any)(prisma, carrierWallet, auditLog, notif);

    (prisma.shift.findFirst as jest.Mock).mockResolvedValue(MOCK_SHIFT);
    (prisma.shift.update as jest.Mock).mockResolvedValue({
      ...MOCK_SHIFT, isActive: false, user: { id: 'u1', name: 'Test User' },
    });
    (prisma.repair.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.supplierPayment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.packageSale.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.expense.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 0 } });
  });

  it('TC-7: full CASH refund is subtracted from expectedBalance', async () => {
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([
      { total: 500, paymentMethod: 'CASH', status: 'REFUNDED' },
    ]);
    (prisma.saleRefund.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalRefund: 500 } });

    const result = await service.closeShift('shift1', { closeBalance: 1000 } as any, 'u1');
    // openBalance=1000 + cashSales=500 - cashRefunds=500 = 1000
    expect(result.summary.expectedBalance).toBe(1000);
    expect(result.summary.cashRefunds).toBe(500);
  });

  it('TC-8: partial CASH refund is subtracted correctly', async () => {
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([
      { total: 500, paymentMethod: 'CASH', status: 'PARTIAL_REFUND' },
    ]);
    (prisma.repair.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.saleRefund.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalRefund: 200 } });

    const result = await service.closeShift('shift1', { closeBalance: 1300 } as any, 'u1');
    // openBalance=1000 + cashSales=500 - cashRefunds=200 = 1300
    expect(result.summary.expectedBalance).toBe(1300);
    expect(result.summary.cashRefunds).toBe(200);
  });

  it('TC-9: no refunds — expectedBalance unchanged from before fix', async () => {
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([
      { total: 500, paymentMethod: 'CASH', status: 'COMPLETED' },
    ]);
    (prisma.repair.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.saleRefund.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalRefund: null } });

    const result = await service.closeShift('shift1', { closeBalance: 1500 } as any, 'u1');
    // openBalance=1000 + cashSales=500 - 0 = 1500
    expect(result.summary.expectedBalance).toBe(1500);
    expect(result.summary.cashRefunds).toBe(0);
  });
});

describe('ShiftsService.getClosedShiftSummary — print a closed shift again', () => {
  let service: ShiftsService;
  let prisma: ReturnType<typeof mockPrisma>;
  const CLOSED = {
    ...MOCK_SHIFT, isActive: false, closedAt: new Date('2026-07-14T16:00:00Z'), closeBalance: 1500,
    branchId: 'b1', note: null, branch: { tenantId: 't1' },
  };

  beforeEach(() => {
    prisma = mockPrisma();
    const carrierWallet = { getShiftCarrierSummary: jest.fn().mockResolvedValue([]) };
    service = new (ShiftsService as any)(prisma, carrierWallet, { log: jest.fn() }, { notify: jest.fn() });
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue(CLOSED);
    (prisma.sale.findMany as jest.Mock).mockResolvedValue([{ total: 500, paymentMethod: 'CASH' }]);
    (prisma.repair.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.supplierPayment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.packageSale.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.expense.aggregate as jest.Mock).mockResolvedValue({ _sum: { amount: 0 } });
    (prisma.saleRefund.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalRefund: 0 } });
  });

  it('gives the same totals as at closing, for the person who closed it', async () => {
    const r = await service.getClosedShiftSummary('shift1', { id: 'u1', role: 'CASHIER', tenantId: 't1', permissions: [] });
    expect(r.summary.totalSales).toBe(500);
    expect(r.summary.expectedBalance).toBe(1500); // 1000 open + 500 cash sale
    expect(r.summary.actualBalance).toBe(1500);
    expect(r.summary.difference).toBe(0);
    expect(r.user.name).toBe('Test User');
  });

  it("another cashier cannot reprint someone else's shift; the owner and the branch manager can", async () => {
    await expect(service.getClosedShiftSummary('shift1', { id: 'u2', role: 'CASHIER', tenantId: 't1', permissions: ['cash_drawer.view_balance'] }))
      .rejects.toThrow('กะของตัวเอง');
    await expect(service.getClosedShiftSummary('shift1', { id: 'o', role: 'OWNER', tenantId: 't1' })).resolves.toBeDefined();
    await expect(service.getClosedShiftSummary('shift1', { id: 'm', role: 'MANAGER', branchId: 'b1', tenantId: 't1', permissions: ['cash_drawer.view_balance'] }))
      .resolves.toBeDefined();
  });

  it('another shop cannot see it, and an open shift has nothing to reprint', async () => {
    await expect(service.getClosedShiftSummary('shift1', { id: 'o', role: 'OWNER', tenantId: 't2' })).rejects.toThrow('ไม่พบกะนี้');
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue({ ...CLOSED, isActive: true, closedAt: null });
    await expect(service.getClosedShiftSummary('shift1', { id: 'u1', role: 'CASHIER', tenantId: 't1' })).rejects.toThrow('ยังไม่ปิด');
  });
});

describe('supplier payments in a shift', () => {
  const openedAt = new Date('2026-10-08T12:00:00Z');
  const closedAt = new Date('2026-10-08T23:00:00Z');

  it('only counts purchase orders of the shift branch', () => {
    const where = supplierPaymentsOfShiftWhere({ openedAt, closedAt, branchId: 'b1', user: { tenantId: 't1' } });
    expect(where).toEqual({
      paidAt: { gte: openedAt, lt: closedAt },
      purchaseOrder: { supplier: { tenantId: 't1' }, branchId: 'b1' },
    });
  });

  it('falls back to the whole shop when the shift has no branch', () => {
    const where = supplierPaymentsOfShiftWhere({ openedAt, closedAt, branchId: null, user: { tenantId: 't1' } });
    expect(where.purchaseOrder).toEqual({ supplier: { tenantId: 't1' } });
  });
});
