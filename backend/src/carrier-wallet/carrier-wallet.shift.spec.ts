import { CarrierWalletService } from './carrier-wallet.service';

function svc(shift: { id: string; userId: string } | null) {
  const prisma: any = {
    shift: { findFirst: jest.fn(async () => shift) },
    carrierWallet: { findMany: jest.fn(async () => []), createMany: jest.fn(), findFirst: jest.fn() },
  };
  return { s: new CarrierWalletService(prisma), prisma };
}

describe('SIM / package money goes into the right shift', () => {
  it('a SIM / package sale needs an open shift', async () => {
    const { s } = svc(null);
    await expect(s.createPackageSale({ carrier: 'AIS', packageAmount: 100, paymentMethod: 'CASH', amountPaid: 100, cashierName: 'x', shiftId: 'someone-else' } as any, 'u1', 't1'))
      .rejects.toThrow('กรุณาเปิดกะก่อน');
    await expect(s.createSimSale({ carrier: 'AIS', packageAmount: 100, costPrice: 50, paymentMethod: 'CASH', amountPaid: 100, cashierName: 'x' }, 'u1', 't1'))
      .rejects.toThrow('กรุณาเปิดกะก่อน');
  });

  it('in a shared shift only the person who opened it counts the wallets; owner and manager may', async () => {
    const joined = { id: 's1', userId: 'opener' };
    await expect(svc(joined).s.reconcileAtClose([{ carrier: 'AIS', actualBalance: 100 }], 's1', 'member', 't1', 'CASHIER'))
      .rejects.toThrow('เฉพาะคนที่เปิดกะ');
  });
});
