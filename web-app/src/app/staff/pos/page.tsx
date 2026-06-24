'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Scan, Plus, Minus, Trash2, ChevronLeft, ShoppingCart, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

interface Product {
  id:           string
  name:         string
  salePrice:    number
  stockQuantity: number
  sku?:         string
}

interface CartItem extends Product {
  qty: number
}

export default function PosPage() {
  const router   = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [paying,   setPaying]   = useState(false)

  useEffect(() => {
    api.get('/products?limit=100').then((r) => {
      const list = r.data?.data ?? r.data ?? []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function addToCart(p: Product) {
    setCart((prev) => {
      const exists = prev.find((c) => c.id === p.id)
      if (exists) return prev.map((c) => c.id === p.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { ...p, qty: 1 }]
    })
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.id !== id) return [c]
        const newQty = c.qty + delta
        return newQty <= 0 ? [] : [{ ...c, qty: newQty }]
      })
    )
  }

  const total = cart.reduce((sum, c) => sum + c.salePrice * c.qty, 0)

  async function checkout() {
    if (!cart.length) return
    setPaying(true)
    try {
      await api.post('/sales', {
        items: cart.map((c) => ({ productId: c.id, quantity: c.qty, salePrice: c.salePrice })),
        paymentMethod: 'CASH',
      })
      toast.success('ชำระเงินสำเร็จ')
      setCart([])
    } catch {
      toast.error('ชำระเงินไม่สำเร็จ')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-lg font-bold text-brand-black">ขายสินค้า POS</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด"
            className="h-11 w-full rounded-2xl bg-brand-light pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow/20"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2">
            <Scan className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Product grid */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-yellow" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stockQuantity <= 0}
                className="flex flex-col gap-2 rounded-[20px] bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-left active:scale-[0.97] transition-transform disabled:opacity-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-yellow/10">
                  <ShoppingCart className="h-6 w-6 text-brand-yellow" strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-black line-clamp-2 leading-snug">{p.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">คงเหลือ {p.stockQuantity}</p>
                </div>
                <p className="text-base font-bold text-brand-yellow">฿{p.salePrice.toLocaleString()}</p>
              </button>
            ))}
          </div>
        )}

        {/* Cart section */}
        {cart.length > 0 && (
          <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <h2 className="mb-3 font-semibold text-brand-black">ตะกร้าสินค้า</h2>
            <div className="flex flex-col gap-2.5">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400">฿{item.salePrice.toLocaleString()} / ชิ้น</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-light">
                      <Minus className="h-3.5 w-3.5 text-slate-600" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                    <button onClick={() => changeQty(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-yellow">
                      <Plus className="h-3.5 w-3.5 text-brand-black" />
                    </button>
                    <button onClick={() => setCart((c) => c.filter((x) => x.id !== item.id))} className="ml-1">
                      <Trash2 className="h-4 w-4 text-brand-danger" />
                    </button>
                  </div>
                  <p className="w-20 text-right text-sm font-bold text-brand-black">
                    ฿{(item.salePrice * item.qty).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <div>
                <p className="text-xs text-slate-400">รวม {cart.reduce((s, c) => s + c.qty, 0)} รายการ</p>
                <p className="text-xl font-extrabold text-brand-black">฿{total.toLocaleString()}</p>
              </div>
              <button
                onClick={checkout}
                disabled={paying}
                className="flex h-[52px] items-center gap-2 rounded-2xl bg-brand-yellow px-6 font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] disabled:opacity-60"
              >
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ชำระเงิน
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
