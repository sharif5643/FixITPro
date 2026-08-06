import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRINTER_KEY = 'bt_printer_address';

// ── Bluetooth runtime permissions (Android 12+ requires BLUETOOTH_CONNECT/SCAN) ──

export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      results['android.permission.BLUETOOTH_SCAN'] === 'granted' &&
      results['android.permission.BLUETOOTH_CONNECT'] === 'granted'
    );
  }

  // Android < 12 only needs location
  const r = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return r === 'granted';
}

// ── Printer address storage ───────────────────────────────────────────────────

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

// ── Thai text → TIS-620 encoding ──────────────────────────────────────────────
// Most cheap ESC/POS printers (Xprinter, Rongta) store Thai font in TIS-620.
// UTF-8 Thai is 3 bytes per char; TIS-620 is 1 byte → sends to wrong code points.
// Formula: TIS-620 byte = Unicode code point − 0x0D60  (for U+0E01..U+0E5B)

function encodeTis620(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.charCodeAt(0);
    if (cp >= 0x0E01 && cp <= 0x0E5B) {
      bytes.push(cp - 0x0D60); // Thai → TIS-620 (0xA1–0xFB)
    } else if (cp === 0x0A || cp === 0x0D || cp < 0x80) {
      bytes.push(cp); // ASCII + LF/CR pass through unchanged
    } else {
      bytes.push(0x3F); // '?' for other non-ASCII
    }
  }
  return Buffer.from(bytes);
}

// ── ESC/POS builder ───────────────────────────────────────────────────────────

function buildPrintJob(text: string): Buffer {
  // ESC @ = initialise; ESC t 20 = code page Windows-874 / TIS-620 Thai
  const header = Buffer.from([0x1B, 0x40, 0x1B, 0x74, 20]);
  // 3 line feeds + GS V 'A' 3 = full paper cut
  const footer = Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x03]);
  return Buffer.concat([header, encodeTis620(text), footer]);
}

// ── Print ─────────────────────────────────────────────────────────────────────

export async function printText(address: string, text: string): Promise<void> {
  const device = await RNBluetoothClassic.connectToDevice(address);
  try {
    await device.write(buildPrintJob(text) as any);
  } finally {
    await device.disconnect().catch(() => {});
  }
}

// Send a raw Buffer (e.g. ESC/POS bitmap job) directly to the printer.
export async function printBuffer(address: string, data: Buffer): Promise<void> {
  const device = await RNBluetoothClassic.connectToDevice(address);
  try {
    await device.write(data as any);
  } finally {
    await device.disconnect().catch(() => {});
  }
}

// ── Receipt formatters (plain text, 32-column) ────────────────────────────────

function row(left: string, right: string, w = 32): string {
  return left + ' '.repeat(Math.max(1, w - left.length - right.length)) + right;
}

function fmt(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtI(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
}

const SEP = '-'.repeat(32);
const PAY: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' };

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
  return [
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
      it.name.slice(0, 32),
      row(`  x${it.qty} @ ${fmt(it.price)}`, fmt(it.total)),
    ]),
    SEP,
    row('รวม', fmt(opts.subtotal)),
    ...(opts.discount > 0 ? [row('ส่วนลด', `-${fmt(opts.discount)}`)] : []),
    row('ยอดชำระ', fmt(opts.total)),
    row('ช่องทาง', PAY[opts.paymentMethod] ?? opts.paymentMethod),
    ...(opts.amountPaid > 0
      ? [row('รับเงิน', fmt(opts.amountPaid)), row('เงินทอน', fmt(opts.change))]
      : []),
    SEP,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ].join('\n');
}

export function formatRepairIntakeText(opts: {
  shopName: string;
  shopPhone?: string;
  ticketNumber: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  deviceBrand: string;
  deviceModel: string;
  deviceColor?: string;
  deviceImei?: string;
  issue: string;
  conditionIssues?: string[];
  accessories?: string[];
  deposit: number;
  estimateCost?: number;
  dueDate?: string;
  technicianName?: string;
  footer?: string;
}): string {
  return [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร ${opts.shopPhone}`] : []),
    '',
    'ใบรับซ่อม',
    `เลขที่: ${opts.ticketNumber}`,
    `วันที่: ${opts.date}`,
    SEP,
    `ลูกค้า: ${opts.customerName}`,
    ...(opts.customerPhone ? [`โทร: ${opts.customerPhone}`] : []),
    SEP,
    `อุปกรณ์: ${opts.deviceBrand} ${opts.deviceModel}`,
    ...(opts.deviceColor ? [`สี: ${opts.deviceColor}`] : []),
    ...(opts.deviceImei ? [`IMEI: ${opts.deviceImei}`] : []),
    SEP,
    'อาการ:',
    opts.issue,
    ...(opts.conditionIssues?.length ? [`สภาพ: ${opts.conditionIssues.join(', ')}`] : []),
    ...(opts.accessories?.length ? [`อุปกรณ์รับมา: ${opts.accessories.join(', ')}`] : []),
    SEP,
    ...(opts.dueDate ? [row('กำหนดเสร็จ', opts.dueDate)] : []),
    ...(opts.estimateCost ? [row('ประมาณการ', `${fmtI(opts.estimateCost)} บ.`)] : []),
    row('มัดจำ', `${fmtI(opts.deposit)} บ.`),
    ...(opts.technicianName ? [`ช่าง: ${opts.technicianName}`] : []),
    SEP,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ].join('\n');
}
