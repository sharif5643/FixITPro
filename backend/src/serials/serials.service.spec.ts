import { ConflictException } from '@nestjs/common';
import { SerialsService } from './serials.service';
import { mockPrisma } from '../test/prisma-mock';

describe('SerialsService.createBulk — P0-7', () => {
  let service: SerialsService;
  let prisma: ReturnType<typeof mockPrisma>;

  const MOCK_PRODUCT = { id: 'p1', hasSerial: true, tenantId: 't1' };
  const SERIALS = ['SN001', 'SN002', 'SN003'];

  beforeEach(() => {
    prisma = mockPrisma();
    service = new (SerialsService as any)(prisma);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(MOCK_PRODUCT);
  });

  it('TC-5: all new serials — creates all and returns them', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        serialNumber: {
          createMany: jest.fn().mockResolvedValue({ count: 3 }),
          findMany: jest.fn().mockResolvedValue(
            SERIALS.map(s => ({ id: s, serial: s, product: MOCK_PRODUCT, saleItem: null })),
          ),
        },
      };
      return fn(tx);
    });

    const result = await service.createBulk({ productId: 'p1', serials: SERIALS } as any, 't1');
    expect(result).toHaveLength(3);
  });

  it('TC-6: duplicate serials — returns ConflictException with list, not P2002 crash', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        serialNumber: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }), // only 1 created out of 3
          findMany: jest.fn().mockResolvedValue([
            { serial: 'SN001' },
            { serial: 'SN002' },
            { serial: 'SN003' },
          ]),
        },
      };
      return fn(tx);
    });

    await expect(
      service.createBulk({ productId: 'p1', serials: SERIALS } as any, 't1'),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.createBulk({ productId: 'p1', serials: SERIALS } as any, 't1'),
    ).rejects.toThrow('Already registered');
  });
});
