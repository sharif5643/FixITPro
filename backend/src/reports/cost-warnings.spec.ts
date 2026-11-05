import { costWarningsOf } from './reports.service';

const item = (id: string, name: string, quantity: number, total: number, costPrice: number) =>
  ({ quantity, total, costPrice, product: { id, name, price: total / quantity } });

describe('costWarningsOf: costs that make a profit look wrong', () => {
  it('lists what sold below cost, worst first, and what had no cost', () => {
    const w = costWarningsOf(
      [
        item('ip15', 'iPhone 15', 1, 28900, 150000),   // cost typed with an extra zero
        item('case', 'เคส', 2, 200, 150),              // 100 each, cost 150: sold below cost
        item('film', 'ฟิล์ม', 1, 100, 0),              // no cost at all
        item('ok', 'สายชาร์จ', 1, 159, 40),
      ],
      [{ parts: [{ quantity: 1, costPrice: 0, price: 0, product: { id: 'bat', name: 'แบต', price: 500 } }] }],
    );
    expect(w.belowCost.map((x) => x.productId)).toEqual(['ip15', 'case']);
    expect(w.belowCost[0]).toMatchObject({ cost: 150000, soldAt: 28900 });
    expect(w.belowCost[1]).toMatchObject({ cost: 150, soldAt: 100 });
    expect(w.noCost.map((x) => x.productId).sort()).toEqual(['bat', 'film']);
    expect(w).toMatchObject({ belowCostCount: 2, noCostCount: 2 });
  });

  it('is empty when every cost is sensible', () => {
    expect(costWarningsOf([item('ok', 'สายชาร์จ', 1, 159, 40)], [])).toMatchObject({ belowCostCount: 0, noCostCount: 0 });
  });
});
