'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Calculator, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { apiErrorMessage, cn, formatThaiMoney } from '@/lib/utils'
import { brandLabel, modelLabel, type PriceDevice, type RepairPrice } from '@/lib/repair-prices'
import api from '@/lib/api'

type Draft = { brand: string; model: string; service: string; price: string; warrantyDays: string; costPrice: string }
const emptyRow = (brand = '', model = ''): Draft => ({ brand, model, service: '', price: '', warrantyDays: '', costPrice: '' })

/**
 * The shop's repair price list. Top: look up a device and read its prices to the customer.
 * Below (owner): add prices many rows at a time, change or remove them.
 */
export default function RepairPricesPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const canManage = user?.role === 'OWNER' || hasPermission('settings.manage')
  const seesCost  = user?.role === 'OWNER' || hasPermission('products.view_cost')

  // ── Price check ──
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const { data: devices = [] } = useQuery<PriceDevice[]>({
    queryKey: ['repair-prices', 'devices'],
    queryFn: () => api.get('/repair-prices/devices').then((r) => r.data),
    staleTime: 60_000,
  })
  const models = devices.find((d) => d.brand.toLowerCase() === brand.trim().toLowerCase())?.models ?? []
  const { data: quote = [], isFetching: quoting } = useQuery<RepairPrice[]>({
    queryKey: ['repair-prices', 'lookup', brand.trim().toLowerCase(), model.trim().toLowerCase()],
    queryFn: () => api.get('/repair-prices/lookup', { params: { brand: brand.trim(), model: model.trim() } }).then((r) => r.data),
    enabled: brand.trim().length > 0,
    staleTime: 30_000,
  })

  // ── All prices ──
  const [search, setSearch] = useState('')
  const { data: all = [], isLoading } = useQuery<RepairPrice[]>({
    queryKey: ['repair-prices', 'list'],
    queryFn: () => api.get('/repair-prices').then((r) => r.data),
    staleTime: 30_000,
  })
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((r) => `${r.brand} ${r.model} ${r.service}`.toLowerCase().includes(q))
  }, [all, search])

  // ── Editor ──
  const [rows, setRows] = useState<Draft[]>([emptyRow()])
  const setRow = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const filled = rows.filter((r) => r.service.trim() && r.price !== '')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['repair-prices'] })
  const save = useMutation({
    mutationFn: () => api.post('/repair-prices', {
      rows: filled.map((r) => ({
        brand: r.brand, model: r.model, service: r.service, price: Number(r.price),
        warrantyDays: r.warrantyDays === '' ? null : Number(r.warrantyDays),
        ...(seesCost && r.costPrice !== '' ? { costPrice: Number(r.costPrice) } : {}),
      })),
    }).then((r) => r.data as { created: number; updated: number }),
    onSuccess: ({ created, updated }) => {
      toast.success(`บันทึกแล้ว: เพิ่ม ${created} · แก้ ${updated}`)
      const last = rows[rows.length - 1]
      setRows([emptyRow(last?.brand, last?.model)])
      refresh()
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/repair-prices/${id}`),
    onSuccess: () => { toast.success('ลบแล้ว'); refresh() },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  })

  const editRow = (r: RepairPrice) => {
    setRows([{
      brand: r.brand, model: r.model, service: r.service, price: String(r.price),
      warrantyDays: r.warrantyDays == null ? '' : String(r.warrantyDays),
      costPrice: r.costPrice == null ? '' : String(r.costPrice),
    }])
    document.getElementById('price-editor')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="ตารางราคาซ่อม" subtitle="ตั้งราคาตามรุ่นและงาน — เช็คราคาตอบลูกค้าได้ทันที และราคาขึ้นเองตอนรับงาน" icon={Calculator} />

      <SectionCard title="เช็คราคา" description="เลือกยี่ห้อและรุ่น แล้วดูราคางานซ่อมทั้งหมด">
        <div className="space-y-3">
          {devices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {devices.map((d) => (
                <button key={d.brand} type="button" onClick={() => { setBrand(d.brand); setModel('') }}
                  className={cn('rounded-full border px-3 py-1 text-sm', brand.toLowerCase() === d.brand.toLowerCase()
                    ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200')}>
                  {d.brand}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="ยี่ห้อ เช่น Apple" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <Input placeholder="รุ่น เช่น iPhone 13" value={model} onChange={(e) => setModel(e.target.value)} list="price-models" />
            <datalist id="price-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          {models.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {models.map((m) => (
                <button key={m} type="button" onClick={() => setModel(m)}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs', model.toLowerCase() === m.toLowerCase()
                    ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:text-slate-300')}>
                  {m}
                </button>
              ))}
            </div>
          )}
          {brand.trim() && (
            quoting ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> :
            quote.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีราคาของเครื่องนี้{canManage ? ' — เพิ่มได้ด้านล่าง' : ''}</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {quote.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white">{p.service}</p>
                      <p className="text-xs text-muted-foreground">
                        {brandLabel(p.brand)} · {modelLabel(p.model)}{p.warrantyDays ? ` · ประกัน ${p.warrantyDays} วัน` : ''}
                        {seesCost && p.costPrice != null ? ` · ทุน ${formatThaiMoney(p.costPrice)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatThaiMoney(p.price)}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </SectionCard>

      {canManage && (
        <div id="price-editor">
          <SectionCard title="เพิ่ม / แก้ราคา" description="ใส่หลายแถวแล้วบันทึกทีเดียว · ไม่ใส่รุ่น = ใช้กับทุกรุ่นของยี่ห้อนั้น · ไม่ใส่ยี่ห้อ = ทุกเครื่อง (เช่น ค่าตรวจเช็ค) · ยี่ห้อ+รุ่น+งานเดิม = แก้ราคา">
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-[1fr_1fr_1.4fr_0.8fr_0.7fr_0.8fr_auto]">
                  <Input placeholder="ยี่ห้อ" value={r.brand} onChange={(e) => setRow(i, { brand: e.target.value })} />
                  <Input placeholder="รุ่น (ว่าง = ทุกรุ่น)" value={r.model} onChange={(e) => setRow(i, { model: e.target.value })} />
                  <Input placeholder="งานซ่อม เช่น เปลี่ยนจอ" value={r.service} onChange={(e) => setRow(i, { service: e.target.value })} className="col-span-2 sm:col-span-1" />
                  <Input placeholder="ราคา" inputMode="decimal" type="number" min={0} value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
                  <Input placeholder="ประกัน (วัน)" inputMode="numeric" type="number" min={0} value={r.warrantyDays} onChange={(e) => setRow(i, { warrantyDays: e.target.value })} />
                  {seesCost
                    ? <Input placeholder="ทุน" inputMode="decimal" type="number" min={0} value={r.costPrice} onChange={(e) => setRow(i, { costPrice: e.target.value })} />
                    : <span className="hidden sm:block" />}
                  <button type="button" aria-label="ลบแถว" onClick={() => setRows((rs) => rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()])}
                    className="flex h-10 w-10 items-center justify-center justify-self-end rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="gap-1.5"
                  onClick={() => setRows((rs) => [...rs, emptyRow(rs[rs.length - 1]?.brand, rs[rs.length - 1]?.model)])}>
                  <Plus className="h-4 w-4" /> เพิ่มแถว (ยี่ห้อ/รุ่นเดิม)
                </Button>
                <Button type="button" className="gap-1.5" disabled={!filled.length || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  บันทึก {filled.length ? `${filled.length} รายการ` : ''}
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard title={`ราคาทั้งหมด (${all.length})`}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="ค้นหายี่ห้อ รุ่น หรืองาน" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{all.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีราคา'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-muted-foreground dark:border-slate-700">
                    <th className="py-2 pr-3 font-medium">ยี่ห้อ</th>
                    <th className="py-2 pr-3 font-medium">รุ่น</th>
                    <th className="py-2 pr-3 font-medium">งานซ่อม</th>
                    <th className="py-2 pr-3 text-right font-medium">ราคา</th>
                    {seesCost && <th className="py-2 pr-3 text-right font-medium">ทุน</th>}
                    <th className="py-2 pr-3 text-right font-medium">ประกัน</th>
                    {canManage && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-3">{brandLabel(r.brand)}</td>
                      <td className="py-2 pr-3">{modelLabel(r.model)}</td>
                      <td className="py-2 pr-3">{r.service}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatThaiMoney(r.price)}</td>
                      {seesCost && <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{r.costPrice == null ? '—' : formatThaiMoney(r.costPrice)}</td>}
                      <td className="py-2 pr-3 text-right text-muted-foreground">{r.warrantyDays ? `${r.warrantyDays} วัน` : '—'}</td>
                      {canManage && (
                        <td className="py-2 text-right whitespace-nowrap">
                          <button type="button" aria-label="แก้" onClick={() => editRow(r)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                          <button type="button" aria-label="ลบ" disabled={remove.isPending}
                            onClick={() => { if (confirm(`ลบราคา "${r.service}" ของ ${brandLabel(r.brand)} ${modelLabel(r.model)}?`)) remove.mutate(r.id) }}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
