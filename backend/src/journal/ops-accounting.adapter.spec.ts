import { OpsAccountingAdapter } from './ops-accounting.adapter';

const build = (enabled = true) => {
  const journal = { create: jest.fn().mockResolvedValue({}), findBySource: jest.fn() };
  const modules = { isAccountingEnabled: jest.fn().mockResolvedValue(enabled) };
  return { adapter: new OpsAccountingAdapter(journal as any, modules as any), journal };
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
});
