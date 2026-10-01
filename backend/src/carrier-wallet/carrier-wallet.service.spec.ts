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

describe('CarrierWalletService.createPackageSale — dealerCost / saleType', () => {
  let service: CarrierWalletService;
  let prisma: ReturnType<typeof mockPrisma>;
  let tx: any;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new (CarrierWalletService as any)(prisma);
    tx = {
      carrierWallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 1000 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 757.5 }),
      },
      carrierWalletMovement: { create: jest.fn().mockResolvedValue({}) },
      packageSale: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ps1', createdAt: new Date(), ...data })),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));
  });

  const base = { carrier: 'AIS', packageAmount: 250, paymentMethod: 'CASH', amountPaid: 250, cashierName: 'Test' };

  it('defaults to 97% deduction and 3% profit', async () => {
    const result = await service.createPackageSale(base as any, 'u1');
    expect(result.walletDeduction).toBe(242.5);
    expect(result.profit).toBe(7.5);
    expect(tx.carrierWallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { balance: { decrement: 242.5 } },
    }));
  });

  it('uses dealerCost override for wallet deduction and profit', async () => {
    const result = await service.createPackageSale({ ...base, dealerCost: 245 } as any, 'u1');
    expect(result.walletDeduction).toBe(245);
    expect(result.profit).toBe(5);
    expect(tx.carrierWallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { carrier: 'AIS', balance: { gte: 245 } },
      data: { balance: { decrement: 245 } },
    }));
  });

  it('stores the requested saleType', async () => {
    await service.createPackageSale({ ...base, saleType: 'TOPUP' } as any, 'u1');
    expect(tx.packageSale.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ saleType: 'TOPUP' }),
    }));
  });

  it('rejects dealerCost greater than packageAmount', async () => {
    await expect(service.createPackageSale({ ...base, dealerCost: 300 } as any, 'u1'))
      .rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
