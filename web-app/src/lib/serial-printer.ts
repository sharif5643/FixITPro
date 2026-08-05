// Web Serial API – ESC/POS thermal printer (Chrome/Edge desktop only)
// Works with any 58mm thermal printer paired over Bluetooth Classic or USB

import type { PrintReceiptOptions, PrintRepairIntakeOptions } from './printer'

// ── ESC/POS byte constants ──────────────────────────────────────────────────

const ESC = 0x1b
const GS  = 0x1d

const CMD = {
  INIT:        [ESC, 0x40],
  BOLD_ON:     [ESC, 0x45, 0x01],
  BOLD_OFF:    [ESC, 0x45, 0x00],
  ALIGN_L:     [ESC, 0x61, 0x00],
  ALIGN_C:     [ESC, 0x61, 0x01],
  ALIGN_R:     [ESC, 0x61, 0x02],
  SIZE_2X:     [ESC, 0x21, 0x30],   // double width + height
  SIZE_NM:     [ESC, 0x21, 0x00],   // normal
  LF:          [0x0a],
  CUT:         [GS,  0x56, 0x41, 0x03],
}

// ── Port singleton ──────────────────────────────────────────────────────────

let _port: SerialPort | null = null

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export async function hasSavedPort(): Promise<boolean> {
  if (!isWebSerialSupported()) return false
  const ports = await navigator.serial.getPorts()
  return ports.length > 0
}

async function getPort(): Promise<SerialPort> {
  if (_port && _port.readable) return _port

  // Try previously-granted ports first
  const ports = await navigator.serial.getPorts()
  const port = ports[0] ?? await navigator.serial.requestPort()

  await port.open({ baudRate: 9600 })
  _port = port
  return port
}

// ── Low-level write ─────────────────────────────────────────────────────────

async function write(port: SerialPort, data: Uint8Array): Promise<void> {
  const writer = port.writable!.getWriter()
  try {
    await writer.write(data)
  } finally {
    writer.releaseLock()
  }
}

// ── Buffer builder ──────────────────────────────────────────────────────────

class EscPos {
  private parts: Uint8Array[] = []
  private enc = new TextEncoder()

  cmd(...bytes: number[]): this {
    this.parts.push(new Uint8Array(bytes))
    return this
  }

  text(s: string): this {
    this.parts.push(this.enc.encode(s))
    return this
  }

  lf(n = 1): this {
    this.parts.push(new Uint8Array(Array(n).fill(0x0a)))
    return this
  }

  line(s: string): this {
    return this.text(s).lf()
  }

  sep(char = '-', len = 32): this {
    return this.line(char.repeat(len))
  }

  row(label: string, value: string, width = 32): this {
    const gap = Math.max(1, width - label.length - value.length)
    return this.line(label + ' '.repeat(gap) + value)
  }

  build(): Uint8Array {
    const total = this.parts.reduce((s, p) => s + p.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const p of this.parts) { out.set(p, off); off += p.length }
    return out
  }
}

// ── Receipt ─────────────────────────────────────────────────────────────────

