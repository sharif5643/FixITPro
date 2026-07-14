import { BadRequestException } from '@nestjs/common';
import { CarrierWalletService } from './carrier-wallet.service';
import { mockPrisma } from '../test/prisma-mock';

describe('CarrierWalletService.createPackageSale — P0-4', () => {
  let service: CarrierWalletService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new (CarrierWalletService as any)(prisma);
  });

  const dto = {
    carrier: 'AIS',
    packageAmount: 299,
    paymentMethod: 'CASH',
    amountPaid: 299,
    phoneNumber: '0812345678',
    shiftId: null,
    cashierName: 'Test',
    note: null,
  };

  it('TC-3: first call succeeds when balance is sufficient', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        carrierWallet: {
          findUnique: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 1000 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 761 }),
        },
        carrierWalletMovement: { create: jest.fn().mockResolvedValue({}) },
        packageSale: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: 'ps1', receiptNumber: 'PKG-001', carrier: 'AIS', packageAmount: 299,
            walletDeduction: 239.2, profit: 59.8, amountPaid: 299, change: 0, createdAt: new Date(),
          }),
        },
      };
      return fn(tx);
    });

    const result = await service.createPackageSale(dto as any, 'u1');
    expect(result).toBeDefined();
  });

  it('TC-4: second concurrent call fails when balance becomes insufficient', async () => {
    let callCount = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      callCount++;
      const isFirst = callCount === 1;
      const tx = {
        carrierWallet: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'w1', carrier: 'AIS',
            // Second call sees the snapshot balance as if it was low from the start
            balance: isFirst ? 1000 : 50,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: isFirst ? 1 : 0 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 761 }),
        },
        carrierWalletMovement: { create: jest.fn().mockResolvedValue({}) },
        packageSale: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: 'ps1', receiptNumber: 'PKG-001', carrier: 'AIS', packageAmount: 299,
            walletDeduction: 239.2, profit: 59.8, amountPaid: 299, change: 0, createdAt: new Date(),
          }),
        },
      };
      return fn(tx);
    });

    await service.createPackageSale(dto as any, 'u1');
    await expect(service.createPackageSale(dto as any, 'u1')).rejects.toThrow(BadRequestException);
    await expect(service.createPackageSale(dto as any, 'u1')).rejects.toThrow('ไม่เพียงพอ');
  });
});
