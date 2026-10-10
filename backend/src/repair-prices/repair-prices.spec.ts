import { pickPrices } from './repair-prices.service';

const row = (brand: string, model: string, service: string, price: number) => ({ brand, model, service, price });

describe('pickPrices', () => {
  const rows = [
    row('Apple', 'iPhone 13', 'เปลี่ยนจอ', 3500),
    row('Apple', '', 'เปลี่ยนจอ', 2500),
    row('Apple', '', 'เปลี่ยนแบต', 900),
    row('', '', 'ค่าตรวจเช็ค', 100),
    row('Samsung', 'A15', 'เปลี่ยนจอ', 1500),
  ];

  it('the model price wins over the brand-wide one; brand-wide and any-brand jobs are added', () => {
    const got = pickPrices(rows, 'apple', 'iphone  13'.replace(/\s+/g, ' '));
    expect(got.map((r) => [r.service, r.price])).toEqual([
      ['เปลี่ยนจอ', 3500],
      ['เปลี่ยนแบต', 900],
      ['ค่าตรวจเช็ค', 100],
    ]);
  });

  it('another model of the brand gets the brand-wide prices', () => {
    expect(pickPrices(rows, 'Apple', 'iPhone 11').map((r) => r.price)).toEqual([2500, 900, 100]);
  });

  it('another brand never sees these prices, only the any-brand jobs', () => {
    expect(pickPrices(rows, 'Oppo', 'A78').map((r) => r.service)).toEqual(['ค่าตรวจเช็ค']);
  });
});
