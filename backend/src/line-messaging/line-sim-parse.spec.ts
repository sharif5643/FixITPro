import { parseLineSim } from './line-sim-parse';

describe('parseLineSim', () => {
  it.each([
    ['dtac 250', { carrier: 'DTAC', amount: 250, saleType: 'PROMO', paymentMethod: 'CASH' }],
    ['DTAC 250 บาท', { carrier: 'DTAC', amount: 250 }],
    ['ดีแทค 250บ.', { carrier: 'DTAC', amount: 250 }],
    ['ทรู 150 0812345678', { carrier: 'TRUE', amount: 150, phone: '0812345678' }],
    ['true 150 081-234-5678', { carrier: 'TRUE', amount: 150, phone: '0812345678' }],
    ['0812345678 ทรูมูฟ 150', { carrier: 'TRUE', amount: 150, phone: '0812345678' }],
    ['เติม ais 50', { carrier: 'AIS', amount: 50, saleType: 'TOPUP' }],
    ['วันทูคอล 600', { carrier: 'AIS', amount: 600 }],
    ['dtac 250 เหลือ 1,200', { carrier: 'DTAC', amount: 250, reportedBalance: 1200 }],
    ['dtac เหลือ 1200 250', { carrier: 'DTAC', amount: 250, reportedBalance: 1200 }],
    ['เน็ต ดีแทค 250 ทุน 240 โอน', { carrier: 'DTAC', amount: 250, dealerCost: 240, paymentMethod: 'TRANSFER' }],
    ['my 100', { carrier: 'NT', amount: 100 }],
  ])('%s', (text, expected) => {
    expect(parseLineSim(text)).toMatchObject({ kind: 'sale', ...expected });
  });

  it('link, balance and help messages', () => {
    expect(parseLineSim('เชื่อมบัญชี abc.def.123')).toEqual({ kind: 'link', code: 'abc.def.123' });
    expect(parseLineSim('ยอด')).toEqual({ kind: 'balance' });
    expect(parseLineSim('เช็คยอด')).toEqual({ kind: 'balance' });
    expect(parseLineSim('วิธีใช้')).toEqual({ kind: 'help' });
  });

  it('is unknown without a carrier or a price', () => {
    expect(parseLineSim('สวัสดีครับ')).toEqual({ kind: 'unknown' });
    expect(parseLineSim('dtac')).toEqual({ kind: 'unknown' });
    expect(parseLineSim('dtac 0812345678')).toEqual({ kind: 'unknown' });
    expect(parseLineSim('ติดตามงาน REP-20261002-A1B2C3')).toEqual({ kind: 'unknown' });
  });
});
