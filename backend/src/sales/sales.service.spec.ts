import { SalesService } from './sales.service';
import { mockPrisma } from '../test/prisma-mock';

const MOCK_PRODUCT = {
  id: 'prod1', name: 'Widget', sku: 'W1', isActive: true, stock: 10, minStock: 2,
  costPrice: 100, hasSerial: false, warrantyDays: 0, tenantId: 't1',
};

const MOCK_SALE = {
  id: 's1', receiptNumber: 'RCP-001', total: 200, paymentMethod: 'CASH',
  items: [{ id: 'si1', productId: 'prod1', quantity: 1 }], customer: null, user: null,
};

describe('SalesService.create — P0-5', () => {
  let service: SalesService;
  let prisma: ReturnType<typeof mockPrisma>;
  let auditLog: { log: jest.Mock; logWithTx: jest.Mock };

  const dto = {
    items: [{ productId: 'prod1', quantity: 1, price: 200 }],
    paymentMethod: 'CASH', amountPaid: 200,
    customerName: 'New Customer', customerPhone: '0812345678',
  };

  beforeEach(() => {
    prisma = mockPrisma();
    auditLog = { log: jest.fn(), logWithTx: jest.fn() };
    const notif = { notifyLowStock: jest.fn().mockResolvedValue(undefined) };
    service = new (SalesService as any)(prisma, auditLog, notif);

    (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ status: 'ACTIVE' });
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue({ id: 'shift1' });
    (prisma.product.findMany as jest.Mock).mockResolvedValue([MOCK_PRODUCT]);
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(MOCK_PRODUCT);
    // branchStock.findMany is called before transaction for the optimistic stock check
    (prisma.branchStock.findMany as jest.Mock).mockResolvedValue([{ productId: 'prod1', quantity: 10 }]);
  });

  it('TC-10: sale rollback — audit log NOT written when stock depletion aborts transaction', async () => {
    const txAuditCreate = jest.fn();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        customer: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'c1' }) },
        sale: { create: jest.fn().mockResolvedValue(MOCK_SALE) },
        branchStock: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),  // simulate out-of-stock
          findUnique: jest.fn().mockResolvedValue({ quantity: 0 }),
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
        product: { update: jest.fn(), updateMany: jest.fn() },
        stockMovement: { create: jest.fn() },
        serialNumber: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        auditLog: { create: txAuditCreate },
      };
      return fn(tx);
    });

    await expect(service.create(dto as any, 'u1', 'branch1', 't1')).rejects.toThrow();
    expect(txAuditCreate).not.toHaveBeenCalled();
  });

  it('TC-11: customer created inside tx — root prisma.customer.create never called', async () => {
    const rootCustomerCreate = prisma.customer.create as jest.Mock;
    const txCustomerCreate = jest.fn().mockResolvedValue({ id: 'c1' });

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        customer: { findFirst: jest.fn().mockResolvedValue(null), create: txCustomerCreate },
        sale: { create: jest.fn().mockResolvedValue(MOCK_SALE) },
        branchStock: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({ quantity: 9 }),
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 9 } }),
        },
        product: { update: jest.fn(), updateMany: jest.fn() },
        stockMovement: { create: jest.fn() },
        serialNumber: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
        auditLog: { create: jest.fn() },
      };
      return fn(tx);
    });

    await service.create(dto as any, 'u1', 'branch1', 't1');

    // Root prisma.customer.create must NOT be called
    expect(rootCustomerCreate).not.toHaveBeenCalled();
    // tx.customer.create MUST be called inside the transaction
    expect(txCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New Customer' }) }),
    );
  });
});
