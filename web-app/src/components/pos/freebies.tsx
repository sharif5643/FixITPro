'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Minus, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { cn, formatThaiMoney } from '@/lib/utils'
import { useCartStore } from '@/store/cart.store'
import type { Product } from '@/types'

/**
 * Give-aways on a bill (ของแถม): free to the customer, but their cost counts against the bill
 * so its profit is the real one. Give-away-only goods (กะละมัง, กระติก...) are listed first;
 * anything the shop sells can be given free too (shown with what it is worth).
 */

const productsKey = (branchId?: string | null) => ['products', branchId ?? 'all']

function useShopProducts(branchId?: string | null, enabled = true) {
  return useQuery<Product[]>({
    queryKey: productsKey(branchId),
    queryFn: async () => {
      const res = await api.get('/products', { params: branchId ? { branchId } : {} })
      return Array.isArray(res.data) ? res.data : res.data?.items ?? []
    },
    staleTime: 30_000,
    enabled,
  })
}

/** "🎁 เพิ่มของแถม": opens the picker */
export function AddFreebieButton({ branchId, className }: { branchId?: string | null; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={cn('flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-fuchsia-300 px-3 py-2 text-sm font-bold text-fuchsia-700 hover:bg-fuchsia-50 active:bg-fuchsia-50 dark:border-fuchsia-700 dark:text-fuchsia-300', className)}>
        <Gift className="h-4 w-4" /> เพิ่มของแถม
      </button>
      {open && <FreebiePicker branchId={branchId} onClose={() => setOpen(false)} />}
    </>
  )
}

