import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { formatThaiMoney } from '@/lib/utils'
import { receiptPaymentLegs, saleAfterSale, soldSerials } from '@/lib/sale-receipt-data'
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
  const widthClass = paperWidth === '58mm' ? 'w-[200px]' : 'w-[300px]'

  const shopName      = settings?.shopName      || 'FixITPro'
  const shopPhone     = settings?.shopPhone     || ''
  const shopAddress   = settings?.shopAddress   || ''
  const taxId         = settings?.taxId         || ''
  const logoUrl       = settings?.logoUrl       || ''
  const receiptFooter = settings?.receiptFooter || ''

  const fmt = (iso: string, pattern = 'dd MMM yyyy HH:mm') => {
    try { return format(new Date(iso), pattern, { locale: th }) } catch { return iso }
  }
  const saleDate = fmt(sale.createdAt)
  const after = saleAfterSale(sale)
  const paid = receiptPaymentLegs(sale)

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
      className={`${widthClass} thermal-receipt text-[11px] leading-normal mx-auto bg-white text-black`}
    >
      {/* ── Shop header ── */}
      <div className="text-center space-y-0.5 pb-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="flex justify-center mb-0.5">
            <img src={logoUrl} alt="logo" className="h-10 w-auto object-contain" />
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
        {after.voided && (
          <div className="my-1 border-2 border-black py-0.5">
            <p className="font-bold">*** บิลนี้ยกเลิกแล้ว ***</p>
            {after.voidReason && <p>เหตุผล: {after.voidReason}</p>}
            {after.voidedAt && <p className="text-gray-600">ยกเลิกเมื่อ {fmt(after.voidedAt)}</p>}
          </div>
        )}
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
            <div className="flex justify-between text-gray-900 pl-2">
              <span>
                {formatThaiMoney(Number(item.price))} × {item.quantity}
                {Number(item.discount) > 0 && ` (ลด ${formatThaiMoney(Number(item.discount))})`}
              </span>
              <span className="tabular-nums">{formatThaiMoney(Number(item.total))}</span>
            </div>
            {soldSerials(item).map((x) => (
              <p key={x.serial} className="pl-2 text-gray-700">
                IMEI: {x.serial}{x.warrantyUntil ? ` · ประกันถึง ${fmt(x.warrantyUntil, 'dd MMM yyyy')}` : ''}
              </p>
            ))}
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
        {paid.length > 1 ? (
          <>
            {paid.map((leg, i) => (
              <Row
                key={i}
                label={`ช่องทาง ${i + 1} (${PAYMENT_LABEL[leg.paymentMethod] ?? leg.paymentMethod})`}
                value={formatThaiMoney(Number(leg.amount))}
              />
            ))}
            <Row label="รับเงินรวม" value={formatThaiMoney(Number(sale.amountPaid))} />
          </>
        ) : (
          <>
            <Row label="ช่องทาง" value={PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod} />
            <Row label="รับเงิน" value={formatThaiMoney(Number(sale.amountPaid))} />
          </>
        )}
        {Number(sale.change) > 0 && (
          <Row label="เงินทอน" value={formatThaiMoney(Number(sale.change))} bold />
        )}
      </div>

      {/* ── Goods taken back ── */}
      {after.refunds.length > 0 && (
        <>
          <Divider />
          <div className="space-y-0.5 pb-1">
            <p className="text-center font-bold">*** มีการคืนสินค้า ***</p>
            {after.refunds.map((rf) => (
              <div key={rf.number}>
                <p className="text-gray-600">{rf.number} · {fmt(rf.at)}</p>
                {rf.items.map((i, k) => (
                  <div key={k} className="flex justify-between pl-2">
                    <span>{i.name} ×{i.quantity}</span>
                    <span className="tabular-nums shrink-0">-{formatThaiMoney(i.total)}</span>
                  </div>
                ))}
              </div>
            ))}
            <Row label="คืนเงินรวม" value={`-${formatThaiMoney(after.refunded)}`} />
            <Row label="ยอดหลังคืนสินค้า" value={formatThaiMoney(after.netAfterRefunds)} bold />
          </div>
        </>
      )}

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
