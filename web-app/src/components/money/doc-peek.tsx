'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, X } from 'lucide-react'
import api from '@/lib/api'
import { cn, formatThaiMoney } from '@/lib/utils'
import { MoneyLine } from '@/components/reports/money-parts'
import { RepairMoneyBox, type RepairMoney } from './repair-money'

/**
 * The document behind a number: a bill, a repair job, an expense, a purchase order, a shift or a
 * SIM sale. Any list of money can show its rows as DocLinks; tapping one opens the document right
 * there, with a button to its full page when it has one.
 */
export type DocKind = 'SALE' | 'REPAIR' | 'PACKAGE' | 'SHIFT' | 'EXPENSE' | 'PO'
export interface DocRef { kind: DocKind; id: string; label: string }

const KIND: Record<DocKind, { icon: string; name: string }> = {
  SALE:    { icon: '🧾', name: 'บิลขาย' },
  REPAIR:  { icon: '🔧', name: 'งานซ่อม' },
  PACKAGE: { icon: '📶', name: 'ขายซิม / เติมเงิน' },
  SHIFT:   { icon: '🕒', name: 'กะ' },
  EXPENSE: { icon: '🧾', name: 'ค่าใช้จ่าย' },
  PO:      { icon: '📦', name: 'ใบสั่งซื้อ' },
}

/** The full page of a document, when there is one */
export function docHref(d: DocRef): string | null {
  switch (d.kind) {
    case 'SALE':    return `/print/sale/${d.id}`
    case 'REPAIR':  return `/repairs/${d.id}`
    case 'EXPENSE': return '/expenses'
    case 'PO':      return '/purchase-orders'
    case 'SHIFT':   return '/shifts'
    case 'PACKAGE': return '/package-sales'
  }
}

/** A document's name as a link: opens the document in a side panel */
export function DocLink({ doc, className }: { doc: DocRef | null | undefined; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!doc) return <span className={className}>—</span>
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-md font-mono text-xs font-bold text-blue-700 hover:bg-blue-50 hover:underline dark:text-blue-400 dark:hover:bg-blue-900/30', className)}>
        <span className="font-sans">{KIND[doc.kind].icon}</span>{doc.label}
      </button>
      {open && <DocPeek doc={doc} onClose={() => setOpen(false)} />}
    </>
  )
}

