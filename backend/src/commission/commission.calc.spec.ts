import { normalizeRates, personCard, pickRule, repairCommission, saleCommission, shopCard } from './commission.calc';

const job = (o: Partial<Parameters<typeof repairCommission>[0]> = {}) => ({
  collected: 2000, partsCost: 800, partnerCost: 0, tags: [] as string[], ...o,
});
const card = (byTag: Record<string, any> = {}, other: any = null) => ({ byTag, other });
const fixed = (value: number) => ({ method: 'FIXED' as const, value });
const pctProfit = (value: number) => ({ method: 'PERCENT_LABOR' as const, value });
const pctTotal = (value: number) => ({ method: 'PERCENT_TOTAL' as const, value });

describe('repairCommission', () => {
  it('percent of profit takes off parts and the partner shop fee', () => {
    expect(repairCommission(job(), card({}, pctProfit(30))).amount).toBe(360);
    expect(repairCommission(job({ partnerCost: 1000 }), card({}, pctProfit(30))).amount).toBe(60);
    // A loss pays nothing, never a negative amount
    expect(repairCommission(job({ partsCost: 2500 }), card({}, pctProfit(30))).amount).toBe(0);
  });

  it('percent of total and fixed per job', () => {
    expect(repairCommission(job(), card({}, pctTotal(10))).amount).toBe(200);
    expect(repairCommission(job(), card({}, fixed(150))).amount).toBe(150);
  });

  it('one card mixes baht and percent per job type; other jobs use the last row', () => {
    const c = card({ 'หน้าจอ': fixed(150), 'ไม่ติด': pctProfit(40) }, pctTotal(10));
    expect(repairCommission(job({ tags: ['หน้าจอ'] }), c)).toEqual({ amount: 150, note: 'หน้าจอ: 150 บาท/งาน' });
    expect(repairCommission(job({ tags: ['ไม่ติด'] }), c).amount).toBe(480);   // 40% of 1200 profit
    expect(repairCommission(job({ tags: ['กล้อง'] }), c).amount).toBe(200);   // other: 10% of 2000
  });

  it('several job types pay the single best row, not the sum', () => {
    const c = card({ 'หน้าจอ': fixed(150), 'แบตเตอรี่': fixed(80) });
    expect(repairCommission(job({ tags: ['แบตเตอรี่', 'หน้าจอ'] }), c).amount).toBe(150);
    expect(repairCommission(job({ tags: ['กล้อง'] }), c).amount).toBe(0);
  });

  it('a fully refunded or unpaid job pays nothing under any row', () => {
    for (const c of [card({}, pctTotal(10)), card({}, fixed(150)), card({ 'หน้าจอ': fixed(150) })]) {
      expect(repairCommission(job({ collected: 0, tags: ['หน้าจอ'] }), c).amount).toBe(0);
    }
  });
});

describe('cards', () => {
  it('old saves (baht numbers) read as baht rows; bad rows are dropped', () => {
    expect(normalizeRates({ 'หน้าจอ': 150, x: 0, y: { method: 'BAD', value: 1 } })).toEqual({ 'หน้าจอ': fixed(150) });
  });
  it('shop card: its single rule is the row for other jobs', () => {
    expect(shopCard('PERCENT_LABOR', 30, { 'หน้าจอ': 150 })).toEqual(card({ 'หน้าจอ': fixed(150) }, pctProfit(30)));
    expect(shopCard('NONE', 0, {}).other).toBeNull();
  });
  it('a person uses their own card when set, otherwise the shop card', () => {
    const shop = shopCard('PERCENT_LABOR', 30, { 'หน้าจอ': 150 });
    expect(personCard(null, shop)).toBe(shop);
    expect(personCard({ repairType: null, repairRates: null }, shop)).toBe(shop);
    expect(personCard({ repairType: 'PERCENT_TOTAL', repairValue: 40 }, shop)).toEqual(card({}, pctTotal(40)));
    expect(personCard({ repairType: 'NONE', repairRates: { 'หน้าจอ': { method: 'FIXED', value: 200 } } }, shop))
      .toEqual(card({ 'หน้าจอ': fixed(200) }, null));
    // Saved before per-person tables: "by type" used the shop's table
    expect(personCard({ repairType: 'BY_TYPE' }, shop)).toEqual(card(shop.byTag, null));
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
