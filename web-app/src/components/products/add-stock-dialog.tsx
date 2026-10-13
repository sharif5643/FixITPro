'use client'

import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PackagePlus, Loader2, Search, AlertCircle, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { averageCost } from '@/lib/below-cost'
import type { Product } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pre-filled product. When null the dialog shows a product search picker. */
  product: Product | null
  /** All active products — used as picker placeholder while loading. */
  allProducts?: Product[]
  /** Pre-filled branch (OWNER when viewing a specific branch). */
  branchId?: string
  branchName?: string
}

export function AddStockDialog({
  open, onOpenChange, product: propProduct,
  allProducts = [], branchId: propBranchId, branchName: propBranchName,
}: Props) {
  const qc = useQueryClient()

  // Authoritative branch context — staff/SUNMI always use JWT branchId
  const { branchId: contextBranchId, branchName: contextBranchName, isOwner, isBranchLocked, isGlobalMode } = useBranchContext()
  const user = useAuthStore((s) => s.user)

  const [pickedProduct, setPickedProduct] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [qty, setQty]   = useState('')
  const [note, setNote] = useState('')
  const [unitCost, setUnitCost] = useState('')
  // Sold by IMEI: one IMEI per line, the count is the number of IMEIs
  const [imeiText, setImeiText] = useState('')
  // 'add' = receive N more; 'count' = set the branch quantity to what was physically counted;
  // 'out' = IMEI products only: take out the units picked by IMEI (they cannot be set to a count)
  const [mode, setMode] = useState<'add' | 'count' | 'out'>('add')
  const [picked, setPicked] = useState<string[]>([])
  const [noImei, setNoImei] = useState(0)

  const reset = () => {
    setPickedProduct(null)
    setProductSearch('')
    setSelectedBranchId('')
    setQty('')
    setNote('')
    setUnitCost('')
    setImeiText('')
    setPicked([])
    setNoImei(0)
    setMode('add')
  }

  // Active product being added — propProduct takes precedence
  const activeProduct = propProduct ?? pickedProduct
  const bySerial = !!activeProduct?.hasSerial
  const serialList = imeiText.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
  useEffect(() => {
    if (bySerial && mode === 'count') setMode('add')
    if (!bySerial && mode === 'out') setMode('add')
  }, [bySerial, mode])
  const { data: inStock, isFetching: loadingSerials } = useQuery<{ total: number; items: { id: string; serial: string }[] }>({
    queryKey: ['serials', activeProduct?.id, 'IN_STOCK'],
    queryFn:  async () => (await api.get('/serials', { params: { productId: activeProduct!.id, status: 'IN_STOCK', limit: 200 } })).data,
    enabled:  open && bySerial && mode === 'out',
    staleTime: 0,
  })
  // Older data: units counted in stock with no IMEI recorded may go out without one
  const unitsNoImei = Math.max(0, Number(activeProduct?.stock ?? 0) - (inStock?.total ?? 0))

  // Branches for OWNER selector (only needed when OWNER has no pre-filled branch)
  const { data: branches = [] } = useQuery<{ id: string; name: string; isActive: boolean; status: string }[]>({
    queryKey: ['branches-simple'],
    queryFn:  () => api.get('/branches').then((r) => r.data),
    enabled:  isOwner && open && !propBranchId,
    staleTime: 5 * 60_000,
  })
  const activeBranches = branches.filter((b) => b.isActive && b.status === 'ACTIVE')

  // Effective branch:
  //   staff/SUNMI → always JWT branchId from context (isBranchLocked = true)
  //   OWNER       → propBranchId (from selected branch in parent) or dialog-local selection
  const effectiveBranchId = isBranchLocked
    ? contextBranchId
    : (propBranchId ?? (selectedBranchId || undefined))

  const effectiveBranchName = isBranchLocked
    ? (contextBranchName || 'สาขาปัจจุบัน')
    : (propBranchId
        ? (propBranchName ?? propBranchId)
        : (branches.find((b) => b.id === selectedBranchId)?.name ?? ''))

  // Fetch ALL products for the picker (not branch-filtered) so staff can add
  // stock to a product not yet assigned to their branch
  const { data: allProductsForPicker = allProducts } = useQuery<Product[]>({
    queryKey: ['products', 'stock-picker-all'],
    queryFn:  () => api.get('/products').then((r) => r.data),
    enabled:  open && !propProduct,
    staleTime: 60_000,
  })

  // Product picker filtering
  const filteredProducts = useMemo(() => {
    const list = propProduct ? [] : allProductsForPicker
    if (!productSearch.trim()) return list.slice(0, 50)
    const q = productSearch.toLowerCase()
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode?.toLowerCase().includes(q) ?? false),
    ).slice(0, 50)
  }, [allProductsForPicker, propProduct, productSearch])

  // Current quantity of this product in the selected branch (authoritative BranchStock)
  const { data: availability, isFetching: loadingCurrent } = useQuery<{ branches: { branchId: string; quantity: number }[] }>({
    queryKey: ['products', activeProduct?.id, 'availability'],
    queryFn:  () => api.get(`/products/${activeProduct!.id}/availability`).then((r) => r.data),
    enabled:  open && mode === 'count' && !!activeProduct,
    staleTime: 0,
  })
  const currentQty = availability?.branches.find((b) => b.branchId === effectiveBranchId)?.quantity ?? 0

  const mutation = useMutation({
    mutationFn: (): Promise<unknown> => {
      if (mode === 'count') {
        const counted = Number(qty)
        return api.post('/stock/adjust', {
          productId: activeProduct!.id,
          type:      'ADJUST',
          quantity:  counted - currentQty,
          branchId:  effectiveBranchId,
          note:      note.trim() || `ตั้งยอดตามนับจริง (ระบบ ${currentQty} → นับได้ ${counted})`,
        })
      }
      if (mode === 'out') {
        return api.post('/stock/adjust', {
          productId: activeProduct!.id,
          type:      'OUT',
          quantity:  picked.length + noImei,
          serialIds: picked,
          branchId:  effectiveBranchId,
          note:      note.trim() || undefined,
        })
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[AddStockDialog][submit]', {
          productId:        activeProduct!.id,
          effectiveBranchId,
          contextBranchId,
          propBranchId,
          userRole:         user?.role ?? null,
          userBranchId:     user?.branchId ?? null,
          branchName:       effectiveBranchName,
        })
      }
      return api.post('/stock/adjust', {
        productId: activeProduct!.id,
        type:      'IN',
        quantity:  bySerial ? serialList.length : Number(qty),
        ...(bySerial ? { serials: serialList } : {}),
        branchId:  effectiveBranchId,
        note:      note.trim() || undefined,
        ...(Number(unitCost) > 0 ? { unitCost: Number(unitCost) } : {}),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['low-stock'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['serials'] }),
        qc.invalidateQueries({ queryKey: ['stock', 'serial-mismatch'] }),
      ])
      toast.success(mode === 'out'
        ? `ตัด "${activeProduct?.name}" ออก ${picked.length + noImei} เครื่องแล้ว`
        : mode === 'count'
        ? `ตั้งยอด "${activeProduct?.name}" ที่${effectiveBranchName || 'สาขา'} เป็น ${Number(qty)} ชิ้นแล้ว`
        : `เพิ่มสต็อก "${activeProduct?.name}" เข้า${effectiveBranchName || 'สาขา'} เรียบร้อย`)
      onOpenChange(false)
      reset()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const qtyNum  = mode === 'out' ? picked.length + noImei : bySerial ? serialList.length : Number(qty)
  // effectiveBranchId being falsy already blocks submit; no separate ownerGlobalModeBlocked needed.
  // The products page prevents OWNER from opening the dialog in global mode entirely.
  const countDelta = qtyNum - currentQty
  const isValid = mode === 'out'
    ? !!activeProduct && qtyNum > 0 && !!effectiveBranchId
    : mode === 'count'
    ? !!activeProduct && qty !== '' && qtyNum >= 0 && Number.isInteger(qtyNum) && !!effectiveBranchId
      && !loadingCurrent && countDelta !== 0
    : !!activeProduct && qtyNum > 0 && Number.isInteger(qtyNum) && !!effectiveBranchId
      && (bySerial ? new Set(serialList).size === serialList.length : !!qty)
  const noBranchWarning = isBranchLocked && !effectiveBranchId

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-green-600" />
            {mode === 'count' ? 'ตั้งยอดตามที่นับจริง' : mode === 'out' ? 'ตัดเครื่องออกจากสต็อก' : 'เพิ่มสต็อกเข้าสาขา'}{effectiveBranchName ? `: ${effectiveBranchName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Mode: receive more / set to counted quantity; IMEI products move with their IMEIs instead ── */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            {(bySerial
              ? [['add', 'รับเข้า (ใส่ IMEI)'], ['out', 'ตัดออก (เลือก IMEI)']] as const
              : [['add', 'รับเข้าเพิ่ม'], ['count', 'ตั้งยอดตามนับจริง']] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setQty('') }}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mode === m ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Product: pre-filled OR picker ── */}
          {propProduct ? (
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{propProduct.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{propProduct.sku}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                สต็อกปัจจุบัน:{' '}
                <span className="font-medium">
                  {propProduct.branchQuantity ?? propProduct.stock} ชิ้น
                </span>
              </p>
            </div>
          ) : (
            <div>
              <Label>สินค้า <span className="text-red-500">*</span></Label>
              {!pickedProduct ? (
                <div className="mt-1 space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="ค้นหาชื่อสินค้า, SKU..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-8 text-sm h-9"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg border bg-white">
                    {filteredProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">ไม่พบสินค้า</p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPickedProduct(p); setProductSearch('') }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0 transition-colors"
                        >
                          <p className="font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 rounded-lg border bg-green-50 border-green-200 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{pickedProduct.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{pickedProduct.sku}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickedProduct(null)}
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                  >
                    เปลี่ยน
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Branch: OWNER selects / staff read-only (JWT-locked) ── */}
          {isOwner && !isBranchLocked && !propBranchId ? (
            <div>
              <Label>
                สาขาที่รับสต็อก <span className="text-red-500">*</span>
              </Label>
              {activeBranches.length === 0 ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  ไม่พบสาขาที่ใช้งานได้
                </div>
              ) : (
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="เลือกสาขา..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">สาขาที่รับสต็อก</p>
              <p className="text-sm font-medium">{effectiveBranchName}</p>
            </div>
          )}

          {/* ── No-branch warning: staff with no branch assignment ── */}
          {noBranchWarning && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              ไม่พบสาขาปัจจุบัน กรุณาเข้าสู่ระบบใหม่
            </div>
          )}

          {/* ── Counted quantity ── */}
          {activeProduct && mode === 'count' && (
            <div className="space-y-1.5">
              <Label htmlFor="count-qty">จำนวนที่นับได้จริงในสาขานี้</Label>
              <Input
                id="count-qty"
                type="number"
                min="0"
                step="1"
                placeholder="เช่น 5"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus={!!propProduct}
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ClipboardCheck className="h-3.5 w-3.5" />
                ในระบบตอนนี้: {loadingCurrent ? '…' : `${currentQty} ชิ้น`}
                {qty !== '' && !loadingCurrent && (
                  countDelta === 0
                    ? <span className="font-semibold text-emerald-600"> · ตรงแล้ว</span>
                    : <span className={`font-semibold ${countDelta > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {' '}· ปรับ {countDelta > 0 ? '+' : ''}{countDelta} ชิ้น
                      </span>
                )}
              </p>
            </div>
          )}

          {/* ── IMEIs going out: pick which units ── */}
          {activeProduct && bySerial && mode === 'out' && (
            <div>
              <Label>เลือกเครื่องที่ตัดออก (เสีย / คืนร้านค้า / หาย)</Label>
              {loadingSerials && !inStock ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (inStock?.items ?? []).length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">ไม่มี IMEI ที่อยู่ในสต็อก</p>
              ) : (
                <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                  {(inStock?.items ?? []).map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-sm">
                      <input
                        type="checkbox"
                        checked={picked.includes(s.id)}
                        onChange={(e) => setPicked((v) => e.target.checked ? [...v, s.id] : v.filter((x) => x !== s.id))}
                      />
                      {s.serial}
                    </label>
                  ))}
                </div>
              )}
              {!loadingSerials && unitsNoImei > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  <span>มี {unitsNoImei} เครื่องที่ไม่มี IMEI ในระบบ — ตัดออก</span>
                  <Input
                    type="number" min="0" max={unitsNoImei} value={noImei}
                    onChange={(e) => setNoImei(Math.min(unitsNoImei, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                    className="h-7 w-16 text-right"
                  />
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">ตัดออก <span className="font-semibold text-foreground">{qtyNum}</span> เครื่อง</p>
            </div>
          )}

          {/* ── IMEIs: one per unit ── */}
          {activeProduct && bySerial && mode === 'add' && (
            <div>
              <Label htmlFor="add-imei">IMEI / Serial ของเครื่องที่รับเข้า (บรรทัดละ 1 เครื่อง)</Label>
              <textarea
                id="add-imei"
                rows={4}
                value={imeiText}
                onChange={(e) => setImeiText(e.target.value)}
                placeholder={'356789012345678\n356789012345679'}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                autoFocus={!!propProduct}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                รับเข้า <span className="font-semibold text-foreground">{serialList.length}</span> เครื่อง
                {new Set(serialList).size !== serialList.length && <span className="ml-1 font-semibold text-red-600">· มี IMEI ซ้ำ</span>}
              </p>
            </div>
          )}

          {/* ── Quantity ── */}
          {activeProduct && mode === 'add' && !bySerial && (
            <div>
              <Label htmlFor="add-qty">จำนวนที่รับเข้า</Label>
              <Input
                id="add-qty"
                type="number"
                min="1"
                step="1"
                placeholder="ระบุจำนวน..."
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1"
                autoFocus={!!propProduct}
              />
            </div>
          )}

          {/* ── Price paid: only for people who can see cost; averaged into the product's cost ── */}
          {activeProduct && mode === 'add' && activeProduct.costPrice != null && (
            <div>
              <Label htmlFor="add-unit-cost">
                ราคาที่ซื้อมา / ชิ้น{' '}
                <span className="text-muted-foreground font-normal text-xs">(ไม่บังคับ)</span>
              </Label>
              <Input
                id="add-unit-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder={`ทุนตอนนี้ ${Number(activeProduct.costPrice).toLocaleString('th-TH')} บาท`}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="mt-1"
              />
              {Number(unitCost) > 0 && qtyNum > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ทุนเฉลี่ยใหม่: <span className="font-semibold text-foreground">
                    {averageCost(Number(activeProduct.stock ?? 0), Number(activeProduct.costPrice), qtyNum, Number(unitCost)).toLocaleString('th-TH')} บาท
                  </span>{' '}
                  (เดิม {Number(activeProduct.costPrice).toLocaleString('th-TH')} บาท · มีของอยู่ {Number(activeProduct.stock ?? 0)} ชิ้น)
                </p>
              )}
            </div>
          )}

          {/* ── Note ── */}
          {activeProduct && (
            <div>
              <Label htmlFor="add-note">
                หมายเหตุ{' '}
                <span className="text-muted-foreground font-normal text-xs">(ไม่บังคับ)</span>
              </Label>
              <Input
                id="add-note"
                placeholder="เช่น รับสินค้าจากซัพพลายเออร์..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className={`gap-2 min-w-[100px] ${mode === 'out' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <PackagePlus className="h-4 w-4" />
                {mode === 'count' ? 'บันทึกยอด' : mode === 'out' ? 'ตัดออก' : 'เพิ่มสต็อก'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
