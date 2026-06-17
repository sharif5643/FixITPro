import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { formatThaiMoney } from '@/lib/utils'
import type { Repair, ShopSettings } from '@/types'

function RepairReceiptA4({ repair, settings }: { repair: Repair; settings?: ShopSettings | null }) {
  const shopName      = settings?.shopName      || 'FixITPro'
  const shopPhone     = settings?.shopPhone     || ''
  const shopAddress   = settings?.shopAddress   || ''
  const taxId         = settings?.taxId         || ''
  const logoUrl       = settings?.logoUrl       || ''
  const receiptFooter = settings?.receiptFooter || ''

  const receivedDate = (() => {
    try { return format(new Date(repair.receivedAt), 'dd MMMM yyyy HH:mm', { locale: th }) }
    catch { return repair.receivedAt }
  })()

  const laborCost  = Number(repair.estimatedLaborCost ?? 0)
  const partsCost  = Number(repair.estimatedPartsCost ?? 0)
  const deposit    = Number(repair.deposit ?? 0)
  const totalCost  = Number(repair.estimatedTotal ?? repair.estimateCost ?? laborCost + partsCost)
  const remaining  = Math.max(0, totalCost - deposit)

  return (
    <div id="repair-receipt-a4" className="w-full max-w-[794px] mx-auto bg-white font-sans text-sm text-gray-900 p-8">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-16 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-xl font-bold">{shopName}</h1>
            {shopAddress && <p className="text-gray-600 text-xs mt-0.5">{shopAddress}</p>}
            {shopPhone   && <p className="text-gray-600 text-xs">โทร: {shopPhone}</p>}
            {taxId       && <p className="text-gray-600 text-xs">เลขที่ผู้เสียภาษี: {taxId}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold uppercase tracking-wider text-gray-800">ใบรับงานซ่อม</h2>
          <p className="text-gray-600 text-xs mt-1">เลขงาน: <span className="font-bold text-gray-900">{repair.ticketNumber}</span></p>
          <p className="text-gray-600 text-xs">วันที่รับ: {receivedDate}</p>
          {repair.dueDate && (
            <p className="text-gray-600 text-xs">
              กำหนดส่ง: {format(new Date(repair.dueDate), 'dd MMMM yyyy', { locale: th })}
            </p>
          )}
        </div>
      </div>

      {/* Customer + Device */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">ข้อมูลลูกค้า</h3>
          <p className="font-semibold">{repair.customer?.name ?? 'ลูกค้าทั่วไป'}</p>
          {repair.customer?.phone && <p className="text-gray-600">โทร: {repair.customer.phone}</p>}
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">ข้อมูลอุปกรณ์</h3>
          <p className="font-semibold">{repair.deviceBrand} {repair.deviceModel}</p>
          {repair.deviceImei && <p className="text-gray-600 text-xs font-mono">IMEI: {repair.deviceImei}</p>}
          {repair.deviceColor && <p className="text-gray-600">สี: {repair.deviceColor}</p>}
          {repair.accessories && <p className="text-gray-600 text-xs">อุปกรณ์ที่รับมา: {repair.accessories}</p>}
        </div>
      </div>

      {/* Issue */}
      <div className="rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">อาการเสีย / รายละเอียดงาน</h3>
        <p className="whitespace-pre-wrap">{repair.issue}</p>
        {repair.note && <p className="text-gray-600 text-xs mt-2">หมายเหตุ: {repair.note}</p>}
      </div>

      {/* Cost breakdown */}
      <div className="mb-6">
        <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">ค่าใช้จ่าย</h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-t border-b border-gray-200">
              <th className="text-left py-2 px-3 font-semibold">รายการ</th>
              <th className="text-right py-2 px-3 font-semibold">จำนวนเงิน (฿)</th>
            </tr>
          </thead>
          <tbody>
            {laborCost > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2 px-3">ค่าแรง</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatThaiMoney(laborCost)}</td>
              </tr>
            )}
            {partsCost > 0 && (
              <tr className="border-b border-gray-100">
                <td className="py-2 px-3">ค่าอะไหล่</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatThaiMoney(partsCost)}</td>
              </tr>
            )}
            {repair.parts && repair.parts.length > 0 && repair.parts.map((part) => (
              <tr key={part.id} className="border-b border-gray-100 text-gray-700">
                <td className="py-1.5 px-3 pl-6 text-xs">↳ {part.product?.name ?? 'อะไหล่'} ×{part.quantity}</td>
                <td className="py-1.5 px-3 text-right text-xs tabular-nums">{formatThaiMoney(Number(part.price) * part.quantity)}</td>
              </tr>
            ))}
            {totalCost > 0 && (
              <tr className="border-b border-gray-200 font-semibold">
                <td className="py-2 px-3">ยอดรวม (ประมาณ)</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatThaiMoney(totalCost)}</td>
              </tr>
            )}
            {deposit > 0 && (
              <tr className="border-b border-gray-100 text-blue-700">
                <td className="py-2 px-3">ค่ามัดจำ</td>
                <td className="py-2 px-3 text-right tabular-nums">({formatThaiMoney(deposit)})</td>
              </tr>
            )}
            <tr className="bg-gray-50 font-bold">
              <td className="py-2 px-3">ยอดคงเหลือ</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatThaiMoney(remaining)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Technician */}
      {repair.technician && (
        <p className="text-sm text-gray-600 mb-6">ช่างผู้รับ: <span className="font-semibold text-gray-900">{repair.technician.name}</span></p>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-16 mt-12 pt-4 border-t border-gray-200">
        <div className="text-center">
          <div className="h-14 border-b border-dashed border-gray-400 mb-2" />
          <p className="text-xs text-gray-600">ลายมือชื่อผู้ส่งซ่อม</p>
          <p className="text-xs text-gray-400 mt-0.5">{repair.customer?.name ?? ''}</p>
        </div>
        <div className="text-center">
          <div className="h-14 border-b border-dashed border-gray-400 mb-2" />
          <p className="text-xs text-gray-600">ลายมือชื่อผู้รับงาน</p>
          <p className="text-xs text-gray-400 mt-0.5">{repair.technician?.name ?? shopName}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500">
        {receiptFooter ? (
          <p className="whitespace-pre-wrap">{receiptFooter}</p>
        ) : (
          <p>*** กรุณาเก็บใบรับงานไว้เพื่อใช้รับคืนอุปกรณ์ ***</p>
        )}
      </div>
    </div>
  )
}

