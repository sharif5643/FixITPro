'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SaleReceipt } from './sale-receipt'
import { RepairReceipt } from './repair-receipt'
import { printSaleReceipt, printRepairReceipt } from '@/lib/print'
import api from '@/lib/api'
import type { Sale, Repair, ShopSettings } from '@/types'
import type { PaperWidth as PrintPaperWidth } from '@/lib/print'

function useSettings() {
  return useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PW = '58mm' | '80mm'

const PaperButton = ({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) => (
  <button
    onClick={onClick}
    className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
    }`}
  >
    {label}
  </button>
)

// ─── Sale preview ─────────────────────────────────────────────────────────────

interface SalePreviewProps {
  open: boolean
  saleId: string
  onClose: () => void
  initialData?: Sale
}

export function SaleReceiptPreviewDialog({
  open,
  saleId,
  onClose,
  initialData,
}: SalePreviewProps) {
  const [paperWidth, setPaperWidth] = useState<PW>('80mm')

  const { data, isLoading } = useQuery<Sale>({
    queryKey: ['sales', saleId],
    queryFn: async () => (await api.get(`/sales/${saleId}`)).data,
    enabled: open && !!saleId && !initialData,
    initialData,
    staleTime: 300_000,
  })

  const { data: settings } = useSettings()

  const handlePrint = () => {
    printSaleReceipt(saleId, { paperWidth: paperWidth as PrintPaperWidth })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-600" />
            Preview ใบเสร็จ
          </DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">กระดาษ:</span>
            <PaperButton label="58mm" active={paperWidth === '58mm'} onClick={() => setPaperWidth('58mm')} />
            <PaperButton label="80mm" active={paperWidth === '80mm'} onClick={() => setPaperWidth('80mm')} />
          </div>
          <Button size="sm" onClick={handlePrint} className="gap-1.5 h-8">
            <Printer className="h-3.5 w-3.5" />
            พิมพ์
          </Button>
        </div>

        {/* Receipt preview */}
        <div className="rounded-xl border bg-gray-50 p-3 overflow-y-auto max-h-[60vh] flex justify-center">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">กำลังโหลด...</span>
            </div>
          ) : data ? (
            <SaleReceipt sale={data} paperWidth={paperWidth} settings={settings} />
          ) : (
            <p className="text-sm text-muted-foreground py-12">ไม่พบข้อมูลใบเสร็จ</p>
          )}
        </div>

        <Button variant="outline" onClick={onClose} className="w-full gap-1.5">
          <X className="h-3.5 w-3.5" />
          ปิด
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// ─── Repair preview ───────────────────────────────────────────────────────────

interface RepairPreviewProps {
  open: boolean
  repairId: string
  onClose: () => void
  initialData?: Repair
}

export function RepairReceiptPreviewDialog({
  open,
  repairId,
  onClose,
  initialData,
}: RepairPreviewProps) {
  const [paperWidth, setPaperWidth] = useState<PW>('80mm')

  const { data, isLoading } = useQuery<Repair>({
    queryKey: ['repairs', repairId],
    queryFn: async () => (await api.get(`/repairs/${repairId}`)).data,
    enabled: open && !!repairId && !initialData,
    initialData,
    staleTime: 300_000,
  })

  const { data: settings } = useSettings()

  const handlePrint = () => {
    printRepairReceipt(repairId, { paperWidth: paperWidth as PrintPaperWidth })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-600" />
            Preview ใบรับงานซ่อม
          </DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">กระดาษ:</span>
            <PaperButton label="58mm" active={paperWidth === '58mm'} onClick={() => setPaperWidth('58mm')} />
            <PaperButton label="80mm" active={paperWidth === '80mm'} onClick={() => setPaperWidth('80mm')} />
          </div>
          <Button size="sm" onClick={handlePrint} className="gap-1.5 h-8">
            <Printer className="h-3.5 w-3.5" />
            พิมพ์
          </Button>
        </div>

        {/* Receipt preview */}
        <div className="rounded-xl border bg-gray-50 p-3 overflow-y-auto max-h-[60vh] flex justify-center">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">กำลังโหลด...</span>
            </div>
          ) : data ? (
            <RepairReceipt repair={data} paperWidth={paperWidth} settings={settings} />
          ) : (
            <p className="text-sm text-muted-foreground py-12">ไม่พบข้อมูลงานซ่อม</p>
          )}
        </div>

        <Button variant="outline" onClick={onClose} className="w-full gap-1.5">
          <X className="h-3.5 w-3.5" />
          ปิด
        </Button>
      </DialogContent>
    </Dialog>
  )
}
