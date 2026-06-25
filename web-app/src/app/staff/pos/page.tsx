'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, Scan, Plus, Minus, Loader2, ShoppingCart } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

interface Product { id:string; name:string; salePrice:number; stockQuantity:number; sku?:string; category?:{name:string}; type?:string }
interface CartItem extends Product { qty:number }

export default function PosPage() {
  const router  = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [search,   setSearch]   = useState('')
  const [cat,      setCat]      = useState('ทั้งหมด')
  const [loading,  setLoading]  = useState(true)
  const [paying,   setPaying]   = useState(false)

  useEffect(() => {
    api.get('/products?limit=100').then(r => {
      const list = r.data?.data ?? r.data ?? []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const cats = useMemo(() => {
    const names = new Set<string>()
    products.forEach(p => { if (p.category?.name) names.add(p.category.name) })
    return ['ทั้งหมด', ...Array.from(names)]
  }, [products])

  const filtered = products.filter(p =>
    (search ? p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku??'').includes(search) : true) &&
    (cat === 'ทั้งหมด' || p.category?.name === cat)
  )

  function addToCart(p: Product) {
    setCart(prev => {
      const ex = prev.find(c=>c.id===p.id)
      if (ex) return prev.map(c=>c.id===p.id?{...c,qty:c.qty+1}:c)
      return [...prev,{...p,qty:1}]
    })
  }
  function changeQty(id:string, delta:number) {
    setCart(prev => prev.flatMap(c => {
      if (c.id!==id) return [c]
      const nq = c.qty+delta
      return nq<=0 ? [] : [{...c,qty:nq}]
    }))
  }

  const total   = cart.reduce((s,c)=>s+c.salePrice*c.qty,0)
  const cartQty = cart.reduce((s,c)=>s+c.qty,0)

  async function checkout(method:string) {
    if (!cart.length) return
    setPaying(true)
    try {
      await api.post('/sales', { items: cart.map(c=>({productId:c.id,quantity:c.qty,salePrice:c.salePrice})), paymentMethod:method })
      toast.success('ชำระเงินสำเร็จ')
      setCart([])
    } catch { toast.error('ชำระเงินไม่สำเร็จ') }
    finally { setPaying(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">POS ขายสินค้า</h1>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <Scan className="h-5 w-5 text-slate-600" />
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด"
            className="h-11 w-full rounded-xl bg-[#F8F9FB] pl-10 pr-4 text-sm outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {cats.map(c => (
            <button key={c} onClick={()=>setCat(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                cat===c ? 'bg-brand-yellow text-brand-black' : 'bg-[#F8F9FB] text-slate-500'
              }`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow"/></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-12 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <ShoppingCart className="h-10 w-10 text-slate-200" strokeWidth={1.5}/>
            <p className="text-sm text-slate-400">ไม่พบสินค้า</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
            {filtered.map((p,i) => {
              const inCart = cart.find(c=>c.id===p.id)
              return (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${i>0?'border-t border-slate-50':''}`}>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]">
                    <ShoppingCart className="h-6 w-6 text-slate-300" strokeWidth={1.5}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-black truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-sm font-bold text-brand-yellow">฿{(p.salePrice ?? 0).toLocaleString()}</p>
                      <p className={`text-[11px] font-medium ${p.stockQuantity<=5?'text-red-500':'text-slate-400'}`}>
                        คงเหลือ {p.stockQuantity}
                      </p>
                    </div>
                  </div>
                  {inCart ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={()=>changeQty(p.id,-1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F8F9FB]">
                        <Minus className="h-3.5 w-3.5 text-slate-600"/>
                      </button>
                      <span className="w-5 text-center text-sm font-bold">{inCart.qty}</span>
                      <button onClick={()=>changeQty(p.id,1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-yellow">
                        <Plus className="h-3.5 w-3.5 text-brand-black"/>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={()=>addToCart(p)}
                      disabled={p.stockQuantity<=0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-yellow disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4 text-brand-black"/>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-[70px] left-0 right-0 bg-white border-t border-slate-100 px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-400">รวม {cartQty} รายการ</p>
            <p className="text-2xl font-extrabold text-brand-black">฿{total.toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={()=>setCart([])} className="h-12 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
              เคลียร์
            </button>
            <button onClick={()=>checkout('TRANSFER')} disabled={paying} className="h-12 rounded-xl bg-brand-black text-sm font-bold text-white disabled:opacity-60">
              โอนเงิน
            </button>
            <button onClick={()=>checkout('CASH')} disabled={paying} className="h-12 rounded-xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_12px_rgba(255,193,7,0.4)] disabled:opacity-60">
              {paying ? <Loader2 className="h-4 w-4 animate-spin mx-auto"/> : 'ชำระเงิน'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
