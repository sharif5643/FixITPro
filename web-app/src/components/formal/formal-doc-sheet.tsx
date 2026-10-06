'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileText, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { Platform } from '@/lib/platform'
import { localDay } from '@/lib/repair-batch'
import { REPAIR_LABEL } from '@/components/ui/status-badge'
import { useCustomerRepairs } from '@/components/repairs/repair-batch-print'
import { thaiLongDate, type FormalContent } from '@/components/formal/formal-document'
import type { ShopSettings } from '@/types'

/**
 * Issue a formal A4 document for an agency or company: quotation, delivery note / invoice, or
 * receipt (a tax invoice when the shop charges VAT). Amounts come from the repair jobs; the person
 * picks the jobs, the name the shop signs with, the agency's details, the wording and the date.
 */

type DocType = FormalContent['type']
const TYPES: { value: DocType; label: string }[] = [
  { value: 'QUOTATION', label: 'ใบเสนอราคา' },
  { value: 'INVOICE',   label: 'ใบส่งของ / ใบแจ้งหนี้' },
  { value: 'RECEIPT',   label: 'ใบเสร็จรับเงิน' },
]
const TYPE_LABEL: Record<string, string> = { QUOTATION: 'ใบเสนอราคา', INVOICE: 'ใบส่งของ/ใบแจ้งหนี้', RECEIPT: 'ใบเสร็จรับเงิน' }

interface Buyer { name: string; address: string; taxId: string; taxBranch: string; phone: string }
interface Draft { content: FormalContent; docDate: string }
interface DocRow { id: string; type: string; number: string; docDate: string; hideDate: boolean; total: string | number; createdBy?: string | null; createdAt: string }

const INPUT = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const LABEL = 'mb-1 block text-xs font-semibold text-slate-500'
const money = (n: number) => `฿${Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`

export function openFormalDocument(id: string, push: (url: string) => void) {
  if (Platform.isNative()) push(`/print/formal/${id}`)
  else window.open(`/print/formal/${id}`, '_blank')
}

