import RNBluetoothClassic from 'react-native-bluetooth-classic';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRINTER_KEY = 'bt_printer_address';

export async function getSavedPrinterAddress(): Promise<string | null> {
  return AsyncStorage.getItem(PRINTER_KEY);
}

export async function savePrinterAddress(address: string): Promise<void> {
  await AsyncStorage.setItem(PRINTER_KEY, address);
}

export async function getPairedDevices() {
  const paired = await RNBluetoothClassic.getBondedDevices();
  return paired.map((d) => ({ name: d.name ?? d.address, address: d.address }));
}

const ESC = '\x1B';
const GS  = '\x1D';
const INIT    = ESC + '@';
const ALIGN_C = ESC + '\x61\x01';
const ALIGN_L = ESC + '\x61\x00';
const BOLD_ON  = ESC + '\x45\x01';
const BOLD_OFF = ESC + '\x45\x00';
const SIZE_2X  = ESC + '\x21\x30';
const SIZE_NM  = ESC + '\x21\x00';
const CUT      = GS  + 'V\x41\x03';

// Wrap plain text in ESC/POS envelope and print
export async function printText(address: string, text: string): Promise<void> {
  const device = await RNBluetoothClassic.connectToDevice(address);
  try {
    const job = INIT + ALIGN_L + text + '\n\n\n' + CUT;
    await device.write(job);
  } finally {
    await device.disconnect().catch(() => {});
  }
}

// Build a formatted receipt string from structured data
export function formatReceiptText(opts: {
  shopName: string;
  shopPhone?: string;
  receiptNumber: string;
  date: string;
  cashierName: string;
  items: { name: string; qty: number; price: number; total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  customerName?: string;
  footer?: string;
}): string {
  const SEP = '-'.repeat(32);
  const row = (l: string, r: string, w = 32) =>
    l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r;
  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PAY: Record<string, string> = {
    CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต',
  };

  const lines: string[] = [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร ${opts.shopPhone}`] : []),
    '',
    'ใบเสร็จรับเงิน',
    `เลขที่: ${opts.receiptNumber}`,
    `วันที่: ${opts.date}`,
    `แคชเชียร์: ${opts.cashierName}`,
    ...(opts.customerName ? [`ลูกค้า: ${opts.customerName}`] : []),
    SEP,
    ...opts.items.flatMap((it) => [
      it.name,
      row(`  x${it.qty} @ ${fmt(it.price)}`, fmt(it.total)),
    ]),
    SEP,
    row('รวม', fmt(opts.subtotal)),
    ...(opts.discount > 0 ? [row('ส่วนลด', `-${fmt(opts.discount)}`)] : []),
    row('ยอดชำระ', fmt(opts.total)),
    row('ช่องทาง', PAY[opts.paymentMethod] ?? opts.paymentMethod),
    ...(opts.amountPaid > 0 ? [
      row('รับเงิน', fmt(opts.amountPaid)),
      row('เงินทอน', fmt(opts.change)),
    ] : []),
    SEP,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ];

  return lines.join('\n');
}
