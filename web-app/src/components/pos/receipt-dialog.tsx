'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, Printer, Loader2, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import { Platform } from '@/lib/platform'
import { buildReceiptHtml, buildReceiptPreviewData } from '@/lib/printer'
import { SaleReceiptPreviewDialog } from '@/components/receipt/receipt-preview-dialog'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { Sale, ShopSettings } from '@/types'

const PAYMENT_LABEL: Record<string, string> = {
  CASH:     'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD:     'บัตรเครดิต',
}

interface ReceiptDialogProps {
  open: boolean
  sale: Sale | null
  onClose: () => void
}

export function ReceiptDialog({ open, sale, onClose }: ReceiptDialogProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [flowOpen,    setFlowOpen]    = useState(false)
  const [isPrinting,  setIsPrinting]  = useState(false)
  const user = useAuthStore((s) => s.user)

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  if (!sale) return null

  const saleDate = (() => {
    try {
      return format(new Date(sale.createdAt), 'dd MMM yyyy HH:mm', { locale: th })
    } catch {
      return sale.createdAt
    }
  })()

  // ── Build receipt options (shared between web preview and native PrinterFlowSheet) ──
  const receiptOpts = {
    shopName:      settings?.shopName    ?? 'FixITPro',
    shopAddress:   settings?.shopAddress ?? undefined,
    shopPhone:     settings?.shopPhone   ?? undefined,
    receiptNumber: sale.receiptNumber,
    date:          saleDate,
    cashierName:   user?.name ?? '—',
    items: sale.items.map((it) => ({
      name:  (it as any).product?.name ?? 'สินค้า',
      qty:   it.quantity,
      price: Number(it.price),
      total: Number(it.total),
    })),
    subtotal:      Number(sale.subtotal),
    discount:      Number(sale.discount),
    total:         Number(sale.total),
    paymentMethod: sale.paymentMethod,
    amountPaid:    Number(sale.amountPaid),
    change:        Number(sale.change),
    customerName:  sale.customer?.name,
    footer:        settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
    paymentQrUrl:  (settings as any)?.paymentQrUrl ?? undefined,
  }

  // ── Print handler ────────────────────────────────────────────────────────────

  const handlePrint = () => {
    if (Platform.isNative()) {
      // APK → open PrinterFlowSheet (thermal printer)
      setFlowOpen(true)
    } else {
      // Web → open print popup directly (one click → browser print dialog)
      const pw: string = (settings as any)?.paperWidth ?? '80mm'
      const width = pw === '58mm' ? 340 : 440
      const win = window.open(
        `/print/sale/${sale.id}?paper=${pw}&autoprint=1`,
        '_blank',
        `width=${width},height=750,scrollbars=yes,toolbar=no,menubar=no,location=no`,
      )
      if (!win) {
        alert('กรุณาอนุญาต Popup เพื่อใช้งานการพิมพ์')
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-sm">
          {/* Success header */}
          <div className="flex flex-col items-center gap-1.5 pt-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="h-10 w-10 text-green-500 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">ชำระเงินสำเร็จ!</h2>
            <p className="text-sm text-muted-foreground">ขอบคุณที่ใช้บริการ</p>
          </div>

          {/* Receipt preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-4 font-mono text-sm space-y-3">
            {/* Shop header */}
            <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 dark:border-slate-600 pb-3">
              <p className="font-bold text-base tracking-wide">{settings?.shopName ?? 'FixITPro'}</p>
              <p className="text-xs text-muted-foreground">{saleDate}</p>
              <p className="text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 inline-block mt-1">
                {sale.receiptNumber}
              </p>
            </div>

            {/* Items */}
            <div className="space-y-1.5">
              {sale.items.map((item) => {
                const name    = (item as any).product?.name ?? 'สินค้า'
                const serials = item.serialNumbers ?? []
                return (
                  <div key={item.id}>
                    <div className="flex gap-1 text-xs">
                      <span className="flex-1 truncate">{name}</span>
                      <span className="text-muted-foreground shrink-0">×{item.quantity}</span>
                      <span className="shrink-0 tabular-nums w-20 text-right">
                        {formatThaiMoney(Number(item.total))}
                      </span>
                    </div>
                    {serials.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5 pl-1">
                        {serials.map((s) => (
                          <span
                            key={s.id}
                            className="font-mono text-[9px] text-muted-foreground bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded"
                          >
                            {s.serial}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-slate-300 dark:border-slate-600 pt-2.5 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>ยอดรวม</span>
                <span className="tabular-nums">{formatThaiMoney(Number(sale.subtotal))}</span>
              </div>
              {Number(sale.discount) > 0 && (
                <div className="flex justify-between text-xs text-red-600 dark:text-red-400">
                  <span>ส่วนลด</span>
                  <span className="tabular-nums">- {formatThaiMoney(Number(sale.discount))}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-dashed border-slate-300 dark:border-slate-600 pt-2">
                <span>ยอดสุทธิ</span>
                <span className="tabular-nums">{formatThaiMoney(Number(sale.total))}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</span>
                <span className="tabular-nums">{formatThaiMoney(Number(sale.amountPaid))}</span>
              </div>
              {Number(sale.change) > 0 && (
                <div className="flex justify-between text-xs font-medium text-green-700 dark:text-green-400">
                  <span>เงินทอน</span>
                  <span className="tabular-nums">{formatThaiMoney(Number(sale.change))}</span>
                </div>
              )}
            </div>

            {/* Customer info */}
            {sale.customer && (
              <div className="border-t border-dashed pt-2 text-xs text-muted-foreground space-y-0.5">
                <p>ลูกค้า: {sale.customer.name}</p>
                {sale.customer.phone && <p>โทร: {sale.customer.phone}</p>}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1.5">
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={handlePrint}
                disabled={isPrinting}
              >
                {isPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                พิมพ์ใบเสร็จ
              </Button>
              {/* Web only: preview option */}
              {!Platform.isNative() && (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  ดูตัวอย่างก่อนพิมพ์
                </button>
              )}
            </div>
            <Button onClick={onClose} className="flex-1 font-semibold">
              ขายต่อ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Web: full preview dialog (paper size + preview before printing) */}
      <SaleReceiptPreviewDialog
        open={previewOpen}
        saleId={sale.id}
        initialData={sale}
        onClose={() => setPreviewOpen(false)}
      />

      {/* Native APK: thermal printer flow */}
      {flowOpen && (
        <PrinterFlowSheet
          receiptHtml={buildReceiptHtml(receiptOpts)}
          jobName={`ใบเสร็จ #${sale.receiptNumber}`}
          previewData={buildReceiptPreviewData(receiptOpts)}
          autoPrint
          onClose={() => setFlowOpen(false)}
        />
      )}
    </>
  )
}
