import { BadRequestException } from '@nestjs/common';
import { CarrierWalletService } from './carrier-wallet.service';
import { mockPrisma } from '../test/prisma-mock';

describe('CarrierWalletService.createPackageSale — P0-4', () => {
  let service: CarrierWalletService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue({ id: 'shift-1', userId: 'u1' }); // an open shift (sales need one)
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
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 1000 }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 761 }),
        },
        carrierWalletMovement: { create: jest.fn().mockResolvedValue({}) },
        packageSale: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'ps1', receiptNumber: 'PKG-001', carrier: 'AIS', packageAmount: 299,
            walletDeduction: 239.2, profit: 59.8, amountPaid: 299, change: 0, createdAt: new Date(),
          }),
        },
      };
      return fn(tx);
    });

    const result = await service.createPackageSale(dto as any, 'u1', 'tA');
    expect(result).toBeDefined();
  });

  it('TC-4: second concurrent call fails when balance becomes insufficient', async () => {
    let callCount = 0;
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      callCount++;
      const isFirst = callCount === 1;
      const tx = {
        carrierWallet: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: 'w1', carrier: 'AIS',
            // Second call sees the snapshot balance as if it was low from the start
            balance: isFirst ? 1000 : 50,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: isFirst ? 1 : 0 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 761 }),
        },
        carrierWalletMovement: { create: jest.fn().mockResolvedValue({}) },
        packageSale: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'ps1', receiptNumber: 'PKG-001', carrier: 'AIS', packageAmount: 299,
            walletDeduction: 239.2, profit: 59.8, amountPaid: 299, change: 0, createdAt: new Date(),
          }),
        },
      };
      return fn(tx);
    });

    await service.createPackageSale(dto as any, 'u1', 'tA');
    await expect(service.createPackageSale(dto as any, 'u1', 'tA')).rejects.toThrow(BadRequestException);
    await expect(service.createPackageSale(dto as any, 'u1', 'tA')).rejects.toThrow('ไม่เพียงพอ');
  });
});

describe('CarrierWalletService.createPackageSale — dealerCost / saleType', () => {
  let service: CarrierWalletService;
  let prisma: ReturnType<typeof mockPrisma>;
  let tx: any;

  beforeEach(() => {
    prisma = mockPrisma();
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue({ id: 'shift-1', userId: 'u1' }); // an open shift (sales need one)
    service = new (CarrierWalletService as any)(prisma);
    tx = {
      carrierWallet: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 1000 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'w1', carrier: 'AIS', balance: 757.5 }),
      },
      carrierWalletMovement: { create: jest.fn().mockResolvedValue({}) },
      packageSale: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ps1', createdAt: new Date(), ...data })),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));
  });

  const base = { carrier: 'AIS', packageAmount: 250, paymentMethod: 'CASH', amountPaid: 250, cashierName: 'Test' };

  it('defaults to 97% deduction and 3% profit', async () => {
    const result = await service.createPackageSale(base as any, 'u1', 'tA');
    expect(result.walletDeduction).toBe(242.5);
    expect(result.profit).toBe(7.5);
    expect(tx.carrierWallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { balance: { decrement: 242.5 } },
    }));
  });

  it('uses dealerCost override for wallet deduction and profit', async () => {
    const result = await service.createPackageSale({ ...base, dealerCost: 245 } as any, 'u1', 'tA');
    expect(result.walletDeduction).toBe(245);
    expect(result.profit).toBe(5);
    expect(tx.carrierWallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'w1', balance: { gte: 245 } },
      data: { balance: { decrement: 245 } },
    }));
  });

  it('stores the requested saleType', async () => {
    await service.createPackageSale({ ...base, saleType: 'TOPUP' } as any, 'u1', 'tA');
    expect(tx.packageSale.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ saleType: 'TOPUP' }),
    }));
  });

  it('rejects dealerCost greater than packageAmount', async () => {
    await expect(service.createPackageSale({ ...base, dealerCost: 300 } as any, 'u1', 'tA'))
      .rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CarrierWalletService — receipt numbers', () => {
  let service: CarrierWalletService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    (prisma.shift.findFirst as jest.Mock).mockResolvedValue({ id: 'shift-1', userId: 'u1' }); // an open shift (sales need one)
    service = new (CarrierWalletService as any)(prisma);
  });

  const simDto = { carrier: 'AIS', packageAmount: 100, costPrice: 60, paymentMethod: 'CASH', amountPaid: 100, cashierName: 'T' };

  const makeTx = (last: string | null, create: jest.Mock) => ({
    packageSale: {
      findFirst: jest.fn().mockResolvedValue(last ? { receiptNumber: last } : null),
      create,
    },
  });

  it('continues from the highest number issued today, using the Bangkok date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T18:30:00Z')); // 01:30 on 2 Oct in Bangkok
    const create = jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'x', ...data }));
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(makeTx('PKG-20261002-0007', create)));

    const sale = await service.createSimSale(simDto as any, 'u1', 'tA');
    jest.useRealTimers();

    expect(sale.receiptNumber).toBe('PKG-20261002-0008');
    expect(create.mock.calls[0][0].data.tenantId).toBe('tA');
  });

  it('retries the transaction when the receipt number is taken concurrently', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002', clientVersion: 'x', meta: { target: ['receiptNumber'] },
    });
    const create = jest.fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async ({ data }: any) => ({ id: 'x', ...data }));
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(makeTx(null, create)));

    const sale = await service.createSimSale(simDto as any, 'u1', 'tA');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(sale.receiptNumber).toMatch(/^PKG-\d{8}-0001$/);
  });

  it('rejects malformed date filters with 400', async () => {
    await expect(service.getMovements('tA', undefined, 'not-a-date')).rejects.toThrow(BadRequestException);
  });
});
