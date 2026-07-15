import { ShiftsService } from './shifts.service';
import { mockPrisma } from '../test/prisma-mock';

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
    const carrierWallet = {};
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
