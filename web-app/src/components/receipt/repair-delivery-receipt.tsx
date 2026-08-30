'use client'

import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { formatThaiMoney } from '@/lib/utils'
import type { Repair, ShopSettings } from '@/types'

export interface RepairDeliveryReceiptProps {
  repair: Repair
  paperWidth?: '58mm' | '80mm' | 'A4'
  settings?: ShopSettings | null
  copyType?: 'shop' | 'customer'
}

function fmtDate(iso: string) {
  try { return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: th }) }
  catch { return iso }
}

const PM: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD: 'บัตรเครดิต',
}

// ── Shared calculation ───────────────────────────────────────────────────────────

function calcDelivery(repair: Repair) {
  const finalCost    = Number(repair.finalCost ?? repair.estimatedTotal ?? repair.estimateCost ?? 0)
  const deposit      = Number(repair.deposit ?? 0)
  const remaining    = Math.max(0, finalCost - deposit)  // total balance due after deposit
  const paidAmount   = Number(repair.paidAmount ?? 0)
  const change       = Math.max(0, paidAmount - remaining)
  const chargedParts = (repair.parts ?? []).filter(p => !p.isVoided && p.chargeToCustomer)
  const isPartial    = (repair as any).paymentStatus === 'PARTIAL'
  const outstanding  = isPartial ? Math.max(0, remaining - paidAmount) : 0
  return { finalCost, deposit, remaining, paidAmount, change, chargedParts, isPartial, outstanding }
}

// ── Thermal layout (58mm / 80mm) ─────────────────────────────────────────────────

function ThermalDeliveryReceipt({ repair, paperWidth, settings, copyType }: {
  repair: Repair
  paperWidth: '58mm' | '80mm'
  settings?: ShopSettings | null
  copyType?: 'shop' | 'customer'
}) {
  const widthClass    = paperWidth === '58mm' ? 'w-[200px]' : 'w-[280px]'
  const shopName      = settings?.shopName     || 'FixITPro'
  const shopPhone     = settings?.shopPhone    || ''
  const receiptFooter = settings?.receiptFooter || 'ขอบคุณที่ใช้บริการ'

  const { finalCost, deposit, remaining, paidAmount, change, chargedParts, isPartial, outstanding } = calcDelivery(repair)
  const payLabel = PM[repair.paymentMethod ?? ''] ?? repair.paymentMethod ?? ''
  const dateStr  = fmtDate(repair.paidAt ?? repair.deliveredAt ?? new Date().toISOString())

  const Divider = () => <div className="border-b border-dashed border-gray-400 my-1.5" />
  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <div className={`flex justify-between gap-1 text-[10px] ${bold ? 'font-bold' : ''}`}>
      <span className="shrink-0">{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  )

  return (
    <div className={`${widthClass} font-mono text-[10px] leading-snug text-black bg-white`}>
      <div className="text-center mb-1">
        <p className="font-bold text-sm">{shopName}</p>
        {shopPhone && <p className="text-[9px]">โทร: {shopPhone}</p>}
      </div>
      <Divider />
      <p className="text-center font-bold text-[11px]">
        {isPartial ? 'ใบรับชำระบางส่วน' : 'ใบเสร็จรับเงิน'}
      </p>
      <p className="text-center text-[9px]">ส่งมอบอุปกรณ์</p>
      {copyType && (
        <p className="text-center text-[8px] text-gray-500 mt-0.5">
          [{copyType === 'shop' ? 'ฉบับร้าน' : 'ฉบับลูกค้า'}]
        </p>
      )}
      <Divider />
      <Row label="เลขที่" value={`#${repair.ticketNumber}`} />
      <Row label="วันที่" value={dateStr} />
      <Divider />
      <Row label="ลูกค้า" value={repair.customer?.name ?? '—'} bold />
      {repair.customer?.phone && <Row label="โทร" value={repair.customer.phone} />}
      <Row label="อุปกรณ์" value={`${repair.deviceBrand} ${repair.deviceModel}`} />

      {chargedParts.length > 0 && (
        <>
          <Divider />
          <p className="font-bold text-[10px] mb-0.5">อะไหล่ที่คิดเงิน</p>
          {chargedParts.map((p) => {
            const name  = p.product?.name ?? p.productName ?? 'อะไหล่'
            const total = Number(p.sellPrice ?? 0) * p.quantity
            return (
              <div key={p.id} className="flex justify-between gap-1 text-[9px]">
                <span className="truncate">{name} ×{p.quantity}</span>
                <span className="tabular-nums shrink-0">฿{total.toLocaleString('th-TH')}</span>
              </div>
            )
          })}
        </>
      )}

      <Divider />
      <Row label="ค่าซ่อมรวม" value={`฿${finalCost.toLocaleString('th-TH')}`} />
      {deposit > 0 && <Row label="มัดจำชำระแล้ว" value={`-฿${deposit.toLocaleString('th-TH')}`} />}
      <div className="flex justify-between gap-1 text-[11px] font-bold mt-0.5">
        <span>ยอดทั้งหมด</span>
        <span className="tabular-nums">฿{remaining.toLocaleString('th-TH')}</span>
      </div>
      <Divider />
      <Row label={`รับ${isPartial ? 'ครั้งนี้' : ''} (${payLabel})`} value={`฿${paidAmount.toLocaleString('th-TH')}`} />
      {change > 0 && <Row label="เงินทอน" value={`฿${change.toLocaleString('th-TH')}`} />}

      {isPartial && (
        <>
          <Divider />
          <div className="border border-black px-1.5 py-1 my-0.5">
            <div className="flex justify-between gap-1 text-[11px] font-bold">
              <span>*** ยังค้างชำระ</span>
              <span className="tabular-nums">฿{outstanding.toLocaleString('th-TH')} ***</span>
            </div>
            <p className="text-[8px] text-center mt-0.5">กรุณานำใบนี้มาแสดงเมื่อมาชำระ</p>
          </div>
        </>
      )}

      {repair.warrantyExpiresAt && (
        <>
          <Divider />
          <p className="text-[8px] text-center">รับประกัน: {fmtDate(repair.warrantyExpiresAt)}</p>
          {repair.warrantyNote && <p className="text-[8px] text-center">{repair.warrantyNote}</p>}
        </>
      )}

      <Divider />
      <p className="text-center text-[9px]">{receiptFooter}</p>
    </div>
  )
}

