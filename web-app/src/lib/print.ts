export type PaperWidth = '58mm' | '80mm'
export type PrinterType = 'browser' | 'sunmi'

export interface PrintOptions {
  paperWidth?: PaperWidth
  printer?: PrinterType
}

// ─── Browser print (opens a popup print page) ─────────────────────────────

function openPrintPopup(url: string, paperWidth: PaperWidth) {
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
  const { paperWidth = '80mm', printer = 'browser' } = opts

  if (printer === 'sunmi') {
    sunmiPrintService.printReceipt({ type: 'sale', id: saleId, paperWidth })
    return
  }

  openPrintPopup(`/print/sale/${saleId}?paper=${paperWidth}`, paperWidth)
}

export function printRepairReceipt(repairId: string, opts: PrintOptions = {}) {
  const { paperWidth = '80mm', printer = 'browser' } = opts

  if (printer === 'sunmi') {
    sunmiPrintService.printReceipt({ type: 'repair', id: repairId, paperWidth })
    return
  }

  openPrintPopup(`/print/repair/${repairId}?paper=${paperWidth}`, paperWidth)
}

// ─── SUNMI printer abstraction ────────────────────────────────────────────
// Implement this section when SUNMI SDK / JS bridge is available.
// Each method logs a warning in the console until integrated.

export const sunmiPrintService = {
  /** Whether SUNMI printer is connected and ready */
  isConnected: false,

  /** Connect to the SUNMI printer SDK */
  connect: async (): Promise<boolean> => {
    console.warn('[SUNMI] connect() not yet implemented — stub only')
    return false
  },

  /** Print a raw text string */
  printText: (_text: string): void => {
    console.warn('[SUNMI] printText() not yet implemented')
  },

  /** Print a structured receipt. Replace body with SUNMI SDK calls. */
  printReceipt: (_data: {
    type: 'sale' | 'repair'
    id: string
    paperWidth?: PaperWidth
  }): void => {
    console.warn('[SUNMI] printReceipt() not yet implemented', _data)
  },

  /** Send paper cut command */
  cutPaper: (): void => {
    console.warn('[SUNMI] cutPaper() not yet implemented')
  },
}
