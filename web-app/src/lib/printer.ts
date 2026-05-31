import type { PrintReceiptOptions } from './sunmi-printer'
import type { ThermalPreviewData, ThermalLine } from '@/components/sunmi/printer-flow'

export type { PrintReceiptOptions }

// ── Repair print option types ─────────────────────────────────────────────────

export interface PrintRepairIntakeOptions {
  shopName: string
  shopPhone?: string
  ticketNumber: string
  date: string
  customerName: string
  customerPhone?: string
  deviceBrand: string
  deviceModel: string
  deviceColor?: string
  deviceImei?: string
  issue: string
  conditionIssues?: string[]
  accessories?: string[]
  deposit: number
  estimateCost?: number
  dueDate?: string
  technicianName?: string
  footer?: string
  taxId?:        string
  showTaxId?:    boolean
  showLogo?:     boolean
  logoUrl?:      string
}

export interface PrintRepairDeliveryOptions {
  shopName: string
  shopPhone?: string
  ticketNumber: string
  date: string
  customerName: string
  customerPhone?: string
  deviceBrand: string
  deviceModel: string
  issue: string
  finalCost: number
  deposit: number
  remaining: number
  paymentMethod: string
  amountPaid: number
  change: number
  footer?: string
  repairWarrantyText?: string
  taxId?:             string
  showTaxId?:         boolean
  paymentQrUrl?:      string
  showLogo?:          boolean
  logoUrl?:           string
}

export interface PrintSimSaleOptions {
  shopName:      string
  shopPhone?:    string
  receiptNumber: string
  date:          string
  cashierName:   string
  productName:   string
  price:         number
  paymentMethod: string
  amountPaid:    number
  change:        number
  phoneNumber?:  string
  iccid?:        string
  footer?:       string
  taxId?:        string
  showTaxId?:    boolean
  paymentQrUrl?: string
  showLogo?:     boolean
  logoUrl?:      string
  customerName?: string
}

export interface PrintPackageSaleOptions {
  shopName:        string
  shopPhone?:      string
  receiptNumber:   string
  date:            string
  cashierName:     string
  carrier:         string
  packageAmount:   number
  walletDeduction: number
  profit:          number
  walletBalance:   number
  phoneNumber?:    string
  note?:           string
  paymentMethod:   string
  amountPaid:      number
  change:          number
  footer?:         string
  taxId?:          string
  showTaxId?:      boolean
  paymentQrUrl?:   string
  showLogo?:       boolean
  logoUrl?:        string
}

// ── Money formatters ──────────────────────────────────────────────────────────