export function DocPeek({ doc, onClose }: { doc: DocRef; onClose: () => void }) {
  const href = docHref(doc)
  return (
    <div className="fixed inset-0 z-[70] flex justify-end print:hidden" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-[#1E293B]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
          <span className="text-lg">{KIND[doc.kind].icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{KIND[doc.kind].name}</p>
            <p className="truncate font-mono font-bold">{doc.label}</p>
          </div>
          {href && (
            <Link href={href} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              เปิดหน้าเต็ม <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#F8FAFC] px-5 py-4 dark:bg-[#0F172A]">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B]">
            <DocBody doc={doc} />
          </div>
        </div>
      </div>
    </div>
  )
}

const URL_OF: Partial<Record<DocKind, (id: string) => string>> = {
  SALE:    (id) => `/sales/${id}`,
  REPAIR:  (id) => `/repairs/${id}/profit`,
  EXPENSE: (id) => `/expenses/${id}`,
  PO:      (id) => `/purchase-orders/${id}`,
  SHIFT:   (id) => `/shifts/${id}/ledger`,
}

const METHOD: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร', QR: 'QR' }
const when = (d?: string | null) => d ? new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function DocBody({ doc }: { doc: DocRef }) {
  const url = URL_OF[doc.kind]
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ['doc-peek', doc.kind, doc.id],
    queryFn: async () => (await api.get(url!(doc.id))).data,
    enabled: !!url,
    staleTime: 30_000,
  })
  if (!url) return <p className="text-sm text-muted-foreground">ดูรายละเอียดเต็มได้ที่หน้า “ขายซิม / แพ็กเกจ”</p>
  if (isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />กำลังโหลด…</p>
  if (isError || !data) return <p className="text-sm text-red-600">เปิดรายการนี้ไม่ได้ (อาจถูกลบ หรือไม่มีสิทธิ์ดู)</p>

  if (doc.kind === 'REPAIR') return <RepairMoneyBox m={data as RepairMoney} />

  if (doc.kind === 'SALE') {
    const s = data
    const items: any[] = s.items ?? []
    const pays: any[] = s.payments ?? []
    const refunds: any[] = s.refunds ?? []
    return (
      <div>
        <p className="mb-2 text-xs text-muted-foreground">{when(s.createdAt)} · {s.customer?.name ?? 'ลูกค้าทั่วไป'}{s.user?.name ? ` · ขายโดย ${s.user.name}` : ''}{s.status === 'VOIDED' ? ' · ยกเลิกแล้ว' : ''}</p>
        {items.map((i) => (
          <MoneyLine key={i.id} label={`${i.isFreebie ? '🎁 ' : ''}${i.product?.name ?? i.productName ?? 'สินค้า'} × ${i.quantity}${i.isFreebie ? ' (แถม)' : ''}`}
            value={Number(i.total)} note={i.costPrice != null ? `ทุน ${formatThaiMoney(Number(i.costPrice) * i.quantity)}` : undefined} />
        ))}
        {Number(s.discount) > 0 && <MoneyLine label="ส่วนลดท้ายบิล" value={Number(s.discount)} minus />}
        <MoneyLine label="ยอดบิล" value={Number(s.total)} total />
        {pays.length > 0 && <p className="mt-2 text-xs text-muted-foreground">จ่ายด้วย {pays.map((p) => `${METHOD[p.paymentMethod] ?? p.paymentMethod} ${formatThaiMoney(Number(p.amount))}`).join(' + ')}</p>}
        {refunds.map((r) => <MoneyLine key={r.id} label={`คืนเงิน ${when(r.createdAt)}`} value={Number(r.totalRefund)} minus />)}
      </div>
    )
  }

  if (doc.kind === 'EXPENSE') {
    const e = data
    return (
      <div>
        <MoneyLine label={e.description} value={Number(e.amount)} minus note={`${e.category?.name ?? ''} · ${when(e.createdAt)}`} />
        <p className="mt-2 text-xs text-muted-foreground">
          {e.paidByOwner ? '👤 เจ้าของจ่ายเอง (ไม่ได้ใช้เงินในลิ้นชัก)' : e.shiftId ? `💵 จ่ายจากลิ้นชักของกะ (${METHOD[e.paymentMethod] ?? e.paymentMethod})` : `จ่ายด้วย ${METHOD[e.paymentMethod] ?? e.paymentMethod}`}
          {e.createdBy?.name ? ` · บันทึกโดย ${e.createdBy.name}` : ''}
        </p>
        {e.note && <p className="mt-1 text-xs text-muted-foreground">หมายเหตุ: {e.note}</p>}
        {e.voidedAt && <p className="mt-1 text-xs font-semibold text-red-600">ยกเลิกแล้ว: {e.voidReason}</p>}
      </div>
    )
  }

  if (doc.kind === 'PO') {
    const po = data
    return (
      <div>
        <p className="mb-2 text-xs text-muted-foreground">{po.supplier?.name} · {when(po.createdAt)} · {po.status}</p>
        {(po.items ?? []).map((i: any) => (
          <MoneyLine key={i.id} label={`${i.product?.name ?? 'สินค้า'} × ${i.quantity}`} value={Number(i.unitCost) * i.quantity} note={i.receivedQty != null ? `รับแล้ว ${i.receivedQty}` : undefined} />
        ))}
        <MoneyLine label="ยอดใบสั่งซื้อ" value={Number(po.total)} total />
        {(po.payments ?? []).map((p: any) => <MoneyLine key={p.id} label={`จ่ายแล้ว ${when(p.paidAt)} (${METHOD[p.paymentMethod] ?? p.paymentMethod})`} value={Number(p.amount)} minus />)}
        {Number(po.total) - Number(po.paidTotal ?? 0) > 0 && <MoneyLine label="ยังค้างจ่าย" value={Number(po.total) - Number(po.paidTotal ?? 0)} muted />}
      </div>
    )
  }

  // SHIFT: who worked it, and every bit of money that went through it
  const sh = data
  const entries: any[] = sh.entries ?? []
  const KIND_LABEL: Record<string, string> = {
    SALE: 'ขาย', REFUND: 'คืนเงิน', REPAIR_PAYMENT: 'ค่าซ่อม', REPAIR_DEPOSIT: 'มัดจำซ่อม', REPAIR_DEBT_PAYMENT: 'จ่ายหนี้ซ่อม',
    PACKAGE_SALE: 'ซิม', PACKAGE_DEBT_PAYMENT: 'ค้างซิม', EXPENSE: 'ค่าใช้จ่าย', SUPPLIER_PAYMENT: 'จ่ายซัพ',
    CASH_IN: 'เงินเข้าลิ้นชัก', CASH_OUT: 'เงินออกจากลิ้นชัก', REPAIR_REFUND: 'คืนเงินซ่อม',
  }
  const cash = entries.filter((e) => e.method === 'CASH').reduce((t, e) => t + Number(e.amount), 0)
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{sh.openedBy?.name ?? ''} · เปิด {when(sh.openedAt)}{sh.closedAt ? ` · ปิด ${when(sh.closedAt)}` : ' · ยังเปิดอยู่'}</p>
      <MoneyLine label="เงินทอนตั้งต้น" value={Number(sh.openBalance ?? 0)} />
      {entries.map((e, i) => (
        <MoneyLine key={i} label={`${KIND_LABEL[e.kind] ?? e.kind} ${e.ref ?? ''}`} value={Math.abs(Number(e.amount))} minus={Number(e.amount) < 0}
          note={`${when(e.at)} · ${METHOD[e.method] ?? e.method}${e.name ? ` · ${e.name}` : ''}`} />
      ))}
      <MoneyLine label="เงินสดที่ควรมีในลิ้นชัก" value={Number(sh.openBalance ?? 0) + cash} total />
    </div>
  )
}
