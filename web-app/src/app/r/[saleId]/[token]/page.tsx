'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, ReceiptText } from 'lucide-react'
import { formatThaiMoney } from '@/lib/utils'

interface PublicReceipt {
  receiptNumber: string
  status: string
  subtotal: string | number
  discount: string | number
  total: string | number
  paymentMethod: string
  amountPaid: string | number
  change: string | number
  createdAt: string
  customer?: { name: string } | null
  branchName?: string | null
  items: { quantity: number; price: string | number; discount: string | number; product: { name: string }; serialNumbers?: { serial: string; warrantyExpiresAt?: string | null }[] }[]
  payments: { paymentMethod: string; amount: string | number }[]
  shop?: { shopName?: string | null; shopPhone?: string | null; shopAddress?: string | null; receiptFooter?: string | null; logoUrl?: string | null } | null
}

const METHOD: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร', QR: 'QR', CREDIT: 'ค้างชำระ', MIXED: 'หลายช่องทาง' }

function fmtDate(iso?: string | null) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}

/** The receipt a customer opens from the QR on the printout or the link sent to their LINE */
export default function PublicReceiptPage() {
  const { saleId, token } = useParams<{ saleId: string; token: string }>()
  const [data, setData] = useState<PublicReceipt | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/public/receipts/${encodeURIComponent(saleId)}/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError(true))
  }, [saleId, token])

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <ReceiptText className="h-10 w-10 text-slate-300" />
        <p className="text-lg font-semibold text-slate-800">ไม่พบใบเสร็จนี้</p>
        <p className="text-sm text-slate-500">ลิงก์อาจไม่ครบ ลองสแกน QR บนใบเสร็จอีกครั้ง หรือสอบถามร้าน</p>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </main>
    )
  }

  const shopName = data.shop?.shopName || 'FixITPro'
  const discount = Number(data.discount ?? 0)
  const voided = data.status === 'VOIDED' || data.status === 'REFUNDED'
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <article className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <header className="mb-4 text-center">
          {data.shop?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.shop.logoUrl} alt="" className="mx-auto mb-2 h-14 object-contain" />
          )}
          <h1 className="text-lg font-bold text-slate-900">{shopName}</h1>
          {data.branchName && <p className="text-xs text-slate-500">{data.branchName}</p>}
          {data.shop?.shopAddress && <p className="text-xs text-slate-500">{data.shop.shopAddress}</p>}
          {data.shop?.shopPhone && <p className="text-xs text-slate-500">โทร {data.shop.shopPhone}</p>}
        </header>

        <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">ใบเสร็จเลขที่</span><span className="font-semibold">{data.receiptNumber}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">วันที่</span><span>{fmtDate(data.createdAt)}</span></div>
          {data.customer?.name && <div className="flex justify-between"><span className="text-slate-500">ลูกค้า</span><span>{data.customer.name}</span></div>}
        </div>

        {voided && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-600">
            {data.status === 'VOIDED' ? 'บิลนี้ถูกยกเลิกแล้ว' : 'บิลนี้คืนเงินแล้ว'}
          </p>
        )}

        <ul className="divide-y divide-slate-100 text-sm">
          {data.items.map((it, i) => (
            <li key={i} className="py-2">
              <div className="flex justify-between gap-3">
                <span className="text-slate-800">{it.product.name} × {it.quantity}</span>
                <span className="tabular-nums">{formatThaiMoney(Number(it.price) * it.quantity - Number(it.discount ?? 0))}</span>
              </div>
              {(it.serialNumbers ?? []).map((s) => (
                <p key={s.serial} className="text-xs text-slate-500">
                  IMEI/S/N {s.serial}{s.warrantyExpiresAt ? ` · ประกันถึง ${new Date(s.warrantyExpiresAt).toLocaleDateString('th-TH')}` : ''}
                </p>
              ))}
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1 border-t border-dashed border-slate-200 pt-3 text-sm">
          {discount > 0 && <div className="flex justify-between text-slate-500"><span>ส่วนลด</span><span className="tabular-nums">-{formatThaiMoney(discount)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>ยอดรวม</span><span className="tabular-nums">{formatThaiMoney(Number(data.total))}</span></div>
          {data.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-slate-500"><span>{METHOD[p.paymentMethod] ?? p.paymentMethod}</span><span className="tabular-nums">{formatThaiMoney(Number(p.amount))}</span></div>
          ))}
          {Number(data.change) > 0 && <div className="flex justify-between text-slate-500"><span>เงินทอน</span><span className="tabular-nums">{formatThaiMoney(Number(data.change))}</span></div>}
        </div>

        {data.shop?.receiptFooter && <p className="mt-5 whitespace-pre-line text-center text-xs text-slate-500">{data.shop.receiptFooter}</p>}
        <p className="mt-5 text-center text-[11px] text-slate-400">ใบเสร็จออนไลน์ · FixITPro</p>
      </article>
    </main>
  )
}
