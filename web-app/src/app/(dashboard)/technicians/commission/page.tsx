'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronRight, Coins, Loader2, Save, Settings2, Wrench, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { cn, formatThaiMoney } from '@/lib/utils'
import { ISSUE_TAG_OPTIONS } from '@/lib/repair-tags'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

type RepairType = 'NONE' | 'PERCENT_LABOR' | 'PERCENT_TOTAL' | 'FIXED' | 'BY_TYPE'
type SaleType = 'NONE' | 'PERCENT_PROFIT' | 'PERCENT_TOTAL' | 'FIXED_PER_UNIT'

interface StaffRate {
  userId: string; name: string; role: string
  repairType: RepairType | null; repairValue: number | null
  saleType: SaleType | null; saleValue: number | null
}
interface CommissionConfig {
  repair: { type: RepairType; value: number; typeRates: Record<string, number> }
  sale: { type: SaleType; value: number; scope: 'PHONE' | 'ALL' }
  staff: StaffRate[]
}
interface ReportItem { kind: 'REPAIR' | 'SALE'; ref: string; date: string; label: string; base: number; commission: number; note: string }
interface ReportRow {
  userId: string; name: string; role: string
  repair: { jobs: number; revenue: number; cost: number; commission: number }
  sale: { units: number; revenue: number; profit: number; commission: number }
  total: number
  items: ReportItem[]
}
interface CommissionReport {
  startDate: string; endDate: string
  rows: ReportRow[]
  totals: { repair: number; sale: number; total: number }
}

const REPAIR_OPTIONS: { value: RepairType; label: string; hint: string }[] = [
  { value: 'NONE',          label: 'ไม่ใช้ค่าคอม',          hint: 'ไม่คำนวณค่าคอมงานซ่อม' },
  { value: 'PERCENT_LABOR', label: '% ของกำไร',             hint: 'ราคางาน − อะไหล่ − ค่าร้านพาร์ทเนอร์' },
  { value: 'PERCENT_TOTAL', label: '% ของราคางาน',          hint: 'คิดจากยอดเงินที่ร้านได้รับจริง' },
  { value: 'FIXED',         label: 'เหมาต่องาน',            hint: 'ทุกงานได้เท่ากัน' },
  { value: 'BY_TYPE',       label: 'ตามประเภทงาน',          hint: 'เช่น เปลี่ยนจอ 150 / แบต 80' },
]
const SALE_OPTIONS: { value: SaleType; label: string; hint: string }[] = [
  { value: 'NONE',           label: 'ไม่ใช้ค่าคอม',     hint: 'ไม่คำนวณค่าคอมการขาย' },
  { value: 'PERCENT_PROFIT', label: '% ของกำไร',        hint: 'ราคาขาย − ต้นทุน' },
  { value: 'PERCENT_TOTAL',  label: '% ของยอดขาย',      hint: 'คิดจากราคาขายหลังส่วนลด' },
  { value: 'FIXED_PER_UNIT', label: 'เหมาต่อชิ้น',      hint: 'เช่น ขายได้ 1 เครื่อง ได้ 300' },
]
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'เจ้าของ', MANAGER: 'ผู้จัดการ', CASHIER: 'แคชเชียร์', TECHNICIAN: 'ช่าง', STOCK_STAFF: 'สต็อก',
}

const isPercent = (t: string | null | undefined) => !!t && t.startsWith('PERCENT')
const needsValue = (t: string | null | undefined) => !!t && t !== 'NONE' && t !== 'BY_TYPE'

function describe(type: string | null, value: number | null, options: { value: string; label: string }[]) {
  if (!type) return null
  const label = options.find((o) => o.value === type)?.label ?? type
  if (!needsValue(type)) return label
  return isPercent(type) ? `${label} ${value ?? 0}%` : `${label} ${formatThaiMoney(value ?? 0)}`
}

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B]'
const selectCls = 'h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm text-slate-800 dark:text-slate-100'

