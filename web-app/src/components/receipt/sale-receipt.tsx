import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { formatThaiMoney } from '@/lib/utils'
import type { Sale, ShopSettings } from '@/types'

const PAYMENT_LABEL: Record<string, string> = {
  CASH:     'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD:     'บัตรเครดิต',
}

interface SaleReceiptProps {
  sale: Sale
  paperWidth?: '58mm' | '80mm'
  settings?: ShopSettings | null
}

export function SaleReceipt({ sale, paperWidth = '80mm', settings }: SaleReceiptProps) {
  const widthClass = paperWidth === '58mm' ? 'w-[200px]' : 'w-[280px]'

  const shopName      = settings?.shopName      || 'FixITPro'
  const shopPhone     = settings?.shopPhone     || ''
  const shopAddress   = settings?.shopAddress   || ''
  const taxId         = settings?.taxId         || ''
  const logoUrl       = settings?.logoUrl       || ''
  const receiptFooter = settings?.receiptFooter || ''

  const saleDate = (() => {
    try {
      return format(new Date(sale.createdAt), 'dd MMM yyyy HH:mm', { locale: th })
    } catch {
      return sale.createdAt
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
      <span>{label}</span>
      <span className="tabular-nums shrink-0">{value}</span>
    </div>
  )

  return (
    <div
      id="sale-receipt"
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
        <p className="font-bold">ใบเสร็จรับเงิน</p>
        <p>เลขที่: {sale.receiptNumber}</p>
        <p className="text-gray-600">{saleDate}</p>
        <p className="text-gray-600">พนักงาน: {sale.user?.name ?? '—'}</p>
      </div>
      <Divider />

      {/* ── Customer ── */}
      {sale.customer && (
        <>
          <div className="space-y-0.5 pb-1">
            <p>ลูกค้า: {sale.customer.name}</p>
            {sale.customer.phone && <p>โทร: {sale.customer.phone}</p>}
          </div>
          <Divider />
        </>
      )}

      {/* ── Items ── */}
      <div className="space-y-1.5 pb-1">
        {sale.items.map((item) => (
          <div key={item.id}>
            <p className="truncate">{item.product?.name ?? 'สินค้า'}</p>
            <div className="flex justify-between text-gray-600 pl-2">
              <span>
                {formatThaiMoney(Number(item.price))} × {item.quantity}
                {Number(item.discount) > 0 && ` (ลด ${formatThaiMoney(Number(item.discount))})`}
              </span>
              <span className="tabular-nums">{formatThaiMoney(Number(item.total))}</span>
            </div>
          </div>
        ))}
      </div>
      <Divider />

      {/* ── Totals ── */}
      <div className="space-y-0.5 pb-1">
        <Row label="ยอดรวม" value={formatThaiMoney(Number(sale.subtotal))} />
        {Number(sale.discount) > 0 && (
          <Row label="ส่วนลด" value={`-${formatThaiMoney(Number(sale.discount))}`} />
        )}
      </div>
      <Divider />
      <div className="pb-1">
        <Row label="ยอดสุทธิ" value={formatThaiMoney(Number(sale.total))} bold />
      </div>
      <Divider />

      {/* ── Payment ── */}
      <div className="space-y-0.5 pb-1">
        <Row
          label="ช่องทาง"
          value={PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
        />
        <Row label="รับเงิน" value={formatThaiMoney(Number(sale.amountPaid))} />
        {Number(sale.change) > 0 && (
          <Row label="เงินทอน" value={formatThaiMoney(Number(sale.change))} bold />
        )}
      </div>

      {/* ── Note ── */}
      {sale.note && (
        <>
          <Divider />
          <p className="text-gray-600 pb-1">หมายเหตุ: {sale.note}</p>
        </>
      )}

      {/* ── Footer ── */}
      <Divider />
      <div className="text-center space-y-0.5 pt-1 pb-2">
        {receiptFooter ? (
          <p className="text-gray-600 whitespace-pre-wrap">{receiptFooter}</p>
        ) : (
          <>
            <p>*** ขอบคุณที่ใช้บริการ ***</p>
            <p className="text-gray-600">กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน</p>
          </>
        )}
      </div>
    </div>
  )
}
