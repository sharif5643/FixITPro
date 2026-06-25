'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, Package, AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'sonner'

interface Product { id:string; name:string; salePrice:number; stockQuantity:number; sku?:string }

const PRODUCT_TYPES = [
  { value:'PHONE',     label:'มือถือ' },
  { value:'SIM',       label:'ซิมการ์ด' },
  { value:'ACCESSORY', label:'อุปกรณ์เสริม' },
  { value:'PART',      label:'อะไหล่' },
]

interface AddForm {
  name:string; sku:string; type:string
  price:string; costPrice:string; stock:string
}

export default function StockPage() {
  const router = useRouter()
  const [tab,      setTab]      = useState<'products'|'parts'>('products')
  const [products, setProducts] = useState<Product[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState<AddForm>({ name:'', sku:'', type:'ACCESSORY', price:'', costPrice:'', stock:'0' })

  function loadProducts() {
    setLoading(true)
    const ep = tab==='products' ? '/products?limit=100' : '/parts?limit=100'
    api.get(ep).then(r=>{
      const list = r.data?.data ?? r.data ?? []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(()=>setProducts([])).finally(()=>setLoading(false))
  }

  useEffect(() => { loadProducts() }, [tab])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku??'').toLowerCase().includes(search.toLowerCase())
  )
  const lowCount = filtered.filter(p=>p.stockQuantity<=5).length

  function openAdd() {
    setForm({ name:'', sku:'', type: tab==='parts' ? 'PART' : 'ACCESSORY', price:'', costPrice:'', stock:'0' })
    setShowAdd(true)
  }

  async function saveProduct() {
    if (!form.name.trim()) { toast.error('กรุณากรอกชื่อสินค้า'); return }
    if (!form.sku.trim())  { toast.error('กรุณากรอก SKU'); return }
    const price     = parseFloat(form.price)     || 0
    const costPrice = parseFloat(form.costPrice) || 0
    const stock     = parseInt(form.stock)       || 0
    if (price <= 0) { toast.error('กรุณากรอกราคาขาย'); return }
    setSaving(true)
    try {
      await api.post('/products', {
        name:      form.name.trim(),
        sku:       form.sku.trim(),
        type:      form.type,
        price,
        costPrice,
        stock,
      })
      toast.success('เพิ่มสินค้าสำเร็จ')
      setShowAdd(false)
      loadProducts()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'เพิ่มสินค้าไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-28">
        <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={()=>router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
              <ChevronLeft className="h-5 w-5 text-slate-600"/>
            </button>
            <h1 className="flex-1 text-lg font-bold text-brand-black">สต็อกสินค้า</h1>
            <button onClick={openAdd} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-yellow">
              <Plus className="h-4 w-4 text-brand-black"/>
            </button>
          </div>
          <div className="flex gap-2 mb-4">
            {(['products','parts'] as const).map(t => (
              <button key={t} onClick={()=>setTab(t)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  tab===t ? 'bg-brand-yellow text-brand-black' : 'bg-[#F8F9FB] text-slate-500'
                }`}>
                {t==='products'?'สินค้า':'อะไหล่'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="h-11 w-full rounded-xl bg-[#F8F9FB] pl-10 pr-4 text-sm outline-none"
            />
          </div>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {lowCount > 0 && (
            <div className="flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500"/>
              <p className="text-sm font-medium text-red-600">สินค้า {lowCount} รายการ ใกล้หมด</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-yellow"/></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Package className="h-10 w-10 text-slate-200"/>
              <p className="text-sm text-slate-400">ไม่พบสินค้า</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="flex items-center border-b border-slate-100 bg-[#F8F9FB] px-4 py-2.5">
                <p className="flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">รายการสินค้า</p>
                <p className="w-20 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">ราคาขาย</p>
                <p className="w-16 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">คงคลัง</p>
              </div>
              {filtered.map((p,i) => (
                <div key={p.id} className={`flex items-center px-4 py-3 ${i>0?'border-t border-slate-50':''}`}>
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]">
                      <Package className="h-4 w-4 text-slate-400" strokeWidth={1.5}/>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-black truncate">{p.name}</p>
                      {p.sku && <p className="text-[10px] text-slate-400">{p.sku}</p>}
                    </div>
                  </div>
                  <p className="w-20 text-right text-sm font-semibold text-slate-700">฿{(p.salePrice ?? 0).toLocaleString()}</p>
                  <p className={`w-16 text-right text-sm font-bold ${p.stockQuantity<=5?'text-red-500':'text-brand-success'}`}>
                    {p.stockQuantity}
                  </p>
                </div>
              ))}
            </div>
          )}

          <button onClick={openAdd}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-4 text-sm font-semibold text-slate-400">
            <Plus className="h-4 w-4"/> เพิ่มสินค้า
          </button>
        </div>
      </div>

      {/* Add product modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
          <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 pb-10">
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-brand-black">เพิ่มสินค้าใหม่</p>
              <button onClick={()=>setShowAdd(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F9FB]">
                <X className="h-4 w-4 text-slate-500"/>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input
                  value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  placeholder="ชื่อสินค้า"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">SKU <span className="text-red-500">*</span></label>
                <input
                  value={form.sku} onChange={e=>setForm(f=>({...f,sku:e.target.value}))}
                  placeholder="SKU-001"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">ประเภทสินค้า</label>
                <select
                  value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                >
                  {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">ราคาขาย <span className="text-red-500">*</span></label>
                  <input
                    value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}
                    placeholder="0"
                    type="number"
                    min="0"
                    className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">ราคาทุน</label>
                  <input
                    value={form.costPrice} onChange={e=>setForm(f=>({...f,costPrice:e.target.value}))}
                    placeholder="0"
                    type="number"
                    min="0"
                    className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">จำนวนเริ่มต้น</label>
                <input
                  value={form.stock} onChange={e=>setForm(f=>({...f,stock:e.target.value}))}
                  placeholder="0"
                  type="number"
                  min="0"
                  className="h-11 w-full rounded-xl bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <button onClick={saveProduct} disabled={saving}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
