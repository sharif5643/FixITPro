'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Search, Package, AlertTriangle, Loader2, Plus, Minus, X, CheckCircle2, Wand2, Barcode } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAppBranch } from '@/hooks/useAppBranch'
import { useAuthStore } from '@/store/auth.store'
import { AppBranchBar } from '@/components/app/app-branch-bar'
import { SerialMismatchCard } from '@/components/products/serial-mismatch-card'
import { averageCost } from '@/lib/below-cost'
import type { Product } from '@/types'

const PRODUCT_TYPES = [
  { value: 'PHONE',     label: 'มือถือ' },
  { value: 'SIM',       label: 'ซิมการ์ด' },
  { value: 'ACCESSORY', label: 'อุปกรณ์เสริม' },
  { value: 'PART',      label: 'อะไหล่' },
]

const INPUT = 'h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow'
const LABEL = 'mb-1 block text-xs font-semibold text-slate-500'

const errText = (err: unknown, fallback: string) => {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(msg) ? msg[0] : (msg ?? fallback)
}
const splitSerials = (text: string) => text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
/** In this branch; a product the branch does not carry yet counts as 0 */
const qtyOf = (p: Product) => p.branchQuantity ?? 0

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-base font-bold text-brand-black">{title}</p>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F8F9FB]">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ─── Stock in / out for one product ──────────────────────────────────────── */

