'use client'

import { Fragment, useEffect, useState } from 'react'
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

type RateMethod = 'FIXED' | 'PERCENT_LABOR' | 'PERCENT_TOTAL'
interface RateRow { method: RateMethod; value: number }
interface StaffRate {
  userId: string; name: string; role: string
  repairType: RepairType | null; repairValue: number | null
  repairRates: Record<string, RateRow> | null
  saleType: SaleType | null; saleValue: number | null
}
interface CommissionConfig {
  repair: { type: RepairType; value: number; typeRates: Record<string, RateRow> }
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

/** One table of repair rates: a row per job type, each in baht or percent, plus "every other job". */
interface CardForm {
  rows: { tag: string; method: RateMethod; value: number }[]
  other: { method: RateMethod | 'NONE'; value: number }
}
interface PersonForm extends StaffRate { own: boolean; card: CardForm }
interface SettingsForm { shop: CardForm; sale: CommissionConfig['sale']; staff: PersonForm[] }

const METHOD_OPTIONS: { value: RateMethod; label: string }[] = [
  { value: 'FIXED',         label: 'บาท / งาน' },
  { value: 'PERCENT_LABOR', label: '% ของกำไร' },
  { value: 'PERCENT_TOTAL', label: '% ของราคางาน' },
]
const RATE_METHODS = METHOD_OPTIONS.map((m) => m.value) as string[]

const toCard = (rates: Record<string, RateRow> | null | undefined, type: string | null, value: number | null): CardForm => ({
  rows: Object.entries(rates ?? {}).map(([tag, r]) => ({ tag, method: r.method, value: r.value })),
  other: RATE_METHODS.includes(type ?? '') ? { method: type as RateMethod, value: value ?? 0 } : { method: 'NONE', value: 0 },
})
const fromCard = (c: CardForm) => ({
  type: c.other.method,
  value: c.other.method === 'NONE' ? 0 : Number(c.other.value) || 0,
  rates: Object.fromEntries(c.rows.filter((r) => r.tag && Number(r.value) > 0).map((r) => [r.tag, { method: r.method, value: Number(r.value) }])),
})
const rateText = (method: RateMethod | 'NONE', value: number) =>
  method === 'NONE' ? 'ไม่ได้ค่าคอม' : method === 'FIXED' ? `${formatThaiMoney(value)}` : `${value}% ${method === 'PERCENT_LABOR' ? 'ของกำไร' : 'ของราคางาน'}`

function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<CommissionConfig>({
    queryKey: ['commission-config'],
    queryFn: async () => (await api.get('/commission/config')).data,
  })
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [who, setWho] = useState<string>('shop')

  useEffect(() => {
    if (!data) return
    const shop = toCard(data.repair.typeRates, data.repair.type, data.repair.value)
    setForm({
      shop,
      sale: { ...data.sale },
      staff: data.staff.map((s) => {
        const own = s.repairType != null || s.repairRates != null
        // Saved before per-person tables: "by type" meant the shop's rows
        const rates = s.repairRates ?? (s.repairType === 'BY_TYPE' ? data.repair.typeRates : {})
        return { ...s, own, card: own ? toCard(rates, s.repairType, s.repairValue) : structuredClone(shop) }
      }),
    })
  }, [data])

