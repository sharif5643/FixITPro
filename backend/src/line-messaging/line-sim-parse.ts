/**
 * Staff report a SIM / package sale to FixITPro's LINE account in their own words:
 *   "dtac 250"   "ทรู 150 0812345678"   "เติม ais 50 เหลือ 1200"   "เน็ต ดีแทค 250 ทุน 240 โอน"
 * This turns one message into a sale, or says what it is (link, balance check, help).
 */

export type Carrier = 'AIS' | 'TRUE' | 'DTAC' | 'NT';

export type LineSimCommand =
  | { kind: 'link'; code: string }
  | { kind: 'balance' }
  | { kind: 'help' }
  | {
      kind: 'sale';
      carrier: Carrier;
      amount: number;
      saleType: 'PROMO' | 'TOPUP';
      phone?: string;
      /** What the carrier app shows left after this sale, when the staff typed it */
      reportedBalance?: number;
      /** What the carrier wallet was really charged, when it is not the usual 97% */
      dealerCost?: number;
      paymentMethod: 'CASH' | 'TRANSFER';
    }
  | { kind: 'unknown' };

export const LINK_PREFIX = 'เชื่อมบัญชี';

const CARRIERS: [RegExp, Carrier][] = [
  [/\b(ais|one2call|12call|1-2-call)\b|เอไอเอส|วันทูคอล|เอไอ/i, 'AIS'],
  [/\b(dtac)\b|ดีแทค/i, 'DTAC'],
  [/\b(true|truemove|truemoveh)\b|ทรูมูฟ|ทรู/i, 'TRUE'],
  [/\b(nt|my|cat|tot)\b|มาย|ทีโอที/i, 'NT'],
];

const num = (s: string) => Number(s.replace(/,/g, ''));

export function parseLineSim(raw: string): LineSimCommand {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'unknown' };

  const link = text.match(new RegExp(`^${LINK_PREFIX}\\s+(\\S+)`));
  if (link) return { kind: 'link', code: link[1] };

  const carrierHit = CARRIERS.find(([re]) => re.test(text));
  if (!carrierHit) {
    if (/^(เช็ค|เช็ก|ดู)?\s*ยอด(คงเหลือ|เงิน|กระเป๋า)?$|^balance$/i.test(text)) return { kind: 'balance' };
    if (/^(help|วิธีใช้|ช่วยด้วย|\?|เมนู)$/i.test(text)) return { kind: 'help' };
    return { kind: 'unknown' };
  }

  let rest = text.replace(/\s+/g, ' ');
  // A mobile number however it was spaced ("081-234-5678", "081 234 5678")
  const phoneMatch = rest.match(/(?<![\d.,])0[689]\d(?:[\s-]?\d){7}(?![\d.,])/);
  const phone = phoneMatch?.[0].replace(/[\s-]/g, '');
  if (phoneMatch) rest = rest.replace(phoneMatch[0], ' ');

  const take = (re: RegExp): number | undefined => {
    const m = rest.match(re);
    if (!m) return undefined;
    rest = rest.replace(m[0], ' ');
    return num(m[1]);
  };
  const reportedBalance = take(/(?:คงเหลือ|ยอดเหลือ|เหลือ|bal(?:ance)?)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const dealerCost = take(/(?:ทุน|หัก|ต้นทุน)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/);
  const amount = take(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?|฿)?/);
  if (amount === undefined || !(amount > 0)) return { kind: 'unknown' };

  return {
    kind: 'sale',
    carrier: carrierHit[1],
    amount,
    saleType: /เติม|top\s*-?up/i.test(text) ? 'TOPUP' : 'PROMO',
    paymentMethod: /โอน|transfer|พร้อมเพย์|promptpay/i.test(text) ? 'TRANSFER' : 'CASH',
    ...(phone ? { phone } : {}),
    ...(reportedBalance !== undefined ? { reportedBalance } : {}),
    ...(dealerCost !== undefined ? { dealerCost } : {}),
  };
}

export const CARRIER_TH: Record<Carrier, string> = { AIS: 'AIS', TRUE: 'TRUE', DTAC: 'DTAC', NT: 'NT' };

export const HELP_TEXT = [
  'บันทึกขายซิม/เน็ตทาง LINE',
  '• พิมพ์ค่ายกับราคา เช่น  dtac 250',
  '• ใส่เบอร์ได้  ทรู 150 0812345678',
  '• เติมเงิน  เติม ais 50',
  '• ใส่ยอดที่แอปค่ายโชว์ ระบบจะเทียบให้  dtac 250 เหลือ 1200',
  '• ลูกค้าโอน  dtac 250 โอน',
  '• ส่งรูปหน้าจอแอปค่ายหลังทำรายการก็ได้',
  '• พิมพ์  ยอด  เพื่อดูยอดกระเป๋าทุกค่าย',
].join('\n');
