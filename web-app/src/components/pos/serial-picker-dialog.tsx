'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Product, SerialNumber } from '@/types'

interface SerialPickerDialogProps {
  open: boolean
  product: Product | null
  initialSelected?: string[]
  onConfirm: (serialIds: string[]) => void
  onClose: () => void
}

export function SerialPickerDialog({
  open,
  product,
  initialSelected = [],
  onConfirm,
  onClose,
}: SerialPickerDialogProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [search,   setSearch]   = useState('')

  const { data, isLoading } = useQuery<{ items: SerialNumber[] }>({
    queryKey: ['serials', 'available', product?.id ?? 'none'],
    queryFn: async () =>
      (await api.get('/serials', {
        params: { productId: product!.id, status: 'IN_STOCK', limit: 200 },
      })).data,
    enabled: open && !!product?.id,
    staleTime: 0,
  })

  const serials  = data?.items ?? []
  const filtered = search
    ? serials.filter((s) => s.serial.toLowerCase().includes(search.toLowerCase()))
    : serials

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function handleConfirm() {
    if (selected.length === 0) return
    onConfirm(selected)
    setSelected([])
    setSearch('')
  }

  function handleClose() {
    setSelected([])
    setSearch('')
    onClose()
  }

  if (!product) return null

  const available = product.branchQuantity ?? 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            เลือก Serial / IMEI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product info */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3">
            <div>
              <p className="font-semibold text-sm text-slate-900 dark:text-white">{product.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
            </div>
            <Badge variant={selected.length > 0 ? 'default' : 'outline'} className="shrink-0">
              {selected.length} / {available} เลือก
            </Badge>
          </div>

          {/* Warning: no serials available */}
          {!isLoading && serials.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">
                ไม่มี Serial ที่พร้อมขาย — กรุณาเพิ่ม Serial ก่อนขาย
              </p>
            </div>
          )}

          {/* Search */}
          <Input
            placeholder="ค้นหา IMEI / Serial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="h-10"
          />

          {/* Serial list */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto pr-1">
              {filtered.map((s) => {
                const isSelected = selected.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all',
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                    )}
                  >
                    {isSelected
                      ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                      : <Circle className="h-3 w-3 shrink-0" />}
                    {s.serial}
                  </button>
                )
              })}
              {filtered.length === 0 && search && (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-2 w-full text-center">
                  ไม่พบ Serial ที่ตรงกับ "{search}"
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0}
            onClick={handleConfirm}
            className="min-w-[120px]"
          >
            เพิ่มลงตะกร้า ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