export function FormalDocSheet({ repairId, customerId, onClose }: { repairId?: string | null; customerId?: string | null; onClose: () => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [type, setType]         = useState<DocType>('RECEIPT')
  const [selected, setSelected] = useState<string[]>(repairId ? [repairId] : [])
  const [nameMode, setNameMode] = useState<'SHOP' | 'LEGAL'>('SHOP')
  const [buyer, setBuyer]       = useState<Buyer | null>(null)
  const [saveBuyer, setSaveBuyer] = useState(true)
  const [assetTags, setAssetTags] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Record<string, { description?: string; unit?: string; detail?: string }>>({})
  const [docDate, setDocDate]   = useState<string>('')
  const [hideDate, setHideDate] = useState(false)
  const [note, setNote]         = useState('')

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })
  const { data: customer } = useQuery<any>({
    queryKey: ['customers', customerId],
    queryFn:  async () => (await api.get(`/customers/${customerId}`)).data,
    enabled:  !!customerId,
    staleTime: 30_000,
  })
  const { data: jobs = [] } = useCustomerRepairs(customerId)
  const { data: single } = useQuery<any>({
    queryKey: ['repair-for-formal', repairId],
    queryFn:  async () => (await api.get(`/repairs/${repairId}`)).data,
    enabled:  !customerId && !!repairId,
  })
  const choices = useMemo(
    () => (customerId ? jobs : single ? [single] : []).filter((r: any) => r.status !== 'CANCELLED'),
    [customerId, jobs, single],
  )
  const { data: issued = [] } = useQuery<DocRow[]>({
    queryKey: ['formal-documents', repairId ?? customerId],
    queryFn:  async () => (await api.get('/formal-documents', { params: repairId ? { repairId } : { customerId } })).data,
    enabled:  !!(repairId || customerId),
  })

  // Agency details start from the customer record
  useEffect(() => {
    if (buyer) return
    const c = customer ?? single?.customer
    if (!c && customerId) return
    setBuyer({ name: c?.name ?? '', address: c?.address ?? '', taxId: c?.taxId ?? '', taxBranch: c?.taxBranch ?? '', phone: c?.phone ?? '' })
  }, [customer, single, customerId, buyer])

  // The lines and amounts the server will print, for the jobs and type picked
  const { data: draft, isFetching: drafting } = useQuery<Draft>({
    queryKey: ['formal-draft', type, [...selected].sort().join(',')],
    queryFn:  async () => (await api.post('/formal-documents/draft', { type, repairIds: selected })).data,
    enabled:  selected.length > 0,
  })
  useEffect(() => { if (draft && !docDate) setDocDate(localDay(draft.docDate)) }, [draft, docDate])
  useEffect(() => { setDocDate('') }, [type])

  const isTaxInvoice = type === 'RECEIPT' && Number(settings?.vatPercent ?? 0) > 0
  useEffect(() => { if (isTaxInvoice) setHideDate(false) }, [isTaxInvoice])

  const issue = useMutation({
    mutationFn: async () => {
      // Asset numbers live on the jobs; agency details on the customer — save what changed first
      for (const id of selected) {
        const job: any = choices.find((r: any) => r.id === id)
        const tag = assetTags[id]
        if (job && tag !== undefined && tag.trim() !== (job.assetTag ?? '')) {
          await api.patch(`/repairs/${id}`, { assetTag: tag.trim() })
        }
      }
      const c = customer ?? single?.customer
      if (saveBuyer && c?.id && buyer && (
        (buyer.address || '') !== (c.address ?? '') || (buyer.taxId || '') !== (c.taxId ?? '') || (buyer.taxBranch || '') !== (c.taxBranch ?? '')
      )) {
        await api.put(`/customers/${c.id}`, { address: buyer.address.trim(), taxId: buyer.taxId.trim(), taxBranch: buyer.taxBranch.trim() })
          .catch(() => toast.warning('บันทึกข้อมูลหน่วยงานลงลูกค้าไม่ได้ — เอกสารยังออกได้ตามปกติ'))
      }
      const lines = Object.entries(overrides).map(([key, o]) => ({ key, ...o }))
      return (await api.post('/formal-documents', {
        type, repairIds: selected, nameMode, note: note.trim() || undefined,
        buyer: buyer ?? undefined, lines, docDate: docDate || undefined, hideDate,
      })).data as { id: string; number: string }
    },
    onSuccess: (doc) => {
      toast.success(`ออก${TYPE_LABEL[type]} ${doc.number} แล้ว`)
      qc.invalidateQueries({ queryKey: ['formal-documents'] })
      qc.invalidateQueries({ queryKey: ['repairs'] })
      openFormalDocument(doc.id, router.push)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const setLine = (key: string, patch: { description?: string; unit?: string; detail?: string }) =>
    setOverrides((o) => ({ ...o, [key]: { ...o[key], ...patch } }))
  const sellerGaps = [!settings?.shopAddress && 'ที่อยู่ร้าน', !settings?.taxId && 'เลขผู้เสียภาษีของร้าน'].filter(Boolean)

  const sheet = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50">
      <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">เอกสารราชการ / บริษัท (A4)</p>
          <p className="truncate text-xs text-slate-300">ใบเสนอราคา · ใบส่งของ/ใบแจ้งหนี้ · ใบเสร็จรับเงิน — พิมพ์หรือบันทึกเป็น PDF</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28">
          {/* Type */}
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button key={t.value} onClick={() => setType(t.value)}
                className={`min-h-12 rounded-xl px-2 text-sm font-bold ${type === t.value ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                {t.value === 'RECEIPT' && isTaxInvoice ? 'ใบเสร็จ/ใบกำกับภาษี' : t.label}
              </button>
            ))}
          </div>

          {sellerGaps.length > 0 && (
            <Warn>ยังไม่ได้ตั้ง{sellerGaps.join(' และ ')} — ไปที่ ตั้งค่า › ข้อมูลร้าน เพื่อให้เอกสารครบ</Warn>
          )}
          {type === 'RECEIPT' && draft && !draft.content.allPaid && (
            <Warn>งานที่เลือกยังไม่ได้บันทึกรับเงินครบในระบบ — ใบเสร็จจะไม่ติ๊กวิธีชำระ (เขียนด้วยมือได้)</Warn>
          )}

          {/* Jobs */}
          <Section title={`งานซ่อมในเอกสารนี้ (${selected.length})`}>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {choices.map((r: any) => {
                const on = selected.includes(r.id)
                return (
                  <div key={r.id} className="p-3">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="mt-1 h-5 w-5" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold text-slate-900">{r.ticketNumber} · {r.deviceBrand} {r.deviceModel}</p>
                        <p className="text-xs text-slate-500">{REPAIR_LABEL[r.status] ?? r.status} · รับเมื่อ {thaiLongDate(r.receivedAt)}</p>
                      </div>
                    </label>
                    {on && (
                      <input value={assetTags[r.id] ?? r.assetTag ?? ''} onChange={(e) => setAssetTags((a) => ({ ...a, [r.id]: e.target.value }))}
                        placeholder="เลขครุภัณฑ์ (ถ้ามี)" maxLength={100} className={`${INPUT} mt-2 h-10`} />
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Seller name */}
          <Section title="ชื่อผู้ออกเอกสาร">
            <div className="grid grid-cols-2 gap-2">
              <Choice on={nameMode === 'SHOP'} onClick={() => setNameMode('SHOP')} title="ชื่อร้าน" sub={settings?.shopName ?? ''} />
              <Choice on={nameMode === 'LEGAL'} onClick={() => settings?.legalName ? setNameMode('LEGAL') : toast.info('ตั้งชื่อผู้ประกอบการได้ที่ ตั้งค่า › ข้อมูลร้าน')}
                title="ชื่อผู้ประกอบการ" sub={settings?.legalName || 'ยังไม่ได้ตั้ง'} />
            </div>
          </Section>

          {/* Buyer */}
          {buyer && (
            <Section title="ข้อมูลหน่วยงาน / ผู้ซื้อ">
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <div><label className={LABEL}>ชื่อหน่วยงาน / ลูกค้า</label>
                  <input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} className={INPUT} /></div>
                <div><label className={LABEL}>ที่อยู่</label>
                  <textarea value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} rows={2}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LABEL}>เลขผู้เสียภาษี (13 หลัก)</label>
                    <input value={buyer.taxId} onChange={(e) => setBuyer({ ...buyer, taxId: e.target.value })} inputMode="numeric" maxLength={20} className={INPUT} /></div>
                  <div><label className={LABEL}>สำนักงานใหญ่ / สาขา</label>
                    <input value={buyer.taxBranch} onChange={(e) => setBuyer({ ...buyer, taxBranch: e.target.value })} placeholder="สำนักงานใหญ่" maxLength={100} className={INPUT} /></div>
                </div>
                {(customer ?? single?.customer)?.id && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={saveBuyer} onChange={(e) => setSaveBuyer(e.target.checked)} className="h-4 w-4" />
                    บันทึกที่อยู่และเลขผู้เสียภาษีไว้กับลูกค้านี้ (ครั้งหน้าไม่ต้องพิมพ์ใหม่)
                  </label>
                )}
              </div>
            </Section>
          )}

          {/* Lines */}
          <Section title="รายการในเอกสาร (แก้ถ้อยคำได้ จำนวนเงินมาจากงานซ่อม)">
            {selected.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">เลือกงานซ่อมด้านบนอย่างน้อย 1 งาน</p>
            ) : drafting && !draft ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : draft && (
              <div className="space-y-2">
                {draft.content.lines.map((l) => (
                  <div key={l.key} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex gap-2">
                      <input value={overrides[l.key]?.description ?? l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} maxLength={300} className={INPUT} />
                      <input value={overrides[l.key]?.unit ?? l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} maxLength={30} className={`${INPUT} w-20 text-center`} />
                    </div>
                    <input value={overrides[l.key]?.detail ?? l.detail ?? ''} onChange={(e) => setLine(l.key, { detail: e.target.value })}
                      placeholder="รายละเอียด (S/N, เลขครุภัณฑ์, อาการ)" maxLength={500} className={`${INPUT} h-9 text-xs text-slate-600`} />
                    <p className="text-right text-xs text-slate-500">{l.quantity} × {money(l.unitPrice)} = <b className="text-slate-900">{money(l.amount)}</b></p>
                  </div>
                ))}
                <div className="flex justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                  <span className="font-semibold">รวมทั้งสิ้น{draft.content.vatPercent > 0 ? ` (รวม VAT ${draft.content.vatPercent}%)` : ''}</span>
                  <span className="text-lg font-bold">{money(draft.content.total)}</span>
                </div>
              </div>
            )}
          </Section>

          {/* Date + note */}
          <Section title="วันที่ในเอกสาร">
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <input type="date" value={docDate} disabled={hideDate} onChange={(e) => setDocDate(e.target.value)} className={`${INPUT} disabled:opacity-40`} />
              <label className={`flex items-center gap-2 text-sm ${isTaxInvoice ? 'text-slate-400' : 'text-slate-700'}`}>
                <input type="checkbox" checked={hideDate} disabled={isTaxInvoice} onChange={(e) => setHideDate(e.target.checked)} className="h-4 w-4" />
                ไม่พิมพ์วันที่ (เว้นช่องไว้เขียนด้วยมือ)
              </label>
              {isTaxInvoice && <p className="text-xs text-slate-500">ใบกำกับภาษีต้องลงวันที่ตามกฎหมาย จึงเว้นวันที่ไม่ได้</p>}
              {hideDate && <p className="text-xs text-slate-500">ระบบยังเก็บวันที่ออกเอกสารจริงไว้เป็นหลักฐาน</p>}
            </div>
          </Section>
          <Section title="หมายเหตุ (ถ้ามี)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
              placeholder="เช่น เลขที่ใบสั่งจ้าง / โครงการ" className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Section>

          {/* Already issued */}
          {issued.length > 0 && (
            <Section title={repairId ? 'เอกสารที่เคยออกให้งานนี้' : 'เอกสารที่เคยออกให้ลูกค้านี้'}>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {issued.map((d) => (
                  <button key={d.id} onClick={() => openFormalDocument(d.id, router.push)} className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-50">
                    <FileText className="h-5 w-5 shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-slate-900">{TYPE_LABEL[d.type] ?? d.type} {d.number}</p>
                      <p className="text-xs text-slate-500">{d.hideDate ? 'ไม่ลงวันที่' : thaiLongDate(d.docDate)} · {money(Number(d.total))}{d.createdBy ? ` · ${d.createdBy}` : ''}</p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600">เปิด</span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <button onClick={() => issue.mutate()} disabled={issue.isPending || !draft || selected.length === 0 || !buyer?.name.trim()}
          className="mx-auto flex h-14 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-bold text-white disabled:opacity-50">
          {issue.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
          ออก{type === 'RECEIPT' && isTaxInvoice ? 'ใบเสร็จ/ใบกำกับภาษี' : TYPE_LABEL[type]} แล้วเปิดพิมพ์ / PDF
        </button>
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>{children}</div>
}
function Warn({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{children}</div>
}
function Choice({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} className={`rounded-xl p-3 text-left ${on ? 'border-2 border-blue-600 bg-blue-50' : 'border border-slate-200 bg-white'}`}>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="truncate text-xs text-slate-500">{sub}</p>
    </button>
  )
}

/** "เอกสารราชการ (A4)" — opens the sheet above. */
export function FormalDocButton({ repair, customerId, className, label, newTab }: {
  repair?: { id: string; customerId?: string | null; customer?: { id: string } | null } | null
  /** from a customer page: pick the jobs in the sheet */
  customerId?: string | null
  className?: string
  label?: string
  /**
   * Open the sheet on its own page in a new tab (web only). Needed inside a dialog: a modal
   * dialog keeps focus and clicks to itself, so a sheet laid over it cannot be typed into.
   */
  newTab?: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!repair?.id && !customerId) return null
  const cust = repair ? (repair.customerId ?? repair.customer?.id ?? null) : customerId
  function handleOpen() {
    if (newTab && !Platform.isNative()) {
      const q = new URLSearchParams()
      if (repair?.id) q.set('repairId', repair.id)
      if (cust) q.set('customerId', cust)
      window.open(`/print/formal-issue?${q.toString()}`, '_blank')
      return
    }
    setOpen(true)
  }
  return (
    <>
      <button type="button" onClick={handleOpen}
        className={className ?? 'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50'}>
        <FileText className="h-4 w-4" /> {label ?? 'เอกสารราชการ / บริษัท (A4, PDF)'}
      </button>
      {open && (
        <FormalDocSheet
          repairId={repair?.id ?? null}
          customerId={repair ? (repair.customerId ?? repair.customer?.id ?? null) : customerId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
