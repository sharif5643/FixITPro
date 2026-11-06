import { OpsAccountingAdapter } from './ops-accounting.adapter';

const build = (enabled = true) => {
  const journal = { create: jest.fn().mockResolvedValue({}), findBySource: jest.fn() };
  const modules = { isAccountingEnabled: jest.fn().mockResolvedValue(enabled) };
  return { adapter: new OpsAccountingAdapter(journal as any, modules as any, {} as any), journal };
};
const sale = (o: object = {}) => ({
  id: 's1', receiptNumber: 'R1', carrier: 'AIS', saleType: 'PROMO',
  packageAmount: 200, walletDeduction: 170, profit: 30, paymentMethod: 'CASH', ...o,
});
const legs = (call: any) => Object.fromEntries(call.lines.map((l: any) => [l.accountCode, Number(l.debit ?? 0) - Number(l.credit ?? 0)]));

describe('OpsAccountingAdapter', () => {
  it('a SIM sale books the full price as revenue and its cost from stock', async () => {
    const { adapter, journal } = build();
    await adapter.recordPackageSale({ tenantId: 't', sale: sale({ saleType: 'SIM_SALE', packageAmount: 100, walletDeduction: 60, paymentMethod: 'TRANSFER' }) });
    expect(legs(journal.create.mock.calls[0][0])).toEqual({ '1120': 100, '4300': -100, '5100': 60, '1300': -60 });
  });

  it('shops without the accounting module get no journal', async () => {
    const { adapter, journal } = build(false);
    await adapter.recordPackageSale({ tenantId: 't', sale: sale() });
    await adapter.recordSupplierPayment({ tenantId: 't', paymentId: 'p', poNumber: 'PO', paymentMethod: 'CASH', amount: 10 });
    expect(journal.create).not.toHaveBeenCalled();
  });

  it('a journal failure never reaches the caller', async () => {
    const { adapter, journal } = build();
    journal.create.mockRejectedValue(new Error('db down'));
    await expect(adapter.recordDrawerManual({ tenantId: 't', txId: 'x', direction: 'OUT', amount: 5 })).resolves.toBeUndefined();
  });

  describe('quick cash at the till, delivery fees and stock by hand', () => {
    it('money in with no bill is revenue; owner money is equity', async () => {
      const { adapter, journal } = build();
      await adapter.recordShiftCash({ tenantId: 't', movementId: 'm1', direction: 'IN', category: 'INCOME_SERVICE', amount: 200 });
      expect(legs(journal.create.mock.calls[0][0])).toEqual({ '1100': 200, '4200': -200 });
      await adapter.recordShiftCash({ tenantId: 't', movementId: 'm2', direction: 'OUT', category: 'OWNER_DRAW', amount: 300 });
      expect(legs(journal.create.mock.calls[1][0])).toEqual({ '3100': 300, '1100': -300 });
      await adapter.recordShiftCash({ tenantId: 't', movementId: 'm3', direction: 'IN', category: 'FLOAT_IN', amount: 500 });
      expect(legs(journal.create.mock.calls[2][0])).toEqual({ '1100': 500, '3100': -500 });
    });

    it('a delivery fee is the job\'s cost, paid from the drawer or by the owner', async () => {
      const { adapter, journal } = build();
      await adapter.recordRepairExtraCost({ tenantId: 't', costId: 'c1', ticketNumber: 'REP-1', amount: 80, fromDrawer: true });
      expect(legs(journal.create.mock.calls[0][0])).toEqual({ '5200': 80, '1100': -80 });
      await adapter.recordRepairExtraCost({ tenantId: 't', costId: 'c2', ticketNumber: 'REP-1', amount: 80, fromDrawer: false });
      expect(legs(journal.create.mock.calls[1][0])).toEqual({ '5200': 80, '3100': -80 });
    });

    it('stock in by hand is owned goods at cost; out takes it off', async () => {
      const { adapter, journal } = build();
      await adapter.recordStockChange({ tenantId: 't', movementId: 's1', productName: 'จอ', productType: 'PART', quantity: 3, unitCost: 200 });
      expect(legs(journal.create.mock.calls[0][0])).toEqual({ '1310': 600, '3100': -600 });
      await adapter.recordStockChange({ tenantId: 't', movementId: 's2', productName: 'เคส', productType: 'ACCESSORY', quantity: -2, unitCost: 50 });
      expect(legs(journal.create.mock.calls[1][0])).toEqual({ '3100': 100, '1300': -100 });
      await adapter.recordStockChange({ tenantId: 't', movementId: 's3', productName: 'ฟรี', quantity: 5, unitCost: 0 });
      expect(journal.create).toHaveBeenCalledTimes(2);   // nothing to book at no cost
    });
  });
});
