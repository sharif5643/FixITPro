'use client'

import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Printer, FileText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SerialPrintButton } from '@/components/printer/serial-print-button'
import { isInWebViewApp, bridgePrintRepairIntake } from '@/lib/webview-bridge'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'
import type { Repair, ShopSettings } from '@/types'

interface RepairPrintDialogProps {
  repairId: string | null
  onClose: () => void
}

export function RepairPrintDialog({ repairId, onClose }: RepairPrintDialogProps) {
  const isOpen = !!repairId

  const { data: repair } = useQuery<Repair>({
    queryKey: ['repairs', repairId],
    queryFn: async () => (await api.get(`/repairs/${repairId}`)).data,
    enabled: isOpen,
    staleTime: 300_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
    enabled: isOpen,
  })

  const btnClass = 'flex flex-col items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 px-3 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors'

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-600" />
            พิมพ์ใบรับงานซ่อม
          </DialogTitle>
        </DialogHeader>

        {isInWebViewApp() && !repair ? (
          <p className="text-sm text-muted-foreground text-center py-4">กำลังโหลด...</p>
        ) : isInWebViewApp() && repair ? (
          <button
            type="button"
            onClick={() => {
              bridgePrintRepairIntake({
                shopName:        settings?.shopName   ?? 'FixITPro',
                shopPhone:       settings?.shopPhone  ?? undefined,
                ticketNumber:    repair.ticketNumber,
                date:            format(new Date(repair.receivedAt), 'dd MMM yyyy HH:mm', { locale: th }),
                customerName:    repair.customer?.name ?? '—',
                customerPhone:   repair.customer?.phone ?? undefined,
                deviceBrand:     repair.deviceBrand,
                deviceModel:     repair.deviceModel,
                deviceColor:     repair.deviceColor ?? undefined,
                deviceImei:      repair.deviceImei  ?? undefined,
                issue:           repair.issue,
                conditionIssues: repair.deviceConditions ?? [],
                accessories:     repair.accessories ? repair.accessories.split(',').map((s) => s.trim()).filter(Boolean) : [],
                deposit:         Number(repair.deposit),
                estimateCost:    repair.estimateCost ? Number(repair.estimateCost) : undefined,
                dueDate:         repair.dueDate ? format(new Date(repair.dueDate), 'dd MMM yyyy', { locale: th }) : undefined,
                technicianName:  repair.technician?.name ?? undefined,
                footer:          settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
              })
              onClose()
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Printer className="h-5 w-5" />
            พิมพ์ผ่าน Bluetooth
          </button>
        ) : Platform.isNative() ? (
          <p className="text-sm text-muted-foreground text-center py-4">ไม่รองรับการพิมพ์บนแอป</p>
        ) : repairId ? (
          <div className="space-y-3">
            <button type="button"
              onClick={() => window.open(`/print/repair/${repairId}?paper=58mm&copies=2`, '_blank')}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
              <Printer className="h-5 w-5" />
              พิมพ์ 2 ฉบับ (ร้าน + ลูกค้า) ✂
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => window.open(`/print/repair/${repairId}?paper=58mm&copy=shop`, '_blank')} className={btnClass}>
                <Printer className="h-5 w-5" />58mm<br />(ใบร้าน)
              </button>
              <button type="button" onClick={() => window.open(`/print/repair/${repairId}?paper=80mm&copy=shop`, '_blank')} className={btnClass}>
                <Printer className="h-5 w-5" />80mm<br />(ใบร้าน)
              </button>
              <button type="button" onClick={() => window.open(`/print/repair/${repairId}?paper=58mm`, '_blank')} className={btnClass}>
                <Printer className="h-5 w-5" />58mm<br />(ใบลูกค้า)
              </button>
              <button type="button" onClick={() => window.open(`/print/repair/${repairId}?paper=80mm`, '_blank')} className={btnClass}>
                <Printer className="h-5 w-5" />80mm<br />(ใบลูกค้า)
              </button>
            </div>
            <button type="button"
              onClick={() => window.open(`/print/repair/${repairId}?paper=A4`, '_blank')}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 px-3 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors">
              <FileText className="h-5 w-5" />A4 (เอกสาร)
            </button>
            {repair && (
              <div className="flex items-center justify-center pt-1">
                <SerialPrintButton
                  mode="repair"
                  opts={{
                    shopName:        settings?.shopName   ?? 'FixITPro',
                    shopPhone:       settings?.shopPhone  ?? undefined,
                    ticketNumber:    repair.ticketNumber,
                    date:            format(new Date(repair.receivedAt), 'dd MMM yyyy HH:mm', { locale: th }),
                    customerName:    repair.customer?.name ?? '—',
                    customerPhone:   repair.customer?.phone ?? undefined,
                    deviceBrand:     repair.deviceBrand,
                    deviceModel:     repair.deviceModel,
                    deviceColor:     repair.deviceColor ?? undefined,
                    deviceImei:      repair.deviceImei  ?? undefined,
                    issue:           repair.issue,
                    conditionIssues: repair.deviceConditions ?? [],
                    accessories:     repair.accessories ? repair.accessories.split(',').map((s) => s.trim()).filter(Boolean) : [],
                    deposit:         Number(repair.deposit),
                    estimateCost:    repair.estimateCost ? Number(repair.estimateCost) : undefined,
                    dueDate:         repair.dueDate ? format(new Date(repair.dueDate), 'dd MMM yyyy', { locale: th }) : undefined,
                    technicianName:  repair.technician?.name ?? undefined,
                    footer:          settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
                  }}
                />
              </div>
            )}
          </div>
        ) : null}

        <Button variant="outline" onClick={onClose} className="w-full">ปิด</Button>
      </DialogContent>
    </Dialog>
  )
}
