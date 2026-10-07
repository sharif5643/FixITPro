import { canViewCost, stripCost } from './hide-cost.interceptor';

describe('cost prices only for people allowed to see them', () => {
  it('owners always, others with products.view_cost', () => {
    expect(canViewCost({ role: 'OWNER' })).toBe(true);
    expect(canViewCost({ role: 'MANAGER', permissions: ['products.view_cost'] })).toBe(true);
    expect(canViewCost({ role: 'CASHIER', permissions: ['products.view'] })).toBe(false);
    expect(canViewCost(undefined)).toBe(false);
  });

  it('removes costPrice everywhere in a response and keeps everything else', () => {
    const price = { toString: () => '100' }; // stands in for a Prisma Decimal (not a plain object)
    const body = {
      items: [{ id: 'p1', price, costPrice: 50, branch: { name: 'A' } }],
      sale: { items: [{ productId: 'p1', costPrice: 40, total: 100 }] },
      parts: [{ product: { name: 'จอ', costPrice: 900 }, quantity: 1 }],
    };
    stripCost(body);
    expect(body.items[0]).toEqual({ id: 'p1', price, branch: { name: 'A' } });
    expect(body.sale.items[0]).toEqual({ productId: 'p1', total: 100 });
    expect(body.parts[0]).toEqual({ product: { name: 'จอ' }, quantity: 1 });
  });
});