  const save = useMutation({
    mutationFn: async (f: SettingsForm) => {
      const shop = fromCard(f.shop)
      return (await api.put('/commission/config', {
        repair: { type: shop.type, value: shop.value, typeRates: shop.rates },
        sale: f.sale,
        staff: f.staff.map((s) => {
          const c = fromCard(s.card)
          return {
            userId: s.userId,
            repairType: s.own ? c.type : null,
            repairValue: s.own ? c.value : null,
            repairRates: s.own ? c.rates : null,
            saleType: s.saleType, saleValue: s.saleType ? Number(s.saleValue ?? 0) : null,
          }
        }),
      })).data
    },
    onSuccess: (fresh: CommissionConfig) => {
      toast.success('บันทึกวิธีคิดค่าคอมแล้ว')
      qc.setQueryData(['commission-config'], fresh)
      qc.invalidateQueries({ queryKey: ['commission-report'] })
      qc.invalidateQueries({ queryKey: ['commission-sellers'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'บันทึกไม่สำเร็จ'),
  })

  if (isLoading || !form) return <div className="py-10 text-center text-slate-400"><Loader2 className="inline h-5 w-5 animate-spin" /></div>

  const set = (fn: (f: SettingsForm) => void) => setForm((prev) => {
    if (!prev) return prev
    const next = structuredClone(prev)
    fn(next)
    return next
  })
  const person = form.staff.find((s) => s.userId === who)

  return (
    <div className="space-y-4">
      {/* Repairs */}
      <section className={cn(card, 'p-4 space-y-4')}>
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">ค่าคอมงานซ่อม</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            แต่ละประเภทงานเลือกได้ว่าให้เป็น <b>บาท</b> หรือ <b>%</b> · ช่างที่ได้ไม่เหมือนคนอื่น กดชื่อแล้วตั้งตารางของคนนั้นได้
          </p>
        </div>

        {/* Whose table */}
        <div className="flex flex-wrap gap-1.5">
          <WhoChip active={who === 'shop'} onClick={() => setWho('shop')} label="ตารางของร้าน" sub="ค่าเริ่มต้น" />
          {form.staff.map((s) => (
            <WhoChip key={s.userId} active={who === s.userId} onClick={() => setWho(s.userId)}
              label={s.name} sub={s.own ? 'ตั้งเอง' : 'ใช้ของร้าน'} highlight={s.own} />
          ))}
        </div>

        {who === 'shop' ? (
          <>
            <p className="text-xs text-slate-500">ใช้กับทุกคนที่ไม่ได้ตั้งตารางของตัวเอง</p>
            <RateTable card={form.shop} disabled={!canEdit} onChange={(c) => set((f) => { f.shop = c })} />
          </>
        ) : person && (
          <>
            <div className="flex flex-wrap gap-2">
              {[[false, 'ใช้ตารางของร้าน'], [true, `ตั้งตารางเฉพาะ ${person.name}`]].map(([own, label]) => (
                <label key={String(own)} className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  person.own === own ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700/60',
                )}>
                  <input type="radio" disabled={!canEdit} checked={person.own === own}
                    onChange={() => set((f) => {
                      const p = f.staff.find((x) => x.userId === who)!
                      p.own = own as boolean
                      // Start their own table from the shop's, then they change what differs
                      if (own) p.card = structuredClone(f.shop)
                    })} />
                  {label as string}
                </label>
              ))}
            </div>
            {person.own ? (
              <RateTable card={person.card} disabled={!canEdit}
                onChange={(c) => set((f) => { f.staff.find((x) => x.userId === who)!.card = c })} />
            ) : (
              <RateSummary card={form.shop} />
            )}
          </>
        )}
        <p className="text-xs text-slate-500">
          ประเภทงานมาจากที่ติ๊กไว้ในใบรับซ่อม · ถ้างานมีหลายประเภท จะได้ตามแถวที่ได้มากที่สุด (ไม่บวกกัน)
        </p>
      </section>

      {/* Sales */}
      <section className={cn(card, 'p-4 space-y-3')}>
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">ค่าคอมการขาย</p>
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
        <details className="rounded-lg border border-slate-100 dark:border-slate-700/60 px-3 py-2">
          <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-200">เรตการขายรายคน (ถ้าแต่ละคนได้ไม่เท่ากัน)</summary>
          <div className="mt-2 space-y-2">
            {form.staff.map((s, i) => (
              <div key={s.userId} className="flex flex-wrap items-center gap-2">
                <span className="w-32 truncate text-sm text-slate-700 dark:text-slate-200">{s.name}</span>
                <StaffRateInput
                  label="" options={SALE_OPTIONS} disabled={!canEdit}
                  type={s.saleType} value={s.saleValue} shopText={describe(form.sale.type, form.sale.value, SALE_OPTIONS)}
                  onChange={(t, v) => set((f) => { f.staff[i].saleType = t as SaleType | null; f.staff[i].saleValue = v })}
                />
              </div>
            ))}
          </div>
        </details>
        <p className="text-xs text-slate-500">
          ค่าคอมการขายเป็นของ &quot;พนักงานขาย&quot; ที่เลือกตอนชำระเงินในหน้า POS (ถ้าไม่เลือก จะเป็นของคนที่กดขาย)
        </p>
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

function WhoChip({ active, onClick, label, sub, highlight }: {
  active: boolean; onClick: () => void; label: string; sub: string; highlight?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className={cn(
      'rounded-xl border px-3 py-1.5 text-left transition-colors',
      active ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700/60 hover:border-blue-300',
    )}>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
      <p className={cn('text-[11px]', highlight ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')}>{sub}</p>
    </button>
  )
}

function RateSummary({ card: c }: { card: CardForm }) {
  return (
    <ul className="space-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3 text-sm">
      {c.rows.map((r) => (
        <li key={r.tag} className="flex justify-between gap-2"><span>{r.tag}</span><span className="tabular-nums">{rateText(r.method, r.value)}</span></li>
      ))}
      <li className="flex justify-between gap-2 text-slate-500"><span>งานอื่นๆ ทั้งหมด</span><span>{rateText(c.other.method, c.other.value)}</span></li>
    </ul>
  )
}

function RateTable({ card: c, disabled, onChange }: { card: CardForm; disabled: boolean; onChange: (c: CardForm) => void }) {
  const used = new Set(c.rows.map((r) => r.tag))
  const free = ISSUE_TAG_OPTIONS.filter((t) => !used.has(t))
  const edit = (fn: (x: CardForm) => void) => { const x = structuredClone(c); fn(x); onChange(x) }
  const unit = (m: RateMethod | 'NONE') => (m === 'FIXED' ? 'บาท' : m === 'NONE' ? '' : '%')

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_150px_120px_32px] gap-2 px-2 text-xs text-slate-500 sm:grid">
        <span>ประเภทงาน</span><span>คิดแบบ</span><span>ค่า</span><span />
      </div>
      {c.rows.map((r, i) => (
        <div key={r.tag} className="grid grid-cols-[1fr_32px] gap-2 rounded-lg border border-slate-100 dark:border-slate-700/60 p-2 sm:grid-cols-[1fr_150px_120px_32px] sm:items-center sm:border-0 sm:px-2 sm:py-0">
          <span className="self-center text-sm font-medium text-slate-800 dark:text-slate-100">{r.tag}</span>
          <button type="button" disabled={disabled} aria-label={`ลบ ${r.tag}`}
            onClick={() => edit((x) => { x.rows.splice(i, 1) })}
            className="row-span-1 h-8 w-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 sm:order-last">✕</button>
          <select className={cn(selectCls, 'col-span-2 sm:col-span-1')} disabled={disabled} value={r.method}
            onChange={(e) => edit((x) => { x.rows[i].method = e.target.value as RateMethod })}>
            {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
            <Input type="number" min={0} max={r.method === 'FIXED' ? undefined : 100} step="0.5" inputMode="decimal"
              disabled={disabled} value={r.value || ''} placeholder="0"
              onChange={(e) => edit((x) => { x.rows[i].value = Number(e.target.value) || 0 })}
              className="h-9 w-24 text-right" />
            <span className="text-xs text-slate-500">{unit(r.method)}</span>
          </div>
        </div>
      ))}

      {!disabled && free.length > 0 && (
        <select className={cn(selectCls, 'text-blue-600')} value=""
          onChange={(e) => e.target.value && edit((x) => { x.rows.push({ tag: e.target.value, method: 'FIXED', value: 0 }) })}>
          <option value="">+ เพิ่มประเภทงาน…</option>
          {free.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 p-2 sm:grid-cols-[1fr_150px_120px_32px] sm:items-center">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">งานอื่นๆ ทั้งหมด</span>
        <select className={selectCls} disabled={disabled} value={c.other.method}
          onChange={(e) => edit((x) => { x.other.method = e.target.value as RateMethod | 'NONE' })}>
          <option value="NONE">ไม่ได้ค่าคอม</option>
          {METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {c.other.method !== 'NONE' ? (
          <div className="flex items-center gap-1">
            <Input type="number" min={0} max={c.other.method === 'FIXED' ? undefined : 100} step="0.5" inputMode="decimal"
              disabled={disabled} value={c.other.value || ''} placeholder="0"
              onChange={(e) => edit((x) => { x.other.value = Number(e.target.value) || 0 })}
              className="h-9 w-24 text-right" />
            <span className="text-xs text-slate-500">{unit(c.other.method)}</span>
          </div>
        ) : <span />}
      </div>
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
      {label && <span className="w-14 text-xs text-slate-500">{label}</span>}
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
