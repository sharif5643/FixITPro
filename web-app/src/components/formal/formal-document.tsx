'use client'

import { forwardRef } from 'react'
import { bahtText } from '@/lib/baht-text'

/** What the server stored when the document was issued (backend formal-documents.service.ts). */
export interface FormalContent {
  type: 'QUOTATION' | 'INVOICE' | 'RECEIPT'
  title: string
  titleEn: string
  isTaxInvoice: boolean
  seller: { name: string; address?: string | null; phone?: string | null; taxId?: string | null; taxBranch?: string | null; logoUrl?: string | null }
  buyer:  { name: string; address?: string | null; phone?: string | null; taxId?: string | null; taxBranch?: string | null }
  refs: string[]
  lines: { key: string; description: string; detail?: string | null; quantity: number; unit: string; unitPrice: number; amount: number }[]
  total: number
  vatPercent: number
  vatBase: number
  vatAmount: number
  paymentMethod: string | null
  allPaid: boolean
  note?: string | null
  warrantyText?: string | null
  quoteValidDays?: number
}

export interface FormalDoc {
  id: string
  type: FormalContent['type']
  number: string
  docDate: string
  hideDate: boolean
  content: FormalContent
}

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const BLANK_DATE = '......../......../........'

export function thaiLongDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }) }
  catch { return iso }
}

const SIGNERS: Record<FormalContent['type'], [string, string]> = {
  QUOTATION: ['ผู้อนุมัติ / ผู้สั่งซื้อ', 'ผู้เสนอราคา'],
  INVOICE:   ['ผู้รับของ', 'ผู้ส่งของ'],
  RECEIPT:   ['ผู้จ่ายเงิน', 'ผู้รับเงิน'],
}
const BUYER_LABEL: Record<FormalContent['type'], string> = {
  QUOTATION: 'เรียน / เสนอ',
  INVOICE:   'ลูกค้า',
  RECEIPT:   'ได้รับเงินจาก',
}

