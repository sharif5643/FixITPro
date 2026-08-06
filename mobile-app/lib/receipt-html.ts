// Mirrors web-app/src/lib/printer.ts  buildRepairIntakeHtml
// Kept in sync manually — same THERMAL_CSS, same template structure.
// Used by the native side to produce HTML-based bitmap prints that look
// identical to the web receipt, so both first-print and reprint look the same.

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
`

function fmtI(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
}

function shopHeader(opts: {
  shopName: string
  shopPhone?: string
  showLogo?: boolean
  logoUrl?: string
}): string {
  return [
    opts.showLogo && opts.logoUrl
      ? `<div class="c" style="margin-bottom:6px"><img src="${opts.logoUrl}" alt="logo" style="max-width:80px;max-height:60px;object-fit:contain"/></div>`
      : '',
    `<p class="c xl">${opts.shopName}</p>`,
    opts.shopPhone ? `<p class="c xs">โทร ${opts.shopPhone}</p>` : '',
  ].filter(Boolean).join('\n')
}

export interface RepairIntakeHtmlOpts {
  shopName: string
  shopPhone?: string
  showLogo?: boolean
  logoUrl?: string
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
}

export function buildRepairIntakeHtml(opts: RepairIntakeHtmlOpts): string {
  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8">
<title>ใบรับซ่อม ${opts.ticketNumber}</title>
<style>${THERMAL_CSS}</style>
</head><body>
${shopHeader(opts)}
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
</body></html>`
}