// ── A4 layout ───────────────────────────────────────────────────────────────────

function A4DeliveryReceipt({ repair, settings, copyType }: {
  repair: Repair
  settings?: ShopSettings | null
  copyType?: 'shop' | 'customer'
}) {
  const shopName      = settings?.shopName     || 'FixITPro'
  const shopPhone     = settings?.shopPhone    || ''
  const receiptFooter = settings?.receiptFooter || 'ขอบคุณที่ใช้บริการ'

  const { finalCost, deposit, remaining, paidAmount, change, chargedParts, isPartial, outstanding } = calcDelivery(repair)
  const payLabel = PM[repair.paymentMethod ?? ''] ?? repair.paymentMethod ?? ''
  const dateStr  = fmtDate(repair.paidAt ?? repair.deliveredAt ?? new Date().toISOString())

  return (
    <div className="bg-white p-8 max-w-[680px] mx-auto font-sans text-[13px] text-slate-800">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{shopName}</h1>
          {shopPhone && <p className="text-slate-500 text-sm mt-0.5">โทร: {shopPhone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold text-slate-900">
            {isPartial ? 'ใบรับชำระบางส่วน' : 'ใบเสร็จรับเงิน'}
          </h2>
          <p className="text-slate-500 text-sm">ส่งมอบอุปกรณ์</p>
          {copyType && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">
              {copyType === 'shop' ? 'ฉบับร้าน' : 'ฉบับลูกค้า'}
            </span>
          )}
        </div>
      </div>

      {/* Ticket + Date */}
      <div className="flex gap-8 mb-6 p-4 bg-slate-50 rounded-xl">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">เลขที่</p>
          <p className="font-bold font-mono text-lg text-slate-900">#{repair.ticketNumber}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">วันที่รับเงิน</p>
          <p className="font-semibold text-slate-900">{dateStr}</p>
        </div>
      </div>

      {/* Customer + Device */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 border border-slate-100 rounded-xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ลูกค้า</p>
          <p className="font-bold text-slate-900">{repair.customer?.name ?? '—'}</p>
          {repair.customer?.phone && <p className="text-slate-500 text-sm">{repair.customer.phone}</p>}
        </div>
        <div className="p-4 border border-slate-100 rounded-xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">อุปกรณ์</p>
          <p className="font-bold text-slate-900">{repair.deviceBrand} {repair.deviceModel}</p>
          <p className="text-slate-500 text-sm truncate">{repair.issue}</p>
        </div>
      </div>

      {/* Charged parts */}
      {chargedParts.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">รายการอะไหล่</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 font-medium text-slate-500">รายการ</th>
                <th className="text-right py-2 font-medium text-slate-500">จำนวน</th>
                <th className="text-right py-2 font-medium text-slate-500">ราคา/ชิ้น</th>
                <th className="text-right py-2 font-medium text-slate-500">รวม</th>
              </tr>
            </thead>
            <tbody>
              {chargedParts.map((p) => {
                const name  = p.product?.name ?? p.productName ?? 'อะไหล่'
                const price = Number(p.sellPrice ?? 0)
                return (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-2 text-slate-800">{name}</td>
                    <td className="py-2 text-right tabular-nums">{p.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{formatThaiMoney(price)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{formatThaiMoney(price * p.quantity)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cost summary */}
      <div className="mb-6 border border-slate-100 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>ค่าซ่อมรวม</span>
          <span className="tabular-nums">{formatThaiMoney(finalCost)}</span>
        </div>
        {deposit > 0 && (
          <div className="flex justify-between text-emerald-600">
            <span>มัดจำชำระแล้ว</span>
            <span className="tabular-nums">-{formatThaiMoney(deposit)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-1">
          <span>ยอดทั้งหมด</span>
          <span className="tabular-nums text-blue-700">{formatThaiMoney(remaining)}</span>
        </div>
        <div className="flex justify-between text-slate-600 border-t border-slate-100 pt-2">
          <span>รับ{isPartial ? 'ครั้งนี้' : ''} ({payLabel})</span>
          <span className="tabular-nums">{formatThaiMoney(paidAmount)}</span>
        </div>
        {change > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>เงินทอน</span>
            <span className="tabular-nums">{formatThaiMoney(change)}</span>
          </div>
        )}
        {isPartial && (
          <div className="flex justify-between font-bold text-base border-t-2 border-red-200 pt-2 mt-1 bg-red-50 -mx-4 px-4 py-2 rounded-b-xl">
            <span className="text-red-700">ยังค้างชำระ</span>
            <span className="tabular-nums text-red-700">{formatThaiMoney(outstanding)}</span>
          </div>
        )}
      </div>

      {isPartial && (
        <div className="mb-6 p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-center">
          <p className="font-bold text-amber-800 text-sm">กรุณานำใบนี้มาแสดงเมื่อมาชำระยอดที่เหลือ</p>
          <p className="text-amber-600 text-xs mt-0.5">ยอดค้าง {formatThaiMoney(outstanding)} — {repair.ticketNumber}</p>
        </div>
      )}

      {/* Warranty */}
      {repair.warrantyExpiresAt && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">การรับประกัน</p>
          <p className="text-emerald-800 font-semibold text-sm mt-0.5">
            หมดอายุ: {fmtDate(repair.warrantyExpiresAt)}
          </p>
          {repair.warrantyNote && <p className="text-emerald-600 text-xs mt-0.5">{repair.warrantyNote}</p>}
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-slate-400 text-sm border-t border-slate-100 pt-4">
        {receiptFooter}
      </div>
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────────────────────────

export function RepairDeliveryReceipt({ repair, paperWidth = '58mm', settings, copyType }: RepairDeliveryReceiptProps) {
  if (paperWidth === 'A4') {
    return <A4DeliveryReceipt repair={repair} settings={settings} copyType={copyType} />
  }
  return <ThermalDeliveryReceipt repair={repair} paperWidth={paperWidth} settings={settings} copyType={copyType} />
}