function AdjustSheet({ product, branchId, onClose }: { product: Product; branchId?: string; onClose: () => void }) {
  const qc = useQueryClient()
  const canViewCost = useAuthStore((s) => s.hasPermission)('products.view_cost')
  const bySerial = !!product.hasSerial
  const [mode, setMode]         = useState<'IN' | 'OUT'>('IN')
  const [qty, setQty]           = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [note, setNote]         = useState('')
  const [imeiText, setImeiText] = useState('')
  const [picked, setPicked]     = useState<string[]>([])
  const [noImei, setNoImei]     = useState(0)

  const serialList = splitSerials(imeiText)
  const dupSerial  = new Set(serialList).size !== serialList.length
  const { data: inStock, isLoading: loadingSerials } = useQuery<{ total: number; items: { id: string; serial: string }[] }>({
    queryKey: ['serials', product.id, 'IN_STOCK'],
    queryFn:  async () => (await api.get('/serials', { params: { productId: product.id, status: 'IN_STOCK', limit: 200 } })).data,
    enabled:  bySerial && mode === 'OUT',
    staleTime: 0,
  })
  // Older data: units counted in stock with no IMEI recorded may go out without one
  const unitsNoImei = Math.max(0, Number(product.stock ?? 0) - (inStock?.total ?? 0))
  const current = qtyOf(product)
  const amount = bySerial ? (mode === 'IN' ? serialList.length : picked.length + noImei) : (parseInt(qty) || 0)
  const after  = mode === 'IN' ? current + amount : current - amount
  const costIn = parseFloat(unitCost) || 0

  const save = useMutation({
    mutationFn: () => api.post('/stock/adjust', {
      productId: product.id,
      type:      mode,
      quantity:  amount,
      ...(branchId ? { branchId } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(bySerial && mode === 'IN' ? { serials: serialList } : {}),
      ...(bySerial && mode === 'OUT' ? { serialIds: picked } : {}),
      ...(mode === 'IN' && costIn > 0 ? { unitCost: costIn } : {}),
    }),
    onSuccess: () => {
      toast.success(mode === 'IN' ? `รับเข้า ${amount} ชิ้นแล้ว` : `ตัดออก ${amount} ชิ้นแล้ว`)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['serials'] })
      qc.invalidateQueries({ queryKey: ['stock', 'serial-mismatch'] })
      onClose()
    },
    onError: (err) => toast.error(errText(err, 'บันทึกไม่สำเร็จ')),
  })

  const valid = amount > 0 && !(bySerial && mode === 'IN' && dupSerial) && (mode === 'IN' || after >= 0 || bySerial)

  return (
    <Sheet title={product.name} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#F8F9FB] px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-slate-400">{product.sku}</p>
          {bySerial && <p className="text-[11px] font-semibold text-blue-600">ใช้ IMEI</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400">คงเหลือสาขานี้</p>
          <p className="text-2xl font-extrabold text-brand-black">{current}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(['IN', 'OUT'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`h-11 rounded-xl text-sm font-bold ${mode === m
              ? (m === 'IN' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white')
              : 'bg-[#F8F9FB] text-slate-500'}`}>
            {m === 'IN' ? 'รับเข้า' : 'ตัดออก'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {bySerial && mode === 'IN' && (
          <div>
            <label className={LABEL}>IMEI ของเครื่องที่รับเข้า (บรรทัดละ 1 เครื่อง)</label>
            <textarea rows={4} value={imeiText} onChange={(e) => setImeiText(e.target.value)}
              placeholder={'356789012345678\n356789012345679'}
              className="w-full rounded-xl bg-[#F8F9FB] px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-yellow" />
            <p className="mt-1 text-xs text-slate-500">
              รับเข้า <b>{serialList.length}</b> เครื่อง{dupSerial && <span className="ml-1 font-semibold text-red-500">· มี IMEI ซ้ำ</span>}
            </p>
          </div>
        )}

        {bySerial && mode === 'OUT' && (
          <div>
            <label className={LABEL}>เลือกเครื่องที่ตัดออก (เสีย / คืนร้านค้า / หาย)</label>
            {loadingSerials ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : (inStock?.items ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">ไม่มี IMEI ที่อยู่ในสต็อก</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {(inStock?.items ?? []).map((s) => {
                  const on = picked.includes(s.id)
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setPicked((v) => on ? v.filter((x) => x !== s.id) : [...v, s.id])}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left font-mono text-sm ${on ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-700'}`}>
                      {on ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" />}
                      {s.serial}
                    </button>
                  )
                })}
              </div>
            )}
            {!loadingSerials && unitsNoImei > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-800">มี {unitsNoImei} เครื่องที่ไม่มี IMEI ในระบบ — ตัดออก</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setNoImei((n) => Math.max(0, n - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><Minus className="h-4 w-4" /></button>
                  <span className="w-5 text-center font-bold">{noImei}</span>
                  <button type="button" onClick={() => setNoImei((n) => Math.min(unitsNoImei, n + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {!bySerial && (
          <div>
            <label className={LABEL}>{mode === 'IN' ? 'จำนวนที่รับเข้า' : 'จำนวนที่ตัดออก'}</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQty(String(Math.max(1, (parseInt(qty) || 0) - 1)))}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]"><Minus className="h-5 w-5" /></button>
              <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" inputMode="numeric" min="1"
                className="h-12 min-w-0 flex-1 rounded-xl bg-[#F8F9FB] text-center text-xl font-bold outline-none focus:ring-2 focus:ring-brand-yellow" />
              <button type="button" onClick={() => setQty(String((parseInt(qty) || 0) + 1))}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]"><Plus className="h-5 w-5" /></button>
            </div>
          </div>
        )}

        {/* Price paid: averaged into the product's cost (only for people who can see cost) */}
        {mode === 'IN' && canViewCost && product.costPrice != null && (
          <div>
            <label className={LABEL}>ราคาที่ซื้อมา / ชิ้น (ไม่บังคับ)</label>
            <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} type="number" inputMode="decimal" min="0"
              placeholder={`ทุนตอนนี้ ${Number(product.costPrice).toLocaleString('th-TH')} บาท`} className={INPUT} />
            {costIn > 0 && amount > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                ทุนเฉลี่ยใหม่ <b>{averageCost(Number(product.stock ?? 0), Number(product.costPrice), amount, costIn).toLocaleString('th-TH')} บาท</b>
              </p>
            )}
          </div>
        )}

        <div>
          <label className={LABEL}>หมายเหตุ (ไม่บังคับ)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT}
            placeholder={mode === 'IN' ? 'เช่น รับของจากร้าน ABC' : 'เช่น ของเสีย, คืนร้านค้า'} />
        </div>

        {amount > 0 && (
          <p className={`rounded-xl px-3 py-2 text-center text-sm ${mode === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
            {current} <b className={mode === 'IN' ? 'text-emerald-600' : 'text-red-500'}>{mode === 'IN' ? `+${amount}` : `−${amount}`}</b> = <b className="text-lg">{after}</b> ชิ้น
          </p>
        )}

        <button onClick={() => save.mutate()} disabled={!valid || save.isPending}
          className={`mt-1 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-bold text-white disabled:opacity-50 ${mode === 'IN' ? 'bg-emerald-600' : 'bg-red-500'}`}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'IN' ? `รับเข้า ${amount || ''}` : `ตัดออก ${amount || ''}`}
        </button>
      </div>
    </Sheet>
  )
}

/* ─── New product ─────────────────────────────────────────────────────────── */

function AddProductSheet({ defaultType, branchId, onClose }: { defaultType: string; branchId?: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName]         = useState('')
  const [type, setType]         = useState(defaultType)
  const [sku, setSku]           = useState('')
  const [barcode, setBarcode]   = useState('')
  const [price, setPrice]       = useState('')
  const [cost, setCost]         = useState('')
  const [stock, setStock]       = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [hasSerial, setHasSerial] = useState(defaultType === 'PHONE')
  const [imeiText, setImeiText] = useState('')
  const [genSku, setGenSku]     = useState(false)
  const [genBarcode, setGenBarcode] = useState(false)

  const serialList = splitSerials(imeiText)
  const dupSerial  = new Set(serialList).size !== serialList.length
  const priceNum = parseFloat(price) || 0
  const costNum  = parseFloat(cost) || 0
  const openQty  = hasSerial ? serialList.length : (parseInt(stock) || 0)

  async function autoSku() {
    setGenSku(true)
    try { setSku((await api.get('/products/generate-sku', { params: { type } })).data.sku) }
    catch { toast.error('สร้างรหัสสินค้าไม่สำเร็จ') }
    finally { setGenSku(false) }
  }
  async function autoBarcode() {
    setGenBarcode(true)
    try { setBarcode((await api.get('/products/generate-barcode')).data.barcode) }
    catch { toast.error('สร้างบาร์โค้ดไม่สำเร็จ') }
    finally { setGenBarcode(false) }
  }

  const save = useMutation({
    mutationFn: () => api.post('/products', {
      name: name.trim(), sku: sku.trim(), type, price: priceNum, costPrice: costNum,
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      stock: openQty, minStock: parseInt(minStock) || 0, hasSerial,
      ...(hasSerial && serialList.length ? { initialSerials: serialList } : {}),
      ...(branchId ? { branchId } : {}),
    }),
    onSuccess: () => {
      toast.success('เพิ่มสินค้าสำเร็จ')
      qc.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
    onError: (err) => toast.error(errText(err, 'เพิ่มสินค้าไม่สำเร็จ')),
  })

  function submit() {
    if (!name.trim()) return toast.error('กรุณากรอกชื่อสินค้า')
    if (!sku.trim())  return toast.error('กรุณากรอกรหัสสินค้า หรือกด "สร้างอัตโนมัติ"')
    if (priceNum <= 0) return toast.error('กรุณากรอกราคาขาย')
    if (hasSerial && dupSerial) return toast.error('มี IMEI ซ้ำในรายการ')
    // A cost above the price usually is a typo (an extra zero)
    if (costNum > priceNum && !window.confirm(`ต้นทุน ${costNum.toLocaleString('th-TH')} บาท สูงกว่าราคาขาย ${priceNum.toLocaleString('th-TH')} บาท — ถูกต้องใช่ไหม?`)) return
    save.mutate()
  }

  return (
    <Sheet title="เพิ่มสินค้าใหม่" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={LABEL}>ชื่อสินค้า <span className="text-red-500">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ฟิล์มกระจก iPhone 15" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>ประเภทสินค้า</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setHasSerial(e.target.value === 'PHONE') }} className={INPUT}>
            {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>รหัสสินค้า (SKU) <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" className={`${INPUT} min-w-0 flex-1`} />
            <button type="button" onClick={autoSku} disabled={genSku}
              className="flex h-11 shrink-0 items-center gap-1 rounded-xl bg-[#FFF8E7] px-3 text-xs font-bold text-[#B45309] disabled:opacity-60">
              {genSku ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} สร้างอัตโนมัติ
            </button>
          </div>
        </div>
        <div>
          <label className={LABEL}>บาร์โค้ด (ไม่บังคับ)</label>
          <div className="flex gap-2">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="13 หลัก" inputMode="numeric" className={`${INPUT} min-w-0 flex-1`} />
            <button type="button" onClick={autoBarcode} disabled={genBarcode}
              className="flex h-11 shrink-0 items-center gap-1 rounded-xl bg-[#FFF8E7] px-3 text-xs font-bold text-[#B45309] disabled:opacity-60">
              {genBarcode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Barcode className="h-3.5 w-3.5" />} สร้างอัตโนมัติ
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>ราคาขาย <span className="text-red-500">*</span></label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" type="number" inputMode="decimal" min="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>ราคาทุน</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" type="number" inputMode="decimal" min="0" className={INPUT} />
          </div>
        </div>
        {priceNum > 0 && costNum > priceNum && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            ⚠️ ต้นทุนสูงกว่าราคาขาย — ขายแล้วขาดทุน {(costNum - priceNum).toLocaleString('th-TH')} บาท/ชิ้น ตรวจดูว่าพิมพ์เลขเกินหรือไม่
          </p>
        )}
        {priceNum > 0 && costNum === 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">ยังไม่ได้ใส่ต้นทุน — รายงานกำไรจะนับสินค้านี้เป็นกำไรเต็มราคา</p>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={hasSerial} onChange={(e) => setHasSerial(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          ติดตาม IMEI / Serial (ต้องเลือก IMEI ตอนขาย)
        </label>

        <div className="grid grid-cols-2 gap-3">
          {hasSerial ? (
            <div className="col-span-2">
              <label className={LABEL}>IMEI ของเครื่องที่มีตอนนี้ (บรรทัดละ 1 เครื่อง — เว้นว่างถ้ายังไม่มีของ)</label>
              <textarea rows={3} value={imeiText} onChange={(e) => setImeiText(e.target.value)}
                placeholder={'356789012345678\n356789012345679'}
                className="w-full rounded-xl bg-[#F8F9FB] px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-brand-yellow" />
              <p className="mt-1 text-xs text-slate-500">
                สต็อกเริ่มต้น <b>{serialList.length}</b> เครื่อง{dupSerial && <span className="ml-1 font-semibold text-red-500">· มี IMEI ซ้ำ</span>}
              </p>
            </div>
          ) : (
            <div>
              <label className={LABEL}>จำนวนเริ่มต้น</label>
              <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" type="number" inputMode="numeric" min="0" className={INPUT} />
            </div>
          )}
          <div>
            <label className={LABEL}>แจ้งเตือนเมื่อเหลือ</label>
            <input value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" type="number" inputMode="numeric" min="0" className={INPUT} />
          </div>
        </div>

        <button onClick={submit} disabled={save.isPending}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-brand-yellow text-sm font-bold text-brand-on-yellow shadow-[0_4px_16px_rgb(var(--brand-accent)/0.4)] disabled:opacity-60">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
        </button>
      </div>
    </Sheet>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function StockPage() {
  const router = useRouter()
  const appBranch = useAppBranch()
  const hasPerm = useAuthStore((s) => s.hasPermission)
  const canAdjust = hasPerm('stock.adjust')
  const canCreate = hasPerm('products.create')
  const [tab, setTab]           = useState<'products' | 'parts'>('products')
  const [search, setSearch]     = useState('')
  const [debounced, setDebounced] = useState('')
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [adding, setAdding]     = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const branchId = appBranch.branchId
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', 'staff-stock', branchId ?? 'none', debounced],
    queryFn: async () => {
      const r = await api.get('/products', { params: { ...(debounced ? { search: debounced } : {}), ...(branchId ? { branchId } : {}) } })
      const list = r.data?.data ?? r.data ?? []
      return Array.isArray(list) ? list : []
    },
    enabled: !appBranch.needsPick,
  })

  const shown = products.filter((p) => (tab === 'parts' ? p.type === 'PART' : p.type !== 'PART'))
  const isLow = (p: Product) => qtyOf(p) <= 0 || (p.minStock > 0 && qtyOf(p) <= p.minStock)
  const lowCount = shown.filter(isLow).length

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
        <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <h1 className="flex-1 text-lg font-bold text-brand-black">สต็อกสินค้า</h1>
            {canCreate && (
              <button onClick={() => setAdding(true)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow" aria-label="เพิ่มสินค้าใหม่">
                <Plus className="h-4 w-4 text-brand-black" />
              </button>
            )}
          </div>
          <div className="mb-4 flex gap-2">
            {(['products', 'parts'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${tab === t ? 'bg-brand-yellow text-brand-on-yellow' : 'bg-[#F8F9FB] text-slate-500'}`}>
                {t === 'products' ? 'สินค้า' : 'อะไหล่'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / บาร์โค้ด..."
              className="h-11 w-full rounded-xl bg-[#F8F9FB] pl-10 pr-4 text-sm outline-none" />
          </div>
        </div>
        <AppBranchBar />

        <div className="flex flex-col gap-3 p-5">
          <SerialMismatchCard serialsHref={null} />
          {lowCount > 0 && (
            <div className="flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm font-medium text-red-600">{tab === 'parts' ? 'อะไหล่' : 'สินค้า'} {lowCount} รายการ หมดหรือใกล้หมด</p>
            </div>
          )}

          {appBranch.needsPick ? (
            <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-400">เลือกสาขาด้านบนก่อน</p>
          ) : isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow" /></div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Package className="h-10 w-10 text-slate-200" />
              <p className="text-sm text-slate-400">ไม่พบ{tab === 'parts' ? 'อะไหล่' : 'สินค้า'}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex items-center border-b border-slate-100 bg-[#F8F9FB] px-4 py-2.5">
                <p className="flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">รายการ{canAdjust ? ' — แตะเพื่อรับเข้า/ตัดออก' : ''}</p>
                <p className="w-20 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">ราคาขาย</p>
                <p className="w-14 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">คงเหลือ</p>
              </div>
              {shown.map((p, i) => (
                <button key={p.id} type="button" disabled={!canAdjust || !branchId} onClick={() => setAdjusting(p)}
                  className={`flex w-full items-center px-4 py-3 text-left active:bg-slate-50 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]">
                      <Package className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-brand-black">{p.name}</p>
                      <p className="truncate text-[10px] text-slate-400">{p.sku}{p.hasSerial ? ' · IMEI' : ''}</p>
                    </div>
                  </div>
                  <p className="w-20 text-right text-sm font-semibold text-slate-700">฿{Number(p.price ?? 0).toLocaleString('th-TH')}</p>
                  <p className={`w-14 text-right text-sm font-bold ${isLow(p) ? 'text-red-500' : 'text-brand-success'}`}>{qtyOf(p)}</p>
                </button>
              ))}
            </div>
          )}

          {canCreate && (
            <button onClick={() => setAdding(true)}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-semibold text-slate-400">
              <Plus className="h-4 w-4" /> เพิ่มสินค้าใหม่
            </button>
          )}
        </div>
      </div>

      {adjusting && <AdjustSheet product={adjusting} branchId={branchId} onClose={() => setAdjusting(null)} />}
      {adding && <AddProductSheet defaultType={tab === 'parts' ? 'PART' : 'ACCESSORY'} branchId={branchId} onClose={() => setAdding(false)} />}
    </>
  )
}