const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED:      'รับงานแล้ว',
  DIAGNOSING:    'กำลังตรวจสอบ',
  WAITING_PARTS: 'รออะไหล่',
  IN_PROGRESS:   'กำลังซ่อม',
  COMPLETED:     'ซ่อมเสร็จ',
  DELIVERED:     'ส่งคืนแล้ว',
  CANCELLED:     'ยกเลิก',
}

interface RepairReceiptProps {
  repair: Repair
  paperWidth?: '58mm' | '80mm' | 'A4'
  settings?: ShopSettings | null
}

export function RepairReceipt({ repair, paperWidth = '80mm', settings }: RepairReceiptProps) {
  if (paperWidth === 'A4') {
    return <RepairReceiptA4 repair={repair} settings={settings} />
  }

  const widthClass = paperWidth === '58mm' ? 'w-[200px]' : 'w-[280px]'

  const shopName      = settings?.shopName      || 'FixITPro'
  const shopPhone     = settings?.shopPhone     || ''
  const shopAddress   = settings?.shopAddress   || ''
  const taxId         = settings?.taxId         || ''
  const logoUrl       = settings?.logoUrl       || ''
  const receiptFooter = settings?.receiptFooter || ''

  const receivedDate = (() => {
    try {
      return format(new Date(repair.receivedAt), 'dd MMM yyyy HH:mm', { locale: th })
    } catch {
      return repair.receivedAt
    }
  })()

  const Divider = () => (
    <div className="border-b border-dashed border-gray-400 my-2" />
  )

  const Row = ({
    label,
    value,
    bold,
  }: {
    label: string
    value: string
    bold?: boolean
  }) => (
    <div className={`flex justify-between gap-1 ${bold ? 'font-bold' : ''}`}>
      <span className="shrink-0">{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  )

  const estimateCost = Number(repair.estimateCost ?? 0)
  const deposit      = Number(repair.deposit ?? 0)
  const remaining    = estimateCost - deposit

  return (
    <div
      id="repair-receipt"
      className={`${widthClass} font-mono text-[11px] leading-relaxed mx-auto bg-white text-gray-900`}
    >
      {/* ── Shop header ── */}
      <div className="text-center space-y-0.5 pb-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="flex justify-center mb-1">
            <img src={logoUrl} alt="logo" className="h-12 w-auto object-contain" />
          </div>
        )}
        <p className="font-bold text-sm tracking-widest">{shopName}</p>
        {shopPhone   && <p>โทร: {shopPhone}</p>}
        {shopAddress && <p>{shopAddress}</p>}
        {taxId       && <p>เลขที่ผู้เสียภาษี: {taxId}</p>}
      </div>
      <Divider />

      {/* ── Document info ── */}
      <div className="text-center space-y-0.5 pb-1">
        <p className="font-bold">ใบรับงานซ่อม</p>
        <p>เลขงาน: {repair.ticketNumber}</p>
        <p className="text-gray-600">วันที่รับ: {receivedDate}</p>
        <p className="text-gray-600">
          สถานะ: {REPAIR_STATUS_LABEL[repair.status] ?? repair.status}
        </p>
      </div>
      <Divider />

      {/* ── Customer ── */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">ข้อมูลลูกค้า</p>
        <p>ชื่อ: {repair.customer?.name ?? 'ลูกค้าทั่วไป'}</p>
        {repair.customer?.phone && <p>โทร: {repair.customer.phone}</p>}
      </div>
      <Divider />

      {/* ── Device ── */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">ข้อมูลอุปกรณ์</p>
        <p>
          {repair.deviceBrand} {repair.deviceModel}
        </p>
        {repair.deviceImei && <p>IMEI: {repair.deviceImei}</p>}
      </div>
      <Divider />

      {/* ── Symptoms ── */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">อาการเสีย</p>
        <p className="whitespace-pre-wrap">{repair.issue}</p>
        {repair.note && (
          <p className="text-gray-600 mt-1">หมายเหตุ: {repair.note}</p>
        )}
      </div>
      <Divider />

      {/* ── Parts (if any) ── */}
      {repair.parts && repair.parts.length > 0 && (
        <>
          <div className="space-y-1 pb-1">
            <p className="font-bold">อะไหล่</p>
            {repair.parts.map((part) => (
              <div key={part.id} className="flex justify-between">
                <span className="truncate flex-1">{part.product?.name ?? 'อะไหล่'}</span>
                <span className="tabular-nums shrink-0 ml-1">
                  ×{part.quantity} {formatThaiMoney(Number(part.price))}
                </span>
              </div>
            ))}
          </div>
          <Divider />
        </>
      )}

      {/* ── Cost ── */}
      <div className="space-y-0.5 pb-1">
        <p className="font-bold">ค่าใช้จ่าย</p>
        {estimateCost > 0 && (
          <Row label="ยอดประเมิน" value={formatThaiMoney(estimateCost)} />
        )}
        {deposit > 0 && (
          <Row label="ค่ามัดจำ" value={formatThaiMoney(deposit)} />
        )}
        {estimateCost > 0 && deposit > 0 && (
          <Row label="ยอดคงเหลือ" value={formatThaiMoney(remaining > 0 ? remaining : 0)} bold />
        )}
        {repair.finalCost != null && (
          <Row label="ราคาสุดท้าย" value={formatThaiMoney(Number(repair.finalCost))} bold />
        )}
      </div>
      <Divider />

      {/* ── Technician ── */}
      {repair.technician && (
        <>
          <div className="pb-1">
            <p>ช่างผู้รับ: {repair.technician.name}</p>
          </div>
          <Divider />
        </>
      )}

      {/* ── Signature ── */}
      <div className="space-y-3 pt-1 pb-2">
        <div className="flex justify-between text-[10px]">
          <div className="text-center">
            <div className="w-20 border-b border-gray-400 mb-1" />
            <p>ผู้ส่งซ่อม</p>
          </div>
          <div className="text-center">
            <div className="w-20 border-b border-gray-400 mb-1" />
            <p>ผู้รับงาน</p>
          </div>
        </div>
      </div>
      <Divider />

      {/* ── Footer ── */}
      <div className="text-center space-y-0.5 pt-1 pb-2">
        {shopPhone && <p className="text-gray-600">ติดต่อ: {shopPhone}</p>}
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