function fmtB(n: number) {
  return `${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtI(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
}

// ── Shared 58mm thermal CSS ───────────────────────────────────────────────────
// All sizes in px for 384px-wide bitmap (58mm @ 203dpi).
// CSS px units map 1:1 to bitmap pixels once the WebView viewport is forced to 384px.
// Never use mm/pt here — those resolve to tiny values at the CSS 96dpi reference and
// produce a narrow receipt that doesn't fill the paper.

const THERMAL_CSS = `
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 24px;
    line-height: 1.4;
    width: 384px;
    padding: 8px 12px 16px 12px;
    color: #000;
    background: #fff;
  }
  .c { text-align: center; }
  .r { text-align: right; }
  .b { font-weight: bold; }

  .xl  { font-size: 34px; font-weight: bold; }
  .lg  { font-size: 28px; font-weight: bold; }
  .sm  { font-size: 20px; }
  .xs  { font-size: 18px; }

  .hr  { border: none; border-top: 2px dashed #000; margin: 8px 0; }

  .t   { width: 100%; border-collapse: collapse; }
  .t td { vertical-align: top; padding-bottom: 4px; font-size: 24px; }
  .t .l { white-space: nowrap; padding-right: 16px; }

  .row   { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .row .v { white-space: nowrap; text-align: right; }

  .total   { display: flex; justify-content: space-between; align-items: baseline;
             font-size: 30px; font-weight: bold; margin: 4px 0; }
  .total .v { white-space: nowrap; text-align: right; }

  .iname { word-break: break-word; margin-bottom: 2px; }
  .isub  { display: flex; justify-content: space-between; font-size: 20px; margin-bottom: 8px; }
  .isub .v { white-space: nowrap; text-align: right; }
`


// ── Shared header helper ──────────────────────────────────────────────────────

function shopHeaderHtml(opts: {
  shopName: string; shopAddress?: string; shopPhone?: string
  taxId?: string; showTaxId?: boolean; showLogo?: boolean; logoUrl?: string
}): string {
  return [
    opts.showLogo && opts.logoUrl
      ? `<div class="c" style="margin-bottom:6px"><img src="${opts.logoUrl}" alt="logo" style="max-width:80px;max-height:60px;object-fit:contain"/></div>`
      : '',
    `<p class="c xl">${opts.shopName}</p>`,
    opts.shopAddress ? `<p class="c xs">${opts.shopAddress}</p>` : '',
    opts.shopPhone   ? `<p class="c xs">โทร ${opts.shopPhone}</p>` : '',
    opts.showTaxId !== false && opts.taxId ? `<p class="c xs">เลขผู้เสียภาษี: ${opts.taxId}</p>` : '',
  ].filter(Boolean).join('\n')
}

function qrHtml(url: string, method: string): string {
  if (!url || method !== 'TRANSFER') return ''
  return `<div class="hr"></div>
<p class="c xs b">สแกนเพื่อชำระเงิน</p>
<div class="c" style="margin:6px 0"><img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=150x150&format=png" alt="QR" style="width:150px;height:150px"/></div>`
}

// ── HTML builders ─────────────────────────────────────────────────────────────

export function buildReceiptHtml(opts: PrintReceiptOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบเสร็จ ${opts.receiptNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">ใบเสร็จรับเงิน</p>
<p class="c sm">#${opts.receiptNumber}</p>
<p class="c xs">${opts.date}</p>
<p class="c xs">พนักงาน: ${opts.cashierName}</p>
<div class="hr"></div>
${opts.items.map(it => `<p class="iname">${it.name}</p>
<div class="isub"><span>${it.qty} × ฿${fmtB(it.price)}</span><span class="v">฿${fmtB(it.total)}</span></div>`).join('')}
<div class="hr"></div>
<div class="row"><span>ยอดรวม</span><span class="v">฿${fmtB(opts.subtotal)}</span></div>
${opts.discount > 0 ? `<div class="row"><span>ส่วนลด</span><span class="v">-฿${fmtB(opts.discount)}</span></div>` : ''}
<div class="hr"></div>
<div class="total"><span>รวมทั้งสิ้น</span><span class="v">฿${fmtB(opts.total)}</span></div>
<div class="hr"></div>
<div class="row"><span>${PM[opts.paymentMethod] ?? opts.paymentMethod}</span><span class="v">฿${fmtB(opts.amountPaid)}</span></div>
${opts.change > 0 ? `<div class="row"><span>เงินทอน</span><span class="v">฿${fmtB(opts.change)}</span></div>` : ''}
${opts.paymentQrUrl ? qrHtml(opts.paymentQrUrl, opts.paymentMethod) : ''}
${opts.customerName ? `<div class="hr"></div><p class="xs">ลูกค้า: ${opts.customerName}</p>` : ''}
<div class="hr"></div>
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

export function buildRepairIntakeHtml(opts: PrintRepairIntakeOptions): string {
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบรับซ่อม ${opts.ticketNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">ใบรับซ่อม</p>
<p class="c sm">#${opts.ticketNumber}</p>
<p class="c xs">${opts.date}</p>
<div class="hr"></div>
<table class="t">
<tr><td class="l">ลูกค้า</td><td class="b">${opts.customerName}</td></tr>
${opts.customerPhone ? `<tr><td class="l">โทร</td><td>${opts.customerPhone}</td></tr>` : ''}
</table>
<div class="hr"></div>
<table class="t">
<tr><td class="l">อุปกรณ์</td><td class="b">${opts.deviceBrand} ${opts.deviceModel}</td></tr>
${opts.deviceColor ? `<tr><td class="l">สี</td><td>${opts.deviceColor}</td></tr>` : ''}
${opts.deviceImei ? `<tr><td class="l">IMEI</td><td class="sm">${opts.deviceImei}</td></tr>` : ''}
</table>
<div class="hr"></div>
<p class="xs b">อาการเสีย:</p>
<p>${opts.issue}</p>
${opts.conditionIssues?.length ? `<div class="hr"></div><p class="xs b">สภาพที่มีปัญหา:</p><p class="xs">${opts.conditionIssues.join(', ')}</p>` : ''}
${opts.accessories?.length ? `<div class="hr"></div><p class="xs b">อุปกรณ์ที่รับมา:</p><p class="xs">${opts.accessories.join(', ')}</p>` : ''}
<div class="hr"></div>
${opts.dueDate ? `<div class="row"><span class="xs">กำหนดเสร็จ</span><span class="v xs">${opts.dueDate}</span></div>` : ''}
${opts.estimateCost ? `<div class="row"><span>ประมาณการ</span><span class="v">฿${fmtI(opts.estimateCost)}</span></div>` : ''}
<div class="total"><span>มัดจำ</span><span class="v">฿${fmtI(opts.deposit)}</span></div>
<div class="hr"></div>
${opts.technicianName ? `<p class="xs">ช่าง: ${opts.technicianName}</p>` : ''}
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

export function buildRepairDeliveryHtml(opts: PrintRepairDeliveryOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบเสร็จซ่อม ${opts.ticketNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">ใบเสร็จซ่อม / ส่งมอบ</p>
<p class="c sm">#${opts.ticketNumber}</p>
<p class="c xs">${opts.date}</p>
<div class="hr"></div>
<table class="t">
<tr><td class="l">ลูกค้า</td><td class="b">${opts.customerName}</td></tr>
${opts.customerPhone ? `<tr><td class="l">โทร</td><td>${opts.customerPhone}</td></tr>` : ''}
<tr><td class="l">อุปกรณ์</td><td>${opts.deviceBrand} ${opts.deviceModel}</td></tr>
</table>
<div class="hr"></div>
<div class="row"><span>ค่าซ่อม</span><span class="v">฿${fmtI(opts.finalCost)}</span></div>
<div class="row"><span>มัดจำชำระแล้ว</span><span class="v">-฿${fmtI(opts.deposit)}</span></div>
<div class="hr"></div>
<div class="total"><span>ยอดชำระ</span><span class="v">฿${fmtI(opts.remaining)}</span></div>
<div class="hr"></div>
<div class="row"><span>${PM[opts.paymentMethod] ?? opts.paymentMethod}</span><span class="v">฿${fmtI(opts.amountPaid)}</span></div>
${opts.change > 0 ? `<div class="row"><span>เงินทอน</span><span class="v">฿${fmtI(opts.change)}</span></div>` : ''}
${opts.paymentQrUrl ? qrHtml(opts.paymentQrUrl, opts.paymentMethod) : ''}
${opts.repairWarrantyText ? `<div class="hr"></div><p class="c xs">${opts.repairWarrantyText}</p>` : ''}
<div class="hr"></div>
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

// ── Plain-text builders (Web Share API: LINE / WhatsApp) ──────────────────────

const HR = '─────────────────────────'

function buildReceiptText(opts: PrintReceiptOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร' }
  return [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `ใบเสร็จ #${opts.receiptNumber}`,
    opts.date,
    `พนักงาน: ${opts.cashierName}`,
    HR,
    ...opts.items.map(it => `${it.name}\n  ${it.qty}×฿${fmtB(it.price)}  ฿${fmtB(it.total)}`),
    HR,
    `ยอดรวม:     ฿${fmtB(opts.subtotal)}`,
    ...(opts.discount > 0 ? [`ส่วนลด:    -฿${fmtB(opts.discount)}`] : []),
    `รวมทั้งสิ้น: ฿${fmtB(opts.total)}`,
    `${PM[opts.paymentMethod] ?? opts.paymentMethod}: ฿${fmtB(opts.amountPaid)}`,
    ...(opts.change > 0 ? [`เงินทอน:   ฿${fmtB(opts.change)}`] : []),
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ].join('\n')
}

function buildRepairIntakeText(opts: PrintRepairIntakeOptions): string {
  return [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `ใบรับซ่อม #${opts.ticketNumber}`,
    opts.date,
    HR,
    `ลูกค้า: ${opts.customerName}`,
    ...(opts.customerPhone ? [`โทร: ${opts.customerPhone}`] : []),
    `อุปกรณ์: ${opts.deviceBrand} ${opts.deviceModel}`,
    ...(opts.deviceColor ? [`สี: ${opts.deviceColor}`] : []),
    ...(opts.deviceImei ? [`IMEI: ${opts.deviceImei}`] : []),
    HR,
    'อาการเสีย:',
    opts.issue,
    ...(opts.conditionIssues?.length ? [`สภาพ: ${opts.conditionIssues.join(', ')}`] : []),
    ...(opts.accessories?.length ? [`อุปกรณ์รับมา: ${opts.accessories.join(', ')}`] : []),
    HR,
    ...(opts.dueDate ? [`กำหนดเสร็จ: ${opts.dueDate}`] : []),
    ...(opts.estimateCost ? [`ประมาณการ: ฿${fmtI(opts.estimateCost)}`] : []),
    `มัดจำ: ฿${fmtI(opts.deposit)}`,
    ...(opts.technicianName ? [`ช่าง: ${opts.technicianName}`] : []),
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ].join('\n')
}

function buildRepairDeliveryText(opts: PrintRepairDeliveryOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร' }
  return [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `ใบเสร็จซ่อม #${opts.ticketNumber}`,
    opts.date,
    HR,
    `ลูกค้า: ${opts.customerName}`,
    ...(opts.customerPhone ? [`โทร: ${opts.customerPhone}`] : []),
    `อุปกรณ์: ${opts.deviceBrand} ${opts.deviceModel}`,
    HR,
    `ค่าซ่อม:  ฿${fmtI(opts.finalCost)}`,
    `มัดจำ:    ฿${fmtI(opts.deposit)}`,
    `ยอดชำระ: ฿${fmtI(opts.remaining)}`,
    HR,
    `${PM[opts.paymentMethod] ?? opts.paymentMethod}: ฿${fmtI(opts.amountPaid)}`,
    ...(opts.change > 0 ? [`เงินทอน: ฿${fmtI(opts.change)}`] : []),
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ].join('\n')
}

// ── Browser fallback (window.print popup) ────────────────────────────────────
// Used by web-desktop POS receipt dialog; SUNMI pages use PrinterFlowSheet instead.

function popupPrint(html: string, filename: string): void {
  const win = window.open('', '_blank', 'width=320,height=600,toolbar=0,menubar=0')
  if (win) {
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => { win.print(); setTimeout(() => win.close(), 800) }, 300)
  } else {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }
}

export async function printReceipt(opts: PrintReceiptOptions): Promise<void> {
  popupPrint(buildReceiptHtml(opts), `receipt-${opts.receiptNumber}.html`)
}

// ── Web Share API (text → LINE / WhatsApp / email) ────────────────────────────

async function nativeShare(title: string, text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ title, text }) }
    catch (e: any) { if (e?.name !== 'AbortError') throw e }
  }
}

// ── Share functions (แชร์ button — sends plain text) ─────────────────────────

export async function shareReceipt(opts: PrintReceiptOptions): Promise<void> {
  await nativeShare(`ใบเสร็จ #${opts.receiptNumber}`, buildReceiptText(opts))
}

export async function shareRepairIntake(opts: PrintRepairIntakeOptions): Promise<void> {
  await nativeShare(`ใบรับซ่อม #${opts.ticketNumber}`, buildRepairIntakeText(opts))
}

export async function shareRepairDelivery(opts: PrintRepairDeliveryOptions): Promise<void> {
  await nativeShare(`ใบเสร็จซ่อม #${opts.ticketNumber}`, buildRepairDeliveryText(opts))
}

// ── Cash drawer ───────────────────────────────────────────────────────────────

export async function openCashDrawer(): Promise<void> {
  // Not available via PrintManager — silently skipped
}

// ── Thermal receipt preview data builders ─────────────────────────────────────
// Used by PrinterFlowSheet to render the narrow 58mm receipt card in the UI.

const PM_LABEL: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }

export function buildReceiptPreviewData(opts: PrintReceiptOptions): ThermalPreviewData {
  const lines: ThermalLine[] = [
    { type: 'row', label: 'พนักงาน', value: opts.cashierName },
    { type: 'separator' },
    ...opts.items.map((it): ThermalLine => ({
      type:   'item',
      name:   it.name,
      detail: `${it.qty} × ฿${fmtB(it.price)}`,
      total:  `฿${fmtB(it.total)}`,
    })),
    { type: 'separator' },
    { type: 'row', label: 'ยอดรวม', value: `฿${fmtB(opts.subtotal)}` },
    ...(opts.discount > 0
      ? [{ type: 'row' as const, label: 'ส่วนลด', value: `-฿${fmtB(opts.discount)}` }]
      : []),
    { type: 'separator' },
    { type: 'row', label: 'รวมทั้งสิ้น', value: `฿${fmtB(opts.total)}`, bold: true },
    { type: 'separator' },
    { type: 'row', label: PM_LABEL[opts.paymentMethod] ?? opts.paymentMethod, value: `฿${fmtB(opts.amountPaid)}` },
    ...(opts.change > 0
      ? [{ type: 'row' as const, label: 'เงินทอน', value: `฿${fmtB(opts.change)}` }]
      : []),
    ...(opts.customerName
      ? [{ type: 'separator' as const }, { type: 'row' as const, label: 'ลูกค้า', value: opts.customerName }]
      : []),
  ]
  return {
    title:     'ใบเสร็จรับเงิน',
    number:    opts.receiptNumber,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.date,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

export function buildRepairIntakePreviewData(opts: PrintRepairIntakeOptions): ThermalPreviewData {
  const lines: ThermalLine[] = [
    { type: 'row', label: 'ลูกค้า', value: opts.customerName, bold: true },
    ...(opts.customerPhone
      ? [{ type: 'row' as const, label: 'โทร', value: opts.customerPhone }]
      : []),
    { type: 'separator' },
    { type: 'row', label: 'อุปกรณ์', value: `${opts.deviceBrand} ${opts.deviceModel}`, bold: true },
    ...(opts.deviceColor
      ? [{ type: 'row' as const, label: 'สี', value: opts.deviceColor }]
      : []),
    ...(opts.deviceImei
      ? [{ type: 'row' as const, label: 'IMEI', value: opts.deviceImei }]
      : []),
    { type: 'separator' },
    { type: 'center', text: 'อาการเสีย:', small: true },
    { type: 'center', text: opts.issue },
    ...(opts.conditionIssues?.length
      ? [
          { type: 'separator' as const },
          { type: 'center' as const, text: 'สภาพที่มีปัญหา:', small: true },
          { type: 'center' as const, text: opts.conditionIssues.join(', ') },
        ]
      : []),
    ...(opts.accessories?.length
      ? [
          { type: 'separator' as const },
          { type: 'center' as const, text: 'อุปกรณ์ที่รับมา:', small: true },
          { type: 'center' as const, text: opts.accessories.join(', ') },
        ]
      : []),
    { type: 'separator' },
    ...(opts.dueDate
      ? [{ type: 'row' as const, label: 'กำหนดเสร็จ', value: opts.dueDate }]
      : []),
    ...(opts.estimateCost
      ? [{ type: 'row' as const, label: 'ประมาณการ', value: `฿${fmtI(opts.estimateCost)}` }]
      : []),
    { type: 'row', label: 'มัดจำ', value: `฿${fmtI(opts.deposit)}`, bold: true },
    ...(opts.technicianName
      ? [{ type: 'separator' as const }, { type: 'row' as const, label: 'ช่าง', value: opts.technicianName }]
      : []),
  ]
  return {
    title:     'ใบรับซ่อม',
    number:    opts.ticketNumber,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.date,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

export function buildRepairDeliveryPreviewData(opts: PrintRepairDeliveryOptions): ThermalPreviewData {
  const lines: ThermalLine[] = [
    { type: 'row', label: 'ลูกค้า', value: opts.customerName, bold: true },
    { type: 'row', label: 'อุปกรณ์', value: `${opts.deviceBrand} ${opts.deviceModel}` },
    { type: 'separator' },
    { type: 'row', label: 'ค่าซ่อม', value: `฿${fmtI(opts.finalCost)}` },
    { type: 'row', label: 'มัดจำ', value: `-฿${fmtI(opts.deposit)}` },
    { type: 'separator' },
    { type: 'row', label: 'ยอดชำระ', value: `฿${fmtI(opts.remaining)}`, bold: true },
    { type: 'separator' },
    { type: 'row', label: PM_LABEL[opts.paymentMethod] ?? opts.paymentMethod, value: `฿${fmtI(opts.amountPaid)}` },
    ...(opts.change > 0
      ? [{ type: 'row' as const, label: 'เงินทอน', value: `฿${fmtI(opts.change)}` }]
      : []),
    ...(opts.repairWarrantyText
      ? [{ type: 'separator' as const }, { type: 'center' as const, text: opts.repairWarrantyText, small: true }]
      : []),
  ]
  return {
    title:     'ใบเสร็จซ่อม / ส่งมอบ',
    number:    opts.ticketNumber,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.date,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

// ── SIM Sale receipt ──────────────────────────────────────────────────────────

export function buildSimSaleHtml(opts: PrintSimSaleOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบเสร็จ SIM ${opts.receiptNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">ใบเสร็จ SIM / อินเทอร์เน็ต</p>
<p class="c sm">#${opts.receiptNumber}</p>
<p class="c xs">${opts.date}</p>
<p class="c xs">พนักงาน: ${opts.cashierName}</p>
<div class="hr"></div>
<p class="iname b">${opts.productName}</p>
${opts.phoneNumber ? `<div class="row"><span class="xs">เบอร์</span><span class="v xs b">${opts.phoneNumber}</span></div>` : ''}
${opts.iccid ? `<div class="row"><span class="xs">ICCID</span><span class="v xs">${opts.iccid}</span></div>` : ''}
${opts.customerName ? `<div class="row"><span class="xs">ลูกค้า</span><span class="v xs">${opts.customerName}</span></div>` : ''}
<div class="hr"></div>
<div class="total"><span>ราคา</span><span class="v">฿${fmtB(opts.price)}</span></div>
<div class="hr"></div>
<div class="row"><span>${PM[opts.paymentMethod] ?? opts.paymentMethod}</span><span class="v">฿${fmtB(opts.amountPaid)}</span></div>
${opts.change > 0 ? `<div class="row"><span>เงินทอน</span><span class="v">฿${fmtB(opts.change)}</span></div>` : ''}
${opts.paymentQrUrl ? qrHtml(opts.paymentQrUrl, opts.paymentMethod) : ''}
<div class="hr"></div>
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

export function buildSimSalePreviewData(opts: PrintSimSaleOptions): ThermalPreviewData {
  const lines: ThermalLine[] = [
    { type: 'row', label: 'พนักงาน', value: opts.cashierName },
    { type: 'separator' },
    { type: 'center', text: opts.productName },
    ...(opts.phoneNumber
      ? [{ type: 'row' as const, label: 'เบอร์', value: opts.phoneNumber, bold: true }]
      : []),
    ...(opts.iccid
      ? [{ type: 'row' as const, label: 'ICCID', value: opts.iccid }]
      : []),
    ...(opts.customerName
      ? [{ type: 'row' as const, label: 'ลูกค้า', value: opts.customerName }]
      : []),
    { type: 'separator' },
    { type: 'row', label: 'ราคา', value: `฿${fmtB(opts.price)}`, bold: true },
    { type: 'separator' },
    { type: 'row', label: PM_LABEL[opts.paymentMethod] ?? opts.paymentMethod, value: `฿${fmtB(opts.amountPaid)}` },
    ...(opts.change > 0
      ? [{ type: 'row' as const, label: 'เงินทอน', value: `฿${fmtB(opts.change)}` }]
      : []),
  ]
  return {
    title:     'ใบเสร็จ SIM / อินเทอร์เน็ต',
    number:    opts.receiptNumber,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.date,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

export async function shareSimSale(opts: PrintSimSaleOptions): Promise<void> {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร' }
  const lines = [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `SIM / อินเทอร์เน็ต #${opts.receiptNumber}`,
    opts.date,
    HR,
    opts.productName,
    ...(opts.phoneNumber ? [`เบอร์: ${opts.phoneNumber}`] : []),
    ...(opts.iccid ? [`ICCID: ${opts.iccid}`] : []),
    ...(opts.customerName ? [`ลูกค้า: ${opts.customerName}`] : []),
    HR,
    `ราคา: ฿${fmtB(opts.price)}`,
    `${PM[opts.paymentMethod] ?? opts.paymentMethod}: ฿${fmtB(opts.amountPaid)}`,
    ...(opts.change > 0 ? [`เงินทอน: ฿${fmtB(opts.change)}`] : []),
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ]
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `SIM #${opts.receiptNumber}`, text: lines.join('\n') })
    } catch (e: any) {
      if (e?.name !== 'AbortError') throw e
    }
  }
}

// ── Carrier Package Sale receipt ──────────────────────────────────────────────

export function buildPackageSaleHtml(opts: PrintPackageSaleOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบเสร็จแพ็กเกจ ${opts.receiptNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">ใบเสร็จเติมเน็ต / SIM</p>
<p class="c sm">#${opts.receiptNumber}</p>
<p class="c xs">${opts.date}</p>
<p class="c xs">พนักงาน: ${opts.cashierName}</p>
<div class="hr"></div>
<div class="row"><span>เครือข่าย</span><span class="v b">${opts.carrier}</span></div>
${opts.phoneNumber ? `<div class="row"><span class="xs">เบอร์</span><span class="v xs b">${opts.phoneNumber}</span></div>` : ''}
${opts.note ? `<div class="row"><span class="xs">หมายเหตุ</span><span class="v xs">${opts.note}</span></div>` : ''}
<div class="hr"></div>
<div class="total"><span>ราคาขาย</span><span class="v">฿${fmtB(opts.packageAmount)}</span></div>
<div class="row xs"><span>ต้นทุน (97%)</span><span class="v">฿${fmtB(opts.walletDeduction)}</span></div>
<div class="row xs"><span>กำไร (3%)</span><span class="v">฿${fmtB(opts.profit)}</span></div>
<div class="hr"></div>
<div class="row"><span>${PM[opts.paymentMethod] ?? opts.paymentMethod}</span><span class="v">฿${fmtB(opts.amountPaid)}</span></div>
${opts.change > 0 ? `<div class="row"><span>เงินทอน</span><span class="v">฿${fmtB(opts.change)}</span></div>` : ''}
${opts.paymentQrUrl ? qrHtml(opts.paymentQrUrl, opts.paymentMethod) : ''}
<div class="hr"></div>
<div class="row xs"><span>เงินคงเหลือ ${opts.carrier}</span><span class="v">฿${fmtB(opts.walletBalance)}</span></div>
<div class="hr"></div>
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

export function buildPackageSalePreviewData(opts: PrintPackageSaleOptions): ThermalPreviewData {
  const lines: ThermalLine[] = [
    { type: 'row', label: 'พนักงาน', value: opts.cashierName },
    { type: 'separator' },
    { type: 'row', label: 'เครือข่าย', value: opts.carrier, bold: true },
    ...(opts.phoneNumber
      ? [{ type: 'row' as const, label: 'เบอร์', value: opts.phoneNumber, bold: true }]
      : []),
    ...(opts.note
      ? [{ type: 'row' as const, label: 'หมายเหตุ', value: opts.note }]
      : []),
    { type: 'separator' },
    { type: 'row', label: 'ราคาขาย', value: `฿${fmtB(opts.packageAmount)}`, bold: true },
    { type: 'row', label: 'ต้นทุน (97%)', value: `฿${fmtB(opts.walletDeduction)}` },
    { type: 'row', label: 'กำไร (3%)', value: `฿${fmtB(opts.profit)}` },
    { type: 'separator' },
    { type: 'row', label: PM_LABEL[opts.paymentMethod] ?? opts.paymentMethod, value: `฿${fmtB(opts.amountPaid)}` },
    ...(opts.change > 0
      ? [{ type: 'row' as const, label: 'เงินทอน', value: `฿${fmtB(opts.change)}` }]
      : []),
    { type: 'separator' },
    { type: 'row', label: `เงินคงเหลือ ${opts.carrier}`, value: `฿${fmtB(opts.walletBalance)}` },
  ]
  return {
    title:     'ใบเสร็จเติมเน็ต / SIM',
    number:    opts.receiptNumber,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.date,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

export async function sharePackageSale(opts: PrintPackageSaleOptions): Promise<void> {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร' }
  const lines = [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `เติมเน็ต / SIM #${opts.receiptNumber}`,
    opts.date,
    HR,
    `เครือข่าย: ${opts.carrier}`,
    ...(opts.phoneNumber ? [`เบอร์: ${opts.phoneNumber}`] : []),
    ...(opts.note ? [`หมายเหตุ: ${opts.note}`] : []),
    HR,
    `ราคาขาย: ฿${fmtB(opts.packageAmount)}`,
    `กำไร: ฿${fmtB(opts.profit)}`,
    `${PM[opts.paymentMethod] ?? opts.paymentMethod}: ฿${fmtB(opts.amountPaid)}`,
    ...(opts.change > 0 ? [`เงินทอน: ฿${fmtB(opts.change)}`] : []),
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ]
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `แพ็กเกจ #${opts.receiptNumber}`, text: lines.join('\n') })
    } catch (e: any) {
      if (e?.name !== 'AbortError') throw e
    }
  }
}

// ── Expense slip ──────────────────────────────────────────────────────────────

export interface PrintExpenseSlipOptions {
  shopName:      string
  shopPhone?:    string
  slipNumber:    string
  date:          string
  cashierName:   string
  description:   string
  categoryName:  string
  amount:        number
  paymentMethod: string
  note?:         string
  footer?:       string
}

export function buildExpenseSlipHtml(opts: PrintExpenseSlipOptions): string {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบค่าใช้จ่าย ${opts.slipNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">ใบบันทึกค่าใช้จ่าย</p>
<p class="c sm">#${opts.slipNumber}</p>
<p class="c xs">${opts.date}</p>
<p class="c xs">พนักงาน: ${opts.cashierName}</p>
<div class="hr"></div>
<div class="row"><span class="xs">หมวดหมู่</span><span class="v xs b">${opts.categoryName}</span></div>
<p class="b">${opts.description}</p>
${opts.note ? `<p class="xs" style="margin-top:4px">${opts.note}</p>` : ''}
<div class="hr"></div>
<div class="row"><span class="xs">วิธีชำระ</span><span class="v xs">${PM[opts.paymentMethod] ?? opts.paymentMethod}</span></div>
<div class="total"><span>ยอดรวม</span><span class="v">฿${fmtB(opts.amount)}</span></div>
<div class="hr"></div>
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

export function buildExpenseSlipPreviewData(opts: PrintExpenseSlipOptions): ThermalPreviewData {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต' }
  const lines: ThermalLine[] = [
    { type: 'row', label: 'พนักงาน', value: opts.cashierName },
    { type: 'separator' },
    { type: 'row', label: 'หมวดหมู่', value: opts.categoryName, bold: true },
    { type: 'center', text: opts.description },
    ...(opts.note
      ? [{ type: 'center' as const, text: opts.note, small: true }]
      : []),
    { type: 'separator' },
    { type: 'row', label: 'วิธีชำระ', value: PM[opts.paymentMethod] ?? opts.paymentMethod },
    { type: 'row', label: 'ยอดรวม', value: `฿${fmtB(opts.amount)}`, bold: true },
  ]
  return {
    title:     'ใบบันทึกค่าใช้จ่าย',
    number:    opts.slipNumber,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.date,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

export async function shareExpenseSlip(opts: PrintExpenseSlipOptions): Promise<void> {
  const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร' }
  const lines = [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `ค่าใช้จ่าย #${opts.slipNumber}`,
    opts.date,
    HR,
    `หมวดหมู่: ${opts.categoryName}`,
    opts.description,
    ...(opts.note ? [opts.note] : []),
    HR,
    `${PM[opts.paymentMethod] ?? opts.paymentMethod}: ฿${fmtB(opts.amount)}`,
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ]
  await nativeShare(`ค่าใช้จ่าย #${opts.slipNumber}`, lines.join('\n'))
}

// ── Daily closing summary slip ────────────────────────────────────────────────

export interface PrintDailyClosingOptions {
  shopName:           string
  shopPhone?:         string
  cashierName:        string
  openedAt:           string
  closedAt:           string
  salesCount:         number
  totalSales:         number
  repairCount:        number
  repairTotal:        number
  packageSaleCount:   number
  packageSaleTotal:   number
  packageSaleProfit:  number
  expectedBalance:    number
  actualBalance:      number
  difference:         number
  footer?:            string
}

export function buildDailyClosingHtml(opts: PrintDailyClosingOptions): string {
  const diff = opts.difference
  const diffColor = diff < 0 ? 'color:#dc2626' : diff > 0 ? 'color:#16a34a' : 'color:#64748b'
  const diffSign  = diff >= 0 ? '+' : ''
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>สรุปปิดกะ</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeaderHtml(opts)}
<div class="hr"></div>
<p class="c lg">สรุปปิดกะ</p>
<p class="c xs">เปิด: ${opts.openedAt}</p>
<p class="c xs">ปิด: ${opts.closedAt}</p>
<p class="c xs">พนักงาน: ${opts.cashierName}</p>
<div class="hr"></div>
<div class="row"><span>ยอดขาย (${opts.salesCount} รายการ)</span><span class="v">฿${fmtB(opts.totalSales)}</span></div>
<div class="row"><span>งานซ่อม (${opts.repairCount} งาน)</span><span class="v">฿${fmtB(opts.repairTotal)}</span></div>
${opts.packageSaleCount > 0 ? `<div class="row"><span>SIM/แพ็กเกจ (${opts.packageSaleCount})</span><span class="v">฿${fmtB(opts.packageSaleTotal)}</span></div>
<div class="row xs"><span>กำไร SIM</span><span class="v">฿${fmtB(opts.packageSaleProfit)}</span></div>` : ''}
<div class="hr"></div>
<div class="row"><span>เงินสดที่ควรมี</span><span class="v b">฿${fmtB(opts.expectedBalance)}</span></div>
<div class="row"><span>ยอดที่นับได้</span><span class="v b">฿${fmtB(opts.actualBalance)}</span></div>
<div class="hr"></div>
<div class="total" style="${diffColor}"><span>ส่วนต่าง</span><span class="v">${diffSign}฿${fmtB(diff)}</span></div>
<div class="hr"></div>
<p class="c xs">${opts.footer ?? 'ขอบคุณที่ใช้บริการ'}</p>
<br><br>
</body></html>`
}

export function buildDailyClosingPreviewData(opts: PrintDailyClosingOptions): ThermalPreviewData {
  const diff     = opts.difference
  const diffSign = diff >= 0 ? '+' : ''
  const lines: ThermalLine[] = [
    { type: 'row', label: 'เปิดกะ', value: opts.openedAt },
    { type: 'row', label: 'ปิดกะ', value: opts.closedAt },
    { type: 'row', label: 'พนักงาน', value: opts.cashierName },
    { type: 'separator' },
    { type: 'row', label: `ยอดขาย (${opts.salesCount})`, value: `฿${fmtB(opts.totalSales)}` },
    { type: 'row', label: `งานซ่อม (${opts.repairCount})`, value: `฿${fmtB(opts.repairTotal)}` },
    ...(opts.packageSaleCount > 0
      ? [{ type: 'row' as const, label: `SIM/แพ็กเกจ (${opts.packageSaleCount})`, value: `฿${fmtB(opts.packageSaleTotal)}` }]
      : []),
    { type: 'separator' },
    { type: 'row', label: 'เงินสดที่ควรมี', value: `฿${fmtB(opts.expectedBalance)}`, bold: true },
    { type: 'row', label: 'ยอดที่นับได้', value: `฿${fmtB(opts.actualBalance)}`, bold: true },
    { type: 'separator' },
    { type: 'row', label: 'ส่วนต่าง', value: `${diffSign}฿${fmtB(diff)}`, bold: true },
  ]
  return {
    title:     'สรุปปิดกะ',
    number:    opts.closedAt,
    shopName:  opts.shopName,
    shopPhone: opts.shopPhone,
    date:      opts.closedAt,
    footer:    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
    lines,
  }
}

export async function shareDailyClosing(opts: PrintDailyClosingOptions): Promise<void> {
  const diff     = opts.difference
  const diffSign = diff >= 0 ? '+' : ''
  const lines = [
    opts.shopName,
    ...(opts.shopPhone ? [`โทร: ${opts.shopPhone}`] : []),
    HR,
    `สรุปปิดกะ — ${opts.closedAt}`,
    `พนักงาน: ${opts.cashierName}`,
    HR,
    `ยอดขาย (${opts.salesCount}): ฿${fmtB(opts.totalSales)}`,
    `งานซ่อม (${opts.repairCount}): ฿${fmtB(opts.repairTotal)}`,
    ...(opts.packageSaleCount > 0
      ? [`SIM/แพ็กเกจ (${opts.packageSaleCount}): ฿${fmtB(opts.packageSaleTotal)}`]
      : []),
    HR,
    `เงินสดที่ควรมี: ฿${fmtB(opts.expectedBalance)}`,
    `ยอดที่นับได้:   ฿${fmtB(opts.actualBalance)}`,
    `ส่วนต่าง: ${diffSign}฿${fmtB(diff)}`,
    HR,
    opts.footer ?? 'ขอบคุณที่ใช้บริการ',
  ]
  await nativeShare(`สรุปปิดกะ ${opts.closedAt}`, lines.join('\n'))
}
