import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { formatThaiMoney } from '@/lib/utils'
import type { Repair, ShopSettings } from '@/types'

interface RepairReceiptProps {
  repair: Repair
  paperWidth?: '58mm' | '80mm' | 'A4'
  settings?: ShopSettings | null
}

function fmtDate(iso: string) {
  try { return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: th }) }
  catch { return iso }
}

// ── 58mm / 80mm thermal layout ───────────────────────────────────────────────
function ThermalReceipt({ repair, paperWidth, settings }: { repair: Repair; paperWidth: '58mm' | '80mm'; settings?: ShopSettings | null }) {
  const widthClass    = paperWidth === '58mm' ? 'w-[200px]' : 'w-[280px]'
  const shopName      = settings?.shopName  || 'FixITPro'
  const shopPhone     = settings?.shopPhone || ''
  const receiptFooter = settings?.receiptFooter || ''
  const logoUrl       = settings?.logoUrl   || ''

  const Divider = () => <div className="border-b border-dashed border-gray-400 my-2" />
  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <div className={`flex justify-between gap-1 ${bold ? 'font-bold' : ''}`}>
      <span className="shrink-0">{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  )

  const estimateCost = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
  const deposit      = Number(repair.deposit ?? 0)

  return (
    <div id="repair-receipt" className={`${widthClass} font-mono text-[11px] leading-relaxed mx-auto bg-white text-gray-900`}>
      {/* Shop header */}
      <div className="text-center space-y-0.5 pb-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="flex justify-center mb-1">
            <img src={logoUrl} alt="logo" className="h-10 w-auto object-contain" />
          </div>
        )}
        <p className="font-bold text-sm tracking-widest">{shopName}</p>
        {shopPhone && <p>โทร: {shopPhone}</p>}
        {repair.branch?.name && <p>สาขา: {repair.branch.name}</p>}
      </div>
      <Divider />

      {/* Document info */}
      <div className="text-center space-y-0.5 pb-1">
        <p className="font-bold">ใบรับงานซ่อม</p>
        <p>เลขงาน: {repair.ticketNumber}</p>
        <p className="text-gray-600">วันที่รับ: {fmtDate(repair.receivedAt)}</p>
      </div>
      <Divider />

      {/* Customer */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">ลูกค้า</p>
        <p>{repair.customer?.name ?? 'ลูกค้าทั่วไป'}</p>
        {repair.customer?.phone && <p>โทร: {repair.customer.phone}</p>}
      </div>
      <Divider />

      {/* Device */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">อุปกรณ์</p>
        <p>{repair.deviceBrand} {repair.deviceModel}</p>
        {repair.deviceImei ? (
          <p>IMEI: {repair.deviceImei}</p>
        ) : (
          <p>IMEI: _______________</p>
        )}
      </div>
      <Divider />

      {/* Issue */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">อาการเสีย</p>
        <p className="whitespace-pre-wrap">{repair.issue}</p>
      </div>
      <Divider />

      {/* Cost */}
      <div className="space-y-0.5 pb-1">
        <Row label="ราคาประเมิน" value={estimateCost > 0 ? formatThaiMoney(estimateCost) : '-'} />
        <Row label="ค่ามัดจำ"    value={deposit > 0 ? formatThaiMoney(deposit) : '-'} bold />
      </div>
      <Divider />

      {/* Signatures */}
      <div className="space-y-3 pt-1 pb-2">
        <div className="flex justify-between text-[10px]">
          <div className="text-center">
            <div className="w-20 border-b border-gray-400 mb-1" />
            <p>ลายเซ็นลูกค้า</p>
          </div>
          <div className="text-center">
            <div className="w-20 border-b border-gray-400 mb-1" />
            <p>ลายเซ็นร้าน</p>
          </div>
        </div>
      </div>
      <Divider />

      {/* Footer */}
      <div className="text-center space-y-0.5 pt-1 pb-2">
        {receiptFooter ? (
          <p className="text-gray-600 whitespace-pre-wrap">{receiptFooter}</p>
        ) : (
          <>
            <p>*** กรุณาเก็บใบรับงานไว้ ***</p>
            <p className="text-gray-600">เพื่อใช้รับคืนอุปกรณ์</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── A4 layout ────────────────────────────────────────────────────────────────
function RepairReceiptA4({ repair, settings }: { repair: Repair; settings?: ShopSettings | null }) {
  const shopName      = settings?.shopName      || 'FixITPro'
  const shopPhone     = settings?.shopPhone     || ''
  const logoUrl       = settings?.logoUrl       || ''
  const receiptFooter = settings?.receiptFooter || ''

  const estimateCost = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
  const deposit      = Number(repair.deposit ?? 0)

  const Field = ({ label, value, placeholder }: { label: string; value?: string | null; placeholder?: string }) => (
    <div className="mb-3">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">{label}</p>
      {value ? (
        <p className="text-sm text-gray-900">{value}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">{placeholder ?? '—'}</p>
      )}
    </div>
  )

  return (
    <div id="repair-receipt-a4" className="w-full max-w-[794px] mx-auto bg-white font-sans text-sm text-gray-900 p-10">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-gray-900 pb-5 mb-6">
        <div className="flex items-center gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-14 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-xl font-bold">{shopName}</h1>
            {shopPhone && <p className="text-gray-600 text-sm mt-0.5">โทร: {shopPhone}</p>}
            {repair.branch?.name && (
              <p className="text-gray-600 text-sm">สาขา: {repair.branch.name}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold uppercase tracking-wider">ใบรับงานซ่อม</h2>
          <p className="text-gray-700 text-sm mt-1">
            เลขงาน: <span className="font-bold text-gray-900">{repair.ticketNumber}</span>
          </p>
          <p className="text-gray-600 text-sm">วันที่รับ: {fmtDate(repair.receivedAt)}</p>
        </div>
      </div>

      {/* Customer + Device */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">ข้อมูลลูกค้า</p>
          <Field label="ชื่อ"     value={repair.customer?.name}  placeholder="ลูกค้าทั่วไป" />
          <Field label="เบอร์โทร" value={repair.customer?.phone} placeholder="ไม่ระบุ" />
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">ข้อมูลอุปกรณ์</p>
          <Field label="ยี่ห้อ / รุ่น"   value={`${repair.deviceBrand} ${repair.deviceModel}`} />
          <div className="mb-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-0.5">
              IMEI / Serial
              <span className="ml-1 text-[10px] text-orange-500 normal-case font-normal">(แก้ไขได้ก่อนส่งคืน)</span>
            </p>
            {repair.deviceImei ? (
              <p className="text-sm font-mono text-gray-900">{repair.deviceImei}</p>
            ) : (
              <div className="border-b border-dashed border-gray-400 mt-4 mb-1" />
            )}
          </div>
        </div>
      </div>

      {/* Issue */}
      <div className="rounded-lg border border-gray-200 p-4 mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">อาการเสีย</p>
        <p className="text-sm whitespace-pre-wrap min-h-[40px]">{repair.issue}</p>
      </div>

      {/* Cost */}
      <div className="mb-8">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-t border-b border-gray-200">
              <th className="text-left py-2 px-4 font-semibold">รายการ</th>
              <th className="text-right py-2 px-4 font-semibold w-40">จำนวนเงิน (฿)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-2.5 px-4">ราคาประเมิน</td>
              <td className="py-2.5 px-4 text-right tabular-nums">
                {estimateCost > 0 ? formatThaiMoney(estimateCost) : '—'}
              </td>
            </tr>
            <tr className="border-b border-gray-100 font-semibold">
              <td className="py-2.5 px-4">ค่ามัดจำ</td>
              <td className="py-2.5 px-4 text-right tabular-nums">
                {deposit > 0 ? formatThaiMoney(deposit) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-20 mt-10 pt-6 border-t border-gray-200">
        <div className="text-center">
          <div className="h-16 border-b border-dashed border-gray-400 mb-2" />
          <p className="text-xs text-gray-600 font-semibold">ลายเซ็นลูกค้า</p>
          <p className="text-xs text-gray-400 mt-0.5">{repair.customer?.name ?? ''}</p>
        </div>
        <div className="text-center">
          <div className="h-16 border-b border-dashed border-gray-400 mb-2" />
          <p className="text-xs text-gray-600 font-semibold">ลายเซ็นร้าน</p>
          <p className="text-xs text-gray-400 mt-0.5">{shopName}</p>
        </div>
      </div>

      {/* Footer */}
      {receiptFooter && (
        <div className="text-center mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <p className="whitespace-pre-wrap">{receiptFooter}</p>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function RepairReceipt({ repair, paperWidth = '80mm', settings }: RepairReceiptProps) {
  if (paperWidth === 'A4') {
    return <RepairReceiptA4 repair={repair} settings={settings} />
  }
  return <ThermalReceipt repair={repair} paperWidth={paperWidth} settings={settings} />
}
