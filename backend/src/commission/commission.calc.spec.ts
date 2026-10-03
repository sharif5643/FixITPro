import { pickRule, repairCommission, saleCommission } from './commission.calc';

const job = (o: Partial<Parameters<typeof repairCommission>[0]> = {}) => ({
  collected: 2000, partsCost: 800, partnerCost: 0, tags: [] as string[], ...o,
});
const rule = (type: any, value = 0, typeRates: Record<string, number> = {}) => ({ type, value, typeRates });

describe('repairCommission', () => {
  it('percent of profit takes off parts and the partner shop fee', () => {
    expect(repairCommission(job(), rule('PERCENT_LABOR', 30)).amount).toBe(360);
    expect(repairCommission(job({ partnerCost: 1000 }), rule('PERCENT_LABOR', 30)).amount).toBe(60);
    // A loss pays nothing, never a negative amount
    expect(repairCommission(job({ partsCost: 2500 }), rule('PERCENT_LABOR', 30)).amount).toBe(0);
  });

  it('percent of total and fixed per job', () => {
    expect(repairCommission(job(), rule('PERCENT_TOTAL', 10)).amount).toBe(200);
    expect(repairCommission(job(), rule('FIXED', 150)).amount).toBe(150);
  });

  it('by type pays the highest matching type once, not the sum', () => {
    const rates = { 'หน้าจอ': 150, 'แบตเตอรี่': 80 };
    expect(repairCommission(job({ tags: ['แบตเตอรี่'] }), rule('BY_TYPE', 0, rates)).amount).toBe(80);
    expect(repairCommission(job({ tags: ['แบตเตอรี่', 'หน้าจอ'] }), rule('BY_TYPE', 0, rates)).amount).toBe(150);
    expect(repairCommission(job({ tags: ['กล้อง'] }), rule('BY_TYPE', 0, rates)).amount).toBe(0);
  });

  it('a fully refunded or unpaid job pays nothing under any rule', () => {
    for (const r of [rule('PERCENT_TOTAL', 10), rule('FIXED', 150), rule('BY_TYPE', 0, { 'หน้าจอ': 150 })]) {
      expect(repairCommission(job({ collected: 0, tags: ['หน้าจอ'] }), r).amount).toBe(0);
    }
  });
});

describe('saleCommission', () => {
  const line = { qty: 2, revenue: 20000, cost: 16000 };
  it('percent of profit, percent of sale, fixed per unit', () => {
    expect(saleCommission(line, { type: 'PERCENT_PROFIT', value: 10 }).amount).toBe(400);
    expect(saleCommission(line, { type: 'PERCENT_TOTAL', value: 1 }).amount).toBe(200);
    expect(saleCommission(line, { type: 'FIXED_PER_UNIT', value: 300 }).amount).toBe(600);
  });
  it('nothing for fully refunded lines or when switched off', () => {
    expect(saleCommission({ ...line, qty: 0 }, { type: 'FIXED_PER_UNIT', value: 300 }).amount).toBe(0);
    expect(saleCommission(line, { type: 'NONE', value: 300 }).amount).toBe(0);
  });
});

describe('pickRule', () => {
  const shop = { type: 'PERCENT_LABOR', value: 30, typeRates: { 'หน้าจอ': 150 } };
  it('a person\'s own rate wins; otherwise the shop rate; type rates are shared', () => {
    expect(pickRule(shop, { type: 'PERCENT_LABOR', value: 40 }).value).toBe(40);
    expect(pickRule(shop, { type: null, value: null })).toEqual(shop);
    expect(pickRule(shop, { type: 'BY_TYPE', value: 0 }).typeRates).toEqual({ 'หน้าจอ': 150 });
  });
});
