import { BadRequestException } from '@nestjs/common';
import { RepairsService } from './repairs.service';
import { mockPrisma } from '../test/prisma-mock';

const MOCK_REPAIR = {
  id: 'r1', ticketNumber: 'REP-001', status: 'COMPLETED', paymentStatus: 'PENDING',
  estimatedTotal: 500, finalCost: null, estimateCost: null, deposit: 0,
  customer: null, technician: null, branch: { tenantId: 't1' },
  images: [], qc: null, parts: [], warranties: [],
};

describe('RepairsService.processPayment — P0-1', () => {
  let service: RepairsService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    const auditLog = { log: jest.fn(), logWithTx: jest.fn() };
    const warranties = { createForRepair: jest.fn().mockResolvedValue({}) };
    const lineMsg = { notifyRepairStatus: jest.fn().mockResolvedValue(null) };
    service = new (RepairsService as any)(prisma, auditLog, warranties, lineMsg);

    (prisma.shift.findFirst as jest.Mock).mockResolvedValue({ id: 'shift1' });
    (prisma.repair.findFirst as jest.Mock).mockResolvedValue(MOCK_REPAIR);
  });

  const dto = { paymentMethod: 'CASH', amountPaid: 500, warrantyDays: 0, finalCost: null };

  it('TC-1: successful payment commits inside transaction', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        repair: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(MOCK_REPAIR),
        },
        auditLog: { create: jest.fn() },
      };
      return fn(tx);
    });

    const result = await service.processPayment('r1', dto as any, 'u1', 't1');
    expect(result).toEqual(MOCK_REPAIR);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('TC-2: second concurrent call is rejected (count=0 guard)', async () => {
    let callCount = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const count = callCount++ === 0 ? 1 : 0;
      const tx = {
        repair: {
          updateMany: jest.fn().mockResolvedValue({ count }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(MOCK_REPAIR),
        },
        auditLog: { create: jest.fn() },
      };
      return fn(tx);
    });

    await service.processPayment('r1', dto as any, 'u1', 't1');
    await expect(service.processPayment('r1', dto as any, 'u1', 't1')).rejects.toThrow(BadRequestException);
    await expect(service.processPayment('r1', dto as any, 'u1', 't1')).rejects.toThrow('ชำระเงินแล้ว');
  });
});