export function FreebiePicker({ branchId, onClose }: { branchId?: string | null; onClose: () => void }) {
  const { data: products = [], isLoading } = useShopProducts(branchId)
  const addFreebie = useCartStore((s) => s.addFreebie)
  const [q, setQ] = useState('')
  const { giveaways, others } = useMemo(() => {
    const term = q.trim().toLowerCase()
    const active = products.filter((p) => p.isActive && (!term
      || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || (p.barcode ?? '').toLowerCase().includes(term)))
    return {
      giveaways: active.filter((p) => p.giveawayOnly),
      others: term ? active.filter((p) => !p.giveawayOnly && p.type !== 'PHONE').slice(0, 30) : [],
    }
  }, [products, q])

  const pick = (p: Product) => {
    if ((p.branchQuantity ?? 0) < 1) { toast.error(`${p.name} — หมดสต็อก`); return }
    addFreebie(p)
    toast.success(`🎁 แถม ${p.name}`, { duration: 1200 })
  }

  const row = (p: Product) => {
    const qty = p.branchQuantity ?? 0
    return (
      <button key={p.id} type="button" onClick={() => pick(p)} disabled={qty < 1}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-fuchsia-50 active:bg-fuchsia-50 disabled:opacity-40 dark:hover:bg-fuchsia-900/20">
        <Gift className="h-4 w-4 shrink-0 text-fuchsia-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{p.name}</span>
          <span className="block text-xs text-muted-foreground">
            ทุน {formatThaiMoney(Number(p.costPrice ?? 0))}{!p.giveawayOnly && Number(p.price) > 0 ? ` · ปกติขาย ${formatThaiMoney(Number(p.price))}` : ''} · เหลือ {qty}
          </span>
        </span>
        <Plus className="h-4 w-4 shrink-0 text-fuchsia-600" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Gift className="h-5 w-5 text-fuchsia-600" />
          <p className="flex-1 font-bold">เพิ่มของแถม</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา หรือพิมพ์ชื่อสินค้าที่จะแถม (เช่น ฟิล์ม)"
              className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-fuchsia-400 dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">ลูกค้าไม่ต้องจ่าย · ทุนของแถมหักจากกำไรของบิลนี้</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
          {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด…</p> : (
            <>
              <p className="px-2 pb-1 text-xs font-bold text-slate-500">ของแถม</p>
              {giveaways.length ? giveaways.map(row) : (
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  ยังไม่มีสินค้าที่ตั้งเป็น “ของแถม” — เพิ่มที่หน้าสินค้า (ติ๊ก “ของแถม ไม่ได้ขาย”) หรือค้นหาสินค้าที่ขายอยู่เพื่อแถม
                </p>
              )}
              {others.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-3 text-xs font-bold text-slate-500">สินค้าที่ขายอยู่ (แถมได้)</p>
                  {others.map(row)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** The bill's give-aways, under the cart lines */
export function FreebieList({ className }: { className?: string }) {
  const freebies = useCartStore((s) => s.freebies) ?? []
  const setQty = useCartStore((s) => s.setFreebieQty)
  if (freebies.length === 0) return null
  return (
    <div className={cn('rounded-2xl border border-fuchsia-200 bg-fuchsia-50/60 p-2.5 dark:border-fuchsia-900 dark:bg-fuchsia-900/10', className)}>
      <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-bold text-fuchsia-800 dark:text-fuchsia-300">
        <Gift className="h-3.5 w-3.5" /> ของแถมในบิลนี้ (ลูกค้าไม่ต้องจ่าย)
      </p>
      {freebies.map((f) => (
        <div key={f.product.id} className="flex items-center gap-2 px-1 py-1">
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{f.product.name}</span>
            <span className="block text-[11px] text-muted-foreground">ทุน {formatThaiMoney(Number(f.product.costPrice ?? 0) * f.quantity)}{f.auto ? ' · แถมประจำรุ่น' : ''}</span>
          </span>
          <button type="button" onClick={() => setQty(f.product.id, f.quantity - 1)} aria-label="ลด"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 dark:bg-slate-800"><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-6 text-center text-sm font-bold tabular-nums">{f.quantity}</span>
          <button type="button" onClick={() => setQty(f.product.id, f.quantity + 1)} aria-label="เพิ่ม"
            disabled={f.quantity >= (f.product.branchQuantity ?? 0)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 disabled:opacity-40 dark:bg-slate-800"><Plus className="h-3.5 w-3.5" /></button>
          <span className="w-12 text-right text-xs font-bold text-fuchsia-700">แถม</span>
        </div>
      ))}
    </div>
  )
}

/**
 * A product sold with give-aways set on it (e.g. iPhone 15 → ฟิล์ม + กะละมัง): they go on the bill
 * by themselves when it is added, and come off with it. Mount once on a till screen.
 */
export function useAutoFreebies(branchId?: string | null) {
  const items = useCartStore((s) => s.items)
  const addFreebie = useCartStore((s) => s.addFreebie)
  const qc = useQueryClient()
  const handled = useRef(new Set<string>())
  useEffect(() => {
    const inCart = new Set(items.map((i) => i.product.id))
    Array.from(handled.current).forEach((id) => { if (!inCart.has(id)) handled.current.delete(id) })
    for (const item of items) {
      const list = item.product.freebies ?? []
      if (!list.length || handled.current.has(item.product.id)) continue
      handled.current.add(item.product.id)
      const known = qc.getQueryData<Product[]>(productsKey(branchId)) ?? []
      void (async () => {
        for (const f of list) {
          let p = known.find((x) => x.id === f.productId)
          if (!p) {
            try {
              const res = await api.get('/products', { params: { search: '', ...(branchId ? { branchId } : {}) } })
              const all: Product[] = Array.isArray(res.data) ? res.data : res.data?.items ?? []
              p = all.find((x) => x.id === f.productId)
            } catch { /* skipped: added by hand if needed */ }
          }
          if (!p) continue
          if ((p.branchQuantity ?? 0) < f.quantity) { toast.warning(`ของแถม ${p.name} หมดสต็อก — ไม่ได้ใส่ให้`); continue }
          if ((useCartStore.getState().freebies ?? []).some((x) => x.product.id === p!.id)) continue
          addFreebie(p, f.quantity, item.product.id)
          toast(`🎁 แถม ${p.name} (ตั้งไว้กับ ${item.product.name})`, { duration: 1500 })
        }
      })()
    }
  }, [items, branchId, addFreebie, qc])
}