function buildReceiptBuffer(opts: PrintReceiptOptions): Uint8Array {
  const p = new EscPos()
  p.cmd(...CMD.INIT)
  p.cmd(...CMD.ALIGN_C)
  p.cmd(...CMD.BOLD_ON, ...CMD.SIZE_2X).line(opts.shopName).cmd(...CMD.SIZE_NM, ...CMD.BOLD_OFF)
  if (opts.shopAddress) p.line(opts.shopAddress)
  if (opts.shopPhone)   p.line(`โทร ${opts.shopPhone}`)
  p.lf()
  p.cmd(...CMD.ALIGN_L)
  p.cmd(...CMD.BOLD_ON).line('ใบเสร็จรับเงิน').cmd(...CMD.BOLD_OFF)
  p.line(`เลขที่: ${opts.receiptNumber}`)
  p.line(`วันที่: ${opts.date}`)
  p.line(`แคชเชียร์: ${opts.cashierName}`)
  if (opts.customerName) p.line(`ลูกค้า: ${opts.customerName}`)
  p.sep()
  for (const it of opts.items) {
    p.line(it.name)
    p.row(`  x${it.qty} @ ${fmt(it.price)}`, `${fmt(it.total)}`)
  }
  p.sep()
  p.row('รวม', fmt(opts.subtotal))
  if (opts.discount > 0) p.row('ส่วนลด', `-${fmt(opts.discount)}`)
  p.cmd(...CMD.BOLD_ON)
  p.row('ยอดชำระ', fmt(opts.total))
  p.cmd(...CMD.BOLD_OFF)
  p.row('ช่องทาง', PAYMENT_TH[opts.paymentMethod] ?? opts.paymentMethod)
  if (opts.amountPaid > 0) {
    p.row('รับเงิน', fmt(opts.amountPaid))
    p.row('เงินทอน', fmt(opts.change))
  }
  p.sep()
  p.cmd(...CMD.ALIGN_C)
  p.line(opts.footer ?? 'ขอบคุณที่ใช้บริการ')
  p.lf(3)
  p.cmd(...CMD.CUT)
  return p.build()
}

// ── Repair intake ───────────────────────────────────────────────────────────

function buildRepairBuffer(opts: PrintRepairIntakeOptions): Uint8Array {
  const p = new EscPos()
  p.cmd(...CMD.INIT)
  p.cmd(...CMD.ALIGN_C)
  p.cmd(...CMD.BOLD_ON, ...CMD.SIZE_2X).line(opts.shopName).cmd(...CMD.SIZE_NM, ...CMD.BOLD_OFF)
  if (opts.shopPhone) p.line(`โทร ${opts.shopPhone}`)
  p.lf()
  p.cmd(...CMD.BOLD_ON).line('ใบรับซ่อม').cmd(...CMD.BOLD_OFF)
  p.line(`เลขที่: ${opts.ticketNumber}`)
  p.line(`วันที่: ${opts.date}`)
  p.sep()
  p.cmd(...CMD.ALIGN_L)
  p.line(`ลูกค้า: ${opts.customerName}`)
  if (opts.customerPhone) p.line(`โทร: ${opts.customerPhone}`)
  p.sep()
  p.line(`อุปกรณ์: ${opts.deviceBrand} ${opts.deviceModel}`)
  if (opts.deviceColor) p.line(`สี: ${opts.deviceColor}`)
  if (opts.deviceImei)  p.line(`IMEI: ${opts.deviceImei}`)
  p.sep()
  p.cmd(...CMD.BOLD_ON).line('อาการ:').cmd(...CMD.BOLD_OFF)
  p.line(opts.issue)
  if (opts.conditionIssues?.length) {
    p.line(`สภาพ: ${opts.conditionIssues.join(', ')}`)
  }
  if (opts.accessories?.length) {
    p.line(`อุปกรณ์เสริม: ${opts.accessories.join(', ')}`)
  }
  p.sep()
  if (opts.estimateCost) p.row('ค่าใช้จ่ายประมาณ', fmt(opts.estimateCost))
  p.row('มัดจำ', fmt(opts.deposit))
  if (opts.dueDate) p.line(`กำหนดแล้วเสร็จ: ${opts.dueDate}`)
  if (opts.technicianName) p.line(`ช่าง: ${opts.technicianName}`)
  p.sep()
  p.cmd(...CMD.ALIGN_C)
  p.line(opts.footer ?? 'ขอบคุณที่ใช้บริการ')
  p.lf(3)
  p.cmd(...CMD.CUT)
  return p.build()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PAYMENT_TH: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต',
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function serialPrintReceipt(opts: PrintReceiptOptions): Promise<void> {
  const port = await getPort()
  await write(port, buildReceiptBuffer(opts))
}

export async function serialPrintRepairIntake(opts: PrintRepairIntakeOptions): Promise<void> {
  const port = await getPort()
  await write(port, buildRepairBuffer(opts))
}

export async function forgetPort(): Promise<void> {
  if (_port) {
    try { await _port.close() } catch { /* ignore */ }
    _port = null
  }
}
