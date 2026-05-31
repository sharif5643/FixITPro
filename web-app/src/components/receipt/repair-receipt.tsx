import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { formatThaiMoney } from '@/lib/utils'
import type { Repair, ShopSettings } from '@/types'

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
  paperWidth?: '58mm' | '80mm'
  settings?: ShopSettings | null
}

export function RepairReceipt({ repair, paperWidth = '80mm', settings }: RepairReceiptProps) {
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