const C = {
  page:  { width: 794, minHeight: 1123, padding: '40px 48px', background: '#fff', color: '#111', fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' as const },
  box:   { border: '1px solid #111', padding: '8px 12px', fontSize: 13.5 },
  th:    { border: '1px solid #111', background: '#eee', padding: 6, fontWeight: 600 as const },
  td:    { borderLeft: '1px solid #111', borderRight: '1px solid #111', padding: 6, verticalAlign: 'top' as const },
  label: { display: 'inline-block', minWidth: 96, fontWeight: 700 as const },
  ck:    { display: 'inline-block', width: 13, height: 13, border: '1px solid #111', marginRight: 6, verticalAlign: -1, textAlign: 'center' as const, lineHeight: '11px', fontSize: 11 },
}

/** One A4 page of a formal document — the same component for printing and for the PDF. */
export const FormalDocumentPage = forwardRef<HTMLDivElement, { doc: FormalDoc; copy?: 'ต้นฉบับ' | 'สำเนา' }>(
  function FormalDocumentPage({ doc, copy = 'ต้นฉบับ' }, ref) {
    const c = doc.content
    const dateText = doc.hideDate ? BLANK_DATE : thaiLongDate(doc.docDate)
    const fill = Math.max(0, 8 - c.lines.length)
    const [left, right] = SIGNERS[c.type]
    const isReceipt = c.type === 'RECEIPT'
    const pm = c.paymentMethod

    return (
      <div ref={ref} className="formal-page" style={C.page}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '2px solid #111', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {c.seller.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.seller.logoUrl} alt="" crossOrigin="anonymous" style={{ height: 56, width: 'auto', objectFit: 'contain' }} />
            )}
            <div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>{c.seller.name}</div>
              {c.seller.address && <div style={{ fontSize: 13 }}>{c.seller.address}</div>}
              <div style={{ fontSize: 13 }}>
                {[c.seller.phone && `โทร ${c.seller.phone}`, c.seller.taxId && `เลขประจำตัวผู้เสียภาษี ${c.seller.taxId}`, c.seller.taxBranch]
                  .filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 700 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: '#444', letterSpacing: 1 }}>{c.titleEn}</div>
            <div style={{ display: 'inline-block', marginTop: 6, border: '1px solid #111', padding: '1px 10px', fontSize: 12 }}>{copy}</div>
          </div>
        </div>

        {/* Buyer + number/date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 12, marginTop: 14 }}>
          <div style={C.box}>
            <div><span style={C.label}>{BUYER_LABEL[c.type]}</span>{c.buyer.name}</div>
            {c.buyer.address && <div><span style={C.label}>ที่อยู่</span>{c.buyer.address}</div>}
            {(c.buyer.taxId || c.buyer.taxBranch) && (
              <div>
                {c.buyer.taxId && <><span style={C.label}>เลขผู้เสียภาษี</span>{c.buyer.taxId}</>}
                {c.buyer.taxBranch && <span style={{ marginLeft: c.buyer.taxId ? 16 : 0 }}>{c.buyer.taxBranch}</span>}
              </div>
            )}
            {c.buyer.phone && <div><span style={C.label}>โทร</span>{c.buyer.phone}</div>}
          </div>
          <div style={C.box}>
            <div><span style={{ ...C.label, minWidth: 72 }}>เลขที่</span>{doc.number}</div>
            <div><span style={{ ...C.label, minWidth: 72 }}>วันที่</span>{dateText}</div>
            {c.refs.length > 0 && <div style={{ fontSize: 12, wordBreak: 'break-all' }}><span style={{ ...C.label, minWidth: 72 }}>อ้างอิงงาน</span>{c.refs.join(', ')}</div>}
          </div>
        </div>

        {/* Lines */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={{ ...C.th, width: 44 }}>ลำดับ</th>
              <th style={C.th}>รายการ</th>
              <th style={{ ...C.th, width: 56 }}>จำนวน</th>
              <th style={{ ...C.th, width: 56 }}>หน่วย</th>
              <th style={{ ...C.th, width: 100 }}>ราคาต่อหน่วย</th>
              <th style={{ ...C.th, width: 110 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={l.key} style={{ breakInside: 'avoid' }}>
                <td style={{ ...C.td, textAlign: 'center' }}>{i + 1}</td>
                <td style={C.td}>
                  {l.description}
                  {l.detail && <div style={{ fontSize: 12, color: '#444' }}>{l.detail}</div>}
                </td>
                <td style={{ ...C.td, textAlign: 'center' }}>{l.quantity}</td>
                <td style={{ ...C.td, textAlign: 'center' }}>{l.unit}</td>
                <td style={{ ...C.td, textAlign: 'right' }}>{money(l.unitPrice)}</td>
                <td style={{ ...C.td, textAlign: 'right' }}>{money(l.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: fill }).map((_, i) => (
              <tr key={`blank-${i}`}>{Array.from({ length: 6 }).map((__, j) => <td key={j} style={{ ...C.td, height: 26 }} />)}</tr>
            ))}
            <tr><td colSpan={6} style={{ borderTop: '1px solid #111', padding: 0 }} /></tr>
          </tbody>
        </table>

        {/* Total in words + sums */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', border: '1px solid #111', borderTop: 'none', fontSize: 13.5 }}>
          <div style={{ padding: '8px 12px', borderRight: '1px solid #111' }}>
            จำนวนเงิน (ตัวอักษร)
            <div style={{ marginTop: 4, background: '#eee', padding: '6px 10px', fontWeight: 700, textAlign: 'center' }}>({bahtText(c.total)})</div>
            {c.vatPercent > 0 && <div style={{ fontSize: 12, color: '#444', marginTop: 6 }}>ราคานี้รวมภาษีมูลค่าเพิ่มแล้ว</div>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {c.vatPercent > 0 ? (
                <>
                  <SumRow label="ราคาสินค้า/บริการ (ไม่รวมภาษี)" value={money(c.vatBase)} />
                  <SumRow label={`ภาษีมูลค่าเพิ่ม ${c.vatPercent}%`} value={money(c.vatAmount)} />
                </>
              ) : (
                <SumRow label="รวมเงิน" value={money(c.total)} />
              )}
              <SumRow label="จำนวนเงินรวมทั้งสิ้น" value={money(c.total)} bold last />
            </tbody>
          </table>
        </div>

        {/* Payment */}
        {isReceipt && (
          <div style={{ marginTop: 14, fontSize: 13.5, lineHeight: 2 }}>
            ชำระโดย&nbsp;&nbsp;
            <span style={{ marginRight: 22 }}><i style={C.ck}>{pm === 'CASH' ? '✓' : ''}</i>เงินสด</span>
            <span style={{ marginRight: 22 }}><i style={C.ck}>{pm === 'TRANSFER' ? '✓' : ''}</i>โอนเงิน ธนาคาร ..................</span>
            <span style={{ marginRight: 22 }}><i style={C.ck}>{pm === 'CARD' ? '✓' : ''}</i>บัตรเครดิต</span>
            <span><i style={C.ck} />เช็ค เลขที่ ..................</span>
          </div>
        )}
        {c.type === 'QUOTATION' && (
          <div style={{ marginTop: 14, fontSize: 13.5 }}>ยืนราคา {c.quoteValidDays ?? 30} วัน นับจากวันที่เสนอราคา</div>
        )}
        {c.note && <div style={{ marginTop: 10, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>หมายเหตุ: {c.note}</div>}

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, marginTop: 40, textAlign: 'center', fontSize: 13.5, breakInside: 'avoid' }}>
          {[left, right].map((who) => (
            <div key={who}>
              <div style={{ borderBottom: '1px dotted #111', height: 34, marginBottom: 4 }} />
              ( ........................................ )<br />{who}<br />วันที่ {BLANK_DATE}
            </div>
          ))}
        </div>

        {(c.warrantyText || isReceipt) && (
          <div style={{ marginTop: 22, fontSize: 12, color: '#444', borderTop: '1px solid #ccc', paddingTop: 6 }}>
            {[c.warrantyText, isReceipt && pm === null ? 'ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์เมื่อได้รับเงินครบถ้วนแล้ว' : null].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    )
  },
)

function SumRow({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <tr style={bold ? { fontWeight: 700, background: '#eee' } : undefined}>
      <td style={{ padding: '5px 10px', borderBottom: last ? 'none' : '1px solid #111' }}>{label}</td>
      <td style={{ padding: '5px 10px', borderBottom: last ? 'none' : '1px solid #111', textAlign: 'right' }}>{value}</td>
    </tr>
  )
}
