'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, Package, AlertTriangle, Loader2, Plus } from 'lucide-react'
import api from '@/lib/api'

interface Product {
  id:            string
  name:          string
  costPrice:     number
  salePrice:     number
  stockQuantity: number
  sku?:          string
  category?:     { name: string }
}

export default function StockPage() {
  const router = useRouter()
  const [tab,      setTab]      = useState<'products' | 'parts'>('products')
  const [products, setProducts] = useState<Product[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    const endpoint = tab === 'products' ? '/products?limit=100' : '/parts?limit=100'
    api.get(endpoint).then((r) => {
      const list = r.data?.data ?? r.data ?? []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => setProducts([])).finally(() => setLoading(false))
  }, [tab])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const lowStock = filtered.filter((p) => p.stockQuantity <= 5)

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-lg font-bold text-brand-black flex-1">สต็อกสินค้า</h1>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow">
            <Plus className="h-4 w-4 text-brand-black" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['products', 'parts'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                tab === t ? 'bg-brand-yellow text-brand-black' : 'bg-brand-light text-slate-500'
              }`}
            >
              {t === 'products' ? 'สินค้า' : 'อะไหล่'}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาสินค้า..."
            className="h-11 w-full rounded-2xl bg-brand-light pl-10 pr-4 text-sm outline-none"
          />
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="flex items-center gap-3 rounded-[20px] bg-brand-danger/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-brand-danger" />
            <p className="text-sm text-brand-danger font-medium">
              สินค้า {lowStock.length} รายการใกล้หมด (คงเหลือ ≤ 5)
            </p>
          </div>
        )}

        {/* Product list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Package className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">ไม่พบสินค้า</p>
          </div>
        ) : (
          <div className="rounded-[20px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 bg-brand-light">
              <p className="flex-1 text-[11px] font-semibold uppercase text-slate-400">สินค้า</p>
              <p className="w-16 text-right text-[11px] font-semibold uppercase text-slate-400">ซื้อ</p>
              <p className="w-16 text-right text-[11px] font-semibold uppercase text-slate-400">ขาย</p>
              <p className="w-14 text-right text-[11px] font-semibold uppercase text-slate-400">คงคลัง</p>
            </div>

            {filtered.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-4 py-3 ${i > 0 ? 'border-t border-slate-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-black truncate">{p.name}</p>
                  {p.sku && <p className="text-[10px] text-slate-400">{p.sku}</p>}
                </div>
                <p className="w-16 text-right text-sm text-slate-500">฿{p.costPrice?.toLocaleString() || '-'}</p>
                <p className="w-16 text-right text-sm font-medium text-slate-700">฿{p.salePrice?.toLocaleString()}</p>
                <p className={`w-14 text-right text-sm font-bold ${
                  p.stockQuantity <= 5 ? 'text-brand-danger' : 'text-brand-success'
                }`}>
                  {p.stockQuantity}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