export default function CommissionPage() {
  const canEdit = useAuthStore((s) => s.hasPermission('settings.manage'))
  const [tab, setTab] = useState<'report' | 'settings'>('report')

  return (
    <div className="space-y-5">
      <PageHeader
        title="ค่าคอมมิชชั่น"
        icon={Coins}
        subtitle="ค่าคอมงานซ่อมและการขาย แยกรายคน — เป็นรายงานอย่างเดียว ไม่เปลี่ยนตัวเลขยอดขายหรือกำไร"
      />
      <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 w-fit">
        {([['report', 'สรุปค่าคอม', Coins], ['settings', 'ตั้งค่าวิธีคิด', Settings2]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'report' ? <ReportTab onSetup={() => setTab('settings')} /> : <SettingsTab canEdit={canEdit} />}
    </div>
  )
}

// ── Report ───────────────────────────────────────────────────────────────────

function ReportTab({ onSetup }: { onSetup: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(today)
  const [open, setOpen] = useState<string | null>(null)

  const { data, isLoading } = useQuery<CommissionReport>({
    queryKey: ['commission-report', startDate, endDate],
    queryFn: async () => (await api.get('/commission/report', { params: { startDate, endDate } })).data,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-slate-500">ตั้งแต่</label>
          <Input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-slate-500">ถึง</label>
          <Input type="date" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2">
          {[
            ['ค่าคอมงานซ่อม', data.totals.repair],
            ['ค่าคอมการขาย', data.totals.sale],
            ['รวมที่ต้องจ่าย', data.totals.total],
          ].map(([label, v]) => (
            <div key={label as string} className={cn(card, 'p-3')}>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{formatThaiMoney(v as number)}</p>
            </div>
          ))}
        </div>
      )}

      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">พนักงาน</th>
              <th className="px-4 py-2.5 text-right font-semibold">งานซ่อม</th>
              <th className="px-4 py-2.5 text-right font-semibold">ค่าคอมซ่อม</th>
              <th className="px-4 py-2.5 text-right font-semibold">ขาย (ชิ้น)</th>
              <th className="px-4 py-2.5 text-right font-semibold">ค่าคอมขาย</th>
              <th className="px-4 py-2.5 text-right font-semibold">รวม</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
            ) : !data || data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  ยังไม่มีค่าคอมในช่วงนี้ —{' '}
                  <button type="button" onClick={onSetup} className="text-blue-600 hover:underline">ตั้งค่าวิธีคิด</button>
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <Fragment key={r.userId}>
                  <tr
                    onClick={() => setOpen(open === r.userId ? null : r.userId)}
                    className="border-t border-slate-100 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                      <span className="inline-flex items-center gap-1">
                        {open === r.userId ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        {r.name}
                        <span className="text-xs font-normal text-slate-400">{ROLE_LABEL[r.role] ?? r.role}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.repair.jobs || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.repair.commission ? formatThaiMoney(r.repair.commission) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sale.units || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sale.commission ? formatThaiMoney(r.sale.commission) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{formatThaiMoney(r.total)}</td>
                  </tr>
                  {open === r.userId && (
                    <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                      <td colSpan={6} className="px-4 py-2">
                        <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
                          {r.items.map((it, i) => (
                            <li key={`${it.ref}-${i}`} className="flex items-start gap-2 py-1.5 text-xs">
                              {it.kind === 'REPAIR'
                                ? <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                                : <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-slate-700 dark:text-slate-200">
                                  <span className="font-mono text-slate-400">{it.ref}</span> · {it.label}
                                </p>
                                <p className="text-slate-400">
                                  {format(new Date(it.date), 'dd/MM/yy')} · ยอด {formatThaiMoney(it.base)}{it.note ? ` · ${it.note}` : ''}
                                </p>
                              </div>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatThaiMoney(it.commission)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        งานซ่อมนับเมื่อส่งมอบและรับเงินแล้ว (หักยอดที่คืนเงินลูกค้า) · การขายนับจากบิลที่ไม่ถูกยกเลิก (หักชิ้นที่คืนสินค้า) · กดที่ชื่อเพื่อดูรายการ
      </p>
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<CommissionConfig>({
    queryKey: ['commission-config'],
    queryFn: async () => (await api.get('/commission/config')).data,
  })
  const [form, setForm] = useState<CommissionConfig | null>(null)
  useEffect(() => { if (data) setForm(structuredClone(data)) }, [data])

  const save = useMutation({
    mutationFn: async (f: CommissionConfig) => (await api.put('/commission/config', {
      repair: f.repair,
      sale: f.sale,
      staff: f.staff.map((s) => ({
        userId: s.userId,
        repairType: s.repairType, repairValue: s.repairType ? Number(s.repairValue ?? 0) : null,
        saleType: s.saleType, saleValue: s.saleType ? Number(s.saleValue ?? 0) : null,
      })),
    })).data,
    onSuccess: (fresh: CommissionConfig) => {
      toast.success('บันทึกวิธีคิดค่าคอมแล้ว')
      qc.setQueryData(['commission-config'], fresh)
      qc.invalidateQueries({ queryKey: ['commission-report'] })
      qc.invalidateQueries({ queryKey: ['commission-sellers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'บันทึกไม่สำเร็จ'),
  })

  const tags = useMemo(() => {
    const extra = Object.keys(form?.repair.typeRates ?? {}).filter((t) => !ISSUE_TAG_OPTIONS.includes(t))
    return [...ISSUE_TAG_OPTIONS, ...extra]
  }, [form?.repair.typeRates])

  if (isLoading || !form) return <div className="py-10 text-center text-slate-400"><Loader2 className="inline h-5 w-5 animate-spin" /></div>

  const set = (fn: (f: CommissionConfig) => void) => setForm((prev) => {
    if (!prev) return prev
    const next = structuredClone(prev)
    fn(next)
    return next
  })

  return (
    <div className="space-y-4">
      {/* Repairs */}
      <section className={cn(card, 'p-4 space-y-3')}>
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">ค่าคอมงานซ่อม (ค่าเริ่มต้นของร้าน)</p>
        </div>
        <OptionGrid options={REPAIR_OPTIONS} value={form.repair.type} disabled={!canEdit} onChange={(v) => set((f) => { f.repair.type = v })} />
        {needsValue(form.repair.type) && (
          <ValueInput type={form.repair.type} value={form.repair.value} disabled={!canEdit}
            onChange={(v) => set((f) => { f.repair.value = v })} unitLabel="บาทต่องาน" />
        )}
        {(form.repair.type === 'BY_TYPE' || form.staff.some((s) => s.repairType === 'BY_TYPE')) && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              ค่าคอมต่อประเภทงาน (บาท) — ใช้ประเภทที่ติ๊กไว้ในใบรับซ่อม ถ้างานมีหลายประเภทจะได้ตามประเภทที่สูงที่สุด
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tags.map((tag) => (
                <label key={tag} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700/60 px-3 py-1.5">
                  <span className="text-sm text-slate-700 dark:text-slate-200">{tag}</span>
                  <Input
                    type="number" min={0} step="10" inputMode="decimal" disabled={!canEdit}
                    value={form.repair.typeRates[tag] ?? ''}
                    placeholder="0"
                    onChange={(e) => set((f) => {
                      const n = Number(e.target.value)
                      if (e.target.value === '' || !n) delete f.repair.typeRates[tag]
                      else f.repair.typeRates[tag] = n
                    })}
                    className="h-8 w-24 text-right"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Sales */}
      <section className={cn(card, 'p-4 space-y-3')}>
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">ค่าคอมการขาย (ค่าเริ่มต้นของร้าน)</p>
        </div>
        <OptionGrid options={SALE_OPTIONS} value={form.sale.type} disabled={!canEdit} onChange={(v) => set((f) => { f.sale.type = v })} />
        {form.sale.type !== 'NONE' && (
          <div className="flex flex-wrap items-end gap-3">
            <ValueInput type={form.sale.type} value={form.sale.value} disabled={!canEdit}
              onChange={(v) => set((f) => { f.sale.value = v })} unitLabel="บาทต่อชิ้น" />
            <div>
              <label className="text-xs text-slate-500">สินค้าที่นับ</label>
              <select className={cn(selectCls, 'block')} disabled={!canEdit} value={form.sale.scope}
                onChange={(e) => set((f) => { f.sale.scope = e.target.value as 'PHONE' | 'ALL' })}>
                <option value="PHONE">เฉพาะโทรศัพท์</option>
                <option value="ALL">สินค้าทุกชนิด</option>
              </select>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">
          ค่าคอมการขายเป็นของ &quot;พนักงานขาย&quot; ที่เลือกตอนชำระเงินในหน้า POS (ถ้าไม่เลือก จะเป็นของคนที่กดขาย)
        </p>
      </section>

      {/* Per person */}
      <section className={cn(card, 'p-4 space-y-3')}>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">เรตรายคน</p>
        <p className="text-xs text-slate-500">ช่างหรือพนักงานแต่ละคนได้ไม่เท่ากัน ตั้งที่นี่ — ถ้าเลือก &quot;ใช้ค่าของร้าน&quot; จะใช้ค่าเริ่มต้นด้านบน</p>
        <div className="space-y-2">
          {form.staff.map((s, i) => (
            <div key={s.userId} className="grid gap-2 rounded-xl border border-slate-100 dark:border-slate-700/60 p-3 lg:grid-cols-[180px_1fr_1fr] lg:items-center">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                <p className="text-xs text-slate-400">{ROLE_LABEL[s.role] ?? s.role}</p>
              </div>
              <StaffRateInput
                label="งานซ่อม" options={REPAIR_OPTIONS} disabled={!canEdit}
                type={s.repairType} value={s.repairValue} shopText={describe(form.repair.type, form.repair.value, REPAIR_OPTIONS)}
                onChange={(t, v) => set((f) => { f.staff[i].repairType = t as RepairType | null; f.staff[i].repairValue = v })}
              />
              <StaffRateInput
                label="การขาย" options={SALE_OPTIONS} disabled={!canEdit}
                type={s.saleType} value={s.saleValue} shopText={describe(form.sale.type, form.sale.value, SALE_OPTIONS)}
                onChange={(t, v) => set((f) => { f.staff[i].saleType = t as SaleType | null; f.staff[i].saleValue = v })}
              />
            </div>
          ))}
        </div>
      </section>

      {canEdit ? (
        <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-1.5">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          บันทึกวิธีคิดค่าคอม
        </Button>
      ) : (
        <p className="text-xs text-slate-500">เจ้าของร้านเป็นผู้ตั้งวิธีคิดค่าคอม</p>
      )}
    </div>
  )
}

function OptionGrid<T extends string>({ options, value, disabled, onChange }: {
  options: { value: T; label: string; hint: string }[]; value: T; disabled: boolean; onChange: (v: T) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed',
            value === o.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700/60 hover:border-blue-300',
          )}
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{o.hint}</p>
        </button>
      ))}
    </div>
  )
}

function ValueInput({ type, value, disabled, onChange, unitLabel }: {
  type: string; value: number; disabled: boolean; onChange: (v: number) => void; unitLabel: string
}) {
  const pct = isPercent(type)
  return (
    <div>
      <label className="text-xs text-slate-500">{pct ? 'เปอร์เซ็นต์' : unitLabel}</label>
      <Input
        type="number" min={0} max={pct ? 100 : undefined} step="0.5" inputMode="decimal"
        value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-36"
      />
    </div>
  )
}

function StaffRateInput({ label, options, type, value, shopText, disabled, onChange }: {
  label: string
  options: { value: string; label: string }[]
  type: string | null
  value: number | null
  shopText: string | null
  disabled: boolean
  onChange: (type: string | null, value: number | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs text-slate-500">{label}</span>
      <select
        className={selectCls}
        disabled={disabled}
        value={type ?? ''}
        onChange={(e) => onChange(e.target.value || null, e.target.value ? (value ?? 0) : null)}
      >
        <option value="">ใช้ค่าของร้าน{shopText ? ` (${shopText})` : ''}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {needsValue(type) && (
        <div className="flex items-center gap-1">
          <Input
            type="number" min={0} max={isPercent(type) ? 100 : undefined} step="0.5" inputMode="decimal"
            value={value ?? 0} disabled={disabled}
            onChange={(e) => onChange(type, Number(e.target.value) || 0)}
            className="h-9 w-24 text-right"
          />
          <span className="text-xs text-slate-500">{isPercent(type) ? '%' : 'บาท'}</span>
        </div>
      )}
    </div>
  )
}
