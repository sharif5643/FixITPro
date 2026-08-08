import { isInWebViewApp } from './webview-bridge'

export type PaperWidth = '58mm' | '80mm'
export type PrinterType = 'browser' | 'sunmi'

export interface PrintOptions {
  paperWidth?: PaperWidth
  printer?: PrinterType
}

// ─── Browser print (opens a popup print page) ─────────────────────────────

function openPrintPopup(url: string, paperWidth: PaperWidth) {
  if (isInWebViewApp()) {
    // WebView: load print page in same window (onOpenWindow in native handles it)
    window.open(url, '_blank')
    return null
  }
  const width = paperWidth === '58mm' ? 340 : 440
  const win = window.open(
    url,
    '_blank',
    `width=${width},height=750,scrollbars=yes,toolbar=no,menubar=no,location=no`,
  )
  if (!win) {
    alert('กรุณาอนุญาต Popup เพื่อใช้งานการพิมพ์')
  }
  return win
}

export function printSaleReceipt(saleId: string, opts: PrintOptions = {}) {
  const { paperWidth = '80mm' } = opts
  openPrintPopup(`/print/sale/${saleId}?paper=${paperWidth}`, paperWidth)
}

export function printRepairReceipt(repairId: string, opts: PrintOptions = {}) {
  const { paperWidth = '80mm' } = opts
  openPrintPopup(`/print/repair/${repairId}?paper=${paperWidth}`, paperWidth)
}

// ─── SUNMI printer abstraction (replaced by PrinterFlowSheet + sunmi-printer.ts) ──
// These stubs are intentionally dead — real SUNMI printing goes through the
// Capacitor plugin in @/lib/sunmi-printer.ts + PrinterFlowSheet component.
// Kept as type stubs so old call-sites produce a build error rather than silently no-op.

/** @deprecated Use PrinterFlowSheet + SunmiPrinter.printHtml() instead */
export const sunmiPrintService = {
  isConnected: false,
  connect:      (): never => { throw new Error('[SUNMI] Use PrinterFlowSheet instead of sunmiPrintService') },
  printText:    (): never => { throw new Error('[SUNMI] Use PrinterFlowSheet instead of sunmiPrintService') },
  printReceipt: (): never => { throw new Error('[SUNMI] Use PrinterFlowSheet instead of sunmiPrintService') },
  cutPaper:     (): never => { throw new Error('[SUNMI] Use PrinterFlowSheet instead of sunmiPrintService') },
}
